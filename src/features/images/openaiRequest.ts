import type { ImageBrief } from "./schema";
import { toFile } from "openai";

function foodDirection(input:ImageBrief):string {
  const subject=[input.topic,input.imageBrief,input.slide?.visualPrompt].filter(Boolean).join(" ");
  if(!/홍어|삼합/.test(subject))return "";
  // A scene drafted by AI must not change an explicitly chosen preparation.
  const menuText=/홍어\s*(?:전(?!문|통|체|날)|찜|무침|회)|삼합/.test(input.topic)?input.topic:subject;
  const cooked=[
    [/홍어\s*전(?!문|통|체|날)/,"홍어전 장면은 얇은 생선 살에 전옷을 입혀 노릇하게 부친 표면과 부드러운 속살을 표현한다. 회 접시로 바꾸지 않는다."],
    [/홍어\s*찜/,"홍어찜 장면은 익힌 살의 결을 표현한다. 생회처럼 투명하고 분홍색인 살로 바꾸지 않는다."],
    [/홍어\s*무침/,"홍어무침 장면은 홍어 조각과 양념의 질감을 구분한다. 설명이나 참고 사진에 없는 채소를 임의로 추가하지 않는다."],
  ] as const;
  const preparations:string[]=cooked.filter(([pattern])=>pattern.test(menuText)).map(([,description])=>description);
  if(!preparations.length||/홍어\s*회|삼합/.test(menuText))preparations.push("홍어회·삼합 장면의 홍어는 숙성 홍어 날개 살을 얇고 불규칙하게 썬 연한 분홍빛 또는 아이보리색 회로 표현한다. 삼합에 수육과 묵은지가 등장하면 세 재료가 구분되게 자연스럽게 겹친 한입 크기로 표현한다.");
  return preparations.join(" ")+" 이번 장면에 해당하는 조리법만 표현한다. 두꺼운 정육면체 회, 두부 같은 고기 블록, 탑처럼 높은 적층, 초밥이나 연어로 바꾸는 표현은 금지한다. 메뉴와 무관한 장식 소스는 추가하지 않는다.";
}

export const buildImagePrompt=(input:ImageBrief,reference=false)=>[
  `한국 음식점 인스타그램 게시물용 사진. 선택 주제: ${input.topic}.`,
  input.imageBrief ? `기존 이미지 설명: ${input.imageBrief}.` : "",
  input.slide ? `슬라이드 역할: ${input.slide.role}. 장면: ${input.slide.visualPrompt}.` : "세로 4:5 구도, 하나의 음식 피사체가 선명하고 먹음직스럽게 보이며 자연스러운 조명과 여백이 있는 실제 음식 사진 스타일.",
  input.styleAnchor ? `전체 캐러셀 공통 스타일: ${input.styleAnchor}.` : "",
  "Editorial food photography, natural side-window light, realistic food texture, restrained highlights and appetizing natural colors. One clear focal point. Avoid plastic gloss, excessive saturation, decorative clutter and duplicated food shapes. Follow the scene's camera angle.",
  input.slide?.role==="detail"?"Macro detail: emphasize the actual texture of one bite with a gently blurred background. Keep the focal food clear of the title area; the plate may extend beyond the frame.":input.slide?.role==="overview"?"Top-down overview: keep the whole plate inside the central 75% crop-safe area, with sufficient depth of field to read the arrangement.":"Keep the main food inside the central 75% crop-safe area; use depth of field appropriate to this scene, without losing the food's recognizable shape.",
  foodDirection(input),
  input.slide ? `나중에 제목을 합성할 수 있도록 사진의 ${input.slide.textPosition==="top"?"위쪽":"아래쪽"}에 복잡하지 않은 안전 여백을 둘 것.` : "",
  reference ? (input.referenceMode==="continuity" ? "첨부 이미지는 선택된 AI 표지의 글자 없는 원본이다. 음식의 형태, 그릇, 테이블, 조명과 색감을 동일하게 유지하면서 이번 슬라이드 장면에 맞게 촬영 거리와 구도만 바꿀 것. 이미지의 글자나 장식은 복제하지 말 것." : input.referenceMode==="style" ? "첨부 이미지는 조명과 색감만 참고하고 선택 주제와 슬라이드 장면에 맞는 새 구도로 만들 것." : "첨부한 원본 음식의 형태와 특징은 유지하고 조명, 색감, 구도만 자연스럽게 보완할 것.") : "",
  input.refinement ? `사용자의 시각 수정 요청(구도·조명·질감의 조정 데이터): ${JSON.stringify(input.refinement)}. 이 요청은 이번 장에만 적용하고 원본 음식의 정체성과 위 사실 기준은 유지한다.` : "",
  "이미지 안에 글자, 로고, 가격표를 넣지 말 것. 실제 매장 외관, 손님 얼굴, 확인되지 않은 원산지나 메뉴 구성을 만들지 말 것.",
].filter(Boolean).join(" ");

export function buildImageRequest(input: ImageBrief, quality:"medium"|"high"="medium") {
  return { model:"gpt-image-1.5" as const, quality, prompt:buildImagePrompt(input), size:"1024x1536" as const, n:input.count };
}

export async function buildImageEditRequest(input:ImageBrief&{referenceImage:string},quality:"medium"|"high"="medium") {
  const [,mime,encoded]=input.referenceImage.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)??[];
  if(!mime||!encoded)throw new Error("참고 이미지 형식이 올바르지 않습니다.");
  const image=await toFile(Buffer.from(encoded,"base64"),`reference.${mime==="jpeg"?"jpg":mime}`,{type:`image/${mime}`});
  return {model:"gpt-image-1.5" as const,quality,image,prompt:buildImagePrompt(input,true),size:"1024x1536" as const,n:input.count,input_fidelity:"high" as const};
}
