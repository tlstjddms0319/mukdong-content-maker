import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isOwnerConfigured } from "@/features/auth/config";

export const LOGIN_EXPIRED_MESSAGE = "로그인이 만료됐어요. 새 탭에서 다시 로그인한 뒤, 이 화면으로 돌아와 다시 눌러 주세요(지금 만든 내용은 이 탭에 남아 있어요).";

export async function ownerApiError(): Promise<NextResponse | null> {
  if (!isOwnerConfigured()) {
    return NextResponse.json({ error: "관리자 로그인을 설정해 주세요.", message: "관리자 로그인을 설정해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const session = await auth();
  if (session?.user?.id !== "owner") {
    // 화면 코드는 대부분 message를 읽으므로 같은 안내를 두 이름으로 넣는다. 만든 내용은 그 탭에 남아 있으니 새 탭에서 로그인하라고 알린다.
    return NextResponse.json({ error: "로그인이 필요합니다.", message: LOGIN_EXPIRED_MESSAGE, reason: "login" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

export async function requireOwnerPage(): Promise<void> {
  if (!isOwnerConfigured() || (await auth())?.user?.id !== "owner") redirect("/login");
}
