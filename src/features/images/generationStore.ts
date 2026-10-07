import { useSyncExternalStore } from "react";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH, type CarouselPlan, type CarouselRole, type CarouselSlideCount } from "./carousel";
import type { ImageStyle } from "./style";
import { DEFAULT_SLIDE_LAYOUT, type SlideLayout } from "./slideLayout";
import { normalizeCardLayout, photosNeeded, type DesignSpec } from "./design";
import type { BodyFontId, TitleFontId } from "./typography";
import type { ThemeId } from "./themes";
import type { StyleId } from "./styleCatalog";
import { readJsonResponse } from "@/lib/http/readJson";
import { fitPlanToPhotos, swapPhoto } from "./photoCarousel";

// 이미지 생성 상태를 React 컴포넌트 밖의 모듈 싱글턴에 둔다.
// 화면(ImageStudio)이 언마운트돼도 상태와 진행 중인 fetch 루프는 살아 있고, 다시 마운트되면 그대로 이어 붙는다.
// 새로고침을 하면 사라진다(모듈이 다시 로드되므로). 그 경우는 서버 작업 큐가 필요하다.

// check: AI 표지 점검 결과(coverCheck.ts). 점수와 경고 배지를 후보 위에 보여 준다.
// bases: 글자를 얹기 전 밑바탕 사진(AI 이미지). 카드 글자만 고쳐 다시 그릴 때 쓴다. 초안에는 저장하지 않는다(화면에서만).
export type ApprovedImage={id:string;preview?:string;referencePreview?:string;bases?:string[];source:"photo"|"design"|"ai-generated"|"ai-edited";role?:CarouselRole;check?:{score:number;note:string;warnings:string[]}};
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
  style:FontChoice<StyleId>;      // 디자인 계열(컬러 블록·신문·웹툰 등). "auto"면 구성안이 고른 계열.
  referenceUse:ReferenceUse;
  photoPreview:string;
  photoStatus:string;
  providerNotice:string;
  plan?:CarouselPlan;
  planFallback:boolean;      // AI가 구성안을 못 만들어 준비된 기본 문안으로 채웠는지. 표지 생성 전에 사용자가 다시 시도할 수 있게 멈춘다.
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
  deckEdited:boolean;            // 사용자가 완성된 캐러셀에서 장을 빼거나 넣었는지. 그러면 장 수는 설정값이 아니라 지금 장 수다.
  deckStatus:string;             // 장을 빼고 넣은 뒤 장 번호를 다시 그리는 동안의 진행 안내.
  // 맨 뒤 가게 홍보 카드(사장님 결정: 모든 캐러셀 끝에 "묵동홍어마을" 홍보 카드 한 장, 이미지 AI 비용 없음).
  // include: 붙일지(장 고치기에서 끌 수 있음). image: 그려 둔 카드. key: 그릴 때의 디자인·장 수(바뀌면 다시 그린다).
  storeCard:{include:boolean;image?:ApprovedImage;key?:string;pending?:boolean};
};

const EMPTY_INPUT:GenerationInput={topic:"",slideCount:5};

export function initialGenerationState(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]):GenerationState {
  return {key,input,mode:"photo",imageStyle:"photo",slideLayout:DEFAULT_SLIDE_LAYOUT,titleFont:"auto",bodyFont:"auto",theme:"auto",style:input.preferredStyle??"auto",referenceUse:"source",photoPreview:"",photoStatus:"",providerNotice:"",plan:undefined,planFallback:false,covers:[],cover:undefined,slides:approvedImages,activeSlide:0,phase:"idle",error:"",approved:false,refinements:{},photos:[],photoAssignment:[],
    // 저장된 초안을 다시 열었는데 장 수가 설정과 다르면(예전에 장을 고친 초안) 이미 고친 캐러셀로 본다.
    deckEdited:approvedImages.length>0&&approvedImages.length!==input.slideCount,deckStatus:"",
    // 저장된 초안을 다시 연 경우에는 이미 저장된 장(홍보 카드 포함)을 그대로 쓰므로 새로 붙이지 않는다.
    storeCard:{include:approvedImages.length===0}};
}

// 만든 것들만 비우고 모드·화풍·참고 사진은 남긴다(모드 카드나 표지 다시 만들기에서 쓰는 초기화).
const CLEARED:Partial<GenerationState>={plan:undefined,planFallback:false,refinements:{},covers:[],cover:undefined,slides:[],activeSlide:0,approved:false,error:"",providerNotice:"",photoAssignment:[],deckEdited:false,deckStatus:""};

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

