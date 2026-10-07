"use client";
import { useEffect, useState } from "react";

// 로그인이 만료된 뒤(최대 8시간) 화면에서 무언가를 누르면 서버가 401을 돌려준다.
// 예전에는 "이미지를 만들지 못했습니다"처럼 엉뚱한 오류만 보였고, 새로고침하면 만든 장이 사라졌다.
// 여기서 같은 사이트의 /api 요청이 401을 받으면 화면 아래에 안내를 띄운다. 새 탭에서 로그인하면 이 탭의 작업은 그대로 이어진다.
type WatchedFetch=typeof fetch&{__sessionWatch?:boolean};

export function SessionExpiryNotice(){
  const [expired,setExpired]=useState(false);
  useEffect(()=>{
    const original=window.fetch as WatchedFetch;
    if(original.__sessionWatch)return;
    const watched:WatchedFetch=Object.assign(async(...args:Parameters<typeof fetch>)=>{
      const response=await original(...args);
      try{
        const target=args[0];
        const url=new URL(typeof target==="string"?target:target instanceof URL?target.href:target.url,window.location.href);
        if(response.status===401&&url.origin===window.location.origin&&url.pathname.startsWith("/api/")&&!url.pathname.startsWith("/api/auth"))setExpired(true);
      }catch{/* 주소를 읽지 못하면 그냥 넘긴다 */}
      return response;
    },{__sessionWatch:true});
    window.fetch=watched;
    return()=>{window.fetch=original;};
  },[]);
  if(!expired)return null;
  return <div className="session-expired" role="alert">
    <p><strong>로그인이 만료됐어요.</strong> 이 탭에서 만든 내용은 그대로 있어요. 새 탭에서 다시 로그인한 뒤 이 탭으로 돌아와 방금 누른 버튼을 다시 눌러 주세요.</p>
    <div>
      <a className="button primary" href="/login?next=%2Fdrafts" target="_blank" rel="noopener">새 탭에서 로그인</a>
      <button type="button" className="button secondary" onClick={()=>setExpired(false)}>다시 로그인했어요</button>
    </div>
  </div>;
}
