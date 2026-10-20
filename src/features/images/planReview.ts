import { z } from "zod";
import { josa, mainMenuOf, type StoreMenuItem } from "@/features/store/menu";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, type CarouselPlan } from "./carousel";
import { checkTextClaims, servingClaimIssues } from "@/features/guard/service";
import { TRACK_COPY, TRACK_FIT, type CarouselTrack } from "./track";
import { storeNotesRule } from "@/features/store/storeNotes";
import { comparisonPairRule, mythAssertedBy, principleNotesRule } from "@/features/store/principles";
import { ASKS_UNFAMILIAR, NAMES_CAUSE, causeWordsOf, obviousQuestion, coverSpoiler, SECRET_TEASE, yesNoCover, EXPLAIN_REASONS_RULE, PROMO_IN_CARD, QUESTION_CONDITIONS, QUESTION_FOCUS_RULE, STORY_ARC_RULE, VAGUE_REASON, HOOK_DARE, HOOK_HYPE, VAGUE_COVER, comparedKeys, comparedPair, praisesInsteadOfExplaining } from "@/features/copy/explain";
import { menuOf } from "@/features/store/menu";
import { copiesExemplar, hasSenseWord, restatesHeadline } from "@/features/copy/senses";

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

// 비교 장에서 "다르다"는 말(어떻게 다른지는 없이). 양쪽 이름이 함께 있으면 "A는 ~, B는 ~"로 설명한 것으로 본다.
const SAYS_DIFFERENT=/달라|다르|다른\s|차이|갈라|갈려|갈린/;
// 공통점을 밝힌 장("둘 다 ~", "모두 ~")은 한쪽만 말한 장으로 보지 않는다.
export const SAYS_SHARED=/둘\s*다|모두|공통|똑같|같은\s/;
// 이유 장끼리 같은 원인을 되풀이하면(앞 장의 원인 말만 있고 새 원인이 없으면) 다른 이유로 바꾸게 한다(점검 7~10회 평가: "2장과 4장이 같은 원리").
function repeatedCauseIssues(plan:CarouselPlan):SlideCopyIssue[] {
  const issues:SlideCopyIssue[]=[];
  const seen=new Map<string,number>();
  plan.slides.forEach((slide,i)=>{
    if(i===0||i===plan.slides.length-1)return;
    const causes=causeWordsOf([slide.headline,...slide.points].join(" "));
    if(!causes.length)return;
    const fresh=causes.filter(cause=>!seen.has(cause));
    if(!fresh.length){
      const earlier=seen.get(causes[0])!;
      issues.push({slide:i+1,field:"headline",message:`${i+1}장은 ${earlier}장과 같은 원인('${causes.join("·")}')을 되풀이해요. 다른 이유 하나로 바꾸거나 ${earlier}장과 합치세요.`});
    }
    for(const cause of fresh)seen.set(cause,i+1);
  });
  return issues;
}
function comparisonIssues(plan:CarouselPlan,pair:{first:string;second:string}):SlideCopyIssue[] {
  const [ka,kb]=comparedKeys(pair);
  const both=(text:string)=>text.replace(/\s+/g,"").includes(ka)&&text.replace(/\s+/g,"").includes(kb);
  const issues:SlideCopyIssue[]=[];
  const last=plan.slides.length-1;
  plan.slides.forEach((slide,i)=>{
    if(i===0)return;
    const n=i+1,text=[slide.headline,...slide.points].join(" ");
    if(i<last&&!both(text)&&!SAYS_SHARED.test(text))issues.push({slide:n,field:"headline",message:`비교 장인데 '${ka}'와(과) '${kb}'를 함께 말하지 않아요. 이 장의 비교 기준 하나를 정해 "${josa(ka,"은","는")} ~, ${josa(kb,"은","는")} ~"처럼 양쪽이 각각 어떤지 쓰세요(둘 다 같은 점이면 "둘 다 ~"라고 밝히세요).`});
    for(const [field,line] of [["headline",slide.headline],...slide.points.map(point=>["points",point] as const)] as const){
      if(SAYS_DIFFERENT.test(line)&&!both(line))issues.push({slide:n,field,message:`'${line.trim()}'은(는) 다르다고만 말해요. ${josa(ka,"은","는")} 어떻고 ${josa(kb,"은","는")} 어떤지 구체적으로 쓰세요. 확실히 모르는 제조 정보면 맛·색·탄산처럼 직접 확인되는 차이로 바꾸세요.`});
    }
    if(i===last&&!both(text))issues.push({slide:n,field:"headline",message:`결론 장이에요. 가장 큰 차이 하나를 '${ka}'와(과) '${kb}' 두 이름과 함께 한 문장으로 말하세요(예: "${josa(ka,"은","는")} ~, ${josa(kb,"은","는")} ~").`});
  });
  return issues;
}

