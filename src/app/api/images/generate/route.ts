import { NextResponse } from "next/server";
import { ImageBriefSchema } from "@/features/images/schema";

export async function POST(request: Request) {
  const parsed = ImageBriefSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "이미지 설정을 확인해 주세요." }, { status: 400 });
  return NextResponse.json({ message: "OpenAI 이미지 연결 후 후보가 여기에 표시됩니다.", retryable: true }, { status: 503 });
}
