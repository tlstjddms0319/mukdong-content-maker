import { z } from "zod";
import type { CarouselPlan, CarouselRole, CarouselSlidePlan } from "./carousel";
import { DEFAULT_DESIGN, type CardLayout, type DesignSpec, type PaletteId } from "./design";
import type { StyleId } from "./styleCatalog";
import { CLOSING_INVITE_TAIL, EXPLAIN_REASONS_RULE, NOTES_FIRST_RULE, NO_PROMO_IN_CARDS, PROMO_IN_CARD, STORY_ARC_RULE, closingInvite } from "@/features/copy/explain";
import { menuOf } from "@/features/store/menu";

// 갈래(계획서 SIMPLIFY_PLAN): 사장님은 "사진 중심 / 글 중심" 둘 중 하나만 고르고, 나머지는 갈래가 정한다.
//   - 장 수: 구성안 AI가 내용에 맞춰 4~9장 중에서 정한다(표지 + 이유 장 + 결론). 맨 뒤 가게 홍보 카드는 생성 흐름이 따로 붙여
//     인스타그램 한 게시물 10장 안에 들어간다. AI 없이 만드는 기본 문안은 5장이다.
//   - 디자인: 갈래 전용 계열(photo-focus·text-focus). 테마·계절 소품·글꼴은 기본값, 무작위 섞기(variety.ts)는 하지 않는다.
//   - 장마다 사진 수(layout): 사진 중심은 모든 장이 사진 1장(표지 fullscreen, 본문 frame),
//     글 중심은 표지만 사진 1장(fullscreen)이고 본문·마지막 장은 사진 없는 장(browser) → 이미지 AI를 표지 한 번만 부른다.
//     계열 디자인에서 layout은 "사진 몇 장"만 정하므로 frame·browser는 그 수를 뜻하는 이름일 뿐이다.
//   - 글 길이: 구성안 프롬프트로 먼저 요청하고, AI 답(과 검수·거르기 뒤)에 코드로 한 번 더 맞춘다(applyTrack).
// 갈래가 없으면(예전 초안·예전 화면) 이 파일은 아무것도 바꾸지 않는다.
export const CarouselTrackSchema=z.enum(["photo","text"]);
export type CarouselTrack=z.infer<typeof CarouselTrackSchema>;
// 장 수 고정 대신 범위(사장님 요청 2026-10-09: "모든 내용을 다 전달할 수 있는 장 수로, 만들 때마다 정하기").
export const TRACK_SLIDE_RANGE={min:4,max:9} as const;
// 구성안이 오기 전(진행 표시)과 AI 없이 만드는 기본 문안의 장 수.
export const TRACK_SLIDE_COUNT=5 as const;
export const TRACK_STYLES:Record<CarouselTrack,StyleId>={photo:"photo-focus",text:"text-focus"};
export const TRACK_LABELS:Record<CarouselTrack,string>={photo:"사진 중심",text:"글 중심"};

// 글 길이 상한(글자 수, 띄어쓰기 포함). 카드에서 제목 한 줄·짧은 글 한 줄로 읽히는 길이다.
//   표지: 제목 24자(두 줄까지), 부제 20자.  사진 중심 본문: 제목 18자 + 짧은 글 1개(24자).  글 중심 본문: 제목 14자 + 짧은 글 2개(각 18자).
//   글 중심은 제목 84px 이상·짧은 글 58px로 크게 그리므로, 제목이 한 줄·짧은 글이 각각 한 줄에 들어가는 길이로 줄였다(B 단계).
export const TRACK_COPY={
  cover:{headline:24,subline:20},
  photo:{headline:18,points:1,point:24},
  text:{headline:14,points:2,point:18},
} as const;

export function trackLayout(track:CarouselTrack,role:CarouselRole):CardLayout {
  if(role==="cover")return "fullscreen";
  return track==="photo"?"frame":"browser";
}
export const trackDesign=(track:CarouselTrack,palette:PaletteId=DEFAULT_DESIGN.palette):DesignSpec=>({...DEFAULT_DESIGN,palette,style:TRACK_STYLES[track]});

