"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { STYLES } from "@/features/images/styleCatalog";
import type { MonthPlan } from "@/features/topics/monthPlan";
import { readJsonResponse } from "@/lib/http/readJson";
import { PLAN_STATE_LABELS, kstToday, matchPlanDraft, planItemState, type PlanDraftSummary, type PlanItemState } from "@/features/drafts/planLink";

const WEEKDAYS=["일","월","화","수","목","금","토"];
const monthOf=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;

// 한 달 콘텐츠 기획. 이번 달/다음 달을 골라 "한 달 기획 만들기"를 누르면 매주 화·금 게시일에 시즌을 반영한 주제와
// 추천 디자인 계열을 채운다. 주제마다 "이 주제로 초안 시작"으로 바로 초안을 만들고(게시일·추천 계열이 함께 넘어간다),
// 그 칸에서 만든 초안의 진행 상태(기획 → 이미지 → 문안 → 최종 확인)를 보여 준다.
export function MonthPlanner({drafts=[]}:{drafts?:PlanDraftSummary[]}){
  const [months]=useState(()=>{const now=new Date();return [monthOf(now),monthOf(new Date(now.getFullYear(),now.getMonth()+1,1))];});
  const [month,setMonth]=useState(months[0]);
  const [plan,setPlan]=useState<MonthPlan|null>(null);
  const [state,setState]=useState<"loading"|"idle"|"working">("loading");
  const [notice,setNotice]=useState("");
  const [today]=useState(()=>kstToday());

  useEffect(()=>{
    let active=true;
    fetch(`/api/topics/month?month=${month}`,{cache:"no-store"}).then(readJsonResponse).then(data=>{if(active){setPlan(data.plan??null);setState("idle");}}).catch(()=>{if(active){setPlan(null);setState("idle");}});
    return ()=>{active=false;};
  },[month]);

  const build=async()=>{
    // 다시 기획하면 아직 시작하지 않은 날짜의 주제가 바뀐다. 시작한 칸·지난 날짜는 서버가 그대로 둔다.
    if(plan&&!window.confirm("다시 기획하면 아직 초안을 시작하지 않은 날짜의 주제가 새로 바뀌어요. 초안을 시작한 날짜와 지난 날짜는 그대로 둬요. 다시 기획할까요?"))return;
    setState("working");setNotice("");
    try{
      const response=await fetch("/api/topics/month",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({month})});
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.message);
      setPlan(data.plan);
      const notes=[data.message,data.kept?`초안을 시작했거나 지난 ${data.kept}칸은 그대로 두었어요.`:"",data.fallbackWeeks?`AI 추천을 받지 못한 ${data.fallbackWeeks}주는 준비된 주제로 채웠어요.`:""].filter(Boolean);
      if(notes.length)setNotice(data.message??notes.join(" "));
    }catch(error){setNotice(error instanceof Error&&error.message?error.message:"한 달 기획을 만들지 못했어요.");}
    finally{setState("idle");}
  };

  const [year,m]=month.split("-");
  // 칸마다 연결된 초안과 상태를 한 번에 계산하고, 위에 이번 달 진행 요약을 보여 준다.
  const rows=(plan?.items??[]).map(item=>{const draft=matchPlanDraft(item,drafts);return {item,draft,state:planItemState(item,draft,today)};});
  const count=(...states:PlanItemState[])=>rows.filter(row=>states.includes(row.state)).length;
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
      <><p className="month-plan-summary" role="status">게시일 {rows.length}개 · 최종 확인 {count("reviewed")}개 · 만드는 중 {count("images","caption")}개 · 남은 기획 {count("planned")}개{count("missed")?` · 날짜 지남 ${count("missed")}개`:""}</p>
      <ol className="month-plan-list">{rows.map(({item,draft,state:itemState})=>{
        const day=new Date(`${item.date}T00:00:00`);
        const href=`/?${new URLSearchParams({topic:item.title,audience:item.audience,imageBrief:item.imageBrief,brief:item.summary,planDate:item.date,style:item.style})}`;
        const started=itemState==="images"||itemState==="caption"||itemState==="reviewed";
        return <li key={`${item.date}-${item.title}`} className={`month-plan-item state-${itemState}`}>
          <span className="month-plan-date">{day.getMonth()+1}/{day.getDate()} ({WEEKDAYS[day.getDay()]})</span>
          <div><strong>{item.title}</strong><p>{item.summary}</p>
            <span className="topic-badges"><span className={`plan-state plan-state-${itemState}`}>{PLAN_STATE_LABELS[itemState]}</span>{item.season&&<span className="season-badge">이번 시즌 · {item.season}</span>}<span className="soft-badge">추천 계열 · {STYLES[item.style].label}</span></span>
          </div>
          {started&&draft?<Link className="button secondary" href={`/?draft=${encodeURIComponent(draft.id)}`}>{itemState==="reviewed"?"초안 보기":"이어서 만들기"}</Link>
            :<Link className="button secondary" href={href}>{itemState==="missed"?"그래도 만들기":"이 주제로 초안 시작"}</Link>}
        </li>;
      })}</ol></>}
  </section>;
}
