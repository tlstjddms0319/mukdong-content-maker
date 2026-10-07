"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { GenerationProgress } from "@/components/states/GenerationState";
import { GridPreview } from "./GridPreview";
import { readJsonResponse } from "@/lib/http/readJson";
import { SlideTextEditor } from "./SlideTextEditor";
import { DeckEditor } from "./DeckEditor";
import { LibraryFilterBar } from "./LibraryFilterBar";
import type { LibraryAsset } from "@/features/images/freeCards";
import { filterLibrary, popularTags, usageLabel, type LibrarySort } from "@/features/images/libraryFilter";
import { AnalyzeResponseSchema, type AnalyzeResponse } from "@/features/images/photoAnalysis";
import { MAX_STUDIO_PHOTOS, activeSlideIndex, deckComplete, addLibraryPhoto, canEditSlideText, addPhotos, approveRawPhotos, buildPhotoCarousel, recordPhotoUse, markApproved, movePhotoForward, removePhoto, setActiveSlide, swapSlidePhoto, type ApprovedImage, type GenerationState } from "@/features/images/generationStore";

// 사진 품질·표지 추천(/api/images/analyze). score:false는 서버의 로컬 검사만(무료), true는 Gemini 식욕 점수까지(버튼으로만).
async function requestAnalysis(ids:string[],score:boolean,topic:string):Promise<AnalyzeResponse> {
  const response=await fetch("/api/images/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photos:ids.map(id=>({id})),score,...(topic?{topic:topic.slice(0,200)}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"사진을 살펴보지 못했어요.");
  // 모양이 다른 응답(예전 서버 등)은 배지 없이 넘어가도록 여기서 거른다.
  const parsed=AnalyzeResponseSchema.safeParse(data);
  if(!parsed.success)throw new Error("사진을 살펴보지 못했어요.");
  return parsed.data;
}

// 사진을 첫 장(표지)으로. 한 칸씩 앞으로 옮기는 동작을 이어 붙여 나머지 순서는 그대로 둔다.
function moveToCover(index:number){for(let i=index;i>0;i--)movePhotoForward(i);}

// 실제 사진 여러 장으로 캐러셀을 만드는 화면. 상태는 generationStore에 있고, 이 컴포넌트는 보여 주고 버튼을 잇는다.
// 1) 사진 고르기(새로 올리기 또는 사진 보관함에서) → 2) 캐러셀 만들기(구성안 + 사진 배치 + 카드 그리기)
// → 3) 장마다 사진 바꾸기 → 4) 사용. 카드로 꾸미지 않고 사진 그대로 쓰는 길도 남겨 둔다.
export function PhotoCarouselStudio({state,slideCount,onApprove}:{state:GenerationState;slideCount:number;onApprove:(images:ApprovedImage[])=>void}) {
  const inputRef=useRef<HTMLInputElement>(null);
  const [library,setLibrary]=useState<LibraryAsset[]|null>(null);
  // 보관함 찾기·정렬. 기본은 "안 쓴 사진 먼저"라 같은 사진만 반복해 올리지 않게 돕는다.
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<LibrarySort>("unused");
  const [libraryError,setLibraryError]=useState("");
  const {photos,photoStatus,phase,slides,plan,planFallback,photoAssignment,approved,deckEdited,deckStatus}=state;
  const busy=phase!=="idle";
  const activeIndex=activeSlideIndex(state),active=slides[activeIndex];
  const done=deckComplete(state)&&!busy;
  const filling=phase==="slides"&&!deckEdited&&slides.length<slideCount;
  const progress=deckStatus?deckStatus:phase==="uploading"?photoStatus||"사진을 저장하고 있어요":phase==="planning"?"캐러셀 구성을 만들고 있어요":filling?`${slides.length}/${slideCount}장 완성 · 사진을 카드에 앉히고 있어요`:phase==="slides"?`${activeIndex+1}번 장 사진을 바꾸고 있어요`:"";
  const usedInActive=photoAssignment[activeIndex]??[];
  // 사진 품질 배지·표지 추천. 고른 사진 묶음(순서와 무관)이 바뀌면 무료 로컬 검사만 다시 한다. 순서는 바꾸지 않는다(사장님이 고른다).
  const photoKey=photos.map(photo=>photo.id).sort().join("|");
  const [analysis,setAnalysis]=useState<{key:string;data:AnalyzeResponse}|null>(null);
  const [scoring,setScoring]=useState(false);
  const [analysisNote,setAnalysisNote]=useState("");
  useEffect(()=>{
    if(!photoKey)return;
    let cancelled=false;
    requestAnalysis(photoKey.split("|"),false,"").then(data=>{if(!cancelled)setAnalysis({key:photoKey,data});}).catch(()=>{/* 품질 배지는 보조 정보라 실패해도 조용히 넘어간다 */});
    return ()=>{cancelled=true;};
  },[photoKey]);
  const current=analysis?.key===photoKey?analysis.data:null;
  const findTastiest=async()=>{
    const key=photoKey;
    setScoring(true);setAnalysisNote("");
    try{
      const data=await requestAnalysis(key.split("|"),true,state.input.topic);
      setAnalysis({key,data});
      setAnalysisNote(data.message??(data.recommended?"맛있어 보이는 사진에 '표지로 추천'을 붙였어요. 표지는 직접 골라 주세요.":"표지로 추천할 만한 사진을 찾지 못했어요."));
    }catch(caught){setAnalysisNote(caught instanceof Error&&caught.message?caught.message:"사진을 살펴보지 못했어요.");}
    finally{setScoring(false);}
  };

  const openLibrary=async()=>{
    if(library){setLibrary(null);return;}
    setLibraryError("");
    try{
      const response=await fetch("/api/images/assets");
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.message);
      setLibrary((data.assets as LibraryAsset[]).filter(asset=>asset.kind==="photo"));
    }catch(caught){setLibraryError(caught instanceof Error&&caught.message?caught.message:"사진 보관함을 불러오지 못했어요.");}
  };

  return <div className="photo-studio">
    <div className="upload-zone" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void addPhotos([...event.dataTransfer.files]);}}>
      <strong>사진을 여기에 끌어놓으세요 (최대 {MAX_STUDIO_PHOTOS}장)</strong>
      <span className="field-help">첫 번째 사진이 표지가 돼요. 사진이 장 수보다 적으면 남는 장은 글자 카드로, 많으면 한 장에 여러 컷을 넣어요.</span>
      <input ref={inputRef} aria-label="사진 파일" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event=>{void addPhotos([...(event.target.files??[])]);event.target.value="";}}/>
      <div className="photo-studio-actions">
        <button type="button" className="button secondary" disabled={busy||photos.length>=MAX_STUDIO_PHOTOS} onClick={()=>inputRef.current?.click()}>사진 올리기</button>
        <button type="button" className="button secondary" disabled={busy} aria-expanded={Boolean(library)} onClick={()=>void openLibrary()}>{library?"보관함 닫기":"사진 보관함에서 고르기"}</button>
      </div>
    </div>
    {libraryError&&<p role="alert">{libraryError}</p>}
    {library&&(library.length?<div className="library-picker">
      <LibraryFilterBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} tags={popularTags(library)} count={filterLibrary(library,query,sort).length}/>
      <div className="photo-library" aria-label="사진 보관함">{filterLibrary(library,query,sort).map(photo=><button key={photo.id} type="button" className="photo-thumb library-thumb" disabled={busy||photos.some(item=>item.id===photo.id)} onClick={()=>addLibraryPhoto({id:photo.id,preview:photo.preview,name:photo.name})} aria-label={`${photo.name} 추가 (${usageLabel(photo)})`} title={`${photo.name} · ${photo.tags.join(", ")}`}><Image src={photo.preview} alt="" width={96} height={96} unoptimized/><span>{photo.useCount?`${photo.useCount}번`:"새 사진"}</span></button>)}</div>
    </div>:<p className="field-help">보관함에 저장된 사진이 아직 없어요. 사진을 올리면 다음에도 여기서 고를 수 있어요.</p>)}
    {photos.length>0&&<ol className="photo-strip" aria-label="고른 사진">{photos.map((photo,index)=>{
      const info=current?.photos.find(item=>item.id===photo.id);
      const recommended=current?.recommended===photo.id&&photos.length>1;
      return <li key={photo.id} aria-label={`${index+1}번 사진${recommended?" · 표지로 추천":""}${info?.labels.length?` · ${info.labels.join(", ")}`:""}`}>
        <Image src={photo.preview} alt={photo.name} width={110} height={110} unoptimized/>
        <span className="photo-order">{index===0?"표지":index+1}</span>
        {recommended&&<span className="photo-recommend" title={info?.appetite?`맛 점수 ${info.appetite.score}/10${info.appetite.note?` · ${info.appetite.note}`:""}`:"밝기·선명도로 고른 추천"}>표지로 추천</span>}
        {info&&info.labels.length>0&&<span className="photo-quality">{info.labels.map(label=><span key={label}>{label}</span>)}</span>}
        <span className="photo-strip-actions">
          {recommended&&index>0&&<button type="button" disabled={busy} aria-label={`${index+1}번 사진을 표지로`} title="이 사진을 첫 장(표지)으로" onClick={()=>moveToCover(index)}>★</button>}
          {index>0&&<button type="button" disabled={busy} aria-label={`${index+1}번 사진 앞으로`} onClick={()=>movePhotoForward(index)}>◀</button>}
          <button type="button" disabled={busy} aria-label={`${index+1}번 사진 빼기`} onClick={()=>removePhoto(index)}>✕</button>
        </span>
      </li>;
    })}</ol>}
    {photos.length>1&&current?.scoreAvailable&&<div className="photo-studio-actions">
      <button type="button" className="button secondary" disabled={busy||scoring} onClick={()=>void findTastiest()}>{scoring?"사진을 살펴보는 중…":"맛있어 보이는 사진 찾기"}</button>
      {analysisNote&&<span role="status" className="field-help">{analysisNote}</span>}
    </div>}
    {photos.length>0&&!slides.length&&!busy&&<div className="photo-studio-actions">
      <button type="button" className="button primary" onClick={()=>void buildPhotoCarousel()}>사진 {photos.length}장으로 {slideCount}장 캐러셀 만들기</button>
      <button type="button" className="button secondary" disabled={approved} onClick={()=>approveRawPhotos(onApprove)}>글자 없이 사진만 쓰기</button>
    </div>}
    {progress&&<GenerationProgress stage={`${phase}-${slides.length}`} message={progress} progress={filling?slides.length/slideCount:undefined}/>}
    {planFallback&&slides.length>0&&<p role="status" className="field-help">AI가 구성안을 만들지 못해 준비된 기본 문안으로 채웠어요. 문안이 주제와 다르면 다시 만들어 보세요.</p>}
    {slides.length>0&&<>
      <div className="generated-carousel">
        <div role="img" aria-label="사진 캐러셀 미리보기" className="post-image" style={{aspectRatio:"4 / 5",...(active?.preview?{backgroundImage:`url(${active.preview})`}:{})}}><span>{activeIndex+1}번 슬라이드</span></div>
        <div className="carousel-controls" aria-label="사진 캐러셀 이동">
          <button type="button" className="button secondary" aria-label="이전 슬라이드" disabled={activeIndex===0} onClick={()=>setActiveSlide(activeIndex-1)}>이전</button>
          <span aria-live="polite">{activeIndex+1} / {slides.length}</span>
          <button type="button" className="button secondary" aria-label="다음 슬라이드" disabled={activeIndex>=slides.length-1} onClick={()=>setActiveSlide(activeIndex+1)}>다음</button>
        </div>
        <GridPreview cover={slides[0]?.preview}/>
        <div className="carousel-thumbnails" aria-label="만든 슬라이드 목록">{slides.map((slide,index)=><button key={slide.id} type="button" aria-label={`슬라이드 ${index+1} 보기`} aria-pressed={activeIndex===index} className="feed-thumb" style={slide.preview?{backgroundImage:`url(${slide.preview})`}:undefined} onClick={()=>setActiveSlide(index)}/>)}</div>
      </div>
      {done&&(usedInActive.length?<div className="photo-swap">
        <span>이 장 사진 바꾸기</span>
        <div className="photo-library">{photos.map((photo,index)=><button key={photo.id} type="button" className="photo-thumb" aria-pressed={usedInActive[0]===index} disabled={busy} onClick={()=>void swapSlidePhoto(index)} aria-label={`${index+1}번 사진으로 바꾸기`}><Image src={photo.preview} alt="" width={80} height={80} unoptimized/></button>)}</div>
      </div>:<p className="field-help">이 장은 사진 없이 글자로 만든 카드예요.{plan?` (${plan.slides[activeIndex]?.headline})`:""}</p>)}
      {done&&plan?.slides[activeIndex]&&<SlideTextEditor key={`${activeIndex}|${plan.slides[activeIndex].headline}|${(plan.slides[activeIndex].points??[]).join("|")}`} index={activeIndex} headline={plan.slides[activeIndex].headline} points={plan.slides[activeIndex].points??[]} busy={busy} canEdit={canEditSlideText(state,activeIndex)}/>}
      {(done||(busy&&deckEdited))&&<DeckEditor state={state}/>}
      {done&&<div className="photo-studio-actions">
        <button type="button" className="button secondary" disabled={busy||!photos.length} onClick={()=>void buildPhotoCarousel()}>다시 만들기</button>
        <button type="button" className="button primary" disabled={approved||busy} onClick={()=>{markApproved();onApprove(slides);recordPhotoUse(photoAssignment.flat().map(i=>photos[i]?.id));}}>이 캐러셀 사용</button>
      </div>}
    </>}
  </div>;
}
