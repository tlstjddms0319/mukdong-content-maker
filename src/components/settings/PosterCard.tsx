"use client";
import { useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/http/readJson";

// 설정 화면 "맨 뒤 홍보 포스터". 카드뉴스 마지막 장에 붙는 가게 포스터를 코드 수정 없이 바꾼다.
// 순서: 직접 올린 포스터 → 앱에 들어 있는 기본 포스터 → (둘 다 없으면) 앱이 그린 홍보 카드.
// 미리보기는 서버가 실제 카드(1080×1350)로 맞춘 것을 절반 크기로 보내 주므로, 올린 그림이 카드에 들어갈 모습 그대로다.
type PosterState={source:"custom"|"bundled"|"design";updatedAt:string|null;preview:string|null};
const SOURCE_LABEL:Record<PosterState["source"],string>={custom:"직접 올린 포스터",bundled:"기본 포스터",design:"앱이 그린 홍보 카드"};

async function requestPoster(init?:RequestInit):Promise<PosterState> {
  const response=await fetch("/api/store/poster",{cache:"no-store",...init});
  const body=await readJsonResponse(response);
  if(!response.ok||!body.source)throw new Error(body.message||"홍보 포스터를 불러오지 못했어요.");
  return body as PosterState;
}
const message=(cause:unknown,fallback:string)=>cause instanceof Error?cause.message:fallback;
const dateText=(iso:string)=>new Date(iso).toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Seoul"});

export function PosterCard(){
  const [state,setState]=useState<PosterState|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  // 처음 열 때 한 번 불러온다(setState는 응답이 온 뒤 콜백에서만).
  useEffect(()=>{
    let cancelled=false;
    requestPoster().then(body=>{if(!cancelled)setState(body);}).catch(cause=>{if(!cancelled)setError(message(cause,"홍보 포스터를 불러오지 못했어요."));});
    return ()=>{cancelled=true;};
  },[]);
  // 올리기·되돌리기 공통: 버튼을 잠그고, 끝나면 새 미리보기로 바꾼다.
  const run=async(init:RequestInit,done:string,fallback:string)=>{
    setBusy(true);setError("");setNotice("");
    try{setState(await requestPoster(init));setNotice(done);}
    catch(cause){setError(message(cause,fallback));}
    finally{setBusy(false);if(input.current)input.current.value="";}
  };
  const upload=(file:File|undefined)=>{
    if(!file)return;
    const form=new FormData();form.append("file",file);
    void run({method:"POST",body:form},"새 포스터로 바꿨어요. 이제부터 만드는 카드뉴스 마지막 장에 들어가요.","포스터를 올리지 못했어요.");
  };
  const revert=()=>{
    if(!window.confirm("직접 올린 포스터를 지우고 기본 포스터로 되돌릴까요?"))return;
    void run({method:"DELETE"},"기본 포스터로 되돌렸어요.","기본 포스터로 되돌리지 못했어요.");
  };
  return <section className="settings-section" aria-label="맨 뒤 홍보 포스터"><div><h2>맨 뒤 홍보 포스터</h2>
    <p>카드뉴스 마지막 장에 붙는 가게 포스터예요. 계절 메뉴가 바뀌면 여기서 새 그림으로 바꿔 주세요.</p></div>
    <div className="poster-setting">
      {/* 미리보기는 data URL이라 next/image 최적화가 필요 없다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {state?.preview&&<img src={state.preview} alt="지금 쓰는 홍보 포스터 미리보기" width={270} height={338}/>}
      <div>
        {state&&<p><strong>{SOURCE_LABEL[state.source]}</strong>{state.source==="custom"&&state.updatedAt?` · ${dateText(state.updatedAt)}에 올림`:""}</p>}
        {state?.source==="design"&&<p className="field-help">포스터 그림이 없어서 앱이 가게 정보로 그린 카드를 써요.</p>}
        <p className="field-help">세로 4:5(예: 1080×1350) 그림이 가장 잘 맞아요. 비율이 다르면 그림을 자르지 않고 남는 곳을 흐린 배경으로 채워요. 주소·전화번호·메뉴 이름에 오타가 없는지 꼭 확인하고 올려 주세요. 바꾼 포스터는 새로 만드는 카드뉴스부터 들어가요.</p>
        <div className="connection-actions">
          <label className={`button primary${busy?" disabled":""}`} aria-disabled={busy}>
            {busy?"처리 중…":"새 포스터 올리기"}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={event=>upload(event.target.files?.[0])}/>
          </label>
          {state?.source==="custom"&&<button type="button" className="button secondary" disabled={busy} onClick={revert}>기본 포스터로 되돌리기</button>}
        </div>
        {notice&&<p role="status">{notice}</p>}
        {error&&<p role="alert">{error}</p>}
      </div>
    </div>
  </section>;
}
