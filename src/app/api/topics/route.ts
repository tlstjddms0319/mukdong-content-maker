import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { z } from "zod";
import { suggestTopics, topicDirectionsForRound } from "@/features/topics/service";
import { TopicInputSchema, TopicSuggestionSchema } from "@/features/topics/schema";
import { createGeminiClient } from "@/lib/ai/geminiClient";

const RequestSchema = z.object({
  storeProfile: z.object({ name: z.string().trim().min(1).max(80) }),
  intent: z.string().trim().max(300).optional(),
  recommendationRound: z.number().int().nonnegative().max(9999).optional(),
  excludeTitles: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
});

function suggestionsForDirections(directions: readonly string[]) {
  const expected = new Set(directions);
  return z.array(TopicSuggestionSchema.extend({ direction:z.string() })).length(3).superRefine((topics,context) => {
    const actual = topics.map((topic) => topic.direction);
    if (new Set(actual).size !== expected.size || actual.some((direction) => !expected.has(direction))) {
      context.addIssue({ code:"custom", message:"추천 방향이 요청과 일치하지 않습니다." });
    }
  });
}

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  try {
    const body = RequestSchema.parse(await request.json());
    const input = TopicInputSchema.parse({ storeName: body.storeProfile.name, intent: body.intent, recommendationRound:body.recommendationRound, excludeTitles:body.excludeTitles });
    const directions = topicDirectionsForRound(input.recommendationRound);
    const topics = await suggestTopics(input, { suggest:() => createGeminiClient().generateJson(
      `당신은 한국 음식점 인스타그램 기획자입니다. ${input.storeName}을 홍보할 게시물 주제 3개를 JSON 배열로 작성하세요. 이번 추천 방향은 ${directions.map((direction,index)=>`${index + 1}) ${direction}`).join(", ")}이며 각 방향을 정확히 하나씩 사용하세요. 현재 화면의 주제 ${input.excludeTitles.length ? input.excludeTitles.map((title)=>`"${title}"`).join(", ") : "없음"}과 제목뿐 아니라 핵심 관점도 반복하지 마세요. 의도: ${input.intent || "처음 방문하는 손님에게 홍어를 쉽게 소개"}. 각 항목은 id, title, summary, reason, audience(A/B/C 중 하나), imageBrief와 이번 추천 방향 중 정확히 일치하는 direction을 포함하고 검증되지 않은 가격, 효능, 영업정보는 쓰지 마세요.`,
      suggestionsForDirections(directions),
    ) });
    return NextResponse.json({ topics });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({ message: "주제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
