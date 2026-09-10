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
    analysis: { subjectClarity: "좋음", backgroundComplexity: "좋음", textSpace: "있음", cropSafety: "안전", disclosureRequired: true },
  }));
}
