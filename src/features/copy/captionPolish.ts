import { z } from "zod";
import type { GeneratedCopy } from "./schema";
import { COPY_LENGTHS, type CopyLength, hardCopyIssues, shallowReasonIssues } from "./writing";

// 올릴 글 마지막 다듬기(결과물 점검 7~9회, 2026-10-12): 캡션이 9번 모두 370~500자로 기준(기본 500~800자)보다 짧았고,
// "보완해 주세요" 한 번으로는 고쳐지지 않았다. 표지 다듬기(images/copyPolish.ts)처럼 남은 문제만 따로 고친다.
// - 첫 문장이 60자를 넘으면: AI가 함께 준 첫 문장 후보(hook_options) 중 60자 이내인 것으로 바꾼다(AI를 다시 부르지 않음).
// - 본문이 짧으면: information에 다른 이유 문단 하나를 더해 달라고 한 번 더 부른다. 길이가 맞고 꼭 막을 문제가 없을 때만 받는다.
// 실패해도(키·한도·형식) 원래 글을 그대로 쓴다.
export type CaptionPolishAi={generate(prompt:string,schema:z.ZodTypeAny):Promise<unknown>};
export const HOOK_MAX=60;

const bodyOf=(copy:Pick<GeneratedCopy,"hook"|"information"|"store_connection"|"call_to_action">)=>[copy.hook,copy.information,copy.store_connection,copy.call_to_action].join("\n\n");

export function fitHook(copy:GeneratedCopy):{copy:GeneratedCopy;swapped:boolean} {
  if(copy.hook.trim().length<=HOOK_MAX)return {copy,swapped:false};
  const option=(copy.hook_options??[]).find(text=>text.trim().length>0&&text.trim().length<=HOOK_MAX);
  if(!option)return {copy,swapped:false};
  return {copy:{...copy,hook:option.trim(),hook_options:(copy.hook_options??[]).filter(text=>text!==option)},swapped:true};
}

const ExpandSchema=z.object({information:z.string().min(1)});
export async function expandInformation(copy:GeneratedCopy,length:CopyLength,ai:CaptionPolishAi,{context="",storeNotes=""}:{context?:string;storeNotes?:string}={}):Promise<{copy:GeneratedCopy;expanded:boolean}> {
  const [min,max]=COPY_LENGTHS[length];
  const now=bodyOf(copy).length;
  if(now>=min)return {copy,expanded:false};
  const target=Math.round((min+max)/2);
  const prompt=`Instagram 올릴 글의 정보 부분(information)이 짧습니다. 지금 본문 전체가 ${now}자인데 ${min}~${max}자가 되어야 합니다. information에 약 ${target-now}자를 더해 다시 쓰세요.
- 지금 문단들은 그대로 두고, 아직 말하지 않은 다른 이유 문단 하나를 마지막 결론 문단 바로 앞에 더하세요(결론 문단은 맨 끝에 그대로).
- 새 문단은 ① 원인이 되는 것의 이름(성분·구조·온도·조리 과정·감각 기관·풍습) ② 그것이 무엇을 어떻게 바꾸는지 ③ 그래서 혀·코·이에서 어떻게 느껴지는지 순서로 쓰세요. 이미 쓴 이유를 말만 바꿔 되풀이하지 마세요.
- 해요체로, 가게 이름·방문 권유는 쓰지 마세요. 수치·연구 결과·건강 효능, 확인되지 않은 가게 사실(가격·원산지·숙성 기간)은 만들지 마세요. 확실하지 않으면 "~로 알려져 있어요"라고 쓰세요.
- 문단은 빈 줄로 나누세요.
${context?`${context}\n`:""}지금 첫 문장: ${JSON.stringify(copy.hook)}
지금 information: ${JSON.stringify(copy.information)}
JSON으로만 답하세요: {"information":"늘린 정보 부분"}`;
  const result=ExpandSchema.parse(await ai.generate(prompt,ExpandSchema));
  const next={...copy,information:result.information.trim()};
  const length2=bodyOf(next).length;
  if(length2<min||length2>max)return {copy,expanded:false};
  if(hardCopyIssues(next,storeNotes).length)return {copy,expanded:false};
  if(shallowReasonIssues(next.information).length>shallowReasonIssues(copy.information).length)return {copy,expanded:false};
  return {copy:next,expanded:true};
}

export async function polishCaption(copy:GeneratedCopy,length:CopyLength,ai:CaptionPolishAi,options:{context?:string;storeNotes?:string}={}):Promise<{copy:GeneratedCopy;hookSwapped:boolean;expanded:boolean}> {
  const hook=fitHook(copy);
  let current=hook.copy,expanded=false;
  try{const result=await expandInformation(current,length,ai,options);current=result.copy;expanded=result.expanded;}catch{/* 원래 글을 쓴다 */}
  return {copy:current,hookSwapped:hook.swapped,expanded};
}
