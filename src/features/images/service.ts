import { randomUUID } from "node:crypto";
import { ImageBriefSchema, type ImageBrief, type ImageCandidate } from "./schema";

export interface ImageAiClient { generate(brief: ImageBrief): Promise<string[]> }

export async function generateCandidates(input: ImageBrief, ai: ImageAiClient): Promise<ImageCandidate[]> {
  const brief = ImageBriefSchema.parse(input);
  const previews = await ai.generate(brief);
  if (previews.length !== brief.count) throw new Error("요청한 이미지 수와 결과가 다릅니다.");
  return previews.map((preview) => ({
    id: randomUUID(), preview, source: "ai-generated", provider: "openai", model: "automatic",
    promptVersion: "v1", createdAt: new Date().toISOString(),
    analysis: { subjectClarity: "확인 필요", backgroundComplexity: "확인 필요", textSpace: "확인 필요", cropSafety: "확인 필요", disclosureRequired: true },
  }));
}
