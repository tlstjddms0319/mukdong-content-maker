import { z } from "zod";

export const ImageBriefSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  count: z.number().int().min(1).max(4).default(3),
  aspectRatio: z.literal("4:5").default("4:5"),
});

export type ImageBrief = z.infer<typeof ImageBriefSchema>;
export type ImageAnalysis = {
  subjectClarity: "좋음" | "확인 필요";
  backgroundComplexity: "좋음" | "확인 필요";
  textSpace: "있음" | "부족";
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
