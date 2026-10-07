// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { photosNeeded } from "@/features/images/design";
import { fitPlanToPhotos, matchPhotosToSlides, photoMatchScore, swapPhoto } from "@/features/images/photoCarousel";
import { contentOf } from "@/features/images/styles/shared";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
vi.mock("server-only",()=>({}));

const base=(slideCount:3|5|7|10)=>createFallbackCarouselPlan({topic:"홍어 한 점",slideCount});
const used=(assignment:number[][])=>assignment.flat();

describe("fitting a carousel plan to real photos", () => {
  it("puts the first photo on the cover and turns photo-less slides into text cards", () => {
    const {plan,assignment}=fitPlanToPhotos(base(5),2);
    expect(assignment[0]).toEqual([0]);
    expect(used(assignment).sort()).toEqual([0,1]);
    // 사진 수와 레이아웃이 맞아야 서버가 그릴 수 있다.
    plan.slides.forEach((slide,i)=>expect(photosNeeded(slide.layout)).toBe(assignment[i].length));
    expect(plan.slides.filter(slide=>photosNeeded(slide.layout)===0).length).toBe(3);
  });

  it("uses every photo once, in upload order along the story, when there are many", () => {
    const {plan,assignment}=fitPlanToPhotos(base(5),10);
    expect(used(assignment)).toEqual([...used(assignment)].sort((a,b)=>a-b));
    expect(new Set(used(assignment)).size).toBe(used(assignment).length);
    expect(used(assignment).length).toBeGreaterThan(5);
    plan.slides.forEach((slide,i)=>expect(photosNeeded(slide.layout)).toBe(assignment[i].length));
  });

  it("keeps variants inside the new layout's range and handles every carousel size", () => {
    for(const count of [3,5,7,10] as const){
      for(const photos of [1,2,3,count,10]){
        const {plan,assignment}=fitPlanToPhotos(base(count),photos);
        expect(used(assignment).length).toBeLessThanOrEqual(photos);
        expect(assignment[0].length).toBeGreaterThan(0);
        plan.slides.forEach((slide,i)=>expect(photosNeeded(slide.layout)).toBe(assignment[i].length));
      }
    }
  });

  it("never puts more photos on a slide than the design family can draw", () => {
    // 디자인 계열(칠판·한지 등)은 한 장에 사진을 두 장까지만 그린다. 세 장을 주면 셋째 사진이 말없이 빠졌다.
    for(const count of [3,5,7,10] as const){
      for(const photos of [1,3,7,10]){
        const {plan,assignment,unused}=fitPlanToPhotos(base(count),photos,{maxPerSlide:2});
        assignment.forEach(slots=>expect(slots.length).toBeLessThanOrEqual(2));
        plan.slides.forEach((slide,i)=>expect(photosNeeded(slide.layout)).toBe(assignment[i].length));
        // 넣은 사진과 못 넣은 사진을 합치면 올린 사진 전부다.
        expect([...used(assignment),...unused].sort((a,b)=>a-b)).toEqual(Array.from({length:photos},(_,i)=>i));
      }
    }
  });

  it("gives every slide a photo before stacking several photos on one slide", () => {
    // 사진 5장·5장 캐러셀: 예전에는 글자 카드 두 장을 남기고 한 장에 세 컷을 몰았다.
    const five=fitPlanToPhotos(base(5),5,{maxPerSlide:2});
    expect(five.assignment.map(slots=>slots.length)).toEqual([1,1,1,1,1]);
    expect(five.unused).toEqual([]);
    // 사진이 장 수보다 많으면 남는 사진만 여러 컷 장으로 키우고, 그래도 남는 사진은 unused로 알려 준다.
    const many=fitPlanToPhotos(base(5),10,{maxPerSlide:2});
    expect(many.assignment.every(slots=>slots.length>=1)).toBe(true);
    expect(used(many.assignment).length+many.unused.length).toBe(10);
  });

  it("keeps a big-number slide as text even when photos are left over", () => {
    const plan=base(5);
    const withStat={...plan,slides:plan.slides.map((slide,i)=>i===2?{...slide,layout:"stat" as const,figure:"3가지"}:slide)};
    const {plan:fitted,assignment}=fitPlanToPhotos(withStat,10);
    expect(fitted.slides[2].layout).toBe("stat");
    expect(assignment[2]).toEqual([]);
  });

  it("marks only real comparison slides as comparisons (no stray vs badge)", () => {
    const slide={...base(5).slides[1]};
    const two=[Buffer.alloc(1),Buffer.alloc(1)];
    expect(contentOf({...slide,layout:"polaroid"},two,2,5).compare).toBe(false);
    expect(contentOf({...slide,layout:"versus"},two,2,5).compare).toBe(true);
    expect(contentOf({...slide,layout:"versus"},[Buffer.alloc(1)],2,5).compare).toBe(false);
  });

  it("needs at least one photo", () => {
    expect(()=>fitPlanToPhotos(base(3),0)).toThrow();
  });

  it("swaps a slide photo and keeps each photo in one slot", () => {
    expect(swapPhoto([2],5)).toEqual([5]);
    expect(swapPhoto([2,3,4],4)).toEqual([4,3,2]);
  });
});

