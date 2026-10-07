"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublishStatus } from "@/features/instagram/publicationState";
import { readJsonResponse } from "@/lib/http/readJson";

// 내 초안 카드의 Instagram 게시 상태(게시됨·게시 중·확인 필요·실패·예약 놓침·게시 대기·예약됨).
// "확인 필요"는 게시 도중 멈춰 실제로 올라갔는지 앱이 알 수 없는 경우라, 사장님이 Instagram에서 보고 고르게 한다.
// 잘못 고르면 같은 글이 두 번 올라갈 수 있으므로 "안 올라갔어요"에는 한 번 더 묻는다.
const dateText=(iso:string)=>new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));

export function PublishStatusBadge({draftId,status}:{draftId:string;status:PublishStatus}){
  const router=useRouter();
  const [current,setCurrent]=useState(status);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if(current.state==="none")return null;
  const resolve=async(outcome:"published"|"failed")=>{
    if(outcome==="failed"&&!window.confirm("Instagram 프로필에 이 글이 정말 없나요? '안 올라갔어요'를 고르면 다시 게시할 수 있게 돼요."))return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/instagram/publication",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draftId,outcome})});
      const body=await readJsonResponse(response);
      if(!response.ok)throw new Error(body.message||body.error||"저장하지 못했어요.");
      setCurrent(body as PublishStatus);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  };
  return <div className={`publish-status publish-status-${current.state}`}>
    <span className="soft-badge">{current.label}{current.publishedAt?` · ${dateText(current.publishedAt)}`:""}</span>
    {current.detail&&<small>{current.detail}</small>}
    {current.state==="needs-check"&&<div className="publish-status-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={()=>void resolve("published")}>올라가 있어요</button>
      <button type="button" className="button secondary" disabled={busy} onClick={()=>void resolve("failed")}>안 올라갔어요</button>
    </div>}
    {error&&<small role="alert">{error}</small>}
  </div>;
}
