"use client";

import { useEffect, useState } from "react";

export function GenerationProgress({ label }: { label:string }) {
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    const timer=window.setInterval(()=>setElapsed(value=>value+1),1000);
    return ()=>window.clearInterval(timer);
  },[]);
  const message=elapsed<5?`${label} 만드는 중이에요 · 요청을 보냈어요`:elapsed<20?`${label} 만드는 중이에요`:`${label} 결과를 정리하고 있어요`;
  return <div className="generation-progress" role="status" aria-live="polite"><span className="progress-dot" aria-hidden="true" />{message} · {elapsed}초{elapsed>=20&&<small>최대 1분 정도 걸릴 수 있어요.</small>}</div>;
}

export function GenerationState({ state, message, onRetry }: { state:"loading"|"empty"|"error"; message?:string; onRetry?:()=>void }) {
  if(state==="loading") return <div className="image-skeleton" role="status">이미지를 준비하고 있어요…</div>;
  return <div className="state-card" role={state==="error"?"alert":"status"}><strong>{state==="error"?"작업을 마치지 못했어요":"아직 결과가 없어요"}</strong><p>{message??"완료된 내용은 그대로 보관했어요."}</p>{onRetry&&<button type="button" className="button primary" onClick={onRetry}>다시 시도</button>}</div>;
}
