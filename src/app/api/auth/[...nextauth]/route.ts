import { handlers } from "@/auth";
import { isOwnerConfigured } from "@/features/auth/config";
import type { NextRequest } from "next/server";

function unavailable(): Response {
  return new Response("관리자 로그인을 설정해야 합니다.", {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export function GET(request: NextRequest): Promise<Response> | Response {
  return isOwnerConfigured() ? handlers.GET(request) : unavailable();
}

export function POST(request: NextRequest): Promise<Response> | Response {
  return isOwnerConfigured() ? handlers.POST(request) : unavailable();
}
