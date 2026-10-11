"use client";
import { useId, useState } from "react";
import { SlideTextEditor } from "@/components/images/SlideTextEditor";
import { editSlidePhoto, redoSlide, restoreSlidePhoto, reviseSlideText, setActiveSlide, type photoSlideOptions, type redoSlideKind } from "@/features/images/generationStore";
import { PICTURE_FIXES, SLIDE_FIX_NOTE_MAX, TEXT_FIXES, slideFixRequest, type SlideFixOption } from "@/features/images/slideRevise";

// 확인 화면 "N번 장 고치기". 예전 "이 장 다시 만들기"는 무엇이 마음에 안 드는지 말할 곳이 없어 같은 버튼을 계속 눌러야 했다.
// 그림/글 중 고칠 것을 고르고, 자주 쓰는 요청 버튼(여러 개)과 직접 적은 말로 어떻게 고칠지 알려 준다(features/images/slideRevise.ts).
//   - 그림(AI 장): 요청을 그림 AI에 넘겨 그 장만 다시 그린다(1~3분, 그림 AI 비용).
//   - 그림(사장님 사진 장): AI로 이 사진 다듬기(구도 그대로 빛·색·선명도) / 이 사진으로 새로 그리기(같은 음식, 이 장 글에 맞는 새 장면)
//     중에서 고르고 요청을 붙인다(1~3분, 그림 AI 비용). 다른 사진으로 바꾸기·원래 사진으로 되돌리기는 무료.
//   - 글: 글 AI가 제목·짧은 글을 고치고 글자만 다시 그린다(무료). 그 아래 "글자 직접 고치기"로 손수 고칠 수도 있다.
// 장을 넘기면 부모가 key를 바꿔 고른 것·적은 말이 다음 장으로 따라가지 않게 한다.
type Props={
  index:number;
  pictureKind:ReturnType<typeof redoSlideKind>;  // null이면 그림은 고칠 수 없는 장(다시 연 게시물 등)
  photoOptions?:ReturnType<typeof photoSlideOptions>;  // 사장님 사진 장에서 고를 수 있는 것
  canEditText:boolean;
  headline:string;points:string[];
  busy:boolean;
};
type Part="picture"|"text";
type PhotoAction="retouch"|"redraw";
const PHOTO_ACTIONS:ReadonlyArray<{id:PhotoAction;label:string;help:string}>=[
  {id:"retouch",label:"AI로 이 사진 다듬기",help:"사진의 음식과 구도는 그대로 두고 빛·색감·선명도를 다듬어요."},
  {id:"redraw",label:"이 사진으로 새로 그리기",help:"사진 속 음식으로 이 장 글에 맞는 새 장면을 그려요."},
];

// 요청 버튼 묶음 + 직접 적기 칸. 고른 버튼은 aria-pressed로 표시한다.
function FixChoices({options,picked,onPick,note,onNote,label,placeholder,busy}:{options:readonly SlideFixOption[];picked:string[];onPick:(next:string[])=>void;note:string;onNote:(value:string)=>void;label:string;placeholder:string;busy:boolean}){
  const id=useId();
  return <>
    <div className="option-picker" role="group" aria-label={label}>
      {options.map(option=><button key={option.id} type="button" className="button secondary" aria-pressed={picked.includes(option.id)} disabled={busy}
        onClick={()=>onPick(picked.includes(option.id)?picked.filter(item=>item!==option.id):[...picked,option.id])}>{option.label}</button>)}
    </div>
    <label htmlFor={`${id}-note`}>직접 적기 <small>(선택, {SLIDE_FIX_NOTE_MAX}자까지)</small></label>
    <textarea id={`${id}-note`} rows={2} maxLength={SLIDE_FIX_NOTE_MAX} value={note} disabled={busy} placeholder={placeholder} onChange={event=>onNote(event.target.value)}/>
  </>;
}