// 주제(표지 글)에 맞는 색 조합. 예전에는 갈래마다 한 벌(따뜻한 종이)로 고정이라 어느 주제든 같은 템플릿처럼 보였다(사장님 지적 2026-10-09).
// 레이아웃·글자 크기는 그대로 두고 색만 주제 분위기로 바꾼다(그리는 쪽은 styles/trackLooks.ts). 앞에 있는 규칙이 먼저다.
const TOPIC_PALETTES:ReadonlyArray<[RegExp,PaletteId]>=[
  [/비\s*(?:오|가|내)|빗|장마|바다|과메기|생선|해산물|회\b/,"sea"],
  [/막걸리|술|송년|연말|신년|밤|저녁|모임|퇴근/,"night"],
  [/미나리|봄|무침|새콤|산뜻|채소|나물|입맛/,"herb"],
  [/묵은지|발효|삭힌|삭히|삭혀|암모니아|톡\s*쏘/,"plum"],
  [/애탕|탕|국물|찜|김장|수육|숙성|전통|잔치|명절|찬\s*바람|추운|겨울/,"clay"],
];
export function paletteForTopic(text:string):PaletteId {
  return TOPIC_PALETTES.find(([pattern])=>pattern.test(text))?.[1]??"warm";
}

// ── 글 길이 맞추기 ─────────────────────────────────────────────────────────────────────
// 한국어 카드 문장은 끝(서술어 "~요")이 있어야 읽힌다. 앞부분만 남기면 "처음이라면 덜 삭힌 쪽부터 작게"처럼 말이 끊기므로
// 낱말 단위로만, 다음 순서로 줄인다(낱말 가운데는 자르지 않는다).
//   1) 쉼표·가운뎃점 앞 첫 마디가 상한 안이고 너무 짧지 않으면(상한의 40% 이상) 그 마디("비 오는 날엔 홍어 한 점, 막걸리 한 잔" → 앞 마디).
//   2) 빼도 뜻이 남는 꾸밈말(작게·살짝·먼저·처음이라면 …)을 하나씩 뺀다("처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요" → "덜 삭힌 쪽부터 한 점 집어 보세요").
//   3) 앞 낱말부터 덜어 내 서술어가 남는 뒷부분(두 낱말 이상, 상한의 절반 이상). 마디 끝(~면·~고·~서·~려·쉼표) 뒤에서
//      시작하는 온전한 문장을 먼저, 같으면 가장 긴 것("홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요" → "빛에 비추면 결이 또렷하게 보여요").
//      단, 꾸밈말·한 글자 부사·관형형 바로 뒤("한 잔과" → "잔과 …", "톡 쏘는" → "쏘는 …", "덜 삭힌 홍어" → "홍어 …"),
//      보조 동사("알려 주는" → "주는 …"), 의존 명사("오시기 전에" → "전에 …")에서는 시작하지 않는다.
//   4) 낱말 경계의 앞부분. 5) 한 낱말이 상한보다 길 때만 글자 수에서.
const tidy=(value:string)=>value.replace(/\s+/g," ").trim();
const trimEnd=(value:string)=>value.replace(/[\s,，·、…]+$/,"");
const FILLERS=new Set(["처음이라면","처음엔","처음에는","작게","살짝","천천히","먼저","조금","조금씩","한번","꼭","정말","아주","바로","그냥","다시","훨씬","가장","제일","특히","보통"]);
// 다음 낱말을 꾸미는 짧은 말(수·관형사·부사). 이 뒤에서 자르면 "잔과", "삭힌"처럼 앞말 없이 매달린다.
const MODIFIERS=new Set(["한","두","세","네","첫","덜","더","안","못","잘","꼭","이","그","저","몇","새","옛","온"]);
// 보조 동사 앞(~어 주다, ~아 보다, ~어 있다, ~어 두다)에서는 자르지 않는다.
const AUXILIARY=/^(?:주|줘|보|봐|있|두|둬|놓|버리|버려)/;
// 앞말 없이는 뜻이 안 서는 의존 명사로 시작하는 낱말("마신 / 뒤", "오시기 / 전에", "먹는 / 것이").
const DEPENDENT=/^(?:(?:뒤|전|후|중|때)(?:에|엔|에는|는|도)?|땐|것.*|수|동안|만큼|대로|줄|적|데|덕분에|정도)$/;
const lastSyllable=(word:string)=>word.charCodeAt(word.length-1)-0xAC00;
const hangulSyllable=(code:number)=>code>=0&&code<11172;
// 관형형(~ㄴ 받침: 삭힌·쫀득한·마신)으로 끝나는 낱말. 그 뒤에서 자르면 꾸밈 받던 말("홍어")만 남아 뜻이 바뀐다
// ("덜 삭힌 홍어부터" → "홍어부터"). 받침이 ㄴ인 조사(은·는·만·엔·선)와 흔한 ㄴ 받침 명사 끝 글자는 빼고 본다.
// ㄹ 받침(먹을)은 겨울·마을·오늘 같은 명사가 훨씬 많아 보지 않는다.
const ADNOMINAL_EXCEPT=new Set(["은","는","만","엔","선","판","반","전","산","편","분","간","본","손","돈","문","년","원","인","관","단","면","천","진","친","신","운"]);
const endsAdnominal=(word:string)=>{const code=lastSyllable(word);return hangulSyllable(code)&&word.length>1&&code%28===4&&!ADNOMINAL_EXCEPT.has(word[word.length-1]);};
// 한 글자 낱말(톡·꽤·막·푹 같은 부사, 수)은 다음 낱말을 꾸미므로 그 바로 뒤에서 시작하지 않는다.
const single=(word:string)=>word.length===1&&hangulSyllable(lastSyllable(word));
// 조사·어미 없이 끝난 명사(홍어) 바로 뒤의 "명사+조사"(살은)는 한 덩어리("홍어 살은")라 그 사이에서 시작하지 않는다.
const PARTICLE_END=/(?:[은는이가을를에의도와과로만서고면며게요다죠까,，?!.]|부터|까지|처럼|보다|하고|랑)$/;
const bareNounBefore=(prev:string,first:string)=>hangulSyllable(lastSyllable(prev))&&!PARTICLE_END.test(prev)&&/(?:은|는|이|가|을|를|의)$/.test(first);
const startsBadly=(prev:string,first:string)=>MODIFIERS.has(prev)||single(prev)||endsAdnominal(prev)||DEPENDENT.test(first)||bareNounBefore(prev,first)
  ||(/[어아여워해려와]$/.test(prev)&&AUXILIARY.test(first))||(/(?:과|와|랑|하고)$/.test(prev)&&/^(?:함께|같이)$/.test(first));
