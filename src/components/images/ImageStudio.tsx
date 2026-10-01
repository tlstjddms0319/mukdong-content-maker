"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import { FreeCardStudio } from "./FreeCardStudio";
import { GenerationProgress } from "@/components/states/GenerationState";
import { IMAGE_STYLE_OPTIONS } from "@/features/images/style";
import { SLIDE_LAYOUT_OPTIONS } from "@/features/images/slideLayout";
import { BODY_FONTS, BODY_FONT_OPTIONS, TITLE_FONTS, TITLE_FONT_OPTIONS, type BodyFontId, type TitleFontId } from "@/features/images/typography";
import { THEMES, THEME_OPTIONS, type ThemeId } from "@/features/images/themes";
import { STYLES, STYLE_OPTIONS, type StyleId } from "@/features/images/styleCatalog";
import { activeSlideIndex, chooseMode, ensureGeneration, finishSlides, initialGenerationState, markApproved, regenerateSlide, requestCovers, selectCover, setActiveSlide, setBodyFont, setStyle, setImageStyle, setRefinement, setReferenceUse, setSlideLayout, setTheme, setTitleFont, startPlan, uploadPhoto, useGenerationState, type ApprovedImage, type StudioMode } from "@/features/images/generationStore";
import type { CarouselSlideCount } from "@/features/images/carousel";
export type { ApprovedImage } from "@/features/images/generationStore";

