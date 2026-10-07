// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { access } from "node:fs/promises";
import { MASCOT_FILE, MASCOT_POSES, PROPS, blob, cornerMarks, dotGrid, doodleArrow, grainLayer, mascotFile, mascotLayer, propFile, propLayer, ring, softShadow, sparkles, stickerBadge, washiTape, wavyUnderline } from "@/features/images/decor";

const rasterize=(body:string)=>sharp(Buffer.from(`<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">${body}</svg>`)).png().toBuffer({resolveWithObject:true});
const inkOf=async(png:Buffer)=>{const {data}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});let sum=0;for(let i=3;i<data.length;i+=4)sum+=data[i];return sum;};

describe("card decorations", () => {
  it("builds every decoration as SVG that rasterizes and actually paints pixels", async () => {
    const fragments:Record<string,string>={
      sparkles:sparkles([[200,200,30],[100,100,12]],"#c65138"),
      washiTape:washiTape({x:60,y:180,width:260,color:"#f5c84b",angle:-10}),
      wavyUnderline:wavyUnderline({x:40,y:200,width:300,color:"#c65138"}),
      stickerBadge:stickerBadge({cx:200,cy:200,r:80,fill:"#c65138"}),
      dotGrid:dotGrid({x:0,y:0,width:400,height:400,color:"#1f2b27",opacity:1}),
      blob:blob({cx:200,cy:200,r:150,color:"#f5c84b",opacity:1,seed:3}),
      doodleArrow:doodleArrow({x1:40,y1:40,x2:340,y2:300,color:"#1f2b27"}),
      ring:ring({cx:200,cy:200,r:120,color:"#2f6f8f",dashed:true,strokeWidth:6}),
      cornerMarks:cornerMarks({inset:20,length:60,color:"#1f2b27",width:400,height:400,opacity:1}),
      softShadow:softShadow({x:80,y:80,width:240,height:240,opacity:.8}),
    };
    for(const [name,body] of Object.entries(fragments)){
      const {data,info}=await rasterize(body);
      expect(info.width,name).toBe(400);
      expect(await inkOf(data),name).toBeGreaterThan(1000);
    }
    // 같은 입력이면 같은 그림. 패턴·필터 id만 달라진다.
    expect(blob({cx:1,cy:1,r:1,color:"#000"})).toBe(blob({cx:1,cy:1,r:1,color:"#000"}));
    expect(dotGrid({x:0,y:0,width:10,height:10,color:"#000"})).not.toBe(dotGrid({x:0,y:0,width:10,height:10,color:"#000"}));
  });

  it("makes a mid-gray grain layer that keeps brightness when blended soft-light, and caches it", async () => {
    const grain=await grainLayer({opacity:.2,width:200,height:200});
    expect(grain.blend).toBe("soft-light");
    const stats=await sharp(grain.input as Buffer).stats();
    const [r,,,alpha]=stats.channels;
    expect(r.mean).toBeGreaterThan(100);
    expect(r.mean).toBeLessThan(156);
    expect(r.stdev).toBeGreaterThan(5);
    expect(Math.round(alpha.mean)).toBe(51);
    expect((await grainLayer({opacity:.2,width:200,height:200})).input).toBe(grain.input);
    // 종이색 위에 겹쳐도 밝기는 거의 그대로다.
    const paper=await sharp({create:{width:200,height:200,channels:3,background:"#f6f2ea"}}).composite([grain]).raw().toBuffer();
    let sum=0;for(let i=0;i<paper.length;i+=3)sum+=paper[i];
    expect(Math.abs(sum/(paper.length/3)-246)).toBeLessThan(8);
  });

  it("loads the bundled mascot, anchors it by its corner, and mirrors it on request", async () => {
    await expect(access(MASCOT_FILE)).resolves.toBeUndefined();
    const plain=await mascotLayer({width:200,left:100,top:100});
    const anchored=await mascotLayer({width:200,left:300,top:400,anchor:"bottom-right"});
    const flipped=await mascotLayer({width:200,left:0,top:0,flip:true});
    expect(plain).not.toBeNull();
    const meta=await sharp(plain!.input as Buffer).metadata();
    expect(meta.width).toBe(200);
    expect(meta.hasAlpha).toBe(true);
    expect(anchored).toMatchObject({left:300-200,top:400-meta.height!});
    expect((flipped!.input as Buffer).equals(plain!.input as Buffer)).toBe(false);
  });

  it("ships every mascot pose as a transparent cut-out and draws different poses differently", async () => {
    for(const pose of MASCOT_POSES){
      await expect(access(mascotFile(pose))).resolves.toBeUndefined();
      const meta=await sharp(mascotFile(pose)).metadata();
      expect(meta.hasAlpha).toBe(true);
      // 모서리는 배경이 지워져 투명해야 한다(오려 내기가 제대로 됐는지 확인).
      const {data,info}=await sharp(mascotFile(pose)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      expect(data[3]).toBe(0);
      expect(data[(info.width*info.height-1)*4+3]).toBe(0);
    }
    const hello=await mascotLayer({width:180,left:0,top:0,pose:"hello"});
    const tip=await mascotLayer({width:180,left:0,top:0,pose:"tip"});
    expect((hello!.input as Buffer).equals(tip!.input as Buffer)).toBe(false);
  });
});

describe("food prop stickers", () => {
  it("ships every prop as a transparent cut-out that propLayer can place", async () => {
    for(const name of PROPS){
      const {data,info}=await sharp(propFile(name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      expect(data[3],name).toBe(0);
      expect(data[(info.width*info.height-1)*4+3],name).toBe(0);
      const layer=await propLayer(name,{width:120,left:500,top:600,anchor:"center"});
      expect(layer,name).not.toBeNull();
      expect(layer!.width,name).toBe(120);
      expect(layer!.left,name).toBe(500-60);
    }
  });
});
