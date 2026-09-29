import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { z } from "zod";
import { suggestTopics, topicDirectionsForRound } from "@/features/topics/service";
import { TopicInputSchema } from "@/features/topics/schema";
import { buildTopicPrompt, topicGenerationSchema } from "@/features/topics/prompt";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";

const RequestSchema = z.object({
  storeProfile: z.object({ name: z.string().trim().min(1).max(80) }),
  intent: z.string().trim().max(300).optional(),
  recommendationRound: z.number().int().nonnegative().max(9999).optional(),
  excludeTitles: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
});

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  try {
    const body = RequestSchema.parse(await request.json());
    const input = TopicInputSchema.parse({ storeName: body.storeProfile.name, intent: body.intent, recommendationRound:body.recommendationRound, excludeTitles:body.excludeTitles });
    const directions = topicDirectionsForRound(input.recommendationRound);
    const settings = await readSettings().catch(() => null);
    const client = createTextClient(settings?.textAiProvider, { onSwitch:(from, reason) => console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`, reason) });
    let source: "ai" | "fallback" = "ai";
    const topics = await suggestTopics(input, { suggest:() => client.generateJson(
      buildTopicPrompt(input),
      topicGenerationSchema(directions),
    ) }, (reason) => { source = "fallback"; console.warn("[topics] using prepared topics:", reason); });
    return NextResponse.json({ topics, source, provider: source === "ai" ? client.provider : null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({ message: "주제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
