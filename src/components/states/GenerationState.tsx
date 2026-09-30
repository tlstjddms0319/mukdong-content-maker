"use client";

import { useEffect, useState } from "react";

// 1초마다 값이 올라가는 것 자체가 "멈춘 게 아니라 돌고 있다"는 신호가 된다.
// 틱을 stage와 함께 저장해서, stage가 바뀌면(예: 다음 슬라이드로 넘어감) 요소를 다시 만들거나
// effect 안에서 상태를 초기화하지 않아도 렌더 시점에 자연스럽게 0초부터 다시 센다.
function useElapsedSeconds(stage?:string) {
  const [ticks,setTicks]=useState<{stage?:string;count:number}>({stage,count:0});
  useEffect(()=>{
    const timer=window.setInterval(()=>setTicks(current=>({stage,count:current.stage===stage?current.count+1:1})),1000);
    return ()=>window.clearInterval(timer);
  },[stage]);
  return ticks.stage===stage?ticks.count:0;
}

type GenerationProgressProps={
  label?:string;     // "AI가 문안을"처럼 주어만 주면 경과 시간에 따라 문구를 자동으로 바꾼다.
  message?:string;   // 완성된 문장을 직접 지정한다. label보다 우선한다.
  hint?:string;      // 20초 넘게 걸릴 때 아래 줄에 보여줄 안내.
  progress?:number;  // 0~1. 지정하면 진행 막대를 함께 그린다.
  stage?:string;     // 값이 바뀔 때마다 경과 시간을 0초부터 다시 센다.
};

export function GenerationProgress({ label="", message, hint="최대 1분 정도 걸릴 수 있어요.", progress, stage }: GenerationProgressProps) {
  const elapsed=useElapsedSeconds(stage);
  const text=message??(elapsed<5?`${label} 만드는 중이에요 · 요청을 보냈어요`:elapsed<20?`${label} 만드는 중이에요`:`${label} 결과를 정리하고 있어요`);
  const percent=typeof progress==="number"?Math.round(Math.min(Math.max(progress,0),1)*100):undefined;
  return <div className="generation-progress" role="status" aria-live="polite">
    <span className="progress-dot" aria-hidden="true" />
    <span>{text}<span className="progress-ellipsis" aria-hidden="true"><i /><i /><i /></span></span>
    <span className="progress-elapsed">· {elapsed}초</span>
    {percent!==undefined&&<span className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:`${percent}%`}} /></span>}
    {elapsed>=20&&hint&&<small>{hint}</small>}
  </div>;
}

export function GenerationState({ state, message, onRetry }: { state:"loading"|"empty"|"error"; message?:string; onRetry?:()=>void }) {
  if(state==="loading") return <div className="image-skeleton" role="status">이미지를 준비하고 있어요…</div>;
  return <div className="state-card" role={state==="error"?"alert":"status"}><strong>{state==="error"?"작업을 마치지 못했어요":"아직 결과가 없어요"}</strong><p>{message??"완료된 내용은 그대로 보관했어요."}</p>{onRetry&&<button type="button" className="button primary" onClick={onRetry}>다시 시도</button>}</div>;
}
