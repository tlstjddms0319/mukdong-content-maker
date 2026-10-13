import { z } from "zod";
import type { CarouselPlan } from "./carousel";
import { IMAGE_STYLE_DIRECTIONS, type ImageStyle } from "./style";
import type { CarouselTrack } from "./track";
import { comparedPair } from "@/features/copy/explain";
import { menuOf } from "@/features/store/menu";

// 그림 콘셉트(사장님 요청 2026-10-13): 지금은 늘 실사 음식 사진만 그려서 글과 그림이 따로 놀았다("홍어 vs 가오리"인데 접시 두 개).
// 구성안이 나오면 글 내용에 맞는 그림 콘셉트 후보(실사 + AI가 제안한 2개)를 보여 주고 사장님이 하나를 고른다(components/wizard/ConceptStep.tsx).
// 고른 콘셉트는 장마다 visualPrompt(장면)와 imageStyle(화풍)을 바꿔 넣는다. 콘셉트는 게시물 하나에 하나(장마다 제각각이면 어수선하다).
// 사장님 사진으로 만드는 게시물은 사진이 주인공이라 이 단계를 건너뛴다(generationStore.ts).
export type ConceptKindId="photo"|"character"|"scene"|"diagram"|"comic";
export type ConceptKind={id:ConceptKindId;label:string;style:ImageStyle;when:string;how:string};

export const CONCEPT_KINDS:readonly ConceptKind[]=[
  {id:"photo",label:"실사 사진",style:"photo",when:"음식 자체의 결·윤기·상차림이 핵심일 때(기본)",how:"실제 음식 사진처럼. 지금 구성안의 장면을 그대로 쓴다."},
  {id:"character",label:"캐릭터 대결·대화",style:"character",when:"두 대상을 견주거나, 오해를 깨거나, 음식에 성격을 줄 수 있을 때(예: 홍어 vs 가오리가 링 위에서 권투, 통째 홍어 마스코트가 손님 옆에서 한 점을 권하는 장면)",how:"음식(생선·재료)을 통째로 의인화한 마스코트 캐릭터. 캐릭터여도 어떤 음식인지 알아볼 수 있는 몸·색·질감(홍어: 마름모 몸, 뾰족한 주둥이, 연보라빛 분홍). 접시·그릇에 담긴 먹는 음식(회·찜·무침)은 얼굴 없이 실제처럼 먹음직스럽게. 대결이면 링·무대처럼 양쪽이 같은 크기로 마주 본다. 말풍선·글자는 없음."},
  {id:"scene",label:"상황 일러스트",style:"illustration",when:"계절·날씨·풍습·자리가 이야기의 핵심일 때(예: 비 오는 날 전 부치는 집 부엌, 찬바람 부는 포구의 과메기 덕장, 잔칫상)",how:"음식이 놓인 장면과 분위기를 그림으로. 사람은 뒷모습·손만. 음식은 장면 안에서도 또렷하게."},
  {id:"diagram",label:"단면·원리 그림",style:"illustration",when:"'왜'의 답이 눈에 안 보이는 원리(성분·구조·온도·발효)일 때(예: 홍어 살 속 연골 결 단면, 묵은지가 익으며 산이 생기는 과정)",how:"설명 그림. 단면·확대·화살표 없는 단계 그림처럼 원리를 눈으로 보이게. 글자·숫자·이름표는 없음(카드 글이 설명한다)."},
  {id:"comic",label:"만화 컷",style:"anime",when:"처음 먹는 장면·반전·순서처럼 한 장면씩 이어지는 이야기일 때(예: 첫 점에 코를 찡그렸다가 두 번째 점에 끄덕이는 사람)",how:"한 장에 한 컷. 장을 넘기면 이야기가 이어진다. 사람 얼굴은 만화 캐릭터로만, 실제 사람처럼 그리지 않음. 말풍선·글자는 없음."},
];
const KIND_IDS=CONCEPT_KINDS.map(kind=>kind.id) as [ConceptKindId,...ConceptKindId[]];
export const kindOf=(id:ConceptKindId):ConceptKind=>CONCEPT_KINDS.find(kind=>kind.id===id)!;

// 사장님에게 보여 주고 구성안에 적용하는 콘셉트 하나.
export const ConceptSchema=z.object({
  kind:z.enum(KIND_IDS),
  title:z.string().trim().min(1).max(20),       // 카드 이름(예: "홍어 vs 가오리 권투")
  summary:z.string().trim().min(1).max(80),     // 한 줄 설명
  reason:z.string().trim().max(80).default(""), // 왜 이 글에 맞는지 한 줄
  // 장마다: 그림으로 그릴지(drawn)와 그 장의 장면. drawn=false면 실사 사진이고 구성안의 원래 장면을 쓴다.
  slides:z.array(z.object({drawn:z.boolean(),visualPrompt:z.string().trim().max(600)})),
});
export type Concept=z.infer<typeof ConceptSchema>;
export type ConceptChoice={options:Concept[];recommended:number};

