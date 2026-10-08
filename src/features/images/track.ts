import { z } from "zod";
import type { CarouselPlan, CarouselRole, CarouselSlidePlan } from "./carousel";
import { DEFAULT_DESIGN, type CardLayout, type DesignSpec } from "./design";
import type { StyleId } from "./styleCatalog";

// 갈래(계획서 SIMPLIFY_PLAN): 사장님은 "사진 중심 / 글 중심" 둘 중 하나만 고르고, 나머지는 갈래가 정한다.
//   - 장 수: 두 갈래 모두 5장(맨 뒤 가게 홍보 카드는 생성 흐름이 따로 붙인다).
//   - 디자인: 갈래 전용 계열(photo-focus·text-focus). 테마·계절 소품·글꼴은 기본값, 무작위 섞기(variety.ts)는 하지 않는다.
//   - 장마다 사진 수(layout): 사진 중심은 모든 장이 사진 1장(표지 fullscreen, 본문 frame),
//     글 중심은 표지만 사진 1장(fullscreen)이고 본문·마지막 장은 사진 없는 장(browser) → 이미지 AI를 표지 한 번만 부른다.
//     계열 디자인에서 layout은 "사진 몇 장"만 정하므로 frame·browser는 그 수를 뜻하는 이름일 뿐이다.
//   - 글 길이: 구성안 프롬프트로 먼저 요청하고, AI 답(과 검수·거르기 뒤)에 코드로 한 번 더 맞춘다(applyTrack).
// 갈래가 없으면(예전 초안·예전 화면) 이 파일은 아무것도 바꾸지 않는다.
export const CarouselTrackSchema=z.enum(["photo","text"]);
export type CarouselTrack=z.infer<typeof CarouselTrackSchema>;
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
export const trackDesign=(track:CarouselTrack):DesignSpec=>({...DEFAULT_DESIGN,style:TRACK_STYLES[track]});

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

// 장 하나의 글을 갈래 규칙에 맞춘다.
export function fitTrackCopy(slide:CarouselSlidePlan,track:CarouselTrack):Pick<CarouselSlidePlan,"headline"|"subline"|"points"> {
  if(slide.role==="cover"){
    const rule=TRACK_COPY.cover;
    let headline=tidy(slide.headline),subline=fitLine(slide.subline??"",rule.subline);
    if(headline.length>rule.headline){
      // 부제가 비어 있으면 긴 제목의 뒷부분을 부제로 내린다. 아니면 제목만 줄인다.
      const split=!subline?splitHeadline(headline,rule.headline,rule.subline):null;
      if(split)[headline,subline]=split;else headline=fitLine(headline,rule.headline);
    }
    return {headline,subline,points:[]};
  }
  const rule=TRACK_COPY[track];
  let headline=tidy(slide.headline);
  let points=(slide.points??[]).map(tidy).filter(Boolean);
  if(headline.length>rule.headline){
    // 짧은 글 자리가 남으면 제목 뒷부분을 첫 짧은 글로 내린다(뜻이 이어진다). 자리가 없으면 제목만 줄인다.
    const split=points.length<rule.points?splitHeadline(headline,rule.headline,rule.point):null;
    if(split){headline=split[0];points=[split[1],...points];}
    else headline=fitLine(headline,rule.headline);
  }
  points=points.map(point=>fitLine(point,rule.point)).filter(point=>point.length>=2&&!same(point,headline))
    .filter((point,i,list)=>list.findIndex(other=>same(other,point))===i).slice(0,rule.points);
  return {headline,subline:"",points};
}

// 구성안 전체를 갈래에 맞춘다: 디자인(갈래 계열 + 기본 테마·계절·글꼴), 장마다 layout, 글꼴은 공통(auto), 모양 변형 0, 글 길이.
// 장 수(5장)는 요청 단계에서 맞추므로(구성안 입력) 여기서는 바꾸지 않는다. 여러 번 불러도 결과가 같다.
export function applyTrack(plan:CarouselPlan,track:CarouselTrack):CarouselPlan {
  return {...plan,design:trackDesign(track),slides:plan.slides.map(slide=>({
    ...slide,...fitTrackCopy(slide,track),layout:trackLayout(track,slide.role),titleFont:"auto",bodyFont:"auto",variant:0,
  }))};
}

