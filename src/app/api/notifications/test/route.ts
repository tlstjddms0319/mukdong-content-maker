import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { sendTestNotification } from "@/features/notifications/runtime";

// 설정 화면의 "시험 알림 보내기". endpoint를 주면 그 기기에만 보낸다.
const TestSchema=z.object({endpoint:z.string().url().optional()});

export async function POST(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=TestSchema.safeParse(await request.json().catch(()=>({})));
  if(!parsed.success)return NextResponse.json({error:"요청을 읽지 못했어요."},{status:400});
  try{
    const result=await sendTestNotification(parsed.data.endpoint);
    if(!result.total)return NextResponse.json({error:"알림을 받을 기기가 없어요. ‘이 휴대폰으로 알림 받기’를 먼저 눌러 주세요."},{status:404});
    if(!result.delivered)return NextResponse.json({error:"알림을 보내지 못했어요. 잠시 뒤 다시 눌러 주세요."},{status:502});
    return NextResponse.json(result);
  }catch(error){
    console.warn("[notifications] 시험 알림 실패:",error instanceof Error?error.message:String(error));
    return NextResponse.json({error:"알림을 보내지 못했어요. 잠시 뒤 다시 눌러 주세요."},{status:500});
  }
}
