import { z } from "zod";
import type { CarouselRole } from "./carousel";

// 슬라이드 디자인 두 가지.
// card: 밝은 종이 배경에 라벨·제목·삽입 사진·본문·브랜드 줄을 놓는 카드뉴스형(참고 템플릿 대부분).
// overlay: 사진을 전면에 깔고 어두운 그라데이션 위에 글자를 올리는 형.
export const SlideLayoutSchema=z.enum(["card","overlay"]);
export type SlideLayout=z.infer<typeof SlideLayoutSchema>;
export const DEFAULT_SLIDE_LAYOUT:SlideLayout="card";

export const SLIDE_LAYOUT_OPTIONS:ReadonlyArray<readonly [SlideLayout,string,string]>=[
  ["card","카드형","밝은 배경에 사진을 넣고 글을 아래에"],
  ["overlay","사진 위 글자","사진을 꽉 채우고 글자를 겹쳐서"],
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
