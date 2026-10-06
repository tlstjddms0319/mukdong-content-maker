import { z } from "zod";
import { CarouselSlidePlanSchema, rolesForCount } from "./carousel";
import { ImageStyleSchema } from "./style";
import { SlideLayoutSchema } from "./slideLayout";
import { DesignSpecSchema } from "./design";

export const ImageBriefSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  count: z.number().int().min(1).max(4).default(3),
  aspectRatio: z.literal("4:5").default("4:5"),
  imageBrief:z.string().trim().min(1).max(600).optional(),
  imageStyle:ImageStyleSchema.optional(),
  slideLayout:SlideLayoutSchema.optional(),
  refinement:z.string().trim().min(1).max(300).optional(),
  slide:CarouselSlidePlanSchema.optional(),
  slideIndex:z.number().int().min(1).max(10).optional(),
  // 전체 장 수. AI 구성안은 3/5/7/10장이지만, 초안을 고치며 장을 빼거나 넣으면 1~10장 아무 수나 된다(deckEdited).
  slideTotal:z.number().int().min(1).max(10).optional(),
  // 사용자가 장을 빼거나 넣은 캐러셀. 이때는 장 역할 순서(표지→정보→방문)가 구성안 표와 달라지므로 순서 검사를 건너뛴다.
  deckEdited:z.boolean().optional(),
  styleAnchor:z.string().trim().min(12).max(500).optional(),
  // 캐러셀 공통 디자인(색 조합). 없으면 기본 색으로 그린다.
  design:DesignSpecSchema.optional(),
  referenceImage: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(18_000_000).optional(),
  referenceMode:z.enum(["source","style","continuity"]).optional(),
  // 실제 사진으로 만드는 캐러셀: 이 장에 넣을 사진들(사장님이 올린 사진). 있으면 이미지 AI를 부르지 않고 바로 카드를 그린다.
  photos:z.array(z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(8_000_000)).min(1).max(3).optional(),
  // photos를 그릴 때 사진 보정(밝기·색)을 할지. 사장님 사진은 기본 보정, AI 이미지 밑바탕으로 글자만 다시 그릴 때는 false.
  enhance:z.boolean().optional(),
  // 사진 보정 방식: 사장님 사진 "real", AI가 만든 밑바탕 "ai", 보정 없음 "none". 없으면 enhance를 따른다(예전 요청 호환).
  photoKind:z.enum(["real","ai","none"]).optional(),
  // 후보 여러 장을 만들 때 이 요청이 몇 번째 후보부터인지. 앞 제공자가 만든 장수를 이어서 구도를 배정하는 데 쓴다.
  candidateOffset:z.number().int().min(0).max(3).optional(),
  // 이 한 장만의 구도 지시. 후보마다 다른 각도·거리로 만들기 위해 서버가 채운다.
  variant:z.string().trim().min(1).max(200).optional(),
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
  const total=brief.slideTotal;
  if(total!==3&&total!==5&&total!==7&&total!==10){
    ctx.addIssue({code:"custom",path:["slideTotal"],message:"전체 장 수는 3·5·7·10장이에요(장을 고친 캐러셀만 예외)."});
    return;
  }
  if(brief.slide.role!==rolesForCount(total)[brief.slideIndex-1]){
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
