import { useSyncExternalStore } from "react";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, type CarouselPlan, type CarouselRole, type CarouselSlideCount } from "./carousel";
import type { ImageStyle } from "./style";
import { DEFAULT_SLIDE_LAYOUT, type SlideLayout } from "./slideLayout";
import { normalizeCardLayout, photosNeeded, type DesignSpec } from "./design";
import type { BodyFontId, TitleFontId } from "./typography";
import type { ThemeId } from "./themes";
import type { SeasonMotif } from "./seasonMotif";
import { AnalyzeResponseSchema, TOPIC_TAG, photoNote } from "./photoAnalysis";
import type { StyleId } from "./styleCatalog";
import { readJsonResponse } from "@/lib/http/readJson";
import { fillWithPhotoViews, fitPanorama, fitPlanToPhotos, matchPhotosToSlides, swapPhoto, type PhotoView } from "./photoCarousel";

// 이미지 생성 상태를 React 컴포넌트 밖의 모듈 싱글턴에 둔다.
// 화면(ImageStudio)이 언마운트돼도 상태와 진행 중인 fetch 루프는 살아 있고, 다시 마운트되면 그대로 이어 붙는다.
// 새로고침을 하면 사라진다(모듈이 다시 로드되므로). 그 경우는 서버 작업 큐가 필요하다.

// check: AI 표지 점검 결과(coverCheck.ts). 점수와 경고 배지를 후보 위에 보여 준다.
// bases: 글자를 얹기 전 밑바탕 사진(AI 이미지). 카드 글자만 고쳐 다시 그릴 때 쓴다. 초안에는 저장하지 않는다(화면에서만).
// droppedPoints: 카드 자리가 모자라 그리지 못한 요점 수(서버가 알려 줌). 장 글자 고치기 옆에 안내한다.
export type ApprovedImage={id:string;preview?:string;referencePreview?:string;bases?:string[];source:"photo"|"design"|"ai-generated"|"ai-edited";role?:CarouselRole;check?:{score:number;note:string;warnings:string[]};droppedPoints?:number};
const droppedOf=(data:unknown)=>{const value=(data as {droppedPoints?:unknown})?.droppedPoints;return typeof value==="number"&&value>0?{droppedPoints:value}:{};};
export type StudioMode="photo"|"ai"|"mix"|"free";
export type StudioPhase="idle"|"uploading"|"planning"|"cover"|"slides";
export type ReferenceUse="source"|"style";
// 실제 사진 캐러셀에 쓸 사진 한 장. id는 사진 보관함(asset library) id, preview는 서버가 줄여 준 JPEG(최대 1400px).
export type StudioPhoto={id:string;preview:string;name:string};
export const MAX_STUDIO_PHOTOS=10;
// preferredStyle: 한 달 기획이 추천한 디자인 계열. 새 초안의 계열 선택 기본값이 된다(사용자가 바꾸면 그쪽을 따른다).
export type GenerationInput={topic:string;imageBrief?:string;contentBrief?:string;slideCount:CarouselSlideCount;preferredStyle?:StyleId};
// "auto"면 구성안 AI가 글 분위기에 맞춰 추천한 글꼴을 쓰고, 아니면 사용자가 고른 글꼴로 덮어쓴다.
export type FontChoice<T extends string>="auto"|T;

export type GenerationState={
  key:string;                 // 초안(세션)마다 다른 값. 키가 바뀌면 상태를 새로 시작한다.
  input:GenerationInput;
  mode:StudioMode;
  imageStyle:ImageStyle;
  slideLayout:SlideLayout;
  titleFont:FontChoice<TitleFontId>;
  bodyFont:FontChoice<BodyFontId>;
  theme:FontChoice<ThemeId>;      // 게시물 테마. "auto"면 구성안(AI·서버)이 고른 테마.
  panorama:boolean;               // 표지+2장 파노라마를 쓸지(실제 사진 캐러셀, 표지 사진이 가로로 길 때만 화면에 보인다).
  season:FontChoice<SeasonMotif>; // 계절 소품(빗줄기·보름달·색동…). "auto"면 구성안이 고른 값(없으면 장식 없음).
  style:FontChoice<StyleId>;      // 디자인 계열(컬러 블록·신문·웹툰 등). "auto"면 구성안이 고른 계열.
  referenceUse:ReferenceUse;
  photoPreview:string;
  // 사진+AI 참고 사진이 글의 메뉴와 다를 때 안내(예: "과메기 글인데 삼합 사진이에요"). Gemini 키가 있을 때만 알 수 있다.
  referenceWarning:string;
  photoStatus:string;
  providerNotice:string;
  plan?:CarouselPlan;
  planFallback:boolean;      // AI가 구성안을 못 만들어 준비된 기본 문안으로 채웠는지. 표지 생성 전에 사용자가 다시 시도할 수 있게 멈춘다.
  planFallbackMessage:string; // 기본 문안으로 넘어간 이유(서버가 짧은 한국어로 보냄. 사용량 한도·키·형식 등). 모르면 빈 문자열.
  covers:ApprovedImage[];
  cover?:ApprovedImage;
  slides:ApprovedImage[];
  activeSlide:number;
  phase:StudioPhase;
  error:string;
  approved:boolean;
  refinements:Record<number,string>;
  photos:StudioPhoto[];          // 실제 사진 캐러셀에 쓸 사진(올린 순서 = 장에 배치되는 순서)
  photoAssignment:number[][];    // 장마다 들어간 사진 번호(photos 기준). 사진 바꾸기에 쓴다.
  photoViews:PhotoView[][];      // photoAssignment와 같은 모양: 그 칸의 사진을 얼마나 가까이 잘라 쓰는지. 없으면 사진 그대로.
  photoNotes:string[];           // photos와 같은 순서: 사진마다 보이는 것(사진 분석). 모르면 "". 문안(캡션)에도 넘긴다.
  referenceNote:string;          // 사진+AI 참고 사진에 보이는 것(사진 분석). 모르면 "".
  deckEdited:boolean;            // 사용자가 완성된 캐러셀에서 장을 빼거나 넣었는지. 그러면 장 수는 설정값이 아니라 지금 장 수다.
  deckStatus:string;             // 장을 빼고 넣은 뒤 장 번호를 다시 그리는 동안의 진행 안내.
  // 맨 뒤 가게 홍보 카드(사장님 결정: 모든 캐러셀 끝에 "묵동홍어마을" 홍보 카드 한 장, 이미지 AI 비용 없음).
  // include: 붙일지(장 고치기에서 끌 수 있음). image: 그려 둔 카드. key: 그릴 때의 디자인·장 수(바뀌면 다시 그린다).
  storeCard:{include:boolean;image?:ApprovedImage;key?:string;pending?:boolean};
  // 캐러셀을 다 그렸을 때의 디자인. 완성 뒤에 디자인 고르기를 바꿔도(다음에 만들 때부터 적용) 홍보 카드는 이미 그린 장과 같은 디자인으로 남는다.
  deckDesign?:DesignSpec;
};

const EMPTY_INPUT:GenerationInput={topic:"",slideCount:5};

export function initialGenerationState(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]):GenerationState {
  return {key,input,mode:"photo",imageStyle:"photo",slideLayout:DEFAULT_SLIDE_LAYOUT,titleFont:"auto",bodyFont:"auto",theme:"auto",season:"auto",panorama:false,style:input.preferredStyle??"auto",referenceUse:"source",photoPreview:"",referenceWarning:"",photoStatus:"",providerNotice:"",plan:undefined,planFallback:false,planFallbackMessage:"",covers:[],cover:undefined,slides:approvedImages,activeSlide:0,phase:"idle",error:"",approved:false,refinements:{},photos:[],photoAssignment:[],photoViews:[],photoNotes:[],referenceNote:"",
    // 저장된 초안을 다시 열었는데 장 수가 설정과 다르면(예전에 장을 고친 초안) 이미 고친 캐러셀로 본다.
    deckEdited:approvedImages.length>0&&approvedImages.length!==input.slideCount,deckStatus:"",
    // 저장된 초안을 다시 연 경우에는 이미 저장된 장(홍보 카드 포함)을 그대로 쓰므로 새로 붙이지 않는다.
    storeCard:{include:approvedImages.length===0}};
}

