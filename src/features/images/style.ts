import { z } from "zod";

export const ImageStyleSchema=z.enum(["photo","anime","illustration"]);
export type ImageStyle=z.infer<typeof ImageStyleSchema>;

// [id, 버튼 라벨, 짧은 설명] — 화면 선택기와 프롬프트가 같은 목록을 쓴다.
export const IMAGE_STYLE_OPTIONS:ReadonlyArray<readonly [ImageStyle,string,string]>=[
  ["photo","실사 사진","실제 음식 사진처럼"],
  ["anime","애니메이션","셀 셰이딩의 애니 일러스트"],
  ["illustration","일러스트","단순한 형태의 편집 일러스트"],
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
    look:"Japanese anime-style illustration: clean line art, cel shading, soft painterly background, vibrant but harmonious colors, one clear focal point. Not a photograph and not photorealistic. The food must stay recognizable with the same ingredients and look appetizing. Follow the scene's camera angle.",
  },
  illustration:{
    medium:"일러스트",
    scene:"편집 일러스트로 그릴 음식 장면(사진이 아닌 그림)",
    anchor:"단순한 형태와 절제된 따뜻한 색의 편집 일러스트 화풍",
    look:"Flat editorial illustration: simplified shapes, limited warm palette, subtle paper texture, poster-like composition, one clear focal point. Not a photograph and not photorealistic. The food must stay recognizable with the same ingredients. Follow the scene's camera angle.",
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

// 우선순위: 명시적으로 고른 비(非)사진 화풍 > 수정 요청에서 추론한 화풍 > 실사 사진.
export function resolveImageStyle(input:{imageStyle?:ImageStyle;refinement?:string}):ImageStyle {
  if(input.imageStyle&&input.imageStyle!=="photo")return input.imageStyle;
  return inferImageStyle(input.refinement)??"photo";
}
