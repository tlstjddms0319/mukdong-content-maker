import { z } from "zod";

export const TopicInputSchema = z.object({
  storeName: z.string().trim().min(1).max(80),
  intent: z.string().trim().max(300).optional().default(""),
  recommendationRound: z.number().int().nonnegative().max(9999).optional().default(0),
  excludeTitles: z.array(z.string().trim().min(1).max(120)).max(3).optional().default([]),
});

export const TopicSuggestionSchema = z.object({
  id: z.coerce.string().min(1),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  reason: z.string().trim().min(1).max(300),
  audience: z.enum(["A", "B", "C"]),
  imageBrief: z.string().min(1),
});

export const TopicSuggestionsSchema = z.array(TopicSuggestionSchema).length(3).superRefine((topics,context) => {
  if (new Set(topics.map((topic) => topic.id)).size !== topics.length) {
    context.addIssue({ code:"custom", message:"추천 주제 ID가 중복되었습니다." });
  }
});

export type TopicInput = z.input<typeof TopicInputSchema>;
export type TopicSuggestion = z.infer<typeof TopicSuggestionSchema>;