// 원인을 말하는 말: 이유를 잇는 말(때문·덕분·라서·어서…)이나 원리를 가리키는 낱말(성분·온도·조리·감각).
// 원인 이름 목록은 explain.ts의 NAMES_CAUSE를 쓴다(올릴 글 검사와 같은 기준).

// 표지가 묻는 것: 제목과 부제를 함께 본다. 단정형 표지("홍어는 썩은 게 아니라 삭은 거예요")는 질문을 부제("왜 안 상할까요?")에 둔다(HOOK_RULE).
const coverQuestion=(plan:CarouselPlan)=>[plan.slides[0]?.headline??"",plan.slides[0]?.subline??""].join(" ").trim();

// 표지 후킹 검사(HOOK_RULE): 과장, 도전형 말투, 막연한 질문, 질문이 없는 단정형 표지.
// 표지 다시 쓰기(copyPolish.ts)도 같은 기준으로 후보를 거른다.
// bodyHeadlines(본문 장 제목)을 주면 표지가 답(원인 성분 이름)을 먼저 말하는지도 본다.
export function coverHookProblems(slide:{headline:string;subline?:string},track?:CarouselTrack,bodyHeadlines:readonly string[]=[]):string[] {
  return coverHookIssues(slide,track,bodyHeadlines).map(issue=>issue.message);
}
function coverHookIssues(slide:{headline:string;subline?:string},track?:CarouselTrack,bodyHeadlines:readonly string[]=[]):SlideCopyIssue[] {
  const issues:SlideCopyIssue[]=[];
  const add=(message:string)=>issues.push({slide:1,field:"headline",message});
  const text=`${slide.headline} ${slide.subline??""}`;
  const hype=text.match(HOOK_HYPE);
  if(hype)add(`표지에 '${hype[0]}' 같은 과장 말이 있어요. 의외의 사실이나 공감 장면으로 궁금하게 만드세요.`);
  const dare=text.match(HOOK_DARE);
  if(dare)add(`표지가 독자를 시험하는 도전형 말투('${dare[0]}')예요. 광고처럼 읽히니, 의외의 사실이나 공감 장면으로 바꾸세요.`);
  const vague=slide.headline.match(VAGUE_COVER);
  if(vague)add(`표지 질문이 막연해요('${vague[0]}'). 답에 원리가 필요한 '왜' 질문이나 의외의 사실로 바꾸세요.`);
  // 음식의 이름난 특징을 그대로 묻는 표지("애탕은 왜 진할까?")는 "원래 그래서"로 끝난다. 예상을 뒤집는 대비를 넣게 한다.
  else if(obviousQuestion(slide.headline))add("표지 질문의 답이 뻔해요(원래 그런 음식이라서 끝나요). 독자의 예상을 뒤집는 대비나 의외의 사실로 바꾸세요(예: \"맑은 생선탕과 달리 애탕은 왜 묵직할까?\", \"홍어 뼈는 왜 씹어 먹을 수 있을까?\").");
  // 결과물 점검 7회: 표지가 답(원인 성분)을 먼저 말하거나("…암모니아 때문이죠") "비밀을 알아봐요"처럼 무엇이 궁금한지 말하지 않으면 후킹 2점이었다.
  const spoiler=coverSpoiler(text,bodyHeadlines);
  if(spoiler)add(`표지가 답('${spoiler}')을 먼저 말해요. 원인 이름은 본문에서 밝히고, 표지는 흔한 오해를 뒤집거나 의외의 장면으로 궁금하게 만드세요(예: "홍어회는 썩은 게 아니라 삭히는 거라고?").`);
  // 오해를 사실처럼 묻는 표지(2026-10-20): "과메기는 냉동실에서도 만들 수 있다고?"는 뒤집는 건지 맞다는 건지 헷갈린다.
  const asserted=mythAssertedBy(slide.headline);
  if(asserted)add(`표지가 오해('${asserted.myth}')를 사실처럼 물어요. 오해가 틀렸다는 쪽이 드러나게 쓰세요${asserted.hook?`(예: "${asserted.hook}")`:""}.`);
  if(yesNoCover(slide.headline))add("표지가 예/아니오로 답하는 질문이에요. \"왜\"를 묻거나 오해를 뒤집은 사실(\"~가 아니라 ~라고?\")이나 구체적 대조(\"A는 ~한데 B는 왜 ~?\")로 바꾸세요.");
  const tease=text.match(SECRET_TEASE);
  if(tease)add(`'${tease[0]}'처럼 무엇이 궁금한지 말하지 않는 표지 말이에요. 독자가 믿던 것과 다른 사실 하나를 구체적으로 보여 주세요.`);
  // 단정형 표지는 본문이 답할 질문을 부제에 둔다(부제의 "이유 N가지"는 앱이 붙이므로 그 앞부분을 본다).
  const statement=!/[?？]\s*$/.test(slide.headline.trim());
  const subline=(slide.subline??"").replace(/·?\s*이유\s*\d+\s*가지/,"");
  if(track&&statement&&!/[?？]|왜/.test(subline))add("단정형 표지예요. 부제에 '왜 그럴까요?'처럼 본문이 답할 질문을 쓰세요.");
  return issues;
}

