import { useSyncExternalStore } from "react";
import { shrinkPhoto } from "@/lib/files/shrinkPhoto";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, type CarouselPlan, type CarouselRole, type CarouselSlideCount } from "./carousel";
import type { ImageStyle } from "./style";
import { DEFAULT_SLIDE_LAYOUT, type SlideLayout } from "./slideLayout";
import { normalizeCardLayout, photosNeeded, type CardLayout } from "./design";
import { AnalyzeResponseSchema, TOPIC_TAG, photoNote } from "./photoAnalysis";
import type { StyleId } from "./styleCatalog";
import { TRACK_STYLES, type CarouselTrack } from "./track";
import { readJsonResponse } from "@/lib/http/readJson";
import { teaserText } from "./teaser";
import { fillWithPhotoViews, fitPlanToPhotos, matchPhotosToSlides, sceneFallbackSlide, swapPhoto, type PhotoView } from "./photoCarousel";
import { rememberCurrentDraft, saveDraftCaption, saveDraftImages, writePostText, type DraftMeta } from "@/features/drafts/draftSave";

// 이미지 생성 상태를 React 컴포넌트 밖의 모듈 싱글턴에 둔다.
// 화면(만들기 2·3단계)이 언마운트돼도 상태와 진행 중인 fetch 루프는 살아 있고, 다시 마운트되면 그대로 이어 붙는다.
// 새로고침을 하면 사라진다(모듈이 다시 로드되므로). 그 경우는 서버 작업 큐가 필요하다.
// 예전 이미지 화면(방식 4개·계열/테마/글꼴/계절 고르기·표지 후보·파노라마·참고 사진)이 쓰던 상태와 함수는 화면과 함께 지웠다(간소화 C).
// 지금은 자동 만들기(사진 묶음 또는 AI) → 확인 화면의 장 고치기(그림·글)·장 넣기·빼기·글자 고치기만 이 상태를 쓴다.

// check: AI 표지 점검 결과(coverCheck.ts).
// bases: 글자를 얹기 전 밑바탕 사진(AI 이미지). 카드 글자만 고쳐 다시 그릴 때 쓴다. 초안에는 저장하지 않는다(화면에서만).
// droppedPoints: 카드 자리가 모자라 그리지 못한 짧은 글 수(서버가 알려 줌).
// drawnAt: 이 그림을 그릴 때의 "자리 정보"(positionKey). 장을 넣고 뺄 때 이것이 바뀐 장만 다시 그린다.
// refPhoto: 사진 중심에서 사진이 모자란 장을 AI가 그릴 때 참고한 사장님 사진 번호(이 장 다시 만들기에도 같은 사진을 참고한다).
export type ApprovedImage={id:string;preview?:string;referencePreview?:string;bases?:string[];source:"photo"|"design"|"ai-generated"|"ai-edited";role?:CarouselRole;check?:{score:number;note:string;warnings:string[]};droppedPoints?:number;drawnAt?:string;refPhoto?:number};
const droppedOf=(data:unknown)=>{const value=(data as {droppedPoints?:unknown})?.droppedPoints;return typeof value==="number"&&value>0?{droppedPoints:value}:{};};
// photo: 사장님 사진으로 그린 묶음, ai: AI가 그린 묶음. 저장된 게시물을 다시 열면 photo(구성안 없음)로 시작한다.
export type StudioMode="photo"|"ai";
export type StudioPhase="idle"|"uploading"|"planning"|"cover"|"slides";
// 사진 묶음에 쓸 사진 한 장. id는 사진 보관함(asset library) id, preview는 서버가 줄여 준 JPEG(최대 1400px).
export type StudioPhoto={id:string;preview:string;name:string};
export const MAX_STUDIO_PHOTOS=10;
// track: 갈래(사진 중심·글 중심, track.ts). 있으면 구성안 요청에 실어 보내고 서버가 장 수·디자인·글 길이를 정한다.
//        사장님 사진 묶음도 갈래를 따른다(사진 중심은 장마다 사진 1장까지, 글 중심은 표지에만 사진).
export type GenerationInput={topic:string;imageBrief?:string;contentBrief?:string;slideCount:CarouselSlideCount;track?:CarouselTrack};

export type GenerationState={
  key:string;                 // 초안(세션)마다 다른 값. 키가 바뀌면 상태를 새로 시작한다.
  input:GenerationInput;
  mode:StudioMode;
  imageStyle:ImageStyle;
  slideLayout:SlideLayout;
  photoStatus:string;
  plan?:CarouselPlan;
  cover?:ApprovedImage;
  slides:ApprovedImage[];
  activeSlide:number;
  phase:StudioPhase;
  error:string;
  approved:boolean;
  photos:StudioPhoto[];          // 사진 묶음에 쓸 사진(올린 순서 = 장에 배치되는 순서)
  photoAssignment:number[][];    // 장마다 들어간 사진 번호(photos 기준). 사진 바꾸기에 쓴다.
  photoViews:PhotoView[][];      // photoAssignment와 같은 모양: 그 칸의 사진을 얼마나 가까이 잘라 쓰는지. 없으면 사진 그대로.
  photoNotes:string[];           // photos와 같은 순서: 사진마다 보이는 것(사진 분석). 모르면 "". 글 쓰기에도 넘긴다.
  deckEdited:boolean;            // 사용자가 완성된 묶음에서 장을 빼거나 넣었는지. 그러면 장 수는 설정값이 아니라 지금 장 수다.
  deckStatus:string;             // 장을 빼고 넣은 뒤 장 번호를 다시 그리는 동안의 진행 안내.
  photoSceneOnly:number[];       // 사진 중심에서 AI 장면으로만 채운 장(같은 사진을 세 번 넘게 쓰는 자리). AI가 못 그리면 글자 카드로 그린다.
  // AI 장면을 못 그려 확대 사진·글자 카드로 대신한 장(검수 보고서 B-4). 화면이 안내하고, "장 고치기 → 그림"은 이 장을 AI로 다시 그린다.
  // photo: 참고한 사장님 사진, layout: AI로 그릴 때의 모양(글자 카드로 바뀌었으면 되돌린다), reason: 못 그린 이유(서버의 쉬운 말).
  sceneMisses:SceneMiss[];
  // 맨 뒤 가게 홍보 카드(사장님 결정: 모든 묶음 끝에 "묵동홍어마을" 홍보 카드 한 장, 이미지 AI 비용 없음).
  // include: 붙일지(장 고치기에서 끌 수 있음). image: 그려 둔 카드. key: 그릴 때의 디자인·장 수(바뀌면 다시 그린다).
  storeCard:{include:boolean;image?:ApprovedImage;key?:string;pending?:boolean;failed?:boolean};
  // 자동 만들기(2단계 화면의 "만들기" 한 번): 사진 → 저장 → 글까지 이어서 하는 진행 상황. 화면이 사라져도 여기 남는다.
  auto:AutoState;
};
// working: 사진 만드는 중, saving: 초안 저장 중, writing: 글 쓰는 중, done: 끝(images·caption을 화면이 가져간다), error: 멈춤.
// meta: 지금 만드는 게시물의 주제·대상·게시일 등. 다른 메뉴에 다녀와 화면이 새로 열려도 같은 게시물로 돌아오게 한다.
export type SceneMiss={index:number;photo:number;layout:CardLayout;reason:string};
export type AutoStage="idle"|"working"|"saving"|"writing"|"done"|"error";
export type AutoState={stage:AutoStage;error:string;detail?:string;images?:ApprovedImage[];caption?:string;captionSaved?:boolean;copyError?:string;meta?:DraftMeta};
const AUTO_IDLE:AutoState={stage:"idle",error:""};