// 기본 선택지: 지금 구성안 그대로(실사).
export function photoConcept(plan:CarouselPlan):Concept {
  const pair=comparedPair(plan.slides[0]?.headline??"");
  return {kind:"photo",title:"실사 사진",summary:pair?`${pair.first}와 ${pair.second}를 나란히 놓은 실제 음식 사진`:"실제 음식 사진처럼, 지금 장면 그대로",reason:"음식의 결과 윤기를 가장 먹음직스럽게 보여 줘요.",
    slides:plan.slides.map(slide=>({drawn:false,visualPrompt:slide.visualPrompt}))};
}

// AI에게 받는 모양: {"recommended":0|1,"concepts":[2개]}. 엄격 JSON 스키마 제공자(Groq·Cloudflare) 때문에 선택 필드를 두지 않는다.
export const ConceptProposalSchema=z.object({
  recommended:z.number().int().min(0).max(1),
  concepts:z.array(z.object({
    kind:z.enum(KIND_IDS.filter(id=>id!=="photo") as [ConceptKindId,...ConceptKindId[]]),
    title:z.string(),summary:z.string(),reason:z.string(),
    slides:z.array(z.object({slide:z.number().int(),drawn:z.boolean(),visualPrompt:z.string()})),
  })).min(1).max(3),
});

export function buildConceptPrompt(plan:CarouselPlan,topic:string,track:CarouselTrack):string {
  const slides=plan.slides.map((slide,i)=>`${i+1}장(${i===0?"표지":i===plan.slides.length-1?"결론":"이유"}): ${slide.headline}${slide.points.length?` — ${slide.points.join(" / ")}`:""}`).join("\n");
  const kinds=CONCEPT_KINDS.filter(kind=>kind.id!=="photo").map(kind=>`- ${kind.id} (${kind.label}): 맞는 때 — ${kind.when}. 그리는 법 — ${kind.how}`).join("\n");
  const pair=comparedPair(plan.slides[0]?.headline??"")??comparedPair(topic);
  const menus=menuOf(`${topic} ${plan.slides.map(slide=>slide.headline).join(" ")}`).map(item=>item.short);
  const trackNote=track==="text"
    ?"이 게시물은 글 중심이라 그림은 표지 한 장뿐입니다. 표지(1장)만 drawn:true로 장면을 쓰고 나머지 장은 drawn:false에 visualPrompt는 빈 문자열로 두세요."
    :"모든 장이 그림입니다. 콘셉트 안에서 장마다 그림으로 그릴지(drawn:true) 실사 사진으로 둘지(drawn:false) 정하세요. 표지는 콘셉트가 드러나게, 결론 장은 실제 음식이 먹음직스럽게 보이는 실사(drawn:false)로 두는 편이 좋습니다. 맛이 핵심인 장도 실사로 두세요.";
  return `한국 음식점(묵동홍어마을) Instagram 카드뉴스의 그림 콘셉트를 제안합니다. 지금은 늘 실제 음식 사진만 그려서, 글이 비교·오해 깨기·풍습 이야기를 해도 그림은 접시만 보였습니다.
주제: "${topic}"
구성안(장마다 제목과 짧은 글):
${slides}
${pair?`이 게시물은 '${pair.first}'와 '${pair.second}'를 견줍니다. 두 대상이 같은 크기로 함께 보여야 합니다.`:""}${menus.length?`\n이 게시물의 가게 메뉴: ${menus.join(", ")}.`:""}

고를 수 있는 콘셉트 종류:
${kinds}

이 글에 가장 자연스럽게 어울리는 콘셉트 2개를 서로 다른 종류로 제안하고, 더 추천하는 쪽의 번호(0부터)를 recommended에 적으세요. 억지로 끼워 맞추지 말고, 글이 비교면 대결·대조, 풍습이면 상황, 보이지 않는 원리면 단면 그림처럼 글의 성격을 따르세요.
${trackNote}
각 콘셉트:
- title: 사장님이 한눈에 알아볼 이름(띄어쓰기 포함 14자 이내, 예: "홍어 vs 가오리 권투", "비 오는 날 부엌").
- summary: 어떤 그림인지 한 줄(40자 이내). reason: 왜 이 글에 맞는지 한 줄(40자 이내). 모두 해요체.
- slides: 구성안의 모든 장을 순서대로(slide는 1부터). drawn:true인 장의 visualPrompt는 그 장의 글이 말하는 내용을 이 콘셉트로 보여 주는 장면을 한국어로 구체적으로(무엇이 어디에 어떻게, 60~200자). drawn:false인 장은 visualPrompt를 빈 문자열로 두세요.
- 장면 규칙: 그림 안에 글자·숫자·말풍선·간판·이름표는 절대 없음("VS" 글자도 없음, 대결은 자세로). 음식 캐릭터는 어떤 음식인지 알아볼 수 있게 실제 모양·색을 지킴. 얼굴·표정은 통째 생선 마스코트나 만화 사람에게만 주고, 접시·그릇에 담긴 먹는 음식(회·찜·무침·탕)에는 얼굴·눈·팔다리를 절대 그리지 않음(먹는 음식이 찡그리면 맛없어 보인다). 냄새·향은 보라·초록 연기나 찡그린 표정·코 막는 동작으로 그리지 않고, 하얀 김 정도로만. 실제 사람 얼굴은 그리지 않음(만화 캐릭터 얼굴은 됨). 확인되지 않은 가게 사실·가격·원산지·건강 효능은 장면에도 넣지 않음. 같은 장면을 두 장에 되풀이하지 않음.
JSON으로만 답하세요: {"recommended":0,"concepts":[{"kind":"character","title":"...","summary":"...","reason":"...","slides":[{"slide":1,"drawn":true,"visualPrompt":"..."}]}]}`;
}

