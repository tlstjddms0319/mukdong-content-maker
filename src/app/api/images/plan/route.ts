import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { CarouselPlanInputSchema, CarouselPlanSchema, buildCarouselPlanPrompt, planCarousel } from "@/features/images/carousel";
import { guardSlidePoints } from "@/features/images/slidePoints";
import { randomSeed } from "@/features/images/variety";
import { reviewCarouselPlan } from "@/features/images/planReview";

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const input=CarouselPlanInputSchema.safeParse(await request.json());
  if(!input.success)return NextResponse.json({message:"캐러셀 설정을 확인해 주세요."},{status:400});

  let provider:"gemini"|"groq"|"cloudflare"|"fallback"="fallback";
  const requestedPlanSchema=CarouselPlanSchema.refine((plan)=>plan.slideCount===input.data.slideCount,{message:"요청한 슬라이드 수와 다릅니다."});
  const settings=await readSettings().catch((error)=>{console.warn("[settings] 설정을 읽지 못해 기본값을 사용합니다:",error instanceof Error?error.message:String(error));return null;});
  const client=createTextClient(settings?.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
  const plan=await planCarousel(input.data,{
    generate:async()=>{
      const result=await client.generateJson(buildCarouselPlanPrompt(input.data),requestedPlanSchema);
      const candidate=CarouselPlanSchema.parse(result);
      if(candidate.slideCount!==input.data.slideCount)throw new Error("wrong slide count");
      provider=client.provider??"gemini";
      return candidate;
    },
  },{seed:randomSeed()});
  // AI가 쓴 구성안은 한 번 더 검수해서 상투어·반복·끝맺음 문제를 고친다(준비된 기본 문안은 이미 다듬어져 있어 건너뛴다).
  let review:{applied:boolean;before:number;after:number}|null=null;
  let finalPlan=plan;
  if(provider!=="fallback"){
    const result=await reviewCarouselPlan(plan,input.data.topic,{review:(prompt,schema)=>client.generateJson(prompt,schema)});
    finalPlan=result.plan;
    review={applied:result.applied,before:result.before,after:result.after};
    if(result.applied)console.info(`[plan-review] 문안 검수 적용: 문제 ${result.before}건 → ${result.after}건`);
  }
  return NextResponse.json({plan:guardSlidePoints(finalPlan),provider,review});
}
