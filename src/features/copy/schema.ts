import { z } from "zod";

export const GeneratedCopySchema = z.object({
  topic: z.string(), audience: z.enum(["A", "B", "C"]), hook: z.string(), information: z.string(),
  store_connection: z.string(), call_to_action: z.string(), hashtags: z.array(z.string()),
  facts_used: z.array(z.string()), facts_to_verify: z.array(z.string()), image_disclosure: z.string().nullable(),
});
export const GeneratedCopyContentSchema = GeneratedCopySchema.omit({ topic:true, audience:true });
export const CopyInputSchema = z.object({
  topic: z.string().trim().min(1).max(200), audience: z.enum(["A", "B", "C"]),
  imageBrief:z.string().trim().max(600).optional(), hasAiImages:z.boolean().optional(),
  contentBrief:z.string().trim().max(600).optional(),
  // 캐러셀 슬라이드의 제목 순서. 캡션이 슬라이드와 같은 이야기 흐름을 따르게 한다.
  slideOutline:z.array(z.string().trim().min(1).max(60)).max(10).optional(),
});
export type GeneratedCopy = z.infer<typeof GeneratedCopySchema>;
export type CopyInput = z.infer<typeof CopyInputSchema>;
export type CopyPart = "hook" | "store_connection" | "call_to_action" | "hashtags";
