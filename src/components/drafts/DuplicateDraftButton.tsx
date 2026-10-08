"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/readJson";

// "복제해서 고치기": 서버에 복제본을 만들고 바로 그 복제본을 위저드로 연다.
// 원본은 그대로 남으므로 사진·글을 마음껏 바꿔 봐도 된다.
export function DuplicateDraftButton({draftId,topic}:{draftId:string;topic:string}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const duplicate=async()=>{
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/drafts/duplicate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:draftId})});
      const data=await readJsonResponse(response);
      if(!response.ok||typeof data.id!=="string")throw new Error(data.error||"복제하지 못했어요.");
      router.push(`/?draft=${encodeURIComponent(data.id)}`);
    }catch(cause){setError(cause instanceof Error?cause.message:"복제하지 못했어요.");setBusy(false);}
  };
  return <>
    <button type="button" className="button secondary" aria-label={`${topic} 복제해서 고치기`} disabled={busy} onClick={()=>void duplicate()}>{busy?"복제하는 중…":"복제해서 고치기"}</button>
    {error&&<p role="alert" className="field-help">{error}</p>}
  </>;
}
