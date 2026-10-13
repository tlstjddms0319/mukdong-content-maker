import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { CarouselPlanSchema } from "@/features/images/carousel";
import { CarouselTrackSchema } from "@/features/images/track";
import { ConceptProposalSchema, buildConceptPrompt, photoConcept, readConceptProposal } from "@/features/images/concepts";

// 그림 콘셉트 후보(features/images/concepts.ts): 실사(항상 첫 번째) + AI 제안 최대 2개.
// AI가 없거나 실패하면 실사만 돌려준다(화면은 후보가 하나면 고르는 단계를 건너뛴다).
const RequestSchema=z.object({topic:z.string().trim().min(1).max(200),track:CarouselTrackSchema,plan:CarouselPlanSchema});

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed=RequestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"구성안을 확인해 주세요."},{status:400});
  const {topic,track,plan}=parsed.data;
  const photo=photoConcept(plan);
  const settings=await readSettings().catch(()=>null);
  const client=createTextClient(settings?.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
  try{
    const raw=await client.generateJson(buildConceptPrompt(plan,topic,track),ConceptProposalSchema);
    const {concepts,recommended}=readConceptProposal(raw,plan,track);
    if(!concepts.length)console.warn("[concepts] AI 콘셉트를 쓸 수 없어 실사만 보여 줘요.");
    // 추천: AI가 고른 콘셉트(실사 다음에 붙으므로 +1). AI 콘셉트가 없으면 실사.
    return NextResponse.json({options:[photo,...concepts],recommended:concepts.length?recommended+1:0,provider:client.provider??"unknown"});
  }catch(error){
    console.warn("[concepts] 콘셉트 제안을 받지 못해 실사만 보여 줘요:",error instanceof Error?error.message.replace(/\s+/g," ").slice(0,300):String(error));
    return NextResponse.json({options:[photo],recommended:0,provider:"none"});
  }
}
