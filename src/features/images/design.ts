import { z } from "zod";
import type { CarouselRole } from "./carousel";

// 카드 디자인은 "AI가 백지에 그리기"가 아니라, 아래 선택지 안에서 주제에 맞게 고르는 방식이다.
// 선택지 밖의 값은 스키마가 걸러내고, 어울리지 않는 조합은 normalizeCardLayout이 바로잡는다.
// 새 색 조합이나 레이아웃을 더할 때는 이 파일의 표와 composeSlide.ts의 그리기 함수만 추가하면 된다.

export const PaletteIdSchema=z.enum(["warm","sea","night","herb","clay","plum"]);
export type PaletteId=z.infer<typeof PaletteIdSchema>;

export type Palette={
  paper:string;   // 카드 바탕
  ink:string;     // 제목·본문 글자
  accent:string;  // 라벨, 강조점, 강조 배경
  muted:string;   // 브랜드 줄, 보조 글자
  onAccent:string;// 강조 배경 위 글자
};

export const PALETTES:Record<PaletteId,{label:string;when:string;colors:Palette}>={
  warm:{label:"따뜻한 종이",when:"기본. 구운 음식, 저녁 식탁, 편안한 분위기",colors:{paper:"#f6f2ea",ink:"#1f2b27",accent:"#c65138",muted:"#6d746f",onAccent:"#fff4ec"}},
  sea:{label:"바다·비",when:"생선·해산물의 신선함, 비 오는 날, 차분한 설명",colors:{paper:"#eef3f4",ink:"#15303a",accent:"#2f6f8f",muted:"#5f7a84",onAccent:"#eef6fa"}},
  night:{label:"밤·술자리",when:"저녁 술자리, 막걸리, 어두운 조명의 분위기",colors:{paper:"#1d2420",ink:"#f3efe6",accent:"#e0a458",muted:"#b5b0a3",onAccent:"#1d2420"}},
  herb:{label:"풀·신선",when:"채소, 곁들임, 가볍고 신선한 이야기",colors:{paper:"#f1f4ec",ink:"#22311f",accent:"#4f7a3a",muted:"#6b7566",onAccent:"#f3f7ee"}},
  clay:{label:"흙·숙성",when:"삭힘, 숙성, 전통, 오래된 방법 이야기",colors:{paper:"#f3e9df",ink:"#3a2a22",accent:"#b4532b",muted:"#7a6a60",onAccent:"#fbf1e8"}},
  plum:{label:"자두·묵은지",when:"묵은지, 발효 향, 강한 맛을 다루는 이야기",colors:{paper:"#f4eef2",ink:"#2b1e2a",accent:"#8a3f6b",muted:"#7a6a76",onAccent:"#f8eef4"}},
};

export const CardLayoutSchema=z.enum(["cover-bleed","photo-top","split","statement","steps"]);
export type CardLayout=z.infer<typeof CardLayoutSchema>;

export const CARD_LAYOUTS:Record<CardLayout,{label:string;when:string;coverOnly?:boolean;bodyOnly?:boolean}>={
  "cover-bleed":{label:"표지",when:"표지 전용. 사진이 위를 꽉 채우고 아래에 큰 제목",coverOnly:true},
  "photo-top":{label:"사진 위 설명",when:"사진이 주인공이고 요점이 2~3줄인 설명 장",bodyOnly:true},
  split:{label:"반반",when:"사진과 글의 비중이 비슷한 장. 사진이 위 절반을 꽉 채우고 아래에 제목과 요점",bodyOnly:true},
  statement:{label:"큰 글자",when:"질문이나 한 문장으로 생각을 멈추게 하는 장, 다음 장으로 넘기는 장. 강조색 배경에 큰 제목, 사진은 작게",bodyOnly:true},
  steps:{label:"순서",when:"먹는 순서, 만드는 순서처럼 요점이 단계인 장. 번호가 크게 붙는다",bodyOnly:true},
};

export const DesignSpecSchema=z.object({palette:PaletteIdSchema});
export type DesignSpec=z.infer<typeof DesignSpecSchema>;
export const DEFAULT_DESIGN:DesignSpec={palette:"warm"};

export const paletteOf=(design?:DesignSpec):Palette=>PALETTES[design?.palette??DEFAULT_DESIGN.palette].colors;

// AI가 레이아웃을 고르지 못했을 때와 준비 문안에서 쓰는 역할별 기본 레이아웃.
const ROLE_LAYOUTS:Record<CarouselRole,CardLayout>={
  cover:"cover-bleed",
  overview:"photo-top",
  detail:"photo-top",
  "how-to":"steps",
  pairing:"split",
  process:"steps",
  occasion:"split",
  mood:"statement",
  visit:"statement",
  cta:"statement",
};

export const defaultCardLayout=(role:CarouselRole):CardLayout=>ROLE_LAYOUTS[role];

// 표지에 본문 레이아웃을 주거나 본문에 표지 레이아웃을 주면 역할 기본값으로 바꾼다.
export function normalizeCardLayout(role:CarouselRole,layout:CardLayout):CardLayout {
  const rule=CARD_LAYOUTS[layout];
  if(role==="cover"&&rule.bodyOnly)return ROLE_LAYOUTS.cover;
  if(role!=="cover"&&rule.coverOnly)return ROLE_LAYOUTS[role];
  return layout;
}

// 구성안 프롬프트에 넣는 선택지 설명. 표와 프롬프트가 어긋나지 않게 여기서 만든다.
export function designCatalogText():string {
  const palettes=PaletteIdSchema.options.map(id=>`${id}(${PALETTES[id].label}: ${PALETTES[id].when})`).join(", ");
  const layouts=CardLayoutSchema.options.map(id=>`${id}(${CARD_LAYOUTS[id].label}: ${CARD_LAYOUTS[id].when})`).join(", ");
  return `design.palette는 주제의 분위기에 맞게 다음 중 하나: ${palettes}. 각 slide의 layout은 그 장의 내용에 맞게 다음 중 하나: ${layouts}. 표지는 cover-bleed, 본문은 나머지 중에서 고르고, 이어지는 두 장이 같은 layout이 되지 않게 섞으세요.`;
}
