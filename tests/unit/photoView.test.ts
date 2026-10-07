// @vitest-environment node
// 사진이 적을 때 같은 사진을 "가까이"·"결 확대"로 다시 쓰기: 자르기(render/photoView.ts)와 장 배치(fillWithPhotoViews).
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { viewOf } from "@/features/images/render/photoView";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { photosNeeded } from "@/features/images/design";
import { fillWithPhotoViews, fitPlanToPhotos } from "@/features/images/photoCarousel";

// 회색 바탕 가운데에 빨간 접시, 구석에 작은 빨간 그릇(가운데를 자르면 접시가 화면을 더 채운다).
async function plate(){
  const svg=`<svg width="1600" height="1200"><rect width="100%" height="100%" fill="#d8d8d8"/><circle cx="800" cy="600" r="220" fill="#c83a2a"/><circle cx="1500" cy="100" r="60" fill="#c83a2a"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}
// 잘라 낸 사진에서 빨간 픽셀 비율.
async function redShare(image:Buffer){
  const {data,info}=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let red=0;for(let i=0;i<data.length;i+=3)if(data[i]>160&&data[i+1]<110)red++;
  return red/(info.width*info.height);
}

describe("closer crops of one photo", () => {
  it("keeps the photo for full and crops the middle for close and detail", async () => {
    const photo=await plate();
    expect(await viewOf(photo,"full")).toBe(photo);
    const close=await viewOf(photo,"close"),detail=await viewOf(photo,"detail");
    expect(await sharp(close).metadata()).toMatchObject({width:1152,height:864});
    expect(await sharp(detail).metadata()).toMatchObject({width:800,height:600});
    // 가까이 갈수록 접시가 화면을 더 채운다(접시를 벗어나 회색만 자르지 않는다).
    const full=await redShare(photo),near=await redShare(close),closest=await redShare(detail);
    expect(near).toBeGreaterThan(full);
    expect(closest).toBeGreaterThan(near);
  });
});

describe("filling a carousel with few photos", () => {
  const used=(assignment:number[][])=>assignment.flat();
  it("uses one photo for up to three scenes instead of four text cards", () => {
    const fit=fitPlanToPhotos(createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5}),1);
    expect(fit.assignment.filter(slots=>slots.length).length).toBe(1);
    const filled=fillWithPhotoViews(fit.plan,fit.assignment,1);
    expect(filled.assignment.filter(slots=>slots.length).length).toBe(3);
    expect(used(filled.assignment).every(photo=>photo===0)).toBe(true);
    expect(filled.views.flat().sort()).toEqual(["close","detail","full"]);
    // 결을 보여 주는 장(detail)은 결 확대로.
    const detail=filled.plan.slides.findIndex(slide=>slide.role==="detail");
    expect(filled.views[detail]).toEqual(["detail"]);
    filled.plan.slides.forEach((slide,i)=>expect(photosNeeded(slide.layout)).toBe(filled.assignment[i].length));
  });

  it("fills every slide of a 5-slide carousel from two photos and spreads the reuse", () => {
    const fit=fitPlanToPhotos(createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5}),2);
    const filled=fillWithPhotoViews(fit.plan,fit.assignment,2);
    expect(filled.assignment.every(slots=>slots.length===1)).toBe(true);
    // 한 사진은 거리마다 한 번씩만(같은 사진·같은 거리가 두 장에 나오지 않는다).
    const pairs=filled.assignment.map((slots,i)=>`${slots[0]}:${filled.views[i][0]}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("puts the photo that matches the copy on the reused slide", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:3});
    plan.slides[2]={...plan.slides[2],headline:"막걸리 한 사발과 같이",points:["막걸리를 곁들여요"],visualPrompt:"막걸리 사발이 놓인 식탁",keywords:["막걸리"]};
    const filled=fillWithPhotoViews(plan,[[0],[1],[]],2,["홍어회 접시","막걸리 사발"]);
    expect(filled.assignment[2]).toEqual([1]);
  });

  it("leaves big-number slides and already-filled decks alone", () => {
    const plan=createFallbackCarouselPlan({topic:"홍어 한 점",slideCount:5});
    plan.slides[2]={...plan.slides[2],layout:"stat",figure:"3가지"};
    const fit=fitPlanToPhotos(plan,1);
    const filled=fillWithPhotoViews(fit.plan,fit.assignment,1);
    expect(filled.assignment[2]).toEqual([]);
    expect(filled.plan.slides[2].layout).toBe("stat");
    const full=fitPlanToPhotos(plan,5);
    expect(fillWithPhotoViews(full.plan,full.assignment,5).views.flat().every(view=>view==="full")).toBe(true);
  });
});
