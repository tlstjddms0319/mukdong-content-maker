import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { z } from "zod";
import { TOPIC_REJECT_LABELS, overusedMenus, suggestTopics, type TopicRejectReason } from "@/features/topics/service";
import { STORE_MENU, menuOf } from "@/features/store/menu";
import { TopicInputSchema } from "@/features/topics/schema";
import { buildTopicPrompt, readTopicGeneration, topicGenerationSchema } from "@/features/topics/prompt";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { createDraftRepository } from "@/features/drafts/repository";
import { likedTopicTitles } from "@/features/drafts/performance";
import { cachedTrendResult, trendLabel, trendMenu } from "@/features/topics/naverTrend";
import { PLAN_FALLBACK_MESSAGES, planFallbackReason } from "@/features/images/planRepair";
import { seasonContext } from "@/features/topics/season";
import { recordTopicRefresh, topicCooldownSeconds, topicRefreshWait } from "@/features/topics/refreshPace";

const RequestSchema = z.object({
  storeProfile: z.object({ name: z.string().trim().min(1).max(80) }),
  intent: z.string().trim().max(300).optional(),
  recommendationRound: z.number().int().nonnegative().max(9999).optional(),
  excludeTitles: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
  // 이 브라우저에서 최근에 보여 준 주제(되도록 피하기).
  recentTitles: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  // 사진으로 주제 정하기: 사장님이 먼저 올린 사진에 보이는 것(사진마다 한 줄).
  photoNotes: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
});

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  try {
    const body = RequestSchema.parse(await request.json());

    // 초안 목록: 반응 좋았던 주제(성과 기록)와 최근에 만든 주제(반복 피하기)에 함께 쓴다. 못 읽어도 추천은 계속한다.
    const drafts = await createDraftRepository().listDraftSummaries().catch(() => []);
    const recentDraftTopics = [...drafts].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10).map((draft) => draft.topic).filter((title) => title.trim().length > 0 && title.length <= 120);
    // 피할 주제 = 이 브라우저에서 최근에 보여 준 것 + 최근 초안 주제(중복 없이 최대 30개).
    const avoidTitles = [...new Set([...(body.recentTitles ?? []), ...recentDraftTopics])].slice(0, 30);
    const input = TopicInputSchema.parse({ storeName: body.storeProfile.name, intent: body.intent, recommendationRound:body.recommendationRound, excludeTitles:body.excludeTitles, avoidTitles, photoNotes:body.photoNotes });
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
    // 사진으로 주제 정하기: 사진 속 가게 메뉴. 그 메뉴는 "최근에 자주 나온 메뉴"여도 이번에는 쓴다(사진이 먼저).
    const photoMenus = new Set(input.photoNotes.flatMap((note) => menuOf(note).map((item) => item.id)));
    for (const id of photoMenus) recentMenus.delete(id);
    const hints = { recentMenus, trends: trends.map(({ keyword }) => keyword), ...(input.photoNotes.length ? { photoMenus } : {}) };
    const settings = await readSettings().catch((error) => { console.warn("[settings] 설정을 읽지 못해 기본값을 사용합니다:", error instanceof Error ? error.message : String(error)); return null; });
    const client = createTextClient(settings?.textAiProvider, { onSwitch:(from, reason) => console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`, reason) });
    // 무료 문안 AI의 분당 한도를 넘기지 않게 "다른 주제 보기" 간격을 지킨다(refreshPace.ts). 너무 빨리 다시 누르면 AI를 부르지 않고
    // 몇 초 뒤에 다시 볼 수 있는지만 알려 준다(화면은 지금 추천을 그대로 두고 버튼에 남은 초를 띄운다).
    // - 화면을 처음 열 때(제외할 제목이 없음)는 막지 않는다(열었는데 추천이 안 나오면 안 되므로). 대신 그 요청도 횟수에 센다.
    // - 문안 AI가 하나도 연결되지 않았으면 한도가 없으니 기다리지 않는다(준비된 주제만 나온다).
    const paced = client.configured.length > 0;
    const wait = paced && input.excludeTitles.length ? topicRefreshWait() : 0;
    if (wait > 0) return NextResponse.json({ message: `조금만 기다려 주세요. ${wait}초 뒤에 다른 주제를 볼 수 있어요.`, paced: true, cooldownSeconds: wait }, { status: 429 });
    let source: "ai" | "fallback" = "ai";
    // 준비된 주제로 바꾼 이유와, AI 추천 중 규칙에 안 맞아 준비된 주제로 바꾼 개수(화면에 알린다).
    let fallbackMessage = "";
    let filledSlots = 0;
    // AI가 분당 한도(429)에 걸려 준비된 주제로 넘어갔으면 다음 추천까지 1분을 쉰다.
    let rateLimited = false;
    const topics = await suggestTopics(input, { suggest:async () => { if (paced) recordTopicRefresh(); return readTopicGeneration(await client.generateJson(
      buildTopicPrompt(input, season, likedTitles, trends.map(trendLabel), STORE_MENU.filter((item) => recentMenus.has(item.id)).map((item) => item.name)),
      topicGenerationSchema(),
    )); } }, (reason, error, rejected) => { source = "fallback"; rateLimited = error !== undefined && planFallbackReason(error) === "quota"; fallbackMessage = topicFallbackMessage(error, rejected); console.warn("[topics] using prepared topics:", reason); }, season,
    (filled) => { filledSlots = filled; console.warn(`[topics] AI 추천 중 ${filled}개가 규칙에 맞지 않아 준비된 주제로 바꿨어요.`); }, hints);
    return NextResponse.json({ topics, source, cooldownSeconds: paced ? topicCooldownSeconds(Date.now(), { rateLimited }) : 0, ...(fallbackMessage ? { fallbackMessage } : {}), ...(filledSlots ? { filled: filledSlots } : {}), provider: source === "ai" ? client.provider : null, season: { name: season.season, events: season.events.map(({ name, daysAway }) => ({ name, daysAway })) }, trends: trends.map(({ keyword, growth }) => ({ keyword, growth })), trendStatus });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({ message: "주제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

// 준비된 주제로 바꾼 이유를 사장님 말로. AI 호출 오류가 없으면(답은 왔는데 규칙에 안 맞음) 그 사실을 말한다.
// rejected: AI 주제를 못 쓴 이유별 개수. 어떤 기준에 걸렸는지 한 줄로 붙인다(사장님이 알려 주면 기준을 고칠 수 있게).
function topicFallbackMessage(error: unknown, rejected: Partial<Record<TopicRejectReason, number>> = {}): string {
  if (error === undefined) {
    const why = Object.entries(rejected).map(([reason, count]) => `${TOPIC_REJECT_LABELS[reason as TopicRejectReason]} ${count}개`).join(", ");
    return `AI 추천이 기준에 맞지 않았어요${why ? `(${why})` : ""}. '다른 주제 보기'를 누르면 다시 받아요.`;
  }
  const reason = planFallbackReason(error);
  if (reason === "format") return "AI가 보낸 추천 형식이 맞지 않았어요. '다른 주제 보기'를 누르면 대개 됩니다.";
  // 주제 추천의 한도 초과는 대개 분당 한도라 1분 쉬면 풀린다(버튼도 1분 잠긴다, refreshPace.ts).
  if (reason === "quota") return "글 쓰는 AI가 잠깐 한도에 걸렸어요. 1분 뒤 '다른 주제 보기'를 눌러 보세요.";
  return PLAN_FALLBACK_MESSAGES[reason];
}
