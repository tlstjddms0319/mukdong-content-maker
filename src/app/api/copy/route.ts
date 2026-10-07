import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { CopyInputSchema, GeneratedCopyContentSchema, GeneratedCopySchema } from "@/features/copy/schema";
import { AI_IMAGE_DISCLOSURE, buildCopyPrompt, cleanHookOptions, generatedCopyIssues, hardCopyIssues, mixHashtags, storeConnectionIssues } from "@/features/copy/writing";
import { TextAiHttpError } from "@/lib/ai/errors";
import { checkTextClaims } from "@/features/guard/service";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { z } from "zod";

// 실패 이유를 사장님 화면에 짧게, 서버 로그에는 원문을 남긴다(예전에는 모든 실패가 같은 문구였다).
type CopyFailure="no-ai"|"quota"|"key"|"busy"|"format"|"quality"|"error";
const FAILURE_MESSAGES:Record<CopyFailure,string>={
  "no-ai":"문안 AI가 설정되어 있지 않아요(설정 → AI 연결 점검).",
  quota:"문안 AI 오늘 사용량을 다 썼어요. 잠시 뒤나 내일 다시 해 보세요.",
  key:"문안 AI 키가 맞지 않아요(설정 → AI 연결 점검).",
  busy:"문안 AI 서버가 잠시 바빠요. 조금 뒤 다시 해 보세요.",
  format:"AI가 보낸 문안 형식이 맞지 않았어요. 다시 만들면 대개 됩니다.",
  quality:"AI 문안에 확인되지 않은 단정 표현이 남아 쓰지 않았어요. 다시 만들거나 직접 작성해 주세요.",
  error:"문안 AI 연결에 문제가 있었어요. 다시 해 보세요.",
};
class CopyQualityError extends Error { constructor(readonly issues:string[]){super(`copy quality: ${issues.join(" / ").slice(0,300)}`);this.name="CopyQualityError";} }
function failureOf(error:unknown):CopyFailure {
  if(error instanceof CopyQualityError)return "quality";
  if(error instanceof TextAiHttpError)return error.status===429?"quota":error.status===401||error.status===403?"key":error.status>=500?"busy":"error";
  if(error instanceof z.ZodError||error instanceof SyntaxError)return "format";
  if(error instanceof Error&&error.name==="TextAiUnavailableError")return "no-ai";
  return "error";
}

const RequestSchema=CopyInputSchema.extend({focus:z.enum(["hook","store_connection","call_to_action","hashtags"]).optional(),currentText:z.string().max(2200).optional()});

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const input=RequestSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({message:"주제와 문안을 확인해 주세요."},{status:400});
  try {
    // An unreadable settings file must not stop the writer; defaults keep the caption flow alive.
    const settings=await readSettings().catch((error)=>{console.warn("[settings] 설정을 읽지 못해 기본값을 사용합니다:",error instanceof Error?error.message:String(error));return null;});
    const copyLength=settings?.copyLength??DEFAULT_SETTINGS.copyLength;
    const client=createTextClient(settings?.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
    const prompt=buildCopyPrompt(input.data,copyLength);
    if(input.data.focus){
      if(!input.data.currentText?.trim())return NextResponse.json({message:"먼저 문안을 만들어 주세요."},{status:400});
      const context=prompt+"\n현재 문안(내용 참고용): "+JSON.stringify(input.data.currentText)+"\n"+input.data.focus+" 부분만 새롭게 작성하세요. 부분 수정에는 전체 본문 길이 기준을 적용하지 않습니다. 다른 부분은 출력하지 마세요.";
      if(input.data.focus==="hashtags"){
        const result=await client.generateJson(context+' JSON 필드는 hashtags(배열)만 반환하세요. 본문 주제를 나타내는 태그 3개만 쓰고 가게·지역 태그는 쓰지 마세요.',z.object({hashtags:z.array(z.string()).min(1).max(10)}));
        const hashtags=mixHashtags(result.hashtags);
        if(hashtags.length<3)throw new Error("invalid hashtags");
        return NextResponse.json({replacement:hashtags.join(" "),_meta:{provider:client.provider??"unknown"}});
      }
      const result=await client.generateJson(context+' JSON 필드는 replacement(문자열)만 반환하세요. 이 부분은 1~3문장, 최대 250자로 쓰세요.',z.object({replacement:z.string().trim().min(1).max(250)}));
      // 부분 수정도 꼭 막아야 하는 문제(확인 안 된 단정·매장 제공 주장)만 거절하고, 말투·상투어는 화면의 "문안 다듬기"에 맡긴다.
      const blocked=checkTextClaims(result.replacement).blocked;
      if(blocked.length)throw new CopyQualityError(blocked);
      if(input.data.focus==="store_connection"&&storeConnectionIssues(result.replacement).length)throw new CopyQualityError(storeConnectionIssues(result.replacement));
      return NextResponse.json({...result,_meta:{provider:client.provider??"unknown"}});
    }
    // 문제가 있으면 한 번 보완을 요청하고, 두 초안 중 문제가 적은 쪽을 쓴다. 꼭 막아야 하는 문제가 남았을 때만 거절한다.
    let instruction=prompt;
    let best:{copy:z.infer<typeof GeneratedCopySchema>;hard:string[];soft:string[];attempt:number}|null=null;
    for(let attempt=0;attempt<2;attempt++){
      const copy=GeneratedCopySchema.parse({...await client.generateJson(instruction,GeneratedCopyContentSchema),topic:input.data.topic,audience:input.data.audience});
      copy.hashtags=mixHashtags(copy.hashtags);
      copy.hook_options=cleanHookOptions(copy.hook_options??[],copy.hook);
      copy.image_disclosure=input.data.hasAiImages?AI_IMAGE_DISCLOSURE:null;
      const issues=generatedCopyIssues(copy,copyLength),hard=hardCopyIssues(copy);
      const soft=issues.filter(issue=>!hard.includes(issue));
      if(!best||hard.length<best.hard.length||(hard.length===best.hard.length&&soft.length<best.soft.length))best={copy,hard,soft,attempt};
      if(!issues.length)break;
      instruction=prompt+"\n이전 초안을 한 번 보완하세요. 수정할 항목: "+JSON.stringify(issues)+"\n이전 초안(참고 데이터): "+JSON.stringify(copy).slice(0,3000);
    }
    if(!best||best.hard.length)throw new CopyQualityError(best?.hard??["no draft"]);
    const {copy}=best;
    const claims=checkTextClaims([copy.hook,copy.information,copy.store_connection,copy.call_to_action].join("\n"));
    copy.facts_to_verify=[...new Set([...copy.facts_to_verify,...claims.verify])];
    if(best.soft.length)console.info(`[copy] 다듬을 곳이 남은 문안을 썼어요: ${best.soft.join(" / ").slice(0,300)}`);
    return NextResponse.json({...copy,...(best.soft.length?{quality_warnings:best.soft}:{}),_meta:{provider:client.provider??"unknown",qualityRepaired:best.attempt===1}});
  }catch(error){
    const reason=failureOf(error);
    console.warn(`[copy] AI 문안을 쓰지 못했어요(${reason}):`,error instanceof Error?error.message.replace(/\s+/g," ").slice(0,300):String(error));
    return NextResponse.json({message:`AI 문안을 완성하지 못했어요. 기존 글은 그대로 두었어요. 이유: ${FAILURE_MESSAGES[reason]}`,reason,retryable:reason!=="key"&&reason!=="no-ai"},{status:502});
  }
}
