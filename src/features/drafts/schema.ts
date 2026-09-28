import { z } from "zod";

export const MediaCandidateSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["photo", "design", "ai-generated", "ai-edited"]),
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
  image_brief:z.string().max(600).optional(),
  content_brief:z.string().max(600).optional(),
  selected_media_id: z.string().uuid().nullable(),
  selected_media_ids: z.array(z.string().uuid()).min(1).max(10).optional(),
  copy: GeneratedCopySchema.nullable(),
  caption: z.string().max(2200).optional(),
  planned_publish_at: z.string().datetime().nullable().optional(),
  final_review_complete: z.boolean().optional(),
  facts_to_verify: z.array(z.string()),
  store_profile_version: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).superRefine((draft,ctx)=>{
  if(draft.final_review_complete&&(!draft.planned_publish_at||!draft.caption?.trim()||!draft.selected_media_id))ctx.addIssue({code:"custom",path:["final_review_complete"],message:"이미지·문안·희망일시를 확인해 주세요."});
  if(!draft.selected_media_ids)return;
  if(draft.selected_media_id===null||draft.selected_media_ids[0]!==draft.selected_media_id)ctx.addIssue({code:"custom",path:["selected_media_ids"],message:"첫 선택 이미지를 확인해 주세요."});
  if(new Set(draft.selected_media_ids).size!==draft.selected_media_ids.length)ctx.addIssue({code:"custom",path:["selected_media_ids"],message:"선택 이미지는 중복될 수 없습니다."});
  const candidates=new Set(draft.media_candidates.map(media=>media.id));
  draft.selected_media_ids.forEach((id,index)=>{if(!candidates.has(id))ctx.addIssue({code:"custom",path:["selected_media_ids",index],message:"선택 이미지를 찾을 수 없습니다."});});
});

export type Draft = z.infer<typeof DraftSchema>;
