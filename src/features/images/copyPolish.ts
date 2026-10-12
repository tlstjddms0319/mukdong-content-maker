import { z } from "zod";
import type { CarouselPlan } from "./carousel";
import { TRACK_COPY, type CarouselTrack } from "./track";
import { coverHookProblems } from "./planReview";
import { HOOK_RULE, comparedKeys, comparedPair } from "@/features/copy/explain";
import { menuOf } from "@/features/store/menu";

// 검수 뒤 마지막 다듬기(결과물 점검 2026-10-12, Gemini 글·게시물 6개):
// - 후킹 2.3/5, 뻔한 질문 4/6: 표지가 거의 늘 "찬바람 불 때 OO는 왜 ~할까?" 틀이었다. 후킹 규칙(HOOK_RULE)에 오해 깨기·의외의 정체를
//   넣었지만 구성안 AI는 주제 제목을 그대로 표지에 썼다. 표지만 따로, 유형이 다른 후보 3개를 받아 같은 검사(coverHookProblems)로 고른다.
// - 검수 뒤에도 제목 길이 초과 24건: 검수 AI는 "18자를 넘어요"만 듣고는 줄이지 못했고, 남은 제목은 카드에서 기계적으로 잘렸다.
//   넘친 제목만 모아 "지금 N자 → M자 이내"로 다시 쓰게 하고, 맞게 줄인 것만 받는다(나머지는 예전처럼 앱이 자른다).
// 둘 다 실패해도(키·한도·형식) 원래 구성안을 그대로 쓴다.
export type PolishAi={generate(prompt:string,schema:z.ZodTypeAny):Promise<unknown>};
type Slide=CarouselPlan["slides"][number];

const limitOf=(track:CarouselTrack,index:number)=>index===0?TRACK_COPY.cover.headline:TRACK_COPY[track].headline;

export function overLongHeadlines(plan:CarouselPlan,track:CarouselTrack):Array<{slide:number;text:string;length:number;max:number}> {
  return plan.slides.flatMap((slide,i)=>{
    const max=limitOf(track,i),length=slide.headline.trim().length;
    return length>max?[{slide:i+1,text:slide.headline.trim(),length,max}]:[];
  });
}

const ShortenSchema=z.object({items:z.array(z.object({slide:z.number().int(),headline:z.string()})).max(12)});
export async function shortenHeadlines(plan:CarouselPlan,track:CarouselTrack,ai:PolishAi):Promise<{plan:CarouselPlan;shortened:number}> {
  const long=overLongHeadlines(plan,track);
  if(!long.length)return {plan,shortened:0};
  const lines=long.map(item=>`- ${item.slide}장: "${item.text}" (지금 ${item.length}자 → ${item.max}자 이내)`).join("\n");
  const prompt=`Instagram 카드뉴스 제목 가운데 카드에 들어가지 않는 것들입니다. 각 제목을 띄어쓰기 포함 목표 글자 수 이내로 다시 쓰세요.
- 뜻(무엇이 무엇을 어떻게 바꾸는지, 비교라면 두 대상)과 해요체는 그대로 두고, 꾸미는 말·되풀이·덜 중요한 마디를 덜어 내세요.
- 말을 중간에서 자르거나 "…"를 쓰지 말고, 완결된 한 문장으로 쓰세요. 새 사실을 더하지 마세요.
- 글자 수를 직접 세어 확인하세요.
${lines}
JSON으로만 답하세요: {"items":[{"slide":장 번호,"headline":"줄인 제목"}]}`;
  const result=ShortenSchema.parse(await ai.generate(prompt,ShortenSchema));
  let shortened=0;
  const slides=plan.slides.map((slide,i)=>{
    const target=long.find(item=>item.slide===i+1);
    const next=result.items.find(item=>item.slide===i+1)?.headline.trim();
    if(!target||!next||next.length>target.max||/…|\.\.\./.test(next))return slide;
    shortened++;
    return {...slide,headline:next};
  });
  return {plan:{...plan,slides},shortened};
}

