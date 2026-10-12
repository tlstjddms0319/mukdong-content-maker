"use client";
import { useEffect,useState,useSyncExternalStore } from "react";
import type { PublicInstagramConnection } from "@/features/instagram/schema";

type SetupStatus={appId:boolean;appSecret:boolean;redirectUri:boolean;mediaHttpsUrl:boolean;signingKey:boolean;persistentStorage?:boolean};
type InstagramStatus=PublicInstagramConnection&{setup?:SetupStatus};
const setupItems=[
  {key:"appId",label:"Meta 앱 ID"},
  {key:"appSecret",label:"Meta 앱 비밀키"},
  {key:"redirectUri",label:"Instagram 연결 완료 주소"},
  {key:"mediaHttpsUrl",label:"공개 이미지 HTTPS 주소"},
  {key:"signingKey",label:"이미지 보안 키"},
  {key:"persistentStorage",label:"영구 저장소(SUPABASE_URL·SUPABASE_SECRET_KEY). 없으면 서버가 재시작될 때마다 연결이 풀려요"},
] as const;

// 콜백이 /settings?instagram=error&reason=... 로 돌려보낸 결과를 사용자가 확인할 항목으로 바꾼다.
const callbackMessages:Record<string,string>={
  cancelled:"Instagram 연결을 취소했어요. 다시 누르고 권한을 허용해 주세요.",
  state:"연결 확인 정보가 만료됐어요. 이 화면에서 연결 버튼을 다시 눌러 주세요.",
  token:"Instagram이 연결을 거절했어요. 서버의 앱 시크릿이 Instagram 앱 시크릿인지, 연결 완료 주소가 Meta 설정과 같은지 확인해 주세요.",
  profile:"계정 정보를 가져오지 못했어요. 테스터 초대를 수락했는지, 프로페셔널 계정인지 확인해 주세요.",
  config:"게시 서버 설정이 부족해요. 아래 게시 서버 설정 항목을 확인해 주세요.",
};
// 토큰 거절(reason=token) 가운데 서버가 원인을 알아낸 경우(hint)에는 고칠 곳 하나만 콕 집어 안내한다.
const tokenHintMessages:Record<string,string>={
  secret:"Instagram이 앱 시크릿을 거절했어요. Render의 INSTAGRAM_APP_SECRET에 Meta 앱의 ‘Instagram 앱 시크릿’(Instagram → API 설정 → Instagram 로그인 비즈니스 설정)을 넣어 주세요. Facebook 앱 시크릿(앱 설정 → 기본 설정)과는 다른 값이에요.",
  redirect:"연결 완료 주소가 Meta에 등록한 주소와 달라요. Render의 INSTAGRAM_REDIRECT_URI와 Meta의 ‘OAuth 리디렉션 URI’를 글자 하나까지(https, 끝의 / 포함) 똑같이 맞춰 주세요.",
  code:"Instagram 인증 코드가 이미 쓰였거나 만료됐어요. 서버가 잠에서 깨는 동안 생기는 일이 많아요. 잠시 뒤 연결 버튼을 다시 눌러 주세요.",
  app:"Instagram이 앱 ID를 알아보지 못했어요. Render의 INSTAGRAM_APP_ID에 ‘Instagram 앱 ID’(Facebook 앱 ID와 다른 값)를 넣어 주세요.",
};
const unknownCallbackMessage="Instagram 연결에 실패했어요. 서버 로그에서 [instagram] 줄을 확인해 주세요.";

// 주소창의 쿼리는 이 화면에 있는 동안 바뀌지 않으므로 구독할 것이 없다.
const noSubscribe=()=>()=>{};

function describeCallback(search:string):{ok:boolean;message:string}|null{
  const params=new URLSearchParams(search);
  const result=params.get("instagram");
  if(result==="connected")return {ok:true,message:"Instagram 계정을 연결했어요."};
  if(result==="error"){
    const reason=params.get("reason")??"";
    const hinted=reason==="token"?tokenHintMessages[params.get("hint")??""]:undefined;
    return {ok:false,message:hinted??callbackMessages[reason]??unknownCallbackMessage};
  }
  return null;
}

export type { InstagramStatus };

// 사장님이 보는 화면에 쓰는 쉬운 안내(어디를 누르면 되는지만). 원인과 서버 설정 이름은 관리자용(part="server")에서만 보여 준다.
function plainCallback(search:string):{ok:boolean;message:string}|null{
  const result=describeCallback(search);
  if(!result||result.ok)return result;
  const reason=new URLSearchParams(search).get("reason");
  if(reason==="cancelled")return {ok:false,message:"연결을 취소했어요. ‘인스타그램 연결하기’를 다시 누르고 허용을 눌러 주세요."};
  return {ok:false,message:"인스타그램 연결에 실패했어요. 잠시 뒤 ‘인스타그램 연결하기’를 다시 눌러 주세요. 계속 안 되면 아래 ‘관리자용 설정’을 확인해 주세요."};
}

