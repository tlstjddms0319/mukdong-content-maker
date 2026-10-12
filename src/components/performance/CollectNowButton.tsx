"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
// 하루 한 번 자동으로 가져오지만, 다시 연결한 직후처럼 바로 보고 싶을 때 누른다.
export function CollectNowButton(){
  const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  return <><button type="button" className="button secondary" disabled={busy} onClick={async()=>{
    setBusy(true);setMessage("");
    try{const response=await fetch("/api/metrics/collect",{method:"POST"});const run=await response.json() as {messages?:string[]};setMessage(run.messages?.length?run.messages.join(" / "):"가져왔어요.");router.refresh();}
    catch{setMessage("가져오지 못했어요. 잠시 뒤 다시 눌러 주세요.");}
    finally{setBusy(false);}
  }}>{busy?"가져오는 중…":"지금 가져오기"}</button>{message&&<p role="status" className="field-help">{message}</p>}</>;
}