// 만든 것들만 비우고 모드·화풍·참고 사진은 남긴다(모드 카드나 표지 다시 만들기에서 쓰는 초기화).
const CLEARED:Partial<GenerationState>={plan:undefined,planFallback:false,planFallbackMessage:"",refinements:{},covers:[],cover:undefined,slides:[],activeSlide:0,approved:false,error:"",providerNotice:"",photoAssignment:[],photoViews:[],photoNotes:[],deckEdited:false,deckStatus:"",deckDesign:undefined};

let state:GenerationState=initialGenerationState("",EMPTY_INPUT);
// 늦게 도착한 응답을 버리기 위한 토큰. 새 작업이 시작되거나 상태가 초기화될 때마다 올라간다.
let run=0;
const listeners=new Set<()=>void>();

const getSnapshot=()=>state;
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
function replace(next:GenerationState){state=next;listeners.forEach(listener=>listener());}
function patch(next:Partial<GenerationState>){replace({...state,...next});}

export function useGenerationState():GenerationState {
  return useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
}

export function resetGenerationStore(){run++;replace(initialGenerationState("",EMPTY_INPUT));}

// 다른 초안으로 바뀌면 새로 시작하고, 같은 초안이면 진행 중인 상태를 그대로 이어 간다.
export function ensureGeneration(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]){
  if(state.key!==key){run++;replace(initialGenerationState(key,input,approvedImages));return;}
  if(state.input.topic!==input.topic||state.input.imageBrief!==input.imageBrief||state.input.contentBrief!==input.contentBrief||state.input.slideCount!==input.slideCount)patch({input});
}

export const activeSlideIndex=(current:GenerationState)=>Math.min(current.activeSlide,Math.max(current.slides.length-1,0));

// 같은 모드를 다시 고르면 아무것도 하지 않는다(예전에는 다 만든 캐러셀이 한 번 탭에 지워졌다). 다른 모드로 바꿀지는 화면이 먼저 묻는다.
export function chooseMode(next:StudioMode){if(next===state.mode)return;run++;patch({...CLEARED,mode:next,phase:"idle"});}
export function setImageStyle(imageStyle:ImageStyle){patch({imageStyle});}
export function setSlideLayout(slideLayout:SlideLayout){patch({slideLayout});}
export function setTitleFont(titleFont:FontChoice<TitleFontId>){patch({titleFont});}
export function setBodyFont(bodyFont:FontChoice<BodyFontId>){patch({bodyFont});}
export function setTheme(theme:FontChoice<ThemeId>){patch({theme});}
export function setSeason(season:FontChoice<SeasonMotif>){patch({season});}
// 파노라마 켜고 끄기는 다음에 캐러셀을 만들 때부터 적용된다(이미 만든 장은 그대로).
export function setPanorama(panorama:boolean){patch({panorama});}
// 이 장을 파노라마의 어느 쪽으로 그릴지. 표지와 2번째 장이 같은 사진(첫 칸)을 쓸 때만. 사진을 바꾸면 자연히 평소 디자인으로 돌아간다.
// slots: 이 장에 (새로) 넣을 사진 칸. 짝이 되는 장(표지↔2번째)의 첫 사진과 같으면 파노라마의 한쪽이다.
function panoramaSide(index:number,slots:number[]):"left"|"right"|undefined {
  if(!state.panorama||index>1)return undefined;
  const mine=slots[0],other=state.photoAssignment[1-index]?.[0];
  if(mine===undefined||mine!==other)return undefined;
  return index===0?"left":"right";
}
export function setStyle(style:FontChoice<StyleId>){patch({style});}

// 서버에 보낼 디자인: 구성안의 추천(palette·글꼴)에 사용자가 직접 고른 글꼴을 덮어쓴다.
// 요청을 보낼 때마다 계산하므로, 도중에 글꼴을 바꾸면 그다음에 만드는 장부터 적용된다.
export function effectiveDesign(design:DesignSpec,current:Pick<GenerationState,"titleFont"|"bodyFont">&{theme?:FontChoice<ThemeId>;style?:FontChoice<StyleId>;season?:FontChoice<SeasonMotif>}=state):DesignSpec {
  return {...design,...(current.season&&current.season!=="auto"?{season:current.season}:{}),...(current.titleFont!=="auto"?{titleFont:current.titleFont}:{}),...(current.bodyFont!=="auto"?{bodyFont:current.bodyFont}:{}),...(current.theme&&current.theme!=="auto"?{theme:current.theme}:{}),...(current.style&&current.style!=="auto"?{style:current.style}:{})};
}
// 장마다 AI가 고른 글꼴도 사용자가 직접 고른 글꼴이 있으면 덮어쓴다(직접 고른 글꼴은 모든 장에 같게 적용).
export function effectiveSlide<T extends {titleFont?:string;bodyFont?:string}>(slide:T,current:Pick<GenerationState,"titleFont"|"bodyFont">=state):T {
  return {...slide,...(current.titleFont!=="auto"?{titleFont:current.titleFont}:{}),...(current.bodyFont!=="auto"?{bodyFont:current.bodyFont}:{})};
}
export function setReferenceUse(referenceUse:ReferenceUse){patch({referenceUse});}
export function setRefinement(index:number,value:string){patch({refinements:{...state.refinements,[index]:value}});}
export function setActiveSlide(activeSlide:number){patch({activeSlide});}
export function selectCover(candidate:ApprovedImage){patch({cover:candidate,slides:[],activeSlide:0,approved:false});}
export function markApproved(){patch({approved:true});}

const readPreview=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==="string"?resolve(reader.result):reject(new Error());reader.onerror=()=>reject(new Error());reader.readAsDataURL(file);});
// 문안(캡션)에 넘길 "게시물에 실제로 들어간 사진에 보이는 것". 실제 사진 캐러셀은 장에 들어간 사진 순서대로(같은 사진은 한 번),
// 사진+AI는 참고 사진 한 장(표지가 이 사진의 음식을 살린다). 아는 것이 없으면 undefined.
export function deckPhotoNotes(current:Pick<GenerationState,"mode"|"photoAssignment"|"photoNotes"|"referenceNote"|"slides">):string[]|undefined {
  if(current.mode==="mix")return current.referenceNote?[current.referenceNote]:undefined;
  if(current.mode!=="photo"||!current.slides.length)return undefined;
  const order=[...new Set(current.photoAssignment.flat())];
  const notes=order.map(index=>current.photoNotes[index]?.trim()).filter((note):note is string=>Boolean(note));
  return notes.length?notes.slice(0,10):undefined;
}

// 사진+AI의 참고 사진은 장마다 요청에 실려 가므로, 휴대폰 원본(수 MB) 그대로 보내지 않고 긴 변 2048px JPEG로 줄인다.
// 이미지 AI도 어차피 줄여서 쓴다(Higgsfield 1536px, Cloudflare 512px). 줄일 수 없는 환경(오래된 브라우저)은 원본을 쓴다.
export const REFERENCE_MAX_SIDE=2048;
async function readReference(file:File):Promise<string> {
  if(typeof createImageBitmap!=="function"||typeof document==="undefined")return readPreview(file);
  let bitmap:ImageBitmap|undefined;
  try{
    // from-image: 휴대폰 사진의 회전 정보(EXIF)를 반영해 바로 세운다.
    bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    const scale=Math.min(1,REFERENCE_MAX_SIDE/Math.max(bitmap.width,bitmap.height));
    if(scale===1&&file.size<=2*1024*1024)return readPreview(file);
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const context=canvas.getContext("2d");
    if(!context)return readPreview(file);
    // 투명한 PNG가 JPEG로 바뀌며 검게 되지 않도록 흰 바탕을 먼저 깐다.
    context.fillStyle="#ffffff";context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.9);
  }catch{
    return readPreview(file);
  }finally{
    bitmap?.close();
  }
}

