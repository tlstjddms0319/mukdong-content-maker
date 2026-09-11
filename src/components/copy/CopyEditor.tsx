"use client";
import { useMemo, useState } from "react";
import { createFallbackCopy } from "@/features/copy/service";

export function CopyEditor({ onContinue }: { onContinue: (text:string) => void }) {
  const initial = useMemo(() => createFallbackCopy({ topic:"처음 먹는 홍어, 삼합부터", audience:"A" }), []);
  const [text, setText] = useState([initial.hook, "", initial.information, initial.store_connection, "", initial.call_to_action, "", initial.hashtags.join(" ")].join("\n"));
  return <section className="copy-layout" aria-labelledby="copy-title"><div><p className="eyebrow">3 문안</p><h2 id="copy-title">완성된 글을 확인해요</h2><p className="lead">어려운 설정 없이 바로 쓸 수 있게 짧고 쉽게 만들었어요.</p><div className="tone-row" aria-label="말투"><button type="button">친근하게</button><button type="button">담백하게</button><button type="button">활기차게</button></div><textarea aria-label="게시물 문안" rows={14} value={text} onChange={(event)=>setText(event.target.value)} /><div className="copy-actions">{["첫 문장 다시 만들기","가게 연결 다시 만들기","마무리 다시 만들기","해시태그 다시 만들기"].map(label=><button type="button" key={label} className="button secondary">{label}</button>)}</div></div><aside className="verify-card"><strong>사실 확인</strong><p>가격이나 영업시간은 자동으로 쓰지 않았어요.</p><span>금지 표현 검사 완료 ✓</span><button type="button" className="button primary" onClick={()=>onContinue(text)}>최종 화면 보기</button></aside></section>;
}