const EMPTY_INPUT:GenerationInput={topic:"",slideCount:5};

function initialGenerationState(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]):GenerationState {
  return {key,input,mode:"photo",imageStyle:"photo",slideLayout:DEFAULT_SLIDE_LAYOUT,photoStatus:"",plan:undefined,cover:undefined,slides:approvedImages,activeSlide:0,phase:"idle",error:"",approved:false,photos:[],photoAssignment:[],photoViews:[],photoNotes:[],photoSceneOnly:[],sceneMisses:[],
    // 저장된 초안을 다시 열었는데 장 수가 설정과 다르면(예전에 장을 고친 초안) 이미 고친 묶음으로 본다.
    deckEdited:approvedImages.length>0&&approvedImages.length!==input.slideCount,deckStatus:"",
    // 저장된 초안을 다시 연 경우에는 이미 저장된 장(홍보 카드 포함)을 그대로 쓰므로 새로 붙이지 않는다.
    storeCard:{include:approvedImages.length===0},auto:AUTO_IDLE};
}

// 만든 것들만 비우고 사진은 남긴다(사진을 더하거나 빼거나, 처음부터 다시 만들 때).
const CLEARED:Partial<GenerationState>={plan:undefined,cover:undefined,slides:[],activeSlide:0,approved:false,error:"",photoAssignment:[],photoViews:[],photoNotes:[],photoSceneOnly:[],sceneMisses:[],deckEdited:false,deckStatus:""};

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

// 구성안 요청에 실을 갈래(없으면 빈 객체: 예전 요청과 똑같다).
const trackField=()=>state.input.track?{track:state.input.track}:{};

export function resetGenerationStore(){run++;autoRun++;storeRun++;drawnScenes.clear();replace(initialGenerationState("",EMPTY_INPUT));}

// 다른 초안으로 바뀌면 새로 시작하고, 같은 초안이면 진행 중인 상태를 그대로 이어 간다.
export function ensureGeneration(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]){
  if(state.key!==key){run++;drawnScenes.clear();replace(initialGenerationState(key,input,approvedImages));return;}
  if(state.input.topic!==input.topic||state.input.imageBrief!==input.imageBrief||state.input.contentBrief!==input.contentBrief||state.input.slideCount!==input.slideCount||state.input.track!==input.track)patch({input});
}

export const activeSlideIndex=(current:GenerationState)=>Math.min(current.activeSlide,Math.max(current.slides.length-1,0));

export function setActiveSlide(activeSlide:number){patch({activeSlide});}
export function markApproved(){patch({approved:true});}

// 글 쓰기에 넘길 "게시물에 실제로 들어간 사진에 보이는 것". 사진 묶음은 장에 들어간 사진 순서대로(같은 사진은 한 번).
// AI 묶음이거나 아는 것이 없으면 undefined.
export function deckPhotoNotes(current:Pick<GenerationState,"mode"|"photoAssignment"|"photoNotes"|"slides">):string[]|undefined {
  if(current.mode!=="photo"||!current.slides.length)return undefined;
  const order=[...new Set(current.photoAssignment.flat())];
  const notes=order.map(index=>current.photoNotes[index]?.trim()).filter((note):note is string=>Boolean(note));
  return notes.length?notes.slice(0,10):undefined;
}

// 내용 장 수. 장을 고친 캐러셀은 지금 장 수, 아니면 설정한 장 수. 카드에는 찍지 않고, 마지막 장·표지 예고 띠를 정하는 데 쓴다.
export const deckTotal=(current:GenerationState)=>current.deckEdited?current.slides.length:current.input.slideCount;
// 캐러셀이 다 만들어졌는지(장 빼기·넣기 뒤에는 장 수가 설정값과 달라도 완성).
export const deckComplete=(current:GenerationState)=>current.slides.length>0&&(current.deckEdited||current.slides.length===current.input.slideCount);
// 홍보 카드를 붙이는 캐러셀인지: 구성안으로 그린 캐러셀(실제 사진 카드·AI)만. 무료 카드·사진 그대로는 붙이지 않는다.
// 인스타그램 캐러셀·초안 저장은 한 게시물에 10장까지라, 내용이 10장이면 홍보 카드를 붙이지 않는다(9장 이하일 때만).
// 9↔10장을 오갈 때 다시 그릴 장은 positionKey가 알아서 고른다.
export const STORE_CARD_MAX_CONTENT=9;
export const storeCardOn=(current:GenerationState)=>current.storeCard.include&&Boolean(current.plan)&&deckTotal(current)<=STORE_CARD_MAX_CONTENT;
// 게시물 전체 장 수(홍보 카드 포함). 카드에는 찍지 않고(번호만 찍는다), 어느 장이 마지막인지 정하는 데 쓴다.
export const postTotal=(current:GenerationState)=>deckTotal(current)+(storeCardOn(current)?1:0);
// 카드 그림 가운데 "몇 번째 장인지"에 따라 달라지는 것만 모은 열쇠(index는 0부터).
// - 장 번호(카드에는 번호만 찍고 전체 장 수는 찍지 않는다)
// - 마지막 장인지(마지막 장은 가게 명함·작별 마스코트, 나머지는 "넘겨 보기" 표시). 홍보 카드가 붙으면 내용 장은 마지막이 아니다.
// - 표지면 예고 띠 글(내용 장 수가 3·5·7·10이 아니게 되면 "넘겨 보세요"로 바뀐다)
// - 디자인(구성안의 디자인: 갈래·글꼴·색)
// 장을 넣거나 빼면 이 열쇠가 바뀐 장만 다시 그린다. 예전에는 카드마다 "3 / 7"처럼 전체 장 수가 찍혀 있어 모든 장을 다시 그렸다.
// (예전 화면의 파노라마·글꼴 고르기도 이 열쇠에 들어 있었지만, 그 화면과 함께 지웠다.)
function positionKey(current:GenerationState,index:number):string {
  const total=postTotal(current),number=index+1;
  return JSON.stringify([
    number,number===total,
    index===0?teaserText(total,storeCardOn(current)):"",
    current.plan?current.plan.design:null,
  ]);
}
// 게시물에 넘길 이미지: 내용 장 + (붙였으면) 맨 뒤 홍보 카드.
// 홍보 카드 그림이 지금 디자인·장 수로 그린 것일 때만 붙인다(다시 그리기에 실패해 옛 장 번호가 남은 카드는 빼고).
const storeCardKey=(current:GenerationState)=>current.plan?JSON.stringify([current.plan.design,postTotal(current)]):"";
// 묶음을 다 그린 직후(또는 장 번호를 다시 그린 직후) 홍보 카드를 맞춘다.
function finishDeck(){void ensureStoreCard();}
export const approvedDeck=(current:GenerationState):ApprovedImage[]=>[...current.slides,...(storeCardOn(current)&&current.storeCard.image&&current.storeCard.key===storeCardKey(current)?[current.storeCard.image]:[])];
// 홍보 카드를 그리는 중인지. 그리는 동안 "이 캐러셀 사용"을 막는다(홍보 카드가 빠지면 마지막 내용 장의 모양이 어긋난다).
export const storeCardPending=(current:GenerationState)=>storeCardOn(current)&&Boolean(current.storeCard.pending);
let storeRun=0;
// 마지막으로 시작한 홍보 카드 그리기. 자동 만들기가 저장하기 전에 기다린다(홍보 카드가 빠진 채 저장되지 않게).
let storeCardTask:Promise<void>=Promise.resolve();
async function storeCardSettled(){for(let i=0;i<5&&state.storeCard.pending;i++)await storeCardTask;}
// 홍보 카드를 (다시) 그린다. 디자인·장 수가 그대로면 그려 둔 것을 쓴다.
// 못 그리면(두 번 시도) 홍보 카드를 빼고 마지막 내용 장을 진짜 마지막 장(가게 명함·작별 마스코트)으로 다시 그린다.
// 예전에는 조용히 빠진 채 저장돼, 마지막 장에 "넘겨 보기"가 있는데 넘길 장이 없었다(검수 보고서 A-4).
function ensureStoreCard():Promise<void>{storeCardTask=drawStoreCard();return storeCardTask;}
async function requestStoreCard(design:CarouselPlan["design"],total:number):Promise<string|undefined>{
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch("/api/images/store-card",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({design,index:total,total})});
      const data=await readJsonResponse(response);
      if(response.ok&&typeof data.image==="string")return data.image;
    }catch{/* 한 번 더 시도하고, 그래도 안 되면 홍보 카드를 뺀다. */}
  }
  return undefined;
}
async function drawStoreCard(){
  if(!storeCardOn(state)||!deckComplete(state)||!state.plan)return;
  const design=state.plan.design,total=postTotal(state);
  const key=storeCardKey(state);
  if(state.storeCard.image&&state.storeCard.key===key)return;
  const mine=++storeRun;
  patch({storeCard:{...state.storeCard,pending:true,failed:false}});
  const image=await requestStoreCard(design,total);
  if(mine!==storeRun)return;
  if(image){patch({storeCard:{...state.storeCard,pending:false,image:{id:crypto.randomUUID(),preview:image,source:"design"},key}});return;}
  // pending은 마지막 장을 다시 그릴 때까지 켜 둔다: 자동 만들기가 그동안 저장하지 않고 기다린다(storeCardSettled).
  patch({storeCard:{include:false,pending:true,failed:true}});
  if(state.phase==="idle"&&deckComplete(state)){
    const token=++run;
    patch({phase:"slides",deckStatus:"홍보 카드 없이 마지막 장을 맞추는 중"});
    try{await redrawDeck(token);}finally{if(token===run)patch({phase:"idle",deckStatus:""});}
  }
  if(mine===storeRun)patch({storeCard:{...state.storeCard,pending:false}});
}
// 장 고치기의 "맨 뒤 가게 홍보 카드" 켜고 끄기. 전체 장 수가 바뀌므로 내용 장의 장 번호를 다시 그린다.
export async function setStoreCardIncluded(include:boolean){
  if(state.storeCard.include===include||state.phase!=="idle")return;
  patch({storeCard:{...state.storeCard,include,failed:false},approved:false});
  if(!state.plan||!deckComplete(state))return;
  const token=++run;
  patch({phase:"slides",deckStatus:"장 번호를 맞추는 중"});
  try{await redrawDeck(token);}finally{if(token===run)patch({phase:"idle",deckStatus:""});}
}
function requestBase(){const {topic,imageBrief}=state.input;return {topic,...(imageBrief?{imageBrief}:{}),slideTotal:postTotal(state),...(state.deckEdited?{deckEdited:true}:{}),...(storeCardOn(state)?{storeCard:true}:{}),imageStyle:state.imageStyle,slideLayout:state.slideLayout};}
// 표지 이어 가기(continuity) 참고 이미지는 보내지 않는다. 이미지 AI가 표지를 거의 그대로 베껴 장마다 같은 그림이 됐다.
// 통일감은 구성안의 공통 스타일(styleAnchor)로 잇는다.
const sourceOf=(reported?:string)=>(reported??"ai-generated") as ApprovedImage["source"];

