"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/readJson";

// 초안 지우기. 지우면 되돌릴 수 없으므로 한 번 묻는다. 인스타그램에 이미 올린 글은 여기서 지워도 인스타에는 남는다.
export function DeleteDraftButton({draftId,topic,published=false}:{draftId:string;topic:string;published?:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const remove=async()=>{
    const question=published?`'${topic}' 초안을 지울까요? 인스타그램에 올린 글은 지워지지 않고, 이 앱의 초안·성과 기록만 지워져요.`:`'${topic}' 초안을 지울까요? 지운 초안은 되돌릴 수 없어요.`;
    if(!window.confirm(question))return;
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/drafts?id=${encodeURIComponent(draftId)}`,{method:"DELETE"});
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.error||data.message||"지우지 못했어요.");
      try{if(localStorage.getItem("mukdong-current-draft")===draftId){localStorage.removeItem("mukdong-current-draft");localStorage.removeItem("mukdong-current-draft-topic");}}catch{/* 무시 */}
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"지우지 못했어요.");setBusy(false);}
  };
  return <>
    <button type="button" className="button secondary danger" aria-label={`${topic} 초안 지우기`} disabled={busy} onClick={()=>void remove()}>{busy?"지우는 중…":"지우기"}</button>
    {error&&<p role="alert" className="field-help">{error}</p>}
  </>;
}
