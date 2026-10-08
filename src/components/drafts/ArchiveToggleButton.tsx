"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/readJson";

// 내 게시물 카드의 "더보기" 안: 보관함에 넣기 / 보관함에서 꺼내기. 바꾸면 목록을 새로 읽어 그 칸에서 빠진다.
// 보관함에 넣으면 걸려 있던 예약은 서버가 끈다(보관함 = 지금은 안 올림).
export function ArchiveToggleButton({draftId,topic,archived}:{draftId:string;topic:string;archived:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const toggle=async()=>{
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:draftId,archived:!archived})});
      const data=await readJsonResponse(response).catch(()=>({}));
      if(!response.ok)throw new Error(String((data as {error?:unknown}).error||"바꾸지 못했어요."));
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"바꾸지 못했어요.");}
    finally{setBusy(false);}
  };
  return <>
    <button type="button" className="button secondary" aria-label={`${topic} ${archived?"보관함에서 꺼내기":"보관함에 넣기"}`} disabled={busy} onClick={()=>void toggle()}>{busy?"바꾸는 중…":archived?"보관함에서 꺼내기":"보관함에 넣기"}</button>
    {error&&<p role="alert" className="field-help">{error}</p>}
  </>;
}