export function chooseMode(next:StudioMode){run++;patch({...CLEARED,mode:next,phase:"idle"});}
export function setImageStyle(imageStyle:ImageStyle){patch({imageStyle});}
export function setSlideLayout(slideLayout:SlideLayout){patch({slideLayout});}
export function setTitleFont(titleFont:FontChoice<TitleFontId>){patch({titleFont});}
export function setBodyFont(bodyFont:FontChoice<BodyFontId>){patch({bodyFont});}
export function setTheme(theme:FontChoice<ThemeId>){patch({theme});}
export function setStyle(style:FontChoice<StyleId>){patch({style});}

// 서버에 보낼 디자인: 구성안의 추천(palette·글꼴)에 사용자가 직접 고른 글꼴을 덮어쓴다.
// 요청을 보낼 때마다 계산하므로, 도중에 글꼴을 바꾸면 그다음에 만드는 장부터 적용된다.
export function effectiveDesign(design:DesignSpec,current:Pick<GenerationState,"titleFont"|"bodyFont">&{theme?:FontChoice<ThemeId>;style?:FontChoice<StyleId>}=state):DesignSpec {
  return {...design,...(current.titleFont!=="auto"?{titleFont:current.titleFont}:{}),...(current.bodyFont!=="auto"?{bodyFont:current.bodyFont}:{}),...(current.theme&&current.theme!=="auto"?{theme:current.theme}:{}),...(current.style&&current.style!=="auto"?{style:current.style}:{})};
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

// 카드에 찍는 전체 장 수("3 / 7"의 7). 장을 고친 캐러셀은 지금 장 수, 아니면 설정한 장 수.
export const deckTotal=(current:GenerationState)=>current.deckEdited?current.slides.length:current.input.slideCount;
// 캐러셀이 다 만들어졌는지(장 빼기·넣기 뒤에는 장 수가 설정값과 달라도 완성).
export const deckComplete=(current:GenerationState)=>current.slides.length>0&&(current.deckEdited||current.slides.length===current.input.slideCount);
// 홍보 카드를 붙이는 캐러셀인지: 구성안으로 그린 캐러셀(실제 사진 카드·AI)만. 무료 카드·사진 그대로는 붙이지 않는다.
export const storeCardOn=(current:GenerationState)=>current.storeCard.include&&Boolean(current.plan)&&current.mode!=="free";
// 게시물 전체 장 수(홍보 카드 포함). 카드에 찍히는 장 번호 "n / 전체"가 이 수를 쓴다.
export const postTotal=(current:GenerationState)=>deckTotal(current)+(storeCardOn(current)?1:0);
// "이 캐러셀 사용"으로 넘길 이미지: 내용 장 + (붙였으면) 맨 뒤 홍보 카드.
export const approvedDeck=(current:GenerationState):ApprovedImage[]=>[...current.slides,...(storeCardOn(current)&&current.storeCard.image?[current.storeCard.image]:[])];
// 홍보 카드를 그리는 중인지. 그리는 동안 "이 캐러셀 사용"을 막는다(카드에는 이미 "n / 전체+1"이 찍혀 있어 빠지면 장 번호가 어긋난다).
export const storeCardPending=(current:GenerationState)=>storeCardOn(current)&&Boolean(current.storeCard.pending);
let storeRun=0;
// 홍보 카드를 (다시) 그린다. 디자인·장 수가 그대로면 그려 둔 것을 쓴다. 실패해도 캐러셀은 그대로 쓸 수 있게 조용히 넘어간다.
export async function ensureStoreCard(){
  if(!storeCardOn(state)||!deckComplete(state)||!state.plan)return;
  const design=effectiveDesign(state.plan.design),total=postTotal(state);
  const key=JSON.stringify([design,total]);
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
function requestBase(){const {topic,imageBrief}=state.input;return {topic,...(imageBrief?{imageBrief}:{}),slideTotal:postTotal(state),...(state.deckEdited?{deckEdited:true}:{}),...(storeCardOn(state)?{storeCard:true}:{}),imageStyle:state.imageStyle,slideLayout:state.slideLayout};}
// 참고 사진(mix)이 있으면 그것을, 아니면 고른 표지의 글자 없는 원본을 이어 가기용으로 붙인다.
function referenceFields(){return state.mode==="mix"?{referenceImage:state.photoPreview,referenceMode:state.referenceUse}:state.cover?.referencePreview?{referenceImage:state.cover.referencePreview,referenceMode:"continuity"}:{};}
const sourceOf=(reported?:string)=>(reported??(state.mode==="mix"?"ai-edited":"ai-generated")) as ApprovedImage["source"];

export async function uploadPhoto(file:File|undefined,onApprove:(images:ApprovedImage[])=>void,reference=state.mode==="mix"){
  if(!file)return;
  const token=++run;
  patch({phase:"uploading",error:""});
  try{
    const preview=await readPreview(file);
    if(token!==run)return;
    patch({photoPreview:preview});
    const body=new FormData();body.append("file",file);
    const response=await fetch("/api/media/upload",{method:"POST",body});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message);
    patch({photoStatus:`${file.name} ${reference?"참고 사진을":"사진을"} 저장했어요.`});
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
    if(data.provider==="fallback"){patch({plan:next,planFallback:true,phase:"idle"});return;}
    patch({plan:next,planFallback:false,...reviewNotice(data.review)});
    void requestCovers(next,token);
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"구성안을 만들지 못했습니다.",phase:"idle"});
  }
}

