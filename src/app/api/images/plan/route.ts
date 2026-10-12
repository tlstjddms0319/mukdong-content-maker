import { NextResponse } from "next/server";
import { polishPlan } from "@/features/images/copyPolish";
import { ownerApiError } from "@/features/auth/guard";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { CarouselPlanInputSchema, buildCarouselPlanPrompt, carouselMenu, keepScenesOnMenu, planCarousel, slideCountFits, withTrackCount } from "@/features/images/carousel";
import { TRACK_SLIDE_RANGE, applyTrack } from "@/features/images/track";
import { guardSlidePoints } from "@/features/images/slidePoints";
import { randomSeed } from "@/features/images/variety";
import { reviewCarouselPlan } from "@/features/images/planReview";
import { PLAN_FALLBACK_MESSAGES, lenientPlanSchema, planFallbackReason, type PlanFallbackReason } from "@/features/images/planRepair";

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed=CarouselPlanInputSchema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({message:"만들기 설정을 확인해 주세요."},{status:400});
  // 갈래(사진 중심·글 중심)가 오면 장 수는 AI가 4~9장 중에서 정한다(track.ts). 기본 문안(AI 없음)만 5장이다.
  const input={data:withTrackCount(parsed.data)};

  let provider:"gemini"|"groq"|"cloudflare"|"fallback"="fallback";
  // AI 답은 검사 전에 고칠 수 있는 것(긴 요점·장 순서 이름·같은 장면 등)을 고쳐 쓴다(planRepair.ts). 고친 내용은 로그로 남긴다.
  const fixes:string[]=[];
  const requestedPlanSchema=lenientPlanSchema(input.data.track?TRACK_SLIDE_RANGE:input.data.slideCount,fixes);
  let fallbackReason:PlanFallbackReason|null=null;
  const settings=await readSettings().catch((error)=>{console.warn("[settings] 설정을 읽지 못해 기본값을 사용합니다:",error instanceof Error?error.message:String(error));return null;});
  const client=createTextClient(settings?.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
  const plan=await planCarousel(input.data,{
    generate:async()=>{
      const result=await client.generateJson(buildCarouselPlanPrompt(input.data),requestedPlanSchema);
      // 제공자 클라이언트가 이미 검사했어도 한 번 더 같은 "고쳐 쓰기" 스키마로 읽는다(고친 값에 다시 써도 그대로다).
      const candidate=requestedPlanSchema.parse(result);
      if(!slideCountFits(input.data,candidate.slideCount))throw new Error("wrong slide count");
      provider=client.provider??"gemini";
      return candidate;
    },
  },{seed:randomSeed(),onFallback:error=>{
    fallbackReason=planFallbackReason(error);
    const detail=error instanceof Error?error.message.replace(/\s+/g," ").slice(0,300):String(error);
    console.warn(`[plan] AI 구성안을 못 써서 기본 문안으로 채웠어요(${fallbackReason}):`,detail);
  }});
  if(fixes.length)console.info(`[plan] AI 구성안을 고쳐 썼어요: ${[...new Set(fixes)].join(", ")}`);
  // AI가 쓴 구성안은 한 번 더 검수해서 상투어·반복·끝맺음 문제를 고친다(준비된 기본 문안은 이미 다듬어져 있어 건너뛴다).
  let review:{applied:boolean;before:number;after:number}|null=null;
  let polish:{coverChanged:boolean;hookType?:string;shortened:number}|null=null;
  let finalPlan=plan;
  if(provider!=="fallback"){
    // 검수에도 구성안과 같은 주인공 메뉴·사진 설명·내용 메모를 준다. 검수가 글을 바꾸면 장면이 메뉴를 벗어나지 않았는지 한 번 더 맞춘다.
    const menu=carouselMenu(input.data);
    const result=await reviewCarouselPlan(plan,input.data.topic,{review:(prompt,schema)=>client.generateJson(prompt,schema)},{menu,photoNotes:input.data.photoNotes,contentBrief:input.data.contentBrief,track:input.data.track});
    finalPlan=result.applied?keepScenesOnMenu(result.plan,input.data.topic,menu):result.plan;
    review={applied:result.applied,before:result.before,after:result.after};
    if(result.applied)console.info(`[plan-review] 문안 검수 적용: 문제 ${result.before}건 → ${result.after}건`);
    // 검수 뒤 마지막 다듬기(copyPolish.ts): 표지를 후킹 유형으로 다시 쓰고, 카드에 안 들어가는 제목만 줄인다. 실패하면 그대로 쓴다.
    if(input.data.track){
      const polished=await polishPlan(finalPlan,input.data.track,{generate:(prompt,schema)=>client.generateJson(prompt,schema)},input.data.topic);
      finalPlan=polished.plan;
      polish={coverChanged:polished.coverChanged,...(polished.hookType?{hookType:polished.hookType}:{}),shortened:polished.shortened};
      if(polished.coverChanged||polished.shortened)console.info(`[plan-polish] 표지 ${polished.coverChanged?`다시 씀(${polished.hookType})`:"그대로"}, 줄인 제목 ${polished.shortened}개`);
    }
  }
  const fallback=provider==="fallback"?{fallbackReason:fallbackReason??"error",fallbackMessage:PLAN_FALLBACK_MESSAGES[fallbackReason??"error"]}:{};
  // 카드에 찍히는 글을 마지막으로 거른다. 큰 숫자는 주제·메모·사진 설명에 있는 것만 남긴다.
  const sources={topic:input.data.topic,contentBrief:input.data.contentBrief,imageBrief:input.data.imageBrief,photoNotes:input.data.photoNotes};
  const guarded=guardSlidePoints(finalPlan,sources);
  // 갈래 규칙은 검수·거르기가 글을 바꾼 뒤에 마지막으로 한 번 더 맞춘다(제목이 요점으로 바뀌어도 길이·개수가 지켜지게).
  return NextResponse.json({plan:input.data.track?applyTrack(guarded,input.data.track):guarded,provider,review,...(polish?{polish}:{}),...fallback});
}
