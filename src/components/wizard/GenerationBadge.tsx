"use client";

import { useGenerationState } from "@/features/images/generationStore";

// 이미지 생성이 다른 화면에서도 계속 돌고 있다는 것을 메뉴에서 보여 준다.
export function GenerationBadge() {
  const generation=useGenerationState();
  const generating=generation.phase==="planning"||generation.phase==="cover"||generation.phase==="slides";
  if(!generating)return null;
  const label=generation.phase==="slides"?`이미지 생성 중 ${generation.slides.length}/${generation.input.slideCount}`:"이미지 생성 중";
  return <span className="nav-badge"><span className="progress-dot" aria-hidden="true" />{label}</span>;
}
