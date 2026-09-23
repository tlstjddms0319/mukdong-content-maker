import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createMediaStore, MediaValidationError } from "@/lib/files/mediaStore";

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "사진을 선택해 주세요." }, { status: 400 });
    return NextResponse.json(await createMediaStore(process.env.DATA_DIR ?? "./data/media").saveOriginal(file));
  } catch (error) {
    const status = error instanceof MediaValidationError ? 400 : 500;
    return NextResponse.json({ message: error instanceof MediaValidationError ? error.message : "사진을 저장하지 못했습니다." }, { status });
  }
}
