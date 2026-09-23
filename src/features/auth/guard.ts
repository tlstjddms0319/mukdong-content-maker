import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isOwnerConfigured } from "@/features/auth/config";

export async function ownerApiError(): Promise<NextResponse | null> {
  if (!isOwnerConfigured()) {
    return NextResponse.json({ error: "관리자 로그인을 설정해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const session = await auth();
  if (session?.user?.id !== "owner") {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

export async function requireOwnerPage(): Promise<void> {
  if (!isOwnerConfigured() || (await auth())?.user?.id !== "owner") redirect("/login");
}