const CoverSchema=z.object({
  best:z.number().int().min(0).max(3),
  options:z.array(z.object({type:z.string(),headline:z.string(),subline:z.string().default("")})).min(1).max(4),
});
// 표지 후보가 지켜야 할 것: 글자 수, 후킹 검사(과장·도전형·막연함·질문 없는 단정형), 원래 표지의 음식 이름, 비교라면 두 이름.
function coverProblem(option:{headline:string;subline:string},original:Slide,track:CarouselTrack,topic=""):string|undefined {
  const headline=option.headline.trim(),subline=option.subline.trim();
  if(!headline||headline.length>TRACK_COPY.cover.headline)return "length";
  if(subline.length>TRACK_COPY.cover.subline)return "subline-length";
  if(coverHookProblems({headline,subline},track).length)return "hook";
  const before=`${original.headline} ${original.subline??""}`,after=`${headline} ${subline}`;
  // 원래 표지나 주제에 나온 음식 이름을 새 표지도 말해야 한다(예전에는 "열이 식감과 향을 어떻게 바꿀까?"처럼 대상이 빠졌다).
  const menus=menuOf(`${before} ${topic}`).filter((item,i,all)=>item.category!=="술"&&all.findIndex(other=>other.id===item.id)===i).slice(0,2);
  if(menus.some(menu=>!menuOf(after).some(item=>item.id===menu.id)))return "menu";
  const pair=comparedPair(original.headline);
  if(pair){
    const [a,b]=comparedKeys(pair),compact=after.replace(/\s+/g,"");
    if(!compact.includes(a)||!compact.includes(b))return "pair";
  }
  return undefined;
}

export async function rewriteCover(plan:CarouselPlan,track:CarouselTrack,ai:PolishAi,topic=""):Promise<{plan:CarouselPlan;changed:boolean;hookType?:string}> {
  const cover=plan.slides[0];
  if(!cover||cover.role!=="cover")return {plan,changed:false};
  const body=plan.slides.slice(1).map((slide,i)=>`${i+2}장: ${slide.headline}`).join("\n");
  const prompt=`Instagram 카드뉴스의 표지(첫 장)를 다시 씁니다. 지금 표지는 평범해서 스크롤을 멈추게 하지 못합니다.
${HOOK_RULE}
게시물 주제: "${topic||cover.headline}"
지금 표지: 제목 "${cover.headline}"${cover.subline?`, 부제 "${cover.subline}"`:""}
본문 장 제목(표지가 약속할 답의 내용):
${body}
서로 다른 후킹 유형(오해 깨기, 의외의 정체, 공감 장면, 대조 가운데)으로 표지 후보 3개를 쓰고, 가장 강한 후보의 번호(0부터)를 best에 적으세요.
- headline: 띄어쓰기 포함 ${TRACK_COPY.cover.headline}자 이내. 물음표 질문이거나, 본문에 있는 의외의 사실을 단정하는 한 문장. 주제·지금 표지의 음식 이름을 그대로 넣으세요(두 대상을 견주는 표지면 두 이름 모두).
- subline: 띄어쓰기 포함 14자 이내(앱이 뒤에 "· 이유 N가지"를 붙입니다). headline이 단정형이면 subline에 "왜 그럴까요?"처럼 본문이 답할 질문을 쓰세요. 질문형이면 궁금증을 키우는 짧은 한 줄을 쓰거나 비워 두세요. subline에 결론(답)을 미리 말하지 마세요("답은 탄산에 있어요" 금지).
- 본문에 없는 사실, 수치, 가게만의 사실은 만들지 마세요. 해요체로 쓰세요.
JSON으로만 답하세요: {"best":0,"options":[{"type":"유형","headline":"제목","subline":"부제"}]}`;
  const result=CoverSchema.parse(await ai.generate(prompt,CoverSchema));
  const order=[result.best,...result.options.keys()].filter((index,i,all)=>index<result.options.length&&all.indexOf(index)===i);
  for(const index of order){
    const option=result.options[index];
    if(coverProblem(option,cover,track,topic))continue;
    return {plan:{...plan,slides:plan.slides.map((slide,i)=>i===0?{...slide,headline:option.headline.trim(),subline:option.subline.trim()}:slide)},changed:true,hookType:option.type};
  }
  return {plan,changed:false};
}

export async function polishPlan(plan:CarouselPlan,track:CarouselTrack,ai:PolishAi,topic=""):Promise<{plan:CarouselPlan;coverChanged:boolean;hookType?:string;shortened:number}> {
  let current=plan,coverChanged=false,hookType:string|undefined,shortened=0;
  try{const cover=await rewriteCover(current,track,ai,topic);current=cover.plan;coverChanged=cover.changed;hookType=cover.hookType;}catch{/* 표지는 그대로 */}
  try{const fitted=await shortenHeadlines(current,track,ai);current=fitted.plan;shortened=fitted.shortened;}catch{/* 앱이 자른다 */}
  return {plan:current,coverChanged,...(hookType?{hookType}:{}),shortened};
}
