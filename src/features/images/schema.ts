import { z } from "zod";
import { CarouselSlidePlanSchema, rolesForCount } from "./carousel";
import { ImageStyleSchema } from "./style";
import { SlideLayoutSchema } from "./slideLayout";
import { DesignSpecSchema } from "./design";
import { FoodBoxSchema } from "./photoAnalysis";

export const ImageBriefSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  count: z.number().int().min(1).max(4).default(3),
  aspectRatio: z.literal("4:5").default("4:5"),
  imageBrief:z.string().trim().min(1).max(600).optional(),
  imageStyle:ImageStyleSchema.optional(),
  slideLayout:SlideLayoutSchema.optional(),
  refinement:z.string().trim().min(1).max(300).optional(),
  // 그림 요청에는 속 글(notes)이 필요 없다(카드에 안 나오고 요청만 커진다).
  slide:CarouselSlidePlanSchema.omit({notes:true}).optional(),
  slideIndex:z.number().int().min(1).max(10).optional(),
  // 전체 장 수. AI 구성안은 3~10장(갈래 게시물은 AI가 4~9장 중 정함)이고, 초안을 고치며 장을 빼거나 넣으면 1~10장 아무 수나 된다(deckEdited).
  slideTotal:z.number().int().min(1).max(10).optional(),
  // 사용자가 장을 빼거나 넣은 캐러셀. 이때는 장 역할 순서(표지→정보→방문)가 구성안 표와 달라지므로 순서 검사를 건너뛴다.
  deckEdited:z.boolean().optional(),
  // 맨 뒤에 가게 홍보 카드가 붙는 캐러셀. slideTotal은 홍보 카드를 포함한 장 수이고, 내용 장의 역할 순서는 그 하나를 뺀 수로 본다.
  storeCard:z.boolean().optional(),
  styleAnchor:z.string().trim().min(12).max(500).optional(),
  // 캐러셀 공통 디자인(색 조합). 없으면 기본 색으로 그린다.
  design:DesignSpecSchema.optional(),
  referenceImage: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(18_000_000).optional(),
  // dish: 사장님 사진 속 음식(종류·양념·썬 모양·그릇)은 그대로, 장면·구도·곁들임은 이 장 글에 맞게 새로(사진 중심의 모자란 장).
  referenceMode:z.enum(["source","style","continuity","dish"]).optional(),
  // 실제 사진으로 만드는 캐러셀: 이 장에 넣을 사진들(사장님이 올린 사진). 있으면 이미지 AI를 부르지 않고 바로 카드를 그린다.
  photos:z.array(z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(8_000_000)).min(1).max(3).optional(),
  // 표지+2장 파노라마: 같은 사진을 표지(left)와 2번째 장(right)에 반씩 쓴다(render/panorama.ts).
  panorama:z.enum(["left","right"]).optional(),
  // photos와 같은 순서로, 사진을 얼마나 가까이 잘라 쓸지(사진이 적을 때 같은 사진을 다른 장에 다시 쓰기, render/photoView.ts).
  photoViews:z.array(z.enum(["full","close","detail"])).max(3).optional(),
  // photos와 같은 순서로, 사진 분석 AI가 본 주인공 음식 자리(없으면 null). 있으면 그 자리를 중심으로 자르고 다가간다(render/photoView.ts).
  photoBoxes:z.array(FoodBoxSchema.nullable()).max(3).optional(),
  // 이 장의 사진 칸 비율(가로÷세로). 서버가 이미지 AI를 부르기 전에 재서 채운다(photoWindow.ts). 이미지 AI가 이 비율로 그린다.
  windowRatio:z.number().min(.3).max(3.5).optional(),
  // photos를 그릴 때 사진 보정(밝기·색)을 할지. 사장님 사진은 기본 보정, AI 이미지 밑바탕으로 글자만 다시 그릴 때는 false.
  enhance:z.boolean().optional(),
  // 사진 보정 방식: 사장님 사진 "real", AI가 만든 밑바탕 "ai", 보정 없음 "none". 없으면 enhance를 따른다(예전 요청 호환).
  photoKind:z.enum(["real","ai","none"]).optional(),
  // 후보 여러 장을 만들 때 이 요청이 몇 번째 후보부터인지. 앞 제공자가 만든 장수를 이어서 구도를 배정하는 데 쓴다.
  candidateOffset:z.number().int().min(0).max(3).optional(),
  // 이 한 장만의 구도 지시. 후보마다 다른 각도·거리로 만들기 위해 서버가 채운다.
  variant:z.string().trim().min(1).max(200).optional(),
  // 지시문 조립 방식(2026-10-20 계획서 0단계). "structured"면 5칸 영어 구조(images/promptSlots.ts), 없으면 예전 방식. A/B 비교가 끝나기 전까지 기본은 예전 방식.
  promptLayout:z.enum(["legacy","structured"]).optional(),
  // 사진 여러 칸 레이아웃(비교·폴라로이드·콜라주)에서 이 한 장이 보여 줄 피사체. 서버가 채운다(candidateBriefs).
  photoFocus:z.string().trim().min(1).max(300).optional(),
}).superRefine((brief,ctx)=>{
  if(!brief.slide)return;
  if(brief.slideIndex===undefined)ctx.addIssue({code:"custom",path:["slideIndex"],message:"슬라이드 순번이 필요합니다."});
  if(brief.slideTotal===undefined)ctx.addIssue({code:"custom",path:["slideTotal"],message:"전체 슬라이드 수가 필요합니다."});
  if(brief.styleAnchor===undefined)ctx.addIssue({code:"custom",path:["styleAnchor"],message:"공통 스타일 기준이 필요합니다."});
  if(brief.slideIndex===undefined||brief.slideTotal===undefined)return;
  if(brief.slideIndex>brief.slideTotal){
    ctx.addIssue({code:"custom",path:["slideIndex"],message:"슬라이드 순번은 전체 장수를 넘을 수 없습니다."});
    return;
  }
  if(brief.deckEdited)return;
  const total=brief.slideTotal-(brief.storeCard?1:0);
  // 구성안 장 수는 3~10장(예전 화면은 3·5·7·10, 갈래 게시물은 AI가 4~9장 중 정한다). 예전에는 3·5·7·10만 받아
  // 6·8장 게시물이 2번째 장부터 "이미지 설정을 확인해 주세요"로 막혔다(2026-10-09).
  if(total<3||total>10){
    ctx.addIssue({code:"custom",path:["slideTotal"],message:"전체 장 수는 3~10장이에요(장을 고친 캐러셀만 예외)."});
    return;
  }
  if(brief.slideIndex>total||brief.slide.role!==rolesForCount(total)[brief.slideIndex-1]){
    ctx.addIssue({code:"custom",path:["slide","role"],message:"슬라이드 역할 순서를 확인해 주세요."});
  }
});

export type ImageBrief = z.infer<typeof ImageBriefSchema>;
export type ImageAnalysis = {
  subjectClarity: "좋음" | "확인 필요";
  backgroundComplexity: "좋음" | "확인 필요";
  textSpace: "있음" | "부족" | "확인 필요";
  cropSafety: "안전" | "확인 필요";
  disclosureRequired: boolean;
};

export type ImageCandidate = {
  id: string;
  preview: string;
  source: "ai-generated";
  provider: string;
  model: string;
  promptVersion: "v1";
  createdAt: string;
  analysis: ImageAnalysis;
};
