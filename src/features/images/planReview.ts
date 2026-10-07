import { z } from "zod";
import { josa, mainMenuOf, type StoreMenuItem } from "@/features/store/menu";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, type CarouselPlan } from "./carousel";
import { checkTextClaims, servingClaimIssues } from "@/features/guard/service";

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

export function slideCopyIssues(plan:CarouselPlan):SlideCopyIssue[] {
  const issues:SlideCopyIssue[]=[];
  const add=(slide:number,field:SlideCopyIssue["field"],message:string)=>issues.push({slide,field,message});
  const allPoints:Array<{slide:number;text:string}>=[];
  plan.slides.forEach((slide,i)=>{
    const n=i+1,headline=slide.headline.trim();
    const length=headline.replace(/\s/g,"").length;
    // 표지는 짧고 굵은 제목도 괜찮아서 4자, 본문 장은 6자를 최소로 본다.
    if(length<(slide.role==="cover"?4:6))add(n,"headline","제목이 너무 짧아요. 무엇에 대한 장인지 알 수 있게 쓰세요.");
    if(headline.length>30)add(n,"headline","제목이 30자를 넘어요. 한 가지 정보만 남겨 줄이세요.");
    for(const word of CLICHES)if(headline.includes(word))add(n,"headline",`광고 상투어 '${word}'를 빼고 구체적인 정보로 바꾸세요.`);
    if(SLOGAN.test(headline))add(n,"headline","명사로 끝나는 슬로건 대신 해요체 문장이나 질문으로 쓰세요.");
    if((headline.match(/!/g)??[]).length>1)add(n,"headline","느낌표를 줄이세요.");
    // 카드는 게시 뒤 고칠 수 없으니 확인 안 된 사실·보장·가게 제공 단정을 검수 단계에서 먼저 고치게 한다.
    const claim=(text:string)=>{const result=checkTextClaims(text);return [...result.blocked,...result.verify,...servingClaimIssues(text)];};
    for(const message of claim(headline))add(n,"headline",`제목: ${message} 확인된 정보 없이 쓸 수 있는 말로 바꾸세요.`);
    for(const point of slide.points)for(const message of claim(point))add(n,"points",`요점 '${point.trim()}': ${message} 빼거나 바꾸세요.`);
    for(const point of slide.points){
      const text=point.trim();
      for(const word of CLICHES)if(text.includes(word))add(n,"points",`요점 '${text}'의 광고 상투어 '${word}'를 빼세요.`);
      if(!/[요까다?]$/.test(text.replace(/[.!]$/,"")))add(n,"points",`요점 '${text}'을 해요체 완결 문장으로 끝내세요.`);
      if(similarity(text,headline)>.6)add(n,"points",`요점 '${text}'이 제목을 되풀이해요. 새로운 정보를 쓰세요.`);
      allPoints.push({slide:n,text});
    }
    // 표지가 아닌 장의 요점은 2개 이상이어야 카드가 비어 보이지 않는다.
    if(slide.role!=="cover"&&slide.points.length<2)add(n,"points","요점을 2~4개로 채우세요.");
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

export type ReviewContext={menu?:StoreMenuItem;photoNotes?:readonly string[];contentBrief?:string};

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
1. 각 장은 앞 장이 남긴 궁금증에 답하고 다음 장으로 이어집니다. 장끼리 같은 말이나 같은 정보를 반복하지 마세요.
2. 제목은 12~30자의 해요체 문장이나 질문 하나, 요점은 12~28자의 해요체 완결 문장입니다. 명사로 끝나는 슬로건, 광고 상투어, 느낌표 남발은 쓰지 마세요.
3. ${heroLine(topic,context.menu??mainMenuOf(topic))}
4. "입안의 리듬" 같은 추상적 비유 대신 눈이나 입으로 확인할 수 있는 구체적 관찰(색, 결, 식감, 먹는 순서)로 쓰세요.
5. 확인되지 않은 가격·원산지·영업시간·숙성 기간·건강 효능, 향이 사라진다거나 누구나 좋아한다는 보장은 쓰지 마세요.
6. 문제가 없는 장은 그대로 두세요. 장 수, 장 순서, 장마다 요점 개수(표지는 빈 배열)는 바꾸지 마세요. 표지의 points는 빈 배열입니다.

[현재 문안]
${JSON.stringify(slides)}

출력: {"slides":[{"headline":"...","points":["..."]}, ...]} 형식으로 모든 장을 순서대로.`;
}

export type ReviewResult={plan:CarouselPlan;applied:boolean;before:number;after:number};

// AI 검수를 적용한다. 형식이 다르거나(장 수·요점 수), 문제 수가 늘거나, 금지 표현이 새로 생기면 원래 구성안을 쓴다.
// 자동 검사에서 문제가 하나도 없으면 AI를 다시 부르지 않는다(무료 한도를 아끼고, 멀쩡한 문안을 괜히 바꾸지 않게).
export async function reviewCarouselPlan(plan:CarouselPlan,topic:string,ai:{review:(prompt:string,schema:ReturnType<typeof reviewSchema>)=>Promise<PlanReview>},context:ReviewContext={}):Promise<ReviewResult> {
  const issues=slideCopyIssues(plan);
  const before=issues.length;
  if(!before)return {plan,applied:false,before:0,after:0};
  try{
    const schema=reviewSchema(plan.slides.length);
    const reviewed=schema.parse(await ai.review(buildPlanReviewPrompt(plan,topic,issues,context),schema));
    const sameShape=reviewed.slides.every((slide,i)=>slide.points.length===plan.slides[i].points.length||(plan.slides[i].role!=="cover"&&slide.points.length>=2));
    if(!sameShape)return {plan,applied:false,before,after:before};
    const next:CarouselPlan={...plan,slides:plan.slides.map((slide,i)=>({...slide,headline:reviewed.slides[i].headline,points:slide.role==="cover"?[]:reviewed.slides[i].points}))};
    const after=slideCopyIssues(next).length;
    const blocked=next.slides.some(slide=>[slide.headline,...slide.points].some(text=>checkTextClaims(text).blocked.length>0));
    if(blocked||after>before)return {plan,applied:false,before,after:before};
    return {plan:next,applied:true,before,after};
  }catch{
    return {plan,applied:false,before,after:before};
  }
}
