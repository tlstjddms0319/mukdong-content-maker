// @vitest-environment node
// 사진이 적을 때 같은 사진을 "가까이"·"결 확대"로 다시 쓰기: 자르기(render/photoView.ts)와 장 배치(fillWithPhotoViews).
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { viewOf } from "@/features/images/render/photoView";
import { foodBoxOf } from "@/features/images/photoAnalysis";
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

// 왼쪽 위에 작은 빨간 접시(음식), 오른쪽 아래에 큰 회색 그릇. 가운데를 자르면 접시가 잘려 나간다.
async function offCenterPlate(){
  const svg=`<svg width="1600" height="1200"><rect width="100%" height="100%" fill="#d8d8d8"/><circle cx="360" cy="300" r="180" fill="#c83a2a"/><rect x="1000" y="700" width="500" height="400" fill="#777"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}
// 접시를 감싸는 상자(비율): 왼쪽 180/1600, 위 120/1200, 너비 360/1600, 높이 360/1200.
const plateBox={x:180/1600,y:120/1200,w:360/1600,h:360/1200};

describe("food box from the photo check", () => {
  it("accepts a sane [left, top, width, height] box and clamps it into the photo", () => {
    expect(foodBoxOf([0.1,0.2,0.3,0.4])).toEqual({x:0.1,y:0.2,w:0.3,h:0.4});
    const clamped=foodBoxOf([0.8,0.8,0.5,0.5])!;
    expect(clamped.w).toBeCloseTo(0.2);expect(clamped.h).toBeCloseTo(0.2);
  });
  it("rejects missing, tiny or broken boxes", () => {
    expect(foodBoxOf([])).toBeNull();
    expect(foodBoxOf([0.1,0.1,0.01,0.01])).toBeNull();
    expect(foodBoxOf([Number.NaN,0,0.5,0.5])).toBeNull();
    expect(foodBoxOf([1.2,0,0.5,0.5])).toBeNull();
    expect(foodBoxOf(undefined)).toBeNull();
  });
});

describe("crops around the food the check found", () => {
  it("centres close and detail crops on the food instead of the middle", async () => {
    const photo=await offCenterPlate();
    const middle=await redShare(await viewOf(photo,"detail"));
    const onFood=await redShare(await viewOf(photo,"detail",plateBox));
    expect(onFood).toBeGreaterThan(0.18);
    expect(onFood).toBeGreaterThan(middle*3);
    expect(await sharp(await viewOf(photo,"close",plateBox)).metadata()).toMatchObject({width:1152,height:864});
  });
  it("moves closer to small food even for a photo used as-is, but not beyond 55%", async () => {
    const photo=await offCenterPlate();
    const zoomed=await viewOf(photo,"full",plateBox);
    expect(await sharp(zoomed).metadata()).toMatchObject({width:880,height:660});
    expect(await redShare(zoomed)).toBeGreaterThan((await redShare(photo))*2);
  });
  it("keeps a photo as-is when the food already fills it", async () => {
    const photo=await offCenterPlate();
    expect(await viewOf(photo,"full",{x:0.05,y:0.05,w:0.9,h:0.85})).toBe(photo);
  });
});

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
