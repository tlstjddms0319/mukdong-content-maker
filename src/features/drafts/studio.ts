import { z } from "zod";

// 게시물과 함께 저장하는 "만들기 상태"(구성안 + 장마다 밑바탕). 내 게시물에서 다시 열어도 장 고치기(그림·글)·글자 직접 고치기·
// 장 넣기·빼기를 그대로 쓰게 한다. 예전에는 완성된 카드 그림만 저장해서, 다시 열면 고칠 정보가 없어 고치기 칸이 사라졌다.
//   plan     : 구성안(장마다 제목·짧은 글·디자인). 화면이 CarouselPlanSchema로 다시 확인하고 쓴다(여기서는 모양만 본다).
//   photos   : 사장님 사진(사진 묶음·AI가 참고한 사진). 장의 assignment/refPhoto가 이 번호를 가리킨다.
//   slides   : 장마다 밑바탕 — bases(AI 원본, 글자 없는 그림) 또는 assignment(사장님 사진 번호)·views(얼마나 가까이).
//   storeCard: 맨 뒤 홍보 카드를 붙였는지(붙였으면 저장된 그림의 마지막 장이 홍보 카드다).
// 그림은 서버가 저장하기 전에 작게 줄인다(compactStudio, 저장 공간을 아끼려고).
// 서버·화면이 함께 쓰므로 서버 전용 모듈을 불러오지 않는다.
const ImageData=z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(8_000_000);
export const StudioSlideSchema=z.object({
  bases:z.array(ImageData).max(3).optional(),
  assignment:z.array(z.number().int().min(0).max(9)).max(3).default([]),
  views:z.array(z.enum(["full","close","detail"])).max(3).default([]),
  refPhoto:z.number().int().min(0).max(9).optional(),
  drawnAt:z.string().max(2000).optional(),
});
export const StudioSnapshotSchema=z.object({
  version:z.literal(1),
  plan:z.unknown(),
  mode:z.enum(["photo","ai"]),
  imageStyle:z.string().max(40),
  slideLayout:z.string().max(40),
  photos:z.array(z.object({id:z.string().min(1).max(200),preview:ImageData,name:z.string().max(200).optional()})).max(10),
  slides:z.array(StudioSlideSchema).min(1).max(10),
  storeCard:z.boolean(),
});
export type StudioSnapshot=z.infer<typeof StudioSnapshotSchema>;
export type StudioSnapshotInput=z.input<typeof StudioSnapshotSchema>;
