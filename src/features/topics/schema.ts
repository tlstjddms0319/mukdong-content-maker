import { z } from "zod";

export const TopicInputSchema = z.object({
  storeName: z.string().trim().min(1).max(80),
  intent: z.string().trim().max(300).optional().default(""),
});

export const TopicSuggestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  audience: z.enum(["A", "B", "C"]),
  imageBrief: z.string().min(1),
});

export const TopicSuggestionsSchema = z.array(TopicSuggestionSchema).length(3);

export type TopicInput = z.infer<typeof TopicInputSchema>;
export type TopicSuggestion = z.infer<typeof TopicSuggestionSchema>;
