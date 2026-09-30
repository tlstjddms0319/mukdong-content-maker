"use client";
import { useEffect,useState,useSyncExternalStore } from "react";
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

// 콜백이 /settings?instagram=error&reason=... 로 돌려보낸 결과를 사용자가 확인할 항목으로 바꾼다.
const callbackMessages:Record<string,string>={
  cancelled:"Instagram 연결을 취소했어요. 다시 누르고 권한을 허용해 주세요.",
  state:"연결 확인 정보가 만료됐어요. 이 화면에서 연결 버튼을 다시 눌러 주세요.",
  token:"Instagram이 연결을 거절했어요. 서버의 앱 시크릿이 Instagram 앱 시크릿인지, 연결 완료 주소가 Meta 설정과 같은지 확인해 주세요.",
  profile:"계정 정보를 가져오지 못했어요. 테스터 초대를 수락했는지, 프로페셔널 계정인지 확인해 주세요.",
  config:"게시 서버 설정이 부족해요. 아래 게시 서버 설정 항목을 확인해 주세요.",
};
const unknownCallbackMessage="Instagram 연결에 실패했어요. 서버 로그에서 [instagram] 줄을 확인해 주세요.";

// 주소창의 쿼리는 이 화면에 있는 동안 바뀌지 않으므로 구독할 것이 없다.
const noSubscribe=()=>()=>{};

function describeCallback(search:string):{ok:boolean;message:string}|null{
  const params=new URLSearchParams(search);
  const result=params.get("instagram");
  if(result==="connected")return {ok:true,message:"Instagram 계정을 연결했어요."};
  if(result==="error")return {ok:false,message:callbackMessages[params.get("reason")??""]??unknownCallbackMessage};
  return null;
}

export function InstagramConnectionCard(){
  const [status,setStatus]=useState<InstagramStatus|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  // 서버 렌더링에는 주소창이 없으니 빈 쿼리로 그리고, 브라우저에서 hydration 뒤에 실제 쿼리를 읽는다.
  const search=useSyncExternalStore(noSubscribe,()=>window.location.search,()=>"");
  const callbackResult=describeCallback(search);
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
  // 앱 ID·비밀키·연결 완료 주소가 없으면 연결 시작 주소가 오류만 돌려주므로 버튼을 막고 이유를 보여 준다.
  const canConnect=!status?.setup||Boolean(status.setup.appId&&status.setup.appSecret&&status.setup.redirectUri);

  return <section className="settings-section instagram-settings"><div><h2>Instagram 연결</h2><p>연결하면 최종 확인 화면에서 바로 게시하거나, 달력에 정한 시각에 자동으로 게시할 수 있어요.</p></div><div className="connection-panel">
    {callbackResult&&<p role={callbackResult.ok?"status":"alert"}>{callbackResult.message}</p>}
    {!status&&!error&&<p role="status">연결 상태 확인 중…</p>}
    {status?.connected?<><div className="connection-card"><span className="status-dot on"/><div><strong>@{status.username} 연결됨</strong><p>{status.needsReconnect?"연결 기간이 끝났어요. 다시 연결해 주세요.":"계정 연결이 유지되고 있어요."}</p></div></div><div className="connection-actions">{status.needsReconnect&&<a className="button primary" href="/api/instagram/connect">다시 연결</a>}<button type="button" className="button secondary" disabled={busy} onClick={disconnect}>{busy?"해제 중…":"연결 해제"}</button></div></>:status&&<><div className="connection-card"><span className="status-dot"/><div><strong>아직 연결되지 않았어요</strong><p>프로페셔널 계정(비즈니스 또는 크리에이터)을 연결해 주세요.</p></div></div>{canConnect?<a className="button primary" href="/api/instagram/connect">Instagram 연결</a>:<><button type="button" className="button primary" disabled>Instagram 연결</button><p className="connection-help">Meta 앱 ID·비밀키·연결 완료 주소를 서버 환경변수에 넣으면 연결할 수 있어요.</p></>}</>}
    {status&&<div className="connection-card"><span className={`status-dot${status.setup&&!missingSetup.length?" on":""}`}/><div><strong>게시 서버 설정</strong><p>{!status.setup?"설정 상태를 확인하지 못했어요.":missingSetup.length?"게시 서버 설정이 더 필요해요.":"필수 설정 항목이 모두 채워졌어요."}</p>{missingSetup.length>0&&<ul className="connection-missing">{missingSetup.map(item=><li key={item.key}>{item.label}</li>)}</ul>}<p className="connection-help">설정값 유무와 HTTPS 주소 형식만 확인해요. 실제 외부 접근과 게시 성공은 아직 검증하지 않았어요.</p></div></div>}
    {error&&<p role="alert">{error}</p>}
    <p className="connection-help">연결한 뒤에는 두 가지 방법으로 게시돼요. 최종 확인 화면의 ‘승인하고 Instagram에 게시’ 버튼으로 바로 게시하거나, 내 초안 달력에서 게시 희망일시를 정하고 ‘최종 확인 완료’를 켜 두면 그 시각에 자동으로 게시됩니다. 자동 게시를 멈추려면 서버 환경변수 INSTAGRAM_AUTOPUBLISH=off 로 두세요.</p>
  </div></section>;
}
