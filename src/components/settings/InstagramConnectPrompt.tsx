"use client";
import { useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/http/readJson";
import type { InstagramStatus } from "./InstagramConnectionCard";

// 로그인하고 첫 화면에 들어왔을 때 Instagram이 연결돼 있지 않으면(또는 기간이 끝났으면) 바로 연결 창을 띄운다.
// "나중에"를 누르면 이 탭이 열려 있는 동안(sessionStorage)은 다시 띄우지 않는다. 게시 서버 설정이 빠져 있어
// 연결 버튼이 어차피 동작하지 않는 경우에는 창을 띄우지 않고 설정 화면의 안내에 맡긴다.
const DISMISSED_KEY="mukdong-instagram-prompt-dismissed";

function wasDismissed(){try{return sessionStorage.getItem(DISMISSED_KEY)==="1";}catch{return false;}}
function rememberDismissed(){try{sessionStorage.setItem(DISMISSED_KEY,"1");}catch{}}

export function InstagramConnectPrompt(){
  const [status,setStatus]=useState<InstagramStatus|null>(null);
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    if(wasDismissed())return;
    let active=true;
    fetch("/api/instagram/status").then(readJsonResponse).then((value:InstagramStatus)=>{
      if(!active)return;
      const canConnect=Boolean(value.setup?.appId&&value.setup.appSecret&&value.setup.redirectUri);
      setStatus(value);
      setOpen(canConnect&&(!value.connected||Boolean(value.needsReconnect)));
    }).catch(()=>{});
    return()=>{active=false;};
  },[]);
  if(!open||!status)return null;
  const later=()=>{rememberDismissed();setOpen(false);};
  const reconnect=status.connected&&status.needsReconnect;
  return <div className="modal-backdrop" onClick={later}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="instagram-prompt-title" onClick={event=>event.stopPropagation()}>
      <h2 id="instagram-prompt-title">{reconnect?"인스타그램 연결 기간이 끝났어요":"인스타그램을 연결할까요?"}</h2>
      <p>{reconnect?`@${status.username} 계정을 다시 연결하면 바로 게시와 예약 게시를 계속 쓸 수 있어요.`:"연결해 두면 만든 게시물을 이 앱에서 바로 올리거나, 정한 시각에 저절로 올릴 수 있어요."}</p>
      {status.setup&&status.setup.persistentStorage===false&&<p className="connection-help">지금은 연결이 오래 보관되지 않아 서버가 다시 켜지면 풀릴 수 있어요(관리하는 분: 설정 → 관리자용 설정 → 영구 저장소).</p>}
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={later}>나중에</button>
        <a className="button primary" href="/api/instagram/connect" onClick={rememberDismissed}>{reconnect?"다시 연결":"지금 연결"}</a>
      </div>
    </div>
  </div>;
}
