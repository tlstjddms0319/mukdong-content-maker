import { NextResponse } from "next/server";
import { ImageBriefSchema } from "@/features/images/schema";
import { AiConfigurationError, getOpenAIClient } from "@/lib/ai/openaiClient";
import { buildImageRequest } from "@/features/images/openaiRequest";

export async function POST(request: Request) {
  const parsed = ImageBriefSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "이미지 설정을 확인해 주세요." }, { status: 400 });
  try {
    const result = await getOpenAIClient().images.generate(buildImageRequest(parsed.data));
    const images = (result.data ?? []).map((item) => item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url).filter((value): value is string => Boolean(value));
    if (images.length !== parsed.data.count) throw new Error("incomplete image result");
    return NextResponse.json({ images, source:"ai-generated", disclosure:"AI로 만든 이미지입니다." });
  } catch (error) {
    const message = error instanceof AiConfigurationError ? error.message : "이미지를 만들지 못했습니다. 기존 작업은 그대로 보관했어요.";
    return NextResponse.json({ message, retryable:true }, { status:error instanceof AiConfigurationError ? 503 : 502 });
  }
}
