import { useSyncExternalStore } from "react";
import type { CarouselPlan, CarouselRole, CarouselSlideCount } from "./carousel";
import type { ImageStyle } from "./style";
import { DEFAULT_SLIDE_LAYOUT, type SlideLayout } from "./slideLayout";
import { normalizeCardLayout, photosNeeded, type DesignSpec } from "./design";
import type { BodyFontId, TitleFontId } from "./typography";

// 이미지 생성 상태를 React 컴포넌트 밖의 모듈 싱글턴에 둔다.
// 화면(ImageStudio)이 언마운트돼도 상태와 진행 중인 fetch 루프는 살아 있고, 다시 마운트되면 그대로 이어 붙는다.
// 새로고침을 하면 사라진다(모듈이 다시 로드되므로). 그 경우는 서버 작업 큐가 필요하다.

export type ApprovedImage={id:string;preview?:string;referencePreview?:string;source:"photo"|"design"|"ai-generated"|"ai-edited";role?:CarouselRole};
export type StudioMode="photo"|"ai"|"mix"|"free";
export type StudioPhase="idle"|"uploading"|"planning"|"cover"|"slides";
export type ReferenceUse="source"|"style";
export type GenerationInput={topic:string;imageBrief?:string;contentBrief?:string;slideCount:CarouselSlideCount};
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
};

const EMPTY_INPUT:GenerationInput={topic:"",slideCount:5};

export function initialGenerationState(key:string,input:GenerationInput,approvedImages:ApprovedImage[]=[]):GenerationState {
  return {key,input,mode:"photo",imageStyle:"photo",slideLayout:DEFAULT_SLIDE_LAYOUT,titleFont:"auto",bodyFont:"auto",referenceUse:"source",photoPreview:"",photoStatus:"",providerNotice:"",plan:undefined,planFallback:false,covers:[],cover:undefined,slides:approvedImages,activeSlide:0,phase:"idle",error:"",approved:false,refinements:{}};
}

// 만든 것들만 비우고 모드·화풍·참고 사진은 남긴다(모드 카드나 표지 다시 만들기에서 쓰는 초기화).
const CLEARED:Partial<GenerationState>={plan:undefined,planFallback:false,refinements:{},covers:[],cover:undefined,slides:[],activeSlide:0,approved:false,error:"",providerNotice:""};

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

// 서버에 보낼 디자인: 구성안의 추천(palette·글꼴)에 사용자가 직접 고른 글꼴을 덮어쓴다.
// 요청을 보낼 때마다 계산하므로, 도중에 글꼴을 바꾸면 그다음에 만드는 장부터 적용된다.
export function effectiveDesign(design:DesignSpec,current:Pick<GenerationState,"titleFont"|"bodyFont">=state):DesignSpec {
  return {...design,...(current.titleFont!=="auto"?{titleFont:current.titleFont}:{}),...(current.bodyFont!=="auto"?{bodyFont:current.bodyFont}:{})};
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
    const data=await response.json();
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
    const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide:nextPlan.slides[0],styleAnchor:nextPlan.styleAnchor,design:effectiveDesign(nextPlan.design),slideIndex:1,count:2,...(state.refinements[0]?.trim()?{refinement:state.refinements[0].trim()}:{}),...(state.mode==="mix"?{referenceImage:state.photoPreview,referenceMode:state.referenceUse}:{})})});
    const data=await response.json();
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"표지 후보를 만들지 못했습니다.");
    if(!Array.isArray(data.images)||data.images.length!==2)throw new Error("표지 후보는 정확히 2장이 필요합니다.");
    const source=sourceOf(data.source);
    patch({...(data.fallback?{providerNotice:data.notice??"처음 고른 이미지 AI가 실패해 다른 AI로 전환했어요."}:{}),covers:data.images.map((preview:string,i:number)=>({id:crypto.randomUUID(),preview,referencePreview:data.referenceImages?.[i],source,role:nextPlan.slides[0].role}))});
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"표지 후보를 만들지 못했습니다."});
  }finally{
    if(token===run)patch({phase:"idle"});
  }
}

export async function startPlan(){
  const token=++run;
  patch({...CLEARED,phase:"planning"});
  try{
    const {topic,imageBrief,contentBrief,slideCount}=state.input;
    const response=await fetch("/api/images/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,...(imageBrief?{imageBrief}:{}),...(contentBrief?{contentBrief}:{}),slideCount,imageStyle:state.imageStyle})});
    const data=await response.json();
    if(token!==run)return;
    if(!response.ok)throw new Error(data.message||"구성안을 만들지 못했습니다.");
    const next=data.plan as CarouselPlan;
    // 기본 문안은 주제와 무관한 일반 문장이라, 그걸로 이미지를 만들어 크레딧을 쓰기 전에 멈추고 알린다.
    if(data.provider==="fallback"){patch({plan:next,planFallback:true,phase:"idle"});return;}
    patch({plan:next,planFallback:false});
    void requestCovers(next,token);
  }catch(error){
    if(token===run)patch({error:error instanceof Error?error.message:"구성안을 만들지 못했습니다.",phase:"idle"});
  }
}

async function generate(slide:CarouselPlan["slides"][number],index:number,refinement=""):Promise<ApprovedImage>{
  // 콜라주형은 사진 세 장을 만들어 한 카드에 넣는다. 서버는 합친 카드 한 장만 돌려준다.
  const count=state.slideLayout==="card"?Math.max(1,photosNeeded(normalizeCardLayout(slide))):1;
  const response=await fetch("/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...requestBase(),slide,styleAnchor:state.plan!.styleAnchor,design:effectiveDesign(state.plan!.design),slideIndex:index,count,...(refinement.trim()?{refinement:refinement.trim()}:{}),...referenceFields()})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.message||"이미지를 만들지 못했습니다.");
  if(!Array.isArray(data.images)||data.images.length!==1)throw new Error("슬라이드 이미지는 정확히 1장이 필요합니다.");
  if(data.fallback)patch({providerNotice:data.notice??"처음 고른 이미지 AI가 실패해 다른 AI로 전환했어요."});
  return {id:crypto.randomUUID(),preview:data.images[0],referencePreview:data.referenceImages?.[0],source:sourceOf(data.source),role:slide.role};
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
