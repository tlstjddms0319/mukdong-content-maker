import { LAYOUT_VARIANTS, normalizeCardLayout, photosNeeded, type CardLayout } from "./design";
import type { CarouselPlan, CarouselRole, CarouselSlidePlan } from "./carousel";
import { menuOf } from "@/features/store/menu";
import type { CarouselTrack } from "./track";

// 실제 사진 여러 장으로 캐러셀을 만들 때, 구성안(AI가 장마다 고른 레이아웃)을 가진 사진 수에 맞춘다.
// 화면 코드에서도 쓰므로 서버 전용 모듈(sharp 등)을 불러오지 않는다.
//
// 원칙
// 1. 표지는 항상 첫 번째 사진을 쓴다.
// 2. 사진이 모자라면 덜 중요한 장부터 "사진 없는 글자 레이아웃"(체크리스트·Q&A·영수증 등)으로 바꾼다. AI 이미지는 만들지 않는다.
// 3. 사진이 남으면 비교 장(versus)의 둘째 사진, 글자 카드로 정해진 장의 사진 순서로 넣고(올린 사진이 글자 카드보다 먼저), 그래도 남으면
//    사진 한 장짜리 장을 두 장(폴라로이드)·세 장(콜라주) 레이아웃으로 키워 올린 사진을 최대한 쓴다.
// 4. 한 장에 넣는 사진은 maxPerSlide까지. 디자인 계열(칠판·한지 등)은 한 장에 사진을 두 장까지만 그리므로 2,
//    기본 템플릿만 3(콜라주)이다. 넘겨 주면 그리지 못한 사진이 말없이 빠진다.
// 5. 사진은 올린 순서대로 장 순서에 맞춰 나눠 준다(이야기 흐름과 사진 순서가 같게). 다 못 넣은 사진은 unused로 알려 준다.

// 사진을 먼저 받을 장의 우선순위(표지는 따로 처리). 음식이 주인공인 장이 앞에 온다.
const PHOTO_PRIORITY:CarouselRole[]=["detail","overview","pairing","mood","occasion","process","how-to","visit","cta"];

// 사진이 없을 때 역할별로 쓸 글자 레이아웃. 대형 숫자(stat)는 확인된 숫자가 필요해 쓰지 않는다.
const TEXT_LAYOUT:Record<CarouselRole,CardLayout>={
  cover:"quote",detail:"qa",overview:"checklist","how-to":"checklist",pairing:"qa",
  process:"timeline",occasion:"qa",mood:"browser",visit:"receipt",cta:"receipt",
};
// 사진 한 장으로 줄일 때 쓰는 레이아웃(콜라주·비교·폴라로이드를 한 장짜리로).
const SINGLE_LAYOUT:CardLayout="frame";
// 사진이 남을 때 키워 줄 수 있는 역할(장면을 여러 컷으로 보여 주기 좋은 장).
const EXPANDABLE:CarouselRole[]=["overview","detail","pairing","mood","occasion"];
// 사진이 남아도 글자 레이아웃을 지키는 장: 대형 숫자(stat)는 숫자가 주인공이라 사진 카드로 바꾸면 숫자가 사라진다.
const KEEP_TEXT:ReadonlySet<CardLayout>=new Set(["stat"]);

export type PhotoFit={plan:CarouselPlan;assignment:number[][];unused:number[]};
// track: 갈래(track.ts). 갈래 디자인은 장마다 사진 수만 본다.
//   사진 중심: 한 장에 사진은 1장까지(콜라주·폴라로이드로 키우지 않는다). 사진이 모자란 장은 사진 없는 장(browser).
//   글 중심  : 표지에만 첫 사진, 본문 장은 사진 0장(글이 주인공). 나머지 사진은 unused로 남는다.
export type PhotoFitOptions={maxPerSlide?:2|3;track?:CarouselTrack};
// 갈래 디자인에서 사진 없는 장의 layout(사진 0장을 뜻하는 이름일 뿐, 역할별 글자 레이아웃은 쓰지 않는다).
const TRACK_TEXT_LAYOUT:CardLayout="browser";

