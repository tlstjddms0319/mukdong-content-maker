import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { readCutoutLedger } from "@/features/images/remoteCutout";
import { readSettings } from "@/features/settings/repository";
import { readUsage } from "@/lib/usage/ledger";

// 설정 화면 "AI 사용량" 카드. 앱이 직접 센 호출 수·실패·한도 초과와, Groq가 알려 준 남은 요청 수,
// 원격 누끼(Higgsfield) 이번 달 크레딧 장부를 돌려준다. 각 AI의 정확한 남은 양은 대시보드 링크로 안내한다.
export async function GET(){
  const denied=await ownerApiError();if(denied)return denied;
  try{
    const [usage,cutout,settings]=await Promise.all([
      readUsage(),
      readCutoutLedger().catch(()=>null),
      readSettings().catch(()=>null),
    ]);
    return NextResponse.json({usage,cutout:cutout?{used:cutout.used,budget:settings?.remoteCutout?settings.remoteCutoutMonthlyCredits:null}:null},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("[usage] 사용량을 읽지 못했어요:",error instanceof Error?error.message:String(error));
    return NextResponse.json({message:"사용량을 불러오지 못했어요."},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
