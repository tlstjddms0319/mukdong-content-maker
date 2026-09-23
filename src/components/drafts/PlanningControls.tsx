"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function PlanningControls({ draftId, topic, plannedPublishAt, finalReviewComplete, canReview }: { draftId:string; topic:string; plannedPublishAt?:string|null; finalReviewComplete?:boolean; canReview:boolean }) {
  const router=useRouter();
  const dateId=useId();
  const initialDate=plannedPublishAt?new Date(Date.parse(plannedPublishAt)+9*60*60*1000).toISOString().slice(0,16):"";
  const [date,setDate]=useState(initialDate);
  const [reviewed,setReviewed]=useState(!!finalReviewComplete);
  const [savedDate,setSavedDate]=useState(initialDate);
  const [savedReview,setSavedReview]=useState(!!finalReviewComplete);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");setError("");
    try{
      const planned=date?new Date(`${date}:00+09:00`).toISOString():null;
      const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:draftId,planned_publish_at:planned,final_review_complete:reviewed})});
      if(!response.ok)throw new Error((await response.json()).error||"저장하지 못했어요.");
      const updated=await response.json();
      setSavedDate(updated.planned_publish_at?new Date(Date.parse(updated.planned_publish_at)+9*60*60*1000).toISOString().slice(0,16):"");
      setSavedReview(!!updated.final_review_complete);
      setMessage("예약 준비를 저장했어요.");
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  }
  return <form className="draft-planning" aria-label={`${topic} 예약 준비`} onSubmit={event=>void save(event)}>
    <span className="soft-badge">{savedReview?"게시 준비 완료":savedDate?"희망일시 저장됨":"예약 준비 전"}</span>
    <label htmlFor={dateId}>게시 희망일시 (한국시간)</label>
    <input id={dateId} type="datetime-local" value={date} onChange={event=>{setDate(event.target.value);if(!event.target.value)setReviewed(false);}}/>
    <label className="planning-check"><input type="checkbox" checked={reviewed} disabled={!canReview||!date} onChange={event=>setReviewed(event.target.checked)}/>최종 확인 완료</label>
    <button type="submit" className="button secondary" disabled={busy}>{busy?"저장 중…":"예약 준비 저장"}</button>
    {!canReview&&<small>이미지와 문안을 먼저 저장해 주세요.</small>}
    {message&&<small role="status">{message}</small>}
    {error&&<small role="alert">{error}</small>}
    <small>이 설정만으로 자동 게시되지 않아요.</small>
  </form>;
}
