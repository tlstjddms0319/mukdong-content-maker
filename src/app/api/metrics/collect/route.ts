import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { runDailyMetricsIfDue } from "@/features/metrics/collect";

// 성과 화면의 '지금 가져오기'. 오늘 이미 가져왔어도 다시 가져온다.
export async function POST(){ const denied=await ownerApiError(); if(denied)return denied;
  const run=await runDailyMetricsIfDue(true);
  return NextResponse.json(run,{headers:{"Cache-Control":"no-store"}});
}
