import { z } from "zod";

export const GeneratedCopySchema = z.object({
  topic: z.string(), audience: z.enum(["A", "B", "C"]), hook: z.string(), information: z.string(),
  store_connection: z.string(), call_to_action: z.string(), hashtags: z.array(z.string()),
  facts_used: z.array(z.string()), facts_to_verify: z.array(z.string()), image_disclosure: z.string().nullable(),
  // 첫 줄(hook) 대안 후보. 사용자가 클릭해 바꿔 끼운다. 예전에 저장된 문안에는 없어서 선택 필드다.
  hook_options: z.array(z.string()).max(3).optional(),
});
// AI에게 받는 모양. default([])는 입력에서는 빠져도 되고(후보를 안 준 AI도 통과), 엄격 JSON 스키마로 바꿀 때는 필수 필드가 된다.
export const GeneratedCopyContentSchema = GeneratedCopySchema.omit({ topic:true, audience:true, hook_options:true }).extend({ hook_options: z.array(z.string()).max(3).default([]) });
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