// 상태와 생성 루프는 generationStore에 있고, 이 컴포넌트는 그것을 보여 주고 버튼을 연결하는 화면이다.
// 그래서 다른 화면으로 이동해 이 컴포넌트가 사라져도 생성은 계속되고, 돌아오면 같은 상태를 다시 보여 준다.
export function ImageStudio({topic,imageBrief,contentBrief,slideCount,approvedImages=[],onApprove,sessionKey}:{topic:string;imageBrief?:string;contentBrief?:string;slideCount:CarouselSlideCount;approvedImages?:ApprovedImage[];onApprove:(images:ApprovedImage[])=>void;sessionKey?:string}) {
 const inputRef=useRef<HTMLInputElement>(null);
 const brief=imageBrief?.trim();
 const content=contentBrief?.trim()||undefined;
 const key=`${sessionKey??topic}|${slideCount}`;
 const stored=useGenerationState();
 // 저장소가 다른 초안의 상태를 들고 있으면 첫 렌더에서는 빈 초기 상태를 보여 주고, 아래 effect가 저장소를 이 초안으로 맞춘다.
 const state=stored.key===key?stored:initialGenerationState(key,{topic,imageBrief:brief,contentBrief:content,slideCount},approvedImages);
 useEffect(()=>{ensureGeneration(key,{topic,imageBrief:brief,contentBrief:content,slideCount},approvedImages);},[key,topic,brief,content,slideCount,approvedImages]);
 const {mode,imageStyle,slideLayout,titleFont,bodyFont,theme,style,referenceUse,photoPreview,photoStatus,providerNotice,plan,planFallback,covers,cover,slides,phase,error,approved,refinements}=state;
 const busy=phase!=="idle",activeIndex=activeSlideIndex(state),active=slides[activeIndex];
 const fillingSlides=phase==="slides"&&slides.length<slideCount;
 const progressMessage=phase==="uploading"?"사진을 저장하고 있어요":phase==="planning"?"캐러셀 구성을 만들고 있어요":phase==="cover"?"표지 후보 2장을 만들고 있어요":fillingSlides?`${slides.length}/${slideCount}장 완성 · 다음 장을 만들고 있어요`:phase==="slides"?`${activeIndex+1}번 슬라이드를 다시 만들고 있어요`:"";
 const progressHint=phase==="cover"||phase==="slides"?"이미지 한 장에 1~3분 정도 걸려요. 다른 화면으로 이동해도 생성은 계속되지만, 새로고침하면 사라져요.":undefined;
 const doneStatus=phase==="idle"&&slides.length?`${slides.length}/${slideCount}장 완성`:"";
 const modes:[StudioMode,string,string][]=[["free","무료 카드 편집","사진과 글자로 만드는 질문 카드"],["photo","실제 사진 사용","직접 찍은 음식 사진을 사용해요"],["ai","AI 이미지 생성","주제에 맞는 표지부터 만들어요"],["mix","사진 + AI 함께","사진을 참고해 캐러셀을 만들어요"]];
 return <section aria-labelledby="image-title" className="studio"><div className="section-heading"><div><p className="eyebrow">가장 중요한 단계</p><h2 id="image-title">눈길을 끄는 이미지를 골라요</h2></div><span className="soft-badge">{mode==="free"?"최대 10장 · 무료 편집":`${slideCount}장 캐러셀`}</span></div><div className="mode-grid">{modes.map(([id,label,help])=><button key={id} type="button" aria-label={label} aria-pressed={mode===id} className={`mode-card ${mode===id?"selected":""}`} onClick={()=>chooseMode(id)}><strong>{label}</strong><span>{help}</span></button>)}</div><input ref={inputRef} aria-label="사진 파일" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e=>void uploadPhoto(e.target.files?.[0],onApprove)}/>{error&&<span role="alert">{error}</span>}{providerNotice&&<p>{providerNotice}</p>}
 {approvedImages.length>0&&<div className="saved-selection"><strong>선택한 이미지 {approvedImages.length}장이 저장되어 있어요.</strong></div>}{mode==="free"?<FreeCardStudio key={topic} topic={topic} onApprove={onApprove}/>:mode==="photo"?<div className="upload-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void uploadPhoto(e.dataTransfer.files[0],onApprove,false);}}><strong>사진을 여기에 끌어놓으세요</strong>{photoPreview&&<Image className="photo-preview" src={photoPreview} alt="선택한 사진 미리보기" width={360} height={450} unoptimized/>}<button type="button" className="button primary" disabled={busy} onClick={()=>inputRef.current?.click()}>사진 고르기</button>{phase==="uploading"?<GenerationProgress message="사진을 저장하고 있어요"/>:photoStatus&&<span role="status">{photoStatus}</span>}</div>:<div className="generation-note"><div className="option-picker" role="group" aria-label="화풍"><span>화풍</span>{IMAGE_STYLE_OPTIONS.map(([id,label,help])=><button key={id} type="button" className="button secondary" aria-pressed={imageStyle===id} title={help} disabled={busy} onClick={()=>setImageStyle(id)}>{label}</button>)}</div><div className="option-picker" role="group" aria-label="슬라이드 디자인"><span>디자인</span>{SLIDE_LAYOUT_OPTIONS.map(([id,label,help])=><button key={id} type="button" className="button secondary" aria-pressed={slideLayout===id} title={help} disabled={busy} onClick={()=>setSlideLayout(id)}>{label}</button>)}</div>{slideLayout==="card"&&<StylePicker style={style} recommended={plan?.design?.style}/>}{slideLayout==="card"&&<ThemePicker theme={theme} recommended={plan?.design?.theme}/>}{slideLayout==="card"&&<FontPicker titleFont={titleFont} bodyFont={bodyFont} recommended={plan?.design} perSlide={plan?.slides.some(slide=>(slide.titleFont??"auto")!=="auto"||(slide.bodyFont??"auto")!=="auto")} generated={covers.length>0||Boolean(cover)}/>}{mode==="mix"&&<><button type="button" className="button secondary" disabled={busy} onClick={()=>inputRef.current?.click()}>{photoPreview?"참고 사진 바꾸기":"참고 사진 고르기"}</button>{photoStatus&&<span role="status">{photoStatus}</span>}{photoPreview&&<div className="option-picker" role="group" aria-label="참고 방식"><span>참고 방식</span><button type="button" className="button secondary" aria-pressed={referenceUse==="source"} title="사진 속 음식의 모양과 특징을 유지해요" disabled={busy} onClick={()=>setReferenceUse("source")}>음식 그대로</button><button type="button" className="button secondary" aria-pressed={referenceUse==="style"} title="색감·조명·화풍만 참고하고 장면은 새로 만들어요" disabled={busy} onClick={()=>setReferenceUse("style")}>화풍·분위기만</button></div>}</>}{planFallback&&!covers.length&&!cover&&<div className="plan-fallback"><p role="alert">AI가 구성안을 만들지 못해 준비된 기본 문안으로 채웠어요. 주제와 맞지 않을 수 있으니 구성안을 다시 만들어 보세요.</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void startPlan()}>구성안 다시 만들기</button></div>}{!covers.length&&!cover&&<button type="button" className="button primary" disabled={busy||(mode==="mix"&&!photoPreview)} onClick={()=>void(plan?requestCovers(plan):startPlan())}>{plan?planFallback?"기본 구성안으로 표지 만들기":"표지 후보 다시 만들기":"표지 후보 2장 만들기"}</button>}{covers.length===2&&!cover&&<label className="custom-topic"><span>표지 수정 요청</span><input maxLength={300} disabled={busy} placeholder="예: 애니메이션 풍으로, 자연광은 부드럽게" value={refinements[0]??""} onChange={event=>setRefinement(0,event.target.value)}/></label>}{covers.length===2&&!cover&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void requestCovers(plan)}>표지 후보 다시 만들기</button>}{covers.length===2&&!cover&&<div className="candidate-grid">{covers.map((candidate,i)=><button key={candidate.id} type="button" className="food-placeholder" style={candidate.preview?{backgroundImage:`url(${candidate.preview})`}:undefined} aria-label={`표지 후보 ${i+1} 선택`} onClick={()=>selectCover(candidate)}>표지 후보 {i+1}</button>)}</div>}{cover&&slides.length<slideCount&&<button type="button" className="button primary" disabled={busy} onClick={()=>void finishSlides()}>{error?"남은 슬라이드 다시 만들기":`이 표지로 ${slideCount}장 완성하기`}</button>}{progressMessage&&<GenerationProgress stage={`${phase}-${slides.length}`} message={progressMessage} hint={progressHint} progress={fillingSlides?slides.length/slideCount:undefined}/>}{doneStatus&&<p role="status">{doneStatus}</p>}{slides.length===slideCount&&<><div className="generated-carousel"><div role="img" aria-label="생성된 캐러셀 미리보기" className="post-image" style={{aspectRatio:"4 / 5",...(active?.preview?{backgroundImage:`url(${active.preview})`}:{})}}><span>{activeIndex+1}번 슬라이드</span></div><div className="carousel-controls" aria-label="생성된 캐러셀 이동"><button type="button" className="button secondary" aria-label="이전 생성 슬라이드" disabled={activeIndex===0} onClick={()=>setActiveSlide(activeIndex-1)}>이전</button><span aria-live="polite">{activeIndex+1} / {slides.length}</span><button type="button" className="button secondary" aria-label="다음 생성 슬라이드" disabled={activeIndex===slides.length-1} onClick={()=>setActiveSlide(activeIndex+1)}>다음</button></div><div className="carousel-thumbnails" aria-label="생성된 슬라이드 목록">{slides.map((slide,index)=><button key={slide.id} type="button" aria-label={`생성된 슬라이드 ${index+1} 보기`} aria-pressed={activeIndex===index} className="feed-thumb" style={slide.preview?{backgroundImage:`url(${slide.preview})`}:undefined} onClick={()=>setActiveSlide(index)}/>)}</div></div><p>AI 연출 이미지입니다. 실제 메뉴와 다를 수 있어요. 음식 모양·제목·잘린 부분을 확인해 주세요.</p>{plan&&cover&&<><label className="custom-topic"><span>이 장의 수정 요청</span><input maxLength={300} disabled={busy} placeholder="예: 일러스트 느낌으로, 접시 주변 여백을 넓혀 주세요" value={refinements[activeIndex]??""} onChange={event=>setRefinement(activeIndex,event.target.value)}/></label><button type="button" className="button secondary" disabled={busy} onClick={()=>void regenerateSlide()}>이 장만 다시 만들기</button></>}<button type="button" className="button primary" disabled={approved||busy} onClick={()=>{markApproved();onApprove(slides);}}>이 캐러셀 사용</button></>}</div>}</section>;
}

