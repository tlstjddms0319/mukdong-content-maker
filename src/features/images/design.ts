import { z } from "zod";
import type { CarouselRole } from "./carousel";

// 카드 디자인은 "AI가 백지에 그리기"가 아니라, 아래 선택지 안에서 주제에 맞게 고르는 방식이다.
// 선택지 밖의 값은 스키마가 걸러내고, 어울리지 않는 조합은 normalizeCardLayout이 바로잡는다.
// 새 색 조합이나 레이아웃을 더할 때는 이 파일의 표와 composeSlide.ts의 그리기 함수만 추가하면 된다.

export const PaletteIdSchema=z.enum(["warm","sea","night","herb","clay","plum"]);
export type PaletteId=z.infer<typeof PaletteIdSchema>;

export type Palette={
  paper:string;     // 밝은 바탕(콜라주)
  soft:string;      // 파스텔 바탕(일러스트·브라우저)
  ink:string;       // 제목·본문 글자
  accent:string;    // 라벨, 강조 글자, 강조 배경
  muted:string;     // 보조 글자
  highlight:string; // 말풍선·검색창 캡슐
  onAccent:string;  // 강조 배경 위 글자
};

export const PALETTES:Record<PaletteId,{label:string;when:string;colors:Palette}>={
  warm:{label:"따뜻한 종이",when:"기본. 구운 음식, 저녁 식탁, 편안한 분위기",colors:{paper:"#f6f2ea",soft:"#f3e3d3",ink:"#1f2b27",accent:"#c65138",muted:"#6d746f",highlight:"#f5c84b",onAccent:"#fff4ec"}},
  sea:{label:"바다·비",when:"생선·해산물의 신선함, 비 오는 날, 차분한 설명",colors:{paper:"#eef3f4",soft:"#d9e8ee",ink:"#15303a",accent:"#2f6f8f",muted:"#5f7a84",highlight:"#f2d16b",onAccent:"#eef6fa"}},
  night:{label:"밤·술자리",when:"저녁 술자리, 막걸리, 어두운 조명의 분위기",colors:{paper:"#1d2420",soft:"#2b332e",ink:"#f3efe6",accent:"#e0a458",muted:"#b5b0a3",highlight:"#e0a458",onAccent:"#1d2420"}},
  herb:{label:"풀·신선",when:"채소, 곁들임, 가볍고 신선한 이야기",colors:{paper:"#f1f4ec",soft:"#dcebd0",ink:"#22311f",accent:"#4f7a3a",muted:"#6b7566",highlight:"#f1d46a",onAccent:"#f3f7ee"}},
  clay:{label:"흙·숙성",when:"삭힘, 숙성, 전통, 오래된 방법 이야기",colors:{paper:"#f3e9df",soft:"#ead5c3",ink:"#3a2a22",accent:"#b4532b",muted:"#7a6a60",highlight:"#f0c35a",onAccent:"#fbf1e8"}},
  plum:{label:"자두·묵은지",when:"묵은지, 발효 향, 강한 맛을 다루는 이야기",colors:{paper:"#f4eef2",soft:"#e8d6e2",ink:"#2b1e2a",accent:"#8a3f6b",muted:"#7a6a76",highlight:"#f2cf6a",onAccent:"#f8eef4"}},
};

// 사장님이 고른 다섯 가지 카드뉴스 스타일. 글자는 코드로 찍고, 사진 분위기만 photoHint로 이미지 AI에 전달한다.
export const CardLayoutSchema=z.enum(["fullscreen","frame","illustration","collage","browser"]);
export type CardLayout=z.infer<typeof CardLayoutSchema>;