export function SlideFixPanel({index,pictureKind,photoOptions,canEditText,headline,points,busy}:Props){
  // 사진 장인데 고를 것이 하나도 없으면(여러 칸 사진에 넣은 사진이 한 장뿐) 그림 고치기를 내놓지 않는다.
  const noPhotoChoice=pictureKind==="photo"&&photoOptions&&!photoOptions.ai&&!photoOptions.swap&&!photoOptions.restore;
  const parts:Part[]=[...(pictureKind&&!noPhotoChoice?["picture" as const]:[]),...(canEditText?["text" as const]:[])];
  const [part,setPart]=useState<Part>(parts[0]??"picture");
  const [pictureFixes,setPictureFixes]=useState<string[]>([]);
  const [pictureNote,setPictureNote]=useState("");
  const [textFixes,setTextFixes]=useState<string[]>([]);
  const [textNote,setTextNote]=useState("");
  const [result,setResult]=useState<{ok:boolean;message:string}|null>(null);
  const [photoAction,setPhotoAction]=useState<PhotoAction>("retouch");
  if(!parts.length)return null;
  const shownPart=parts.includes(part)?part:parts[0];
  const pictureAsk=slideFixRequest(PICTURE_FIXES,pictureFixes,pictureNote);
  const textAsk=slideFixRequest(TEXT_FIXES,textFixes,textNote);

  const redrawPicture=()=>{
    setResult(null);setActiveSlide(index);
    void redoSlide(pictureKind==="photo"?undefined:pictureAsk||undefined);
    setPictureFixes([]);setPictureNote("");
  };
  const editPhoto=()=>{
    setResult(null);setActiveSlide(index);
    void editSlidePhoto(photoAction,pictureAsk||undefined);
    setPictureFixes([]);setPictureNote("");
  };
  const restorePhoto=()=>{setResult(null);setActiveSlide(index);void restoreSlidePhoto();};
  const reviseText=async()=>{
    setResult(null);setActiveSlide(index);
    const done=await reviseSlideText(index,textAsk);
    if(done.ok){
      setTextFixes([]);setTextNote("");
      setResult({ok:true,message:done.warnings.length?`글을 고쳤어요. 확인할 표현: ${done.warnings.join(", ")}. 사실과 다르면 아래에서 직접 고쳐 주세요.`:"글을 고쳐 다시 그렸어요."});
    }else setResult({ok:false,message:done.message});
  };

  return <details className="slide-text-editor slide-fix">
    <summary>{index+1}번 장 고치기</summary>
    {parts.length>1&&<div className="option-picker" role="group" aria-label="무엇을 고칠까요?">
      <span>무엇을 고칠까요?</span>
      <button type="button" className="button secondary" aria-pressed={shownPart==="picture"} disabled={busy} onClick={()=>{setPart("picture");setResult(null);}}>그림</button>
      <button type="button" className="button secondary" aria-pressed={shownPart==="text"} disabled={busy} onClick={()=>{setPart("text");setResult(null);}}>글</button>
    </div>}
    {shownPart==="picture"&&(pictureKind==="photo"
      ?<>
        {photoOptions?.ai&&<>
          <div className="option-picker" role="group" aria-label="사진을 어떻게 할까요?">
            {PHOTO_ACTIONS.map(action=><button key={action.id} type="button" className="button secondary" aria-pressed={photoAction===action.id} disabled={busy} onClick={()=>setPhotoAction(action.id)}>{action.label}</button>)}
          </div>
          <p className="field-help">{PHOTO_ACTIONS.find(action=>action.id===photoAction)?.help} 1~3분 걸리고 그림 AI 비용이 들어요. 결과에는 AI 그림 안내가 붙어요.</p>
          <FixChoices options={PICTURE_FIXES} picked={pictureFixes} onPick={setPictureFixes} note={pictureNote} onNote={setPictureNote} label="그림을 어떻게 바꿀까요?" placeholder="예: 접시를 위에서 내려다본 모습으로" busy={busy}/>
          <button type="button" className="button primary" disabled={busy} onClick={editPhoto}>{photoAction==="retouch"?"이 사진 다듬기":"이 사진으로 그리기"}</button>
        </>}
        {(photoOptions?.swap||photoOptions?.restore)&&<div className="option-picker">
          {photoOptions.swap&&<button type="button" className="button secondary" disabled={busy} onClick={redrawPicture}>다른 사진으로 바꾸기 (무료)</button>}
          {photoOptions.restore&&<button type="button" className="button secondary" disabled={busy} onClick={restorePhoto}>원래 사진으로 되돌리기 (무료)</button>}
        </div>}
      </>
      :<>
        <FixChoices options={PICTURE_FIXES} picked={pictureFixes} onPick={setPictureFixes} note={pictureNote} onNote={setPictureNote} label="그림을 어떻게 바꿀까요?" placeholder="예: 접시를 위에서 내려다본 모습으로" busy={busy}/>
        <button type="button" className="button primary" disabled={busy} onClick={redrawPicture}>{pictureAsk?"이대로 그림 다시 그리기":"그림 새로 그리기"}</button>
        <p className="field-help">AI가 이 장 그림만 다시 그려요(1~3분, 그림 AI 비용이 들어요). 고른 것이 없으면 같은 글로 새로 그려요.</p>
      </>)}
    {shownPart==="text"&&<>
      <FixChoices options={TEXT_FIXES} picked={textFixes} onPick={setTextFixes} note={textNote} onNote={setTextNote} label="글을 어떻게 바꿀까요?" placeholder="예: 삼합 먹는 순서를 설명해 줘" busy={busy}/>
      <button type="button" className="button primary" disabled={busy||!textAsk} onClick={()=>void reviseText()}>이대로 글 고치기 (무료)</button>
      <SlideTextEditor key={`${index}|${headline}|${points.join("|")}`} index={index} headline={headline} points={points} busy={busy} canEdit={canEditText}/>
    </>}
    {result&&<p role={result.ok?"status":"alert"} className={result.ok?"field-help":undefined}>{result.message}</p>}
  </details>;
}
