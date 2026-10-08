import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { overusedMenus, suggestTopics } from "@/features/topics/service";
import { buildTopicPrompt, readTopicGeneration, topicGenerationSchema } from "@/features/topics/prompt";
import { seasonContext } from "@/features/topics/season";
import { MonthSchema, groupByWeek, pickWeekTopics, postDatesForMonth, rotateStyles, type MonthPlanItem } from "@/features/topics/monthPlan";
import { readMonthPlan, writeMonthPlan } from "@/features/topics/monthPlanRepository";
import { createTextClient } from "@/lib/ai/textClient";
import { readSettings } from "@/features/settings/repository";
import { createDraftRepository } from "@/features/drafts/repository";
import { STORE_MENU } from "@/features/store/menu";
import { likedTopicTitles } from "@/features/drafts/performance";
import { matchPlanDraft, planDraftStarted } from "@/features/drafts/planLink";

const STORE_NAME="묵동홍어마을";
const titleKey=(title:string)=>title.replace(/[\s?!.,]/g,"");
// "2026-01" → -1달 → "2025-12".
const shiftMonth=(month:string,delta:number)=>{const [year,m]=month.split("-").map(Number);const date=new Date(Date.UTC(year,m-1+delta,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;};

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
    const openDates=postDatesForMonth(month,undefined,month===today.slice(0,7)?today:undefined);
    // "다시 기획하기"여도 지난 날짜와 이미 초안을 시작한 칸은 그대로 둔다(주제가 바뀌면 초안과 칸의 연결이 끊겨 같은 날 글이 둘 생길 수 있다).
    const drafts=await createDraftRepository().listDraftSummaries().catch(()=>[]);
    const summaries=drafts.map(draft=>({id:draft.id,topic:draft.topic,plan_date:draft.plan_date,hasImages:draft.imageCount>0,hasCaption:draft.hasCaption,reviewed:!!draft.final_review_complete}));
    const previous=await readMonthPlan(month).catch(()=>null);
    const kept=(previous?.items??[]).filter(item=>!openDates.includes(item.date)||planDraftStarted(matchPlanDraft(item,summaries)));
    const keptDates=new Set(kept.map(item=>item.date));
    const dates=openDates.filter(date=>!keptDates.has(date));
    if(!dates.length){
      if(previous&&kept.length)return NextResponse.json({plan:previous,fallbackWeeks:0,kept:kept.length,message:"남은 게시일은 모두 초안을 시작했거나 지난 날짜라 그대로 두었어요."});
      return NextResponse.json({message:"이 달에는 남은 게시일이 없어요. 다음 달을 기획해 보세요."},{status:400});
    }
    // 사장님이 적어 둔 성과에서 반응 좋았던 주제(없으면 빈 목록).
    const likedTitles=likedTopicTitles(drafts);
    const settings=await readSettings().catch(()=>null);
    const client=createTextClient(settings?.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});
    // 남겨 둔 칸의 주제는 새 주제와 겹치지 않게 미리 넣어 둔다.
    const used=new Set<string>(kept.map(item=>titleKey(item.title)));
    // 메뉴를 고르게 돌리려고 지난달 기획과 최근 초안 주제도 "최근 주제"로 본다(예전: 11·12월 기획이 거의 같고 12월에 과메기 3번).
    const previousMonth=await readMonthPlan(shiftMonth(month,-1)).catch(()=>null);
    const recentDrafts=drafts.slice(0,10).map(draft=>draft.topic).reverse();
    const recent:string[]=[...(previousMonth?.items??[]).map(item=>item.title),...recentDrafts,...kept.map(item=>item.title)];
    let filledSlots=0;
    const weekly:Array<{dates:string[];topics:Awaited<ReturnType<typeof suggestTopics>>}>=[];
    let fallbackWeeks=0;
    for(const [index,weekDates] of groupByWeek(dates).entries()){
      const season=seasonContext(new Date(`${weekDates[0]}T12:00:00+09:00`));
      const input={storeName:STORE_NAME,recommendationRound:index,excludeTitles:recent.slice(-3),avoidTitles:recent.slice(-30)};
      // 최근 주제(최근 것부터)에 두 번 넘게 나온 메뉴는 이번 주 주인공에서 뺀다(주제 추천 화면과 같은 기준).
      const recentMenus=overusedMenus([...recent].reverse());
      const recentMenuNames=STORE_MENU.filter(item=>recentMenus.has(item.id)).map(item=>item.name);
      const topics=await suggestTopics(input,{suggest:async()=>readTopicGeneration(await client.generateJson(buildTopicPrompt(input,season,likedTitles,[],recentMenuNames),topicGenerationSchema()))},()=>{fallbackWeeks++;},season,filled=>{filledSlots+=filled;},{recentMenus});
      const picked=pickWeekTopics(topics,weekDates.length,used);
      for(const topic of picked){used.add(titleKey(topic.title));recent.push(topic.title);}
      weekly.push({dates:weekDates,topics:picked});
    }
    const styles=rotateStyles(dates.length,month);
    let n=0;
    const fresh:MonthPlanItem[]=weekly.flatMap(week=>week.dates.slice(0,week.topics.length).map((date,i)=>({...week.topics[i],date,style:styles[n++]})));
    const items=[...kept,...fresh].sort((a,b)=>a.date.localeCompare(b.date));
    const plan={month,createdAt:new Date().toISOString(),items};
    await writeMonthPlan(plan);
    return NextResponse.json({plan,fallbackWeeks,kept:kept.length,...(filledSlots?{filled:filledSlots}:{})});
  }catch(error){
    console.warn("[month-plan] 기획 실패:",error instanceof Error?error.message:String(error));
    return NextResponse.json({message:"한 달 기획을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요."},{status:500});
  }
}
