import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isOwnerConfigured } from "@/features/auth/config";
import { isPublicException } from "@/features/auth/routes";
import { withoutSessionRefresh } from "@/features/auth/sessionCookie";

const withAuth = auth((request, _event: NextFetchEvent) => {
  void _event;
  if (request.auth?.user?.id === "owner") return NextResponse.next();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
});

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || isPublicException(pathname) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (!isOwnerConfigured()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  // 로그인 확인만 하고 로그인 쿠키를 다시 굽지는 않는다(로그아웃과 겹친 요청이 쿠키를 되살리지 않게).
  const response = await withAuth(request, event);
  return response ? withoutSessionRefresh(response) : response;
}

// API 경로(/api/...)는 각 라우트가 직접 로그인을 확인하므로 프록시를 거치지 않게 뺀다.
// 프록시가 도는 요청은 Next가 본문을 10MB까지만 복사해 두어서, 그보다 큰 사진 올리기(12MB까지 허용)와
// 사진+AI의 참고 사진 요청이 본문이 잘린 채 500으로 실패했다.
export const config = {
  matcher: ["/((?!_next|api(?:/|$)|.*\\..*).*)"],
};
