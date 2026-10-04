"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { engagementScore, type Performance } from "@/features/drafts/performance";
import { readJsonResponse } from "@/lib/http/readJson";

// 초안 카드의 "성과 기록". Instagram 인사이트 화면의 숫자를 옮겨 적는다(올린 지 2~3일 뒤 숫자가 안정됐을 때 권장).
// 저장하면 내 초안 위쪽 "성과 돌아보기"와 주제 추천에 반영된다.
const FIELDS=[["likes","좋아요"],["comments","댓글"],["saves","저장"],["shares","공유"],["reach","도달(선택)"]] as const;
type Field=typeof FIELDS[number][0];

export function PerformanceForm({draftId,topic,performance}:{draftId:string;topic:string;performance?:Performance}){
  const router=useRouter();
  const formId=useId();
  const [values,setValues]=useState<Record<Field,string>>(()=>Object.fromEntries(FIELDS.map(([key])=>[key,performance?.[key]!==undefined?String(performance[key]):""])) as Record<Field,string>);
  const [postedOn,setPostedOn]=useState(performance?.posted_on??"");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const send=async(body:unknown,done:string)=>{
    setBusy(true);setMessage("");setError("");
    try{
      const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!response.ok)throw new Error((await readJsonResponse(response)).error||"저장하지 못했어요.");
      setMessage(done);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  };
  const save=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    // 빈 칸은 0으로 본다(도달은 빈 칸이면 기록하지 않는다).
    const number=(key:Field)=>values[key].trim()===""?undefined:Number(values[key]);
    const record={likes:number("likes")??0,comments:number("comments")??0,saves:number("saves")??0,shares:number("shares")??0,...(number("reach")!==undefined?{reach:number("reach")}:{}),...(postedOn?{posted_on:postedOn}:{})};
    void send({id:draftId,performance:record},"성과를 저장했어요.");
  };
  return <details className="performance-form">
    <summary>성과 기록{performance?` · 반응 점수 ${engagementScore(performance).toLocaleString("ko-KR")}`:" (올린 뒤 숫자 적기)"}</summary>
    <form aria-label={`${topic} 성과 기록`} onSubmit={save}>
      <label htmlFor={`${formId}-day`}>올린 날<input id={`${formId}-day`} type="date" value={postedOn} onChange={event=>setPostedOn(event.target.value)}/></label>
      {FIELDS.map(([key,label])=><label key={key} htmlFor={`${formId}-${key}`}>{label}<input id={`${formId}-${key}`} type="number" inputMode="numeric" min={0} step={1} value={values[key]} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}/></label>)}
      <div className="performance-actions">
        <button type="submit" className="button primary" disabled={busy}>{busy?"저장 중…":"성과 저장"}</button>
        {performance&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void send({id:draftId,performance:null},"성과 기록을 지웠어요.")}>기록 지우기</button>}
      </div>
      <p className="field-help">반응 점수 = 좋아요 + 댓글×2 + 저장×3 + 공유×3. 내 게시물끼리 비교하는 용도예요.</p>
      {message&&<p role="status" className="field-help">{message}</p>}
      {error&&<p role="alert">{error}</p>}
    </form>
  </details>;
}
