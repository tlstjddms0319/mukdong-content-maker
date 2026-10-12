"use client";
import { useState } from "react";
import { GenerationProgress } from "@/components/states/GenerationState";
import { InstagramPublish } from "@/components/review/InstagramPublish";
import { SaveToPhone } from "@/components/review/SaveToPhone";
import { ScheduleShare } from "@/components/review/ScheduleShare";
import { ArchiveShare } from "@/components/review/ArchiveShare";
import { ExportActions } from "@/components/review/ExportActions";
import type { ReviewImage } from "@/components/review/exportFiles";
import { SlideFixPanel } from "@/components/images/SlideFixPanel";
import { DeckEditor } from "@/components/images/DeckEditor";
import { LookPicker } from "@/components/wizard/LookPicker";
import { FreeCardStudio } from "@/components/images/FreeCardStudio";
import { canChangeLook, canEditSlideText, changeTrackLook, photoSlideOptions, redoSlideKind, sceneNoticeOf, setActiveSlide, trackLookOf, type ApprovedImage, type GenerationState } from "@/features/images/generationStore";

// 3단계 "확인하고 올리기": 사진과 글을 한 화면에서 보고, 큰 버튼 네 개(바로 올리기·예약해서 올리기·휴대폰에 저장·보관함에 보관) 중 하나를 누른다.
// 작은 것은 "N번 장 고치기"(그림·글을 요청대로 다시)와 "글 다시 쓰기"뿐. 장 넣기·빼기·글자 카드·파일 받기는 "더보기" 안에 접어 둔다.
// generation: 이 게시물의 만들기 상태(장 다시 만들기·장 고치기에 쓴다). 예전 초안처럼 구성안이 없으면 다시 만들 것이 없어 버튼을 숨긴다.
export type CaptionStatus="saved"|"saving"|"unsaved"|"error";
type Props={
  draftId:string;topic:string;audience:"A"|"B"|"C";images:ApprovedImage[];generation:GenerationState|null;
  caption:string;savedCaption:string;onCaption:(text:string)=>void;captionStatus:CaptionStatus;writing:boolean;copyError:string;onRewrite:()=>void;
  onSaveCaption:()=>Promise<boolean>;onFreeCards:(images:ApprovedImage[])=>void;imageNotice:string;
};
const CAPTION_STATUS:Record<CaptionStatus,string>={saved:"글을 저장했어요",saving:"글을 저장하는 중…",unsaved:"고친 글은 곧 저장돼요",error:"글을 저장하지 못했어요. 잠시 뒤 다시 저장해요"};