// 마디가 끝나는 자리(쉼표, ~면·~고·~서·~며·~니까·~는데·~지만·~도록·~려(썰려·말려)·~해). 이 뒤에서 시작하면 뒷부분이 온전한 한 문장이다.
const CLAUSE_END=/(?:[,，]|면|고|서|며|니까|는데|지만|도록|려|해)$/;

export function fitLine(value:string,max:number):string {
  let text=tidy(value);
  if(text.length<=max)return text;
  const clause=trimEnd(text.split(/[,，·…]/)[0]??"");
  if(clause.length<=max&&clause.length>=Math.ceil(max*.4))return clause;
  for(const filler of text.split(" ").filter(word=>FILLERS.has(word))){
    const words=text.split(" "),at=words.indexOf(filler);
    if(at<0||words.length<=2)break;
    text=[...words.slice(0,at),...words.slice(at+1)].join(" ");
    if(text.length<=max)return text;
  }
  const words=text.split(" ");
  // 서술어가 남는 뒷부분 후보 중 가장 긴 것. 단 마디 끝 뒤에서 시작하는 후보(온전한 한 문장)가 그 80% 이상이면 그쪽
  // ("바닷바람에 말려 쫀득한 식감이…"(20자 초과) → "말려 쫀득한…"보다 "쫀득한 식감이 살아 있어요").
  const tails=words.slice(1,-1).map((_,k)=>k+1).filter(i=>!startsBadly(words[i-1],words[i]))
    .map(i=>({tail:words.slice(i).join(" "),clause:CLAUSE_END.test(words[i-1])}))
    .filter(({tail})=>tail.length<=max&&tail.length>=max*.5);
  if(tails.length){
    const longest=tails[0],clause=tails.find(item=>item.clause);
    return clause&&clause.tail.length>=longest.tail.length*.8?clause.tail:longest.tail;
  }
  for(let i=words.length-1;i>0;i--){
    const head=trimEnd(words.slice(0,i).join(" "));
    if(head.length&&head.length<=max)return head;
  }
  return text.slice(0,max);
}

