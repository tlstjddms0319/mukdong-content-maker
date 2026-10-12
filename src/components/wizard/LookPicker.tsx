"use client";
import { useState } from "react";
import { TRACK_LOOKS, type CarouselTrack } from "@/features/images/track";

// 확인 화면 '모양 바꾸기': 평소에는 접혀 있고, 펴면 같은 갈래의 모든 모양을 견본 그림(public/looks, scripts/render-look-thumbs.mjs)으로 보여 준다.
// 견본을 눌러 고르고 오른쪽 아래 '변경하기'를 누르면 그 모양으로 모든 장을 다시 그린다(사진·글 그대로, AI 비용 없음).
export function LookPicker({track,current,disabled,disabledReason,onChange}:{track:CarouselTrack;current:number;disabled:boolean;disabledReason?:string;onChange:(look:number)=>void}){
  const looks=TRACK_LOOKS[track];
  const [open,setOpen]=useState(false);
  const [chosen,setChosen]=useState(current);
  const canApply=!disabled&&chosen!==current;
  return <details className="look-picker" open={open} onToggle={event=>{const next=(event.currentTarget as HTMLDetailsElement).open;setOpen(next);if(next)setChosen(current);}}>
    <summary className="look-picker-summary">
      <span>🎨 모양 바꾸기</span>
      <span className="look-picker-current">지금 · <strong>{looks[current]?.name}</strong> <small>({current+1}/{looks.length})</small></span>
    </summary>
    <div className="look-picker-body">
      <div className="look-grid" role="radiogroup" aria-label="모양 고르기">
        {looks.map(({name},look)=><button key={name} type="button" role="radio" aria-checked={chosen===look} className="look-option" onClick={()=>setChosen(look)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 작은 고정 견본이라 그대로 쓴다 */}
          <img src={`/looks/${track}-${look}.jpg`} alt="" width={180} height={225} loading="lazy"/>
          <span className="look-option-name">{name}{look===current&&<small> · 지금</small>}</span>
        </button>)}
      </div>
      <div className="look-picker-actions">
        {disabled&&disabledReason&&<p className="field-help">{disabledReason}</p>}
        <button type="button" className="button primary" disabled={!canApply} onClick={()=>{onChange(chosen);setOpen(false);}}>변경하기</button>
      </div>
    </div>
  </details>;
}
