import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { SlideDraftSchema, SlideRequestSchema, buildSlideRequestPrompt, fallbackSlideDraft } from "@/features/images/slideRequest";

// "새 장 넣기"에서 사장님이 적은 요청으로 카드 문구·사진 장면을 짓는다(src/features/images/slideRequest.ts 설명 참고).
// 문안 AI가 실패하면 규칙으로 지은 문구를 돌려준다(새 장 넣기를 막지 않는다).
export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const input=SlideRequestSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({message:"새 장 요청을 확인해 주세요."},{status:400});
  const settings=await readSettings().catch(()=>null);
  const client=createTextClient(settings?.textAiProvider);
  try{
    const draft=SlideDraftSchema.parse(await client.generateJson(buildSlideRequestPrompt(input.data),SlideDraftSchema));
    return NextResponse.json({draft,provider:client.provider??"ai"});
  }catch(error){
    console.warn("[slide-request] 문안 AI 대신 규칙으로 새 장을 짓습니다:",error instanceof Error?error.message:String(error));
    return NextResponse.json({draft:fallbackSlideDraft(input.data),provider:"fallback"});
  }
}
