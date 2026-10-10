"use client";
import { useEffect,useState } from "react";
import { readJsonResponse } from "@/lib/http/readJson";
import type { NotificationPrefs } from "@/features/notifications/schema";

// 설정 화면의 "휴대폰 알림". 이 기기에서 알림 받기/끄기, 시험 알림, 알림 종류·요일·시각을 고른다.
// 알림은 서버가 보내므로 사이트를 닫아 둬도 온다(안드로이드 크롬). 받은 알림을 누르면 해당 화면이 열린다.

type Device={endpoint:string;label?:string;createdAt:string};
type Loaded={publicKey:string;prefs:NotificationPrefs;devices:Device[]};
type Support="checking"|"supported"|"unsupported";

const WEEKDAYS=["일","월","화","수","목","금","토"];
const HOURS=Array.from({length:15},(_,i)=>i+7);
const QUIET_CHOICES=[{value:0,label:"알리지 않기"},{value:3,label:"3일째"},{value:5,label:"5일째"},{value:7,label:"7일째"}];

// 공개키(base64url) → 브라우저 구독에 넘길 바이트.
function keyBytes(base64url:string):Uint8Array<ArrayBuffer> {
  const base64=(base64url+"=".repeat((4-base64url.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  const bytes=new Uint8Array(new ArrayBuffer(raw.length));
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

function deviceLabel(){
  const ua=navigator.userAgent;
  return /Android/i.test(ua)?"안드로이드 휴대폰":/iPhone|iPad/i.test(ua)?"아이폰":"컴퓨터";
}

async function send(url:string,method:string,body?:unknown){
  const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data?.message??data?.error??"요청에 실패했어요. 다시 눌러 주세요.");
  return data;
}

export function NotificationCard(){
  const [support,setSupport]=useState<Support>("checking");
  const [loaded,setLoaded]=useState<Loaded|null>(null);
  const [prefs,setPrefs]=useState<NotificationPrefs|null>(null);
  const [endpoint,setEndpoint]=useState<string|null>(null);
  const [permission,setPermission]=useState<NotificationPermission>("default");
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);

  useEffect(()=>{
    let active=true;
    (async()=>{
      const ok="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
      if(!active)return;
      setSupport(ok?"supported":"unsupported");
      if(ok){
        setPermission(Notification.permission);
        // 알림을 받으려면 서비스 워커가 있어야 한다. 이미 등록돼 있으면 그대로 쓴다.
        const registration=await navigator.serviceWorker.register("/sw.js").catch(()=>null);
        const current=await registration?.pushManager.getSubscription().catch(()=>null);
        if(active)setEndpoint(current?.endpoint??null);
      }
      const data=await send("/api/notifications","GET") as Loaded;
      if(active){setLoaded(data);setPrefs(data.prefs);}
    })().catch(error=>{if(active)setNotice({ok:false,text:error instanceof Error?error.message:"알림 설정을 불러오지 못했어요."});});
    return()=>{active=false;};
  },[]);

  const registered=Boolean(endpoint&&loaded?.devices.some(device=>device.endpoint===endpoint));

  const subscribe=async()=>{
    if(!loaded)return;
    setBusy("subscribe");setNotice(null);
    try{
      const result=await Notification.requestPermission();
      setPermission(result);
      if(result!=="granted")throw new Error("알림이 허용되지 않았어요. 아래 안내대로 크롬에서 알림을 허용해 주세요.");
      const registration=await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(loaded.publicKey)});
      const json=subscription.toJSON();
      await send("/api/notifications/subscription","POST",{subscription:{endpoint:json.endpoint,keys:json.keys},label:deviceLabel()});
      setEndpoint(subscription.endpoint);
      setLoaded(current=>current&&{...current,devices:[...current.devices.filter(device=>device.endpoint!==subscription.endpoint),{endpoint:subscription.endpoint,label:deviceLabel(),createdAt:new Date().toISOString()}]});
      await send("/api/notifications/test","POST",{endpoint:subscription.endpoint}).catch(()=>{});
      setNotice({ok:true,text:"이 휴대폰으로 알림을 받아요. 방금 시험 알림을 하나 보냈어요."});
    }catch(error){setNotice({ok:false,text:error instanceof Error?error.message:"알림을 켜지 못했어요. 다시 눌러 주세요."});}
    finally{setBusy("");}
  };

  const unsubscribe=async()=>{
    if(!endpoint)return;
    setBusy("unsubscribe");setNotice(null);
    try{
      await send("/api/notifications/subscription","DELETE",{endpoint});
      const registration=await navigator.serviceWorker.getRegistration("/sw.js");
      await (await registration?.pushManager.getSubscription())?.unsubscribe().catch(()=>false);
      setLoaded(current=>current&&{...current,devices:current.devices.filter(device=>device.endpoint!==endpoint)});
      setEndpoint(null);
      setNotice({ok:true,text:"이 휴대폰 알림을 껐어요."});
    }catch(error){setNotice({ok:false,text:error instanceof Error?error.message:"알림을 끄지 못했어요. 다시 눌러 주세요."});}
    finally{setBusy("");}
  };

  const test=async()=>{
    setBusy("test");setNotice(null);
    try{await send("/api/notifications/test","POST",endpoint?{endpoint}:{});setNotice({ok:true,text:"시험 알림을 보냈어요. 휴대폰 알림창을 확인해 보세요."});}
    catch(error){setNotice({ok:false,text:error instanceof Error?error.message:"알림을 보내지 못했어요."});}
    finally{setBusy("");}
  };

  const save=async()=>{
    if(!prefs)return;
    setBusy("save");setNotice(null);
    try{const data=await send("/api/notifications","PUT",prefs);setPrefs(data.prefs);setLoaded(current=>current&&{...current,prefs:data.prefs});setNotice({ok:true,text:"알림 설정을 저장했어요."});}
    catch(error){setNotice({ok:false,text:error instanceof Error?error.message:"저장하지 못했어요. 다시 눌러 주세요."});}
    finally{setBusy("");}
  };

  const update=<K extends keyof NotificationPrefs>(key:K,value:NotificationPrefs[K])=>setPrefs(current=>current&&{...current,[key]:value});
  const toggleDay=(day:number)=>prefs&&update("weekdays",prefs.weekdays.includes(day)?prefs.weekdays.filter(item=>item!==day):[...prefs.weekdays,day].sort());
  const changed=Boolean(prefs&&loaded&&JSON.stringify(prefs)!==JSON.stringify(loaded.prefs));
  const otherDevices=(loaded?.devices??[]).filter(device=>device.endpoint!==endpoint);

  return <section className="settings-section notification-settings"><div><h2>휴대폰 알림</h2><p>올리는 날과 예약 글 결과를 휴대폰 알림으로 알려 드려요. 사이트를 닫아 둬도 와요.</p></div><div className="connection-panel">
    {support==="checking"&&<p role="status">알림 상태 확인 중…</p>}
    {support==="unsupported"&&<p className="connection-help">이 브라우저에서는 알림을 받을 수 없어요. 안드로이드 휴대폰의 크롬으로 이 화면을 열어 주세요.</p>}
    {support==="supported"&&<>
      <div className="connection-card"><span className={`status-dot${registered?" on":""}`}/><div><strong>{registered?"이 휴대폰으로 알림을 받고 있어요":"이 휴대폰은 아직 알림을 받지 않아요"}</strong><p>{otherDevices.length?`다른 기기 ${otherDevices.length}대도 알림을 받아요.`:registered?"설정한 요일·시각에 알려 드려요.":"아래 버튼을 누르고 ‘허용’을 눌러 주세요."}</p></div></div>
      <div className="connection-actions">
        {registered
          ?<><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={()=>void test()}>{busy==="test"?"보내는 중…":"시험 알림 보내기"}</button><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={()=>void unsubscribe()}>{busy==="unsubscribe"?"끄는 중…":"이 휴대폰 알림 끄기"}</button></>
          :<button type="button" className="button primary big" disabled={!loaded||Boolean(busy)} onClick={()=>void subscribe()}>{busy==="subscribe"?"켜는 중…":"이 휴대폰으로 알림 받기"}</button>}
      </div>
      {permission==="denied"&&<p className="connection-help">알림이 막혀 있어요. 크롬 주소창 왼쪽의 아이콘(설정 모양) → ‘권한’ → ‘알림’을 허용으로 바꾼 뒤 다시 눌러 주세요.</p>}
      <p className="connection-help">크롬 메뉴(⋮) → ‘홈 화면에 추가’를 해 두면 알림이 더 잘 오고, 누르면 앱처럼 바로 열려요.</p>
    </>}
    {notice&&<p role={notice.ok?"status":"alert"}>{notice.text}</p>}
    {prefs&&(registered||otherDevices.length>0)&&<div className="notification-prefs">
      <div className="check-list">
        <label><input type="checkbox" checked={prefs.makeDay} onChange={event=>update("makeDay",event.target.checked)}/> 올리는 날 알림</label>
      </div>
      {prefs.makeDay&&<>
        <div className="weekday-picks" role="group" aria-label="알림 받을 요일">{WEEKDAYS.map((name,day)=><button key={name} type="button" className="button secondary" aria-pressed={prefs.weekdays.includes(day)} onClick={()=>toggleDay(day)}>{name}</button>)}</div>
        <p className="field-help">한 달 계획에 주제를 넣어 둔 날도 알려 드려요. 그날 글을 이미 만들었으면 알리지 않아요.</p>
      </>}
      <div className="field-grid">
        <label>알림 시각<select aria-label="알림 시각" value={prefs.hour} onChange={event=>update("hour",Number(event.target.value))}>{HOURS.map(hour=><option key={hour} value={hour}>{hour<12?`오전 ${hour}시`:hour===12?"낮 12시":`오후 ${hour-12}시`}</option>)}</select></label>
        <label>새 글이 없을 때<select aria-label="새 글이 없을 때" value={prefs.quietDays} onChange={event=>update("quietDays",Number(event.target.value))}>{QUIET_CHOICES.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
      </div>
      <div className="check-list">
        <label><input type="checkbox" checked={prefs.publishResults} onChange={event=>update("publishResults",event.target.checked)}/> 예약 글이 올라갔거나 실패했을 때</label>
        <label><input type="checkbox" checked={prefs.connection} onChange={event=>update("connection",event.target.checked)}/> 인스타그램 연결이 끊기기 전</label>
      </div>
      <p className="field-help">무료 서버라 알림이 정한 시각보다 최대 1시간쯤 늦게 올 수 있어요. 밤 10시 이후에는 보내지 않아요.</p>
      <button type="button" className="button primary" disabled={!changed||Boolean(busy)} onClick={()=>void save()}>{busy==="save"?"저장하는 중…":"알림 설정 저장"}</button>
    </div>}
  </div></section>;
}