describe("putting each photo on the slide whose copy it shows", () => {
  const plan={...base(5)};
  plan.slides=plan.slides.map((slide,i)=>i===1?{...slide,headline:"사발에 따르면 이런 빛이에요",points:["막걸리를 사발에 따르면 뽀얀 빛이 보여요"],visualPrompt:"막걸리 사발을 가까이 담은 사진",keywords:["막걸리"]}
    :i===3?{...slide,headline:"한 점은 이렇게 먹어요",points:["홍어회 한 점을 젓가락으로 집어요"],visualPrompt:"젓가락으로 홍어회를 집어 든 손",keywords:["홍어"]}:slide);

  it("scores shared menus above shared scene words and ignores unknown photos", () => {
    expect(photoMatchScore(plan.slides[1],"막걸리 · 사발에 따른 막걸리")).toBeGreaterThan(photoMatchScore(plan.slides[1],"홍어회 · 접시에 펼친 홍어회"));
    expect(photoMatchScore(plan.slides[1],"")).toBe(0);
  });

  it("moves the matching photo to its slide, keeps the cover photo and reports the leftovers", () => {
    // 칸 수: 표지 1, 2번 1, 4번 1. 올린 순서대로면 2번 장에 홍어 접시(1번 사진)가 들어간다.
    const assignment=[[0],[1],[],[2],[]];
    const notes=["홍어회 · 접시 위 홍어회","홍어회 · 접시에 펼친 홍어회","홍어회 · 젓가락으로 집어 든 한 점","막걸리 · 사발에 따른 막걸리"];
    const matched=matchPhotosToSlides(plan,assignment,notes);
    expect(matched.assignment[0]).toEqual([0]);
    expect(matched.assignment[1]).toEqual([3]);
    expect(matched.assignment[3]).toEqual([2]);
    expect(matched.unused).toEqual([1]);
  });

  it("changes nothing when no photo could be read", () => {
    const assignment=[[0],[1],[],[2],[]];
    expect(matchPhotosToSlides(plan,assignment,["","","",""])).toEqual({assignment,unused:[3]});
  });

  it("keeps the upload order among photos that match equally", () => {
    const assignment=[[0],[1],[],[2],[]];
    const notes=["홍어회","수육","수육","수육"];
    expect(matchPhotosToSlides(plan,assignment,notes).assignment).toEqual(assignment);
  });

  it("keeps the panorama pair on the cover photo", () => {
    const assignment=[[0],[0],[],[1],[]];
    const matched=matchPhotosToSlides(plan,assignment,["홍어회","젓가락으로 집어 든 홍어회 한 점"]);
    expect(matched.assignment.slice(0,2)).toEqual([[0],[0]]);
    expect(matched.assignment[3]).toEqual([1]);
  });
});

describe("generate route with real photos", () => {
  it("composes the card from the uploaded photos without calling an image AI", async () => {
    const { POST } = await import("@/app/api/images/generate/route");
    const photo=`data:image/jpeg;base64,${(await sharp({create:{width:120,height:150,channels:3,background:"#c08070"}}).jpeg().toBuffer()).toString("base64")}`;
    const {plan}=fitPlanToPhotos(base(3),1);
    const fetchSpy=vi.spyOn(globalThis,"fetch");
    const response=await POST(new Request("http://localhost/api/images/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:"홍어 한 점",count:1,slideLayout:"card",slide:plan.slides[0],slideIndex:1,slideTotal:3,styleAnchor:plan.styleAnchor,design:plan.design,photos:[photo]})}));
    const body=await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({source:"photo",provider:"none"});
    expect(body.images).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    const card=await sharp(Buffer.from(body.images[0].split(",")[1],"base64")).metadata();
    expect(card).toMatchObject({width:1080,height:1350});
    fetchSpy.mockRestore();
  },30_000);
});