// 카드에 찍는 전체 장 수("3 / 7"의 7). 장을 고친 캐러셀은 지금 장 수, 아니면 설정한 장 수.
export const deckTotal=(current:GenerationState)=>current.deckEdited?current.slides.length:current.input.slideCount;
// 캐러셀이 다 만들어졌는지(장 빼기·넣기 뒤에는 장 수가 설정값과 달라도 완성).
export const deckComplete=(current:GenerationState)=>current.slides.length>0&&(current.deckEdited||current.slides.length===current.input.slideCount);
// 홍보 카드를 붙이는 캐러셀인지: 구성안으로 그린 캐러셀(실제 사진 카드·AI)만. 무료 카드·사진 그대로는 붙이지 않는다.
// 인스타그램 캐러셀·초안 저장은 한 게시물에 10장까지라, 내용이 10장이면 홍보 카드를 붙이지 않는다(9장 이하일 때만).
// 9↔10장을 오가도 전체 장 수가 10으로 같아 장 번호를 다시 그릴 필요가 없다.
export const STORE_CARD_MAX_CONTENT=9;
export const storeCardOn=(current:GenerationState)=>current.storeCard.include&&Boolean(current.plan)&&current.mode!=="free"&&deckTotal(current)<=STORE_CARD_MAX_CONTENT;
// 게시물 전체 장 수(홍보 카드 포함). 카드에 찍히는 장 번호 "n / 전체"가 이 수를 쓴다.
export const postTotal=(current:GenerationState)=>deckTotal(current)+(storeCardOn(current)?1:0);
// "이 캐러셀 사용"으로 넘길 이미지: 내용 장 + (붙였으면) 맨 뒤 홍보 카드.
// 홍보 카드 그림이 지금 디자인·장 수로 그린 것일 때만 붙인다(다시 그리기에 실패해 옛 장 번호가 남은 카드는 빼고).
const deckDesignOf=(current:GenerationState)=>current.plan?current.deckDesign??effectiveDesign(current.plan.design,current):undefined;
const storeCardKey=(current:GenerationState)=>current.plan?JSON.stringify([deckDesignOf(current),postTotal(current)]):"";
// 캐러셀을 다 그린 직후(또는 장 번호를 다시 그린 직후) 그 디자인을 기억하고 홍보 카드를 맞춘다.
function finishDeck(){
  if(state.plan&&deckComplete(state))patch({deckDesign:effectiveDesign(state.plan.design)});
  void ensureStoreCard();
}
export const approvedDeck=(current:GenerationState):ApprovedImage[]=>[...current.slides,...(storeCardOn(current)&&current.storeCard.image&&current.storeCard.key===storeCardKey(current)?[current.storeCard.image]:[])];
// 홍보 카드를 그리는 중인지. 그리는 동안 "이 캐러셀 사용"을 막는다(카드에는 이미 "n / 전체+1"이 찍혀 있어 빠지면 장 번호가 어긋난다).
export const storeCardPending=(current:GenerationState)=>storeCardOn(current)&&Boolean(current.storeCard.pending);
let storeRun=0;
// 홍보 카드를 (다시) 그린다. 디자인·장 수가 그대로면 그려 둔 것을 쓴다. 실패해도 캐러셀은 그대로 쓸 수 있게 조용히 넘어간다.
export async function ensureStoreCard(){
  if(!storeCardOn(state)||!deckComplete(state)||!state.plan)return;
  const design=deckDesignOf(state)!,total=postTotal(state);
  const key=storeCardKey(state);
  if(state.storeCard.image&&state.storeCard.key===key)return;
  const mine=++storeRun;
  patch({storeCard:{...state.storeCard,pending:true}});
  let image:string|undefined;
  try{
    const response=await fetch("/api/images/store-card",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({design,index:total,total})});
    const data=await readJsonResponse(response);
    if(response.ok&&typeof data.image==="string")image=data.image;
  }catch{/* 아래에서 안내한다. */}
  if(mine!==storeRun)return;
  if(image)patch({storeCard:{...state.storeCard,pending:false,image:{id:crypto.randomUUID(),preview:image,source:"design"},key}});
  // 홍보 카드는 덤이라 못 그려도 캐러셀은 쓸 수 있게 둔다. 다만 장 번호가 한 장 많게 찍혀 있으니 끄면 맞춰진다고 알린다.
  else patch({storeCard:{...state.storeCard,pending:false},providerNotice:"가게 홍보 카드를 그리지 못했어요. 장 고치기에서 홍보 카드를 껐다 켜거나, 끄면 장 번호가 맞춰져요."});
}
// 장 고치기의 "맨 뒤 가게 홍보 카드" 켜고 끄기. 전체 장 수가 바뀌므로 내용 장의 장 번호를 다시 그린다.
export async function setStoreCardIncluded(include:boolean){
  if(state.storeCard.include===include||state.phase!=="idle")return;
  patch({storeCard:{...state.storeCard,include},approved:false});
  if(!state.plan||!deckComplete(state))return;
  const token=++run;
  patch({phase:"slides",deckStatus:"장 번호를 맞추는 중"});
  try{await redrawDeck(token);}finally{if(token===run)patch({phase:"idle",deckStatus:""});}
}
// 서버가 보낸 "기본 문안으로 넘어간 이유". 예전 서버 응답에는 없으므로 빈 문자열.
const fallbackMessageOf=(data:unknown)=>{const message=(data as {fallbackMessage?:unknown})?.fallbackMessage;return typeof message==="string"?message.slice(0,120):"";};
function requestBase(){const {topic,imageBrief}=state.input;return {topic,...(imageBrief?{imageBrief}:{}),slideTotal:postTotal(state),...(state.deckEdited?{deckEdited:true}:{}),...(storeCardOn(state)?{storeCard:true}:{}),imageStyle:state.imageStyle,slideLayout:state.slideLayout};}
// 참고 사진(mix)이 있으면 그것을, 아니면 고른 표지의 글자 없는 원본을 이어 가기용으로 붙인다.
// 사진+AI의 "음식 그대로"는 표지에만 쓴다. 2장부터 같은 사진을 "음식 모양 그대로"로 보내면 장 글(젓가락으로 한 점,
// 막걸리 상차림 등)과 상관없이 거의 같은 접시가 반복됐다. 나머지 장은 사장님 사진의 색감·조명만 이어 가고 장면은 장 글대로 만든다.
export function referenceFieldsFor(role:CarouselRole|undefined,current:Pick<GenerationState,"mode"|"photoPreview"|"referenceUse"|"cover">=state){
  if(current.mode==="mix")return {referenceImage:current.photoPreview,referenceMode:role==="cover"?current.referenceUse:"style" as const};
  return current.cover?.referencePreview?{referenceImage:current.cover.referencePreview,referenceMode:"continuity" as const}:{};
}
const sourceOf=(reported?:string)=>(reported??(state.mode==="mix"?"ai-edited":"ai-generated")) as ApprovedImage["source"];

