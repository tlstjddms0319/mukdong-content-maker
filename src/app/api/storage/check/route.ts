import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { checkRemoteStore } from "@/lib/files/remoteStore";

// 설정 화면의 "저장소 연결 확인" 버튼. 작은 파일을 쓰고·읽고·지워 보고 결과를 사람이 읽을 말로 돌려준다(키 값은 돌려주지 않는다).
export async function GET(){
  const denied=await ownerApiError();if(denied)return denied;
  return NextResponse.json(await checkRemoteStore(),{headers:{"Cache-Control":"no-store"}});
}
