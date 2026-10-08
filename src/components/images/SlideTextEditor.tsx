"use client";
import { useId, useState } from "react";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH } from "@/features/images/carousel";
import { editSlideText, slideTextProblem } from "@/features/images/generationStore";
import { checkTextClaims } from "@/features/guard/service";

// "이 장 글자 고치기": 지금 보고 있는 장의 제목·요점을 직접 고쳐 그 장만 다시 그린다(이미지 AI를 부르지 않아 무료).
// AI 캐러셀과 실제 사진 캐러셀이 함께 쓴다. 장을 넘기면 부모가 key를 바꿔 이 칸을 그 장의 글자로 새로 채운다.
type Props={index:number;headline:string;points:string[];busy:boolean;canEdit:boolean};

export function SlideTextEditor({index,headline,points,busy,canEdit}:Props){
  const id=useId();
  const [title,setTitle]=useState(headline);
  const [body,setBody]=useState(points.join("\n"));
  const edit={headline:title,points:body.split("\n")};
  const problem=slideTextProblem(edit);
  // 과장·단정 표현(예: "누구나 좋아해요")은 막지 않고 알려만 준다. 게시 전 검사에서도 다시 걸린다.
  const claims=checkTextClaims([title,...edit.points].join("\n")).blocked;
  const changed=title.trim()!==headline||edit.points.map(point=>point.trim()).filter(Boolean).join("\n")!==points.join("\n");
  if(!canEdit)return <p className="field-help">이 장은 글자만 따로 고칠 수 없어요. 바꾸려면 ‘이 장 다시 만들기’를 눌러 주세요.</p>;
  return <details className="slide-text-editor">
    <summary>{index+1}번 장 글자 고치기 (무료)</summary>
    <label htmlFor={`${id}-title`}>카드 제목 <small>{title.trim().length}/42</small></label>
    <input id={`${id}-title`} maxLength={60} value={title} disabled={busy} onChange={event=>setTitle(event.target.value)}/>
    {index>0||points.length>0?<>
      <label htmlFor={`${id}-points`}>카드 짧은 글 <small>한 줄에 하나, {SLIDE_POINT_MAX_COUNT}줄·줄마다 {SLIDE_POINT_MAX_LENGTH}자까지</small></label>
      <textarea id={`${id}-points`} rows={4} value={body} disabled={busy} onChange={event=>setBody(event.target.value)}/>
    </>:null}
    {problem&&<p role="alert">{problem}</p>}
    {!problem&&claims.length>0&&<p className="field-help">확인할 표현: {claims.join(", ")}. 사실과 다르면 고쳐 주세요.</p>}
    <div className="photo-studio-actions">
      <button type="button" className="button primary" disabled={busy||!!problem||!changed} onClick={()=>void editSlideText(index,edit)}>글자만 다시 그리기</button>
      <button type="button" className="button secondary" disabled={busy||!changed} onClick={()=>{setTitle(headline);setBody(points.join("\n"));}}>되돌리기</button>
    </div>
  </details>;
}