// 사진+AI 참고 사진이 글의 메뉴와 맞는지 AI로 한 번 본다(실제 사진 사용의 "메뉴 다름"과 같은 검사). 표지는 이 사진의 음식을
// 그대로 살리므로, 과메기 글에 삼합 사진이면 글과 그림이 어긋난다. 막지는 않고 알려만 준다. 실패하면 조용히 넘어간다.
async function checkReference(preview:string){
  if(preview.length>8_000_000)return;
  try{
    const response=await fetch("/api/images/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photos:[{id:"reference",image:preview}],describe:true,...(state.input.topic?{topic:state.input.topic.slice(0,200)}:{})})});
    if(!response.ok)return;
    const parsed=AnalyzeResponseSchema.safeParse(await readJsonResponse(response));
    const mismatch=parsed.success?parsed.data.photos[0]?.mismatch:null;
    // 그사이 다른 참고 사진으로 바꿨으면 버린다.
    if(parsed.success&&state.photoPreview===preview)patch({referenceNote:photoNote(parsed.data.photos[0])});
    if(mismatch&&state.photoPreview===preview)patch({referenceWarning:`${mismatch}. 표지는 이 사진의 음식을 살려 만들어요. 맞는 사진으로 바꾸거나 '화풍·분위기만'을 골라 주세요.`});
  }catch{/* 안내는 보조 기능 */}
}

export async function uploadPhoto(file:File|undefined,onApprove:(images:ApprovedImage[])=>void,reference=state.mode==="mix"){
  if(!file)return;
  const token=++run;
  patch({phase:"uploading",error:""});
  try{
    const preview=reference?await readReference(file):await readPreview(file);
    if(token!==run)return;
    patch({photoPreview:preview,referenceWarning:"",referenceNote:""});
    const body=new FormData();body.append("file",file);
    const response=await fetch("/api/media/upload",{method:"POST",body});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message);
    patch({photoStatus:`${file.name} ${reference?"참고 사진을":"사진을"} 저장했어요.`});
    if(reference)void checkReference(preview);
    if(!reference)onApprove([{id:data.id,preview,source:"photo"}]);
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"사진을 저장하지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

export async function requestCovers(nextPlan:CarouselPlan|undefined=state.plan,token=++run){
  if(!nextPlan)return;
  patch({phase:"cover",error:""});
  try{
    const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:effectiveSlide(nextPlan.slides[0]),styleAnchor:nextPlan.styleAnchor,design:effectiveDesign(nextPlan.design),slideIndex:1,count:2,...(state.refinements[0]?.trim()?{refinement:state.refinements[0].trim()}:{}),...(state.mode==="mix"?{referenceImage:state.photoPreview,referenceMode:state.referenceUse}:{})})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"표지 후보를 만들지 못했습니다.");
    if(!Array.isArray(data.images)||data.images.length!==2)throw new Error("표지 후보는 정확히 2장이 필요합니다.");
    const source=sourceOf(data.source);
    patch({...(data.fallback?{providerNotice:data.notice??"처음 고른 이미지 AI가 실패해 다른 AI로 전환했어요."}:{}),covers:data.images.map((preview:string,i:number)=>({id:crypto.randomUUID(),preview,referencePreview:data.referenceImages?.[i],...(data.baseImages?.[i]?{bases:data.baseImages[i]}:{}),source,role:nextPlan.slides[0].role,...(data.checks?.[i]?{check:data.checks[i]}:{})}))});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"표지 후보를 만들지 못했습니다."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// 서버가 구성안 문안을 한 번 더 검수해 고쳤으면(planReview.ts) 몇 곳을 다듬었는지 한 줄로 알려 준다.
function reviewNotice(review?:{applied?:boolean;before?:number;after?:number}|null):Partial<GenerationState> {
  if(!review?.applied)return {};
  const fixed=Math.max(0,(review.before??0)-(review.after??0));
  return {providerNotice:fixed?`AI가 카드 문안을 한 번 더 검수해 ${fixed}곳을 다듬었어요.`:"AI가 카드 문안의 흐름을 한 번 더 다듬었어요."};
}

export async function startPlan(){
  const token=++run;
  patch({...CLEARED,phase:"planning"});
  try{
    const {topic,imageBrief,contentBrief,slideCount}=state.input;
    const response=await fetch("/api/images/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,...(imageBrief?{imageBrief}:{}),...(contentBrief?{contentBrief}:{}),slideCount,imageStyle:state.imageStyle})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"구성안을 만들지 못했습니다.");
    const next=data.plan as CarouselPlan;
    // 기본 문안은 주제와 무관한 일반 문장이라, 그걸로 이미지를 만들어 크레딧을 쓰기 전에 멈추고 알린다.
    if(data.provider==="fallback"){patch({plan:next,planFallback:true,planFallbackMessage:fallbackMessageOf(data),phase:"idle"});return;}
    patch({plan:next,planFallback:false,planFallbackMessage:"",...reviewNotice(data.review)});
    void requestCovers(next,token);
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"구성안을 만들지 못했습니다.",phase:"idle"});
  }
}

async function generate(slide:CarouselPlan["slides"][number],index:number,refinement=""):Promise<ApprovedImage>{
  // 콜라주형은 사진 세 장을 만들어 한 카드에 넣는다. 서버는 합친 카드 한 장만 돌려준다.
  // 디자인 계열(기본 템플릿 아님)은 한 장에 사진을 두 장까지만 그린다. 그 이상 만들면 돈만 들고 안 쓰인다.
  const style=effectiveDesign(state.plan!.design).style;
  const count=state.slideLayout==="card"?Math.min(Math.max(1,photosNeeded(normalizeCardLayout(slide))),!style||style==="template"?3:2):1;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:effectiveSlide(slide),styleAnchor:state.plan!.styleAnchor,design:effectiveDesign(state.plan!.design),slideIndex:index,count,...(refinement.trim()?{refinement:refinement.trim()}:{}),...referenceFieldsFor(slide.role)})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"이미지를 만들지 못했습니다.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("슬라이드 이미지는 정확히 1장이 필요합니다.");
  if(data.fallback)patch({providerNotice:data.notice??"처음 고른 이미지 AI가 실패해 다른 AI로 전환했어요."});
  return {id:crypto.randomUUID(),preview:data.images[0],referencePreview:data.referenceImages?.[0],...(data.baseImages?.[0]?{bases:data.baseImages[0]}:{}),source:sourceOf(data.source),role:slide.role,...droppedOf(data)};
}

// 한 번에 만드는 AI 장 수. 이미지 AI(Higgsfield·Cloudflare·OpenAI)가 동시에 받아 주는 범위 안에서 두 장.
const SLIDE_CONCURRENCY=2;
// 고른 표지 뒤의 남은 장을 만든다. 화면이 사라져도 이 루프는 계속 돌고 결과는 저장소에 쌓인다.
export async function finishSlides(){
  const {plan,cover,slides,input}=state;
  // 장을 빼거나 넣은 뒤에는 설정 장 수까지 다시 채우지 않는다(사용자가 고른 장 수를 지킨다).
  if(!plan||!cover||state.deckEdited)return;
  const token=++run;
  let next=slides[0]?.id===cover.id?slides:[cover];
  patch({phase:"slides",error:"",slides:next});
  try{
    // 장끼리는 서로 기다릴 필요가 없어(표지만 참고) 두 장씩 동시에 만든다. 10장이면 기다리는 시간이 거의 절반이 된다.
    // 화면에는 순서대로만 붙인다: 앞 장이 끝나기 전에 뒤 장이 먼저 오면 잠시 들고 있다가 앞 장이 오면 함께 붙인다.
    const ready=new Map<number,ApprovedImage>();
    let cursor=next.length,failure:unknown=null;
    const worker=async()=>{
      while(cursor<input.slideCount&&failure===null){
        const i=cursor++;
        try{
          const generated=await generate(plan.slides[i],i+1);
          if(token!==run)return;
          ready.set(i,generated);
          const add:ApprovedImage[]=[];
          while(ready.has(next.length+add.length)){add.push(ready.get(next.length+add.length)!);}
          if(add.length){next=[...next,...add];patch({slides:next});}
        }catch(error){failure??=error;}
      }
    };
    await Promise.all(Array.from({length:SLIDE_CONCURRENCY},worker));
    if(token!==run)return;
    if(failure!==null)throw failure;
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"남은 슬라이드를 만들지 못했습니다."});
  }finally{
    if(token===run){patch({phase:"idle"});finishDeck();}
  }
}

