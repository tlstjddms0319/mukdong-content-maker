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
};

const EMPTY_INPUT:GenerationInput={topic:"",slideCount:5};

export function initialGenerationState(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]):GenerationState {
  return {key,input,mode:"photo",imageStyle:"photo",slideLayout:DEFAULT_SLIDE_LAYOUT,titleFont:"auto",bodyFont:"auto",theme:"auto",style:input.preferredStyle??"auto",referenceUse:"source",photoPreview:"",photoStatus:"",providerNotice:"",plan:undefined,planFallback:false,covers:[],cover:undefined,slides:approvedImages,activeSlide:0,phase:"idle",error:"",approved:false,refinements:{},photos:[],photoAssignment:[]};
}

// 만든 것들만 비우고 모드·화풍·참고 사진은 남긴다(모드 카드나 표지 다시 만들기에서 쓰는 초기화).
const CLEARED:Partial<GenerationState>={plan:undefined,planFallback:false,refinements:{},covers:[],cover:undefined,slides:[],activeSlide:0,approved:false,error:"",providerNotice:"",photoAssignment:[]};

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

function requestBase(){const {topic,imageBrief,slideCount}=state.input;return {topic,...(imageBrief?{imageBrief}:{}),slideTotal:slideCount,imageStyle:state.imageStyle,slideLayout:state.slideLayout};}
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
  if(!plan||!cover)return;
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
    if(token===run)patch({phase:"idle"});
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

export async function addPhotos(files:File[]){
  const room=MAX_STUDIO_PHOTOS-state.photos.length;
  const picked=files.filter(file=>file.type.startsWith("image/")).slice(0,Math.max(0,room));
  if(!picked.length){if(files.length&&room<=0)patch({error:`사진은 ${MAX_STUDIO_PHOTOS}장까지 쓸 수 있어요.`});return;}
  const token=++run;
  patch({phase:"uploading",error:""});
  try{
    for(const [i,file] of picked.entries()){
      patch({photoStatus:`사진 저장 중 ${i+1}/${picked.length}`});
      const body=new FormData();
      body.append("file",file);
      // 보관함 검색용 이름·검색어. 이름은 파일명, 검색어는 지금 주제.
      body.append("name",file.name.replace(/\.[a-z0-9]+$/i,"").slice(0,60)||"매장 사진");
      body.append("tags",[state.input.topic.slice(0,24)||"홍어","매장 사진"].join(","));
      body.append("kind","photo");
      body.append("credit","묵동홍어마을 직접 촬영");
      const response=await fetch("/api/images/assets",{method:"POST",body});
      const data=await readJsonResponse(response);
      if(token!==run)return;
      if(!response.ok)throw new Error(data.message||"사진을 저장하지 못했어요.");
      patch({photos:[...state.photos,{id:data.asset.id,preview:data.asset.preview,name:data.asset.name}],...CLEARED});
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
    if(token===run)patch({phase:"idle"});
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
function textEditBase(current:GenerationState,index:number):{photos:string[];enhance:boolean}|null {
  const slide=current.plan?.slides[index];
  if(!slide||!current.slides[index])return null;
  const slots=current.photoAssignment[index];
  if(slots?.length)return {photos:slots.map(i=>current.photos[i]?.preview).filter((preview):preview is string=>!!preview),enhance:true};
  if(current.slideLayout==="card"&&photosNeeded(normalizeCardLayout(slide))===0)return {photos:[],enhance:false};
  const bases=current.slides[index].bases;
  return bases?.length?{photos:bases,enhance:false}:null;
}
export const canEditSlideText=(current:GenerationState,index:number)=>textEditBase(current,index)!==null;

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
    const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:effectiveSlide(slide),styleAnchor:plan.styleAnchor,design:effectiveDesign(plan.design),slideIndex:index+1,count:1,...(base.photos.length?{photos:base.photos,enhance:base.enhance}:{})})});
    const data=await readJsonResponse(response);
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"카드를 다시 그리지 못했어요.");
    if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("카드는 정확히 1장이 필요합니다.");
    // 출처(실제 사진/AI)와 밑바탕은 그대로 두고 그림만 바꾼다. 구성안도 고친 글자로 바꿔 캡션이 같은 흐름을 따르게 한다.
    const updated={...state.slides[index],id:crypto.randomUUID(),preview:data.images[0]};
    patch({plan:{...plan,slides:plan.slides.map((item,i)=>i===index?slide:item)},slides:state.slides.map((item,i)=>i===index?updated:item),...(index===0?{cover:updated}:{}),approved:false});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"카드를 다시 그리지 못했어요."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

// 카드로 꾸미지 않고 올린 사진 그대로 캐러셀로 쓴다.
export function approveRawPhotos(onApprove:(images:ApprovedImage[])=>void){
  if(!state.photos.length)return;
  patch({approved:true});
  onApprove(state.photos.map(photo=>({id:photo.id,preview:photo.preview,source:"photo"})));
}
