"use client";
import { useEffect,useState } from "react";
import type { PublicInstagramConnection } from "@/features/instagram/schema";
import type { PublishStatus } from "@/features/instagram/publicationState";
import { readJsonResponse } from "@/lib/http/readJson";

// 최종 확인 화면의 "승인하고 Instagram에 게시".
// - 연결 상태와 함께 이 초안의 게시 기록을 먼저 읽어, 이미 올린 초안이면 버튼 대신 그 사실을 보여 준다.
// - 서버가 "이미 게시된 초안"이라고 답하면(alreadyPublished) 새로 올린 것처럼 "게시 완료"라고 하지 않는다.
//   (게시 뒤 문안을 고치고 다시 눌러도 Instagram에는 올라가지 않으므로, 복제해서 새 초안으로 올리라고 안내한다.)
type PanelState="idle"|"publishing"|"published"|"already"|"error";

export function InstagramPublish({draftId,caption,imageUrls}:{draftId?:string;caption:string;imageUrls:string[]}){
  const [connection,setConnection]=useState<PublicInstagramConnection|null>(null);
  const [record,setRecord]=useState<PublishStatus|null>(null);
  const [state,setState]=useState<PanelState>("idle");
  const [message,setMessage]=useState("");
  const cover=imageUrls[0];
  useEffect(()=>{
    let active=true;
    fetch("/api/instagram/status").then(readJsonResponse).then(value=>{if(active)setConnection(value);}).catch(()=>{if(active)setConnection({connected:false});});
    return()=>{active=false;};
  },[]);
  // 연결돼 있을 때만 이 초안의 게시 기록을 묻는다(게시 상태를 못 읽어도 버튼은 그대로 쓸 수 있다).
  useEffect(()=>{
    if(!connection?.connected||!draftId)return;
    let active=true;
    fetch(`/api/instagram/publication?draftId=${encodeURIComponent(draftId)}`,{cache:"no-store"}).then(async response=>response.ok?readJsonResponse(response):null).then(value=>{if(active&&value?.state)setRecord(value);}).catch(()=>{});
    return()=>{active=false;};
  },[connection,draftId]);
  const publish=async()=>{
    setState("publishing");setMessage("");
    try{
      const currentId=draftId??localStorage.getItem("mukdong-current-draft");
      if(!currentId)throw new Error("저장된 초안을 찾지 못했어요.");
      const response=await fetch("/api/instagram/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draftId:currentId,approved:true,caption})});
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.error||data.message||"게시하지 못했어요.");
      setMessage(data.mediaId??"");
      setState(data.alreadyPublished?"already":"published");
    }catch(error){setMessage(error instanceof Error?error.message:"게시하지 못했어요.");setState("error");}
  };
  const alreadyNote=<p role="status"><strong>이미 게시된 초안이에요.</strong> 다시 올리지 않았어요. 고친 내용을 올리려면 내 초안에서 ‘복제’로 새 초안을 만들어 게시해 주세요.</p>;
  return <section className="publish-panel" aria-labelledby="publish-title">
    <div><p className="eyebrow">Instagram 게시</p><h2 id="publish-title">마지막 승인 후 게시해요</h2></div>
    {!connection?<p role="status">연결 상태 확인 중…</p>
      :!connection.connected?<p>설정 화면에서 Instagram을 연결하면 여기서 바로 게시할 수 있어요. 지금은 파일을 내려받아 직접 게시할 수 있어요.</p>
      :<>
        <div className="publish-summary"><div className="publish-thumb" aria-label="게시 대표 이미지" style={cover?{backgroundImage:`url(${cover})`}:undefined}/><div><strong>@{connection.username}에 게시</strong><p>이미지 {imageUrls.length}장</p><p>{caption.slice(0,80)}{caption.length>80?"…":""}</p></div></div>
        {state==="published"?<p role="status"><strong>게시 완료</strong>{message&&<> · 미디어 ID {message}</>}</p>
          :state==="already"||(state==="idle"&&record?.state==="published")?alreadyNote
          :<>
            {record&&record.state!=="none"&&record.state!=="scheduled"&&<p className="field-help">게시 기록 · {record.label}{record.detail?` · ${record.detail}`:""}</p>}
            <p className="publish-warning">이 버튼을 눌러야 실제 게시됩니다.</p>
            <button type="button" className="button publish-button" disabled={state==="publishing"} onClick={publish}>{state==="publishing"?"Instagram에서 처리 중…":"승인하고 Instagram에 게시"}</button>
          </>}
        {state==="error"&&<p role="alert">{message}</p>}
      </>}
  </section>;
}