// 제목·본문 글꼴 선택. 기본은 "AI 추천"이고, 구성안이 나오면 추천된 글꼴 이름을 함께 보여 준다.
// 글꼴은 서버가 카드를 그릴 때 입혀지므로, 이미 만든 장은 다시 만들어야 바뀐다는 안내를 붙인다.
// 구성안은 서버 응답 JSON을 그대로 쓰므로, 글꼴 필드가 없는 예전 구성안이 와도 이름 표시만 생략한다.
// perSlide면 AI가 장마다 글꼴을 다르게 골랐다는 뜻이라 "기본 글꼴 + 장마다"로 표시한다.
function FontPicker({titleFont,bodyFont,recommended,perSlide=false,generated}:{titleFont:"auto"|TitleFontId;bodyFont:"auto"|BodyFontId;recommended?:{titleFont?:TitleFontId;bodyFont?:BodyFontId};perSlide?:boolean;generated:boolean}) {
 const recommendedTitle=recommended?.titleFont&&TITLE_FONTS[recommended.titleFont]?.label;
 const recommendedBody=recommended?.bodyFont&&BODY_FONTS[recommended.bodyFont]?.label;
 const suffix=perSlide?" · 장마다 다름":"";
 const autoTitle=recommendedTitle?`AI 추천 (${recommendedTitle}${suffix})`:"AI 추천 (장마다)";
 const autoBody=recommendedBody?`AI 추천 (${recommendedBody}${suffix})`:"AI 추천 (장마다)";
 return <div className="option-picker font-picker" role="group" aria-label="글꼴">
  <span>글꼴</span>
  <label>제목 <select value={titleFont} onChange={event=>setTitleFont(event.target.value as "auto"|TitleFontId)}><option value="auto">{autoTitle}</option>{TITLE_FONT_OPTIONS.map(([id,label,when])=><option key={id} value={id} title={when}>{label}{recommended?.titleFont===id?" · 추천":""}</option>)}</select></label>
  <label>본문 <select value={bodyFont} onChange={event=>setBodyFont(event.target.value as "auto"|BodyFontId)}><option value="auto">{autoBody}</option>{BODY_FONT_OPTIONS.map(([id,label,when])=><option key={id} value={id} title={when}>{label}{recommended?.bodyFont===id?" · 추천":""}</option>)}</select></label>
  {generated&&<small>바꾼 글꼴은 다음에 만드는 장부터 적용돼요. 이미 만든 장은 다시 만들어 주세요.</small>}
 </div>;
}

