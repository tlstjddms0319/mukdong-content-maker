import type { Draft } from "./schema";
import { selectedDraftMedia } from "./selection";

// 초안 요약: 목록 화면(내 초안·이미지 제작실·한 달 기획)·주제 추천·예약 점검이 읽는 가벼운 모양.
// 초안 파일은 카드 이미지를 data URL로 품고 있어 한 개에 수 MB다. 목록마다 그걸 다 읽으면
// 1분마다 도는 예약 점검만으로도 Supabase 무료 전송량(월 5GB)을 금방 넘기고, 화면 HTML도 수십 MB가 됐다.
// 요약에는 이미지 대신 장 수·표지 출처만 두고, 썸네일은 따로 저장해 /api/drafts/thumbnail로 내려준다.
export type DraftSummary=Pick<Draft,"id"|"status"|"topic"|"audience"|"image_brief"|"content_brief"|"caption"|"planned_publish_at"|"final_review_complete"|"plan_date"|"design_style"|"performance"|"selected_media_id"|"created_at"|"updated_at">&{
  imageCount:number;
  coverSource?:Draft["media_candidates"][number]["source"];
  hasCaption:boolean;
};

export function summarizeDraft(draft:Draft):DraftSummary {
  const selected=selectedDraftMedia(draft);
  return {
    id:draft.id,status:draft.status,topic:draft.topic,audience:draft.audience,
    ...(draft.image_brief!==undefined?{image_brief:draft.image_brief}:{}),
    ...(draft.content_brief!==undefined?{content_brief:draft.content_brief}:{}),
    ...(draft.caption!==undefined?{caption:draft.caption}:{}),
    ...(draft.planned_publish_at!==undefined?{planned_publish_at:draft.planned_publish_at}:{}),
    ...(draft.final_review_complete!==undefined?{final_review_complete:draft.final_review_complete}:{}),
    ...(draft.plan_date!==undefined?{plan_date:draft.plan_date}:{}),
    ...(draft.design_style!==undefined?{design_style:draft.design_style}:{}),
    ...(draft.performance!==undefined?{performance:draft.performance}:{}),
    selected_media_id:draft.selected_media_id,
    created_at:draft.created_at,updated_at:draft.updated_at,
    imageCount:selected.length,
    ...(selected[0]?{coverSource:selected[0].source}:{}),
    hasCaption:Boolean(draft.caption?.trim()),
  };
}

// 썸네일 주소. updated_at을 붙여 초안이 바뀌면 브라우저가 새로 받게 한다(같은 주소면 캐시를 쓴다).
export const draftThumbnailUrl=(summary:Pick<DraftSummary,"id"|"updated_at"|"imageCount">)=>summary.imageCount?`/api/drafts/thumbnail?id=${encodeURIComponent(summary.id)}&v=${encodeURIComponent(summary.updated_at)}`:null;