export function fitPlanToPhotos(plan:CarouselPlan,photoCount:number,options:PhotoFitOptions={}):PhotoFit {
  if(photoCount<1)throw new Error("사진이 1장 이상 필요해요.");
  if(options.track==="text"){
    const slides=plan.slides.map((slide,i)=>i===0?{...slide,layout:photosNeeded(normalizeCardLayout(slide))===1?normalizeCardLayout(slide):"fullscreen" as CardLayout,variant:0}:{...slide,layout:TRACK_TEXT_LAYOUT,variant:0});
    return {plan:{...plan,slides},assignment:slides.map((_,i)=>i===0?[0]:[]),unused:Array.from({length:photoCount-1},(_,k)=>k+1)};
  }
  const max=options.track==="photo"?1:options.maxPerSlide??3;
  const slides=plan.slides.map(slide=>({...slide,layout:normalizeCardLayout(slide)}));
  // 장마다 원래 원하던 사진 수(최소 0, 최대 max). 표지는 최소 1장.
  const want=slides.map((slide,i)=>Math.min(max,Math.max(i===0?1:0,photosNeeded(slide.layout))));
  const give=slides.map(()=>0);
  let budget=photoCount;
  // 1단계: 표지에 한 장, 그다음 우선순위대로 사진을 원하는 장에 한 장씩.
  give[0]=1;budget--;
  const order=slides.map((slide,i)=>({role:slide.role,i})).filter(item=>item.i>0)
    .sort((a,b)=>PHOTO_PRIORITY.indexOf(a.role)-PHOTO_PRIORITY.indexOf(b.role)||a.i-b.i);
  for(const {i} of order)if(budget>0&&want[i]>0){give[i]=1;budget--;}
  // 2단계: 비교 장(versus)은 사진 두 장이 있어야 비교가 되므로 먼저 둘째 사진을 채운다.
  const fill=(only:(i:number)=>boolean)=>{for(const {i} of [{i:0},...order])while(only(i)&&budget>0&&give[i]>0&&give[i]<want[i]){give[i]++;budget--;}};
  fill(i=>slides[i].layout==="versus");
  // 3단계: 그래도 남으면 글자 카드로 정해진 장에 한 장씩(사장님 사진이 글자 카드보다 먼저). 대형 숫자 장은 그대로 둔다.
  for(const {i} of order)if(budget>0&&give[i]===0&&!KEEP_TEXT.has(slides[i].layout)){give[i]=1;budget--;}
  // 4단계: 여러 컷을 원하던 장(콜라주·폴라로이드)을 채운다.
  fill(()=>true);
  // 5단계: 그래도 남으면 한 장짜리 장을 여러 장 레이아웃으로 키운다(표지는 그대로). 한 장에 max장까지.
  for(const {i,role} of order){
    if(budget<=0)break;
    if(!EXPANDABLE.includes(role)||give[i]!==1)continue;
    const extra=Math.min(max-1,budget);
    give[i]+=extra;budget-=extra;
  }
  // 받은 사진 수에 맞는 레이아웃으로 바꾼다. 원래 레이아웃이 그 수에 맞으면 그대로 둔다.
  const fitted=slides.map((slide,i)=>{
    const count=give[i];
    let layout=slide.layout;
    if(photosNeeded(layout)!==count){
      layout=count===0?(options.track?TRACK_TEXT_LAYOUT:TEXT_LAYOUT[slide.role]):count===1?SINGLE_LAYOUT:count===2?(slide.layout==="versus"?"versus":"polaroid"):"collage";
    }
    // 바뀐 레이아웃의 변형 개수를 넘지 않게 변형 번호를 맞춘다.
    const variant=Math.min(slide.variant??0,LAYOUT_VARIANTS[layout]-1);
    return {...slide,layout,variant};
  });
  // 장 순서대로 사진 번호를 나눠 준다.
  let next=0;
  const assignment=give.map(count=>Array.from({length:count},()=>next++));
  return {plan:{...plan,slides:fitted},assignment,unused:Array.from({length:photoCount-next},(_,k)=>next+k)};
}

