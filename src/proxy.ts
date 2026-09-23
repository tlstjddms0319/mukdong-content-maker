import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isOwnerConfigured } from "@/features/auth/config";
import { isPublicException } from "@/features/auth/routes";

const withAuth = auth((request, _event: NextFetchEvent) => {
  void _event;
  if (request.auth?.user?.id === "owner") return NextResponse.next();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || isPublicException(pathname) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (!isOwnerConfigured()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  return withAuth(request, event);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
