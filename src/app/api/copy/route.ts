import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createFallbackCopy } from "@/features/copy/service";
import { CopyInputSchema, GeneratedCopyContentSchema, GeneratedCopySchema } from "@/features/copy/schema";
import { createGeminiClient } from "@/lib/ai/geminiClient";
import { z } from "zod";

const RequestSchema=CopyInputSchema.extend({focus:z.enum(["hook","store_connection","call_to_action","hashtags"]).optional()});

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const input = RequestSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ message:"주제와 대상을 확인해 주세요." }, { status:400 });
  try {
    const copy=GeneratedCopySchema.parse({
      ...await createGeminiClient().generateJson(
      `한국 음식점 인스타그램 문안을 JSON 객체로 작성하세요. 주제: ${input.data.topic}, 대상: ${input.data.audience}. ${input.data.focus?`${input.data.focus} 부분을 새롭게 만드는 데 집중하세요.`:""} 필드: hook, information, store_connection, call_to_action, hashtags(배열), facts_used(배열), facts_to_verify(배열), image_disclosure(null). 짧고 쉬운 한국어를 사용하고 확인되지 않은 가격, 효능, 영업정보는 쓰지 마세요.`,
      GeneratedCopyContentSchema,
      ), topic:input.data.topic, audience:input.data.audience,
    });
    return NextResponse.json({...copy,_meta:{provider:"gemini"}});
  } catch {
    return NextResponse.json({...createFallbackCopy(input.data),_meta:{provider:"fallback"}});
  }
}
