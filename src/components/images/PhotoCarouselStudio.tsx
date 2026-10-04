"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { GenerationProgress } from "@/components/states/GenerationState";
import { GridPreview } from "./GridPreview";
import { readJsonResponse } from "@/lib/http/readJson";
import { SlideTextEditor } from "./SlideTextEditor";
import { MAX_STUDIO_PHOTOS, activeSlideIndex, addLibraryPhoto, canEditSlideText, addPhotos, approveRawPhotos, buildPhotoCarousel, markApproved, movePhotoForward, removePhoto, setActiveSlide, swapSlidePhoto, type ApprovedImage, type GenerationState, type StudioPhoto } from "@/features/images/generationStore";

// 실제 사진 여러 장으로 캐러셀을 만드는 화면. 상태는 generationStore에 있고, 이 컴포넌트는 보여 주고 버튼을 잇는다.
// 1) 사진 고르기(새로 올리기 또는 사진 보관함에서) → 2) 캐러셀 만들기(구성안 + 사진 배치 + 카드 그리기)
// → 3) 장마다 사진 바꾸기 → 4) 사용. 카드로 꾸미지 않고 사진 그대로 쓰는 길도 남겨 둔다.
export function PhotoCarouselStudio({state,slideCount,onApprove}:{state:GenerationState;slideCount:number;onApprove:(images:ApprovedImage[])=>void}) {
  const inputRef=useRef<HTMLInputElement>(null);
  const [library,setLibrary]=useState<StudioPhoto[]|null>(null);
  const [libraryError,setLibraryError]=useState("");
  const {photos,photoStatus,phase,slides,plan,planFallback,photoAssignment,approved}=state;
  const busy=phase!=="idle";
  const activeIndex=activeSlideIndex(state),active=slides[activeIndex];
  const done=slides.length===slideCount&&!busy;
  const progress=phase==="uploading"?photoStatus||"사진을 저장하고 있어요":phase==="planning"?"캐러셀 구성을 만들고 있어요":phase==="slides"&&slides.length<slideCount?`${slides.length}/${slideCount}장 완성 · 사진을 카드에 앉히고 있어요`:phase==="slides"?`${activeIndex+1}번 장 사진을 바꾸고 있어요`:"";
  const usedInActive=photoAssignment[activeIndex]??[];

  const openLibrary=async()=>{
    if(library){setLibrary(null);return;}
    setLibraryError("");
    try{
      const response=await fetch("/api/images/assets");
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.message);
      setLibrary((data.assets as Array<{id:string;preview:string;name:string;kind:string}>).filter(asset=>asset.kind==="photo").map(({id,preview,name})=>({id,preview,name})));
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
    {library&&<div className="photo-library" aria-label="사진 보관함">{library.length?library.map(photo=><button key={photo.id} type="button" className="photo-thumb" disabled={busy||photos.some(item=>item.id===photo.id)} onClick={()=>addLibraryPhoto(photo)} aria-label={`${photo.name} 추가`}><Image src={photo.preview} alt="" width={96} height={96} unoptimized/></button>):<p className="field-help">보관함에 저장된 사진이 아직 없어요. 사진을 올리면 다음에도 여기서 고를 수 있어요.</p>}</div>}
    {photos.length>0&&<ol className="photo-strip" aria-label="고른 사진">{photos.map((photo,index)=><li key={photo.id}>
      <Image src={photo.preview} alt={photo.name} width={110} height={110} unoptimized/>
      <span className="photo-order">{index===0?"표지":index+1}</span>
      <span className="photo-strip-actions">
        {index>0&&<button type="button" disabled={busy} aria-label={`${index+1}번 사진 앞으로`} onClick={()=>movePhotoForward(index)}>◀</button>}
        <button type="button" disabled={busy} aria-label={`${index+1}번 사진 빼기`} onClick={()=>removePhoto(index)}>✕</button>
      </span>
    </li>)}</ol>}
    {photos.length>0&&!slides.length&&!busy&&<div className="photo-studio-actions">
      <button type="button" className="button primary" onClick={()=>void buildPhotoCarousel()}>사진 {photos.length}장으로 {slideCount}장 캐러셀 만들기</button>
      <button type="button" className="button secondary" disabled={approved} onClick={()=>approveRawPhotos(onApprove)}>글자 없이 사진만 쓰기</button>
    </div>}
    {progress&&<GenerationProgress stage={`${phase}-${slides.length}`} message={progress} progress={phase==="slides"&&slides.length<slideCount?slides.length/slideCount:undefined}/>}
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
      {done&&<div className="photo-studio-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={()=>void buildPhotoCarousel()}>다시 만들기</button>
        <button type="button" className="button primary" disabled={approved||busy} onClick={()=>{markApproved();onApprove(slides);}}>이 캐러셀 사용</button>
      </div>}
    </>}
  </div>;
}
