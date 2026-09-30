"use client";
import { useEffect,useState } from "react";
import type { PublicInstagramConnection } from "@/features/instagram/schema";

type SetupStatus={appId:boolean;appSecret:boolean;redirectUri:boolean;mediaHttpsUrl:boolean;signingKey:boolean};
type InstagramStatus=PublicInstagramConnection&{setup?:SetupStatus};
const setupItems=[
  {key:"appId",label:"Meta 앱 ID"},
  {key:"appSecret",label:"Meta 앱 비밀키"},
  {key:"redirectUri",label:"Instagram 연결 완료 주소"},
  {key:"mediaHttpsUrl",label:"공개 이미지 HTTPS 주소"},
  {key:"signingKey",label:"이미지 보안 키"},
] as const;

export function InstagramConnectionCard(){
  const [status,setStatus]=useState<InstagramStatus|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;fetch("/api/instagram/status").then(response=>{
    if(!response.ok)throw new Error();return response.json();
  }).then(value=>{if(active)setStatus(value);}).catch(()=>{if(active)setError("연결 상태를 확인하지 못했어요.");});return()=>{active=false;};},[]);

  const disconnect=async()=>{
    setBusy(true);setError("");
    try{const response=await fetch("/api/instagram/connection",{method:"DELETE"});if(!response.ok)throw new Error();setStatus(current=>({connected:false,setup:current?.setup}));}
    catch{setError("연결을 해제하지 못했어요. 다시 시도해 주세요.");}
    finally{setBusy(false);}
  };

  const missingSetup=status?.setup?setupItems.filter(item=>!status.setup?.[item.key]):[];

  return <section className="settings-section instagram-settings"><div><h2>Instagram 연결</h2><p>연결하면 최종 확인 화면에서 바로 게시하거나, 달력에 정한 시각에 자동으로 게시할 수 있어요.</p></div><div className="connection-panel">
    {!status&&!error&&<p role="status">연결 상태 확인 중…</p>}
    {status?.connected?<><div className="connection-card"><span className="status-dot on"/><div><strong>@{status.username} 연결됨</strong><p>{status.needsReconnect?"연결 기간이 끝났어요. 다시 연결해 주세요.":"계정 연결이 유지되고 있어요."}</p></div></div><div className="connection-actions">{status.needsReconnect&&<a className="button primary" href="/api/instagram/connect">다시 연결</a>}<button type="button" className="button secondary" disabled={busy} onClick={disconnect}>{busy?"해제 중…":"연결 해제"}</button></div></>:status&&<><div className="connection-card"><span className="status-dot"/><div><strong>아직 연결되지 않았어요</strong><p>프로페셔널 계정(비즈니스 또는 크리에이터)을 연결해 주세요.</p></div></div><a className="button primary" href="/api/instagram/connect">Instagram 연결</a></>}
    {status&&<div className="connection-card"><span className={`status-dot${status.setup&&!missingSetup.length?" on":""}`}/><div><strong>게시 서버 설정</strong><p>{!status.setup?"설정 상태를 확인하지 못했어요.":missingSetup.length?"게시 서버 설정이 더 필요해요.":"필수 설정 항목이 모두 채워졌어요."}</p>{missingSetup.length>0&&<ul className="connection-missing">{missingSetup.map(item=><li key={item.key}>{item.label}</li>)}</ul>}<p className="connection-help">설정값 유무와 HTTPS 주소 형식만 확인해요. 실제 외부 접근과 게시 성공은 아직 검증하지 않았어요.</p></div></div>}
    {error&&<p role="alert">{error}</p>}
    <p className="connection-help">연결한 뒤에는 두 가지 방법으로 게시돼요. 최종 확인 화면의 ‘승인하고 Instagram에 게시’ 버튼으로 바로 게시하거나, 내 초안 달력에서 게시 희망일시를 정하고 ‘최종 확인 완료’를 켜 두면 그 시각에 자동으로 게시됩니다. 자동 게시를 멈추려면 서버 환경변수 INSTAGRAM_AUTOPUBLISH=off 로 두세요.</p>
  </div></section>;
}
