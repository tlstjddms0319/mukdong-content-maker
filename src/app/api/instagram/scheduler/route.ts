import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { SchedulerConfigurationError, isAutoPublishEnabled, runScheduledPublishing } from "@/features/instagram/schedulerRuntime";
import type { SchedulerRun } from "@/features/instagram/scheduler";
import { runNotificationCheck } from "@/features/notifications/runtime";

// 외부 크론(또는 로그인한 주인)이 호출해 예약 게시를 한 번 점검한다.
// Authorization: Bearer <INSTAGRAM_SCHEDULER_SECRET> 또는 주인 세션 쿠키 중 하나로 인증한다.
function bearerMatches(request:Request,secret:string|undefined){
  if(!secret)return false;
  const header=request.headers.get("authorization")??"";
  const received=Buffer.from(header.startsWith("Bearer ")?header.slice(7):"");
  const expected=Buffer.from(secret);
  return received.length===expected.length&&timingSafeEqual(received,expected);
}

export async function POST(request:Request){
  if(!bearerMatches(request,process.env.INSTAGRAM_SCHEDULER_SECRET)&&(await ownerApiError())!==null)return NextResponse.json({error:"인증이 필요합니다."},{status:401});
  // 자동 게시가 꺼져 있어도 외부 크론이 부르면 토큰 갱신은 한다(응답의 reason이 "autopublish-off").
  // 휴대폰 알림 점검도 같이 한다(잠든 무료 서버를 깨우는 외부 크론이 이 주소를 부르므로). 알림이 실패해도 게시 결과는 그대로 돌려준다.
  const notify=(run:SchedulerRun|null)=>runNotificationCheck({run}).catch(error=>{console.warn("[notifications] 알림 점검 실패:",error instanceof Error?error.message:String(error));return {sent:[]};});
  try{
    const run=await runScheduledPublishing(console.info,isAutoPublishEnabled());
    return NextResponse.json({...run,notifications:(await notify(run)).sent});
  }catch(error){
    await notify(null);
    if(error instanceof SchedulerConfigurationError)return NextResponse.json({error:error.message},{status:503});
    return NextResponse.json({error:"예약 게시 점검에 실패했습니다."},{status:500});
  }
}
