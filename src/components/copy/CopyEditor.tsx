"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFallbackCopy } from "@/features/copy/service";
import type { GeneratedCopy } from "@/features/copy/schema";
import { GenerationProgress } from "@/components/states/GenerationState";

const formatCopy=(copy:GeneratedCopy)=>[copy.hook,"",copy.information,copy.store_connection,"",copy.call_to_action,"",copy.hashtags.join(" ")].join("\n");

export function CopyEditor({ topic="처음 먹는 홍어, 삼합부터", audience="A", initialText, onTextChange, onContinue, saving=false }: { topic?:string; audience?:"A"|"B"|"C"; initialText?:string; onTextChange?:(text:string)=>void; onContinue: (text:string) => void; saving?:boolean }) {
  const initial = useMemo(() => createFallbackCopy({ topic, audience }), [topic,audience]);
  const [text, setText] = useState(initialText||formatCopy(initial));
  const [status,setStatus]=useState<"loading"|"gemini"|"fallback"|"saved">(initialText?"saved":"loading");
  const edited=useRef(Boolean(initialText));
  const generate=async (focus?:string) => {
    setStatus("loading");
    try {
      const response=await fetch("/api/copy", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({topic,audience,focus}) });
      if(!response.ok) throw new Error();
      const copy=await response.json();
      if(!edited.current){const next=formatCopy(copy);setText(next);onTextChange?.(next);}
      setStatus(copy._meta?.provider==="gemini"?"gemini":"fallback");
    } catch { setStatus("fallback"); }
  };
  useEffect(() => {
    if(edited.current)return;
    let active=true;
    fetch("/api/copy", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({topic,audience}) })
      .then(async response=>response.ok?response.json():Promise.reject())
      .then(copy=>{if(active){if(!edited.current){const next=formatCopy(copy);setText(next);onTextChange?.(next);}setStatus(copy._meta?.provider==="gemini"?"gemini":"fallback");}})
      .catch(()=>{if(active)setStatus("fallback");});
    return () => { active=false; };
  }, [topic,audience,onTextChange]);
  return <section className="copy-layout" aria-labelledby="copy-title"><div><p className="eyebrow">3 문안</p><h2 id="copy-title">완성된 글을 확인해요</h2><p className="lead">어려운 설정 없이 바로 쓸 수 있게 짧고 쉽게 만들었어요.</p>{status==="loading"?<GenerationProgress label="Gemini가 문안을"/>:<p role="status">{status==="saved"?"저장된 문안을 불러왔어요.":status==="gemini"?"Gemini로 문안을 만들었어요.":"기본 문안을 사용했어요."}</p>}<div className="tone-row" aria-label="말투"><button type="button">친근하게</button><button type="button">담백하게</button><button type="button">활기차게</button></div><textarea aria-label="게시물 문안" rows={14} value={text} onChange={(event)=>{edited.current=true;setText(event.target.value);onTextChange?.(event.target.value);}} /><div className="copy-actions">{[["첫 문장 다시 만들기","hook"],["가게 연결 다시 만들기","store_connection"],["마무리 다시 만들기","call_to_action"],["해시태그 다시 만들기","hashtags"]].map(([label,focus])=><button type="button" key={label} className="button secondary" onClick={()=>{edited.current=false;void generate(focus);}}>{label}</button>)}</div></div><aside className="verify-card"><strong>사실 확인</strong><p>가격이나 영업시간은 자동으로 쓰지 않았어요.</p><span>금지 표현 검사 완료 ✓</span><button type="button" className="button primary" disabled={!text.trim()||saving} onClick={()=>onContinue(text)}>{saving?"문안 저장 중…":"최종 화면 보기"}</button></aside></section>;
}
