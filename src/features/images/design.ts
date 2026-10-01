import { z } from "zod";
import type { CarouselRole } from "./carousel";
import { BodyFontIdSchema, TitleFontIdSchema, fontCatalogText } from "./typography";
import { ThemeIdSchema, themeCatalogText } from "./themes";
import { StyleIdSchema, styleCatalogText } from "./styleCatalog";

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
export const CardLayoutSchema=z.enum(["fullscreen","frame","illustration","collage","browser","stat","versus","step","qa","quote","magazine","split","polaroid","receipt","checklist","timeline","poster","circle"]);
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
  stat:{label:"대형 숫자",when:"주제나 내용 메모에 확인된 숫자가 있을 때만. 짙은 배경 가운데 아주 큰 숫자(figure)와 그 설명. 숫자가 없으면 고르지 말 것",photoCount:0,coverAllowed:false,
    photoHint:""},
  versus:{label:"A vs B 비교",when:"두 가지를 나란히 비교하는 장. 좌우 반반에 각각 사진·이름·체크 목록, 가운데 VS. keywords의 앞 두 개가 양쪽 이름이 된다",photoCount:2,coverAllowed:false,
    photoHint:"Two candidates, one per side: each shows its own subject clearly centered on a plain background so the pair reads as a comparison."},
  step:{label:"단계 가이드",when:"한 장에 한 단계를 설명하는 장. 왼쪽 위 STEP 스티커, 큰 제목, 가운데 사진, 아래 흰 상자에 설명",photoCount:1,coverAllowed:false,
    photoHint:"Show the action of this single step clearly from the side or above, hands allowed, simple background."},
  qa:{label:"Q&A 말풍선",when:"자주 묻는 질문, 고민 상담처럼 질문과 답이 한 쌍인 장. headline이 질문, 첫 요점이 답, 마지막 요점이 팁. 사진 없음",photoCount:0,coverAllowed:false,
    photoHint:""},
  quote:{label:"인용구",when:"한 문장이 기억에 남게 하는 장, 분위기 장, 표지. 톤을 낮춘 사진 위에 큰 따옴표와 흰 인용구, 아래 출처 줄",photoCount:1,coverAllowed:true,
    photoHint:"Moody editorial photo with muted tones and side light; a back view or hands only, no recognizable face; keep the center-left area calm for text."},
  magazine:{label:"잡지 편집형",when:"메뉴·재료를 차분히 소개하는 장, 표지. 위쪽 큰 사진 아래 작은 머리글, 큰 제목, 가는 선과 본문",photoCount:1,coverAllowed:true,
    photoHint:"Editorial magazine food photo, wide composition, the dish in the upper-middle; the bottom edge of the frame can be cropped."},
  split:{label:"반반 분할",when:"사진과 설명을 나란히 보여 주는 장, 표지. 화면 반쪽은 세로 사진, 반쪽은 제목과 요점",photoCount:1,coverAllowed:true,
    photoHint:"Tall vertical composition with the subject centered horizontally so it survives a narrow half-width crop."},
  polaroid:{label:"폴라로이드",when:"분위기·모임·추억처럼 장면 두 개를 함께 보여 주는 장. 기울어진 폴라로이드 사진 두 장과 손글씨 메모",photoCount:2,coverAllowed:false,
    photoHint:"Casual snapshot-style photo with natural light, like a polaroid taken at the table; each candidate shows a different moment."},
  receipt:{label:"영수증·메뉴판",when:"구성·가격 아닌 차림·준비물처럼 항목을 나열하는 장. 사진 없이 영수증 종이에 항목을 한 줄씩",photoCount:0,coverAllowed:false,photoHint:""},
  checklist:{label:"체크리스트",when:"가기 전 확인할 점, 처음 먹을 때 챙길 것처럼 체크할 항목이 있는 장. 사진 없이 체크 상자 목록",photoCount:0,coverAllowed:false,photoHint:""},
  timeline:{label:"타임라인",when:"먹는 순서, 숙성 과정처럼 시간이나 순서가 있는 장. 사진 없이 세로 선 위 번호 점과 단계",photoCount:0,coverAllowed:false,photoHint:""},
  poster:{label:"큰 글자 포스터",when:"한 문장을 크게 외치는 장, 알림, 표지. 화면을 채우는 큰 제목과 둥근 작은 사진",photoCount:1,coverAllowed:true,
    photoHint:"Simple close-up of the dish on a plain background, subject centered so it reads inside a small circle."},
  circle:{label:"원형 사진",when:"한 접시를 또렷하게 보여 주는 장, 표지. 가운데 큰 원형 사진 아래 제목과 요점",photoCount:1,coverAllowed:true,
    photoHint:"Top-down photo of one plate, centered, with the plate filling most of the frame so it fits a circle."},
};

// 색 조합과 제목·본문 글꼴. 글꼴이 없는 예전 구성안·요청은 기본 글꼴(프리텐다드)로 채운다.
// .default()는 입력에서만 선택이고 출력(JSON 스키마의 기준)에서는 필수라, 엄격 JSON 스키마 제공자에도 그대로 보낼 수 있다.
// 레이아웃마다 그릴 수 있는 모양 변형 수. slide.variant를 이 수로 나눈 나머지로 변형을 고른다(그리기 함수와 맞춰야 한다).
export const LAYOUT_VARIANTS:Record<CardLayout,number>={
  fullscreen:2,frame:2,illustration:2,collage:3,browser:2,stat:2,versus:1,step:2,qa:2,quote:2,
  magazine:1,split:2,polaroid:1,receipt:1,checklist:1,timeline:1,poster:1,circle:1,
};

