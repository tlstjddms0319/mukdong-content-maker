"use client";
import { useState } from "react";
import { readJsonResponse } from "@/lib/http/readJson";

type Result={configured:boolean;ok:boolean;message:string};

// 영구 저장소(Supabase) 연결 확인. 버튼을 누르면 서버가 작은 파일을 쓰고·읽고·지워 본 결과를 보여 준다.
// Instagram 연결 정보와 초안이 서버 재시작 뒤에도 남는지는 이 저장소에 달려 있다.
export function StorageCheckCard(){
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const check=async()=>{
    setBusy(true);
    try{const response=await fetch("/api/storage/check",{cache:"no-store"});setResult(await readJsonResponse(response) as Result);}
    catch(error){setResult({configured:false,ok:false,message:error instanceof Error?error.message:"확인하지 못했어요. 잠시 뒤 다시 눌러 주세요."});}
    finally{setBusy(false);}
  };
  return <section className="settings-section"><div><h2>영구 저장소</h2><p>게시물·사진·Instagram 연결 정보를 서버 재시작 뒤에도 남기는 저장소(Supabase)예요.</p></div><div className="connection-panel">
    {result&&<div className="connection-card"><span className={`status-dot${result.ok?" on":""}`}/><div><strong>{result.ok?"정상":result.configured?"설정은 됐지만 문제가 있어요":"설정되지 않았어요"}</strong><p role={result.ok?"status":"alert"}>{result.message}</p></div></div>}
    <div className="connection-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>void check()}>{busy?"확인 중…":"저장소 연결 확인"}</button></div>
  </div></section>;
}
