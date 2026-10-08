"use client";
import { useEffect,useRef,useState } from "react";
import type { PublicInstagramConnection } from "@/features/instagram/schema";
import type { PublishStatus } from "@/features/instagram/publicationState";
import { readJsonResponse } from "@/lib/http/readJson";

// 확인 화면의 큰 버튼 "인스타그램에 바로 올리기".
// - 연결 상태와 이 게시물의 올린 기록을 먼저 읽어, 이미 올린 게시물이면 버튼 대신 그 사실을 보여 준다.
// - 누르면 한 번 더 묻고(확인 창) 올린다. 실수로 눌러 올라가지 않게.
// - 서버가 "이미 올린 게시물"이라고 답하면(alreadyPublished) 새로 올린 것처럼 말하지 않는다
//   (올린 뒤 글을 고치고 다시 눌러도 인스타그램에는 올라가지 않으므로, 내 게시물에서 '복제'로 새로 올리라고 안내한다).
// - 연결이 안 돼 있으면 버튼을 흐리게 두고 한 줄로 설정에서 연결하라고 알린다.
// onBeforePublish: 올리기 전에 고친 글을 저장한다(실패하면 올리지 않는다).
// onReady: 바로 올릴 수 있는지(연결됨) 알려 준다. 못 올리면 부모가 "휴대폰에 저장하기"를 주인공 버튼으로 바꾼다.
type PanelState="idle"|"publishing"|"published"|"already"|"error";

export function InstagramPublish({draftId,caption,imageUrls,primary=true,onBeforePublish,onReady}:{draftId?:string;caption:string;imageUrls:string[];primary?:boolean;onBeforePublish?:()=>Promise<boolean>;onReady?:(ready:boolean)=>void}){
  const [connection,setConnection]=useState<PublicInstagramConnection|null>(null);
  const [record,setRecord]=useState<PublishStatus|null>(null);
  const [state,setState]=useState<PanelState>("idle");
  const [message,setMessage]=useState("");
  // 연결 상태는 화면을 열 때 한 번만 읽는다(부모가 onReady를 새로 만들어도 다시 묻지 않게 ref로 부른다).
  const readyRef=useRef(onReady);
  useEffect(()=>{readyRef.current=onReady;},[onReady]);
  useEffect(()=>{
    let active=true;
    fetch("/api/instagram/status").then(readJsonResponse).then(value=>{if(active){setConnection(value);readyRef.current?.(Boolean(value?.connected)&&!value?.needsReconnect);}}).catch(()=>{if(active){setConnection({connected:false});readyRef.current?.(false);}});
    return()=>{active=false;};
  },[]);
  // 연결돼 있을 때만 이 게시물의 올린 기록을 묻는다(기록을 못 읽어도 버튼은 그대로 쓸 수 있다).
  useEffect(()=>{
    if(!connection?.connected||!draftId)return;
    let active=true;
    fetch(`/api/instagram/publication?draftId=${encodeURIComponent(draftId)}`,{cache:"no-store"}).then(async response=>response.ok?readJsonResponse(response):null).then(value=>{if(active&&value?.state)setRecord(value);}).catch(()=>{});
    return()=>{active=false;};
  },[connection,draftId]);
  const publish=async()=>{
    if(!connection?.connected)return;
    if(!window.confirm(`@${connection.username}에 사진 ${imageUrls.length}장과 글을 지금 올릴까요?`))return;
    setState("publishing");setMessage("");
    try{
      if(onBeforePublish&&!await onBeforePublish())throw new Error("고친 글을 저장하지 못해 올리지 않았어요. 잠시 뒤 다시 눌러 주세요.");
      const currentId=draftId??localStorage.getItem("mukdong-current-draft");
      if(!currentId)throw new Error("저장된 게시물을 찾지 못했어요. 내 게시물에서 다시 열어 주세요.");
      const response=await fetch("/api/instagram/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({draftId:currentId,approved:true,caption})});
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.error||data.message||"올리지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      setState(data.alreadyPublished?"already":"published");
    }catch(error){setMessage(error instanceof Error?error.message:"올리지 못했어요. 잠시 뒤 다시 눌러 주세요.");setState("error");}
  };
  const already=state==="already"||(state==="idle"&&record?.state==="published");
  const ready=Boolean(connection?.connected)&&!connection?.needsReconnect;
  return <div className="share-action">
    {state==="published"?<p role="status" className="share-done"><strong>인스타그램에 올렸어요.</strong> 인스타그램 앱에서 확인해 보세요.</p>
      :already?<p role="status" className="share-done"><strong>이미 올린 게시물이에요.</strong> 다시 올리지 않았어요. 고쳐서 또 올리려면 내 게시물에서 ‘복제’를 눌러 새로 만들어 주세요.</p>
      :<>
        <button type="button" className={`button big ${primary?"primary":"secondary"} share-button`} disabled={!ready||state==="publishing"||!imageUrls.length} onClick={()=>void publish()}>{state==="publishing"?"인스타그램에 올리는 중…":"인스타그램에 바로 올리기"}</button>
        {!connection?<p className="field-help" role="status">인스타그램 연결을 확인하고 있어요…</p>
          :!connection.connected?<p className="field-help">설정에서 인스타그램을 연결하면 바로 올릴 수 있어요</p>
          :connection.needsReconnect?<p className="field-help">인스타그램 연결 기간이 끝났어요. 설정에서 다시 연결해 주세요</p>
          :<p className="field-help">@{connection.username} 계정에 올라가요</p>}
      </>}
    {state==="error"&&<p role="alert">{message}</p>}
  </div>;
}
