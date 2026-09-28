import { checkTextClaims } from "@/features/guard/service";
import { CopyInputSchema, GeneratedCopySchema, type CopyInput, type CopyPart, type GeneratedCopy } from "./schema";

export interface CopyAiClient { regenerate(part: CopyPart, current: GeneratedCopy, input: CopyInput): Promise<string | string[]> }
export interface InitialCopyAiClient { generate(input: CopyInput): Promise<GeneratedCopy> }

export function createFallbackCopy(input: CopyInput): GeneratedCopy {
  const value = CopyInputSchema.parse(input);
  return { topic:value.topic, audience:value.audience, hook:value.topic, information:"아직 AI 문안을 완성하지 못했어요. 이 주제에서 소개하고 싶은 맛과 식감, 먹는 방법을 직접 적거나 문안 생성을 다시 시도해 주세요.", store_connection:"묵동홍어마을에서 전하고 싶은 이야기를 여기에 적어 주세요.", call_to_action:"방문 전에 궁금한 점을 확인하고, 다음 식사 계획에 참고해 주세요.", hashtags:["#묵동맛집", "#중랑구맛집", "#묵동홍어마을"], facts_used:[], facts_to_verify:["AI 생성 전의 작성용 틀입니다. 내용을 완성한 뒤 게시해 주세요."], image_disclosure:null };
}

export async function generateCopy(input:CopyInput, ai?:InitialCopyAiClient):Promise<GeneratedCopy> {
  const parsed = CopyInputSchema.parse(input);
  if (!ai) return createFallbackCopy(parsed);
  try {
    return GeneratedCopySchema.parse(await ai.generate(parsed));
  } catch {
    return createFallbackCopy(parsed);
  }
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
