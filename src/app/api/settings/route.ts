import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { AppSettingsSchema } from "@/features/settings/schema";
import { readSettings, writeSettings } from "@/features/settings/repository";

function privateJson(body: unknown, init?: ResponseInit) { const headers=new Headers(init?.headers); headers.set("Cache-Control","no-store"); return NextResponse.json(body,{...init,headers}); }

export async function GET() { const denied=await ownerApiError(); if(denied)return denied;
  return privateJson(await readSettings());
}

export async function PUT(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed = AppSettingsSchema.safeParse(await request.json());
  if (!parsed.success) return privateJson({ error: "설정 값을 확인해 주세요." }, { status: 400 });
  await writeSettings(parsed.data);
  return privateJson(parsed.data);
}
