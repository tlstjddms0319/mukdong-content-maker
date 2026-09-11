"use client";

import { useRef, useState } from "react";

type Mode = "photo" | "ai" | "mix";

export function ImageStudio({ onApprove }: { onApprove: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const [selected, setSelected] = useState("candidate-1");
  const [previews, setPreviews] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const modes: { id: Mode; label: string; help: string }[] = [
    { id: "photo", label: "실제 사진 사용", help: "직접 찍은 음식 사진을 다듬어요" },
    { id: "ai", label: "AI 이미지 생성", help: "주제에 맞는 후보 3장을 만들어요" },
    { id: "mix", label: "사진 + AI 함께", help: "사진을 참고해 분위기를 보완해요" },
  ];

  return <section aria-labelledby="image-title" className="studio">
    <div className="section-heading"><div><p className="eyebrow">가장 중요한 단계</p><h2 id="image-title">눈길을 끄는 이미지를 골라요</h2></div><span className="soft-badge">기본 4:5 · 후보 3장</span></div>
    <div className="mode-grid">{modes.map((item) => <button key={item.id} type="button" aria-label={item.label} className={`mode-card ${mode === item.id ? "selected" : ""}`} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><strong>{item.label}</strong><span>{item.help}</span></button>)}</div>
    {mode === "photo" ? <div className="upload-zone"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" /><strong>사진을 여기에 끌어놓으세요</strong><span>JPG, PNG, WebP · 최대 12MB · 원본은 그대로 보관해요</span><button type="button" className="button primary" onClick={() => inputRef.current?.click()}>사진 고르기</button></div> : <>
      <div className="generation-note"><strong>{mode === "ai" ? "AI 이미지 후보" : "사진을 참고한 AI 후보"}</strong><span>실제 매장이나 손님을 임의로 만들지 않고, 이미지에 글자를 넣지 않아요.</span><button type="button" className="button primary" disabled={working} onClick={async()=>{setWorking(true);setError("");try{const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:"홍어 삼합",count:3,aspectRatio:"4:5"})});const data=await response.json();if(!response.ok)throw new Error(data.message);setPreviews(data.images);}catch(reason){setError(reason instanceof Error?reason.message:"이미지를 만들지 못했습니다.");}finally{setWorking(false);}}}>{working?"후보 만드는 중…":"후보 3장 생성하기"}</button>{error&&<span role="alert">{error}</span>}</div>
      <div className="candidate-grid">{[1,2,3].map((n) => { const id=`candidate-${n}`; const preview=previews[n-1]; return <article key={id} className={`candidate ${selected === id ? "selected" : ""}`}><button type="button" style={preview?{backgroundImage:`url(${preview})`}:undefined} className={`food-placeholder food-${n}`} aria-label={`이미지 후보 ${n} 선택`} aria-pressed={selected===id} onClick={() => setSelected(id)}><span>{preview?`생성된 후보 ${n}`:`구도 예시 ${n}`}</span></button><div className="candidate-info"><strong>구도가 또렷해요</strong><span>피사체 ✓ · 자르기 안전 ✓</span><small>{preview?"AI로 만든 이미지 · 게시 시 표시":"생성 전 구도 예시"}</small><button type="button" className="button primary" onClick={() => { setSelected(id); onApprove(id); }}>이 이미지 사용</button></div></article>})}</div>
    </>}
  </section>;
}
