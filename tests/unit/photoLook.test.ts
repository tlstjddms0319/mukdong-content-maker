// 1단계(사진이 맛있게) 회귀 테스트. tests/fixtures/photos 의 합성 픽스처(scripts/make-photo-fixtures.mjs)를 쓴다.
// 기준은 계획서의 "맛있어 보인다" 측정 항목: 붉은 기 유지, 채도 비감소, 하이라이트 날림 없음, 어두운 사진 밝히기, 선명도 증가.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { enhancePhoto, enhancePhotoLegacy, photoStats } from "@/features/images/render/photoEnhance";
import { finishPhoto } from "@/features/images/render/primitives";

const fixture=(name:string)=>readFile(`tests/fixtures/photos/${name}.jpg`);

// 평균 채도((max−min)/max)와 밝기 상위 1% 값(0~255).
async function saturationAndTop(input:Buffer):Promise<{saturation:number;top:number}> {
  const {data}=await sharp(input).resize(96,120,{fit:"cover"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let sum=0;const luma:number[]=[];
  for(let i=0;i<data.length;i+=3){
    const max=Math.max(data[i],data[i+1],data[i+2]),min=Math.min(data[i],data[i+1],data[i+2]);
    sum+=max?(max-min)/max:0;
    luma.push(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722);
  }
  luma.sort((a,b)=>a-b);
  return {saturation:sum/luma.length,top:luma[Math.floor(luma.length*.99)]};
}
// 선명도: 256px 그레이에서 4·중심 − 상하좌우 라플라시안의 분산.
async function sharpness(input:Buffer):Promise<number> {
  const {data,info}=await sharp(input).resize(256,320,{fit:"cover"}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height;let sum=0,sq=0,n=0;
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x,v=4*data[i]-data[i-1]-data[i+1]-data[i-W]-data[i+W];
    sum+=v;sq+=v*v;n++;
  }
  return sq/n-(sum/n)**2;
}

describe("photo look (phase 1)", () => {
  it("keeps the warmth of a warm food photo that the old gray-world correction removed", async () => {
    const photo=await fixture("warm");
    const before=await photoStats(photo),after=await photoStats(await enhancePhoto(photo));
    const legacy=await photoStats(await enhancePhotoLegacy(photo));
    // 빨강은 줄지 않고, 파랑은 예전 보정보다 덜 오른다(노을빛이 회색으로 가지 않는다).
    expect(after.mean[0]).toBeGreaterThanOrEqual(before.mean[0]);
    expect(after.mean[2]-before.mean[2]).toBeLessThan(legacy.mean[2]-before.mean[2]);
    const s0=(await saturationAndTop(photo)).saturation,s1=(await saturationAndTop(await enhancePhoto(photo))).saturation;
    expect(s1).toBeGreaterThanOrEqual(s0*.98);
  });

  it("does not blow out a white plate (top 1% stays at or below 250)", async () => {
    for(const name of ["bright-plate","blurry","lowres"]){
      const {top}=await saturationAndTop(await enhancePhoto(await fixture(name)));
      expect(top,name).toBeLessThanOrEqual(250);
    }
  });

  it("brightens a dark restaurant photo to a readable level", async () => {
    const after=await photoStats(await enhancePhoto(await fixture("dark")));
    expect(after.luminance).toBeGreaterThanOrEqual(.4);
  });

  it("removes a green fluorescent cast without cooling the food", async () => {
    const photo=await fixture("cast-green");
    const before=await photoStats(photo),after=await photoStats(await enhancePhoto(photo));
    expect(after.mean[1]-after.mean[0]).toBeLessThan(before.mean[1]-before.mean[0]);
  });

  it("only adds light warm vibrance to AI photos", async () => {
    const photo=await fixture("warm");
    const before=await photoStats(photo),after=await photoStats(await enhancePhoto(photo,{kind:"ai"}));
    expect(Math.abs(after.luminance-before.luminance)).toBeLessThan(.03);
    const meta=await sharp(await enhancePhoto(photo,{kind:"ai"})).metadata();
    expect([meta.width,meta.height]).toEqual([768,1024]);
  });

  it("sharpens after resizing to the card size (finish)", async () => {
    const photo=await fixture("blurry");
    const plain=await finishPhoto(photo,540,675,{finish:"none"}),food=await finishPhoto(photo,540,675);
    expect(await sharpness(food)).toBeGreaterThan(await sharpness(plain)*1.1);
    const meta=await sharp(food).metadata();
    expect([meta.width,meta.height]).toEqual([540,675]);
  });
});
