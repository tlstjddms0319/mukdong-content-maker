"use client";
import { useEffect,useState } from "react";
import type { PublicInstagramConnection } from "@/features/instagram/schema";

export function InstagramConnectionCard(){
  const [status,setStatus]=useState<PublicInstagramConnection|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;fetch("/api/instagram/status").then(response=>{
    if(!response.ok)throw new Error();return response.json();
  }).then(value=>{if(active)setStatus(value);}).catch(()=>{if(active)setError("연결 상태를 확인하지 못했어요.");});return()=>{active=false;};},[]);

  const disconnect=async()=>{
    setBusy(true);setError("");
    try{const response=await fetch("/api/instagram/connection",{method:"DELETE"});if(!response.ok)throw new Error();setStatus({connected:false});}
    catch{setError("연결을 해제하지 못했어요. 다시 시도해 주세요.");}
    finally{setBusy(false);}
  };

  return <section className="settings-section instagram-settings"><div><h2>Instagram 연결</h2><p>게시 직전에는 항상 내용을 다시 보여주고 승인을 받아요.</p></div><div className="connection-panel">
    {!status&&!error&&<p role="status">연결 상태 확인 중…</p>}
    {status?.connected?<><div className="connection-card"><span className="status-dot on"/><div><strong>@{status.username} 연결됨</strong><p>{status.needsReconnect?"연결 기간이 끝났어요. 다시 연결해 주세요.":"게시 준비가 되었어요."}</p></div></div><div className="connection-actions">{status.needsReconnect&&<a className="button primary" href="/api/instagram/connect">다시 연결</a>}<button type="button" className="button secondary" disabled={busy} onClick={disconnect}>{busy?"해제 중…":"연결 해제"}</button></div></>:status&&<><div className="connection-card"><span className="status-dot"/><div><strong>아직 연결되지 않았어요</strong><p>프로페셔널 계정(비즈니스 또는 크리에이터)을 연결해 주세요.</p></div></div><a className="button primary" href="/api/instagram/connect">Instagram 연결</a></>}
    {error&&<p role="alert">{error}</p>}
    <p className="connection-help">연결 후에도 자동 게시되지 않아요. 완성된 이미지와 문안을 확인하고 ‘지금 게시’를 눌러야 게시됩니다.</p>
  </div></section>;
}