export async function regenerateSlide(){
  const {plan,cover}=state;
  if(!plan||!cover)return;
  const index=activeSlideIndex(state),token=++run;
  patch({phase:"slides",error:""});
  try{
    const replacement=await generate(plan.slides[index],index+1,state.refinements[index]);
    if(token!==run)return;
    patch({slides:state.slides.map((item,i)=>i===index?replacement:item),...(index===0?{cover:replacement}:{}),approved:false});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"이 장을 다시 만들지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// ── 실제 사진 여러 장으로 만드는 캐러셀 ──────────────────────────────────────────
// 사진은 사진 보관함(/api/images/assets)에 저장해 다음 게시물에서도 다시 고를 수 있게 한다.
// 보관함이 돌려주는 미리보기(최대 1400px JPEG, 회전 보정됨)를 카드 그리기에 그대로 쓴다.

// 사진 한 장을 보관함에 저장하고 스튜디오 사진 형태로 돌려준다(사진 캐러셀 올리기·장 추가에서 함께 쓴다).
async function uploadStudioPhoto(file:File):Promise<StudioPhoto>{
  const body=new FormData();
  body.append("file",file);
  // 보관함 검색용 이름·검색어. 이름은 파일명, 검색어는 지금 주제("주제:" 표시).
  // 주제는 "이 사진을 올릴 때 쓰던 글"일 뿐 사진 속 음식이 아니다. 예전엔 주제를 그냥 태그로 붙여서, 과메기 글을 쓰다 올린
  // 삼합 사진이 "과메기" 사진처럼 쌓였다. "주제:"를 붙여 두면 사진·메뉴 불일치 검사(photoAnalysis.ts)가 이 태그를 믿지 않는다.
  body.append("name",file.name.replace(/\.[a-z0-9]+$/i,"").slice(0,60)||"매장 사진");
  body.append("tags",[...(state.input.topic.trim()?[`${TOPIC_TAG}${state.input.topic.trim()}`.slice(0,24)]:[]),"매장 사진"].join(","));
  body.append("kind","photo");
  body.append("credit","묵동홍어마을 직접 촬영");
  const response=await fetch("/api/images/assets",{method:"POST",body});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"사진을 저장하지 못했어요.");
  return {id:data.asset.id,preview:data.asset.preview,name:data.asset.name};
}

export async function addPhotos(files:File[]){
  const room=MAX_STUDIO_PHOTOS-state.photos.length;
  const picked=files.filter(file=>file.type.startsWith("image/")).slice(0,Math.max(0,room));
  if(!picked.length){if(files.length&&room<=0)patch({error:`사진은 ${MAX_STUDIO_PHOTOS}장까지 쓸 수 있어요.`});return;}
  const token=++run;
  patch({phase:"uploading",error:""});
  try{
    for(const [i,file] of picked.entries()){
      patch({photoStatus:`사진 저장 중 ${i+1}/${picked.length}`});
      const photo=await uploadStudioPhoto(file);
      if(token!==run)return;
      patch({photos:[...state.photos,photo],...CLEARED});
    }
    patch({photoStatus:`사진 ${state.photos.length}장 준비됐어요.`});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"사진을 저장하지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// 보관함에서 고른 사진을 더한다(이미 넣은 사진은 건너뛴다).
export function addLibraryPhoto(photo:StudioPhoto){
  if(state.photos.some(item=>item.id===photo.id))return;
  if(state.photos.length>=MAX_STUDIO_PHOTOS){patch({error:`사진은 ${MAX_STUDIO_PHOTOS}장까지 쓸 수 있어요.`});return;}
  run++;
  patch({photos:[...state.photos,photo],...CLEARED});
}
export function removePhoto(index:number){run++;patch({photos:state.photos.filter((_,i)=>i!==index),...CLEARED});}
// 사진 순서 바꾸기(앞으로 한 칸). 첫 사진이 표지가 된다.
export function movePhotoForward(index:number){
  if(index<=0)return;
  const photos=[...state.photos];
  [photos[index-1],photos[index]]=[photos[index],photos[index-1]];
  run++;patch({photos,...CLEARED});
}

// 칸마다 자르는 거리(가까이·결 확대)가 하나라도 있으면 함께 보낸다. 모두 "사진 그대로"면 보내지 않는다.
const viewsField=(views:readonly PhotoView[]|undefined)=>views?.some(view=>view!=="full")?{photoViews:[...views]}:{};
async function composePhotoSlide(plan:CarouselPlan,index:number,slots:number[],views?:readonly PhotoView[]):Promise<ApprovedImage>{
  const slide=plan.slides[index];
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slideLayout:"card",slide:effectiveSlide(slide),styleAnchor:plan.styleAnchor,design:effectiveDesign(plan.design),slideIndex:index+1,count:1,...(slots.length?{photos:slots.map(i=>state.photos[i].preview),...viewsField(views)}:{}),...(panoramaSide(index,slots)?{panorama:panoramaSide(index,slots)}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"카드를 만들지 못했어요.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
  return {id:crypto.randomUUID(),preview:data.images[0],source:slots.length?"photo":"design",role:slide.role,...droppedOf(data)};
}

// 구성안을 만들고, 사진 수에 맞게 장을 조정한 뒤, 장마다 카드를 그린다. AI 이미지는 만들지 않는다.
// options.panorama: 표지+2장 파노라마로 만들지. 화면이 "표지 사진이 가로로 긴지"(사진 분석)를 확인하고 넘긴다.
// 넘기지 않으면 끈다(가로로 짧은 사진이면 2번째 장에 같은 사진만 한 번 더 나오게 되므로).
// 사진마다 보이는 것(음식·장면) 한 줄. Gemini 키가 있으면 AI가 사진을 읽고, 없으면 보관함 이름·태그로만 안다(무료).
// 실패하거나 모르면 빈 문자열이라 예전처럼 올린 순서대로 배치한다.
async function describePhotos(photos:StudioPhoto[],topic:string):Promise<string[]> {
  try{
    const response=await fetch("/api/images/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photos:photos.map(photo=>({id:photo.id})),describe:true,...(topic?{topic:topic.slice(0,200)}:{})})});
    if(!response.ok)return photos.map(()=>"");
    const parsed=AnalyzeResponseSchema.safeParse(await readJsonResponse(response));
    if(!parsed.success)return photos.map(()=>"");
    return photos.map(photo=>photoNote(parsed.data.photos.find(item=>item.id===photo.id)));
  }catch{return photos.map(()=>"");}
}

export async function buildPhotoCarousel(options:{panorama?:boolean}={}){
  if(!state.photos.length)return;
  const token=++run;
  patch({...CLEARED,phase:"planning",slideLayout:"card",panorama:options.panorama===true});
  try{
    const {topic,imageBrief,contentBrief,slideCount}=state.input;
    // 1) 사진에 무엇이 보이는지 읽어 문안 AI에게 알려 준다(사진에 없는 음식을 주인공으로 한 장을 쓰지 않게).
    const photos=state.photos;
    const notes=await describePhotos(photos,topic);
    if(token!==run)return;
    patch({photoNotes:notes});
    const photoNotes=notes.some(Boolean)?notes:undefined;
    const response=await fetch("/api/images/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,...(imageBrief?{imageBrief}:{}),...(contentBrief?{contentBrief}:{}),slideCount,imageStyle:"photo",...(photoNotes?{photoNotes}:{})})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"구성안을 만들지 못했습니다.");
    // 디자인 계열(칠판·한지 등)은 한 장에 사진을 두 장까지만 그려서, 세 장짜리 콜라주는 기본 템플릿일 때만 만든다.
    const style=effectiveDesign((data.plan as CarouselPlan).design).style;
    const fitted=(state.panorama?fitPanorama:fitPlanToPhotos)(data.plan as CarouselPlan,photos.length,{maxPerSlide:!style||style==="template"?3:2});
    // 2) 장마다 사진 칸 수는 그대로 두고, 사진 내용이 그 장의 글과 맞는 사진을 넣는다(표지는 첫 사진 그대로).
    const matched=photoNotes?{...fitted,...matchPhotosToSlides(fitted.plan,fitted.assignment,notes)}:fitted;
    // 3) 사진이 모자라 글자 카드로 남은 장에는 같은 사진을 "가까이"·"결 확대"로 다시 쓴다(사진 한 장이 최대 세 장면).
    const fit=fillWithPhotoViews(matched.plan,matched.assignment,photos.length,notes);
    // 기본 문안이어도 비용이 들지 않으니 멈추지 않고, 안내만 남긴다.
    patch({plan:fit.plan,planFallback:data.provider==="fallback",planFallbackMessage:data.provider==="fallback"?fallbackMessageOf(data):"",photoAssignment:fit.assignment,photoViews:fit.views,phase:"slides",...reviewNotice(data.review)});
    let next:ApprovedImage[]=[];
    for(let i=0;i<fit.plan.slides.length;i++){
      const card=await composePhotoSlide(fit.plan,i,fit.assignment[i],fit.views[i]);
      if(token!==run)return;
      next=[...next,card];
      patch({slides:next,...(i===0?{cover:card}:{})});
    }
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"사진 캐러셀을 만들지 못했어요."});
  }finally{
    if(token===run){patch({phase:"idle"});finishDeck();}
  }
}

// 사진 캐러셀이 중간에 멈췄는지(서버 재시작·502·사진 한 장 오류). 이때는 남은 장만 이어 그릴 수 있다.
export const photoDeckIncomplete=(current:GenerationState)=>current.mode==="photo"&&Boolean(current.plan)&&!current.deckEdited&&current.slides.length>0&&current.slides.length<(current.plan?.slides.length??0);
// 멈춘 사진 캐러셀의 남은 장만 이어서 그린다. 구성안·사진 배치는 그대로 쓰고, 이미 그린 장은 다시 그리지 않는다.
export async function resumePhotoCarousel(){
  const {plan}=state;
  if(!plan||state.phase!=="idle"||!photoDeckIncomplete(state))return;
  const token=++run;
  patch({phase:"slides",error:""});
  let next=state.slides;
  try{
    for(let i=next.length;i<plan.slides.length;i++){
      const card=await composePhotoSlide(plan,i,state.photoAssignment[i]??[],state.photoViews[i]);
      if(token!==run)return;
      next=[...next,card];
      patch({slides:next,...(i===0?{cover:card}:{})});
    }
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"남은 장을 만들지 못했어요."});
  }finally{
    if(token===run){patch({phase:"idle"});finishDeck();}
  }
}

// 지금 보고 있는 장의 사진(첫 칸)을 다른 사진으로 바꾸고 그 장만 다시 그린다.
export async function swapSlidePhoto(photoIndex:number){
  const {plan,photoAssignment}=state;
  const index=activeSlideIndex(state);
  if(!plan||!photoAssignment[index]?.length)return;
  const slots=swapPhoto(photoAssignment[index],photoIndex);
  // 파노라마(표지+2장)의 짝이 바뀌면(풀리거나 다시 맞춰지거나) 짝이 된 다른 장도 다시 그린다(반쪽 사진만 남지 않게).
  // 예전에는 바꾸기 전 짝만 봐서, 2번째 장 사진을 바꿨다가 표지 사진으로 되돌리면 2번째 장만 반쪽으로 그려졌다.
  const partner=index<=1&&(panoramaSide(index,photoAssignment[index])||panoramaSide(index,slots))?1-index:-1;
  const token=++run;
  patch({phase:"slides",error:""});
  try{
    // 사진을 직접 바꾼 장은 사진 그대로 쓴다(가까이·결 확대는 사진이 모자랄 때 자동으로만).
    const card=await composePhotoSlide(plan,index,slots);
    if(token!==run)return;
    patch({slides:state.slides.map((item,i)=>i===index?card:item),photoAssignment:state.photoAssignment.map((item,i)=>i===index?slots:item),photoViews:state.slides.map((_,i)=>i===index?slots.map(()=>"full" as const):state.photoViews[i]??[]),...(index===0?{cover:card}:{}),approved:false});
    if(partner>=0&&state.photoAssignment[partner]){
      const other=await composePhotoSlide(plan,partner,state.photoAssignment[partner],state.photoViews[partner]);
      if(token!==run)return;
      patch({slides:state.slides.map((item,i)=>i===partner?other:item),...(partner===0?{cover:other}:{})});
    }
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"사진을 바꾸지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// ── 카드 글자 직접 고치기 ──────────────────────────────────────────────────────
// 완성된 장의 제목·요점만 바꿔 그 장을 다시 그린다. 이미지 AI를 부르지 않아 비용이 없다.
// 밑바탕: 실제 사진 캐러셀은 그 장에 배정된 사장님 사진(보정 포함), AI 캐러셀은 서버가 돌려준 글자 없는 원본(보정 없음),
// 사진이 없는 레이아웃(브라우저·Q&A·대형 숫자)은 밑바탕 없이 그린다.
export type SlideTextEdit={headline:string;points:string[]};

// 구성안 스키마와 같은 한도(제목 42자, 요점 4줄·줄마다 40자)로 확인한다. 문제가 없으면 null.
export function slideTextProblem(edit:SlideTextEdit):string|null {
  const headline=edit.headline.trim();
  if(!headline)return "제목을 적어 주세요.";
  if(headline.length>42)return `제목은 42자까지예요(지금 ${headline.length}자).`;
  const points=edit.points.map(point=>point.trim()).filter(Boolean);
  if(points.length>SLIDE_POINT_MAX_COUNT)return `요점은 ${SLIDE_POINT_MAX_COUNT}줄까지예요.`;
  const long=points.findIndex(point=>point.length>SLIDE_POINT_MAX_LENGTH);
  if(long>=0)return `${long+1}번째 요점이 ${SLIDE_POINT_MAX_LENGTH}자를 넘어요(지금 ${points[long].length}자).`;
  return null;
}

// 이 장의 밑바탕을 고른다. 다시 그릴 수 없으면(예: 저장된 초안에서 연 AI 카드) null.
// photoKind: 사장님 사진이면 "real"(전체 보정), AI가 만든 밑바탕이면 "ai"(처음 그릴 때와 같은 약한 보정).
function textEditBase(current:GenerationState,index:number):{photos:string[];photoKind:"real"|"ai"|"none";views?:PhotoView[]}|null {
  const slide=current.plan?.slides[index];
  if(!slide||!current.slides[index])return null;
  const slots=current.photoAssignment[index];
  if(slots?.length)return {photos:slots.map(i=>current.photos[i]?.preview).filter((preview):preview is string=>!!preview),photoKind:"real",views:current.photoViews[index]};
  if(current.slideLayout==="card"&&photosNeeded(normalizeCardLayout(slide))===0)return {photos:[],photoKind:"none"};
  const bases=current.slides[index].bases;
  return bases?.length?{photos:bases,photoKind:"ai"}:null;
}
export const canEditSlideText=(current:GenerationState,index:number)=>textEditBase(current,index)!==null;

// 밑바탕(사진·AI 원본·없음)으로 한 장을 다시 그린다. 이미지 AI를 부르지 않는다(비용 없음).
// 장 번호·전체 장 수는 지금 상태(deckTotal)를 따른다.
async function renderCard(index:number,slide:CarouselPlan["slides"][number],base:{photos:string[];photoKind:"real"|"ai"|"none";views?:readonly PhotoView[]}):Promise<{preview:string;droppedPoints?:number}>{
  const plan=state.plan!;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:effectiveSlide(slide),styleAnchor:plan.styleAnchor,design:effectiveDesign(plan.design),slideIndex:index+1,count:1,...(base.photos.length?{photos:base.photos,photoKind:base.photoKind,...(base.photoKind==="real"?viewsField(base.views):{})}:{}),...(base.photoKind==="real"&&panoramaSide(index,state.photoAssignment[index]??[])?{panorama:panoramaSide(index,state.photoAssignment[index]??[])}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"카드를 다시 그리지 못했어요.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
  return {preview:data.images[0],...droppedOf(data)};
}

export async function editSlideText(index:number,edit:SlideTextEdit){
  const {plan}=state;
  const base=textEditBase(state,index);
  if(!plan||!base)return;
  const problem=slideTextProblem(edit);
  if(problem){patch({error:problem});return;}
  const slide={...plan.slides[index],headline:edit.headline.trim(),points:edit.points.map(point=>point.trim()).filter(Boolean)};
  const token=++run;
  patch({phase:"slides",error:""});
  try{
    const card=await renderCard(index,slide,base);
    if(token!==run)return;
    // 출처(실제 사진/AI)와 밑바탕은 그대로 두고 그림만 바꾼다. 구성안도 고친 글자로 바꿔 캡션이 같은 흐름을 따르게 한다.
    const updated={...state.slides[index],id:crypto.randomUUID(),preview:card.preview,droppedPoints:card.droppedPoints};
    patch({plan:{...plan,slides:plan.slides.map((item,i)=>i===index?slide:item)},slides:state.slides.map((item,i)=>i===index?updated:item),...(index===0?{cover:updated}:{}),approved:false});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"카드를 다시 그리지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// ── 초안 고치기: 장 빼기·넣기 ─────────────────────────────────────────────────────────
// 완성된 캐러셀(또는 저장된 초안을 다시 연 것)에서 장을 빼거나 새 장을 끼워 넣는다. 최대 10장(인스타 캐러셀 한도).
// 카드마다 "3 / 7" 같은 장 번호가 그림에 박혀 있으므로, 장 수나 순서가 바뀌면 나머지 장을 밑바탕으로 다시 그린다
// (이미지 AI는 부르지 않아 비용이 없다). 밑바탕이 없는 장(저장된 초안을 다시 연 경우 등)은 그대로 두고 안내만 한다.
export const MAX_DECK_SLIDES=10;
export type NewSlideSource="photo"|"ai"|"text"|"raw";
// verbatim: 적은 글을 카드 문구로 그대로 쓴다. 아니면 적은 글을 "이런 장을 만들어 줘"라는 요청으로 읽어 문안 AI가 문구·장면을 짓는다.
export type NewSlide={headline:string;points:string[];source:NewSlideSource;photo?:StudioPhoto;verbatim?:boolean};

// 장 번호가 바뀐 장을 차례로 다시 그린다. skip은 방금 새로 그린 장(다시 그릴 필요 없음).
async function redrawDeck(token:number,skip=-1){
  const total=state.slides.length;
  let missed=0;
  for(let i=0;i<total;i++){
    if(i===skip)continue;
    const base=state.plan?textEditBase(state,i):null;
    if(!base||!state.plan?.slides[i]){missed++;continue;}
    patch({deckStatus:`장 번호를 맞추는 중 ${i+1}/${total}`});
    const card=await renderCard(i,state.plan.slides[i],base);
    if(token!==run)return;
    const updated={...state.slides[i],id:crypto.randomUUID(),preview:card.preview,droppedPoints:card.droppedPoints};
    patch({slides:state.slides.map((item,k)=>k===i?updated:item),...(i===0?{cover:updated}:{})});
  }
  finishDeck();
  // 카드로 그린 장인데 밑바탕이 없어 다시 못 그린 경우에만 알린다(사진 그대로 쓴 장은 장 번호가 없다).
  if(missed&&state.slides.some(slide=>slide.source!=="photo"||state.plan))patch({providerNotice:"저장된 초안에서 다시 연 카드는 장 번호(예: 3 / 7)를 다시 그리지 못해요. 카드에 적힌 장 번호가 실제 장 수와 다를 수 있어요."});
}

// 지금 보고 있는 장을 뺀다. 표지(첫 장)는 빼지 않는다(표지를 바꾸려면 다시 만들기).
export async function removeSlide(index=activeSlideIndex(state)){
  if(index<=0||index>=state.slides.length||state.slides.length<=1||state.phase!=="idle")return;
  const keep=<T,>(_:T,i:number)=>i!==index;
  const refinements=Object.fromEntries(Object.entries(state.refinements).flatMap(([key,value])=>{const i=Number(key);return i===index?[]:[[i>index?i-1:i,value]];}));
  const token=++run;
  patch({
    slides:state.slides.filter(keep),
    plan:state.plan?{...state.plan,slides:state.plan.slides.filter(keep)}:undefined,
    photoAssignment:state.photoAssignment.filter(keep),
    photoViews:state.slides.map((_,i)=>state.photoViews[i]??[]).filter(keep),
    refinements,deckEdited:true,approved:false,error:"",providerNotice:"",
    activeSlide:Math.min(index,state.slides.length-2),phase:"slides",deckStatus:"장을 빼고 장 번호를 맞추는 중",
  });
  try{await redrawDeck(token);}
  catch(error){if(token===run)patch({error:error instanceof Error?error.message:"장 번호를 다시 그리지 못했어요."});}
  finally{if(token===run)patch({phase:"idle",deckStatus:""});}
}

// 새 장에 쓸 사진을 올린다(카드를 지우지 않는다). 올린 사진은 사진 보관함에도 저장된다.
export async function uploadSlidePhoto(file:File|undefined):Promise<StudioPhoto|null>{
  if(!file||!file.type.startsWith("image/"))return null;
  try{return await uploadStudioPhoto(file);}
  catch(error){patch({error:error instanceof Error?error.message:"사진을 저장하지 못했어요."});return null;}
}

// 새 장의 구성안. 지금 장의 글꼴 설정을 이어받고, 역할은 본문(detail)으로 둔다.
function newSlidePlan(input:NewSlide&{visualPrompt?:string;keywords?:string[]},after:CarouselPlan["slides"][number]|undefined):CarouselPlan["slides"][number]{
  const headline=input.headline.trim();
  const layout:CarouselPlan["slides"][number]["layout"]=input.source==="text"?"checklist":"frame";
  return {
    role:"detail",headline,subline:"",points:input.points.map(point=>point.trim()).filter(Boolean),
    // 이미지 AI로 만들 때 쓰는 장면 설명. 제목과 주제로 짓는다(12자 이상).
    visualPrompt:(input.visualPrompt??`${headline} — ${state.input.topic} 장면, 묵동홍어마을의 한 상. 얼굴 없음`).slice(0,600),
    textPosition:"bottom",layout,keywords:input.keywords??[],figure:"",
    titleFont:after?.titleFont??"auto",bodyFont:after?.bodyFont??"auto",variant:0,
  };
}

// 지금 보고 있는 장 바로 뒤에 새 장을 넣는다.
//   photo: 고른 사진으로 카드를 그린다(사진은 스튜디오 사진 목록에 더한다).
//   ai   : 이미지 AI로 새 장면을 만든다(비용이 든다).
//   text : 사진 없이 글자 카드(체크리스트)로 그린다.
//   raw  : 구성안이 없는 초안(다시 연 초안·사진 그대로 쓴 캐러셀)에 사진을 그대로 넣는다. 구성안이 없으면 고른 방식과
//          상관없이 이 길로 간다(카드를 그릴 디자인 정보가 없다).
// 반환값: 새 장을 넣었으면(또는 홍보 카드 요청을 처리했으면) true. 화면은 true일 때만 입력란을 비운다(실패하면 다시 적지 않게).
export async function addSlide(input:NewSlide):Promise<boolean>{
  if(state.slides.length>=MAX_DECK_SLIDES){patch({error:`캐러셀은 ${MAX_DECK_SLIDES}장까지예요.`});return false;}
  if(state.phase!=="idle")return false;
  const position=Math.min(activeSlideIndex(state)+1,state.slides.length);
  if(!state.plan){
    if(!input.photo){patch({error:"넣을 사진을 골라 주세요."});return false;}
    const image:ApprovedImage={id:crypto.randomUUID(),preview:input.photo.preview,source:"photo"};
    const slides=[...state.slides];slides.splice(position,0,image);
    patch({slides,deckEdited:true,approved:false,activeSlide:position,error:""});
    return true;
  }
  if(input.verbatim){
    const problem=slideTextProblem({headline:input.headline,points:input.points});
    if(problem){patch({error:problem});return false;}
  }else if(![input.headline,...input.points].some(text=>text.trim())){patch({error:"어떤 장을 넣을지 적어 주세요."});return false;}
  if(input.source==="photo"&&!input.photo){patch({error:"새 장에 넣을 사진을 골라 주세요."});return false;}
  const plan=state.plan;
  // 요청으로 읽기: 문안 AI가 카드 제목·요점·사진 장면을 짓는다(실패하면 서버가 규칙으로 지은 문구를 준다).
  let drafted:Partial<Pick<NewSlide,"headline"|"points">>&{visualPrompt?:string;keywords?:string[]}={};
  if(!input.verbatim&&input.source!=="raw"){
    // 응답을 기다리는 사이 다른 초안으로 바뀌면(ensureGeneration·reset) 옛 구성안을 새 초안에 쓰지 않게 한다.
    const token=++run;
    patch({phase:"slides",deckStatus:"요청에 맞게 새 장 문구를 짓는 중…",error:""});
    try{
      const response=await fetch("/api/images/slide",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        topic:state.input.topic,request:[input.headline,...input.points].map(text=>text.trim()).filter(Boolean).join("\n").slice(0,400),
        previous:plan.slides[position-1]?.headline??"",next:plan.slides[position]?.headline??"",source:input.source,
      })});
      const data=await readJsonResponse(response);
      if(token!==run)return false;
      if(!response.ok||!data.draft)throw new Error(data.message||"새 장 문구를 짓지 못했어요.");
      // 가게 홍보 카드를 원하는 요청이면 새 장을 따로 만들지 않고 맨 뒤 홍보 카드(낙관·가게 이름·마스코트)를 켠다.
      if(data.draft.kind==="store"){
        patch({phase:"idle",deckStatus:"",providerNotice:"가게 홍보 카드는 맨 뒤에 자동으로 붙어요(로고·가게 이름·마스코트). 장 고치기에서 켜고 끌 수 있어요."});
        if(!state.storeCard.include)await setStoreCardIncluded(true);else void ensureStoreCard();
        return true;
      }
      drafted={headline:data.draft.headline,points:data.draft.points,visualPrompt:data.draft.visualPrompt,keywords:data.draft.keywords};
    }catch(error){
      if(token===run)patch({phase:"idle",deckStatus:"",error:error instanceof Error?error.message:"새 장 문구를 짓지 못했어요."});
      return false;
    }
    if(token!==run)return false;
    patch({phase:"idle",deckStatus:""});
  }
  const slide=newSlidePlan({...input,...drafted},plan.slides[position-1]);
  // 사진은 스튜디오 사진 목록에 넣고(이미 있으면 그 번호) 이 장에 배정한다. 사진 수 한도(10장)를 넘지 않는다.
  let photos=state.photos,slots:number[]=[];
  if(input.source==="photo"&&input.photo){
    const existing=photos.findIndex(photo=>photo.id===input.photo!.id);
    if(existing>=0)slots=[existing];
    else if(photos.length<MAX_STUDIO_PHOTOS){photos=[...photos,input.photo];slots=[photos.length-1];}
    else{patch({error:`사진은 ${MAX_STUDIO_PHOTOS}장까지 쓸 수 있어요. 쓰지 않는 사진을 빼 주세요.`});return false;}
  }
  const placeholder:ApprovedImage={id:crypto.randomUUID(),source:input.source==="photo"?"photo":input.source==="ai"?sourceOf():"design",role:slide.role};
  const slides=[...state.slides];slides.splice(position,0,placeholder);
  const assignment=state.slides.map((_,i)=>state.photoAssignment[i]??[]);assignment.splice(position,0,slots);
  const views=state.slides.map((_,i)=>state.photoViews[i]??[]);views.splice(position,0,slots.map(()=>"full" as const));
  const refinements=Object.fromEntries(Object.entries(state.refinements).map(([key,value])=>{const i=Number(key);return [i>=position?i+1:i,value];}));
  const token=++run;
  patch({slides,photos,photoAssignment:assignment,photoViews:views,refinements,plan:{...plan,slides:[...plan.slides.slice(0,position),slide,...plan.slides.slice(position)]},deckEdited:true,approved:false,activeSlide:position,error:"",providerNotice:"",phase:"slides",deckStatus:"새 장을 그리는 중"});
  try{
    const card=input.source==="ai"?await generate(slide,position+1):{...placeholder,...await renderCard(position,slide,{photos:slots.map(i=>photos[i].preview),photoKind:slots.length?"real":"none"})};
    if(token!==run)return false;
    patch({slides:state.slides.map(item=>item.id===placeholder.id?{...card,id:placeholder.id}:item)});
    await redrawDeck(token,position);
    return token===run;
  }catch(error){
    // 새 장을 못 그렸으면 끼워 넣은 자리를 되돌린다(빈 장이 남지 않게).
    if(token===run){
      const at=state.slides.findIndex(item=>item.id===placeholder.id);
      if(at>=0&&!state.slides[at].preview)patch({slides:state.slides.filter((_,i)=>i!==at),plan:{...state.plan!,slides:state.plan!.slides.filter((_,i)=>i!==at)},photoAssignment:state.photoAssignment.filter((_,i)=>i!==at),photoViews:state.photoViews.filter((_,i)=>i!==at),activeSlide:Math.max(0,at-1)});
      patch({error:error instanceof Error?error.message:"새 장을 만들지 못했어요."});
    }
    return false;
  }finally{
    if(token===run)patch({phase:"idle",deckStatus:""});
  }
}

// 게시물에 쓴 보관함 사진의 사용 횟수를 올린다(보관함 "자주 쓴 순"·"안 쓴 사진 먼저" 정렬용).
// 실패해도 게시물 만들기에는 영향이 없으므로 기다리지 않고 조용히 넘어간다.
export function recordPhotoUse(ids:Array<string|undefined>){
  const unique=[...new Set(ids.filter((id):id is string=>!!id))].slice(0,10);
  if(unique.length)void fetch("/api/images/assets/used",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:unique})}).catch(()=>undefined);
}

// 카드로 꾸미지 않고 올린 사진 그대로 캐러셀로 쓴다.
export function approveRawPhotos(onApprove:(images:ApprovedImage[])=>void){
  if(!state.photos.length)return;
  patch({approved:true});
  onApprove(state.photos.map(photo=>({id:photo.id,preview:photo.preview,source:"photo"})));
  recordPhotoUse(state.photos.map(photo=>photo.id));
}