// dish: 사장님 사진(photo번)을 참고해 같은 음식으로 이 장 글에 맞는 새 장면을 그린다(사진 중심의 모자란 장).
// refinement: "이 장 고치기"에서 사장님이 고른 요청·직접 적은 말(그림 AI가 가장 먼저 따른다).
async function generate(slide:CarouselPlan["slides"][number],index:number,dish?:{photo:number},refinement?:string):Promise<ApprovedImage>{
  // 요청을 보내는 순간의 자리 정보(서버가 이 번호·장 수로 그린다).
  const drawnAt=positionKey(state,index-1);
  // 콜라주형은 사진 세 장을 만들어 한 카드에 넣는다. 서버는 합친 카드 한 장만 돌려준다.
  // 디자인 계열(기본 템플릿 아님)은 한 장에 사진을 두 장까지만 그린다. 그 이상 만들면 돈만 들고 안 쓰인다.
  const style=state.plan!.design.style;
  const count=state.slideLayout==="card"?Math.min(Math.max(1,photosNeeded(normalizeCardLayout(slide))),!style||style==="template"?3:2):1;
  const reference=dish?state.photos[dish.photo]?.preview:undefined;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide,styleAnchor:state.plan!.styleAnchor,design:state.plan!.design,slideIndex:index,count,...(reference?{referenceImage:reference,referenceMode:"dish"}:{}),...(refinement?.trim()?{refinement:refinement.trim().slice(0,300)}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"이미지를 만들지 못했습니다.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("장 그림을 받지 못했어요.");
  return {id:crypto.randomUUID(),preview:data.images[0],referencePreview:data.referenceImages?.[0],...(data.baseImages?.[0]?{bases:data.baseImages[0]}:{}),source:sourceOf(data.source),role:slide.role,...droppedOf(data),drawnAt,...(reference&&dish?{refPhoto:dish.photo}:{})};
}

// 묶음을 만들며 그린 AI 그림을 기억해 둔다(같은 초안·같은 자리·같은 글·같은 참고 사진이면 다시 쓴다).
// 두 장씩 동시에 그리다 앞 장이 실패하면, 이미 다 그린 뒤 장은 화면에 붙지 못하고 버려져 "다시 해 보기"에서 또 그렸다
// (이미지 AI 비용이 두 번 든다. 검수 보고서 B-4). "장 고치기 → 그림"은 새 그림을 원하는 것이라 이 기억을 쓰지 않는다.
const drawnScenes=new Map<string,ApprovedImage>();
async function generateOnce(slide:CarouselPlan["slides"][number],index:number,dish?:{photo:number}):Promise<ApprovedImage>{
  const key=JSON.stringify([state.key,index,slide.headline,slide.points,slide.visualPrompt,state.plan?.design??null,dish?.photo??null,dish?state.photos[dish.photo]?.id??null:null]);
  const kept=drawnScenes.get(key);
  if(kept)return {...kept,id:crypto.randomUUID()};
  const card=await generate(slide,index,dish);
  drawnScenes.set(key,card);
  return card;
}
// AI 장면을 못 그린 장 수와 이유를 한 줄 안내로 만든다. 이유는 서버가 준 쉬운 말(크레딧 부족 등)을 그대로 쓴다.
export function sceneNoticeOf(current:Pick<GenerationState,"sceneMisses">):string {
  const misses=current.sceneMisses;
  if(!misses.length)return "";
  const reason=misses.map(miss=>miss.reason).find(text=>/[가-힣]/.test(text));
  return `AI 그림 ${misses.length}장(${misses.map(miss=>`${miss.index+1}번`).join("·")} 장)을 못 그려서 사진 확대나 글자 카드로 대신했어요.${reason?` 이유: ${reason}`:""} 그대로 올려도 되고, 그 장의 "장 고치기"에서 그림을 다시 그리면 AI로 다시 그려요.`;
}
// 장을 빼거나 넣으면 못 그린 장 번호도 함께 옮긴다.
const missesAfterRemove=(misses:SceneMiss[],removed:number)=>misses.filter(miss=>miss.index!==removed).map(miss=>miss.index>removed?{...miss,index:miss.index-1}:miss);
const missesAfterInsert=(misses:SceneMiss[],position:number)=>misses.map(miss=>miss.index>=position?{...miss,index:miss.index+1}:miss);

// 한 번에 만드는 AI 장 수. 이미지 AI(Higgsfield·Cloudflare·OpenAI)가 동시에 받아 주는 범위 안에서 두 장.
const SLIDE_CONCURRENCY=2;
// 고른 표지 뒤의 남은 장을 만든다. 화면이 사라져도 이 루프는 계속 돌고 결과는 저장소에 쌓인다.
async function finishSlides(){
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
          const generated=await generateOnce(plan.slides[i],i+1);
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
    if(token===run)patch({error:error instanceof Error?error.message:"남은 장을 만들지 못했어요."});
  }finally{
    if(token===run){patch({phase:"idle"});finishDeck();}
  }
}

