"use client";
import { useState } from "react";
import { kindOf, type ConceptChoice } from "@/features/images/concepts";

// 2단계 중간 "어떤 그림으로 만들까요?": 구성안이 나오면 그림 콘셉트 후보(실사 + AI 제안)를 큰 카드로 보여 주고 하나를 고른다.
// AI가 추천하는 것이 미리 눌려 있어 그대로 "이걸로 만들기"만 눌러도 된다. 고르면 generationStore.chooseConcept가 이어서 만든다.
const KIND_ICONS:Record<string,string>={photo:"📷",character:"🥊",scene:"🏠",diagram:"🔬",comic:"💬"};

export function ConceptStep({topic,concepts,onChoose}:{topic:string;concepts:ConceptChoice;onChoose:(index:number)=>void}) {
  const [picked,setPicked]=useState(Math.min(concepts.recommended,concepts.options.length-1));
  return <section aria-labelledby="concept-title">
    <h1 id="concept-title">어떤 그림으로 만들까요?</h1>
    <p className="lead">주제: {topic}</p>
    <p className="field-help">글 내용을 보고 AI가 어울리는 그림을 제안했어요. 하나를 고르고 아래 버튼을 눌러 주세요.</p>
    <div className="concept-grid" role="radiogroup" aria-label="그림 콘셉트">
      {concepts.options.map((concept,index)=>{
        const drawn=concept.slides.filter(slide=>slide.drawn).length,photos=concept.slides.length-drawn;
        const mix=concept.kind==="photo"?"모든 장 실사 사진":photos?`그림 ${drawn}장 · 사진 ${photos}장`:`모든 장 그림`;
        return <button key={index} type="button" role="radio" aria-checked={picked===index} className={`concept-card${picked===index?" selected":""}`} onClick={()=>setPicked(index)}>
          <span className="concept-head"><span className="concept-icon" aria-hidden="true">{KIND_ICONS[concept.kind]??"🎨"}</span><span className="concept-kind">{kindOf(concept.kind).label}</span>{index===concepts.recommended&&<span className="concept-badge">AI 추천</span>}</span>
          <strong>{concept.title}</strong>
          <span className="concept-summary">{concept.summary}</span>
          {concept.reason&&<span className="concept-reason">{concept.reason}</span>}
          <span className="concept-mix">{mix}</span>
        </button>;
      })}
    </div>
    <div className="bottom-action">
      <span/>
      <button type="button" className="button primary big" onClick={()=>onChoose(picked)}>이걸로 만들기</button>
    </div>
  </section>;
}
