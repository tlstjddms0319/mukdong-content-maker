"use client";
import { useEffect, useState } from "react";
import { formatKstTime, isoToLocalInput, localInputToIso, quickScheduleChoices } from "@/features/instagram/scheduleChoices";
import { readJsonResponse } from "@/lib/http/readJson";

// 확인 화면의 세 번째 큰 버튼 "예약해서 올리기".
// 누르면 시각 고르기(오늘·내일 점심/저녁 버튼 + 직접 고르기)가 펼쳐지고, "이 시각에 예약하기"를 누르면
// 게시물에 올릴 시각과 '최종 확인 완료'를 함께 저장한다. 그러면 서버의 예약 게시가 그 시각에 저절로 올린다(scheduler.ts).
// 이미 예약된 게시물이면 버튼 대신 "○월 ○일 저녁 6:00에 올라가요 · 예약 취소"를 보여 준다.
// ready: 인스타그램이 연결돼 있는지(InstagramPublish가 알려 준 값). 연결 전에는 예약해도 올라가지 않으므로 막는다.
// onBeforeSchedule: 고친 글을 먼저 저장한다(예약은 저장된 글로 올라간다).
type Mode="closed"|"picking"|"saving";

// onChange: 예약·취소한 뒤 부르면 부모가 보관 버튼도 서버 상태를 다시 읽게 한다(예약하면 보관함에서 나온다).
export function ScheduleShare({draftId,ready,onBeforeSchedule,onChange}:{draftId:string;ready:boolean;onBeforeSchedule?:()=>Promise<boolean>;onChange?:()=>void}) {
  const [reservedAt,setReservedAt]=useState<string|null>(null);
  const [mode,setMode]=useState<Mode>("closed");
  const [picked,setPicked]=useState("");
  const [custom,setCustom]=useState("");
  const [error,setError]=useState("");
  const [choices,setChoices]=useState(()=>quickScheduleChoices());

  // 이 게시물에 이미 걸린 예약을 읽는다(최종 확인 완료 + 앞으로 올 시각일 때만 "예약됨"). 못 읽어도 버튼은 그대로 쓴다.
  useEffect(()=>{
    let active=true;
    fetch(`/api/drafts?id=${encodeURIComponent(draftId)}`,{cache:"no-store"}).then(response=>response.ok?readJsonResponse(response):null).then(draft=>{
      if(!active||!draft)return;
      const at=typeof draft.planned_publish_at==="string"?draft.planned_publish_at:null;
      if(draft.final_review_complete&&at&&Date.parse(at)>Date.now())setReservedAt(at);
    }).catch(()=>{});
    return()=>{active=false;};
  },[draftId]);

  const save=async(plannedIso:string|null)=>{
    setMode("saving");setError("");
    try{
      if(plannedIso&&onBeforeSchedule&&!await onBeforeSchedule())throw new Error("고친 글을 저장하지 못해 예약하지 않았어요. 잠시 뒤 다시 눌러 주세요.");
      const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:draftId,planned_publish_at:plannedIso,final_review_complete:Boolean(plannedIso)})});
      const data=await readJsonResponse(response).catch(()=>({}));
      if(!response.ok)throw new Error(String((data as {error?:unknown}).error||"예약하지 못했어요. 잠시 뒤 다시 눌러 주세요."));
      setReservedAt(plannedIso);setMode("closed");setPicked("");setCustom("");onChange?.();
    }catch(cause){setError(cause instanceof Error?cause.message:"예약하지 못했어요.");setMode(plannedIso?"picking":"closed");}
  };
  // 고른 시각: 빠른 버튼 > 직접 고른 시각.
  const target=picked||(custom?localInputToIso(custom):"");
  const reserve=()=>{
    if(!target)return;
    if(Date.parse(target)<=Date.now()+60_000){setError("지금보다 뒤 시각을 골라 주세요.");return;}
    if(!window.confirm(`${formatKstTime(target)}에 인스타그램에 올라가게 예약할까요?`))return;
    void save(target);
  };
  const cancel=()=>{if(window.confirm("예약을 취소할까요? 취소하면 저절로 올라가지 않아요."))void save(null);};

  if(reservedAt)return <div className="share-action">
    <p role="status" className="share-done"><strong>{formatKstTime(reservedAt)}에 올라가요.</strong> 그때 인스타그램에 저절로 올라가요(1~2분 늦을 수 있어요). 글이나 사진을 고치면 예약이 풀려요.</p>
    <button type="button" className="button secondary" disabled={mode==="saving"} onClick={cancel}>{mode==="saving"?"취소하는 중…":"예약 취소"}</button>
    {error&&<p role="alert" className="field-help">{error}</p>}
  </div>;

  return <div className="share-action">
    <button type="button" className="button big secondary share-button" aria-expanded={mode!=="closed"} disabled={!ready} onClick={()=>{setChoices(quickScheduleChoices());setError("");setMode(mode==="closed"?"picking":"closed");}}>예약해서 올리기</button>
    {mode==="closed"?<p className="field-help">{ready?"정한 시각에 저절로 올라가요":"인스타그램을 연결하면 예약할 수 있어요"}</p>
      :<div className="schedule-picker" role="group" aria-label="올릴 시각 고르기">
        <div className="schedule-choices">{choices.map(choice=><button key={choice.iso} type="button" className={`button secondary ${picked===choice.iso?"selected":""}`} aria-pressed={picked===choice.iso} onClick={()=>{setPicked(choice.iso);setCustom("");setError("");}}>{choice.label}</button>)}</div>
        <label className="schedule-custom"><span>다른 날짜·시각</span><input type="datetime-local" value={custom} min={isoToLocalInput(new Date().toISOString())} onChange={event=>{setCustom(event.target.value);setPicked("");setError("");}}/></label>
        <button type="button" className="button primary" disabled={!target||mode==="saving"} onClick={reserve}>{mode==="saving"?"예약하는 중…":target?`${formatKstTime(target)}에 예약하기`:"시각을 골라 주세요"}</button>
        {error&&<p role="alert" className="field-help">{error}</p>}
      </div>}
  </div>;
}
