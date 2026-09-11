"use client";
import { useState } from "react";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import type { AppSettings } from "@/features/settings/schema";

export function SettingsForm({ onSave = async () => undefined, aiConnected = false }: { onSave?: (value:AppSettings)=>void|Promise<void>; aiConnected?:boolean }) {
  const [settings,setSettings]=useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [saved,setSaved]=useState(false);
  const update=<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>{setSaved(false);setSettings(current=>({...current,[key]:value}));};
  return <form className="settings-form" onSubmit={async e=>{e.preventDefault();await onSave(settings);setSaved(true);}}>
    <section className="settings-section"><div><h2>기본 설정</h2><p>처음에는 이대로 사용해도 충분해요.</p></div><div className="field-grid"><label>이미지 제작 방식<select aria-label="이미지 제작 방식" value={settings.imageMode} onChange={e=>update("imageMode",e.target.value as AppSettings["imageMode"])}><option value="photo-first">실제 사진 우선</option><option value="mixed">사진 + AI</option><option value="ai-first">AI 이미지 우선</option></select></label><label>이미지 비율<select aria-label="이미지 비율" value={settings.imageAspectRatio} onChange={e=>update("imageAspectRatio",e.target.value as AppSettings["imageAspectRatio"])}><option>4:5</option><option>1:1</option><option>9:16</option></select></label><label>후보 수<select aria-label="이미지 후보 수" value={settings.imageCandidateCount} onChange={e=>update("imageCandidateCount",Number(e.target.value) as 1|3|5)}><option>1</option><option>3</option><option>5</option></select></label><label>문안 길이<select aria-label="문안 길이" value={settings.copyLength} onChange={e=>update("copyLength",e.target.value as AppSettings["copyLength"])}><option value="short">짧게</option><option value="medium">보통</option><option value="detailed">자세히</option></select></label></div></section>
    <section className="settings-section"><div><h2>AI 연결</h2><p>키 값은 화면이나 저장 파일에 표시하지 않아요.</p></div><div className="connection-card"><span className={`status-dot ${aiConnected?"on":""}`}/><div><strong>{aiConnected?"연결됨":"연결 필요"}</strong><p><code>.env.local</code> 파일에 OpenAI API 키를 넣으면 연결돼요.</p></div></div></section>
    <section className="settings-section disabled-section"><div><h2>인기 주제 연결 <span className="soft-badge">향후 제공</span></h2><p>실시간 인기 주제 연결은 다음 단계에서 제공할 예정이에요.</p></div><p>Instagram 또는 외부 트렌드 API를 검토한 뒤, 홍어 소개와 가게 홍보 방향을 추천하도록 확장합니다.</p></section>
    <section className="settings-section"><div><h2>안전 및 데이터</h2><p>잘못된 정보와 원본 손상을 막는 설정이에요.</p></div><div className="check-list"><label><input type="checkbox" checked={settings.preserveOriginals} onChange={e=>update("preserveOriginals",e.target.checked)}/> 원본 사진 항상 보존</label><label><input type="checkbox" checked={settings.blockUnverifiedClaims} onChange={e=>update("blockUnverifiedClaims",e.target.checked)}/> 확인되지 않은 표현 차단</label><label><input type="checkbox" checked={settings.recheckOnStoreChange} onChange={e=>update("recheckOnStoreChange",e.target.checked)}/> 가게 정보 변경 시 다시 확인</label></div></section>
    <div className="settings-actions"><button type="button" className="button secondary" onClick={()=>{setSettings({...DEFAULT_SETTINGS});setSaved(false);}}>권장값으로 되돌리기</button><button type="submit" className="button primary">설정 저장</button>{saved&&<span role="status">저장했어요.</span>}</div>
  </form>;
}
