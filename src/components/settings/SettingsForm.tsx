"use client";
import { useState } from "react";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import type { AppSettings } from "@/features/settings/schema";

async function saveSettings(value: AppSettings) {
  const response = await fetch("/api/settings", { method:"PUT", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(value) });
  if (!response.ok) throw new Error("설정을 저장하지 못했습니다.");
}

export function SettingsForm({ onSave = saveSettings, connections = { gemini:false, groq:false, cloudflare:false, openai:false, higgsfield:false }, initialSettings = DEFAULT_SETTINGS }: { onSave?: (value:AppSettings)=>void|Promise<void>; connections?:{gemini:boolean;groq:boolean;cloudflare:boolean;openai:boolean;higgsfield?:boolean;naver?:boolean}; initialSettings?:AppSettings }) {
  const [settings,setSettings]=useState<AppSettings>({ ...initialSettings });
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState("");
  const update=<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>{setSaved(false);setSettings(current=>({...current,[key]:value}));};
  return <form className="settings-form" onSubmit={async e=>{e.preventDefault();setError("");try{await onSave(settings);setSaved(true);}catch(reason){setSaved(false);setError(reason instanceof Error?reason.message:"설정을 저장하지 못했습니다.");}}}>
    <section className="settings-section"><div><h2>기본 설정</h2><p>처음에는 권장값 그대로 사용해도 돼요.</p></div><div className="field-grid">
      <label>캐러셀 장수<select aria-label="캐러셀 장수" value={settings.carouselSlideCount} onChange={e=>update("carouselSlideCount",Number(e.target.value) as AppSettings["carouselSlideCount"])}><option value="3">3</option><option value="5">5 (권장)</option><option value="7">7</option><option value="10">10</option></select></label>
      <label>문안 길이<select aria-label="문안 길이" value={settings.copyLength} onChange={e=>update("copyLength",e.target.value as AppSettings["copyLength"])}><option value="short">짧게 (200~350자)</option><option value="medium">기본 (500~800자)</option><option value="detailed">자세히 (900~1,200자)</option></select></label>
      <label>OpenAI 이미지 품질<select aria-label="OpenAI 이미지 품질" value={settings.imageQuality??"medium"} onChange={e=>update("imageQuality",e.target.value as AppSettings["imageQuality"])}><option value="medium">표준</option><option value="high">고품질 (시간·비용 증가)</option></select></label>
      <label>이미지 AI<select aria-label="이미지 AI" value={settings.imageAiProvider} onChange={e=>update("imageAiProvider",e.target.value as AppSettings["imageAiProvider"])}><option value="automatic">자동 (Higgsfield → Cloudflare → OpenAI)</option><option value="higgsfield">Higgsfield만 (크레딧 사용)</option><option value="cloudflare">Cloudflare만 (초과 과금 가능)</option><option value="openai">OpenAI만 (유료 가능)</option></select></label>
      <label>문안 AI<select aria-label="문안 AI" value={settings.textAiProvider} onChange={e=>update("textAiProvider",e.target.value as AppSettings["textAiProvider"])}><option value="automatic">자동 (Gemini → Groq → Cloudflare)</option><option value="gemini">Gemini만</option><option value="groq">Groq만</option><option value="cloudflare">Cloudflare만 (이미지와 무료 한도 공유)</option></select></label>
    </div></section>
    <section className="settings-section"><div><h2>브랜드 키트</h2><p>모든 디자인 계열의 카드 바닥글에 가게 이름과 함께 같은 모양으로 찍혀요. 비우면 가게 이름만 찍혀요.</p></div><div className="field-grid">
      <label>Instagram 계정<input aria-label="Instagram 계정" placeholder="@mukdong_hongeo" maxLength={31} value={settings.brandHandle??""} onChange={e=>update("brandHandle",e.target.value.trim())}/><small className="field-help">카드 예시: 묵동홍어마을 · {settings.brandHandle?.trim()?`@${settings.brandHandle.trim().replace(/^@/,"")}`:"@계정"}</small></label>
    </div></section>
    <section className="settings-section"><div><h2>원격 누끼 (선택)</h2><p>켜면 누끼가 어려운 사진을 Higgsfield로 배경 제거합니다. 사진 1장당 크레딧이 들고, 같은 사진은 한 번만 처리합니다.</p></div><div className="field-grid">
      <label><span><input type="checkbox" aria-label="원격 누끼 사용" checked={settings.remoteCutout??false} onChange={e=>update("remoteCutout",e.target.checked)}/> 원격 누끼 사용</span><small className="field-help">컬러 블록·3D 팝업북·B급 키치 계열에서만 써요. 꺼 두면 지금처럼 앱 안에서 무료로 누끼를 따요.{connections.higgsfield===false?" Higgsfield 키가 없으면 켜도 무료 누끼로 그려요.":""}</small></label>
      <label>월 예산(크레딧)<input type="number" aria-label="원격 누끼 월 예산" min={0} max={200} step={1} disabled={!settings.remoteCutout} value={settings.remoteCutoutMonthlyCredits??20} onChange={e=>{const value=Math.round(Number(e.target.value));update("remoteCutoutMonthlyCredits",Number.isFinite(value)?Math.min(200,Math.max(0,value)):20);}}/><small className="field-help">이번 달에 쓴 크레딧이 이 값에 닿으면 그달은 무료 누끼로 그려요. 0~200, 기본 20.</small></label>
    </div></section>
    <section className="settings-section"><div><h2>AI 연결 상태</h2><p>키가 저장됐는지만 표시해요. 실제로 되는지는 아래 ‘AI 연결 실제 점검’에서 확인해 주세요.</p></div><div className="connection-panel">
      <p>이미지 AI의 자동은 키가 있으면 Higgsfield를 먼저 쓰고, 실패하면 Cloudflare, 그다음 OpenAI로 전환해요. Higgsfield는 한 장마다 크레딧을 쓰고 한 장에 2분 정도 걸려요. 제공자 요금제에 따라 비용이 들 수 있어요.</p>
      <p>고품질로 만들려면 이미지 AI에서 OpenAI를 선택하세요. 품질 옵션은 OpenAI 호출에 적용되며, Cloudflare에는 적용되지 않아요.</p>
      <p>문안 AI의 자동은 키가 있는 순서로 Gemini, Groq, Cloudflare를 시도하고 모두 실패하면 준비된 문안을 써요. 세 서비스 모두 무료 한도 안에서는 비용이 없어요.</p>
      <div className="connection-card"><span className={`status-dot ${connections.higgsfield?"on":""}`}/><div><strong>Higgsfield {connections.higgsfield?"키 설정됨":"키 필요"}</strong><p>이미지 생성의 첫 순서예요. 음식 사진이 가장 자연스러워요.</p></div></div>
      <div className="connection-card"><span className={`status-dot ${connections.gemini?"on":""}`}/><div><strong>Gemini {connections.gemini?"키 설정됨":"키 필요"}</strong><p>주제와 문안 생성의 첫 순서예요.</p></div></div>
      <div className="connection-card"><span className={`status-dot ${connections.groq?"on":""}`}/><div><strong>Groq {connections.groq?"키 설정됨":"키 필요"}</strong><p>Gemini 한도가 넘치면 이어받아요.</p></div></div>
      <div className="connection-card"><span className={`status-dot ${connections.cloudflare?"on":""}`}/><div><strong>Cloudflare {connections.cloudflare?"키 설정됨":"키 필요"}</strong><p>이미지 생성의 무료 예비 수단이자 문안의 마지막 순서예요.</p></div></div>
      <div className="connection-card"><span className={`status-dot ${connections.openai?"on":""}`}/><div><strong>OpenAI {connections.openai?"키 설정됨":"키 필요"}</strong><p>이미지 생성의 대체 수단이에요.</p></div></div>
      <div className="connection-card"><span className={`status-dot ${connections.naver?"on":""}`}/><div><strong>네이버 검색 트렌드 {connections.naver?"키 설정됨":"키 필요(선택)"}</strong><p>요즘 검색이 늘어난 음식 말을 주제 추천에 참고해요. NAVER API HUB의 검색어 트렌드 키를 NAVER_CLIENT_ID·NAVER_CLIENT_SECRET으로 넣어 주세요.</p></div></div>
    </div></section>
    <section className="settings-section disabled-section"><div><h2>추후 적용할 옵션</h2><p>저장은 되어 있어도 지금 제작 결과에는 반영되지 않는 항목이에요.</p></div><p>이미지 방식·비율·후보 수 설정은 후속 단계에서 제공해요. (계절·명절과, 네이버 키를 넣었다면 요즘 검색이 늘어난 음식 말은 이미 추천 주제에 반영돼요.)</p></section>
    <div className="settings-actions"><p>권장값 복원은 현재 적용되는 설정만 바꿔요.</p><button type="button" className="button secondary" onClick={()=>{setSettings(current=>({...current,carouselSlideCount:DEFAULT_SETTINGS.carouselSlideCount,imageAiProvider:DEFAULT_SETTINGS.imageAiProvider,imageQuality:DEFAULT_SETTINGS.imageQuality,copyLength:DEFAULT_SETTINGS.copyLength,textAiProvider:DEFAULT_SETTINGS.textAiProvider}));setSaved(false);}}>권장값으로 되돌리기</button><button type="submit" className="button primary">설정 저장</button>{saved&&<span role="status">저장했어요.</span>}{error&&<span role="alert">{error}</span>}</div>
  </form>;
}
