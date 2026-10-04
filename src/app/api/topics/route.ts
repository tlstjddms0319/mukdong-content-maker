import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { z } from "zod";
import { suggestTopics, topicDirectionsForRound } from "@/features/topics/service";
import { TopicInputSchema } from "@/features/topics/schema";
import { buildTopicPrompt, topicGenerationSchema } from "@/features/topics/prompt";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { createDraftRepository } from "@/features/drafts/repository";
import { likedTopicTitles } from "@/features/drafts/performance";
import { seasonContext } from "@/features/topics/season";

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
    // 오늘(한국 시간) 기준 계절과 다가오는 행사. 프롬프트와 준비된 주제 양쪽에 쓰고 화면에도 알려 준다.
    const season = seasonContext();
    // 사장님이 적어 둔 성과에서 반응 좋았던 주제(없으면 빈 목록). 초안을 못 읽어도 추천은 계속한다.
    const likedTitles = likedTopicTitles(await createDraftRepository().listDrafts().catch(() => []));
    const settings = await readSettings().catch((error) => { console.warn("[settings] 설정을 읽지 못해 기본값을 사용합니다:", error instanceof Error ? error.message : String(error)); return null; });
    const client = createTextClient(settings?.textAiProvider, { onSwitch:(from, reason) => console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`, reason) });
    let source: "ai" | "fallback" = "ai";
    const topics = await suggestTopics(input, { suggest:() => client.generateJson(
      buildTopicPrompt(input, season, likedTitles),
      topicGenerationSchema(directions),
    ) }, (reason) => { source = "fallback"; console.warn("[topics] using prepared topics:", reason); }, season);
    return NextResponse.json({ topics, source, provider: source === "ai" ? client.provider : null, season: { name: season.season, events: season.events.map(({ name, daysAway }) => ({ name, daysAway })) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({ message: "주제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
