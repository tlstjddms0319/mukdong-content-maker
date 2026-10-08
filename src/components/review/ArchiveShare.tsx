"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readJsonResponse } from "@/lib/http/readJson";

// 확인 화면의 네 번째 큰 버튼 "보관함에 보관하기": 지금은 안 올리고 '내 게시물 → 보관함'에 따로 모아 둔다.
// 게시물은 만들 때 이미 저장되므로, 여기서는 고친 글을 저장하고 보관 표시만 켠다(걸려 있던 예약은 서버가 끈다).
// 보관한 뒤에는 "보관함에 넣었어요 · 보관함 보기 · 꺼내기"를 보여 준다.
// onChange: 보관 상태를 바꾼 뒤 부르면 부모가 예약 버튼도 서버 상태를 다시 읽게 한다.
export function ArchiveShare({draftId,onBeforeArchive,onChange}:{draftId:string;onBeforeArchive?:()=>Promise<boolean>;onChange?:()=>void}) {
  const [archived,setArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  // 이미 보관함에 있는 게시물이면 처음부터 "보관함에 있어요"로 보인다. 못 읽어도 버튼은 그대로 쓴다.
  useEffect(()=>{
    let active=true;
    fetch(`/api/drafts?id=${encodeURIComponent(draftId)}`,{cache:"no-store"}).then(response=>response.ok?readJsonResponse(response):null).then(draft=>{if(active&&draft?.archived)setArchived(true);}).catch(()=>{});
    return()=>{active=false;};
  },[draftId]);

  const save=async(next:boolean)=>{
    setBusy(true);setError("");
    try{
      if(next&&onBeforeArchive&&!await onBeforeArchive())throw new Error("고친 글을 저장하지 못해 보관하지 않았어요. 잠시 뒤 다시 눌러 주세요.");
      const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:draftId,archived:next})});
      const data=await readJsonResponse(response).catch(()=>({}));
      if(!response.ok)throw new Error(String((data as {error?:unknown}).error||"보관하지 못했어요. 잠시 뒤 다시 눌러 주세요."));
      setArchived(next);onChange?.();
    }catch(cause){setError(cause instanceof Error?cause.message:"보관하지 못했어요.");}
    finally{setBusy(false);}
  };

  return <div className="share-action">
    {archived?<>
      <p role="status" className="share-done"><strong>보관함에 넣었어요.</strong> 내 게시물의 ‘보관함’에서 다시 열 수 있어요.</p>
      <div className="archive-links"><Link className="button secondary" href="/drafts?view=archive">보관함 보기</Link><button type="button" className="button secondary" disabled={busy} onClick={()=>void save(false)}>{busy?"꺼내는 중…":"꺼내기"}</button></div>
    </>:<>
      <button type="button" className="button big secondary share-button" disabled={busy} onClick={()=>void save(true)}>{busy?"보관하는 중…":"보관함에 보관하기"}</button>
      <p className="field-help">지금은 안 올리고 따로 모아 둬요</p>
    </>}
    {error&&<p role="alert" className="field-help">{error}</p>}
  </div>;
}
