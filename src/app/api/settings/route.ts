import { NextResponse } from "next/server";
import { AppSettingsSchema } from "@/features/settings/schema";
import { readSettings, writeSettings } from "@/features/settings/repository";

export async function GET() {
  return NextResponse.json(await readSettings());
}

export async function PUT(request: Request) {
  const parsed = AppSettingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "설정 값을 확인해 주세요." }, { status: 400 });
  await writeSettings(parsed.data);
  return NextResponse.json(parsed.data);
}
