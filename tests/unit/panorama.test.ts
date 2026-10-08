// 표지+2장 파노라마: 가로로 긴 사진 한 장을 표지(왼쪽 반)와 2번째 장(오른쪽 반)에 나눠 그린다.
// 두 장은 따로 그려지지만 이음선에서 사진·그늘·가로선이 맞물려야 한다.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composeSlideCard } from "@/features/images/composeSlide";
import { panoramaReady } from "@/features/images/render/panorama";

// 가로 2400×1500: 왼쪽에서 오른쪽으로 색이 천천히 바뀌는 사진(이음선 양쪽 색이 이어지는지 보기 좋다).
const widePhoto=()=>sharp(Buffer.from(`<svg width="2400" height="1500" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#c0603a"/><stop offset="1" stop-color="#3a70c0"/></linearGradient></defs><rect width="2400" height="1500" fill="url(#g)"/></svg>`)).jpeg().toBuffer();
const base={visualPrompt:"",textPosition:"bottom" as const,figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,keywords:["홍어"],subline:"",variant:0};
const cover={...base,role:"cover" as const,layout:"fullscreen" as const,headline:"홍어 한 점과 막걸리 한 잔",subline:"비 오는 날 생각나는 조합",points:[]};
const second={...base,role:"overview" as const,layout:"fullscreen" as const,headline:"넘기면 이어지는 한 상",points:["홍어는 결 방향으로 집어요","막걸리는 살살 섞어 따라요"]};
const column=async(image:Buffer,x:number,top:number,height:number)=>(await sharp(image).extract({left:x,top,width:1,height}).raw().toBuffer());

describe("cover panorama", () => {
  it("splits one wide photo so the cover and slide 2 meet at the seam", async () => {
    const photo=await widePhoto();
    const left=await composeSlideCard([photo],cover,1,5,"card",{palette:"warm"},{contrast:true,panorama:"left"});
    const right=await composeSlideCard([photo],second,2,5,"card",{palette:"warm"},{contrast:true,panorama:"right"});
    expect(left.report.issues).toEqual([]);
    expect(right.report.issues).toEqual([]);
    // 표지의 오른쪽 끝 세로줄과 2번째 장의 왼쪽 끝 세로줄(글자가 없는 위쪽)이 거의 같은 색이어야 이어져 보인다.
    const [a,b]=[await column(left.image,1079,200,600),await column(right.image,0,200,600)];
    const diff=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
    expect(diff).toBeLessThan(6);
    // 이음선을 넘는 강조색 가로선도 같은 높이에서 이어진다.
    const lineRow=async(image:Buffer,x:number)=>[...(await sharp(image).extract({left:x,top:1180,width:1,height:70}).raw().toBuffer())];
    const rowsOf=(pixels:number[])=>pixels.reduce<number[]>((rows,_,i)=>i%3===0&&pixels[i]>200&&pixels[i+1]>150&&pixels[i+2]<140?[...rows,i/3]:rows,[]);
    expect(rowsOf(await lineRow(left.image,1079))).toEqual(rowsOf(await lineRow(right.image,0)));
    expect(rowsOf(await lineRow(left.image,1079)).length).toBeGreaterThan(0);
  },20_000); // 1080×1350 두 장을 그리고 이음선을 비교한다(바쁠 때 5초를 넘긴다).

  it("only uses photos that are wide enough, and falls back to the usual design otherwise", async () => {
    expect(await panoramaReady(await widePhoto())).toBe(true);
    const tall=await sharp({create:{width:1200,height:1500,channels:3,background:"#886644"}}).jpeg().toBuffer();
    const small=await sharp({create:{width:900,height:500,channels:3,background:"#886644"}}).jpeg().toBuffer();
    expect(await panoramaReady(tall)).toBe(false);
    expect(await panoramaReady(small)).toBe(false);
    const asked=await composeSlideCard([tall],cover,1,5,"card",{palette:"warm"},{panorama:"left"});
    const usual=await composeSlideCard([tall],cover,1,5,"card",{palette:"warm"},{});
    expect(asked.image.equals(usual.image)).toBe(true);
  });
});
