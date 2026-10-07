import { LAYOUT_VARIANTS, normalizeCardLayout, photosNeeded, type CardLayout } from "./design";
import type { CarouselPlan, CarouselRole } from "./carousel";

// 실제 사진 여러 장으로 캐러셀을 만들 때, 구성안(AI가 장마다 고른 레이아웃)을 가진 사진 수에 맞춘다.
// 화면 코드에서도 쓰므로 서버 전용 모듈(sharp 등)을 불러오지 않는다.
//
// 원칙
// 1. 표지는 항상 첫 번째 사진을 쓴다.
// 2. 사진이 모자라면 덜 중요한 장부터 "사진 없는 글자 레이아웃"(체크리스트·Q&A·영수증 등)으로 바꾼다. AI 이미지는 만들지 않는다.
// 3. 사진이 남으면 사진 한 장짜리 장을 두 장(폴라로이드)·세 장(콜라주) 레이아웃으로 키워 올린 사진을 최대한 쓴다.
// 4. 사진은 올린 순서대로 장 순서에 맞춰 나눠 준다(이야기 흐름과 사진 순서가 같게).

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

export type PhotoFit={plan:CarouselPlan;assignment:number[][]};

export function fitPlanToPhotos(plan:CarouselPlan,photoCount:number):PhotoFit {
  if(photoCount<1)throw new Error("사진이 1장 이상 필요해요.");
  const slides=plan.slides.map(slide=>({...slide,layout:normalizeCardLayout(slide)}));
  // 장마다 원래 원하던 사진 수(최소 0, 최대 3). 표지는 최소 1장.
  const want=slides.map((slide,i)=>Math.max(i===0?1:0,photosNeeded(slide.layout)));
  const give=slides.map(()=>0);
  let budget=photoCount;
  // 1단계: 표지에 한 장, 그다음 우선순위대로 사진을 원하는 장에 한 장씩.
  give[0]=1;budget--;
  const order=slides.map((slide,i)=>({role:slide.role,i})).filter(item=>item.i>0)
    .sort((a,b)=>PHOTO_PRIORITY.indexOf(a.role)-PHOTO_PRIORITY.indexOf(b.role)||a.i-b.i);
  for(const {i} of order)if(budget>0&&want[i]>0){give[i]=1;budget--;}
  // 2단계: 여러 장을 원하던 장(콜라주·비교)에 남은 사진을 채운다.
  for(const {i} of [{i:0},...order])while(budget>0&&give[i]>0&&give[i]<want[i]){give[i]++;budget--;}
  // 3단계: 그래도 남으면 한 장짜리 장을 여러 장 레이아웃으로 키운다(표지는 그대로).
  for(const {i,role} of order){
    if(budget<=0)break;
    if(!EXPANDABLE.includes(role)||give[i]!==1)continue;
    const extra=Math.min(2,budget);
    give[i]+=extra;budget-=extra;
  }
  // 받은 사진 수에 맞는 레이아웃으로 바꾼다. 원래 레이아웃이 그 수에 맞으면 그대로 둔다.
  const fitted=slides.map((slide,i)=>{
    const count=give[i];
    let layout=slide.layout;
    if(photosNeeded(layout)!==count){
      layout=count===0?TEXT_LAYOUT[slide.role]:count===1?SINGLE_LAYOUT:count===2?(slide.layout==="versus"?"versus":"polaroid"):"collage";
    }
    // 바뀐 레이아웃의 변형 개수를 넘지 않게 변형 번호를 맞춘다.
    const variant=Math.min(slide.variant??0,LAYOUT_VARIANTS[layout]-1);
    return {...slide,layout,variant};
  });
  // 장 순서대로 사진 번호를 나눠 준다.
  let next=0;
  const assignment=give.map(count=>Array.from({length:count},()=>next++));
  return {plan:{...plan,slides:fitted},assignment};
}

// 표지+2장 파노라마(render/panorama.ts): 표지 사진을 2번째 장에도 한 번 더 쓴다(두 장이 반씩 나눠 그린다).
// 나머지 장은 2번째 장을 뺀 구성안으로 평소처럼 사진을 나눈 뒤, 2번째 장을 표지 사진(0번) 한 장짜리로 다시 끼운다.
export function fitPanorama(plan:CarouselPlan,photoCount:number):PhotoFit {
  if(plan.slides.length<2)return fitPlanToPhotos(plan,photoCount);
  const rest=fitPlanToPhotos({...plan,slides:[plan.slides[0],...plan.slides.slice(2)]},photoCount);
  const second={...plan.slides[1],layout:SINGLE_LAYOUT,variant:0};
  return {
    plan:{...rest.plan,slides:[rest.plan.slides[0],second,...rest.plan.slides.slice(1)]},
    assignment:[rest.assignment[0],[0],...rest.assignment.slice(1)],
  };
}

// 한 장의 사진을 바꿀 때: 그 장의 첫 칸을 고른 사진으로 바꾸고, 같은 사진이 다른 칸에 있으면 자리를 맞바꾼다.
export function swapPhoto(slots:number[],photoIndex:number,slot=0):number[] {
  const next=[...slots];
  const existing=next.indexOf(photoIndex);
  if(existing>=0)next[existing]=next[slot];
  next[slot]=photoIndex;
  return next;
}
