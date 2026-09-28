import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createGeminiClient } from "@/lib/ai/geminiClient";
import { CarouselPlanInputSchema, CarouselPlanSchema, planCarousel, rolesForCount } from "@/features/images/carousel";

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const input=CarouselPlanInputSchema.safeParse(await request.json());
  if(!input.success)return NextResponse.json({message:"캐러셀 설정을 확인해 주세요."},{status:400});

  let provider:"gemini"|"fallback"="fallback";
  const requestedPlanSchema=CarouselPlanSchema.refine((plan)=>plan.slideCount===input.data.slideCount,{message:"요청한 슬라이드 수와 다릅니다."});
  const plan=await planCarousel(input.data,{
    generate:async()=>{
      const result=await createGeminiClient().generateJson(
        `한국 음식점 Instagram 캐러셀 구성안을 JSON 객체로 작성하세요. 선택한 주제 "${input.data.topic}"를 바꾸지 말고 모든 장면에 일관되게 반영하세요. 기존 이미지 설명: ${input.data.imageBrief ?? "없음"}. slideCount는 ${input.data.slideCount}, slides의 role 순서는 ${rolesForCount(input.data.slideCount).join(" → ")}를 정확히 지키세요. styleAnchor에는 전 장이 공유할 색감, 조명, 그릇, 테이블 기준을 쓰세요. 각 headline은 짧은 한국어로 한 가지 정보만 전달하고 같은 뜻의 제목을 반복하지 마세요. 표지는 음식에 대한 구체적인 궁금증, 중간 장은 질감·먹는 방법, 마지막 장은 방문 전 확인으로 이어지게 하세요. 홍어의 향이 사라진다거나 누구나 좋아한다고 보장하지 마세요. 홍어회와 홍어전·찜·무침의 조리법을 구분하고 선택 주제에 없는 삼합 구성을 강제하지 마세요. visualPrompt는 서로 다른 촬영 거리와 구도의 음식 사진 장면으로 쓰고 이미지 안 글자나 로고를 요청하지 마세요. 확인되지 않은 가격, 원산지, 영업시간, 매장 정보는 만들지 마세요. 각 slide는 role, headline, visualPrompt, textPosition(top 또는 bottom)을 포함해야 합니다.`,
        requestedPlanSchema,
      );
      const candidate=CarouselPlanSchema.parse(result);
      if(candidate.slideCount!==input.data.slideCount)throw new Error("wrong slide count");
      provider="gemini";
      return candidate;
    },
  });
  return NextResponse.json({plan,provider});
}
