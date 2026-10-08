import type { CarouselPlan, CarouselRole } from "./carousel";
import { LAYOUT_VARIANTS, PaletteIdSchema, defaultCardLayout, normalizeCardLayout, type CardLayout, type DesignSpec, type PaletteId } from "./design";
import { ThemeIdSchema } from "./themes";
import { suggestSeasonMotif } from "./seasonMotif";
import { CALM_WORDS, PICKABLE_STYLES, RESTRAINABLE_STYLES, styleAffinity, type StyleId } from "./styleCatalog";
import type { BodyFontId, TitleFontId } from "./typography";

// 캐러셀마다 템플릿이 달라 보이게 하는 장치.
// 텍스트 AI는 장 순서(표지 → 자세히 → 먹는 법 …)가 같으면 거의 같은 레이아웃을 고르고, AI가 실패하면 쓰는 기본 구성안은
// 역할별 레이아웃이 아예 고정이다. 그래서 구성안을 만들 때마다 서버가 무작위 시드(seed)로 "역할에 어울리는 후보" 안에서 섞는다.
// AI가 기본값과 다른 레이아웃을 일부러 고른 장은 내용에 맞춘 선택으로 보고 그대로 둔다.

// 역할마다 어울리는 레이아웃 후보. 첫 번째가 기본값(defaultCardLayout)과 같다.
const ROLE_LAYOUT_CHOICES:Record<CarouselRole,CardLayout[]>={
  cover:["fullscreen","frame","quote","magazine","split","poster","circle"],
  overview:["collage","illustration","frame","magazine","polaroid","receipt"],
  detail:["frame","illustration","fullscreen","collage","circle","split","magazine"],
  "how-to":["browser","step","illustration","timeline","checklist"],
  // 비교형(versus)은 글이 실제로 두 가지를 견줄 때만 맞으므로 후보에 넣지 않는다. AI가 내용을 보고 고를 때만 쓴다.
  pairing:["illustration","collage","frame","polaroid","split","circle"],
  process:["browser","step","frame","timeline","receipt"],
  occasion:["quote","fullscreen","collage","polaroid","split"],
  mood:["fullscreen","quote","frame","poster","circle","magazine"],
  visit:["collage","qa","frame","checklist","receipt","poster"],
  cta:["qa","quote","browser","poster","checklist"],
};

// 기본 구성안처럼 디자인이 비어 있을 때 쓰는 색·글꼴 묶음. accent는 표지·분위기 장의 제목 글꼴이다.
const FONT_SETS:Array<{titleFont:TitleFontId;bodyFont:BodyFontId;accent:TitleFontId}>=[
  {titleFont:"pretendard",bodyFont:"pretendard",accent:"batang"},
  {titleFont:"plex",bodyFont:"plex",accent:"batang"},
  {titleFont:"jua",bodyFont:"dodum",accent:"jua"},
  {titleFont:"batang",bodyFont:"batang",accent:"batang"},
  {titleFont:"blackhan",bodyFont:"plex",accent:"blackhan"},
];
// 공통 제목 글꼴에 짝지을 감성 장 글꼴. 같은 글꼴이면 장마다 바꾸지 않는다.
const ACCENT_TITLE:Record<TitleFontId,TitleFontId>={pretendard:"batang",plex:"batang",batang:"batang",jua:"jua",blackhan:"blackhan"};
const EMOTIONAL_ROLES=new Set<CarouselRole>(["cover","mood","occasion"]);

// 0 이상 2^31 미만의 정수 시드. 테스트에서는 고정값을 넘겨 결과를 재현한다.
export const randomSeed=()=>Math.floor(Math.random()*2**31);
const pick=<T,>(items:readonly T[],seed:number,offset=0)=>items[(seed+offset)%items.length];

// 기본 템플릿(template)과 갈래 전용 계열(사진 중심·글 중심)을 뺀 계열 중 글과 어울리는 것을 고른다. 피할 낱말이 더 많은(점수 음수) 계열은 빼고,
// 남은 계열 중 점수가 가장 높은 무리(1점 차이까지)에서 시드로 하나. 낱말 하나 차이로 늘 같은 계열만 나오지 않게 무리로 고른다.
export function pickFittingStyle(text:string,seed:number):StyleId {
  const scored=PICKABLE_STYLES.map(id=>({id,score:styleAffinity(id,text)})).filter(item=>item.score>=0);
  if(!scored.length)return pick(PICKABLE_STYLES,seed,7);
  const best=Math.max(...scored.map(item=>item.score));
  return pick(scored.filter(item=>item.score>=best-1).map(item=>item.id),seed,7);
}

