import { z } from "zod";

export const TopicInputSchema = z.object({
  storeName: z.string().trim().min(1).max(80),
  intent: z.string().trim().max(300).optional().default(""),
  recommendationRound: z.number().int().nonnegative().max(9999).optional().default(0),
  excludeTitles: z.array(z.string().trim().min(1).max(120)).max(3).optional().default([]),
  // 최근에 보여 줬거나 이미 초안으로 만든 주제. excludeTitles(지금 화면, 반드시 제외)와 달리 "되도록 피하기"용이다.
  avoidTitles: z.array(z.string().trim().min(1).max(120)).max(30).optional().default([]),
});

export const TopicSuggestionSchema = z.object({
  id: z.coerce.string().min(1),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  reason: z.string().trim().min(1).max(300),
  audience: z.preprocess(normalizeAudience, z.enum(["A", "B", "C"])),
  imageBrief: z.string().min(1),
  // 이 주제에 반영한 시기(행사·계절 이름). 시기와 무관하면 빈 문자열. 예전 초안에는 없어서 기본값을 둔다.
  season: z.string().trim().max(30).optional().default(""),
  // 이 주제에 반영한 네이버 검색 흐름 말(trendKeywords의 묶음 이름, 예: "과메기"). 반영하지 않았으면 빈 문자열.
  trend: z.string().trim().max(30).optional().default(""),
});

export const TopicSuggestionsSchema = z.array(TopicSuggestionSchema).length(3).superRefine((topics,context) => {
  if (new Set(topics.map((topic) => topic.id)).size !== topics.length) {
    context.addIssue({ code:"custom", message:"추천 주제 ID가 중복되었습니다." });
  }
});

export type TopicInput = z.input<typeof TopicInputSchema>;
export type TopicSuggestion = z.infer<typeof TopicSuggestionSchema>;
// AI 응답처럼 season이 빠져 있을 수 있는 입력 모양(파싱하면 빈 문자열로 채워진다).
export type TopicSuggestionInput = z.input<typeof TopicSuggestionSchema>;

const AUDIENCE_LABELS: Record<string, "A" | "B" | "C"> = { "음식 탐색형": "A", "약속 결정형": "B", "호기심 입문형": "C" };
// Gemini often returns "C=호기심 입문형" or just the label; accept those, reject anything else.
function normalizeAudience(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  const letter = /^([ABC])(?![A-Za-z])/i.exec(text)?.[1];
  if (letter) return letter.toUpperCase();
  return Object.entries(AUDIENCE_LABELS).find(([label]) => text.includes(label))?.[1] ?? value;
}
