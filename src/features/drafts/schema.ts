import { z } from "zod";
import { DesignStyleSchema, PerformanceSchema } from "./performance";

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
  // 보관함에 넣은 게시물(지금은 안 올리고 따로 모아 둔 것). 내 게시물 목록에서는 빼고 '보관함'에서 보인다.
  archived: z.boolean().optional(),
  // 한 달 기획의 어느 게시일에서 시작한 초안인지(YYYY-MM-DD). 기획표가 진행 상태를 보여 줄 때 쓴다.
  plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // 이 초안 카드에 쓴 디자인 계열(성과를 계열별로 비교할 때 쓴다).
  design_style: DesignStyleSchema.optional(),
  // 게시 후 사장님이 직접 적은 성과(좋아요·댓글·저장·공유·도달).
  performance: PerformanceSchema.optional(),
  facts_to_verify: z.array(z.string()),
  store_profile_version: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).superRefine((draft,ctx)=>{
  if(draft.final_review_complete&&(!draft.planned_publish_at||!draft.caption?.trim()||!draft.selected_media_id))ctx.addIssue({code:"custom",path:["final_review_complete"],message:"사진·글·올릴 날짜를 확인해 주세요."});
  if(!draft.selected_media_ids)return;
  if(draft.selected_media_id===null||draft.selected_media_ids[0]!==draft.selected_media_id)ctx.addIssue({code:"custom",path:["selected_media_ids"],message:"첫 선택 이미지를 확인해 주세요."});
  if(new Set(draft.selected_media_ids).size!==draft.selected_media_ids.length)ctx.addIssue({code:"custom",path:["selected_media_ids"],message:"선택 이미지는 중복될 수 없습니다."});
  const candidates=new Set(draft.media_candidates.map(media=>media.id));
  draft.selected_media_ids.forEach((id,index)=>{if(!candidates.has(id))ctx.addIssue({code:"custom",path:["selected_media_ids",index],message:"선택 이미지를 찾을 수 없습니다."});});
});

export type Draft = z.infer<typeof DraftSchema>;