// 디자인 계열 선택. 계열은 색·사진 처리·글꼴·장식을 통째로 바꾸므로 테마보다 큰 변화다.
// "기본 템플릿"을 고르면 아래 테마·레이아웃 조합으로 그리고, 다른 계열은 그 계열의 화면 구성을 쓴다.
function StylePicker({style,recommended}:{style:"auto"|StyleId;recommended?:StyleId}) {
 const recommendedLabel=recommended&&STYLES[recommended]?.label;
 return <div className="option-picker font-picker" role="group" aria-label="디자인 계열">
  <span>계열</span>
  <label><select aria-label="디자인 계열" value={style} onChange={event=>setStyle(event.target.value as "auto"|StyleId)}><option value="auto">{recommendedLabel?`AI 추천 (${recommendedLabel})`:"AI 추천 (게시물마다 다름)"}</option>{STYLE_OPTIONS.map(([id,label,when])=><option key={id} value={id} title={when}>{label}{recommended===id?" · 추천":""}</option>)}</select></label>
 </div>;
}

// 게시물 테마 선택. 기본은 "AI 추천"(구성안이 고른 테마)이고, 직접 고르면 이 게시물의 모든 장에 같은 테마가 입혀진다.
function ThemePicker({theme,recommended}:{theme:"auto"|ThemeId;recommended?:ThemeId}) {
 const recommendedLabel=recommended&&THEMES[recommended]?.label;
 return <div className="option-picker font-picker" role="group" aria-label="게시물 테마">
  <span>테마</span>
  <label><select aria-label="게시물 테마" value={theme} onChange={event=>setTheme(event.target.value as "auto"|ThemeId)}><option value="auto">{recommendedLabel?`AI 추천 (${recommendedLabel})`:"AI 추천 (게시물마다 다름)"}</option>{THEME_OPTIONS.map(([id,label,when])=><option key={id} value={id} title={when}>{label}{recommended===id?" · 추천":""}</option>)}</select></label>
 </div>;
}
