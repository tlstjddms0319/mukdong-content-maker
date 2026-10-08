"use client";
import { useState } from "react";
import { GenerationProgress } from "@/components/states/GenerationState";
import { InstagramPublish } from "@/components/review/InstagramPublish";
import { SaveToPhone } from "@/components/review/SaveToPhone";
import { ExportActions } from "@/components/review/ExportActions";
import type { ReviewImage } from "@/components/review/exportFiles";
import { SlideTextEditor } from "@/components/images/SlideTextEditor";
import { DeckEditor } from "@/components/images/DeckEditor";
import { FreeCardStudio } from "@/components/images/FreeCardStudio";
import { canEditSlideText, redoSlide, redoSlideKind, setActiveSlide, type ApprovedImage, type GenerationState } from "@/features/images/generationStore";

// 3단계 "확인하고 올리기": 사진과 글을 한 화면에서 보고, 큰 버튼 두 개(바로 올리기·휴대폰에 저장) 중 하나를 누른다.
// 작은 버튼은 "이 장 다시 만들기"와 "글 다시 쓰기"뿐. 장 고치기·글자 고치기·글자 카드·파일 받기는 "더보기" 안에 접어 둔다.
// generation: 이 게시물의 만들기 상태(장 다시 만들기·장 고치기에 쓴다). 예전 초안처럼 구성안이 없으면 다시 만들 것이 없어 버튼을 숨긴다.
export type CaptionStatus="saved"|"saving"|"unsaved"|"error";
type Props={
  draftId:string;topic:string;audience:"A"|"B"|"C";images:ApprovedImage[];generation:GenerationState|null;
  caption:string;onCaption:(text:string)=>void;captionStatus:CaptionStatus;writing:boolean;copyError:string;onRewrite:()=>void;
  onSaveCaption:()=>Promise<boolean>;onFreeCards:(images:ApprovedImage[])=>void;imageNotice:string;
};
const CAPTION_STATUS:Record<CaptionStatus,string>={saved:"글을 저장했어요",saving:"글을 저장하는 중…",unsaved:"고친 글은 곧 저장돼요",error:"글을 저장하지 못했어요. 잠시 뒤 다시 저장해요"};