async function generate(slide:CarouselPlan["slides"][number],index:number,refinement=""):Promise<ApprovedImage>{
  // 콜라주형은 사진 세 장을 만들어 한 카드에 넣는다. 서버는 합친 카드 한 장만 돌려준다.
  const count=state.slideLayout==="card"?Math.max(1,photosNeeded(normalizeCardLayout(slide))):1;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:effectiveSlide(slide),styleAnchor:state.plan!.styleAnchor,design:effectiveDesign(state.plan!.design),slideIndex:index,count,...(refinement.trim()?{refinement:refinement.trim()}:{}),...referenceFields()})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"이미지를 만들지 못했습니다.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("슬라이드 이미지는 정확히 1장이 필요합니다.");
  if(data.fallback)patch({providerNotice:data.notice??"처음 고른 이미지 AI가 실패해 다른 AI로 전환했어요."});
  return {id:crypto.randomUUID(),preview:data.images[0],referencePreview:data.referenceImages?.[0],...(data.baseImages?.[0]?{bases:data.baseImages[0]}:{}),source:sourceOf(data.source),role:slide.role};
}

// 고른 표지 뒤의 남은 장을 차례로 만든다. 화면이 사라져도 이 루프는 계속 돌고 결과는 저장소에 쌓인다.
export async function finishSlides(){
  const {plan,cover,slides,input}=state;
  // 장을 빼거나 넣은 뒤에는 설정 장 수까지 다시 채우지 않는다(사용자가 고른 장 수를 지킨다).
  if(!plan||!cover||state.deckEdited)return;
  const token=++run;
  let next=slides[0]?.id===cover.id?slides:[cover];
  patch({phase:"slides",error:"",slides:next});
  try{
    for(let i=next.length;i<input.slideCount;i++){
      const generated=await generate(plan.slides[i],i+1);
      if(token!==run)return;
      next=[...next,generated];
      patch({slides:next});
    }
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"남은 슬라이드를 만들지 못했습니다."});
  }finally{
    if(token===run){patch({phase:"idle"});void ensureStoreCard();}
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
  // 보관함 검색용 이름·검색어. 이름은 파일명, 검색어는 지금 주제.
  body.append("name",file.name.replace(/\.[a-z0-9]+$/i,"").slice(0,60)||"매장 사진");
  body.append("tags",[state.input.topic.slice(0,24)||"홍어","매장 사진"].join(","));
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

async function composePhotoSlide(plan:CarouselPlan,index:number,slots:number[]):Promise<ApprovedImage>{
  const slide=plan.slides[index];
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slideLayout:"card",slide:effectiveSlide(slide),styleAnchor:plan.styleAnchor,design:effectiveDesign(plan.design),slideIndex:index+1,count:1,...(slots.length?{photos:slots.map(i=>state.photos[i].preview)}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"카드를 만들지 못했어요.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
  return {id:crypto.randomUUID(),preview:data.images[0],source:slots.length?"photo":"design",role:slide.role};
}

// 구성안을 만들고, 사진 수에 맞게 장을 조정한 뒤, 장마다 카드를 그린다. AI 이미지는 만들지 않는다.
export async function buildPhotoCarousel(){
  if(!state.photos.length)return;
  const token=++run;
  patch({...CLEARED,phase:"planning",slideLayout:"card"});
  try{
    const {topic,imageBrief,contentBrief,slideCount}=state.input;
    const response=await fetch("/api/images/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,...(imageBrief?{imageBrief}:{}),...(contentBrief?{contentBrief}:{}),slideCount,imageStyle:"photo"})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"구성안을 만들지 못했습니다.");
    const fit=fitPlanToPhotos(data.plan as CarouselPlan,state.photos.length);
    // 기본 문안이어도 비용이 들지 않으니 멈추지 않고, 안내만 남긴다.
    patch({plan:fit.plan,planFallback:data.provider==="fallback",photoAssignment:fit.assignment,phase:"slides",...reviewNotice(data.review)});
    let next:ApprovedImage[]=[];
    for(let i=0;i<fit.plan.slides.length;i++){
      const card=await composePhotoSlide(fit.plan,i,fit.assignment[i]);
      if(token!==run)return;
      next=[...next,card];
      patch({slides:next,...(i===0?{cover:card}:{})});
    }
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"사진 캐러셀을 만들지 못했어요."});
  }finally{
    if(token===run){patch({phase:"idle"});void ensureStoreCard();}
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
    const card=await composePhotoSlide(plan,index,slots);
    if(token!==run)return;
    patch({slides:state.slides.map((item,i)=>i===index?card:item),photoAssignment:state.photoAssignment.map((item,i)=>i===index?slots:item),...(index===0?{cover:card}:{}),approved:false});
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
function textEditBase(current:GenerationState,index:number):{photos:string[];photoKind:"real"|"ai"|"none"}|null {
  const slide=current.plan?.slides[index];
  if(!slide||!current.slides[index])return null;
  const slots=current.photoAssignment[index];
  if(slots?.length)return {photos:slots.map(i=>current.photos[i]?.preview).filter((preview):preview is string=>!!preview),photoKind:"real"};
  if(current.slideLayout==="card"&&photosNeeded(normalizeCardLayout(slide))===0)return {photos:[],photoKind:"none"};
  const bases=current.slides[index].bases;
  return bases?.length?{photos:bases,photoKind:"ai"}:null;
}
export const canEditSlideText=(current:GenerationState,index:number)=>textEditBase(current,index)!==null;

// 밑바탕(사진·AI 원본·없음)으로 한 장을 다시 그린다. 이미지 AI를 부르지 않는다(비용 없음).
// 장 번호·전체 장 수는 지금 상태(deckTotal)를 따른다.
async function renderCard(index:number,slide:CarouselPlan["slides"][number],base:{photos:string[];photoKind:"real"|"ai"|"none"}):Promise<string>{
  const plan=state.plan!;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:effectiveSlide(slide),styleAnchor:plan.styleAnchor,design:effectiveDesign(plan.design),slideIndex:index+1,count:1,...(base.photos.length?{photos:base.photos,photoKind:base.photoKind}:{})})});
  const data=await readJsonResponse(response);
  if(!response.ok)throw new Error(data.message||"카드를 다시 그리지 못했어요.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
  return data.images[0];
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
    const preview=await renderCard(index,slide,base);
    if(token!==run)return;
    // 출처(실제 사진/AI)와 밑바탕은 그대로 두고 그림만 바꾼다. 구성안도 고친 글자로 바꿔 캡션이 같은 흐름을 따르게 한다.
    const updated={...state.slides[index],id:crypto.randomUUID(),preview};
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
    const preview=await renderCard(i,state.plan.slides[i],base);
    if(token!==run)return;
    const updated={...state.slides[i],id:crypto.randomUUID(),preview};
    patch({slides:state.slides.map((item,k)=>k===i?updated:item),...(i===0?{cover:updated}:{})});
  }
  void ensureStoreCard();
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
export async function addSlide(input:NewSlide){
  if(state.slides.length>=MAX_DECK_SLIDES){patch({error:`캐러셀은 ${MAX_DECK_SLIDES}장까지예요.`});return;}
  if(state.phase!=="idle")return;
  const position=Math.min(activeSlideIndex(state)+1,state.slides.length);
  if(!state.plan){
    if(!input.photo){patch({error:"넣을 사진을 골라 주세요."});return;}
    const image:ApprovedImage={id:crypto.randomUUID(),preview:input.photo.preview,source:"photo"};
    const slides=[...state.slides];slides.splice(position,0,image);
    patch({slides,deckEdited:true,approved:false,activeSlide:position,error:""});
    return;
  }
  if(input.verbatim){
    const problem=slideTextProblem({headline:input.headline,points:input.points});
    if(problem){patch({error:problem});return;}
  }else if(![input.headline,...input.points].some(text=>text.trim())){patch({error:"어떤 장을 넣을지 적어 주세요."});return;}
  if(input.source==="photo"&&!input.photo){patch({error:"새 장에 넣을 사진을 골라 주세요."});return;}
  const plan=state.plan;
  // 요청으로 읽기: 문안 AI가 카드 제목·요점·사진 장면을 짓는다(실패하면 서버가 규칙으로 지은 문구를 준다).
  let drafted:Partial<Pick<NewSlide,"headline"|"points">>&{visualPrompt?:string;keywords?:string[]}={};
  if(!input.verbatim&&input.source!=="raw"){
    patch({phase:"slides",deckStatus:"요청에 맞게 새 장 문구를 짓는 중…",error:""});
    try{
      const response=await fetch("/api/images/slide",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        topic:state.input.topic,request:[input.headline,...input.points].map(text=>text.trim()).filter(Boolean).join("\n").slice(0,400),
        previous:plan.slides[position-1]?.headline??"",next:plan.slides[position]?.headline??"",source:input.source,
      })});
      const data=await readJsonResponse(response);
      if(!response.ok||!data.draft)throw new Error(data.message||"새 장 문구를 짓지 못했어요.");
      // 가게 홍보 카드를 원하는 요청이면 새 장을 따로 만들지 않고 맨 뒤 홍보 카드(낙관·가게 이름·마스코트)를 켠다.
      if(data.draft.kind==="store"){
        patch({phase:"idle",deckStatus:"",providerNotice:"가게 홍보 카드는 맨 뒤에 자동으로 붙어요(로고·가게 이름·마스코트). 장 고치기에서 켜고 끌 수 있어요."});
        if(!state.storeCard.include)await setStoreCardIncluded(true);else void ensureStoreCard();
        return;
      }
      drafted={headline:data.draft.headline,points:data.draft.points,visualPrompt:data.draft.visualPrompt,keywords:data.draft.keywords};
    }catch(error){
      patch({phase:"idle",deckStatus:"",error:error instanceof Error?error.message:"새 장 문구를 짓지 못했어요."});
      return;
    }
    patch({phase:"idle",deckStatus:""});
  }
  const slide=newSlidePlan({...input,...drafted},plan.slides[position-1]);
  // 사진은 스튜디오 사진 목록에 넣고(이미 있으면 그 번호) 이 장에 배정한다. 사진 수 한도(10장)를 넘지 않는다.
  let photos=state.photos,slots:number[]=[];
  if(input.source==="photo"&&input.photo){
    const existing=photos.findIndex(photo=>photo.id===input.photo!.id);
    if(existing>=0)slots=[existing];
    else if(photos.length<MAX_STUDIO_PHOTOS){photos=[...photos,input.photo];slots=[photos.length-1];}
    else{patch({error:`사진은 ${MAX_STUDIO_PHOTOS}장까지 쓸 수 있어요. 쓰지 않는 사진을 빼 주세요.`});return;}
  }
  const placeholder:ApprovedImage={id:crypto.randomUUID(),source:input.source==="photo"?"photo":input.source==="ai"?sourceOf():"design",role:slide.role};
  const slides=[...state.slides];slides.splice(position,0,placeholder);
  const assignment=state.slides.map((_,i)=>state.photoAssignment[i]??[]);assignment.splice(position,0,slots);
  const refinements=Object.fromEntries(Object.entries(state.refinements).map(([key,value])=>{const i=Number(key);return [i>=position?i+1:i,value];}));
  const token=++run;
  patch({slides,photos,photoAssignment:assignment,refinements,plan:{...plan,slides:[...plan.slides.slice(0,position),slide,...plan.slides.slice(position)]},deckEdited:true,approved:false,activeSlide:position,error:"",providerNotice:"",phase:"slides",deckStatus:"새 장을 그리는 중"});
  try{
    const card=input.source==="ai"?await generate(slide,position+1):{...placeholder,preview:await renderCard(position,slide,{photos:slots.map(i=>photos[i].preview),photoKind:slots.length?"real":"none"})};
    if(token!==run)return;
    patch({slides:state.slides.map(item=>item.id===placeholder.id?{...card,id:placeholder.id}:item)});
    await redrawDeck(token,position);
  }catch(error){
    // 새 장을 못 그렸으면 끼워 넣은 자리를 되돌린다(빈 장이 남지 않게).
    if(token===run){
      const at=state.slides.findIndex(item=>item.id===placeholder.id);
      if(at>=0&&!state.slides[at].preview)patch({slides:state.slides.filter((_,i)=>i!==at),plan:{...state.plan!,slides:state.plan!.slides.filter((_,i)=>i!==at)},photoAssignment:state.photoAssignment.filter((_,i)=>i!==at),activeSlide:Math.max(0,at-1)});
      patch({error:error instanceof Error?error.message:"새 장을 만들지 못했어요."});
    }
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
