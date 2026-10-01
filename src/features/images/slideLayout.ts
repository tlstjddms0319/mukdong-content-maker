import { z } from "zod";
import type { CarouselRole } from "./carousel";

// 슬라이드 디자인 선택.
// card: AI가 장마다 다섯 가지 스타일(풀스크린·대조 프레임·일러스트·콜라주·브라우저) 중에서 고른다.
// overlay: 모든 장을 감성 풀스크린(사진 위 글자)으로 통일한다.
export const SlideLayoutSchema=z.enum(["card","overlay"]);
export type SlideLayout=z.infer<typeof SlideLayoutSchema>;
export const DEFAULT_SLIDE_LAYOUT:SlideLayout="card";

export const SLIDE_LAYOUT_OPTIONS:ReadonlyArray<readonly [SlideLayout,string,string]>=[
  ["card","장마다 자동","AI가 장마다 어울리는 스타일을 골라요"],
  ["overlay","사진 위 글자","모든 장을 사진 꽉 찬 감성형으로"],
];

export const STORE_NAME="묵동홍어마을";

// 본문 슬라이드 상단 라벨("02 · 먹는 법")에 쓰는 역할 이름.
export const ROLE_LABELS:Record<CarouselRole,string>={
  cover:"",
  overview:"한눈에",
  detail:"자세히",
  "how-to":"먹는 법",
  pairing:"곁들임",
  process:"준비 과정",
  occasion:"이런 날",
  mood:"분위기",
  visit:"방문 전",
  cta:"다음 한 점",
};

export const slideEyebrow=(role:CarouselRole,index:number)=>role==="cover"?`${STORE_NAME} · 음식 이야기`:`${String(index).padStart(2,"0")} · ${ROLE_LABELS[role]}`;
