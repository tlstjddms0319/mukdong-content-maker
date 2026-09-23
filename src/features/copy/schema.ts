import { z } from "zod";

export const GeneratedCopySchema = z.object({
  topic: z.string(), audience: z.enum(["A", "B", "C"]), hook: z.string(), information: z.string(),
  store_connection: z.string(), call_to_action: z.string(), hashtags: z.array(z.string()),
  facts_used: z.array(z.string()), facts_to_verify: z.array(z.string()), image_disclosure: z.string().nullable(),
});
export const GeneratedCopyContentSchema = GeneratedCopySchema.omit({ topic:true, audience:true });
export const CopyInputSchema = z.object({ topic: z.string().min(1), audience: z.enum(["A", "B", "C"]) });
export type GeneratedCopy = z.infer<typeof GeneratedCopySchema>;
export type CopyInput = z.infer<typeof CopyInputSchema>;
export type CopyPart = "hook" | "store_connection" | "call_to_action" | "hashtags";
