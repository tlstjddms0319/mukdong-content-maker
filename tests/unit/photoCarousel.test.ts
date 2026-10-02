// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { photosNeeded } from "@/features/images/design";
import { fitPlanToPhotos, swapPhoto } from "@/features/images/photoCarousel";

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

  it("needs at least one photo", () => {
    expect(()=>fitPlanToPhotos(base(3),0)).toThrow();
  });

  it("swaps a slide photo and keeps each photo in one slot", () => {
    expect(swapPhoto([2],5)).toEqual([5]);
    expect(swapPhoto([2,3,4],4)).toEqual([4,3,2]);
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