export function ReviewStep({draftId,topic,audience,images,generation,caption,savedCaption,onCaption,captionStatus,writing,copyError,onRewrite,onSaveCaption,onFreeCards,imageNotice}:Props) {
  const urls:ReviewImage[]=images.flatMap(image=>image.preview?[{url:image.preview,source:image.source}]:[]);
  const [index,setIndex]=useState(0);
  // 바로 올릴 수 있으면 "바로 올리기"가, 아니면(연결 전·연결 기간 끝남) "휴대폰에 저장하기"가 주인공 버튼이다(한 화면에 주인공은 하나).
  const [instagramReady,setInstagramReady]=useState(true);
  const [freeOpen,setFreeOpen]=useState(false);
  // 예약·보관은 서로 영향을 준다(보관하면 예약이 꺼지고, 예약하면 보관함에서 나온다). 한쪽을 바꾸면 둘 다 서버 상태를 다시 읽게 key를 바꾼다.
  const [shareTick,setShareTick]=useState(0);
  const bumpShare=()=>setShareTick(tick=>tick+1);
  const shown=Math.min(index,Math.max(urls.length-1,0)),active=urls[shown];
  // 장을 넘기면 만들기 상태의 "지금 장"도 맞춘다(장 고치기(그림·글)·장 고치기가 그 장에 걸린다).
  const go=(next:number)=>{setIndex(next);if(generation&&next<generation.slides.length)setActiveSlide(next);};
  const atSlide=generation&&generation.slides.length>shown?{...generation,activeSlide:shown}:null;
  const redo=atSlide?redoSlideKind(atSlide):null;
  const busy=Boolean(generation&&generation.phase!=="idle");
  const plan=generation?.plan,slidePlan=plan?.slides[shown];
  const lookNow=generation?trackLookOf(generation):null;
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
        {/* 게시물 모양: 접힌 목록을 펴서 견본을 보고 고른 뒤 '변경하기'로 모든 장을 다시 그린다(사진·글은 그대로, AI 비용 없음). */}
        {generation&&lookNow&&<LookPicker key={`${lookNow.track}-${lookNow.look}`} track={lookNow.track} current={lookNow.look} disabled={busy||!canChangeLook(generation)} disabledReason={busy?undefined:"다 만든 뒤에, 사진이 남아 있는 게시물만 바꿀 수 있어요"} onChange={look=>void changeTrackLook(look)}/>}
        {/* 이 장 고치기: 그림/글 중 고를 것을 고르고, 요청 버튼·직접 적은 말대로 다시 만든다(예전 "이 장 다시 만들기"). */}
        {generation&&slidePlan&&shown<generation.slides.length&&<SlideFixPanel key={shown} index={shown} pictureKind={redo} photoOptions={atSlide&&redo==="photo"?photoSlideOptions(atSlide):undefined} canEditText={canEditSlideText(generation,shown)} headline={slidePlan.headline} points={slidePlan.points??[]} busy={busy}/>}
        {busy&&generation&&<GenerationProgress stage={`redo-${generation.phase}`} message={generation.deckStatus||"이 장을 다시 만들고 있어요"} hint="AI가 그리는 장은 1~3분 걸려요."/>}
        {generation?.error&&!busy&&<div className="make-error" role="alert"><p>이 장을 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.</p><details><summary>자세한 이유</summary><p>{generation.error}</p></details></div>}
        {imageNotice&&<p role="status" className="field-help">{imageNotice}</p>}
        {/* AI 장면을 못 그려 대신 그린 장이 있으면 알린다(조용히 바뀌면 왜 그림이 없는지 알 수 없다). */}
        {generation&&sceneNoticeOf(generation)&&<p role="status" className="field-help scene-notice">{sceneNoticeOf(generation)}</p>}
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
      <InstagramPublish draftId={draftId} caption={caption} imageUrls={urls.map(image=>image.url)} primary={instagramReady} onBeforePublish={onSaveCaption} onReady={setInstagramReady}/>
      {/* 사진이 바뀌면(장 다시 만들기 등) 서버가 예약 확인을 풀므로, 다시 읽도록 사진 목록을 key로 준다. */}
      {/* 예약·보관 칸은 key가 서로 달라야 한다: 같은 key(shareTick)를 함께 쓰면 key가 바뀔 때 React가 칸을 헷갈려
          옛 예약 칸("예약하는 중…")이 지워지지 않고 새 칸과 함께 두 번 보였다. */}
      <ScheduleShare key={`schedule-${shareTick}`} draftId={draftId} ready={instagramReady&&urls.length>0} busy={writing} refreshKey={`${savedCaption}|${urls.map(image=>image.url.slice(-24)).join("|")}`} onBeforeSchedule={onSaveCaption} onChange={bumpShare}/>
      <SaveToPhone images={urls} caption={caption} title={topic} primary={!instagramReady}/>
      <ArchiveShare key={`archive-${shareTick}`} draftId={draftId} onBeforeArchive={onSaveCaption} onChange={bumpShare}/>
    </div>
    <details className="more-tools">
      <summary>더보기</summary>
      <div className="more-tools-body">
        {generation&&generation.slides.length>0&&<DeckEditor state={generation}/>}
        {/* 글자 카드 화면은 펼칠 때만 그린다(열 때 사진 목록을 불러오므로, 안 쓰는 사람에게 요청을 보내지 않게). */}
        <details className="slide-text-editor" onToggle={event=>setFreeOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>글자 카드로 직접 만들기</summary>{freeOpen&&<><p className="field-help">사진 대신 글자 카드로 새로 만들어요. 다 만들고 &apos;카드 사용&apos;을 누르면 지금 사진이 바뀌어요.</p><FreeCardStudio topic={topic} onApprove={onFreeCards}/></>}</details>
        <details className="slide-text-editor"><summary>파일로 받기 · # 태그 · 음악</summary><ExportActions caption={caption} images={urls} topic={topic} audience={audience}/></details>
      </div>
    </details>
  </section>;
}