// 구성안 프롬프트에 넣는 갈래 안내(글 길이·장 구성·디자인). carousel.ts의 buildCarouselPlanPrompt가 쓴다.
export function trackPromptRules(track:CarouselTrack):{story:string;style:string;design:string;track:string} {
  const rule=TRACK_COPY[track],cover=TRACK_COPY.cover;
  const points=track==="photo"?`짧은 글(points) 1개(${rule.point}자 이내)`:`짧은 글(points) 1~2개(각 ${rule.point}자 이내)`;
  return {
    story:`[이야기 구조] 5장은 한 사람이 친구에게 이 음식을 설명해 주는 한 편의 이야기입니다. 표지는 독자가 실제로 가질 법한 구체적인 궁금증 하나를 질문이나 한 문장으로 던지고, 각 본문 장은 앞 장이 남긴 궁금증에 한 가지씩 답하세요. 질문은 표지에서만 던집니다: 본문 장의 headline은 "왜 ~일까요?" 같은 질문으로 쓰지 말고 그 장이 알려 주는 답(핵심 사실)을 해요체 한 문장으로 쓰세요. 짧은 글에는 그 답의 이유·근거나 확인하는 방법 하나를 구체적으로 쓰세요(무엇 때문에, 무엇을 보면 알 수 있는지). 제목의 결과를 말만 바꿔 되풀이하는 짧은 글(예: 제목 "왜 물기가 생기지 않을까요?" + 짧은 글 "물기가 없어 맛이 유지돼요")은 금지입니다. 이유를 확인된 정보로 쓸 수 없으면 그 장은 이유를 묻지 말고 눈이나 입으로 확인할 수 있는 사실(색·결·식감·먹는 순서·어울리는 곁들임)을 답으로 쓰세요. 글이 아주 짧으므로 "다음 장에서 ~"처럼 다음 장을 예고하는 문장은 쓰지 마세요. 마지막 장은 방문 전 확인할 것 하나로 닫으세요.`,
    style:`[문체] headline과 points는 모두 가까운 사람에게 말하듯 자연스러운 해요체의 완결된 문장이나 질문으로 쓰세요. "~느껴보기", "~의 세계" 같은 명사형 슬로건, "미식의 향연", "풍미 가득", "놓치지 마세요" 같은 광고 상투어, 느낌표 남발은 금지합니다. 표지가 아닌 각 장은 headline 한 줄(${rule.headline}자 이내, 띄어쓰기 포함)과 ${points}만 씁니다. 글자 수를 꼭 지키세요: 넘치면 카드에서 잘립니다. 짧은 글은 headline을 반복하지 말고 눈이나 입으로 확인할 수 있는 구체적인 정보 하나만 쓰세요. 표지 headline은 넘기고 싶게 만드는 훅(${cover.headline}자 이내, 질문이나 한 문장)으로 쓰고, 그 설명은 subline(${cover.subline}자 이내 해요체 한 줄)에 넣으세요. 표지의 points는 빈 배열, 표지가 아닌 장의 subline은 빈 문자열입니다.`,
    design:`[디자인] 디자인과 장마다 layout은 앱이 정합니다. design은 {"palette":"warm","style":"${TRACK_STYLES[track]}","theme":"classic","titleFont":"pretendard","bodyFont":"pretendard","tone":"loud","season":"none"} 그대로 두고, 표지 layout은 fullscreen, 나머지 장은 ${track==="photo"?"frame":"browser"}로 쓰세요. 각 slide의 keywords에는 그 장을 대표하는 2~3자 내외의 짧은 키워드 2~3개를 넣고, figure는 빈 문자열로 두세요.`,
    track:track==="photo"
      ?`[갈래: ${TRACK_LABELS.photo}] 모든 장이 사진 한 장으로 꽉 차는 게시물입니다. 사진이 주인공이므로 글은 사진을 보며 바로 읽히는 한 줄이면 충분합니다. 각 장의 visualPrompt는 그 장의 글이 말하는 장면을 먹음직스럽게, 장마다 서로 다른 구도로 쓰세요.`
      :`[갈래: ${TRACK_LABELS.text}] 표지만 사진이 들어가고 나머지 장은 사진 없이 큰 글자만 나가는 게시물입니다. 장마다 큰 글자 세 줄(제목 한 줄 + 짧은 글 두 줄)로 읽히게 쓰세요. visualPrompt는 표지 장면만 실제 그림이 되지만, 모든 장에 서로 다르게 짧게 쓰세요.`,
  };
}