// 설정 화면의 인스타그램 연결. part="main"(기본)은 사장님용: 연결 상태·연결하기·연결 끊기만.
// part="server"는 관리자용 설정 안: 연결 실패 원인, 게시 서버 설정 항목, 자동 게시 동작 설명.
export function InstagramConnectionCard({part="main"}:{part?:"main"|"server"}){
  const [status,setStatus]=useState<InstagramStatus|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  // 서버 렌더링에는 주소창이 없으니 빈 쿼리로 그리고, 브라우저에서 hydration 뒤에 실제 쿼리를 읽는다.
  const search=useSyncExternalStore(noSubscribe,()=>window.location.search,()=>"");
  useEffect(()=>{let active=true;fetch("/api/instagram/status").then(response=>{
    if(!response.ok)throw new Error();return response.json();
  }).then(value=>{if(active)setStatus(value);}).catch(()=>{if(active)setError("연결 상태를 확인하지 못했어요. 잠시 뒤 화면을 다시 열어 주세요.");});return()=>{active=false;};},[]);

  const disconnect=async()=>{
    if(!window.confirm("인스타그램 연결을 끊을까요? 끊으면 바로 올리기와 예약 올리기가 멈춰요."))return;
    setBusy(true);setError("");
    try{const response=await fetch("/api/instagram/connection",{method:"DELETE"});if(!response.ok)throw new Error();setStatus(current=>({connected:false,setup:current?.setup}));}
    catch{setError("연결을 끊지 못했어요. 다시 눌러 주세요.");}
    finally{setBusy(false);}
  };

  // 영구 저장소는 서버가 "없다"고 명시했을 때만 빠진 항목으로 본다(예전 서버 응답에는 이 값이 없다).
  const missingSetup=status?.setup?setupItems.filter(item=>item.key==="persistentStorage"?status.setup?.persistentStorage===false:!status.setup?.[item.key]):[];
  // 앱 ID·비밀키·연결 완료 주소가 없으면 연결 시작 주소가 오류만 돌려주므로 버튼을 막고 이유를 보여 준다.
  const canConnect=!status?.setup||Boolean(status.setup.appId&&status.setup.appSecret&&status.setup.redirectUri);

  if(part==="server"){
    const callbackResult=describeCallback(search);
    return <section className="settings-section instagram-settings"><div><h2>Instagram 게시 서버</h2><p>Meta 앱·서버 설정 상태와 연결 실패 원인이에요.</p></div><div className="connection-panel">
      {callbackResult&&!callbackResult.ok&&<p role="alert">{callbackResult.message}</p>}
      {status&&<div className="connection-card"><span className={`status-dot${status.setup&&!missingSetup.length?" on":""}`}/><div><strong>게시 서버 설정</strong><p>{!status.setup?"설정 상태를 확인하지 못했어요.":missingSetup.length?"게시 서버 설정이 더 필요해요.":"필수 설정 항목이 모두 채워졌어요."}</p>{missingSetup.length>0&&<ul className="connection-missing">{missingSetup.map(item=><li key={item.key}>{item.label}</li>)}</ul>}{!canConnect&&<p className="connection-help">Meta 앱 ID·비밀키·연결 완료 주소를 서버 환경변수에 넣으면 연결할 수 있어요.</p>}<p className="connection-help">설정값 유무와 HTTPS 주소 형식만 확인해요. 실제 외부 접근과 게시 성공은 아직 검증하지 않았어요.</p></div></div>}
      <p className="connection-help">연결한 뒤에는 두 가지 방법으로 게시돼요. 확인 화면의 ‘인스타그램에 바로 올리기’ 버튼으로 바로 게시하거나, 내 게시물에서 올릴 날짜를 정하고 ‘최종 확인 완료’를 켜 두면 그 시각에 자동으로 게시됩니다. 무료 서버는 잠들어 있는 동안 게시하지 못해요. 저장소의 GitHub 예약 작업이 1시간마다 서버를 깨우므로(/api/instagram/scheduler) 예약 시각보다 최대 1시간쯤 늦게 올라갈 수 있어요. 6시간 넘게 늦어진 글은 게시하지 않고 ‘예약 놓침’으로 남겨요. 자동 게시를 멈추려면 서버 환경변수 INSTAGRAM_AUTOPUBLISH=off 로 두세요(토큰 갱신은 계속해요).</p>
    </div></section>;
  }
  const callbackResult=plainCallback(search);
  return <section className="settings-section instagram-settings"><div><h2>인스타그램 연결</h2><p>연결해 두면 확인 화면에서 ‘인스타그램에 바로 올리기’를 누를 수 있어요.</p></div><div className="connection-panel">
    {callbackResult&&<p role={callbackResult.ok?"status":"alert"}>{callbackResult.ok?"인스타그램 계정을 연결했어요.":callbackResult.message}</p>}
    {!status&&!error&&<p role="status">연결 상태 확인 중…</p>}
    {status?.connected?<><div className="connection-card"><span className="status-dot on"/><div><strong>@{status.username} 연결됨</strong><p>{status.needsReconnect?"연결 기간이 끝났어요. ‘다시 연결’을 눌러 주세요.":status.insights===false?"게시는 잘 돼요. ‘다시 연결’을 한 번 누르면 팔로워·도달 같은 성과도 자동으로 가져와요.":"잘 연결돼 있어요."}</p></div></div><div className="connection-actions">{(status.needsReconnect||status.insights===false)&&<a className="button primary" href="/api/instagram/connect">다시 연결</a>}<button type="button" className="button secondary" disabled={busy} onClick={()=>void disconnect()}>{busy?"끊는 중…":"연결 끊기"}</button></div></>:status&&<><div className="connection-card"><span className="status-dot"/><div><strong>아직 연결되지 않았어요</strong><p>가게 인스타그램(프로페셔널 계정)으로 로그인해 연결해 주세요.</p></div></div>{canConnect?<a className="button primary big" href="/api/instagram/connect">인스타그램 연결하기</a>:<><button type="button" className="button primary big" disabled>인스타그램 연결하기</button><p className="connection-help">관리자 설정이 끝나면 연결할 수 있어요. 아래 ‘관리자용 설정’을 확인해 주세요.</p></>}</>}
    {error&&<p role="alert">{error}</p>}
  </div></section>;
}