async function regenerateSlide(refinement?:string){
  const {plan,cover}=state;
  if(!plan||!cover)return;
  const index=activeSlideIndex(state),token=++run;
  patch({phase:"slides",error:""});
  try{
    // 사장님 사진을 참고해 그린 장(사진 중심)은 다시 만들 때도 같은 사진을 참고한다.
    const refPhoto=state.slides[index]?.refPhoto;
    const replacement=await generate(plan.slides[index],index+1,refPhoto!==undefined&&state.photos[refPhoto]?{photo:refPhoto}:undefined,refinement);
    if(token!==run)return;
    patch({slides:state.slides.map((item,i)=>i===index?replacement:item),...(index===0?{cover:replacement}:{}),approved:false});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"이 장을 다시 만들지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// AI 장면을 못 그려 확대 사진·글자 카드로 대신한 장을 AI로 다시 그린다(사장님 사진 참고, 원래 모양으로).
async function regenerateScene(refinement?:string){
  const plan=state.plan,index=activeSlideIndex(state),miss=state.sceneMisses.find(item=>item.index===index);
  if(!plan||!miss||!state.photos[miss.photo])return;
  const token=++run;
  patch({phase:"slides",error:""});
  try{
    const slide={...plan.slides[index],layout:miss.layout};
    const card=await generate(slide,index+1,{photo:miss.photo},refinement);
    if(token!==run)return;
    patch({
      slides:state.slides.map((item,i)=>i===index?card:item),
      plan:{...state.plan!,slides:state.plan!.slides.map((item,i)=>i===index?slide:item)},
      photoAssignment:state.photoAssignment.map((item,i)=>i===index?[]:item),
      photoViews:state.photoViews.map((item,i)=>i===index?[]:item),
      sceneMisses:state.sceneMisses.filter(item=>item.index!==index),approved:false,
    });
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"이 장을 다시 그리지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// ── 실제 사진 여러 장으로 만드는 캐러셀 ──────────────────────────────────────────
// 사진은 사진 보관함(/api/images/assets)에 저장해 다음 게시물에서도 다시 고를 수 있게 한다.
// 보관함이 돌려주는 미리보기(최대 1400px JPEG, 회전 보정됨)를 카드 그리기에 그대로 쓴다.

// 사진 한 장을 보관함에 저장하고 스튜디오 사진 형태로 돌려준다(사진 캐러셀 올리기·장 추가에서 함께 쓴다).
export async function uploadStudioPhoto(file:File):Promise<StudioPhoto>{
  const body=new FormData();
  // 고화소 사진은 휴대폰에서 먼저 줄여 보낸다(빨리 올라가고 크기 제한에 안 걸리게).
  body.append("file",await shrinkPhoto(file));
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

// 칸마다 자르는 거리(가까이·결 확대)가 하나라도 있으면 함께 보낸다. 모두 "사진 그대로"면 보내지 않는다.
const viewsField=(views:readonly PhotoView[]|undefined)=>views?.some(view=>view!=="full")?{photoViews:[...views]}:{};
async function composePhotoSlide(plan:CarouselPlan,index:number,slots:number[],views?:readonly PhotoView[]):Promise<ApprovedImage>{
  const drawnAt=positionKey(state,index);
  const slide=plan.slides[index];
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slideLayout:"card",slide,styleAnchor:plan.styleAnchor,design:plan.design,slideIndex:index+1,count:1,...(slots.length?{photos:slots.map(i=>state.photos[i].preview),...viewsField(views)}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"카드를 만들지 못했어요.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
  return {id:crypto.randomUUID(),preview:data.images[0],source:slots.length?"photo":"design",role:slide.role,...droppedOf(data),drawnAt};
}

// 사진마다 보이는 것(음식·장면) 한 줄. Gemini 키가 있으면 AI가 사진을 읽고, 없으면 보관함 이름·태그로만 안다(무료).
// 실패하거나 모르면 빈 문자열이라 예전처럼 올린 순서대로 배치한다.
export async function describePhotos(photos:StudioPhoto[],topic:string):Promise<string[]> {
  try{
    const response=await fetch("/api/images/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photos:photos.map(photo=>({id:photo.id})),describe:true,...(topic?{topic:topic.slice(0,200)}:{})})});
    if(!response.ok)return photos.map(()=>"");
    const parsed=AnalyzeResponseSchema.safeParse(await readJsonResponse(response));
    if(!parsed.success)return photos.map(()=>"");
    return photos.map(photo=>photoNote(parsed.data.photos.find(item=>item.id===photo.id)));
  }catch{return photos.map(()=>"");}
}

// 구성안을 만들고, 사진 수에 맞게 장을 조정한 뒤, 장마다 카드를 그린다. 사진이 모자란 장만 사장님 사진을 참고해 AI가 그린다.
export async function buildPhotoCarousel(){
  if(!state.photos.length)return;
  const token=++run;
  patch({...CLEARED,mode:"photo",phase:"planning",slideLayout:"card"});
  try{
    const {topic,imageBrief,contentBrief,slideCount}=state.input;
    // 1) 사진에 무엇이 보이는지 읽어 문안 AI에게 알려 준다(사진에 없는 음식을 주인공으로 한 장을 쓰지 않게).
    const photos=state.photos;
    const notes=await describePhotos(photos,topic);
    if(token!==run)return;
    patch({photoNotes:notes});
    const photoNotes=notes.some(Boolean)?notes:undefined;
    const response=await fetch("/api/images/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,...(imageBrief?{imageBrief}:{}),...(contentBrief?{contentBrief}:{}),slideCount,imageStyle:"photo",...(photoNotes?{photoNotes}:{}),...trackField()})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"글 순서를 정하지 못했어요.");
    // 디자인 계열(칠판·한지 등)은 한 장에 사진을 두 장까지만 그려서, 세 장짜리 콜라주는 기본 템플릿일 때만 만든다.
    // 갈래가 있으면 갈래가 장마다 사진 수를 정한다(사진 중심 1장까지, 글 중심은 표지만). 파노라마는 쓰지 않는다.
    const style=(data.plan as CarouselPlan).design.style;
    const track=state.input.track;
    const fitted=track?fitPlanToPhotos(data.plan as CarouselPlan,photos.length,{track}):fitPlanToPhotos(data.plan as CarouselPlan,photos.length,{maxPerSlide:!style||style==="template"?3:2});
    // 2) 장마다 사진 칸 수는 그대로 두고, 사진 내용이 그 장의 글과 맞는 사진을 넣는다(표지는 첫 사진 그대로).
    const matched=photoNotes?{...fitted,...matchPhotosToSlides(fitted.plan,fitted.assignment,notes)}:fitted;
    // 3) 사진이 모자라 글자 카드로 남은 장에 넣을 사진 칸을 정한다(fillWithPhotoViews: 그 장 글과 맞는 사진·레이아웃).
    const fit=fillWithPhotoViews(matched.plan,matched.assignment,photos.length,notes,track);
    // 4) 그 장들(같은 사진의 "가까이"·"결 확대" 자리)은 AI가 그 사진을 참고해 같은 음식으로 이 장 글에 맞는 새 장면을 그린다
    //    (예: "시원한 막걸리와 잘 어울려요" → 이 무침 옆에 막걸리 사발). 예전에는 같은 사진을 확대만 해서 글과 사진이 따로 놀았다.
    //    이미지 AI를 못 쓰면(키 없음·크레딧 부족·실패) 예전처럼 확대 사진으로 그린다.
    const assignment=fit.assignment.map(slots=>[...slots]),views=fit.views.map(list=>[...list]);
    patch({plan:fit.plan,photoAssignment:assignment,photoViews:views,photoSceneOnly:fit.sceneOnly,sceneMisses:[],phase:"slides"});
    const draw=(i:number)=>drawPhotoDeckSlide(i,assignment,views);
    // AI 장은 1~3분 걸려 두 장씩 함께 그린다. 화면에는 앞 장부터 순서대로 붙인다.
    let next:ApprovedImage[]=[];
    const ready=new Map<number,ApprovedImage>();
    let cursor=0,failure:unknown=null;
    const worker=async()=>{
      while(cursor<fit.plan.slides.length&&failure===null){
        const i=cursor++;
        try{
          const card=await draw(i);
          if(token!==run)return;
          ready.set(i,card);
          const add:ApprovedImage[]=[];
          while(ready.has(next.length+add.length))add.push(ready.get(next.length+add.length)!);
          if(add.length){next=[...next,...add];patch({slides:next,photoAssignment:assignment.map(slots=>[...slots]),photoViews:views.map(list=>[...list]),...(next[0]&&!state.cover?{cover:next[0]}:{})});}
        }catch(error){failure??=error;}
      }
    };
    await Promise.all(Array.from({length:SLIDE_CONCURRENCY},worker));
    if(token!==run)return;
    if(failure!==null)throw failure;
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"사진 묶음을 만들지 못했어요."});
  }finally{
    if(token===run){patch({phase:"idle"});finishDeck();}
  }
}

// 사진 묶음의 한 장을 그린다(buildPhotoCarousel·resumePhotoCarousel 공통). assignment·views는 그리는 동안 고쳐 쓴다.
// 1) 확대 자리(가까이·결 확대)는 사장님 사진을 참고해 AI가 이 장 글에 맞는 새 장면을 그린다. 그린 장은 사진 칸을 비운다
//    (글자 고치기는 AI 원본 밑바탕으로, 다시 만들기는 AI로).
// 2) AI가 못 그리면 확대 사진으로 그린다. 단 같은 사진을 세 번 넘게 쓰는 자리(photoSceneOnly)는 확대 사진이 앞 장과 똑같아지므로
//    예전처럼 글자 카드로 그리고 구성안의 그 장 모양도 글자 카드로 바꾼다. 못 그린 장은 sceneMisses에 적어 화면에 알린다.
async function drawPhotoDeckSlide(i:number,assignment:number[][],views:PhotoView[][]):Promise<ApprovedImage>{
  const plan=state.plan!;
  const slots=assignment[i]??[],view=views[i]?.[0];
  if(i>0&&slots.length&&view&&view!=="full"){
    try{
      const card=await generateOnce(plan.slides[i],i+1,{photo:slots[0]});
      assignment[i]=[];views[i]=[];
      return card;
    }catch(error){
      const reason=error instanceof Error?error.message:String(error);
      console.warn("[photo-deck] AI 장면을 못 그려 대신 그려요:",reason);
      patch({sceneMisses:[...state.sceneMisses.filter(miss=>miss.index!==i),{index:i,photo:slots[0],layout:normalizeCardLayout(plan.slides[i]),reason}].sort((a,b)=>a.index-b.index)});
    }
    if(state.photoSceneOnly.includes(i)){
      assignment[i]=[];views[i]=[];
      const slide=sceneFallbackSlide(plan.slides[i]);
      const textPlan={...plan,slides:plan.slides.map((item,k)=>k===i?slide:item)};
      patch({plan:{...state.plan!,slides:state.plan!.slides.map((item,k)=>k===i?slide:item)}});
      return composePhotoSlide(textPlan,i,[]);
    }
  }
  return composePhotoSlide(plan,i,slots,views[i]);
}

// 사진 캐러셀이 중간에 멈췄는지(서버 재시작·502·사진 한 장 오류). 이때는 남은 장만 이어 그릴 수 있다.
// 표지부터 멈춰 그린 장이 하나도 없어도(구성안·사진 배치는 있음) 이어 그린다: 처음부터 다시 만들면 구성안이 바뀌어 그려 둔 AI 그림을 못 쓴다.
export const photoDeckIncomplete=(current:GenerationState)=>current.mode==="photo"&&Boolean(current.plan)&&!current.deckEdited&&current.photoAssignment.length===(current.plan?.slides.length??-1)&&current.slides.length<(current.plan?.slides.length??0);
// 멈춘 사진 캐러셀의 남은 장만 이어서 그린다. 구성안·사진 배치는 그대로 쓰고, 이미 그린 장은 다시 그리지 않는다.
export async function resumePhotoCarousel(){
  const {plan}=state;
  if(!plan||state.phase!=="idle"||!photoDeckIncomplete(state))return;
  const token=++run;
  patch({phase:"slides",error:""});
  let next=state.slides;
  const assignment=state.photoAssignment.map(slots=>[...slots]),views=state.photoViews.map(list=>[...list]);
  try{
    for(let i=next.length;i<plan.slides.length;i++){
      // 처음 만들 때와 같은 방법으로 그린다(AI 장면 → 못 그리면 확대 사진·글자 카드). 이미 그려 둔 AI 그림은 다시 쓴다.
      const card=await drawPhotoDeckSlide(i,assignment,views);
      if(token!==run)return;
      next=[...next,card];
      patch({slides:next,photoAssignment:assignment.map(slots=>[...slots]),photoViews:views.map(list=>[...list]),...(i===0?{cover:card}:{})});
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
  const token=++run;
  patch({phase:"slides",error:""});
  try{
    // 사진을 직접 바꾼 장은 사진 그대로 쓴다(가까이·결 확대는 사진이 모자랄 때 자동으로만).
    const card=await composePhotoSlide(plan,index,slots);
    if(token!==run)return;
    // 사진을 직접 고른 장은 "AI를 못 그린 장" 안내에서 뺀다.
    patch({sceneMisses:state.sceneMisses.filter(miss=>miss.index!==index),slides:state.slides.map((item,i)=>i===index?card:item),photoAssignment:state.photoAssignment.map((item,i)=>i===index?slots:item),photoViews:state.slides.map((_,i)=>i===index?slots.map(()=>"full" as const):state.photoViews[i]??[]),...(index===0?{cover:card}:{}),approved:false});
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
  if(points.length>SLIDE_POINT_MAX_COUNT)return `짧은 글은 ${SLIDE_POINT_MAX_COUNT}줄까지예요.`;
  const long=points.findIndex(point=>point.length>SLIDE_POINT_MAX_LENGTH);
  if(long>=0)return `${long+1}번째 짧은 글이 ${SLIDE_POINT_MAX_LENGTH}자를 넘어요(지금 ${points[long].length}자).`;
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
async function renderCard(index:number,slide:CarouselPlan["slides"][number],base:{photos:string[];photoKind:"real"|"ai"|"none";views?:readonly PhotoView[]}):Promise<{preview:string;droppedPoints?:number;drawnAt:string}>{
  const drawnAt=positionKey(state,index);
  const plan=state.plan!;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide,styleAnchor:plan.styleAnchor,design:plan.design,slideIndex:index+1,count:1,...(base.photos.length?{photos:base.photos,photoKind:base.photoKind,...(base.photoKind==="real"?viewsField(base.views):{})}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"카드를 다시 그리지 못했어요.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
  return {preview:data.images[0],...droppedOf(data),drawnAt};
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
    const updated={...state.slides[index],id:crypto.randomUUID(),preview:card.preview,droppedPoints:card.droppedPoints,drawnAt:card.drawnAt};
    patch({plan:{...plan,slides:plan.slides.map((item,i)=>i===index?slide:item)},slides:state.slides.map((item,i)=>i===index?updated:item),...(index===0?{cover:updated}:{}),approved:false});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"카드를 다시 그리지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// "이 장 고치기 → 글": 글 AI가 요청대로 이 장의 제목·짧은 글을 고치고, 같은 밑바탕으로 글자만 다시 그린다(이미지 AI 비용 없음).
// 돌려주는 값: 고친 뒤 확인할 표현(과장·단정) 목록, 못 고쳤으면 그 이유. 화면이 그대로 보여 준다.
export async function reviseSlideText(index:number,request:string):Promise<{ok:true;warnings:string[]}|{ok:false;message:string}>{
  const {plan}=state;
  const slide=plan?.slides[index];
  if(!plan||!slide||!textEditBase(state,index)||state.phase!=="idle")return {ok:false,message:"이 장은 지금 글을 고칠 수 없어요."};
  const ask=request.trim();
  if(!ask)return {ok:false,message:"어떻게 고칠지 골라 주거나 적어 주세요."};
  // 답을 기다리는 사이 다른 게시물로 바뀌면(새로 만들기 등) 고친 글을 그 게시물에 넣지 않는다.
  const key=state.key;
  patch({phase:"slides",error:"",deckStatus:"글을 고치는 중"});
  let revised:{headline:string;points:string[];warnings:string[]};
  try{
    const response=await fetch("/api/images/slide/revise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      topic:state.input.topic,headline:slide.headline,points:slide.points,request:ask,
      previous:plan.slides[index-1]?.headline??"",next:plan.slides[index+1]?.headline??"",cover:index===0,...(state.input.track?{track:state.input.track}:{}),
    })});
    const data=await readJsonResponse(response);
    if(!response.ok||typeof data.headline!=="string"||!Array.isArray(data.points))throw new Error(data.message||"글을 고치지 못했어요.");
    revised={headline:data.headline,points:data.points,warnings:Array.isArray(data.warnings)?data.warnings:[]};
  }catch(error){
    const message=error instanceof Error?error.message:"글을 고치지 못했어요.";
    if(state.key===key)patch({phase:"idle",deckStatus:""});
    return {ok:false,message};
  }
  if(state.key!==key)return {ok:false,message:"다른 게시물로 바뀌어 고치지 않았어요."};
  patch({phase:"idle",deckStatus:""});
  await editSlideText(index,{headline:revised.headline,points:revised.points});
  return state.error?{ok:false,message:state.error}:{ok:true,warnings:revised.warnings};
}

// ── 초안 고치기: 장 빼기·넣기 ─────────────────────────────────────────────────────────
// 완성된 캐러셀(또는 저장된 초안을 다시 연 것)에서 장을 빼거나 새 장을 끼워 넣는다. 최대 10장(인스타 캐러셀 한도).
// 카드에는 장 번호만 찍혀 있으므로, 장 수나 순서가 바뀌면 자리 정보가 바뀐 장만 밑바탕으로 다시 그린다(redrawDeck)
// (이미지 AI는 부르지 않아 비용이 없다). 밑바탕이 없는 장(저장된 초안을 다시 연 경우 등)은 그대로 두고 안내만 한다.
export const MAX_DECK_SLIDES=10;
export type NewSlideSource="photo"|"ai"|"text"|"raw";
// verbatim: 적은 글을 카드 문구로 그대로 쓴다. 아니면 적은 글을 "이런 장을 만들어 줘"라는 요청으로 읽어 문안 AI가 문구·장면을 짓는다.
export type NewSlide={headline:string;points:string[];source:NewSlideSource;photo?:StudioPhoto;verbatim?:boolean};

// 장을 넣거나 뺀 뒤, 자리 정보(positionKey: 장 번호·마지막 장인지·표지 예고 띠)가 바뀐 장만 다시 그린다.
// 예: 맨 뒤에 한 장 넣기 → 새 장과 바로 앞 장(마지막 장이 아니게 됨), 표지 띠가 바뀔 때만 표지.
//     가운데 장 빼기 → 그 뒤 장들(번호가 하나씩 당겨짐)과 새 마지막 장, 필요하면 표지. 앞쪽 장은 그대로 둔다.
// skip은 방금 새로 그린 장(다시 그릴 필요 없음). 밑바탕이 없는 장(저장된 초안을 다시 연 경우 등)은 그대로 둔다.
async function redrawDeck(token:number,skip=-1){
  const stale=state.slides.map((slide,i)=>i).filter(i=>i!==skip&&state.slides[i].drawnAt!==positionKey(state,i));
  let done=0;
  for(const i of stale){
    const base=state.plan?textEditBase(state,i):null;
    if(!base||!state.plan?.slides[i])continue;
    patch({deckStatus:`장 번호를 맞추는 중 ${++done}/${stale.length}`});
    const card=await renderCard(i,state.plan.slides[i],base);
    if(token!==run)return;
    const updated={...state.slides[i],id:crypto.randomUUID(),preview:card.preview,droppedPoints:card.droppedPoints,drawnAt:card.drawnAt};
    patch({slides:state.slides.map((item,k)=>k===i?updated:item),...(i===0?{cover:updated}:{})});
  }
  finishDeck();
}

// 지금 보고 있는 장을 뺀다. 표지(첫 장)는 빼지 않는다(표지를 바꾸려면 다시 만들기).
export async function removeSlide(index=activeSlideIndex(state)){
  if(index<=0||index>=state.slides.length||state.slides.length<=1||state.phase!=="idle")return;
  const keep=<T,>(_:T,i:number)=>i!==index;
  const token=++run;
  patch({
    slides:state.slides.filter(keep),
    plan:state.plan?{...state.plan,slides:state.plan.slides.filter(keep)}:undefined,
    photoAssignment:state.photoAssignment.filter(keep),
    photoViews:state.slides.map((_,i)=>state.photoViews[i]??[]).filter(keep),
    sceneMisses:missesAfterRemove(state.sceneMisses,index),
    deckEdited:true,approved:false,error:"",
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
  if(state.slides.length>=MAX_DECK_SLIDES){patch({error:`한 게시물은 ${MAX_DECK_SLIDES}장까지예요.`});return false;}
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
        patch({phase:"idle",deckStatus:""});
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
  const token=++run;
  patch({slides,photos,photoAssignment:assignment,photoViews:views,sceneMisses:missesAfterInsert(state.sceneMisses,position),plan:{...plan,slides:[...plan.slides.slice(0,position),slide,...plan.slides.slice(position)]},deckEdited:true,approved:false,activeSlide:position,error:"",phase:"slides",deckStatus:"새 장을 그리는 중"});
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
      if(at>=0&&!state.slides[at].preview)patch({sceneMisses:missesAfterRemove(state.sceneMisses,at),slides:state.slides.filter((_,i)=>i!==at),plan:{...state.plan!,slides:state.plan!.slides.filter((_,i)=>i!==at)},photoAssignment:state.photoAssignment.filter((_,i)=>i!==at),photoViews:state.photoViews.filter((_,i)=>i!==at),activeSlide:Math.max(0,at-1)});
      patch({error:error instanceof Error?error.message:"새 장을 만들지 못했어요."});
    }
    return false;
  }finally{
    if(token===run)patch({phase:"idle",deckStatus:""});
  }
}

// 게시물에 쓴 보관함 사진의 사용 횟수를 올린다(보관함 "자주 쓴 순"·"안 쓴 사진 먼저" 정렬용).
// 실패해도 게시물 만들기에는 영향이 없으므로 기다리지 않고 조용히 넘어간다.
function recordPhotoUse(ids:Array<string|undefined>){
  const unique=[...new Set(ids.filter((id):id is string=>!!id))].slice(0,10);
  if(unique.length)void fetch("/api/images/assets/used",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:unique})}).catch(()=>undefined);
}

// ── 자동 만들기(새 3단계 화면) ─────────────────────────────────────────────────────────────
// 사장님은 갈래(사진 중심·글 중심)만 고르고 "만들기"를 한 번 누른다. 그다음은 여기서 끝까지 이어 간다:
//   구성안(갈래) → 그림(사장님 사진이 있으면 사진 묶음, 없으면 AI) → 표지 자동 선택 → 나머지 장 → 홍보 카드
//   → 초안 저장 → 글(본문·# 태그) 쓰기·저장 → 화면이 3단계(확인하고 올리기)로 넘어간다.
// 상태는 이 모듈에 있으므로 다른 메뉴에 다녀와도 계속 돌고, 돌아오면 같은 진행 상황을 보여 준다(새로고침하면 사라진다).
const patchAuto=(next:Partial<AutoState>)=>patch({auto:{...state.auto,...next}});
let autoRun=0;

// AI로 만드는 사진 묶음(사장님 사진이 없을 때). 예전 화면의 "표지 후보 2장 → 고르기 → 나머지 장"을 사람 손 없이 한다.
// 표지 후보: 글 중심은 AI 그림이 표지 한 장뿐이라 두 장을 만들어 서버의 표지 점검(coverCheck)이 앞에 둔 것을 쓰고,
// 사진 중심은 다섯 장 모두 AI라 한 장만 만든다(시간·비용). 기본 문안으로 넘어가도 멈추지 않는다(사장님이 고칠 수 있는 것이 없다).
async function buildAiCarousel(){
  const token=++run;
  patch({...CLEARED,mode:"ai",slideLayout:"card",phase:"planning"});
  try{
    const {topic,imageBrief,contentBrief,slideCount}=state.input;
    const response=await fetch("/api/images/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,...(imageBrief?{imageBrief}:{}),...(contentBrief?{contentBrief}:{}),slideCount,imageStyle:state.imageStyle,...trackField()})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"글 순서를 정하지 못했어요.");
    const plan=data.plan as CarouselPlan;
    patch({plan,phase:"cover"});
    const count=state.input.track==="text"?2:1;
    const coverAt=positionKey(state,0);
    const made=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:plan.slides[0],styleAnchor:plan.styleAnchor,design:plan.design,slideIndex:1,count})});
    const result=await readJsonResponse(made);
    if(token!==run)return;
    if(!made.ok)throw new Error(result.message||"표지를 만들지 못했습니다.");
    if(!Array.isArray(result.images)||result.images.length!==count)throw new Error("표지를 만들지 못했습니다.");
    // 서버가 점검 점수가 높은 후보를 앞에 둔다(점검을 못 하면 만든 순서). 첫 장이 표지다.
    const cover:ApprovedImage={id:crypto.randomUUID(),preview:result.images[0],referencePreview:result.referenceImages?.[0],...(result.baseImages?.[0]?{bases:result.baseImages[0]}:{}),source:sourceOf(result.source),role:plan.slides[0].role,...(result.checks?.[0]?{check:result.checks[0]}:{}),drawnAt:coverAt};
    patch({cover,slides:[],phase:"idle"});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"표지를 만들지 못했습니다.",phase:"idle"});
    return;
  }
  if(token!==run)return;
  await finishSlides();
}

// 이 초안 카드에 쓴 디자인 계열(성과를 계열별로 비교하는 데 쓴다). 구성안 없이 사진만 쓴 초안은 없다.
export const designStyleOf=(current:GenerationState):StyleId|undefined=>current.plan?.design?.style;
const hasAi=(images:ApprovedImage[])=>images.some(image=>image.source==="ai-generated"||image.source==="ai-edited");

// 사장님에게 보여 줄 멈춘 이유(쉬운 말 한 줄). 자세한 이유(AI 이름 등)는 detail로 따로 둔다(접어서 보여 준다).
export const AUTO_FAILED="사진을 다 만들지 못했어요. '다시 해 보기'를 눌러 주세요. 만든 장은 그대로 두고 이어서 만들어요.";

export async function createAutomatically(meta:DraftMeta){
  if(!state.input.track||state.auto.stage==="working"||state.auto.stage==="saving"||state.auto.stage==="writing")return;
  const key=state.key,mine=++autoRun;
  const alive=()=>state.key===key&&mine===autoRun;
  // 다시 해 보기(앞 번에 멈춤): 이미 만든 것은 버리지 않는다(멈춘 사진 묶음은 남은 장만, AI는 표지 뒤 남은 장만, 다 만들었으면 저장부터).
  // 갈래를 바꿨거나, 멈춘 적 없이 "만들기"를 다시 누른 것이면 처음부터 새로 만든다.
  const retry=state.auto.stage==="error"&&state.plan?.design?.style===TRACK_STYLES[state.input.track];
  patchAuto({stage:"working",error:"",detail:undefined,copyError:undefined,meta});
  try{
    if(!retry)await (state.photos.length?buildPhotoCarousel():buildAiCarousel());
    else if(!deckComplete(state)){
      if(state.photos.length)await (photoDeckIncomplete(state)?resumePhotoCarousel():buildPhotoCarousel());
      else await (state.mode==="ai"&&state.cover?finishSlides():buildAiCarousel());
    }
    if(!alive())return;
    if(!deckComplete(state)||!state.plan){patchAuto({stage:"error",error:AUTO_FAILED,detail:state.error||undefined});return;}
    await storeCardSettled();
    if(!alive())return;
    patchAuto({stage:"saving"});
    const images=approvedDeck(state);
    await saveDraftImages(meta,images,designStyleOf(state));
    if(!alive())return;
    patch({approved:true});
    rememberCurrentDraft(meta.id,meta.topic);
    recordPhotoUse(state.photoAssignment.flat().map(i=>state.photos[i]?.id));
    patchAuto({stage:"writing"});
    let caption="",captionSaved=false,copyError="";
    try{
      caption=await writePostText({topic:meta.topic,audience:meta.audience,contentBrief:meta.contentBrief||undefined,imageBrief:meta.imageBrief||undefined,hasAiImages:hasAi(images),slideOutline:state.plan?.slides.map(slide=>slide.headline),photoNotes:deckPhotoNotes(state)});
      await saveDraftCaption(meta.id,caption);captionSaved=true;
    }catch(error){copyError=error instanceof Error?error.message:"글을 쓰지 못했어요. '글 다시 쓰기'를 눌러 주세요.";}
    if(!alive())return;
    patchAuto({stage:"done",images,caption,captionSaved,...(copyError?{copyError}:{})});
  }catch(error){
    // 저장 실패처럼 우리가 쓴 쉬운 말이면 그대로, 브라우저가 낸 영어 오류(Failed to fetch 등)면 쉬운 말 + 자세한 이유로 접는다.
    const text=error instanceof Error?error.message:"";
    if(alive())patchAuto(/[가-힣]/.test(text)?{stage:"error",error:text}:{stage:"error",error:AUTO_FAILED,detail:text||undefined});
  }
}

// 진행 안내 한 줄과 진행 막대(0~1). 사진 5장 기준.
export function autoProgress(current:GenerationState):{message:string;progress:number} {
  const total=current.input.slideCount||5,done=current.slides.length;
  if(current.auto.stage==="saving")return {message:"만든 사진을 저장하고 있어요",progress:.88};
  if(current.auto.stage==="writing")return {message:"올릴 글을 쓰고 있어요",progress:.94};
  if(current.phase==="uploading")return {message:"사진을 올리고 있어요",progress:.02};
  if(current.phase==="planning")return {message:"어떤 순서로 보여 줄지 정하고 있어요",progress:.06};
  if(current.phase==="cover")return {message:"첫 장 사진을 만들고 있어요",progress:.12};
  if(current.phase==="slides"||current.auto.stage==="working")return {message:done?`사진을 만들고 있어요 (${Math.min(done,total)}/${total}장)`:"사진을 만들고 있어요",progress:.15+.7*Math.min(done,total)/total};
  return {message:"",progress:0};
}

// 확인 화면 "장 고치기 → 그림": AI 그림 장은 그림을 새로 만들고(요청이 있으면 그대로), 사장님 사진 장은 다른 사진으로 바꿔 그린다.
// 글만 있는 장(글 중심 본문·홍보 카드)이나 저장된 예전 초안(구성안 없음)은 다시 만들 것이 없어 null.
export function redoSlideKind(current:GenerationState):"ai"|"photo"|"scene"|null {
  const index=activeSlideIndex(current),slide=current.slides[index];
  if(!slide||!current.plan||current.phase!=="idle"||index>=current.plan.slides.length)return null;
  // AI 장면을 못 그려 대신 그린 장은 같은 사진을 참고해 AI로 다시 그린다.
  if(current.sceneMisses.some(miss=>miss.index===index)&&current.photos.length)return "scene";
  if((slide.source==="ai-generated"||slide.source==="ai-edited")&&current.cover)return "ai";
  if((current.photoAssignment[index]?.length??0)>0&&current.photos.length>1)return "photo";
  return null;
}
// refinement: "이 장 고치기 → 그림"에서 고른 요청·직접 적은 말. 사장님 사진 장(photo)은 사진을 바꾸므로 쓰지 않는다.
export async function redoSlide(refinement?:string){
  const kind=redoSlideKind(state);
  if(kind==="ai")return regenerateSlide(refinement);
  if(kind==="scene")return regenerateScene(refinement);
  if(kind==="photo"){const index=activeSlideIndex(state),current=state.photoAssignment[index][0];return swapSlidePhoto((current+1)%state.photos.length);}
}

// ── 만드는 중인 게시물 지키기 ────────────────────────────────────────────────────────────
// 만들기는 화면 밖(이 모듈)에서 돈다. 그래서 다른 게시물을 열거나 새로 시작하면 지금 만드는 것이 소리 없이 멈출 수 있었다.
// 그 전에 한 번 묻고(취소하면 만들던 것을 그대로 두고), 만들기 메뉴로 돌아오면 진행 화면을 다시 보여 준다.
const autoBusy=(stage:AutoStage)=>stage==="working"||stage==="saving"||stage==="writing";
// 지금 무언가를 만드는 중인지(자동 만들기, 장 고치기, 장 넣기·빼기·글자 고치기의 다시 그리기). 사진 올리기는 넣지 않는다(돈이 들지 않고 금방 끝난다).
export const isGenerating=(current:GenerationState)=>current.phase==="planning"||current.phase==="cover"||current.phase==="slides"||autoBusy(current.auto.stage);
// 만드는 중인 게시물의 id(열쇠 "id|장 수"의 앞부분). 만드는 중이 아니면 null.
export const generatingDraftId=(current:GenerationState=state):string|null=>isGenerating(current)&&current.key?current.key.split("|")[0]:null;
// 자동 만들기 중이면 그 게시물의 주제·대상·게시일과 갈래(화면이 새로 열려도 같은 게시물·같은 갈래로 돌아가는 데 쓴다).
export const runningAuto=():{meta:DraftMeta;track?:CarouselTrack}|null=>autoBusy(state.auto.stage)&&state.auto.meta?{meta:state.auto.meta,track:state.input.track}:null;
export const STOP_RUNNING_QUESTION="지금 만드는 게시물이 있어요. 그만두고 새로 시작할까요?";
// 다른 게시물로 옮기기 전에 부른다. 만드는 중이 아니거나 같은 게시물이면 그냥 true.
// 만드는 중이면 한 번 묻고, "확인"이면 그 만들기를 멈춘 뒤 true, "취소"면 아무것도 바꾸지 않고 false.
export function confirmStopGeneration(targetDraftId?:string|null):boolean {
  const running=generatingDraftId();
  if(!running||(targetDraftId&&running===targetDraftId))return true;
  if(typeof window==="undefined"||!window.confirm(STOP_RUNNING_QUESTION))return false;
  cancelGeneration(state.key);
  return true;
}

// 화면이 자동 만들기 결과(장·글)를 가져간 뒤 부른다. 다시 2단계로 돌아가도 곧장 3단계로 넘어가지 않게.
export function acknowledgeAuto(){if(state.auto.stage==="done")patchAuto({stage:"idle",images:undefined,caption:undefined,copyError:undefined,meta:undefined});}
// 만든 장 대신 다른 이미지(글자 카드로 직접 만들기)를 쓰기로 했을 때: 저장된 초안을 다시 연 것과 같은 상태로 바꾼다
// (그래야 확인 화면이 예전 장을 "고친 장"으로 보고 다시 저장하지 않는다).
export function adoptImages(images:ApprovedImage[]){run++;replace({...initialGenerationState(state.key,state.input,images),approved:true});}
// 사장님이 다른 주제로 바꾸거나 새로 만들기를 눌러 이 게시물을 버리기로 했을 때: 그 게시물의 만들기를 멈춘다
// (늦게 끝난 저장·글 쓰기가 새 게시물을 "지금 게시물"로 덮지 않게). 다른 게시물의 만들기는 건드리지 않는다.
export function cancelGeneration(key:string){if(state.key!==key)return;run++;autoRun++;storeRun++;replace(initialGenerationState("",EMPTY_INPUT));}
