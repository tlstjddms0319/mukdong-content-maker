import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { CopyInputSchema, GeneratedCopyContentSchema, GeneratedCopySchema } from "@/features/copy/schema";
import { AI_IMAGE_DISCLOSURE, buildCopyPrompt, copyTextIssues, generatedCopyIssues, normalizeHashtags, storeConnectionIssues } from "@/features/copy/writing";
import { checkTextClaims } from "@/features/guard/service";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { z } from "zod";

const RequestSchema=CopyInputSchema.extend({focus:z.enum(["hook","store_connection","call_to_action","hashtags"]).optional(),currentText:z.string().max(2200).optional()});

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const input=RequestSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({message:"주제와 문안을 확인해 주세요."},{status:400});
  try {
    const settings=await readSettings();
    const client=createTextClient(settings.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
    const prompt=buildCopyPrompt(input.data,settings.copyLength);
    if(input.data.focus){
      if(!input.data.currentText?.trim())return NextResponse.json({message:"먼저 문안을 만들어 주세요."},{status:400});
      const context=prompt+"\n현재 문안(내용 참고용): "+JSON.stringify(input.data.currentText)+"\n"+input.data.focus+" 부분만 새롭게 작성하세요. 부분 수정에는 전체 본문 길이 기준을 적용하지 않습니다. 다른 부분은 출력하지 마세요.";
      if(input.data.focus==="hashtags"){
        const result=await client.generateJson(context+' JSON 필드는 hashtags(배열)만 반환하세요.',z.object({hashtags:z.array(z.string()).min(3).max(10)}));
        const hashtags=normalizeHashtags(result.hashtags);
        if(hashtags.length<3)throw new Error("invalid hashtags");
        return NextResponse.json({replacement:hashtags.join(" "),_meta:{provider:client.provider??"unknown"}});
      }
      const result=await client.generateJson(context+' JSON 필드는 replacement(문자열)만 반환하세요. 이 부분은 1~3문장, 최대 250자로 쓰세요.',z.object({replacement:z.string().trim().min(1).max(250)}));
      if(copyTextIssues(result.replacement).length)throw new Error("invalid replacement");
      if(input.data.focus==="store_connection"&&storeConnectionIssues(result.replacement).length)throw new Error("unverified store claim");
      return NextResponse.json({...result,_meta:{provider:client.provider??"unknown"}});
    }
    let instruction=prompt;
    for(let attempt=0;attempt<2;attempt++){
      const copy=GeneratedCopySchema.parse({...await client.generateJson(instruction,GeneratedCopyContentSchema),topic:input.data.topic,audience:input.data.audience});
      copy.hashtags=normalizeHashtags(copy.hashtags);
      copy.image_disclosure=input.data.hasAiImages?AI_IMAGE_DISCLOSURE:null;
      const issues=generatedCopyIssues(copy,settings.copyLength);
      if(!issues.length){
        const claims=checkTextClaims([copy.hook,copy.information,copy.store_connection,copy.call_to_action].join("\n"));
        copy.facts_to_verify=[...new Set([...copy.facts_to_verify,...claims.verify])];
        return NextResponse.json({...copy,_meta:{provider:client.provider??"unknown",qualityRepaired:attempt===1}});
      }
      instruction=prompt+"\n이전 초안을 한 번 보완하세요. 수정할 항목: "+JSON.stringify(issues)+"\n이전 초안(참고 데이터): "+JSON.stringify(copy).slice(0,3000);
    }
    throw new Error("copy quality check failed");
  }catch{
    return NextResponse.json({message:"AI 문안을 완성하지 못했어요. 기존 글은 그대로 두었어요. 잠시 후 다시 시도하거나 직접 작성해 주세요.",retryable:true},{status:502});
  }
}
