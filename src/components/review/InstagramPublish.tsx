"use client";
import { useEffect,useState } from "react";
import type { PublicInstagramConnection } from "@/features/instagram/schema";
import { readJsonResponse } from "@/lib/http/readJson";

export function InstagramPublish({draftId,caption,imageUrls}:{draftId?:string;caption:string;imageUrls:string[]}){
  const [connection,setConnection]=useState<PublicInstagramConnection|null>(null),[state,setState]=useState<"idle"|"publishing"|"published"|"error">("idle"),[message,setMessage]=useState("");
  const cover=imageUrls[0];
  useEffect(()=>{let active=true;fetch("/api/instagram/status").then(readJsonResponse).then(v=>{if(active)setConnection(v);}).catch(()=>{if(active)setConnection({connected:false});});return()=>{active=false;};},[]);
  const publish=async()=>{setState("publishing");setMessage("");try{const currentId=draftId??localStorage.getItem("mukdong-current-draft");if(!currentId)throw new Error("저장된 초안을 찾지 못했어요.");const response=await fetch("/api/instagram/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draftId:currentId,approved:true,caption})});const data=await readJsonResponse(response);if(!response.ok)throw new Error(data.error);setMessage(data.mediaId??"");setState("published");}catch(error){setMessage(error instanceof Error?error.message:"게시하지 못했어요.");setState("error");}};
  return <section className="publish-panel" aria-labelledby="publish-title"><div><p className="eyebrow">Instagram 게시</p><h2 id="publish-title">마지막 승인 후 게시해요</h2></div>{!connection?<p role="status">연결 상태 확인 중…</p>:!connection.connected?<p>설정 화면에서 Instagram을 연결하면 여기서 바로 게시할 수 있어요. 지금은 파일을 내려받아 직접 게시할 수 있어요.</p>:<><div className="publish-summary"><div className="publish-thumb" aria-label="게시 대표 이미지" style={cover?{backgroundImage:`url(${cover})`}:undefined}/><div><strong>@{connection.username}에 게시</strong><p>이미지 {imageUrls.length}장</p><p>{caption.slice(0,80)}{caption.length>80?"…":""}</p></div></div>{state==="published"?<p role="status"><strong>게시 완료</strong>{message&&<> · 미디어 ID {message}</>}</p>:<><p className="publish-warning">이 버튼을 눌러야 실제 게시됩니다.</p><button type="button" className="button publish-button" disabled={state==="publishing"} onClick={publish}>{state==="publishing"?"Instagram에서 처리 중…":"승인하고 Instagram에 게시"}</button></>}{state==="error"&&<p role="alert">{message}</p>}</>}</section>;
}