// 긴 제목을 "제목(앞) + 짧은 글(뒤)"로 나눈다. 앞이 상한 안이고 전체의 40% 이상, 뒤가 짧은 글 상한 안인 자리 중
// 쉼표 뒤 → 마디 끝(~은·~는·~이·~가·~고·~서·~면·~수록 …) 뒤 → 앞이 가장 긴 자리 순으로 고른다.
// "진한 / 감칠맛"처럼 꾸밈말과 꾸밈 받는 말 사이에서 나누지 않으려는 것. 나눌 수 없으면 null.
const PHRASE_END=/(?:[,，.?!…]|은|는|이|가|고|서|면|며|데|니까|지만|수록|에|도)$/;
export function splitHeadline(value:string,max:number,tailMax:number):[string,string]|null {
  const text=tidy(value);
  const rank=(at:number)=>/[,，]/.test(text[at-1])?2:PHRASE_END.test(text.slice(0,at))?1:0;
  // 꾸밈말 바로 뒤("홍어 한 / 점이")나 보조 동사 앞("집어 / 보세요")에서는 나누지 않는다(fitLine과 같은 기준).
  const wordsAround=(at:number):[string,string]=>[text.slice(0,at).split(" ").pop()??"",text.slice(at+1).split(" ")[0]??""];
  const spots=[...text.matchAll(/ /g)].map(match=>match.index!)
    .filter(at=>at<=max&&at>=text.length*.4&&text.length-at-1<=tailMax&&!startsBadly(...wordsAround(at)))
    .sort((a,b)=>rank(b)-rank(a)||b-a);
  if(!spots.length)return null;
  const at=spots[0];
  return [trimEnd(text.slice(0,at)),text.slice(at+1)];
}

const same=(a:string,b:string)=>a.replace(/\s+/g,"")===b.replace(/\s+/g,"");

// ── 카드에 실제로 들어가는 길이 ──────────────────────────────────────────────────────────
// TRACK_COPY는 AI에게 "이만큼 짧게 써 달라"고 부탁하는 목표 길이다. 카드는 글자 크기를 줄이고 줄을 늘려 그보다 긴 글도
// 넘치지 않고 그린다(렌더러로 직접 재 본 값, 2026-10-09). 예전에는 목표 길이를 1자만 넘어도 문장 앞뒤를 잘라
// "홍어는 삭힌 정도에 따라 향의 세기가 달라요" → "따라 향의 세기가 달라요"처럼 주어·이유가 날아갔다(검수 보고서 B-1).
// 이제는 카드에 들어가는 길이(아래 값) 안이면 문장을 그대로 두고, 넘칠 때만 줄인다.
//   표지: 제목 40자·부제 32자(42·36자까지 넘침 없음).  사진 중심 본문: 제목 34자·짧은 글 46자.
//   글 중심 본문은 큰 글자 세 줄이 전부다: 제목 한 줄(14자 이하)이면 짧은 글 두 개(각 18자) 또는 하나(34자, 두 줄),
//   제목이 두 줄(15~28자)이면 짧은 글 하나(18자)만 들어간다(넘으면 카드가 짧은 글을 빼고 그린다).
export const TRACK_FIT={
  cover:{headline:40,subline:32},
  photo:{headline:34},
  text:{headline:28,oneLineHeadline:14},
} as const;
// 짧은 글 자리: 몇 개까지(count), 하나에 몇 자까지(room). 글 중심은 제목 줄 수와 짧은 글 개수에 따라 자리가 다르다.
export function trackPointRoom(track:CarouselTrack,headline:string,count:number):number {
  if(track==="photo")return 46;
  if(headline.length>TRACK_FIT.text.oneLineHeadline)return 18;
  return count>=2?18:34;
}
export const trackPointCount=(track:CarouselTrack,headline:string):number=>
  track==="text"&&headline.length>TRACK_FIT.text.oneLineHeadline?1:TRACK_COPY[track].points;