export function slideCopyIssues(plan:CarouselPlan,track?:CarouselTrack,storeNotes=""):SlideCopyIssue[] {
  const limits=copyLimitsOf(track);
  const issues:SlideCopyIssue[]=[];
  const add=(slide:number,field:SlideCopyIssue["field"],message:string)=>issues.push({slide,field,message});
  const allPoints:Array<{slide:number;text:string}>=[];
  // 표지 질문에 붙은 상황·때(비 오는 날·찬바람…)를 본문 어느 장도 설명하지 않으면, 첫 이유 장에서 그 연결을 설명하게 한다.
  if(track&&plan.slides.length>2){
    const cover=coverQuestion(plan);
    const body=plan.slides.slice(1).map(slide=>[slide.headline,...slide.points].join(" ")).join(" ");
    const missed=QUESTION_CONDITIONS.find(condition=>condition.asked.test(cover)&&!condition.answered.test(body));
    if(missed)issues.push({slide:2,field:"headline",message:`표지가 '${missed.label}'에 왜 이 음식이 생각나는지 묻는데, 본문 어느 장도 ${missed.label}과(와) 음식의 연결을 설명하지 않아요. 첫 이유 장은 그 상황과 음식이 왜 이어지는지로 쓰세요.`});
  }
  // 비교 질문("치즈는 익숙한데 다른 발효 음식은 왜 낯설까?")인데 본문이 비교 대상(치즈)을 다시 꺼내지 않으면, 무엇과 무엇이 다른지 답하지 못한다.
  const pair=plan.slides.length>2?comparedPair(plan.slides[0].headline):undefined;
  if(pair&&track){
    const body=plan.slides.slice(1).map(slide=>[slide.headline,...slide.points].join(" ")).join(" ");
    // 본문은 "무침은 ~"처럼 줄여 쓰기도 해서 두 이름이 함께 가진 앞·뒤를 뗀 이름(comparedKeys)으로도 찾는다.
    if(!body.includes(pair.first)&&!body.replace(/\s+/g,"").includes(comparedKeys(pair)[0]))issues.push({slide:2,field:"headline",message:`표지가 '${pair.first}'와(과) '${pair.second}'를 견주는데, 본문 어느 장도 '${pair.first}'를 다시 꺼내지 않아요. 이유 장마다 두 대상을 나란히 놓고 무엇이 다른지 쓰세요.`});
  }
  // 두 대상의 차이를 묻는 비교 질문(COMPARISON_RULE): 이유 장마다 양쪽이 각각 어떤지, "다르다"만 하는 문장 없이, 결론은 양쪽 이름과 함께.
  // B가 "다른 발효 음식"처럼 넓은 말이면 본문은 가게 메뉴를 대표로 쓰므로 이 검사는 하지 않는다(위 검사만).
  if(pair&&!/^다른/.test(pair.second))issues.push(...comparisonIssues(plan,pair));
  if(track)issues.push(...repeatedCauseIssues(plan));
  if(plan.slides[0]?.role==="cover")issues.push(...coverHookIssues(plan.slides[0],track,plan.slides.slice(1).map(slide=>slide.headline)));
  plan.slides.forEach((slide,i)=>{
    const n=i+1,headline=slide.headline.trim();
    const length=headline.replace(/\s/g,"").length;
    // 표지는 짧고 굵은 제목도 괜찮아서 4자, 본문 장은 6자를 최소로 본다.
    if(length<(slide.role==="cover"?4:6))add(n,"headline","제목이 너무 짧아요. 무엇에 대한 장인지 알 수 있게 쓰세요.");
    // 비교 게시물의 글 중심 제목은 두 이름이 들어가야 해서 한 줄(14자)에 안 들어간다. 카드가 두 줄(28자)까지 그리니 그만큼 허용한다
    // (2026-10-20 점검: 14자에 맞추려다 "맑은은 맑고 홍어애탕은 묵직해요"처럼 반쪽 이름이 나왔다).
    const max=slide.role==="cover"?limits.coverHeadline:pair&&track==="text"?TRACK_FIT.text.headline:limits.headline;
    // 결론 장이 길면 대개 이유를 다시 붙인 것이라, 답만 남기라고 콕 집어 말한다(넘치면 카드에서 "…"로 잘린다).
    if(headline.length>max)add(n,"headline",track&&i===plan.slides.length-1&&i>0?`결론 장 제목이 ${max}자를 넘어요. 앞 장의 이유는 빼고 표지 질문에 대한 답만 한 문장으로 짧게 쓰세요.`:`제목이 ${max}자를 넘어요. 한 가지 정보만 남겨 줄이세요.`);
    for(const word of CLICHES)if(headline.includes(word))add(n,"headline",`광고 상투어 '${word}'를 빼고 구체적인 정보로 바꾸세요.`);
    if(SLOGAN.test(headline))add(n,"headline","명사로 끝나는 슬로건 대신 해요체 문장이나 질문으로 쓰세요.");
    if((headline.match(/!/g)??[]).length>1)add(n,"headline","느낌표를 줄이세요.");
    // 갈래 게시물은 질문을 표지에서만 던진다. 본문 장 제목이 "왜 ~일까요?"면 짧은 글 한 줄로는 결과만 되풀이하기 쉽다(실제 사례:
    // "왜 물기가 생기지 않을까요?" + "물기가 없어 오래 보관해도 맛이 유지돼요"). 답을 제목으로, 이유·확인 방법을 짧은 글로 쓰게 한다.
    if(track&&slide.role!=="cover"&&/[?？]$/.test(headline))add(n,"headline","본문 장 제목은 질문 대신 이 장이 알려 주는 답(핵심 사실)을 해요체 문장으로 쓰고, 짧은 글에는 그 이유나 확인하는 방법을 쓰세요.");
    // 표지 제목·부제의 광고 말(일반 사용자 비판 C1: "빗소리와 함께 찾아오는 고소한 유혹"은 광고처럼 읽혀 넘기지 않는다).
    if(track&&slide.role==="cover"){
      const ad=`${headline} ${slide.subline??""}`.match(COVER_AD_WORDS);
      if(ad)add(n,"headline",`표지에 '${ad[0]}' 같은 광고 말이 있어요. 부제는 결론을 밝히지 말고 궁금증을 키우는 한 줄로 쓰세요(예: "알고 보면 소리 이야기예요").`);
    }
    // 갈래 게시물 카드는 궁금증을 푸는 이야기만 담는다. 가게 홍보는 맨 뒤 홍보 카드와 캡션 끝 한 줄이 맡는다
    // (사장님 요청 2026-10-09: 장마다 "묵동홍어마을로 오세요"가 나오면 사람도 알고리즘도 광고로 보고 넘긴다).
    if(track){
      if(PROMO_IN_CARD.test(headline))add(n,"headline","카드 제목에 가게 이름·방문 권유가 있어요. 홍보는 맨 뒤 홍보 카드가 맡으니, 표지 질문의 이유를 말하는 제목으로 바꾸세요.");
      // 결론 장도 마찬가지(2026-10-20: 맺음말 "~을 묵동홍어마을에서 즐겨 보세요"를 결론 장에서 뺐다).
      for(const point of slide.points)if(PROMO_IN_CARD.test(point))add(n,"points",`요점 '${point.trim()}'에 가게 이름·방문 권유가 있어요. 제목을 뒷받침하는 이유나 원리로 바꾸세요.`);
    }
    // 결론 장: 표지 질문의 핵심 말(음식 이름)을 다시 짚어야 질문 → 답이 한눈에 이어진다(맥락 잇기).
    if(track&&i===plan.slides.length-1&&i>0){
      const asked=menuOf(plan.slides[0]?.headline??"");
      if(asked.length&&!menuOf(headline).some(item=>asked.some(other=>other.id===item.id)))add(n,"headline",`마지막 장은 결론이에요. 표지 질문의 '${asked[0].short}'을(를) 다시 써서 질문에 대한 답을 한 문장으로 분명하게 말하세요.`);
      // 점검 7~10회 평가: "마지막 장이 표지 질문에 명확히 답하지 않음"("따뜻한 홍어찜이 제맛이에요"). 결론은 가장 큰 이유(원인 이름)를 넣어 답한다.
      // 비교 게시물의 결론은 두 대상의 차이를 말하는 규칙(comparisonIssues)이 따로 본다.
      else if(!pair&&ASKS_WHY.test(coverQuestion(plan))&&!NAMES_CAUSE.test([headline,...slide.points].join(" ")))add(n,"headline","마지막 장은 표지 질문의 답이에요. 가장 큰 이유(원인 이름)를 넣어 한 문장으로 답하세요(예: \"홍어회는 콜라겐 덕에 쫀득해요\").");
    }
    if(track&&slide.role!=="cover"){
      const cover=coverQuestion(plan);
      if(ASKS_WHY.test(cover)&&HOW_TO.test(headline)&&!GIVES_REASON.test(headline))add(n,"headline",`표지가 "${cover.trim()}"라고 이유를 묻는데 이 장 제목은 먹는 법이에요. 제목만 이어 읽어도 흐름이 이어지게 표지 질문의 이유(근거) 하나를 답하는 제목으로 바꾸세요.`);
      // 표지가 "왜"를 묻는데 본문 제목이 표지에 없는 곁들임을 꺼내면 흐름이 끊긴다(5장 구성의 4번째 장이 늘 pairing 자리라 잘 생긴다).
      const sideTurn=ASKS_WHY.test(cover)?SIDE_SUBJECTS.find(word=>headline.includes(word)&&!cover.includes(word)):undefined;
      if(sideTurn)add(n,"headline",`표지가 "${cover.trim()}"라고 묻는데 이 장 제목은 표지에 없는 '${sideTurn}' 이야기예요. 표지 질문의 이유 하나를 답하는 제목으로 바꾸세요.`);
      // "왜 낯설까?"를 묻는데 맛있는 이유(감칠맛·고소함·곁들임이 덜어 줌)를 말하면 질문의 술어를 놓친 것이다(결론 장은 해결을 말해도 된다).
      if(ASKS_UNFAMILIAR.test(cover)&&i<plan.slides.length-1&&praisesInsteadOfExplaining(headline))add(n,"headline",`표지는 왜 낯선지(어려운지)를 묻는데 이 장 제목은 음식의 장점을 말해요. 왜 낯설게 느껴지는지(향을 느끼는 경로, 접해 본 경험, 익숙한 맛과의 차이) 하나를 답하는 제목으로 바꾸세요.`);
      if(VAGUE_REASON.test(headline))add(n,"headline","'조화롭게 잡아줘요'·'정돈해줘요'처럼 결과만 말하는 막연한 제목이에요. 무엇이 무엇을 어떻게 바꾸는지(이유) 쓰세요.");
      // 결과물 점검(2026-10-12): "해물라면은 시원하고, 홍어라면은 깊어요"처럼 이유 장이 결과(맛·느낌)만 말하고 원인이 없었다(이유 깊이 3.0/5).
      // 결론 장이 아닌 이유 장의 제목·짧은 글 어디에도 원인을 말하는 말이 없으면 다시 쓰게 한다.
      else if(i<plan.slides.length-1&&!NAMES_CAUSE.test([headline,...slide.points].join(" ")))add(n,"headline","이 장은 결과(맛·느낌)만 말해요. 무엇이 그렇게 만드는지 원인이 되는 것의 이름(성분·구조·온도·조리 과정·감각 기관·풍습)을 제목이나 짧은 글에 함께 쓰세요. '~해서 맛있어요'처럼 이어 주는 말만으로는 이유가 아니에요(예: \"삭히는 동안 요소가 암모니아로 바뀌어요\").");
      for(const point of slide.points)if(VAGUE_REASON.test(point))add(n,"points",`요점 '${point.trim()}'이 결과만 말하고 이유가 없어요. 무엇이 어떻게 작용하는지 쓰세요.`);
      // 글 품질(2026-10-20): 짧은 글이 제목을 말만 바꿔 되풀이하면 그 장은 정보가 하나뿐이다(평가 10개 중 6개). 원인 한 줄로 다시 쓰게 한다.
      if(copiesExemplar(headline)||slide.points.some(copiesExemplar))add(n,"headline","안내의 예시 문장을 그대로 썼어요. 이번 주제의 장면과 원인으로 새로 쓰세요.");
      // 비교 제목의 반쪽 이름("맑은은 ~"): 꾸밈말에 조사만 붙은 이름.
      if(pair&&/(?:^|\s)(?:맑은|진한|삭힌|생|찬|뜨거운|기름진)[은는이가]\s/.test(headline))add(n,"headline","'맑은은'처럼 꾸밈말만 남긴 반쪽 이름이에요. 비교 대상 이름을 알아볼 수 있게 쓰세요(예: '생선탕은 ~, 홍어애탕은 ~').");
      for(const point of slide.points)if(restatesHeadline(headline,point))add(n,"points",`요점 '${point.trim()}'이 제목을 되풀이해요. 제목이 말하는 현상의 원인(무엇이 어떻게 해서)을 한 줄로 쓰세요.`);
      // 이유 장에 감각 말이 하나도 없으면 설명문처럼 읽힌다. 독자가 겪는 장면으로 제목을 다시 쓰게 한다.
      if(i<plan.slides.length-1&&!hasSenseWord([headline,...slide.points].join(" ")))add(n,"headline","이 장에는 독자가 느끼는 말(톡 쏘는·쫀득·김이 오르는·새콤·아삭 같은 식감·감각 말)이 없어요. 제목을 독자가 먹을 때 겪는 장면으로 쓰세요.");
      // 표지가 "왜"를 묻는데 요점이 먹는 법이면 제목과 따로 논다(사장님 지적 2026-10-10: 제목 "지방층이 묵은지의 산미를 감싸요" 아래
      // "홍어 한 점을 묵은지에 살짝 감싸요"). 먹는 법은 속 글(notes)·올릴 글로 보내고, 요점은 제목의 이유·근거로 쓴다.
      for(const point of slide.points)if(ASKS_WHY.test(cover)&&HOW_TO.test(point)&&!GIVES_REASON.test(point)&&i<plan.slides.length-1)add(n,"points",`요점 '${point.trim()}'은 먹는 법이라 제목과 따로 놀아요. 제목을 뒷받침하는 이유·근거로 바꾸세요.`);
      for(const point of slide.points){
        const fresh=SIDE_SUBJECTS.find(word=>point.includes(word)&&!headline.includes(word)&&!cover.includes(word));
        if(fresh)add(n,"points",`요점 '${point.trim()}'이 제목·표지에 없는 '${fresh}' 이야기를 꺼내요. 이 장 제목을 뒷받침하는 내용만 쓰세요.`);
      }
    }
    // 카드는 게시 뒤 고칠 수 없으니 확인 안 된 사실·보장·가게 제공 단정을 검수 단계에서 먼저 고치게 한다.
    const claim=(text:string)=>{const result=checkTextClaims(text,{storeNotes});return [...result.blocked,...result.verify,...servingClaimIssues(text)];};
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

export type ReviewContext={menu?:StoreMenuItem;photoNotes?:readonly string[];contentBrief?:string;track?:CarouselTrack;storeNotes?:string};

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
${QUESTION_FOCUS_RULE}
${EXPLAIN_REASONS_RULE}`:"눈이나 입으로 확인할 수 있는 관찰(색, 결, 식감, 먹는 순서)이나 널리 알려진 이유로 쓰세요."}
5. 확인되지 않은 가격·원산지·영업시간·숙성 기간·건강 효능, 향이 사라진다거나 누구나 좋아한다는 보장은 쓰지 마세요.${comparisonPairRule(topic,context.contentBrief)?`\n${comparisonPairRule(topic,context.contentBrief)}`:""}${principleNotesRule(topic,context.contentBrief)?`
${principleNotesRule(topic,context.contentBrief)}`:""}${context.storeNotes?.trim()?`
${storeNotesRule(context.storeNotes)}`:""}
6. 문제가 없는 장은 그대로 두세요. 장 수, 장 순서, 장마다 요점 개수(표지는 빈 배열)는 바꾸지 마세요. 표지의 points는 빈 배열입니다.

${context.track?`[제목만 이어 읽기]
${plan.slides.map((slide,i)=>`${i+1}. ${slide.headline}`).join("\n")}

`:""}[현재 문안]
${JSON.stringify(slides)}

출력: {"slides":[{"headline":"...","points":["..."]}, ...]} 형식으로 모든 장을 순서대로.`;
}

export type ReviewResult={plan:CarouselPlan;applied:boolean;before:number;after:number};

// AI 검수를 적용한다. 형식이 다르거나(장 수·요점 수) 금지 표현이 새로 생기면 그 답을 버린다.
// 예전에는 검수 결과 전체가 원래보다 문제가 많으면 통째로 버려서, 한 장만 나빠져도 잘 고친 다른 장(예: 갑자기 나온 막걸리 장)까지
// 원래대로 남았다(사장님 지적 2026-10-10). 이제는 장마다 비교해 문제가 줄어든 장만 받고, 남은 문제가 있으면 한 번 더 검수한다.
// 자동 검사에서 문제가 하나도 없으면 AI를 다시 부르지 않는다(무료 한도를 아끼고, 멀쩡한 문안을 괜히 바꾸지 않게).
const REVIEW_ROUNDS=2;
const issuesOn=(plan:CarouselPlan,track:CarouselTrack|undefined,slide:number,storeNotes="")=>slideCopyIssues(plan,track,storeNotes).filter(issue=>issue.slide===slide).length;
export async function reviewCarouselPlan(plan:CarouselPlan,topic:string,ai:{review:(prompt:string,schema:ReturnType<typeof reviewSchema>)=>Promise<PlanReview>},context:ReviewContext={}):Promise<ReviewResult> {
  const before=slideCopyIssues(plan,context.track,context.storeNotes).length;
  if(!before)return {plan,applied:false,before:0,after:0};
  let current=plan,count=before;
  for(let round=0;round<REVIEW_ROUNDS&&count>0;round++){
    const next=await reviewRound(current,topic,ai,context);
    if(!next)break;
    const after=slideCopyIssues(next,context.track,context.storeNotes).length;
    if(after>=count)break;
    current=next;count=after;
  }
  return current===plan?{plan,applied:false,before,after:before}:{plan:current,applied:true,before,after:count};
}

// 검수 한 번: AI 답을 받아, 장마다 문제가 줄어든 장만 바꾼 구성안을 돌려준다. 받을 장이 없거나 답이 잘못됐으면 undefined.
async function reviewRound(plan:CarouselPlan,topic:string,ai:{review:(prompt:string,schema:ReturnType<typeof reviewSchema>)=>Promise<PlanReview>},context:ReviewContext):Promise<CarouselPlan|undefined> {
  const issues=slideCopyIssues(plan,context.track,context.storeNotes);
  try{
    const schema=reviewSchema(plan.slides.length);
    const reviewed=schema.parse(await ai.review(buildPlanReviewPrompt(plan,topic,issues,context),schema));
    const minPoints=copyLimitsOf(context.track).minPoints;
    const sameShape=reviewed.slides.every((slide,i)=>slide.points.length===plan.slides[i].points.length||(plan.slides[i].role!=="cover"&&slide.points.length>=minPoints));
    if(!sameShape)return undefined;
    const candidate:CarouselPlan={...plan,slides:plan.slides.map((slide,i)=>({...slide,headline:reviewed.slides[i].headline,points:slide.role==="cover"?[]:reviewed.slides[i].points}))};
    const blocked=(slide:CarouselPlan["slides"][number])=>[slide.headline,...slide.points].some(text=>checkTextClaims(text,{storeNotes:context.storeNotes}).blocked.length>0);
    // 장마다: 검수한 장의 문제 수가 원래 장보다 적으면 받는다. 장끼리 겹침 검사가 있어 받은 뒤 전체를 다시 센다(호출한 쪽).
    const slides=plan.slides.map((slide,i)=>{
      const fixed=candidate.slides[i];
      if(blocked(fixed))return slide;
      return issuesOn(candidate,context.track,i+1,context.storeNotes)<issuesOn(plan,context.track,i+1,context.storeNotes)?fixed:slide;
    });
    return slides.some((slide,i)=>slide!==plan.slides[i])?{...plan,slides}:undefined;
  }catch{
    return undefined;
  }
}
