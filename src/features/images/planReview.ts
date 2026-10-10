import { z } from "zod";
import { josa, mainMenuOf, type StoreMenuItem } from "@/features/store/menu";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, type CarouselPlan } from "./carousel";
import { checkTextClaims, servingClaimIssues } from "@/features/guard/service";
import { TRACK_COPY, type CarouselTrack } from "./track";
import { CLOSING_INVITE_TAIL, EXPLAIN_REASONS_RULE, PROMO_IN_CARD, QUESTION_CONDITIONS, STORY_ARC_RULE, VAGUE_REASON } from "@/features/copy/explain";
import { menuOf } from "@/features/store/menu";

// 카드 문안(장마다 제목·요점) 2차 검수.
// 1) slideCopyIssues: 코드로 잡을 수 있는 문제를 장 번호와 함께 찾는다(광고 상투어, 반복, 끝맺음, 길이 등).
// 2) reviewCarouselPlan: 그 목록과 편집 기준을 AI에게 주고 제목·요점만 고쳐 받는다. 역할·레이아웃·디자인은 건드리지 않는다.
//    고친 결과가 원래보다 문제가 많거나 형식이 맞지 않으면 버리고 원래 구성안을 쓴다.

export type SlideCopyIssue={slide:number;field:"headline"|"points";message:string};

