import { z } from "zod";
import { CarouselPlanSchema, SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, rolesForCount } from "./carousel";
import { CardLayoutSchema, PaletteIdSchema } from "./design";
import { StyleIdSchema, normalizeStyleId } from "./styleCatalog";
import { ThemeIdSchema } from "./themes";
import { BodyFontIdSchema, SlideBodyFontSchema, SlideTitleFontSchema, TitleFontIdSchema } from "./typography";
import { TextAiHttpError } from "@/lib/ai/errors";

// AI가 쓴 구성안을 "버리지 않고 고쳐 쓰기".
// 예전에는 요점 한 줄이 40자를 1자만 넘어도, 장 순서 이름이 하나만 달라도 구성안 전체를 버리고 준비된 기본 문안으로 채웠다.
// 같은 AI에 두 번 물어도 같은 식으로 어기는 일이 많아, 사장님 화면에는 "AI가 구성안을 만들지 못했어요"가 자주 떴다.
// 여기서는 스키마 검사 직전에(z.preprocess) 고칠 수 있는 것만 고친다. 장 수가 모자라는 것처럼 고칠 수 없는 것은 그대로 두어 검사에서 떨어진다.
// 고친 내용은 fixes에 모아 서버 로그에 남긴다(어떤 규칙을 AI가 자주 어기는지 보고 프롬프트를 다듬기 위해).

const HEADLINE_MAX=42,SUBLINE_MAX=30,SCENE_MIN=12,SCENE_MAX=600,ANCHOR_MIN=12,ANCHOR_MAX=500,KEYWORD_MAX=12,FIGURE_MAX=16;

const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const valid=(schema:z.ZodType,value:unknown)=>schema.safeParse(value).success;
const text=(value:unknown)=>typeof value==="string"?value.replace(/\s+/g," ").trim():"";

// 글자 수를 넘는 문장을 낱말 경계에서 자른다. 쉼표·띄어쓰기 위치가 너무 앞(60% 미만)이면 그냥 글자 수에서 자른다.
// 끝에 남은 쉼표·가운뎃점은 떼어 문장이 매달려 보이지 않게 한다.
export function shorten(value:string,max:number):string {
  if(value.length<=max)return value;
  const head=value.slice(0,max);
  const cut=Math.max(head.lastIndexOf(" "),head.lastIndexOf(","));
  return (cut>=max*.6?head.slice(0,cut):head).replace(/[\s,·、]+$/,"");
}

