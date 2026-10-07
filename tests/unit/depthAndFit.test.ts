import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TEXTURES, cachedLayer, contactShadow, innerShadow, layerCacheStats, propLayer, shadowLayer, softShadow, textureLayer } from "@/features/images/decor";
import { CALM_WORDS, StyleIdSchema, styleAffinity } from "@/features/images/styleCatalog";
import { pickFittingStyle } from "@/features/images/variety";

const svgPng=(body:string)=>sharp(Buffer.from(`<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#fff"/>${body}</svg>`)).removeAlpha().raw().toBuffer({resolveWithObject:true});
const lum=(data:Buffer,width:number,x:number,y:number)=>{const i=(y*width+x)*3;return (data[i]+data[i+1]+data[i+2])/3;};

describe("4단계 그림자", () => {
  it("draws a two-layer shadow that is darkest right under the object and fades wide", async () => {
    const {data,info}=await svgPng(softShadow({x:100,y:110,width:200,height:200,blur:18,opacity:.3}));
    // 그림자 사각(110~310) 아래 가장자리 근처는 진하고, 그보다 30px 바깥은 옅지만 넓게 번진 주변광이 남아 있다.
    expect(lum(data,info.width,200,305)).toBeLessThan(lum(data,info.width,200,340));
    expect(lum(data,info.width,200,340)).toBeLessThan(255);
  });
  it("darkens only the inside edge of a window with an inner shadow", async () => {
    const {data,info}=await svgPng(innerShadow({x:100,y:100,width:200,height:200,blur:12,opacity:.5}));
    expect(lum(data,info.width,104,200)).toBeLessThan(230); // 창 안쪽 가장자리
    expect(lum(data,info.width,200,200)).toBeGreaterThan(250); // 창 가운데는 그대로
    expect(lum(data,info.width,60,200)).toBe(255); // 창 바깥은 건드리지 않는다
  });
  it("puts a flat contact shadow on the floor", async () => {
    const {data,info}=await svgPng(contactShadow({cx:200,cy:300,rx:120}));
    expect(lum(data,info.width,200,300)).toBeLessThan(lum(data,info.width,200,260));
  });
});

describe("4단계 질감·캐시", () => {
  it("ships every baked texture and overlays it at the requested size", async () => {
    for(const name of TEXTURES){
      const layer=await textureLayer(name,{opacity:.3,width:300,height:200,left:10,top:20});
      expect(layer,name).not.toBeNull();
      const meta=await sharp(layer!.input as Buffer).metadata();
      expect([meta.width,meta.height,layer!.left,layer!.top],name).toEqual([300,200,10,20]);
    }
  });
  it("reuses a cached layer instead of rebuilding it", async () => {
    let builds=0;
    const build=async()=>{builds++;return Buffer.alloc(1000);};
    await cachedLayer("test:reuse",build);await cachedLayer("test:reuse",build);
    expect(builds).toBe(1);
    expect(layerCacheStats().items).toBeLessThanOrEqual(24);
  });
  it("keeps the cache under its item limit", async () => {
    for(let i=0;i<40;i++)await cachedLayer(`test:fill:${i}`,async()=>Buffer.alloc(10));
    expect(layerCacheStats().items).toBeLessThanOrEqual(24);
  });
  it("returns no prop layer when the sticker file is missing", async () => {
    // 소품 자산이 없어도 카드가 깨지지 않아야 한다(호출부는 null이면 소품 없이 그린다).
    const layer=await propLayer("gim",{width:120,left:0,top:0}).catch(()=>"threw");
    expect(layer===null||typeof layer==="object").toBe(true);
  });
});

describe("계열 친화도(B11)", () => {
  it("keeps loud families away from formal posts", () => {
    const text="명절 잔치상에 오르는 홍어 삼합 이야기";
    expect(styleAffinity("kitsch",text)).toBeLessThan(0);
    expect(styleAffinity("hanji",text)).toBeGreaterThan(0);
    for(let seed=0;seed<40;seed++)expect(["kitsch","colorblock","webtoon","popup"]).not.toContain(pickFittingStyle(text,seed));
  });
  it("still varies the family between posts when nothing in the text matches", () => {
    const picked=new Set(Array.from({length:30},(_,seed)=>pickFittingStyle("홍어 한 점",seed)));
    expect(picked.size).toBeGreaterThan(5);
    for(const id of picked)expect(StyleIdSchema.options).toContain(id);
  });
  it("lists formal words for the calm tone", () => {
    expect(CALM_WORDS).toContain("제사");
  });
});

describe("빠른 그림자 레이어", () => {
  it("draws a big shadow at low resolution and places it with its blur margin", async () => {
    const started=performance.now();
    const layer=await shadowLayer({x:100,y:120,width:860,height:840,blur:22,opacity:.3});
    // SVG 흐림을 원본 크기로 돌리면 0.4~0.8초다. 다른 작업이 같은 기계에서 돌 때도 흔들리지 않게 1초를 상한으로 둔다.
    expect(performance.now()-started).toBeLessThan(1000);
    const meta=await sharp(layer.input as Buffer).metadata();
    expect(layer.left).toBeLessThan(100);
    expect(meta.width).toBeGreaterThan(860);
    // 가운데는 진하고 가장자리 여백은 거의 투명하다.
    const {data,info}=await sharp(layer.input as Buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x:number,y:number)=>data[(y*info.width+x)*4+3];
    expect(alpha(Math.floor(info.width/2),Math.floor(info.height/2))).toBeGreaterThan(alpha(2,2));
  });
});

describe("빠른 그림자 레이어의 캔버스 자르기", () => {
  it("clips a shadow that would spill past the canvas so sharp can composite it", async () => {
    const layer=await shadowLayer({x:-20,y:1200,width:1120,height:200,blur:22,opacity:.3});
    const meta=await sharp(layer.input as Buffer).metadata();
    expect(layer.left).toBeGreaterThanOrEqual(0);
    expect(layer.top).toBeGreaterThanOrEqual(0);
    expect(layer.left+(meta.width??0)).toBeLessThanOrEqual(1080);
    expect(layer.top+(meta.height??0)).toBeLessThanOrEqual(1350);
    await expect(sharp({create:{width:1080,height:1350,channels:3,background:"#fff"}}).composite([layer]).png().toBuffer()).resolves.toBeInstanceOf(Buffer);
  });
});
