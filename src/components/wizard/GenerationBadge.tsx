"use client";

import { isGenerating, plannedCount, useGenerationState } from "@/features/images/generationStore";

// 게시물 만들기가 다른 화면에서도 계속 돌고 있다는 것을 메뉴에서 보여 준다(사진을 다 만든 뒤 저장·글 쓰기 동안에도).
export function GenerationBadge() {
  const generation=useGenerationState();
  const stage=generation.auto.stage;
  if(!isGenerating(generation))return null;
  const label=stage==="saving"||stage==="writing"?"마무리하는 중":generation.phase==="slides"?`만드는 중 ${generation.slides.length}/${plannedCount(generation)}`:"만드는 중";
  return <span className="nav-badge"><span className="progress-dot" aria-hidden="true" />{label}</span>;
}