// 뜻을 바꾸지 않고 줄이는 방법만 쓴다(fitLine의 1·2단계): 쉼표 앞 첫 마디, 빼도 뜻이 남는 꾸밈말 빼기. 안 되면 null.
// 앞 낱말을 덜어 내는 3단계는 주어·조건이 사라져 뜻이 바뀌므로("미나리전은 바삭할 때" → 이유가 빠짐) 쓰지 않는다.
export function cleanCut(value:string,max:number):string|null {
  let text=tidy(value);
  if(text.length<=max)return text;
  const clause=trimEnd(text.split(/[,，·…]/)[0]??"");
  if(clause.length<=max&&clause.length>=Math.ceil(max*.4))return clause;
  for(const filler of text.split(" ").filter(word=>FILLERS.has(word))){
    const words=text.split(" "),at=words.indexOf(filler);
    if(at<0||words.length<=2)break;
    text=[...words.slice(0,at),...words.slice(at+1)].join(" ");
    if(text.length<=max)return text;
  }
  return null;
}
// 제목은 빼 버릴 수 없으므로, 깔끔하게 줄일 수 없으면 낱말 경계에서 앞부분을 남기고 "…"을 붙인다.
// 반쪽 문장이 온전한 문장처럼 보이는 것보다 "더 있다"는 표시가 정직하다(앞부분이 주어라 뜻도 덜 바뀐다).
export function ellipsize(value:string,max:number):string {
  const text=tidy(value);
  if(text.length<=max)return text;
  const words=text.split(" ");
  for(let i=words.length-1;i>0;i--){
    const head=trimEnd(words.slice(0,i).join(" "));
    if(head.length&&head.length+1<=max)return `${head}…`;
  }
  return `${text.slice(0,max-1)}…`;
}
const fitHeadline=(value:string,max:number)=>cleanCut(value,max)??ellipsize(value,max);

// 장 하나의 글을 갈래 규칙에 맞춘다. 카드에 들어가는 길이면 문장을 그대로 둔다.
//   제목: 넘치면 깔끔하게 줄이고(cleanCut), 안 되면 "…"로 줄인다.
//   짧은 글: 넘치면 깔끔하게 줄이고, 안 되면 그 짧은 글을 뺀다(반쪽 문장을 찍지 않는다). 개수는 갈래 개수까지.
// 여러 번 불러도 결과가 같다(이미 맞는 글은 그대로).
export function fitTrackCopy(slide:CarouselSlidePlan,track:CarouselTrack):Pick<CarouselSlidePlan,"headline"|"subline"|"points"> {
  if(slide.role==="cover"){
    const rule=TRACK_FIT.cover;
    const subline=tidy(slide.subline??"");
    return {headline:fitHeadline(slide.headline,rule.headline),subline:cleanCut(subline,rule.subline)??"",points:[]};
  }
  const headline=fitHeadline(slide.headline,TRACK_FIT[track].headline);
  const candidates=(slide.points??[]).map(tidy).filter(point=>point.length>=2&&!same(point,headline))
    .filter((point,i,list)=>list.findIndex(other=>same(other,point))===i);
  // 두 개를 넣을 자리로 먼저 맞춰 보고, 하나만 남으면 하나일 때의 자리로 다시 맞춘다(글 중심 한 줄 제목은 하나면 더 길게 들어간다).
  const most=trackPointCount(track,headline);
  const fitAll=(count:number)=>candidates.map(point=>cleanCut(point,trackPointRoom(track,headline,count))).filter((point):point is string=>!!point).slice(0,count);
  let points=fitAll(most);
  if(points.length<2)points=fitAll(1);
  return {headline,subline:"",points};
}

// 구성안 전체를 갈래에 맞춘다: 디자인(갈래 계열 + 기본 테마·계절·글꼴), 장마다 layout, 글꼴은 공통(auto), 모양 변형 0, 글 길이.
// 장 수는 구성안 AI가 정하고 검사 단계에서 맞추므로 여기서는 바꾸지 않는다. 여러 번 불러도 결과가 같다.
// copy:false면 글은 건드리지 않는다: AI 구성안은 검수 AI가 원래 문장을 보고 고치게 하고, 글 맞추기는 마지막에 한 번만 한다(B-2).
export function applyTrack(plan:CarouselPlan,track:CarouselTrack,options:{copy?:boolean}={}):CarouselPlan {
  const copy=options.copy??true;
  const slides:CarouselPlan["slides"]=plan.slides.map(slide=>({
    ...slide,...(copy?fitTrackCopy(slide,track):{}),layout:trackLayout(track,slide.role),titleFont:"auto",bodyFont:"auto",variant:0,
  }));
  const cover=plan.slides[0];
  return {...plan,design:trackDesign(track,paletteForTopic(`${cover?.headline??""} ${cover?.subline??""}`)),slides:copy?withReasonCount(withClosingInvite(slides,track)):slides};
}

