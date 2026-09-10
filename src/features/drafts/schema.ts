import { z } from "zod";

export const MediaCandidateSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["photo", "ai-generated", "ai-edited"]),
  file_id: z.string().min(1),
  purpose: z.string().min(1),
});

export const GeneratedCopySchema = z.object({
  topic: z.string(),
  audience: z.enum(["A", "B", "C"]),
  hook: z.string(),
  information: z.string(),
  store_connection: z.string(),
  call_to_action: z.string(),
  hashtags: z.array(z.string()),
  facts_used: z.array(z.string()),
  facts_to_verify: z.array(z.string()),
  image_disclosure: z.string().nullable(),
});

export const DraftSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["ready", "generating", "verify", "failed"]),
  topic: z.string(),
  audience: z.enum(["A", "B", "C"]),
  media_candidates: z.array(MediaCandidateSchema),
  selected_media_id: z.string().uuid().nullable(),
  copy: GeneratedCopySchema.nullable(),
  facts_to_verify: z.array(z.string()),
  store_profile_version: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Draft = z.infer<typeof DraftSchema>;
