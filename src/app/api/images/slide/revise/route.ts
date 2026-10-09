import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { checkTextClaims } from "@/features/guard/service";
import { SlideReviseResultSchema, SlideReviseSchema, buildSlideRevisePrompt } from "@/features/images/slideRevise";

// 확인 화면 "이 장 고치기 → 글": 사장님이 고른 요청·직접 적은 말대로 그 장의 제목·짧은 글만 고친다(src/features/images/slideRevise.ts).
// 카드는 화면이 같은 밑바탕으로 글자만 다시 그린다. 글 AI가 안 되면 지어낸 글 대신 이유를 알려 "글자 직접 고치기"로 안내한다.
export async function POST(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const input=SlideReviseSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({message:"고칠 내용을 확인해 주세요."},{status:400});
  const settings=await readSettings().catch(()=>null);
  const client=createTextClient(settings?.textAiProvider);
  try{
    const revised=SlideReviseResultSchema.parse(await client.generateJson(buildSlideRevisePrompt(input.data),SlideReviseResultSchema));
    const result=input.data.cover?{...revised,points:[]}:revised;
    // 과장·단정 표현은 막지 않고 알려만 준다(글자 직접 고치기와 같은 기준). 화면이 "확인할 표현"으로 보여 준다.
    const warnings=checkTextClaims([result.headline,...result.points].join("\n")).blocked;
    return NextResponse.json({...result,warnings,provider:client.provider??"ai"});
  }catch(error){
    console.warn("[slide-revise] 글을 고치지 못했어요:",error instanceof Error?error.message:String(error));
    return NextResponse.json({message:"글 AI가 지금 답하지 못했어요. 잠시 뒤 다시 누르거나, 아래 '글자 직접 고치기'로 고쳐 주세요."},{status:503});
  }
}
