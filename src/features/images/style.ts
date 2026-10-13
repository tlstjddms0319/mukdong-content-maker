import { z } from "zod";

export const ImageStyleSchema=z.enum(["photo","anime","illustration","character"]);
export type ImageStyle=z.infer<typeof ImageStyleSchema>;

// [id, 버튼 라벨, 짧은 설명] — 화면 선택기와 프롬프트가 같은 목록을 쓴다.
export const IMAGE_STYLE_OPTIONS:ReadonlyArray<readonly [ImageStyle,string,string]>=[
  ["photo","실사 사진","실제 음식 사진처럼"],
  ["anime","애니메이션","셀 셰이딩의 애니 일러스트"],
  ["illustration","일러스트","단순한 형태의 편집 일러스트"],
  ["character","캐릭터","음식을 의인화한 캐릭터 그림"],
];

type StyleDirection={
  medium:string;  // "게시물용 ___" 자리에 들어갈 매체 이름
  scene:string;   // 계획 프롬프트에서 visualPrompt가 묘사해야 할 장면 종류
  anchor:string;  // styleAnchor에 넣을 화풍 한 줄
  look:string;    // 이미지 모델에 주는 영어 스타일 지시. 화풍마다 통째로 바뀐다.
};

// 화풍별 문구를 한 표에 모아 두어, 새 화풍을 추가할 때 이 파일만 고치면 된다.
export const IMAGE_STYLE_DIRECTIONS:Record<ImageStyle,StyleDirection>={
  photo:{
    medium:"사진",
    scene:"음식 사진 장면",
    anchor:"실제 음식 사진 질감",
    // 먹음직스러움은 질감(촉촉한 윤기)과 빛(따뜻한 옆빛)에서 나온다. 색온도·화면 비율을 숫자로 주면 작은 모델도 덜 흔들린다.
    look:"Editorial food photography, warm 3200-4000K side light, glossy moist highlights on the food, realistic texture and appetizing natural colors. One clear focal point. Avoid plastic gloss, excessive saturation, decorative clutter and duplicated food shapes. Follow the scene's camera angle.",
  },
  anime:{
    medium:"애니메이션 일러스트",
    scene:"애니메이션 일러스트로 그릴 음식 장면(사진이 아닌 그림)",
    anchor:"셀 셰이딩과 깔끔한 선의 애니메이션 일러스트 화풍",
    // 사장님 지적(2026-10-13): 애니·일러스트 결과가 평범한 클립아트처럼 나왔다. 실사 지시문만큼 구체적으로: 선·명암·색 수·배경·구도·금지 사항.
    look:"High-quality anime-style key-visual illustration, like a frame from a well-produced food anime: confident clean line art with varied line weight, two-tone cel shading plus one soft highlight, a limited harmonious palette of 5-6 colors, a simple softly blurred background that keeps all attention on the food, cinematic composition with the main subject large in frame, warm rim light. The food keeps its real shape, colors and texture and looks appetizing (glossy, steaming, moist where it should be). Not a photograph, not 3D render, not chibi, not sketchy or scribbly, no watermark, no text.",
  },
  illustration:{
    medium:"일러스트",
    scene:"편집 일러스트로 그릴 음식 장면(사진이 아닌 그림)",
    anchor:"단순한 형태와 절제된 따뜻한 색의 편집 일러스트 화풍",
    look:"Polished editorial illustration in the style of a premium food magazine or picture book: clean simplified shapes with crisp edges, flat colors with gentle grain and a few soft shadows, a warm limited palette of 4-6 colors, generous negative space, balanced poster-like composition with one clear focal point. The food keeps its real shape and colors and is drawn with care (visible texture lines, appetizing highlights). Not a photograph, not clip art, not a doodle, no outlines thicker than the shapes need, no watermark, no text.",
  },
  // 그림 콘셉트(images/concepts.ts): 음식을 캐릭터로 그릴 때. 캐릭터여도 어떤 음식인지 알아볼 수 있어야 한다(홍어: 마름모 몸·뾰족한 주둥이·연보라빛 분홍).
  character:{
    medium:"캐릭터 일러스트",
    scene:"음식을 의인화한 캐릭터가 나오는 그림 장면(사진이 아닌 그림)",
    anchor:"둥글고 친근한 캐릭터 일러스트 화풍(굵은 외곽선, 단순한 명암)",
    look:"Charming mascot-character illustration of professional brand quality (like a well-designed food brand mascot): smooth confident outlines of even weight, clean cel shading with one soft highlight, large expressive eyes and a clear emotion, a simple stage-like composition with one focal action and an uncluttered background, a limited harmonious palette. Each food character keeps the real food's silhouette, colors and texture so it is instantly recognizable (a skate character has a diamond-shaped body, pointed snout and dusty mauve-pink flesh with faint cartilage lines). Correct anatomy: the right number of limbs and fingers, no deformed faces, consistent proportions between characters. Not a photograph, not 3D render, not sketchy, no speech bubbles and no written words anywhere.",
  },
};

const STYLE_KEYWORDS:ReadonlyArray<readonly [ImageStyle,RegExp]>=[
  ["anime",/애니|만화|카툰|웹툰|지브리|anime|cartoon/i],
  ["illustration",/일러스트|그림체|그림\s*풍|수채화|벡터|포스터|illustration|watercolor/i],
];

// "애니메이션 풍으로"처럼 수정 요청 문장에 화풍 단어가 있으면 선택기를 안 건드려도 그 화풍으로 본다.
export function inferImageStyle(text?:string):ImageStyle|undefined {
  if(!text)return undefined;
  return STYLE_KEYWORDS.find(([,pattern])=>pattern.test(text))?.[0];
}

// 우선순위: 이 장의 화풍(그림 콘셉트, slide.imageStyle) > 명시적으로 고른 비(非)사진 화풍 > 수정 요청에서 추론한 화풍 > 실사 사진.
export function resolveImageStyle(input:{imageStyle?:ImageStyle;refinement?:string;slide?:{imageStyle?:ImageStyle}}):ImageStyle {
  if(input.slide?.imageStyle&&input.slide.imageStyle!=="photo")return input.slide.imageStyle;
  if(input.imageStyle&&input.imageStyle!=="photo")return input.imageStyle;
  return inferImageStyle(input.refinement)??"photo";
}
