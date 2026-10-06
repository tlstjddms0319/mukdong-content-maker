// 2단계 공용 도구 테스트: 제목 균형 줄바꿈, 확대·초점 자르기, 검수 측정값(몰래 축소·사진 면적), 블롭 누끼.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { auditRender } from "@/features/images/render/audit";
import { finishPhoto, textLayer } from "@/features/images/render/primitives";
import { STYLE_FONTS, blobCutout, chooseTitleLayout, fitText } from "@/features/images/styles/shared";

const fixture=(name:string)=>readFile(`tests/fixtures/photos/${name}.jpg`);

describe("balanced titles", () => {
  it("narrows a two-line title so the last line is not a lone word", async () => {
    const layout=await chooseTitleLayout("홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",{sizes:[72,64],width:900,maxHeight:300,font:STYLE_FONTS.heavy});
    expect(layout.lines).toBe(2);
    expect(layout.width).toBeLessThan(900);
    expect(layout.lastLineRatio).toBeGreaterThan(.8);
  });

  it("keeps the line count (and height) when balancing", async () => {
    const value="비 오는 날엔 홍어 한 점, 막걸리 한 잔";
    const plain=await textLayer(value,{size:72,color:"#000",width:900,height:4000,font:STYLE_FONTS.heavy,spacing:9});
    const fitted=await fitText(value,{sizes:[72],width:900,maxHeight:400,color:"#000",font:STYLE_FONTS.heavy,spacing:9});
    // 줄 수가 같으면 높이도 같다(줄마다 아래 획 차이로 ±2px까지는 허용).
    expect(Math.abs(fitted.info.height-plain.info.height)).toBeLessThanOrEqual(2);
    expect(fitted.info.width).toBeLessThanOrEqual(plain.info.width);
  });

  it("leaves one-line titles and point lists alone", async () => {
    expect((await chooseTitleLayout("홍어 한 점, 이렇게 드세요",{sizes:[72],width:900,maxHeight:300,font:STYLE_FONTS.heavy})).width).toBe(900);
    const list=await chooseTitleLayout("첫 번째 요점은 꽤 길어서 두 줄로 넘어가는 문장이에요\n두 번째",{sizes:[44],width:600,maxHeight:600,font:STYLE_FONTS.heavy});
    expect(list.width).toBe(600);
  });
});

describe("audit metrics", () => {
  it("counts a text that had to be shrunk to fit", async () => {
    const {report}=await auditRender(async()=>{
      const tiny=await textLayer("아주 긴 제목이 좁은 상자에 들어가지 않아 그림째 줄어드는 경우",{size:72,color:"#000",width:400,height:80});
      return sharp({create:{width:1080,height:1350,channels:3,background:"#fff"}}).composite([{input:tiny.data,left:100,top:100}]).jpeg().toBuffer();
    },{contrast:false});
    expect(report.metrics.shrinks).toBeGreaterThanOrEqual(1);
  });

  it("measures the area of registered photos on the canvas", async () => {
    const photo=await fixture("warm");
    const {report}=await auditRender(async()=>{
      const half=await finishPhoto(photo,1080,675);
      return sharp({create:{width:1080,height:1350,channels:3,background:"#fff"}}).composite([{input:half,left:0,top:0}]).jpeg().toBuffer();
    },{contrast:false});
    expect(report.metrics.photoArea).toBeGreaterThan(.45);
    expect(report.metrics.photoArea).toBeLessThan(.55);
  });
});

describe("photo crop options", () => {
  it("zooms in on the centre when asked", async () => {
    const photo=await fixture("warm");
    const plain=await finishPhoto(photo,300,300,{finish:"none"}),zoomed=await finishPhoto(photo,300,300,{finish:"none",zoom:1.3});
    expect((await sharp(zoomed).metadata()).width).toBe(300);
    expect(plain.equals(zoomed)).toBe(false);
  });

  it("puts the focus point near the centre of the crop", async () => {
    // 오른쪽 아래 쪽에 빨간 점이 있는 사진: 1.3배로 키우고 focus를 그 점에 두면 결과 가운데가 빨갛다.
    const base=await sharp({create:{width:800,height:600,channels:3,background:"#202020"}})
      .composite([{input:await sharp({create:{width:80,height:80,channels:3,background:"#ff0000"}}).png().toBuffer(),left:480,top:300}]).png().toBuffer();
    const crop=await finishPhoto(base,200,200,{finish:"none",zoom:1.3,focus:{x:520/800,y:340/600}});
    const {data}=await sharp(crop).extract({left:95,top:95,width:10,height:10}).raw().toBuffer({resolveWithObject:true});
    expect(data[0]).toBeGreaterThan(200);
  });
});

describe("blob cutout fallback", () => {
  it("is deterministic for the same seed and transparent at the corners", async () => {
    const photo=await fixture("cast-green");
    const a=await blobCutout(photo,400,7),b=await blobCutout(photo,400,7);
    expect(a.data.equals(b.data)).toBe(true);
    const {data,info}=await sharp(a.data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    expect(data[3]).toBe(0);
    expect(data[(info.width*info.height-1)*4+3]).toBe(0);
  });
});
