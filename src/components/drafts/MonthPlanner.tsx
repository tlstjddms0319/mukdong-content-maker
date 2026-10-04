"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { STYLES } from "@/features/images/styleCatalog";
import type { MonthPlan } from "@/features/topics/monthPlan";
import { readJsonResponse } from "@/lib/http/readJson";

const WEEKDAYS=["일","월","화","수","목","금","토"];
const monthOf=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
const titleKey=(title:string)=>title.replace(/[\s?!.,]/g,"");

// 한 달 콘텐츠 기획. 이번 달/다음 달을 골라 "한 달 기획 만들기"를 누르면 매주 화·금 게시일에 시즌을 반영한 주제와
// 추천 디자인 계열을 채운다. 주제마다 "이 주제로 초안 시작"으로 바로 초안을 만들고, 이미 초안이 있는 주제는 표시한다.
export function MonthPlanner({draftTopics=[]}:{draftTopics?:string[]}){
  const [months]=useState(()=>{const now=new Date();return [monthOf(now),monthOf(new Date(now.getFullYear(),now.getMonth()+1,1))];});
  const [month,setMonth]=useState(months[0]);
  const [plan,setPlan]=useState<MonthPlan|null>(null);
  const [state,setState]=useState<"loading"|"idle"|"working">("loading");
  const [notice,setNotice]=useState("");
  const drafted=new Set(draftTopics.map(titleKey));

  useEffect(()=>{
    let active=true;
    fetch(`/api/topics/month?month=${month}`,{cache:"no-store"}).then(readJsonResponse).then(data=>{if(active){setPlan(data.plan??null);setState("idle");}}).catch(()=>{if(active){setPlan(null);setState("idle");}});
    return ()=>{active=false;};
  },[month]);

  const build=async()=>{
    setState("working");setNotice("");
    try{
      const response=await fetch("/api/topics/month",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({month})});
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.message);
      setPlan(data.plan);
      if(data.fallbackWeeks)setNotice(`AI 추천을 받지 못한 ${data.fallbackWeeks}주는 준비된 주제로 채웠어요.`);
    }catch(error){setNotice(error instanceof Error&&error.message?error.message:"한 달 기획을 만들지 못했어요.");}
    finally{setState("idle");}
  };

  const [year,m]=month.split("-");
  return <section className="month-planner" aria-label="한 달 콘텐츠 기획">
    <div className="month-planner-head">
      <div><h2>한 달 콘텐츠 기획</h2><p>매주 화·금, 그 주의 계절·명절에 맞는 주제와 디자인 계열을 미리 채워 둬요.</p></div>
      <div className="month-planner-actions">
        <div className="option-picker" role="group" aria-label="기획할 달">{months.map(value=><button key={value} type="button" className="button secondary" aria-pressed={value===month} onClick={()=>setMonth(value)}>{Number(value.slice(5))}월</button>)}</div>
        <button type="button" className="button primary" disabled={state!=="idle"} onClick={()=>void build()}>{state==="working"?"기획하는 중…":plan?"다시 기획하기":"한 달 기획 만들기"}</button>
      </div>
    </div>
    {notice&&<p role="status" className="field-help">{notice}</p>}
    {state==="loading"?<p role="status">불러오는 중…</p>:!plan?<p className="field-help">{Number(year)}년 {Number(m)}월 기획이 아직 없어요.</p>:
      <ol className="month-plan-list">{plan.items.map(item=>{
        const day=new Date(`${item.date}T00:00:00`);
        const done=drafted.has(titleKey(item.title));
        const href=`/?${new URLSearchParams({topic:item.title,audience:item.audience,imageBrief:item.imageBrief,brief:item.summary})}`;
        return <li key={`${item.date}-${item.title}`} className={`month-plan-item${done?" done":""}`}>
          <span className="month-plan-date">{day.getMonth()+1}/{day.getDate()} ({WEEKDAYS[day.getDay()]})</span>
          <div><strong>{item.title}</strong><p>{item.summary}</p>
            <span className="topic-badges">{item.season&&<span className="season-badge">이번 시즌 · {item.season}</span>}<span className="soft-badge">추천 계열 · {STYLES[item.style].label}</span>{done&&<span className="soft-badge">초안 있음</span>}</span>
          </div>
          <Link className="button secondary" href={href}>{done?"새 초안 하나 더":"이 주제로 초안 시작"}</Link>
        </li>;
      })}</ol>}
  </section>;
}