export function diversifyCarouselDesign(plan:CarouselPlan,seed:number,options:{fallback?:boolean}={}):CarouselPlan {
  const fallback=options.fallback??false;
  // 기본 구성안은 색과 글꼴도 시드로 고른다. AI 구성안은 AI가 고른 색·글꼴을 그대로 둔다.
  const fontSet=pick(FONT_SETS,seed,3);
  // 게시물 테마는 AI가 기본값(classic)을 그대로 냈거나 기본 구성안이면 시드로 고른다. 게시물마다 옷이 바뀐다.
  const theme=fallback||plan.design.theme==="classic"?pick(ThemeIdSchema.options,seed,5):plan.design.theme;
  // 스타일 계열도 같은 규칙: AI가 기본(template)을 그대로 냈거나 기본 구성안이면 게시물마다 다른 계열을 고른다.
  // 계열 친화도 표(B11)로 글에 어울리지 않는 계열(avoid)을 빼고, 어울리는 낱말이 많은 계열들 안에서 시드로 고른다.
  const text=plan.slides.map(slide=>`${slide.headline} ${slide.points.join(" ")} ${slide.keywords.join(" ")}`).join(" ");
  const style=fallback||plan.design.style==="template"?pickFittingStyle(text,seed):plan.design.style;
  // 장식 세기: 격식 있는 글이면 calm. 장식이 많은 계열은 기본 구성안에서 세 게시물에 한 번꼴로 절제 변형을 섞는다.
  // AI가 calm을 골랐으면 그대로 둔다.
  const calmText=CALM_WORDS.some(word=>text.includes(word));
  const tone=plan.design.tone==="calm"||calmText||(fallback&&RESTRAINABLE_STYLES.has(style)&&Math.floor(seed/8)%3===0)?"calm":"loud";
  const design:DesignSpec=fallback
    // 계절 소품: 기본 구성안은 글의 낱말과 지금 시기의 행사로 고른다(애매하면 없음). AI 구성안은 AI가 고른 값을 쓴다.
    ?{palette:pick(PaletteIdSchema.options.filter((id:PaletteId)=>id!=="night"),seed,1),style,theme,titleFont:fontSet.titleFont,bodyFont:fontSet.bodyFont,tone,season:suggestSeasonMotif(text)}
    :{...plan.design,style,theme,tone};
  const accent=fallback?fontSet.accent:ACCENT_TITLE[design.titleFont];
  const everyFontAuto=plan.slides.every(slide=>slide.titleFont==="auto"&&slide.bodyFont==="auto");

  let previous:CardLayout|undefined;
  const used=new Set<CardLayout>();
  const slides=plan.slides.map((slide,index)=>{
    let layout=normalizeCardLayout(slide);
    // AI가 기본값을 그대로 냈거나(=고르지 않은 것과 같음) 앞 장과 겹치면, 역할 후보를 시드만큼 돌려 다시 고른다.
    // 이번 캐러셀에서 아직 안 쓴 레이아웃을 먼저 고르고, 다 썼으면 앞 장과만 겹치지 않게 한다.
    if(fallback||layout===defaultCardLayout(slide.role)||layout===previous){
      const choices=ROLE_LAYOUT_CHOICES[slide.role];
      const rotated=choices.map((_,step)=>normalizeCardLayout({...slide,layout:pick(choices,seed,index+step)}));
      layout=rotated.find(candidate=>candidate!==previous&&!used.has(candidate))??rotated.find(candidate=>candidate!==previous)??layout;
    }
    previous=layout;
    used.add(layout);
    // AI가 장마다 글꼴을 하나도 고르지 않았으면 감성 장(표지·분위기·모임)만 짝 글꼴로 바꿔 장마다 표정을 준다.
    const titleFont=everyFontAuto&&EMOTIONAL_ROLES.has(slide.role)&&accent!==design.titleFont?accent:slide.titleFont;
    // 같은 레이아웃도 장·게시물마다 모양 변형을 바꾼다(제목 위치, 사진 모양, 격자 배치 등).
    const variant=(seed+index*3)%LAYOUT_VARIANTS[layout];
    return {...slide,layout,titleFont,variant};
  });
  return {...plan,design,slides};
}
