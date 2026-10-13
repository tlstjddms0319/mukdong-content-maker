import { NextResponse } from "next/server";

// 가벼운 헬스 체크: Render가 주기적으로 부른다. 예전에는 /login 페이지를 그려 매번 메모리·CPU를 썼다(계획서 2026-10-13-light-free-server).
export const dynamic="force-dynamic";
export function GET() {
  return NextResponse.json({ok:true});
}
