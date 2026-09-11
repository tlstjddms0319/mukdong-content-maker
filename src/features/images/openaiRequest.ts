import type { ImageBrief } from "./schema";

export function buildImageRequest(input: ImageBrief) {
  const prompt = [
    `한국 음식점 인스타그램 게시물용 사진: ${input.topic}.`,
    "세로 4:5 구도, 하나의 음식 피사체가 선명하고 먹음직스럽게 보이며 자연스러운 조명과 여백이 있는 실제 음식 사진 스타일.",
    "이미지 안에 글자, 로고, 가격표를 넣지 말 것. 실제 매장 외관, 손님 얼굴, 확인되지 않은 원산지나 메뉴 구성을 만들지 말 것.",
  ].join(" ");
  return { model:"gpt-image-1" as const, prompt, size:"1024x1536" as const, n:input.count };
}