// raw: AI가 돌려준 JSON(아직 검사 전). slideCount: 사장님이 요청한 장 수.
export function repairPlanJson(raw:unknown,slideCount:number,fixes:string[]=[]):unknown {
  if(!isRecord(raw)||!Array.isArray(raw.slides))return raw;
  const roles=rolesForCount(slideCount as Parameters<typeof rolesForCount>[0]);
  // 장이 모자라면 지어낼 수 없다(검사에서 떨어지게 둔다). 남으면 뒤를 버린다.
  if(raw.slides.length<roles.length)return raw;
  const plan:Record<string,unknown>={...raw};
  if(raw.slides.length>roles.length)fixes.push(`장 수 ${raw.slides.length}→${roles.length}`);
  if(plan.slideCount!==slideCount){fixes.push("slideCount");plan.slideCount=slideCount;}

  const anchor=text(plan.styleAnchor);
  plan.styleAnchor=anchor.length<ANCHOR_MIN?`${anchor} 따뜻한 조명의 한식 음식 사진`.trim():shorten(anchor,ANCHOR_MAX);
  if(plan.styleAnchor!==anchor)fixes.push("styleAnchor");

  // 디자인: 선택지 밖 값은 지운다(기본값이 채워진다). 색 조합은 기본값이 없어 따뜻한 종이로.
  const design:Record<string,unknown>=isRecord(plan.design)?{...plan.design}:{};
  if(!valid(PaletteIdSchema,design.palette)){if(design.palette!==undefined)fixes.push("design.palette");design.palette="warm";}
  design.style=normalizeStyleId(design.style);
  for(const [key,schema] of [["style",StyleIdSchema],["theme",ThemeIdSchema],["titleFont",TitleFontIdSchema],["bodyFont",BodyFontIdSchema],["tone",z.enum(["loud","calm"])]] as const){
    if(design[key]!==undefined&&!valid(schema,design[key])){fixes.push(`design.${key}`);delete design[key];}
  }
  plan.design=design;

  const scenes=new Set<string>();
  plan.slides=raw.slides.slice(0,roles.length).map((item,index)=>{
    const slide:Record<string,unknown>=isRecord(item)?{...item}:{};
    const note=(field:string)=>fixes.push(`${index+1}장 ${field}`);
    if(slide.role!==roles[index]){note("role");slide.role=roles[index];}

    const headline=text(slide.headline);
    slide.headline=shorten(headline,HEADLINE_MAX);
    if(slide.headline!==headline)note("headline");
    const subline=text(slide.subline);
    slide.subline=shorten(subline,SUBLINE_MAX);
    if(slide.subline!==subline)note("subline");

    // 요점: 빈 줄은 빼고, 긴 줄은 자르고, 너무 짧아진 조각(2자 미만)은 버린다. 최대 4줄.
    const points=Array.isArray(slide.points)?slide.points.map(text).filter(Boolean):[];
    const fixed=points.map(point=>shorten(point,SLIDE_POINT_MAX_LENGTH)).filter(point=>point.length>=2).slice(0,SLIDE_POINT_MAX_COUNT);
    if(fixed.length!==points.length||fixed.some((point,i)=>point!==points[i]))note("points");
    slide.points=fixed;

    // 장면: 짧으면 제목으로 채우고, 길면 자르고, 앞 장과 글자가 같으면 구도를 덧붙여 다른 장면으로 만든다.
    let scene=text(slide.visualPrompt);
    if(scene.length<SCENE_MIN){note("visualPrompt");scene=`${scene||String(slide.headline)} 장면을 담은 음식 사진`.trim();}
    scene=shorten(scene,SCENE_MAX);
    const key=()=>scene.replace(/[\s.,!?]/g,"").toLowerCase();
    if(scenes.has(key())){note("같은 장면");scene=shorten(`${scene} ${index+1}번째 장은 앞 장과 다른 거리와 각도로`,SCENE_MAX);}
    scenes.add(key());
    slide.visualPrompt=scene;

    if(slide.textPosition!=="top"&&slide.textPosition!=="bottom"){note("textPosition");slide.textPosition=index%2?"bottom":"top";}
    // 레이아웃이 선택지 밖이면 무난한 프레임으로. 표지·역할에 안 맞는 조합은 normalizeCarouselDesign이 다시 바로잡는다.
    if(!valid(CardLayoutSchema,slide.layout)){note("layout");slide.layout="frame";}
    const keywords=Array.isArray(slide.keywords)?slide.keywords.map(text).filter(Boolean):[];
    slide.keywords=keywords.map(word=>word.slice(0,KEYWORD_MAX)).slice(0,3);
    if(keywords.length>3||keywords.some(word=>word.length>KEYWORD_MAX))note("keywords");
    const figure=text(slide.figure);
    slide.figure=figure.length>FIGURE_MAX?"":figure; // 숫자를 자르면 다른 숫자가 되므로 아예 비운다.
    if(figure.length>FIGURE_MAX)note("figure");
    if(slide.titleFont!==undefined&&!valid(SlideTitleFontSchema,slide.titleFont))slide.titleFont="auto";
    if(slide.bodyFont!==undefined&&!valid(SlideBodyFontSchema,slide.bodyFont))slide.bodyFont="auto";
    if(slide.variant!==undefined)slide.variant=Number.isFinite(Number(slide.variant))?Math.min(3,Math.max(0,Math.round(Number(slide.variant)))):0;
    return slide;
  });
  return plan;
}

// AI에 보내는 스키마. JSON 스키마(엄격 모드)는 CarouselPlanSchema와 똑같이 나가고, 받은 답만 검사 전에 고친다.
export function lenientPlanSchema(slideCount:number,fixes:string[]=[]){
  return z.preprocess(raw=>repairPlanJson(raw,slideCount,fixes),CarouselPlanSchema.refine(plan=>plan.slideCount===slideCount,{message:"요청한 슬라이드 수와 다릅니다."}));
}

// 기본 문안으로 넘어간 이유. 화면에는 짧은 한국어로, 서버 로그에는 원문을 함께 남긴다.
export type PlanFallbackReason="no-ai"|"quota"|"key"|"busy"|"format"|"error";
export const PLAN_FALLBACK_MESSAGES:Record<PlanFallbackReason,string>={
  "no-ai":"문안 AI가 설정되어 있지 않아요(설정 → AI 키 확인).",
  quota:"문안 AI 오늘 사용량을 다 썼어요. 잠시 뒤나 내일 다시 해 보세요.",
  key:"문안 AI 키가 맞지 않아요(설정 → AI 키 확인).",
  busy:"문안 AI 서버가 잠시 바빠요. 조금 뒤 다시 해 보세요.",
  format:"AI가 보낸 구성안 형식이 맞지 않았어요. 다시 만들면 대개 됩니다.",
  error:"문안 AI 연결에 문제가 있었어요. 다시 해 보세요.",
};
export function planFallbackReason(error:unknown):PlanFallbackReason {
  if(error instanceof TextAiHttpError){
    if(error.status===429)return "quota";
    if(error.status===401||error.status===403)return "key";
    if(error.status>=500)return "busy";
    return "error";
  }
  if(error instanceof z.ZodError||error instanceof SyntaxError)return "format";
  if(error instanceof Error&&error.name==="TextAiUnavailableError")return "no-ai";
  return "error";
}