// 카드뉴스에서 광고처럼 들려 신뢰를 떨어뜨리는 표현. 캡션 프롬프트와 같은 기준을 카드에도 적용한다.
const CLICHES=["풍미 가득","풍미의","미식의 향연","향연","놓치지 마세요","맛집 인정","강력 추천","인생 맛집","끝판왕","환상의","꼭 드셔","역대급","대박","미쳤","JMT","존맛"];
// 명사로 끝나는 슬로건형 제목("~의 세계", "~ 느껴보기")은 질문·해요체 흐름을 깬다.
const SLOGAN=/(의 세계|의 정석|의 모든 것|의 비밀|느껴보기|즐기기|알아보기|한 세트)$/;
const compact=(value:string)=>value.replace(/[\s.,!?~…·'"“”‘’]/g,"");

// 두 문장이 얼마나 비슷한지: 글자 두 개씩 묶음(bigram)의 겹침 비율(Jaccard). 0~1.
function similarity(a:string,b:string){
  const grams=(value:string)=>{const text=compact(value),set=new Set<string>();for(let i=0;i<text.length-1;i++)set.add(text.slice(i,i+2));return set;};
  const x=grams(a),y=grams(b);
  if(!x.size||!y.size)return 0;
  let both=0;for(const gram of x)if(y.has(gram))both++;
  return both/(x.size+y.size-both);
}

// 갈래(track.ts)가 있으면 글 길이 기준이 갈래 기준(제목 18자·표지 24자, 짧은 글 20~24자)이고,
// 사진 중심은 짧은 글 1개가 정상이라 "요점 2개 이상" 대신 1개 이상을 본다.
type CopyLimits={headline:number;coverHeadline:number;minPoints:number;point?:number};
const DEFAULT_LIMITS:CopyLimits={headline:30,coverHeadline:30,minPoints:2};
export const copyLimitsOf=(track?:CarouselTrack):CopyLimits=>track?{headline:TRACK_COPY[track].headline,coverHeadline:TRACK_COPY.cover.headline,minPoints:1,point:TRACK_COPY[track].point}:DEFAULT_LIMITS;

// 큰 글씨만 훑는 독자를 위한 흐름 검사(갈래 게시물). 표지가 "왜"를 묻는데 본문 제목이 먹는 법이면 흐름이 끊긴다
// (사장님 지적: "홍어랑 삼합은 왜 같이 먹을까?" 뒤에 "홍어를 묵은지에 가볍게 감싸요").
const ASKS_WHY=/왜|이유/;
const COVER_AD_WORDS=/유혹|매력|향연|풍미|가득|특별한|완벽한|최고의/;
// 먹는 법(지시·동작) 제목: 감싸요·싸 먹어요·올려요·찍어요·집어요·드세요 …. 이유를 말하는 말(때문·라서·덕분 …)이 있으면 답으로 본다.
const HOW_TO=/(?:감싸|싸서|싸\s*먹|올려|얹어|찍어|집어|덜어|곁들여|드세요|드셔|드시|먹어\s*보|맛보세요)/;
const GIVES_REASON=/때문|라서|해서|덕분|니까|으니|어서|아서|잡아|눌러|줄여|살려|채워|맞춰/;
// 짧은 글이 그 장 제목·표지에 없는 새 음식을 꺼내는지 볼 낱말(가게 메뉴·곁들임).
const SIDE_SUBJECTS=["묵은지","수육","초장","막걸리","미나리","과메기","애탕","무침","홍어찜","삼합","쪽파","마늘","고추","미역","깻잎","상추","배추"];

export function slideCopyIssues(plan:CarouselPlan,track?:CarouselTrack):SlideCopyIssue[] {
  const limits=copyLimitsOf(track);
  const issues:SlideCopyIssue[]=[];
  const add=(slide:number,field:SlideCopyIssue["field"],message:string)=>issues.push({slide,field,message});
  const allPoints:Array<{slide:number;text:string}>=[];
  // 표지 질문에 붙은 상황·때(비 오는 날·찬바람…)를 본문 어느 장도 설명하지 않으면, 첫 이유 장에서 그 연결을 설명하게 한다.
  if(track&&plan.slides.length>2){
    const cover=plan.slides[0].headline;
    const body=plan.slides.slice(1).map(slide=>[slide.headline,...slide.points].join(" ")).join(" ");
    const missed=QUESTION_CONDITIONS.find(condition=>condition.asked.test(cover)&&!condition.answered.test(body));
    if(missed)issues.push({slide:2,field:"headline",message:`표지가 '${missed.label}'에 왜 이 음식이 생각나는지 묻는데, 본문 어느 장도 ${missed.label}과(와) 음식의 연결을 설명하지 않아요. 첫 이유 장은 그 상황과 음식이 왜 이어지는지로 쓰세요.`});
  }
  plan.slides.forEach((slide,i)=>{
    const n=i+1,headline=slide.headline.trim();
    const length=headline.replace(/\s/g,"").length;
    // 표지는 짧고 굵은 제목도 괜찮아서 4자, 본문 장은 6자를 최소로 본다.
    if(length<(slide.role==="cover"?4:6))add(n,"headline","제목이 너무 짧아요. 무엇에 대한 장인지 알 수 있게 쓰세요.");
    const max=slide.role==="cover"?limits.coverHeadline:limits.headline;
    if(headline.length>max)add(n,"headline",`제목이 ${max}자를 넘어요. 한 가지 정보만 남겨 줄이세요.`);
    for(const word of CLICHES)if(headline.includes(word))add(n,"headline",`광고 상투어 '${word}'를 빼고 구체적인 정보로 바꾸세요.`);
    if(SLOGAN.test(headline))add(n,"headline","명사로 끝나는 슬로건 대신 해요체 문장이나 질문으로 쓰세요.");
    if((headline.match(/!/g)??[]).length>1)add(n,"headline","느낌표를 줄이세요.");
    // 갈래 게시물은 질문을 표지에서만 던진다. 본문 장 제목이 "왜 ~일까요?"면 짧은 글 한 줄로는 결과만 되풀이하기 쉽다(실제 사례:
    // "왜 물기가 생기지 않을까요?" + "물기가 없어 오래 보관해도 맛이 유지돼요"). 답을 제목으로, 이유·확인 방법을 짧은 글로 쓰게 한다.
    if(track&&slide.role!=="cover"&&/[?？]$/.test(headline))add(n,"headline","본문 장 제목은 질문 대신 이 장이 알려 주는 답(핵심 사실)을 해요체 문장으로 쓰고, 짧은 글에는 그 이유나 확인하는 방법을 쓰세요.");
    // 표지 제목·부제의 광고 말(일반 사용자 비판 C1: "빗소리와 함께 찾아오는 고소한 유혹"은 광고처럼 읽혀 넘기지 않는다).
    if(track&&slide.role==="cover"){
      const ad=`${headline} ${slide.subline??""}`.match(COVER_AD_WORDS);
      if(ad)add(n,"headline",`표지에 '${ad[0]}' 같은 광고 말이 있어요. 부제는 답의 실마리를 구체적으로 예고하세요(예: "답은 빗소리에 있어요").`);
    }
    // 갈래 게시물 카드는 궁금증을 푸는 이야기만 담는다. 가게 홍보는 맨 뒤 홍보 카드와 캡션 끝 한 줄이 맡는다
    // (사장님 요청 2026-10-09: 장마다 "묵동홍어마을로 오세요"가 나오면 사람도 알고리즘도 광고로 보고 넘긴다).
    if(track){
      if(PROMO_IN_CARD.test(headline))add(n,"headline","카드 제목에 가게 이름·방문 권유가 있어요. 홍보는 맨 뒤 홍보 카드가 맡으니, 표지 질문의 이유를 말하는 제목으로 바꾸세요.");
      // 결론 장 맨 끝 "~을 묵동홍어마을에서 즐겨 보세요" 한 줄은 앱이 붙이는 맺음말이라 홍보로 세지 않는다.
      for(const point of slide.points)if(PROMO_IN_CARD.test(point)&&!(i===plan.slides.length-1&&point.includes(CLOSING_INVITE_TAIL)))add(n,"points",`요점 '${point.trim()}'에 가게 이름·방문 권유가 있어요. 제목을 뒷받침하는 이유나 원리로 바꾸세요.`);
    }
    // 결론 장: 표지 질문의 핵심 말(음식 이름)을 다시 짚어야 질문 → 답이 한눈에 이어진다(맥락 잇기).
    if(track&&i===plan.slides.length-1&&i>0){
      const asked=menuOf(plan.slides[0]?.headline??"");
      if(asked.length&&!menuOf(headline).some(item=>asked.some(other=>other.id===item.id)))add(n,"headline",`마지막 장은 결론이에요. 표지 질문의 '${asked[0].short}'을(를) 다시 써서 질문에 대한 답을 한 문장으로 분명하게 말하세요.`);
    }
    if(track&&slide.role!=="cover"){
      const cover=plan.slides[0]?.headline??"";
      if(ASKS_WHY.test(cover)&&HOW_TO.test(headline)&&!GIVES_REASON.test(headline))add(n,"headline",`표지가 "${cover.trim()}"라고 이유를 묻는데 이 장 제목은 먹는 법이에요. 제목만 이어 읽어도 흐름이 이어지게 표지 질문의 이유(근거) 하나를 답하는 제목으로 바꾸세요.`);
      // 표지가 "왜"를 묻는데 본문 제목이 표지에 없는 곁들임을 꺼내면 흐름이 끊긴다(5장 구성의 4번째 장이 늘 pairing 자리라 잘 생긴다).
      const sideTurn=ASKS_WHY.test(cover)?SIDE_SUBJECTS.find(word=>headline.includes(word)&&!cover.includes(word)):undefined;
      if(sideTurn)add(n,"headline",`표지가 "${cover.trim()}"라고 묻는데 이 장 제목은 표지에 없는 '${sideTurn}' 이야기예요. 표지 질문의 이유 하나를 답하는 제목으로 바꾸세요.`);
      if(VAGUE_REASON.test(headline))add(n,"headline","'조화롭게 잡아줘요'·'정돈해줘요'처럼 결과만 말하는 막연한 제목이에요. 무엇이 무엇을 어떻게 바꾸는지(이유) 쓰세요.");
      for(const point of slide.points)if(VAGUE_REASON.test(point))add(n,"points",`요점 '${point.trim()}'이 결과만 말하고 이유가 없어요. 무엇이 어떻게 작용하는지 쓰세요.`);
      // 표지가 "왜"를 묻는데 요점이 먹는 법이면 제목과 따로 논다(사장님 지적 2026-10-10: 제목 "지방층이 묵은지의 산미를 감싸요" 아래
      // "홍어 한 점을 묵은지에 살짝 감싸요"). 먹는 법은 속 글(notes)·올릴 글로 보내고, 요점은 제목의 이유·근거로 쓴다.
      for(const point of slide.points)if(ASKS_WHY.test(cover)&&HOW_TO.test(point)&&!GIVES_REASON.test(point)&&i<plan.slides.length-1)add(n,"points",`요점 '${point.trim()}'은 먹는 법이라 제목과 따로 놀아요. 제목을 뒷받침하는 이유·근거로 바꾸세요.`);
      for(const point of slide.points){
        const fresh=SIDE_SUBJECTS.find(word=>point.includes(word)&&!headline.includes(word)&&!cover.includes(word));
        if(fresh)add(n,"points",`요점 '${point.trim()}'이 제목·표지에 없는 '${fresh}' 이야기를 꺼내요. 이 장 제목을 뒷받침하는 내용만 쓰세요.`);
      }
    }
    // 카드는 게시 뒤 고칠 수 없으니 확인 안 된 사실·보장·가게 제공 단정을 검수 단계에서 먼저 고치게 한다.
    const claim=(text:string)=>{const result=checkTextClaims(text);return [...result.blocked,...result.verify,...servingClaimIssues(text)];};
    for(const message of claim(headline))add(n,"headline",`제목: ${message} 확인된 정보 없이 쓸 수 있는 말로 바꾸세요.`);
    for(const point of slide.points)for(const message of claim(point))add(n,"points",`요점 '${point.trim()}': ${message} 빼거나 바꾸세요.`);
    for(const point of slide.points){
      const text=point.trim();
      for(const word of CLICHES)if(text.includes(word))add(n,"points",`요점 '${text}'의 광고 상투어 '${word}'를 빼세요.`);
      if(!/[요까다?]$/.test(text.replace(/[.!]$/,"")))add(n,"points",`요점 '${text}'을 해요체 완결 문장으로 끝내세요.`);
      if(similarity(text,headline)>.6)add(n,"points",`요점 '${text}'이 제목을 되풀이해요. 새로운 정보를 쓰세요.`);
      if(limits.point&&text.length>limits.point)add(n,"points",`요점 '${text}'이 ${limits.point}자를 넘어요. 짧게 줄이세요.`);
      allPoints.push({slide:n,text});
    }
    // 표지가 아닌 장의 요점은 2개 이상이어야 카드가 비어 보이지 않는다(갈래가 있으면 1개 이상).
    if(slide.role!=="cover"&&slide.points.length<limits.minPoints)add(n,"points",limits.minPoints>1?"요점을 2~4개로 채우세요.":"짧은 글을 하나 넣으세요.");
  });
  // 장끼리 제목·요점이 겹치면 캐러셀을 넘겨도 새 정보가 없다.
  for(let i=0;i<plan.slides.length;i++)for(let j=i+1;j<plan.slides.length;j++){
    if(similarity(plan.slides[i].headline,plan.slides[j].headline)>.5)add(j+1,"headline",`${i+1}번 장 제목과 너무 비슷해요. 이 장만의 정보로 바꾸세요.`);
  }
  for(let i=0;i<allPoints.length;i++)for(let j=i+1;j<allPoints.length;j++){
    if(allPoints[i].slide!==allPoints[j].slide&&similarity(allPoints[i].text,allPoints[j].text)>.6)add(allPoints[j].slide,"points",`요점 '${allPoints[j].text}'이 ${allPoints[i].slide}번 장 요점과 겹쳐요.`);
  }
  return issues;
}

// AI에게 돌려받을 모양: 장마다 제목과 요점만. 엄격 JSON 스키마 제공자를 위해 선택 필드를 두지 않는다.
export function reviewSchema(count:number){
  return z.object({slides:z.array(z.object({
    headline:z.string().trim().min(1).max(42),
    points:z.array(z.string().trim().min(1).max(SLIDE_POINT_MAX_LENGTH)).max(SLIDE_POINT_MAX_COUNT),
  })).length(count)});
}
export type PlanReview=z.infer<ReturnType<typeof reviewSchema>>;

// 편집 기준 3번: 주제의 메뉴가 주인공. 홍어 주제일 때만 홍어를 주어로, 과메기·미나리전 같은 주제면 그 메뉴를 주어로 쓴다.
// menu: 구성안과 같은 주인공 메뉴(carouselMenu: 주제·내용 메모·이미지 설명·사진 설명). 주지 않으면 주제 제목에서만 찾는다.
// 예전에는 제목만 봐서 "입맛 없을 땐 왜 새콤한 게 당길까?"(홍어무침 주제)에 "주어는 홍어"라고 시켰다.
function heroLine(topic:string,menu:StoreMenuItem|undefined=mainMenuOf(topic)):string {
  if(!menu||menu.id==="hongeo-hoe")return `주어와 첫 동작은 홍어(홍어 한 점, 홍어 살, 홍어 향)로 쓰고, 곁들임은 곁들이는 말로만 넣으세요.${/삼합|수육|묵은지/.test(topic)?"":" 주제에 없는 삼합(수육·묵은지)을 새로 넣지 마세요."}`;
  return `주어와 첫 동작은 주제의 메뉴인 ${josa(menu.short,"으로","로")} 쓰고, 다른 음식은 곁들이는 말로만 넣으세요. 홍어·삼합을 억지로 끌어오지 마세요.`;
}

export type ReviewContext={menu?:StoreMenuItem;photoNotes?:readonly string[];contentBrief?:string;track?:CarouselTrack};

export function buildPlanReviewPrompt(plan:CarouselPlan,topic:string,issues:SlideCopyIssue[],context:ReviewContext={}):string {
  const slides=plan.slides.map((slide,i)=>({slide:i+1,role:slide.role,headline:slide.headline,points:slide.points}));
  const found=issues.length?issues.map(issue=>`- ${issue.slide}번 장 ${issue.field==="headline"?"제목":"요점"}: ${issue.message}`).join("\n"):"- 자동 검사에서 찾은 문제는 없습니다. 아래 기준으로 흐름과 표현만 다듬으세요.";
  return `당신은 묵동홍어마을 Instagram 카드뉴스의 편집자입니다. 아래 캐러셀 문안(장마다 제목과 요점)을 검토해 고친 결과를 JSON으로 돌려주세요.
주제: ${JSON.stringify(topic)}${context.contentBrief?`
내용 메모(참고 데이터): ${JSON.stringify(context.contentBrief.slice(0,400))}`:""}${context.photoNotes?.some(Boolean)?`
실제 사진에 보이는 것(참고 데이터, 장 순서와 다를 수 있음): ${JSON.stringify(context.photoNotes.filter(Boolean))}. 사진에 없는 음식을 새로 주인공으로 넣지 마세요.`:""}

[자동 검사에서 찾은 문제]
${found}

[편집 기준]
1. ${context.track?`(가장 중요) 독자는 큰 글씨(제목)만 훑고 넘깁니다. 표지 제목은 질문 하나, 본문 장 제목은 모두 그 표지 질문에 답하는 조각(이유·근거), 마지막 장 제목은 한 줄 결론입니다. 아래 [제목만 이어 읽기]가 표지 질문에 답하는 한 단락처럼 읽히게 고치세요. 표지 질문과 상관없는 제목(먹는 법·메뉴 정의·방문 안내)은 표지 질문의 이유로 바꾸세요. role은 장 위치일 뿐 내용 지시가 아닙니다. 짧은 글은 그 장 제목을 뒷받침하는 근거나 확인하는 방법 하나이고, 제목·표지에 없는 새 음식·새 이야기를 꺼내지 않으며, 제목의 결과를 말만 바꿔 되풀이하지 않습니다.`:"각 장은 앞 장이 남긴 궁금증에 답하고 다음 장으로 이어집니다."} 장끼리 같은 말이나 같은 정보를 반복하지 마세요.
2. ${context.track?`본문 장 제목은 ${TRACK_COPY[context.track].headline}자 이내의 해요체 문장 하나(질문은 표지 제목만, ${TRACK_COPY.cover.headline}자 이내), 요점은 ${TRACK_COPY[context.track].point}자 이내의 해요체 완결 문장입니다. 글자 수를 늘리지 마세요.`:"제목은 12~30자의 해요체 문장이나 질문 하나, 요점은 12~28자의 해요체 완결 문장입니다."} 명사로 끝나는 슬로건, 광고 상투어, 느낌표 남발은 쓰지 마세요.
3. ${heroLine(topic,context.menu??mainMenuOf(topic))}
4. "입안의 리듬" 같은 추상적 비유 대신 구체적으로 쓰세요. ${context.track?`겉모습 묘사만 하지 말고 사람이 왜 그렇게 느끼는지 이유를 쓰고, 카드에는 가게 이름·방문 권유·예약 안내를 쓰지 마세요(맨 뒤 홍보 카드가 따로 붙어요).
${STORY_ARC_RULE}
${EXPLAIN_REASONS_RULE}`:"눈이나 입으로 확인할 수 있는 관찰(색, 결, 식감, 먹는 순서)이나 널리 알려진 이유로 쓰세요."}
5. 확인되지 않은 가격·원산지·영업시간·숙성 기간·건강 효능, 향이 사라진다거나 누구나 좋아한다는 보장은 쓰지 마세요.
6. 문제가 없는 장은 그대로 두세요. 장 수, 장 순서, 장마다 요점 개수(표지는 빈 배열)는 바꾸지 마세요. 표지의 points는 빈 배열입니다.

${context.track?`[제목만 이어 읽기]
${plan.slides.map((slide,i)=>`${i+1}. ${slide.headline}`).join("\n")}

`:""}[현재 문안]
${JSON.stringify(slides)}

출력: {"slides":[{"headline":"...","points":["..."]}, ...]} 형식으로 모든 장을 순서대로.`;
}

export type ReviewResult={plan:CarouselPlan;applied:boolean;before:number;after:number};

// AI 검수를 적용한다. 형식이 다르거나(장 수·요점 수), 문제 수가 늘거나, 금지 표현이 새로 생기면 원래 구성안을 쓴다.
// 자동 검사에서 문제가 하나도 없으면 AI를 다시 부르지 않는다(무료 한도를 아끼고, 멀쩡한 문안을 괜히 바꾸지 않게).
export async function reviewCarouselPlan(plan:CarouselPlan,topic:string,ai:{review:(prompt:string,schema:ReturnType<typeof reviewSchema>)=>Promise<PlanReview>},context:ReviewContext={}):Promise<ReviewResult> {
  const issues=slideCopyIssues(plan,context.track);
  const before=issues.length;
  if(!before)return {plan,applied:false,before:0,after:0};
  try{
    const schema=reviewSchema(plan.slides.length);
    const reviewed=schema.parse(await ai.review(buildPlanReviewPrompt(plan,topic,issues,context),schema));
    const minPoints=copyLimitsOf(context.track).minPoints;
    const sameShape=reviewed.slides.every((slide,i)=>slide.points.length===plan.slides[i].points.length||(plan.slides[i].role!=="cover"&&slide.points.length>=minPoints));
    if(!sameShape)return {plan,applied:false,before,after:before};
    const next:CarouselPlan={...plan,slides:plan.slides.map((slide,i)=>({...slide,headline:reviewed.slides[i].headline,points:slide.role==="cover"?[]:reviewed.slides[i].points}))};
    const after=slideCopyIssues(next,context.track).length;
    const blocked=next.slides.some(slide=>[slide.headline,...slide.points].some(text=>checkTextClaims(text).blocked.length>0));
    if(blocked||after>before)return {plan,applied:false,before,after:before};
    return {plan:next,applied:true,before,after};
  }catch{
    return {plan,applied:false,before,after:before};
  }
}
