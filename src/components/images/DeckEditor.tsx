"use client";
import { useId, useRef, useState } from "react";
import Image from "next/image";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH } from "@/features/images/carousel";
import { MAX_DECK_SLIDES, STORE_CARD_MAX_CONTENT, activeSlideIndex, deckTotal, addSlide, removeSlide, setStoreCardIncluded, slideTextProblem, storeCardOn, uploadSlidePhoto, type GenerationState, type NewSlideSource, type StudioPhoto } from "@/features/images/generationStore";

// "장 고치기": 완성된 캐러셀(또는 저장된 초안을 다시 연 것)에서 장을 빼거나 새 장을 끼워 넣는다.
// AI 캐러셀과 실제 사진 캐러셀이 함께 쓴다. 상태와 다시 그리기는 generationStore(removeSlide·addSlide)가 맡는다.
//
// 카드에는 장 번호("3")만 찍혀 있어서, 장을 빼거나 넣으면 번호가 바뀐 장·마지막 장·(예고 띠가 바뀌면) 표지만 다시 그린다(이미지 AI 비용 없음).
// 구성안이 없는 초안(다시 연 초안·사진 그대로 쓴 캐러셀)은 카드를 새로 그릴 디자인 정보가 없으므로
// 새 장은 "사진 그대로"만 넣을 수 있다.
export function DeckEditor({state}:{state:GenerationState}){
  const id=useId();
  const fileRef=useRef<HTMLInputElement>(null);
  const {slides,plan,photos,phase,mode}=state;
  const busy=phase!=="idle";
  const active=activeSlideIndex(state);
  const full=slides.length>=MAX_DECK_SLIDES;
  // AI 이미지로 새 장을 만드는 길은 AI·사진+AI 캐러셀에서만 보인다(실제 사진 캐러셀에서 몰래 비용이 들지 않게).
  const sources:[NewSlideSource,string][]=plan
    ?[["photo","사진으로"],...(mode==="ai"?[["ai","AI 이미지로 (비용 발생)"] as [NewSlideSource,string]]:[]),["text","글자 카드로"]]
    :[["raw","사진 그대로"]];
  const [open,setOpen]=useState(false);
  const [chosen,setSource]=useState<NewSlideSource>(sources[0][0]);
  // 구성안이 생기거나 사라지면 고를 수 있는 방식이 바뀐다. 지금 목록에 없는 방식이면 첫 방식으로 본다.
  const source=sources.some(([value])=>value===chosen)?chosen:sources[0][0];
  const [title,setTitle]=useState("");
  // 기본은 "요청으로 읽기": 적은 글을 보고 AI가 카드 문구·사진 장면을 짓는다. 체크하면 적은 글을 문구로 그대로 쓴다.
  const [verbatim,setVerbatim]=useState(false);
  const [body,setBody]=useState("");
  // 새 장에 고른 사진. 스튜디오 사진 목록에서 고르거나 새로 올린다(새로 올린 사진은 여기 후보에만 더해 둔다).
  const [extra,setExtra]=useState<StudioPhoto[]>([]);
  const [picked,setPicked]=useState<string>("");
  const [uploading,setUploading]=useState(false);
  const candidates=[...photos,...extra.filter(photo=>!photos.some(item=>item.id===photo.id))];
  const photo=candidates.find(item=>item.id===picked);
  const needsText=source!=="raw";
  const needsPhoto=source==="photo"||source==="raw";
  const problem=needsText?(verbatim?slideTextProblem({headline:title,points:body.split("\n")}):(title.trim()||body.trim()?null:"어떤 장을 넣을지 적어 주세요.")):null;
  const ready=!busy&&!full&&(!needsText||!problem)&&(!needsPhoto||!!photo);

  const upload=async(file:File|undefined)=>{
    setUploading(true);
    const added=await uploadSlidePhoto(file);
    setUploading(false);
    if(added){setExtra(list=>[...list,added]);setPicked(added.id);}
  };
  const submit=async()=>{
    // 새 장을 넣지 못했으면(문구 짓기·그리기 실패) 적은 글을 그대로 두어 다시 누를 수 있게 한다.
    if(await addSlide({headline:title,points:body.split("\n"),source,verbatim,...(photo?{photo}:{})})){setTitle("");setBody("");setPicked("");setOpen(false);}
  };

  return <div className="deck-editor" aria-label="장 고치기">
    <div className="deck-editor-head">
      <strong>장 고치기</strong>
      <span className="field-help">지금 {slides.length}장 · 최대 {MAX_DECK_SLIDES}장. 장을 빼거나 넣으면 번호가 바뀐 장만 다시 그려요(무료).</span>
    </div>
    <div className="photo-studio-actions">
      <button type="button" className="button secondary" disabled={busy||active===0||slides.length<=1} title={active===0?"표지는 뺄 수 없어요":undefined} onClick={()=>void removeSlide(active)}>{active+1}번 장 빼기</button>
      <button type="button" className="button secondary" disabled={busy||full} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{full?`${MAX_DECK_SLIDES}장이 가득 찼어요`:open?"새 장 넣기 닫기":`${active+1}번 장 뒤에 새 장 넣기`}</button>
    </div>
    {active===0&&<p className="field-help">표지는 뺄 수 없어요. 다른 장을 고르면 뺄 수 있어요.</p>}
    {plan&&<div className="deck-store-card">
      <label className="deck-store-toggle"><input type="checkbox" checked={state.storeCard.include} disabled={busy} onChange={event=>void setStoreCardIncluded(event.target.checked)}/><span>맨 뒤에 가게 홍보 카드 붙이기 (무료)</span></label>
      {storeCardOn(state)&&(state.storeCard.image?.preview
        ?<Image src={state.storeCard.image.preview} alt="맨 뒤 가게 홍보 카드 미리보기" width={108} height={135} unoptimized/>
        :<span className="field-help">홍보 카드를 그리는 중…</span>)}
      {state.storeCard.include&&deckTotal(state)>STORE_CARD_MAX_CONTENT&&<span className="field-help">인스타그램은 한 게시물에 10장까지라, 10장짜리 게시물에는 홍보 카드를 붙이지 않아요.</span>}
    </div>}
    {open&&!full&&<div className="deck-new-slide">
      <div className="option-picker" role="group" aria-label="새 장 만들기 방식">
        <span>새 장</span>
        {sources.map(([value,label])=><button key={value} type="button" className="button secondary" aria-pressed={source===value} disabled={busy} onClick={()=>setSource(value)}>{label}</button>)}
      </div>
      {needsText&&<>
        <label className="deck-verbatim"><input type="checkbox" checked={verbatim} disabled={busy} onChange={event=>setVerbatim(event.target.checked)}/> 적은 글을 카드 문구로 그대로 쓰기</label>
        {!verbatim&&<p className="field-help">원하는 장을 편하게 적어 주세요. AI가 요청에 맞게 카드 제목·짧은 글과 사진 장면을 지어요(예: “묵은지에 홍어를 싸 먹는 법을 보여 줘”).</p>}
        <label htmlFor={`${id}-title`}>{verbatim?"카드 제목":"카드 제목 또는 요청"} {verbatim&&<small>{title.trim().length}/42</small>}</label>
        <input id={`${id}-title`} maxLength={verbatim?60:200} value={title} disabled={busy} placeholder={verbatim?"예: 묵은지에 싸 먹으면 더 맛있어요":"예: 미나리전과 막걸리를 같이 소개해 줘"} onChange={event=>setTitle(event.target.value)}/>
        <label htmlFor={`${id}-points`}>{verbatim?"카드 짧은 글":"카드 짧은 글 또는 더 원하는 내용"} <small>{verbatim?`한 줄에 하나, ${SLIDE_POINT_MAX_COUNT}줄·줄마다 ${SLIDE_POINT_MAX_LENGTH}자까지(비워도 돼요)`:"비워도 돼요"}</small></label>
        <textarea id={`${id}-points`} rows={3} value={body} disabled={busy} onChange={event=>setBody(event.target.value)}/>
        {(title.trim()||body.trim())&&problem&&<p role="alert">{problem}</p>}
      </>}
      {source==="ai"&&<p className="field-help">제목을 바탕으로 이미지 AI가 새 장면을 만들어요. 이미지 한 장 비용이 들고 1~3분 걸려요.</p>}
      {needsPhoto&&<div className="photo-swap">
        <span>넣을 사진</span>
        <div className="photo-library">
          {candidates.map(item=><button key={item.id} type="button" className="photo-thumb" aria-pressed={picked===item.id} disabled={busy} aria-label={`${item.name} 사진 고르기`} onClick={()=>setPicked(item.id)}><Image src={item.preview} alt="" width={80} height={80} unoptimized/></button>)}
        </div>
        <input ref={fileRef} aria-label="새 장 사진 파일" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event=>{void upload(event.target.files?.[0]);event.target.value="";}}/>
        <button type="button" className="button secondary" disabled={busy||uploading} onClick={()=>fileRef.current?.click()}>{uploading?"사진 저장 중…":"사진 올리기"}</button>
      </div>}
      <div className="photo-studio-actions">
        <button type="button" className="button primary" disabled={!ready} onClick={()=>void submit()}>{active+1}번 장 뒤에 넣기</button>
      </div>
    </div>}
  </div>;
}
