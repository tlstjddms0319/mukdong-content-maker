import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { z } from "zod";
import { overusedMenus, suggestTopics, topicDirectionsForRound } from "@/features/topics/service";
import { STORE_MENU } from "@/features/store/menu";
import { TopicInputSchema } from "@/features/topics/schema";
import { buildTopicPrompt, readTopicGeneration, topicGenerationSchema } from "@/features/topics/prompt";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { createDraftRepository } from "@/features/drafts/repository";
import { likedTopicTitles } from "@/features/drafts/performance";
import { cachedTrendResult, trendLabel, trendMenu } from "@/features/topics/naverTrend";
import { PLAN_FALLBACK_MESSAGES, planFallbackReason } from "@/features/images/planRepair";
import { seasonContext } from "@/features/topics/season";

const RequestSchema = z.object({
  storeProfile: z.object({ name: z.string().trim().min(1).max(80) }),
  intent: z.string().trim().max(300).optional(),
  recommendationRound: z.number().int().nonnegative().max(9999).optional(),
  excludeTitles: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
  // 이 브라우저에서 최근에 보여 준 주제(되도록 피하기).
  recentTitles: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
});

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  try {
    const body = RequestSchema.parse(await request.json());
    // 초안 목록: 반응 좋았던 주제(성과 기록)와 최근에 만든 주제(반복 피하기)에 함께 쓴다. 못 읽어도 추천은 계속한다.
    const drafts = await createDraftRepository().listDraftSummaries().catch(() => []);
    const recentDraftTopics = [...drafts].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10).map((draft) => draft.topic).filter((title) => title.trim().length > 0 && title.length <= 120);
    // 피할 주제 = 이 브라우저에서 최근에 보여 준 것 + 최근 초안 주제(중복 없이 최대 30개).
    const avoidTitles = [...new Set([...(body.recentTitles ?? []), ...recentDraftTopics])].slice(0, 30);
    const input = TopicInputSchema.parse({ storeName: body.storeProfile.name, intent: body.intent, recommendationRound:body.recommendationRound, excludeTitles:body.excludeTitles, avoidTitles });
    const directions = topicDirectionsForRound(input.recommendationRound);
    // 오늘(한국 시간) 기준 계절과 다가오는 행사. 프롬프트와 준비된 주제 양쪽에 쓰고 화면에도 알려 준다.
    const season = seasonContext();
    // 사장님이 적어 둔 성과에서 반응 좋았던 주제(없으면 빈 목록).
    const likedTitles = likedTopicTitles(drafts);
    // 네이버 검색이 늘어난 음식 말(키가 없거나 실패하면 빈 목록, 12시간 기억). status는 화면에 반영 여부를 알려 주는 데 쓴다.
    const { keywords: trends, status: trendStatus } = await cachedTrendResult();
    // 지금 화면과 최근 추천에 자주 나온 메뉴는 이번에 빼서 메뉴를 고르게 돌린다(예: 가을마다 홍어애탕만 나오던 문제).
    const recentMenus = overusedMenus([...(body.recentTitles ?? []), ...recentDraftTopics], input.excludeTitles);
    // 검색이 늘어난 메뉴는 "최근에 자주 나온 메뉴"에서 뺀다. 둘 다에 있으면 프롬프트가 "꼭 쓰라"와 "쓰지 말라"를 함께 말하게 된다.
    for (const { keyword } of trends) { const menu = trendMenu(keyword); if (menu) recentMenus.delete(menu); }
    const hints = { recentMenus, trends: trends.map(({ keyword }) => keyword) };
    const settings = await readSettings().catch((error) => { console.warn("[settings] 설정을 읽지 못해 기본값을 사용합니다:", error instanceof Error ? error.message : String(error)); return null; });
    const client = createTextClient(settings?.textAiProvider, { onSwitch:(from, reason) => console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`, reason) });
    let source: "ai" | "fallback" = "ai";
    // 준비된 주제로 바꾼 이유와, AI 추천 중 규칙에 안 맞아 준비된 주제로 채운 칸 수(화면에 알린다).
    let fallbackMessage = "";
    let filledSlots = 0;
    const topics = await suggestTopics(input, { suggest:async () => readTopicGeneration(await client.generateJson(
      buildTopicPrompt(input, season, likedTitles, trends.map(trendLabel), STORE_MENU.filter((item) => recentMenus.has(item.id)).map((item) => item.name)),
      topicGenerationSchema(directions),
    )) }, (reason, error) => { source = "fallback"; fallbackMessage = topicFallbackMessage(error); console.warn("[topics] using prepared topics:", reason); }, season,
    (filled) => { filledSlots = filled; console.warn(`[topics] AI 추천 중 ${filled}칸이 규칙에 맞지 않아 준비된 주제로 채웠어요.`); }, hints);
    return NextResponse.json({ topics, source, ...(fallbackMessage ? { fallbackMessage } : {}), ...(filledSlots ? { filled: filledSlots } : {}), provider: source === "ai" ? client.provider : null, season: { name: season.season, events: season.events.map(({ name, daysAway }) => ({ name, daysAway })) }, trends: trends.map(({ keyword, growth }) => ({ keyword, growth })), trendStatus });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({ message: "주제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

// 준비된 주제로 바꾼 이유를 사장님 말로. AI 호출 오류가 없으면(답은 왔는데 규칙에 안 맞음) 그 사실을 말한다.
function topicFallbackMessage(error: unknown): string {
  if (error === undefined) return "AI 추천이 이번 기준(메뉴 고르게·질문형 등)에 맞지 않아 준비된 주제로 바꿨어요. 새로고침하면 다시 받아요.";
  const reason = planFallbackReason(error);
  return reason === "format" ? "AI가 보낸 추천 형식이 맞지 않았어요. 새로고침하면 대개 됩니다." : PLAN_FALLBACK_MESSAGES[reason];
}
