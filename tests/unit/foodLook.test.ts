// 메뉴별 보정(계획서 A10)과 품질 플래그를 렌더에 반영하는 부분(흐린 사진 선명화 약하게, 어두운 사진 vibrance 상한) 테스트.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { enhancePhoto, foodLookOf, photoQuality, qualityOfEnhanced } from "@/features/images/render/photoEnhance";
import { finishPhoto } from "@/features/images/render/primitives";

const fixture=(name:string)=>readFile(`tests/fixtures/photos/${name}.jpg`);

// 왼쪽 위부터 네 칸에 색을 칠한 합성 사진(1200×1200). 칸마다 잔잔한 무늬를 넣어 실제 사진처럼 분포가 있게 한다.
async function quad(colors:[number,number,number][]):Promise<Buffer> {
  const W=1200,H=1200,data=Buffer.alloc(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const c=colors[(y<H/2?0:2)+(x<W/2?0:1)],n=((x*7+y*13)%11)-5,i=(y*W+x)*3;
    for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,c[k]+n));
  }
  return sharp(data,{raw:{width:W,height:H,channels:3}}).jpeg({quality:95}).toBuffer();
}
// 한 칸(0~3)의 평균 RGB와 평균 채도.
async function region(input:Buffer,index:number):Promise<{mean:[number,number,number];sat:number;max:number}> {
  const {data,info}=await sharp(input).raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height,x0=index%2?W/2:0,y0=index>1?H/2:0;
  let r=0,g=0,b=0,s=0,n=0,max=0;
  for(let y=y0+H/8;y<y0+H*3/8;y++)for(let x=x0+W/8;x<x0+W*3/8;x++){
    const i=(Math.floor(y)*W+Math.floor(x))*3,R=data[i],G=data[i+1],B=data[i+2],M=Math.max(R,G,B);
    r+=R;g+=G;b+=B;s+=M?(M-Math.min(R,G,B))/M:0;n++;max=Math.max(max,R);
  }
  return {mean:[r/n,g/n,b/n],sat:s/n,max};
}

describe("food look", () => {
  it("picks the menu from the slide title and keywords", () => {
    expect(foodLookOf("비 오는 날엔 홍어 한 점, 막걸리 한 잔")).toBe("hongeo");
    expect(foodLookOf("막걸리 한 사발에 홍어")).toBe("makgeolli");
    expect(foodLookOf("홍어삼합 한 상 차림")).toBe("samhap");
    expect(foodLookOf("수육과 묵은지")).toBe("samhap");
    expect(foodLookOf("바삭한 모둠전 한 접시")).toBe("jeon");
    expect(foodLookOf("오늘의 메뉴 전")).toBe("jeon");
    // "전통·이전"처럼 "전"이 섞인 낱말은 전으로 보지 않는다.
    expect(foodLookOf("전통 방식 그대로, 이전과 같은 맛")).toBeNull();
    expect(foodLookOf("오늘도 문 열었어요")).toBeNull();
  });

  it("makes pink skate flesh more vivid than the default look", async () => {
    // 분홍 살(350°), 자홍빛 살(325°), 회색 접시, 어두운 상.
    const photo=await quad([[180,120,128],[206,150,190],[200,200,198],[70,60,56]]);
    const plain=await enhancePhoto(photo),hongeo=await enhancePhoto(photo,{food:"hongeo"});
    // 350°는 기본도 따뜻한 색이라 조금(.22 vs .18), 325°는 기본에서 거의 빠지던 색이라 크게 오른다.
    expect((await region(hongeo,0)).sat).toBeGreaterThan((await region(plain,0)).sat+.004);
    expect((await region(hongeo,1)).sat).toBeGreaterThan((await region(plain,1)).sat+.02);
    // 회색 접시는 그대로.
    const plate0=await region(plain,2),plate1=await region(hongeo,2);
    expect(Math.abs(plate1.sat-plate0.sat)).toBeLessThan(.005);
  });

  it("keeps a cream-white makgeolli bowl from turning yellow", async () => {
    // 뽀얀 사발(보정 뒤 채도 약 .07), 노릇한 전, 갈색 상, 어두운 바닥.
    const photo=await quad([[238,228,214],[200,150,90],[150,110,80],[60,50,45]]);
    const plain=await region(await enhancePhoto(photo),0),makgeolli=await region(await enhancePhoto(photo,{food:"makgeolli"}),0);
    // 기본 보정은 사발을 조금 누렇게(빨강↑) 밀지만, 막걸리 보정은 사발을 건드리지 않는다(톤 단계 결과 그대로).
    expect(makgeolli.sat).toBeLessThan(plain.sat-.004);
    expect(makgeolli.mean[0]-makgeolli.mean[2]).toBeLessThan(plain.mean[0]-plain.mean[2]-1);
    expect(makgeolli.sat).toBeLessThan(.07);
  });

  it("does not push red pork and kimchi channels past 245 for samhap", async () => {
    const photo=await quad([[238,96,84],[225,120,100],[240,236,228],[90,70,60]]);
    const plain=await region(await enhancePhoto(photo),0),samhap=await region(await enhancePhoto(photo,{food:"samhap"}),0);
    expect(plain.mean[0]).toBeGreaterThan(samhap.mean[0]);
    expect(samhap.mean[0]).toBeLessThanOrEqual(247);
  });

  it("adds highlight contrast to golden pancakes (jeon)", async () => {
    // 밝은 노릇한 면(윤기)과 중간 그늘의 노릇한 면.
    const photo=await quad([[200,160,95],[130,95,50],[235,235,230],[50,42,38]]);
    const plain=await enhancePhoto(photo),jeon=await enhancePhoto(photo,{food:"jeon"});
    const luma=(m:[number,number,number])=>m[0]*.2126+m[1]*.7152+m[2]*.0722;
    const spread=async(buffer:Buffer)=>luma((await region(buffer,0)).mean)-luma((await region(buffer,1)).mean);
    expect(await spread(jeon)).toBeGreaterThan(await spread(plain)+4);
  });
});

