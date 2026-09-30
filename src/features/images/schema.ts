import { z } from "zod";
import { CarouselSlidePlanSchema, rolesForCount } from "./carousel";
import { ImageStyleSchema } from "./style";
import { SlideLayoutSchema } from "./slideLayout";

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
  slideTotal:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]).optional(),
  styleAnchor:z.string().trim().min(12).max(500).optional(),
  referenceImage: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(18_000_000).optional(),
  referenceMode:z.enum(["source","style","continuity"]).optional(),
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
  if(brief.slide.role!==rolesForCount(brief.slideTotal)[brief.slideIndex-1]){
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
