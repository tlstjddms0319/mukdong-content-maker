import { checkTextClaims } from "@/features/guard/service";
import { CopyInputSchema, GeneratedCopySchema, type CopyInput, type CopyPart, type GeneratedCopy } from "./schema";

export interface CopyAiClient { regenerate(part: CopyPart, current: GeneratedCopy, input: CopyInput): Promise<string | string[]> }

export function createFallbackCopy(input: CopyInput): GeneratedCopy {
  const value = CopyInputSchema.parse(input);
  return { topic:value.topic, audience:value.audience, hook:"처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요.", information:"홍어와 돼지고기, 묵은지를 한 점에 곁들이면 서로 다른 맛과 식감을 함께 느낄 수 있어요.", store_connection:"묵동에서 편안하게 한 상을 만나보세요.", call_to_action:"다음 모임을 위해 저장해 두세요.", hashtags:["#묵동맛집", "#홍어삼합", "#중랑구맛집"], facts_used:[], facts_to_verify:[], image_disclosure:"AI로 만든 이미지입니다." };
}

export async function regenerateCopyPart(part: CopyPart, current: GeneratedCopy, input: CopyInput, ai: CopyAiClient): Promise<GeneratedCopy> {
  GeneratedCopySchema.parse(current); CopyInputSchema.parse(input);
  const nextValue = await ai.regenerate(part, current, input);
  const next = GeneratedCopySchema.parse({ ...current, [part]: nextValue });
  const text = [next.hook, next.information, next.store_connection, next.call_to_action, ...next.hashtags].join(" ");
  const guard = checkTextClaims(text);
  if (guard.blocked.length) throw new Error(guard.blocked.join(" "));
  return { ...next, facts_to_verify: [...new Set([...next.facts_to_verify, ...guard.verify])] };
}