export function ReviewStep({draftId,topic,audience,images,generation,caption,onCaption,captionStatus,writing,copyError,onRewrite,onSaveCaption,onFreeCards,imageNotice}:Props) {
  const urls:ReviewImage[]=images.flatMap(image=>image.preview?[{url:image.preview,source:image.source}]:[]);
  const [index,setIndex]=useState(0);
  const [instagramReady,setInstagramReady]=useState(true);
  const [freeOpen,setFreeOpen]=useState(false);
  const shown=Math.min(index,Math.max(urls.length-1,0)),active=urls[shown];
  // 장을 넘기면 만들기 상태의 "지금 장"도 맞춘다(이 장 다시 만들기·글자 고치기·장 고치기가 그 장에 걸린다).
  const go=(next:number)=>{setIndex(next);if(generation&&next<generation.slides.length)setActiveSlide(next);};
  const atSlide=generation&&generation.slides.length>shown?{...generation,activeSlide:shown}:null;
  const redo=atSlide?redoSlideKind(atSlide):null;
  const busy=Boolean(generation&&generation.phase!=="idle");
  const plan=generation?.plan,slidePlan=plan?.slides[shown];
  const ai=images.some(image=>image.source==="ai-generated"||image.source==="ai-edited");
  return <section aria-labelledby="review-title">
    <h1 id="review-title">확인하고 올리기</h1>
    <p className="lead">사진과 글을 확인하고, 아래 큰 버튼을 눌러 주세요.</p>
    <div className="review-layout">
      <div className="review-preview">
        <div className="post-image" role="img" aria-label={`${shown+1}번째 장 미리보기`} style={active?{backgroundImage:`url(${active.url})`}:undefined}/>
        <div className="carousel-controls" aria-label="장 넘기기">
          <button type="button" className="button secondary" aria-label="이전 장" disabled={shown===0} onClick={()=>go(shown-1)}>◀</button>
          <span aria-live="polite">{urls.length?`${shown+1} / ${urls.length}`:"0 / 0"}</span>
          <button type="button" className="button secondary" aria-label="다음 장" disabled={shown>=urls.length-1} onClick={()=>go(shown+1)}>▶</button>
        </div>
        <div className="carousel-thumbnails" aria-label="모든 장">{urls.map((image,slide)=><button key={`${image.url.slice(-24)}-${slide}`} type="button" aria-label={`${slide+1}번째 장 보기`} aria-pressed={shown===slide} className="feed-thumb" style={{backgroundImage:`url(${image.url})`}} onClick={()=>go(slide)}/>)}</div>
        {redo&&!busy&&<button type="button" className="button secondary" onClick={()=>{setActiveSlide(shown);void redoSlide();}}>이 장 다시 만들기</button>}
        {busy&&generation&&<GenerationProgress stage={`redo-${generation.phase}`} message={generation.deckStatus||"이 장을 다시 만들고 있어요"} hint="AI가 그리는 장은 1~3분 걸려요."/>}
        {generation?.error&&!busy&&<p role="alert">{generation.error}</p>}
        {imageNotice&&<p role="status" className="field-help">{imageNotice}</p>}
        {ai&&<p className="field-help">AI가 그린 사진은 실제 음식과 다를 수 있어요. 올리기 전에 한 번 봐 주세요.</p>}
      </div>
      <div className="review-text">
        <label htmlFor="post-text" className="review-label">올릴 글</label>
        {writing?<GenerationProgress label="글을" stage="writing" hint="조금만 기다려 주세요."/>:null}
        <textarea id="post-text" aria-label="올릴 글" rows={14} maxLength={2200} value={caption} disabled={writing} placeholder={writing?"":"여기에 올릴 글을 적어 주세요"} onChange={event=>onCaption(event.target.value)}/>
        <div className="review-text-actions">
          <button type="button" className="button secondary" disabled={writing} onClick={onRewrite}>글 다시 쓰기</button>
          {!writing&&caption.trim()&&<span className="field-help" role="status">{CAPTION_STATUS[captionStatus]}</span>}
        </div>
        {copyError&&!writing&&<p role="alert">{copyError}</p>}
        <p className="field-help">가격·영업시간처럼 바뀔 수 있는 내용은 올리기 전에 한 번 확인해 주세요.</p>
      </div>
    </div>
    <div className="share-actions">
      <InstagramPublish draftId={draftId} caption={caption} imageUrls={urls.map(image=>image.url)} primary onBeforePublish={onSaveCaption} onReady={setInstagramReady}/>
      <SaveToPhone images={urls} caption={caption} title={topic} primary={!instagramReady}/>
    </div>
    <details className="more-tools">
      <summary>더보기</summary>
      <div className="more-tools-body">
        {generation&&slidePlan&&shown<generation.slides.length&&<SlideTextEditor key={`${shown}|${slidePlan.headline}|${(slidePlan.points??[]).join("|")}`} index={shown} headline={slidePlan.headline} points={slidePlan.points??[]} busy={busy} canEdit={canEditSlideText(generation,shown)}/>}
        {generation&&generation.slides.length>0&&<DeckEditor state={generation}/>}
        {/* 글자 카드 화면은 펼칠 때만 그린다(열 때 사진 목록을 불러오므로, 안 쓰는 사람에게 요청을 보내지 않게). */}
        <details className="slide-text-editor" onToggle={event=>setFreeOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>글자 카드로 직접 만들기</summary>{freeOpen&&<><p className="field-help">사진 대신 글자 카드로 새로 만들어요. 다 만들고 &apos;카드 사용&apos;을 누르면 지금 사진이 바뀌어요.</p><FreeCardStudio topic={topic} onApprove={onFreeCards}/></>}</details>
        <details className="slide-text-editor"><summary>파일로 받기 · # 태그 · 음악</summary><ExportActions caption={caption} images={urls} topic={topic} audience={audience}/></details>
      </div>
    </details>
  </section>;
}
