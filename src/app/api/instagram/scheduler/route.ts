import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { SchedulerConfigurationError, isAutoPublishEnabled, runScheduledPublishing } from "@/features/instagram/schedulerRuntime";

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
  if(!isAutoPublishEnabled())return NextResponse.json({error:"자동 게시가 꺼져 있습니다(INSTAGRAM_AUTOPUBLISH=off)."},{status:409});
  try{return NextResponse.json(await runScheduledPublishing());}
  catch(error){
    if(error instanceof SchedulerConfigurationError)return NextResponse.json({error:error.message},{status:503});
    return NextResponse.json({error:"예약 게시 점검에 실패했습니다."},{status:500});
  }
}
