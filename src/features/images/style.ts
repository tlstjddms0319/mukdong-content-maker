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
    look:"Charming mascot-character illustration of professional brand quality (like a well-designed food brand mascot): smooth confident outlines of even weight, clean cel shading with one soft highlight, large expressive eyes and a clear emotion on whole-fish mascot characters only (any plated, sliced or cooked food in the scene has no face and looks real, glossy and appetizing), a simple stage-like composition with one focal action and an uncluttered background, a limited harmonious palette. Each food character keeps the real food's silhouette, colors and texture so it is instantly recognizable (a skate character has a diamond-shaped body, pointed snout and dusty mauve-pink flesh with faint cartilage lines). Correct anatomy: the right number of limbs and fingers, no deformed faces, consistent proportions between characters. Not a photograph, not 3D render, not sketchy, no speech bubbles and no written words anywhere.",
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

// 그림(비실사) 공통 품질 지시(사장님 2026-10-13 "그림 화풍 더 강화"). 실사의 PROPS·촬영 힌트 대신 그림 장에 붙는다(openaiRequest.ts).
// 모델이 "대충 그린 그림"으로 빠지기 쉬운 지점(선 품질·해부·여백·일관성·구도)을 하나씩 못 박는다. 글자 금지는 프롬프트 앞뒤에 따로 있다.
export const DRAWN_QUALITY="Professional illustration quality, as if commissioned for a food brand's social media: every line deliberate and clean, no stray sketch marks or muddy color patches, edges crisp, colors fully rendered (no unfinished or washed-out areas). Correct anatomy and proportions on every character and hand; nothing melted, duplicated or cut off. The main subject fills the middle of the frame with calm empty space at the top and bottom; keep the composition balanced and readable at thumbnail size. Keep the same drawing style, line weight and palette across the whole carousel.";

// 화풍별 연출(장면 묘사가 글에서 오므로, 여기서는 '어떻게 그릴지'만): 캐릭터는 같은 캐릭터가 장마다 같은 생김새, 장면 그림은 빛·깊이, 애니는 표정·연출.
export const DRAWN_DIRECTION:Record<Exclude<ImageStyle,"photo">,string>={
  anime:"Render it like a polished anime still: expressive but natural faces, dynamic yet readable staging, atmospheric lighting (warm rim light, soft bloom on steam or glossy food), background painted simply with depth. Food is drawn with real appetite appeal — glossy sauce, visible texture, steam where hot.",
  illustration:"Render it like a premium editorial piece: shapes simplified with intent, textures suggested with a few confident strokes, soft directional light giving depth, a cohesive warm palette, and the dish rendered with enough detail (surface texture, highlights) that it looks delicious rather than iconic.",
  character:"Render it like a brand mascot sheet come to life: each food character has one consistent design (same face, colors, markings and accessories in every slide), clear silhouettes that read instantly, appealing rounded forms, confident poses that tell the action, and a simple stage or table setting that keeps focus on the characters.",
};
export const drawnDirective=(style:ImageStyle):string=>style==="photo"?"":`${DRAWN_DIRECTION[style]} ${DRAWN_QUALITY}`;
