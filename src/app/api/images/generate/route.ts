import { NextResponse } from "next/server";
import { ImageBriefSchema } from "@/features/images/schema";
import { AiConfigurationError, getOpenAIClient } from "@/lib/ai/openaiClient";

export async function POST(request: Request) {
  const parsed = ImageBriefSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "이미지 설정을 확인해 주세요." }, { status: 400 });
  try {
    const prompt = [
      `한국 음식점 인스타그램 게시물용 사진: ${parsed.data.topic}.`,
      "세로 4:5 구도, 하나의 음식 피사체가 선명하고 먹음직스럽게 보이며 자연스러운 조명과 여백이 있는 실제 음식 사진 스타일.",
      "이미지 안에 글자, 로고, 가격표를 넣지 말 것. 실제 매장 외관, 손님 얼굴, 확인되지 않은 원산지나 메뉴 구성을 만들지 말 것.",
    ].join(" ");
    const result = await getOpenAIClient().images.generate({ model: "gpt-image-1", prompt, size: "1024x1536", n: parsed.data.count, response_format: "b64_json" });
    const images = (result.data ?? []).map((item) => item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url).filter((value): value is string => Boolean(value));
    if (images.length !== parsed.data.count) throw new Error("incomplete image result");
    return NextResponse.json({ images, source:"ai-generated", disclosure:"AI로 만든 이미지입니다." });
  } catch (error) {
    const message = error instanceof AiConfigurationError ? error.message : "이미지를 만들지 못했습니다. 기존 작업은 그대로 보관했어요.";
    return NextResponse.json({ message, retryable:true }, { status:error instanceof AiConfigurationError ? 503 : 502 });
  }
}