const MIN_SCENE=12;
// AI 답을 사장님에게 보여 줄 모양으로 정리한다. 장 수가 다르거나 그림 장의 장면이 비면 그 콘셉트는 버린다. 쓸 만한 것이 없으면 빈 배열.
export function readConceptProposal(raw:unknown,plan:CarouselPlan,track:CarouselTrack):{concepts:Concept[];recommended:number} {
  const parsed=ConceptProposalSchema.safeParse(raw);
  if(!parsed.success)return {concepts:[],recommended:0};
  const count=plan.slides.length;
  const concepts:Concept[]=[];
  const kept:number[]=[];
  parsed.data.concepts.forEach((concept,index)=>{
    const bySlide=new Map(concept.slides.map(item=>[item.slide,item]));
    const slides=plan.slides.map((slide,i)=>{
      const item=bySlide.get(i+1);
      // 글 중심은 표지만 그림이다. 사진 중심에서 drawn 장의 장면이 너무 짧으면 실사로 둔다.
      const drawn=Boolean(item?.drawn)&&(track!=="text"||i===0)&&(item?.visualPrompt.trim().length??0)>=MIN_SCENE;
      return {drawn,visualPrompt:drawn?item!.visualPrompt.trim().slice(0,600):slide.visualPrompt};
    });
    if(!slides.some(slide=>slide.drawn))return;
    // 이름은 한국어로("홍어 vs 가오리"처럼 짧은 vs는 두고, 영어 낱말이나 한글 없는 제목은 버린다).
    if(!/[가-힣]/.test(concept.title)||/[A-Za-z]{3,}/.test(concept.title))return;
    const result=ConceptSchema.safeParse({kind:concept.kind,title:concept.title.trim().slice(0,20),summary:concept.summary.trim().slice(0,80),reason:concept.reason.trim().slice(0,80),slides});
    if(!result.success||slides.length!==count)return;
    concepts.push(result.data);kept.push(index);
  });
  const recommended=Math.max(0,kept.indexOf(parsed.data.recommended));
  return {concepts,recommended};
}

// 고른 콘셉트를 구성안에 적용: 장마다 장면·화풍을 바꾸고, 공통 스타일(styleAnchor)에 화풍 한 줄을 더한다.
// 실사 콘셉트(또는 모든 장이 drawn:false)면 구성안을 그대로 돌려준다.
export function applyConcept(plan:CarouselPlan,concept:Concept):CarouselPlan {
  if(concept.kind==="photo"||!concept.slides.some(slide=>slide.drawn))return plan;
  const style=kindOf(concept.kind).style;
  const slides=plan.slides.map((slide,i)=>{
    const chosen=concept.slides[i];
    if(!chosen?.drawn)return {...slide,imageStyle:"photo" as const};
    return {...slide,imageStyle:style,visualPrompt:chosen.visualPrompt};
  });
  const anchor=IMAGE_STYLE_DIRECTIONS[style].anchor;
  const styleAnchor=plan.styleAnchor.includes(anchor)?plan.styleAnchor:`${plan.styleAnchor.replace(/,?\s*실제 음식 사진 질감/,"")}, 그림 장은 ${anchor}`.slice(0,500);
  return {...plan,styleAnchor,slides};
}