describe("quality flags in rendering", () => {
  it("measures quality once while enhancing, matching photoQuality flags", async () => {
    for(const name of ["blurry","dark","warm","lowres"]){
      const photo=await fixture(name);
      const cached=qualityOfEnhanced(await enhancePhoto(photo));
      expect(cached?.flags,name).toEqual((await photoQuality(photo)).flags);
    }
    expect(qualityOfEnhanced(await enhancePhoto(await fixture("warm"),{kind:"ai"}))).toBeUndefined();
  });

  it("sharpens blurry photos more gently after enhancement", async () => {
    const photo=await fixture("blurry");
    const enhanced=await enhancePhoto(photo);
    expect(qualityOfEnhanced(enhanced)?.flags).toContain("blurry");
    const gentle=await finishPhoto(enhanced,540,675);
    // 같은 픽셀이지만 품질 기록이 없는 사본 → 기본(강한) 선명화.
    const strong=await finishPhoto(Buffer.from(enhanced),540,675);
    const plain=await finishPhoto(enhanced,540,675,{finish:"none"});
    const diff=async(a:Buffer,b:Buffer)=>{
      const [x,y]=await Promise.all([a,b].map(buffer=>sharp(buffer).removeAlpha().raw().toBuffer()));
      let sum=0;for(let i=0;i<x.length;i++)sum+=Math.abs(x[i]-y[i]);return sum/x.length;
    };
    const soft=await diff(gentle,plain),hard=await diff(strong,plain);
    expect(soft).toBeGreaterThan(0);
    expect(soft).toBeLessThan(hard*.7);
  });

  it("lowers warm vibrance on dark photos", async () => {
    const photo=await fixture("dark");
    expect(qualityOfEnhanced(await enhancePhoto(photo))?.flags).toContain("dark");
    // 어두운 사진에서는 홍어 보정을 골라도 기본보다 세지지 않는다(상한 .08).
    const plain=await enhancePhoto(photo),hongeo=await enhancePhoto(photo,{food:"hongeo"});
    const [a,b]=await Promise.all([plain,hongeo].map(buffer=>sharp(buffer).raw().toBuffer()));
    let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);
    expect(diff/a.length).toBeLessThan(.5);
  });
});