// 한 장의 사진을 바꿀 때: 그 장의 첫 칸을 고른 사진으로 바꾸고, 같은 사진이 다른 칸에 있으면 자리를 맞바꾼다.
export function swapPhoto(slots:number[],photoIndex:number,slot=0):number[] {
  const next=[...slots];
  const existing=next.indexOf(photoIndex);
  if(existing>=0)next[existing]=next[slot];
  next[slot]=photoIndex;
  return next;
}

// ── 사진을 글이 맞는 장에 넣기 ─────────────────────────────────────────────────────────────
// fitPlanToPhotos는 장마다 사진 "몇 장"을 정하고 올린 순서대로 나눠 준다. 사진마다 보이는 것(notes, AI가 읽은 음식·장면)을
// 알면, 그 칸 수는 그대로 두고 어느 사진을 어느 장에 넣을지를 글과 겹치는 정도로 다시 고른다.
// 예: "사발에 따르면 이런 빛이에요" 장에는 홍어 접시보다 막걸리 사발이 보이는 사진.
// - 표지 첫 칸은 사장님이 고른 첫 사진 그대로.
// - 점수가 같으면 원래 배치(올린 순서)를 지킨다. 사진 내용을 하나도 모르면 아무것도 바꾸지 않는다.
// - 칸보다 사진이 많으면 글과 가장 덜 맞는 사진이 unused로 남는다.

// 메뉴 말고도 장면을 가르는 낱말(술·곁들임·사람 요소·찍은 거리). 같은 낱말이 장 글과 사진 설명에 함께 있으면 1점.
const SCENE_WORDS:ReadonlyArray<RegExp>=[
  /막걸리|사발|술잔|잔(?![가-힣]*치)/,/손(?!님)|젓가락|집어/,/수육|돼지고기|보쌈/,/김치|묵은지/,/삼합/,
  /상차림|한\s*상|식탁|테이블/,/가까이|단면|결|클로즈업/,/위에서|내려다/,/전(?:을|이|과|은)?\s|부침|노릇/,/국물|뚝배기|탕/,
];
const slideText=(slide:CarouselSlidePlan)=>[slide.headline,slide.subline,...(slide.points??[]),slide.visualPrompt,...(slide.keywords??[])].filter(Boolean).join(" ");

// 장 글과 사진 설명이 얼마나 맞는지. 같은 메뉴 3점, 장면 낱말 1점씩. 사진 설명이 비면 0.
export function photoMatchScore(slide:CarouselSlidePlan,note:string):number {
  if(!note.trim())return 0;
  const text=slideText(slide);
  const menus=new Set(menuOf(text).map(item=>item.id));
  const shared=menuOf(note).filter(item=>menus.has(item.id)).length;
  return shared*3+SCENE_WORDS.filter(word=>word.test(text)&&word.test(note)).length;
}

export function matchPhotosToSlides(plan:CarouselPlan,assignment:number[][],notes:readonly string[]):{assignment:number[][];unused:number[]} {
  const total=notes.length;
  const unusedOf=(slots:number[][])=>{const used=new Set(slots.flat());return Array.from({length:total},(_,i)=>i).filter(i=>!used.has(i));};
  if(!notes.some(note=>note.trim()))return {assignment,unused:unusedOf(assignment)};
  // 바꿀 수 있는 칸: 표지 사진(0번)이 들어간 칸을 뺀 모든 칸. 후보 사진: 0번을 뺀 모든 사진(지금 빠진 사진 포함).
  const slots=assignment.flatMap((photos,slide)=>photos.map((photo,slot)=>({slide,slot,original:photo}))).filter(item=>item.original!==0);
  const pool=new Set(Array.from({length:total},(_,i)=>i).filter(i=>i!==0));
  const next=assignment.map(photos=>[...photos]);
  const open=new Set(slots.map((_,index)=>index));
  // 가장 잘 맞는 (칸, 사진) 짝부터 정한다. 같으면 원래 그 칸에 있던 사진, 그다음 앞 장·앞 사진.
  while(open.size&&pool.size){
    let best:{slot:number;photo:number;score:number;keep:number}|null=null;
    for(const index of open){
      const item=slots[index];
      for(const photo of pool){
        const score=photoMatchScore(plan.slides[item.slide],notes[photo]??"");
        const keep=item.original===photo?1:0;
        if(!best||score>best.score||(score===best.score&&(keep>best.keep||(keep===best.keep&&(index<best.slot||(index===best.slot&&photo<best.photo))))))best={slot:index,photo,score,keep};
      }
    }
    if(!best)break;
    const item=slots[best.slot];
    next[item.slide][item.slot]=best.photo;
    open.delete(best.slot);pool.delete(best.photo);
  }
  return {assignment:next,unused:unusedOf(next)};
}