export const CARD_LAYOUTS:Record<CardLayout,{label:string;when:string;photoCount:number;coverAllowed:boolean;photoHint:string}>={
  fullscreen:{label:"감성 풀스크린",when:"표지, 분위기 장, 한 문장으로 마음을 건드리는 장. 사진이 화면을 꽉 채우고 아래 가운데에 큰 흰 제목",photoCount:1,coverAllowed:true,
    photoHint:"Full-screen lifestyle photo: warm tone, soft sunlight, a touch of analog film grain. Keep the bottom 45% of the frame calm and uncluttered for a title."},
  frame:{label:"대조 프레임",when:"문제 제기, 비교, 반전 메시지. 흐린 배경 가운데 얇은 흰 테두리 프레임에 선명한 장면",photoCount:1,coverAllowed:true,
    photoHint:"One clear, calm subject centered in the frame with simple edges; the center must read well even when the surroundings are blurred."},
  illustration:{label:"일러스트 설명",when:"어려운 정보를 친근하게 풀어 주는 장. 파스텔 배경 위 기울어진 흰 카드, 일러스트, 노란 말풍선",photoCount:1,coverAllowed:false,
    photoHint:"Soft pastel background, simple rounded shapes, one friendly centered subject, no clutter."},
  collage:{label:"사진 콜라주",when:"메뉴 소개, 조합, 한 상 구성처럼 여러 장면을 보여 주는 장. 밝은 바탕에 사진 세 장 격자와 태그 알약",photoCount:3,coverAllowed:false,
    photoHint:"Clean editorial food photo with the subject centered and crop-safe; each candidate takes a clearly different angle so the three read as a set."},
  browser:{label:"브라우저 프레임",when:"먹는 순서, 확인할 점처럼 글자 위주 정보 장. 사진 없이 파스텔 배경에 브라우저 창 그래픽과 번호 목록",photoCount:0,coverAllowed:false,
    photoHint:""},
};

export const DesignSpecSchema=z.object({palette:PaletteIdSchema});
export type DesignSpec=z.infer<typeof DesignSpecSchema>;
export const DEFAULT_DESIGN:DesignSpec={palette:"warm"};

export const paletteOf=(design?:DesignSpec):Palette=>PALETTES[design?.palette??DEFAULT_DESIGN.palette].colors;
export const photosNeeded=(layout:CardLayout)=>CARD_LAYOUTS[layout].photoCount;

// AI가 레이아웃을 고르지 못했을 때와 준비 문안에서 쓰는 역할별 기본 레이아웃. 이웃한 장이 겹치지 않게 짰다.
const ROLE_LAYOUTS:Record<CarouselRole,CardLayout>={
  cover:"fullscreen",
  overview:"collage",
  detail:"frame",
  "how-to":"browser",
  pairing:"illustration",
  process:"browser",
  occasion:"fullscreen",
  mood:"fullscreen",
  visit:"collage",
  cta:"frame",
};

export const defaultCardLayout=(role:CarouselRole):CardLayout=>ROLE_LAYOUTS[role];

// 표지에 본문 전용 레이아웃을 주면 표지 기본값으로 바꾼다.
export function normalizeCardLayout(role:CarouselRole,layout:CardLayout):CardLayout {
  if(role==="cover"&&!CARD_LAYOUTS[layout].coverAllowed)return ROLE_LAYOUTS.cover;
  return layout;
}

// 구성안 프롬프트에 넣는 선택지 설명. 표와 프롬프트가 어긋나지 않게 여기서 만든다.
export function designCatalogText():string {
  const palettes=PaletteIdSchema.options.map(id=>`${id}(${PALETTES[id].label}: ${PALETTES[id].when})`).join(", ");
  const layouts=CardLayoutSchema.options.map(id=>`${id}(${CARD_LAYOUTS[id].label}: ${CARD_LAYOUTS[id].when})`).join(", ");
  return `design.palette는 주제의 분위기에 맞게 다음 중 하나: ${palettes}. 각 slide의 layout은 그 장의 내용에 맞게 다음 중 하나: ${layouts}. 표지는 fullscreen 또는 frame, 본문은 내용에 맞게 고르되 이어지는 두 장이 같은 layout이 되지 않게 섞고, browser는 사진이 없으니 글자 정보가 중심인 장에만 쓰세요. 각 slide의 keywords에는 그 장을 대표하는 2~3자 내외의 짧은 키워드 2~3개를 넣으세요(해시태그·검색창에 쓰임).`;
}