// 표지 부제에 "이유 N가지"를 덧붙인다(일반 사용자 비판 C2: 끝이 보이는 글을 더 넘긴다). N = 표지·결론 장을 뺀 이유 장 수.
// 이미 "N가지"가 있으면 새 장 수로 바꾸고, 자리(TRACK_FIT.cover.subline)가 모자라면 붙이지 않는다. 여러 번 불러도 결과가 같다.
const REASON_COUNT=/\s*·?\s*이유 \d+가지$/;
function withReasonCount<T extends CarouselSlidePlan>(slides:T[]):T[] {
  const reasons=slides.length-2;
  if(reasons<2)return slides;
  const base=(slides[0].subline??"").replace(REASON_COUNT,"").trim();
  const tag=`이유 ${reasons}가지`;
  const subline=base?`${base} · ${tag}`:tag;
  if(subline.length>TRACK_FIT.cover.subline)return slides;
  return slides.map((slide,i)=>i===0?{...slide,subline}:slide);
}

// 마지막(결론) 장의 짧은 글 맨 끝을 "미나리전과 막걸리를 묵동홍어마을에서 즐겨 보세요"로 맺는다(사장님 요청 2026-10-09).
// 본문 장은 홍보 없이 이유만, 결론 장 한 줄만 가볍게 권한다. 메뉴 이름은 표지 질문에서 찾고, 자리가 모자라면 이유 줄을 빼서라도 메뉴 이름을 살린다.
// 이미 붙어 있으면 바꿔 붙이므로 여러 번 불러도 결과가 같다.
function withClosingInvite<T extends CarouselSlidePlan>(slides:T[],track:CarouselTrack):T[] {
  const last=slides.length-1;
  if(last<1)return slides;
  const end=slides[last];
  const dishes=menuOf(slides[0].headline).map(item=>item.short);
  const reasons=(end.points??[]).filter(point=>!point.includes(CLOSING_INVITE_TAIL)&&!PROMO_IN_CARD.test(point));
  const count=trackPointCount(track,end.headline);
  const make=(keep:string[])=>{const room=trackPointRoom(track,end.headline,keep.length+1);return [...keep,closingInvite(dishes,room)];};
  let points=make(reasons.slice(0,Math.max(0,count-1)));
  if(points.length>1&&dishes.length&&points.at(-1)===CLOSING_INVITE_TAIL)points=make([]);
  return slides.map((slide,i)=>i===last?{...slide,points}:slide);
}

