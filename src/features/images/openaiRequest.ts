import type { ImageBrief } from "./schema";
import { toFile } from "openai";

export const buildImagePrompt=(input:ImageBrief,reference=false)=>[
  `한국 음식점 인스타그램 게시물용 사진. 선택 주제: ${input.topic}.`,
  input.imageBrief ? `기존 이미지 설명: ${input.imageBrief}.` : "",
  input.slide ? `슬라이드 역할: ${input.slide.role}. 장면: ${input.slide.visualPrompt}.` : "세로 4:5 구도, 하나의 음식 피사체가 선명하고 먹음직스럽게 보이며 자연스러운 조명과 여백이 있는 실제 음식 사진 스타일.",
  input.styleAnchor ? `전체 캐러셀 공통 스타일: ${input.styleAnchor}.` : "",
  input.slide ? `나중에 제목을 합성할 수 있도록 사진의 ${input.slide.textPosition==="top"?"위쪽":"아래쪽"}에 복잡하지 않은 안전 여백을 둘 것.` : "",
  reference ? (input.referenceMode==="style" ? "첨부 이미지는 조명과 색감만 참고하고 선택 주제와 슬라이드 장면에 맞는 새 구도로 만들 것." : "첨부한 원본 음식의 형태와 특징은 유지하고 조명, 색감, 구도만 자연스럽게 보완할 것.") : "",
  "이미지 안에 글자, 로고, 가격표를 넣지 말 것. 실제 매장 외관, 손님 얼굴, 확인되지 않은 원산지나 메뉴 구성을 만들지 말 것.",
].filter(Boolean).join(" ");

export function buildImageRequest(input: ImageBrief) {
  return { model:"gpt-image-1" as const, prompt:buildImagePrompt(input), size:"1024x1536" as const, n:input.count };
}

export async function buildImageEditRequest(input:ImageBrief&{referenceImage:string}) {
  const [,mime,encoded]=input.referenceImage.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)??[];
  if(!mime||!encoded)throw new Error("참고 이미지 형식이 올바르지 않습니다.");
  const image=await toFile(Buffer.from(encoded,"base64"),`reference.${mime==="jpeg"?"jpg":mime}`,{type:`image/${mime}`});
  return {model:"gpt-image-1" as const,image,prompt:buildImagePrompt(input,true),size:"1024x1536" as const,n:input.count,input_fidelity:"high" as const};
}
