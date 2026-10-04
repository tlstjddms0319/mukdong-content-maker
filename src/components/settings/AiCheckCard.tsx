"use client";
import { useState } from "react";
import type { AiCheckItem } from "@/features/aiCheck/runChecks";
import { readJsonResponse } from "@/lib/http/readJson";

// AI 연결 실제 점검. 키가 "설정됨"인지(아래 카드)가 아니라, 그 키로 실제 호출이 되는지를 확인한다.
// 문안 AI는 자동 전환 때문에 첫 순서가 실패해도 화면에서는 티가 안 나므로, 여기서 하나씩 따로 보여 준다.
const STATUS_TEXT={ok:"정상",fail:"실패",skip:"건너뜀"} as const;

export function AiCheckCard(){
  const [items,setItems]=useState<AiCheckItem[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const check=async()=>{
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/ai/check",{method:"POST",cache:"no-store"});
      const data=await readJsonResponse(response);
      if(!response.ok||!Array.isArray(data.items))throw new Error(data.message||"점검하지 못했어요.");
      setItems(data.items);
    }catch(cause){setError(cause instanceof Error?cause.message:"점검하지 못했어요.");}
    finally{setBusy(false);}
  };
  const failed=items?.filter(item=>item.status==="fail").length??0;
  const passed=items?.filter(item=>item.status==="ok").length??0;
  const summary=failed?`${failed}개가 실패했어요. 실패한 줄의 이유를 확인해 주세요.`:passed?"켜 둔 AI가 모두 정상이에요.":"설정된 AI 키가 없어요. Render 환경변수(Environment)에 키를 넣고 다시 배포해 주세요.";
  return <section className="settings-section" aria-label="AI 연결 실제 점검"><div><h2>AI 연결 실제 점검</h2><p>서버에 넣은 키로 각 AI를 한 번씩 불러 봐요. 문안 AI와 표지 점검은 아주 적은 요금이 들고, 이미지 AI는 키 인증만 확인해요(크레딧 사용 없음).</p></div><div className="connection-panel">
    {items&&<p role="status" className="field-help">{summary}</p>}
    {items&&<ul className="ai-check-list">{items.map(item=><li key={item.id} className="connection-card">
      <span className={`status-dot${item.status==="ok"?" on":""}${item.status==="skip"?" muted":""}`}/>
      <div><strong>{item.label} · {STATUS_TEXT[item.status]}{item.ms!==undefined?` (${(item.ms/1000).toFixed(1)}초)`:""}</strong><p>{item.message}</p></div>
    </li>)}</ul>}
    {error&&<p role="alert">{error}</p>}
    <div className="connection-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>void check()}>{busy?"점검 중… (최대 30초)":"AI 연결 점검하기"}</button></div>
  </div></section>;
}
