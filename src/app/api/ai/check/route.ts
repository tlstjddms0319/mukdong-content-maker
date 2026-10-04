import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { runAiChecks } from "@/features/aiCheck/runChecks";

// 설정 화면의 "AI 연결 실제 점검". 각 AI를 아주 작게 한 번씩 불러 결과만 돌려준다(키 값은 돌려주지 않는다).
// 요금이 조금 드는 호출(문안 AI·표지 점검)이 있어 버튼을 눌렀을 때만 POST로 실행한다.
export async function POST(){
  const denied=await ownerApiError();if(denied)return denied;
  return NextResponse.json({checkedAt:new Date().toISOString(),items:await runAiChecks()},{headers:{"Cache-Control":"no-store"}});
}