// ── 사진이 적을 때 같은 사진을 다른 거리로 다시 쓰기 ─────────────────────────────────────────
// 사진 1장으로 5장 캐러셀을 만들면 예전에는 표지 말고 네 장이 모두 글자 카드였다. 사진마다 "가까이(close)"와 "결 확대(detail)"
// 두 번까지 더 쓸 수 있게 해(사진 한 장이 최대 세 장면), 글자 카드로 남은 장에 사진을 넣는다.
// - 우선순위는 PHOTO_PRIORITY(결·한 접시·곁들임 먼저, 방문 안내는 마지막). 대형 숫자 장은 글자 그대로.
// - detail 역할 장은 결 확대를 먼저, 나머지는 가까이를 먼저 쓴다.
// - 어느 사진을 쓸지: 글과 맞는 사진(notes가 있으면) → 덜 쓴 사진 → 바로 앞뒤 장과 다른 사진 → 앞 사진.
export type PhotoView="full"|"close"|"detail";
export const PHOTO_VIEW_LABELS:Record<PhotoView,string>={full:"사진 그대로",close:"가까이",detail:"결 확대"};

// 앞 항목부터 비교해 처음 다른 값이 큰 쪽이 앞선다.
const outranks=(a:readonly number[],b:readonly number[])=>{for(let k=0;k<a.length;k++)if(a[k]!==b[k])return a[k]>b[k];return false;};

// track "text"(글 중심)이면 본문 장은 사진 없이 두므로 채우지 않는다.
export function fillWithPhotoViews(plan:CarouselPlan,assignment:number[][],photoCount:number,notes:readonly string[]=[],track?:CarouselTrack):{plan:CarouselPlan;assignment:number[][];views:PhotoView[][]} {
  const slides=[...plan.slides];
  const next=assignment.map(slots=>[...slots]);
  const views:PhotoView[][]=assignment.map(slots=>slots.map(()=>"full" as const));
  if(track==="text")return {plan:{...plan,slides},assignment:next,views};
  // 사진마다 이미 쓴 거리.
  const used=Array.from({length:photoCount},()=>new Set<PhotoView>());
  next.forEach(slots=>slots.forEach(photo=>used[photo]?.add("full")));
  const order=slides.map((slide,i)=>({role:slide.role,i})).filter(item=>item.i>0&&!next[item.i].length&&!KEEP_TEXT.has(normalizeCardLayout(slides[item.i])))
    .sort((a,b)=>PHOTO_PRIORITY.indexOf(a.role)-PHOTO_PRIORITY.indexOf(b.role)||a.i-b.i);
  for(const {i,role} of order){
    const prefer:PhotoView[]=role==="detail"?["detail","close"]:["close","detail"];
    const neighbours=new Set([...(next[i-1]??[]),...(next[i+1]??[])]);
    let best:{photo:number;view:PhotoView;rank:number[]}|null=null;
    for(let photo=0;photo<photoCount;photo++){
      const view=prefer.find(item=>!used[photo].has(item));
      if(!view)continue;
      // 높을수록 좋음: 글과 맞음, 덜 씀, 이웃과 다름, 앞 사진.
      const rank=[photoMatchScore(slides[i],notes[photo]??""),-used[photo].size,neighbours.has(photo)?0:1,-photo];
      if(!best||outranks(rank,best.rank))best={photo,view,rank};
    }
    if(!best)break;
    used[best.photo].add(best.view);
    next[i]=[best.photo];views[i]=[best.view];
    const layout=SINGLE_LAYOUT;
    slides[i]={...slides[i],layout,variant:Math.min(slides[i].variant??0,LAYOUT_VARIANTS[layout]-1)};
  }
  return {plan:{...plan,slides},assignment:next,views};
}