export const DesignSpecSchema=z.object({
  palette:PaletteIdSchema,
  // 스타일 계열(styleCatalog.ts). template이면 레이아웃+테마로, 그 밖에는 계열 전용 디자인으로 그린다.
  style:StyleIdSchema.default("template"),
  // 게시물 테마(themes.ts). 예전 구성안에는 없으므로 기본값은 지금까지의 스크랩북 모양(classic).
  theme:ThemeIdSchema.default("classic"),
  titleFont:TitleFontIdSchema.default("pretendard"),
  bodyFont:BodyFontIdSchema.default("pretendard"),
});
export type DesignSpec=z.output<typeof DesignSpecSchema>;
// 그리기 함수는 글꼴이 빠진 예전 값도 받는다(빠진 글꼴은 기본값).
export type DesignSpecInput=z.input<typeof DesignSpecSchema>;
export const DEFAULT_DESIGN:DesignSpec={palette:"warm",style:"template",theme:"classic",titleFont:"pretendard",bodyFont:"pretendard"};

export const paletteOf=(design?:DesignSpecInput):Palette=>PALETTES[design?.palette??DEFAULT_DESIGN.palette].colors;

// 상대 휘도(WCAG 식)로 색이 밝은지 판단한다. 6자리 hex만 받는다.
const luminance=(hex:string)=>{
  const n=parseInt(hex.slice(1,7),16);
  const [r,g,b]=[(n>>16)&255,(n>>8)&255,n&255].map(v=>{const c=v/255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;});
  return .2126*r+.7152*g+.0722*b;
};
export const isLight=(hex:string)=>luminance(hex)>.4;

// 흰 상자나 고정된 연한 바탕처럼 팔레트와 무관한 면 위의 글자색. 밤 팔레트는 ink가 밝아 그런 면에서 사라지므로
// 배경과 글자의 밝기가 같을 때만 짙은(또는 밝은) 기본색으로 바꾼다.
export const inkOn=(background:string,palette:Palette)=>isLight(background)===isLight(palette.ink)?(isLight(background)?"#22272a":"#f3efe6"):palette.ink;
export const mutedOn=(background:string,palette:Palette)=>isLight(background)===isLight(palette.muted)?(isLight(background)?"#6d746f":"#b5b0a3"):palette.muted;
export const photosNeeded=(layout:CardLayout)=>CARD_LAYOUTS[layout].photoCount;

// AI가 레이아웃을 고르지 못했을 때와 준비 문안에서 쓰는 역할별 기본 레이아웃. 이웃한 장이 겹치지 않게 짰다.
const ROLE_LAYOUTS:Record<CarouselRole,CardLayout>={
  cover:"fullscreen",
  overview:"collage",
  detail:"frame",
  "how-to":"browser",
  pairing:"illustration",
  process:"browser",
  occasion:"quote",
  mood:"fullscreen",
  visit:"collage",
  cta:"qa",
};

export const defaultCardLayout=(role:CarouselRole):CardLayout=>ROLE_LAYOUTS[role];

// 표지에 본문 전용 레이아웃을 주거나, 숫자 없는 대형 숫자형, 이름 두 개가 없는 비교형처럼 재료가 모자라면 바꾼다.
export function normalizeCardLayout(slide:{role:CarouselRole;layout:CardLayout;figure?:string;keywords?:string[]}):CardLayout {
  const {role,layout}=slide;
  if(role==="cover"&&!CARD_LAYOUTS[layout].coverAllowed)return ROLE_LAYOUTS.cover;
  if(layout==="stat"&&!slide.figure?.trim())return "browser";
  if(layout==="versus"&&(slide.keywords?.length??0)<2)return "frame";
  return layout;
}

// 구성안 프롬프트에 넣는 선택지 설명. 표와 프롬프트가 어긋나지 않게 여기서 만든다.
export function designCatalogText():string {
  const palettes=PaletteIdSchema.options.map(id=>`${id}(${PALETTES[id].label}: ${PALETTES[id].when})`).join(", ");
  const layouts=CardLayoutSchema.options.map(id=>`${id}(${CARD_LAYOUTS[id].label}: ${CARD_LAYOUTS[id].when})`).join(", ");
  return `${styleCatalogText()} design.palette는 주제의 분위기에 맞게 다음 중 하나: ${palettes}. ${themeCatalogText()} ${fontCatalogText()} 각 slide의 layout은 그 장의 내용에 맞게 다음 중 하나: ${layouts}. 표지는 fullscreen, frame, quote 중에서, 본문은 내용에 맞게 고르되 이어지는 두 장이 같은 layout이 되지 않게 섞고, browser·qa·stat·receipt·checklist·timeline은 사진이 없으니 글자 정보가 중심인 장에만 쓰세요. 각 slide의 keywords에는 그 장을 대표하는 2~3자 내외의 짧은 키워드 2~3개를 넣으세요(해시태그·검색창·비교 이름에 쓰임). 각 slide의 figure는 stat 레이아웃에서 크게 보여 줄 숫자(예: "3가지", "48시간")이며, 주제나 내용 메모에 실제로 있는 숫자만 쓰고 그 외에는 빈 문자열로 두세요. 숫자를 지어내지 마세요.`;
}