// 구성안 프롬프트에 넣는 갈래 안내(글 길이·장 구성·디자인). carousel.ts의 buildCarouselPlanPrompt가 쓴다.
export function trackPromptRules(track:CarouselTrack):{story:string;style:string;design:string;track:string} {
  const rule=TRACK_COPY[track],cover=TRACK_COPY.cover;
  const points=track==="photo"?`짧은 글(points) 1개(${rule.point}자 이내)`:`짧은 글(points) 1~2개(각 ${rule.point}자 이내)`;
  return {
    // 인스타그램 독자는 큰 글씨(제목)만 훑고 넘긴다. 예전에는 "앞 장이 남긴 궁금증에 답하기" + 장 역할(먹는 법·곁들임·방문)대로
    // 써서, "홍어랑 삼합은 왜 같이 먹을까?" 표지 뒤에 "묵은지에 가볍게 감싸요"(먹는 법) 같은 제목이 끼어 흐름이 끊겼다(사장님 지적).
    // 이제는 표지 질문 하나에 본문 제목들이 차례로 답하고, 제목만 이어 읽어도 한 단락이 되게 쓴다.
    story:`[이야기 구조 — 제목만 읽어도 하나의 답] 인스타그램 독자는 큰 글씨(headline)만 빠르게 훑고 넘깁니다. 표지 headline은 독자가 실제로 가질 법한 궁금증 하나를 질문으로 던지고, 본문 장의 headline은 모두 그 표지 질문 하나에 답하는 조각으로 쓰세요: 표지와 마지막 장 사이의 장은 표지 질문의 이유·근거를 하나씩(가장 핵심 이유부터) 해요체 한 문장으로, 마지막 장 headline은 표지 질문에 대한 한 줄 결론으로 쓰세요. 표지 headline부터 마지막 장 headline까지 제목만 이어 읽어도 표지 질문에 답하는 짧은 글 한 단락처럼 자연스럽게 읽혀야 합니다. role은 장의 위치 표시일 뿐 그 장에 쓸 내용이 아닙니다(detail·how-to·pairing·visit 같은 이름과 상관없이 표지와 마지막 장 사이의 장은 모두 이유 하나씩입니다. 특히 pairing 자리에 표지 질문과 상관없는 곁들임 이야기를 끼워 넣지 마세요): 표지가 "왜"를 물으면 how-to 장에도 먹는 법 대신 이유를 쓰고, 먹는 법·메뉴 정의("삼합은 ~예요")·방문 안내는 표지 질문이 그것을 물을 때만 쓰세요. 질문은 표지에서만 던집니다(본문 headline은 "왜 ~일까요?" 금지). 짧은 글(points)은 그 장 headline을 뒷받침하는 근거나 눈·입으로 확인하는 방법 하나만 쓰고, 그 장 headline과 표지 질문에 없는 새 음식·새 이야기를 꺼내지 마세요. 제목의 결과를 말만 바꿔 되풀이하는 짧은 글(예: 제목 "물기 없이 말려요" + 짧은 글 "물기가 없어 맛이 유지돼요")은 금지입니다. 본문 장 제목은 겉모습 묘사가 아니라 이유를 말하는 문장으로 쓰세요(예: "수육 기름이 톡 쏘는 향을 감싸요", "삭히면 요소가 암모니아로 바뀌어요"). 아래 [이유 설명]을 따르세요. "다음 장에서 ~"처럼 다음 장을 예고하는 문장은 쓰지 마세요. ${NO_PROMO_IN_CARDS}
${STORY_ARC_RULE}
${EXPLAIN_REASONS_RULE}
${NOTES_FIRST_RULE}`,
    style:`[문체] headline과 points는 모두 가까운 사람에게 말하듯 자연스러운 해요체의 완결된 문장이나 질문으로 쓰세요. "~느껴보기", "~의 세계" 같은 명사형 슬로건, "미식의 향연", "풍미 가득", "놓치지 마세요" 같은 광고 상투어, 느낌표 남발은 금지합니다. 표지가 아닌 각 장은 headline 한 줄(${rule.headline}자 이내, 띄어쓰기 포함)과 ${points}만 씁니다. 글자 수를 꼭 지키세요: 넘치면 카드에서 잘립니다. 짧은 글은 headline을 반복하지 말고 눈이나 입으로 확인할 수 있는 구체적인 정보 하나만 쓰세요. 표지 headline은 넘기고 싶게 만드는 훅(${cover.headline}자 이내, 질문이나 한 문장)으로 쓰고, subline(${cover.subline}자 이내 해요체 한 줄)에는 답의 실마리를 구체적으로 예고하세요(예: "답은 빗소리에 있어요"). "유혹", "매력", "풍미", "향연", "특별한" 같은 광고 말은 쓰지 마세요(이유 개수는 앱이 덧붙여요). 이유 장의 짧은 글 가운데 한 줄은 읽고 바로 써먹을 정보(먹는 순서, 고르는 법, 함께 먹는 조합)로 쓰세요. 표지의 points는 빈 배열, 표지가 아닌 장의 subline은 빈 문자열입니다.`,
    design:`[디자인] 디자인과 장마다 layout은 앱이 정합니다. design은 {"palette":"warm","style":"${TRACK_STYLES[track]}","theme":"classic","titleFont":"pretendard","bodyFont":"pretendard","tone":"loud","season":"none"} 그대로 두고, 표지 layout은 fullscreen, 나머지 장은 ${track==="photo"?"frame":"browser"}로 쓰세요. 각 slide의 keywords에는 그 장을 대표하는 2~3자 내외의 짧은 키워드 2~3개를 넣고, figure는 빈 문자열로 두세요.`,
    track:track==="photo"
      ?`[갈래: ${TRACK_LABELS.photo}] 모든 장이 사진 한 장으로 꽉 차는 게시물입니다. 사진이 주인공이므로 글은 사진을 보며 바로 읽히는 한 줄이면 충분합니다. 각 장의 visualPrompt는 그 장의 글이 말하는 장면을 먹음직스럽게, 장마다 서로 다른 구도로 쓰세요.`
      :`[갈래: ${TRACK_LABELS.text}] 표지만 사진이 들어가고 나머지 장은 사진 없이 큰 글자만 나가는 게시물입니다. 장마다 큰 글자 세 줄(제목 한 줄 + 짧은 글 두 줄)로 읽히게 쓰세요. visualPrompt는 표지 장면만 실제 그림이 되지만, 모든 장에 서로 다르게 짧게 쓰세요.`,
  };
}
