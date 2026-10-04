import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { suggestTopics, topicDirectionsForRound } from "@/features/topics/service";
import { buildTopicPrompt, topicGenerationSchema } from "@/features/topics/prompt";
import { seasonContext } from "@/features/topics/season";
import { MonthSchema, groupByWeek, pickWeekTopics, postDatesForMonth, rotateStyles, type MonthPlanItem } from "@/features/topics/monthPlan";
import { readMonthPlan, writeMonthPlan } from "@/features/topics/monthPlanRepository";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { createDraftRepository } from "@/features/drafts/repository";
import { likedTopicTitles } from "@/features/drafts/performance";

const STORE_NAME="묵동홍어마을";
const titleKey=(title:string)=>title.replace(/[\s?!.,]/g,"");

// 저장된 한 달 기획 불러오기.
export async function GET(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const month=MonthSchema.safeParse(new URL(request.url).searchParams.get("month"));
  if(!month.success)return NextResponse.json({message:"달을 확인해 주세요."},{status:400});
  try{return NextResponse.json({plan:await readMonthPlan(month.data)},{headers:{"Cache-Control":"no-store"}});}
  catch{return NextResponse.json({message:"기획을 불러오지 못했어요."},{status:500});}
}

// 한 달 기획 만들기: 주마다 그 주 날짜의 시즌을 반영해 주제 3개를 추천받고, 그 주 게시일 수만큼 골라 담는다.
// AI가 실패한 주는 준비된 주제(시즌 주제 포함)로 채운다. 결과는 저장해서 다시 들어와도 보이게 한다.
export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const body=z.object({month:MonthSchema}).safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({message:"달을 확인해 주세요."},{status:400});
  try{
    const month=body.data.month;
    // 이번 달이면 오늘(한국 시간) 이후 게시일만 기획한다.
    const today=seasonContext().today;
    const dates=postDatesForMonth(month,undefined,month===today.slice(0,7)?today:undefined);
    if(!dates.length)return NextResponse.json({message:"이 달에는 남은 게시일이 없어요. 다음 달을 기획해 보세요."},{status:400});
    // 사장님이 적어 둔 성과에서 반응 좋았던 주제(없으면 빈 목록).
    const likedTitles=likedTopicTitles(await createDraftRepository().listDrafts().catch(()=>[]));
    const settings=await readSettings().catch(()=>null);
    const client=createTextClient(settings?.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
    const used=new Set<string>();
    const recent:string[]=[];
    const weekly:Array<{dates:string[];topics:Awaited<ReturnType<typeof suggestTopics>>}>=[];
    let fallbackWeeks=0;
    for(const [index,weekDates] of groupByWeek(dates).entries()){
      const season=seasonContext(new Date(`${weekDates[0]}T12:00:00+09:00`));
      const input={storeName:STORE_NAME,recommendationRound:index,excludeTitles:recent.slice(-3),avoidTitles:recent.slice(-30)};
      const topics=await suggestTopics(input,{suggest:()=>client.generateJson(buildTopicPrompt(input,season,likedTitles),topicGenerationSchema(topicDirectionsForRound(index)))},()=>{fallbackWeeks++;},season);
      const picked=pickWeekTopics(topics,weekDates.length,used);
      for(const topic of picked){used.add(titleKey(topic.title));recent.push(topic.title);}
      weekly.push({dates:weekDates,topics:picked});
    }
    const styles=rotateStyles(dates.length,month);
    let n=0;
    const items:MonthPlanItem[]=weekly.flatMap(week=>week.dates.slice(0,week.topics.length).map((date,i)=>({...week.topics[i],date,style:styles[n++]})));
    const plan={month,createdAt:new Date().toISOString(),items};
    await writeMonthPlan(plan);
    return NextResponse.json({plan,fallbackWeeks});
  }catch(error){
    console.warn("[month-plan] 기획 실패:",error instanceof Error?error.message:String(error));
    return NextResponse.json({message:"한 달 기획을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요."},{status:500});
  }
}
