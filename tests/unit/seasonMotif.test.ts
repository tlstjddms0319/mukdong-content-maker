// 계절 소품(계획서 B11): 글자·사진 자리를 피해 빈 자리에만 얹고, 주제·시기에 맞게 고른다. 날짜 글자는 넣지 않는다.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composeSlideCard } from "@/features/images/composeSlide";
import { buildCarouselPlanPrompt, createFallbackCarouselPlan } from "@/features/images/carousel";
import { DesignSpecSchema } from "@/features/images/design";
import { addSeasonMotif } from "@/features/images/render/seasonLayer";
import { suggestSeasonMotif } from "@/features/images/seasonMotif";

const slide={role:"how-to" as const,layout:"checklist" as const,headline:"처음 먹는다면",subline:"",points:["작게 한 점부터","초장은 살짝만","막걸리 한 모금"],visualPrompt:"",textPosition:"top" as const,keywords:["과메기"],figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0};
const raw=async(image:Buffer)=>(await sharp(image).raw().toBuffer({resolveWithObject:true}));
// 상자 안 평균 화소 차이(0~255).
async function diffIn(a:Buffer,b:Buffer,box:{left:number;top:number;width:number;height:number}){
  const [x,y]=[await raw(a),await raw(b)];
  let sum=0,n=0;
  for(let row=box.top;row<box.top+box.height;row++)for(let col=box.left;col<box.left+box.width;col++){
    const i=(row*1080+col)*3;for(let c=0;c<3;c++){sum+=Math.abs(x.data[i+c]-y.data[i+c]);n++;}
  }
  return sum/n;
}

describe("season motif layer", () => {
  it("draws only in free space and never over the text", async () => {
    const plain=await composeSlideCard([],slide,3,5,"card",{palette:"warm",season:"none"});
    const rainy=await composeSlideCard([],slide,3,5,"card",{palette:"warm",season:"rain"});
    expect(rainy.image.equals(plain.image)).toBe(false);
    // 소품을 얹으면 JPEG을 한 번 더 굽는다. 같은 재인코딩을 거친 그림과 비교해야 소품만의 차이가 보인다.
    const base=await sharp(plain.image).jpeg({quality:92}).toBuffer();
    for(const box of plain.report.boxes){
      const clipped={left:Math.max(0,box.left),top:Math.max(0,box.top),width:Math.min(box.width,1080-Math.max(0,box.left)),height:Math.min(box.height,1350-Math.max(0,box.top))};
      expect(await diffIn(base,rainy.image,clipped)).toBeLessThan(.5);
    }
    // 소품은 검수 결과(글자 상자)를 바꾸지 않는다.
    expect(rainy.report.boxes.map(box=>[box.left,box.top])).toEqual(plain.report.boxes.map(box=>[box.left,box.top]));
  });

  it("is deterministic for the same card", async () => {
    const a=await composeSlideCard([],slide,3,5,"card",{palette:"warm",season:"blossom"});
    const b=await composeSlideCard([],slide,3,5,"card",{palette:"warm",season:"blossom"});
    expect(a.image.equals(b.image)).toBe(true);
  });

  it("skips cards with no free space, except the saekdong edge band", async () => {
    const card=await sharp({create:{width:1080,height:1350,channels:3,background:"#203040"}}).jpeg().toBuffer();
    const full={boxes:[],occupied:[{left:0,top:0,width:1080,height:1350}]};
    expect(await addSeasonMotif(card,full,"rain",1)).toBe(card);
    expect(await addSeasonMotif(card,full,"moon",1)).toBe(card);
    expect(await addSeasonMotif(card,full,"none",1)).toBe(card);
    const banded=await addSeasonMotif(card,full,"saekdong",1);
    expect(banded).not.toBe(card);
    // 띠는 맨 위 가장자리에만: 가운데는 그대로.
    expect(await diffIn(card,banded,{left:0,top:300,width:1080,height:700})).toBeLessThan(1);
    expect(await diffIn(card,banded,{left:0,top:0,width:1080,height:20})).toBeGreaterThan(20);
  });

  it("picks a motif from the topic first, then from the current season event", () => {
    expect(suggestSeasonMotif("비 오는 날엔 미나리전",new Date("2026-03-03T03:00:00Z"))).toBe("rain");
    expect(suggestSeasonMotif("겨울엔 과메기 한 점",new Date("2026-03-03T03:00:00Z"))).toBe("snow");
    expect(suggestSeasonMotif("설날 가족 모임 상차림",new Date("2026-03-03T03:00:00Z"))).toBe("saekdong");
    // 주제에 단서가 없으면 지금 진행 중인 행사(추석 연휴 주간)로.
    expect(suggestSeasonMotif("홍어 한 점의 결",new Date("2026-09-24T03:00:00Z"))).toBe("moon");
    // 아무 단서도 없으면 장식 없음.
    expect(suggestSeasonMotif("홍어 한 점의 결",new Date("2026-03-03T03:00:00Z"))).toBe("none");
  });

  it("keeps old plans valid and keeps the AI's choice", () => {
    expect(DesignSpecSchema.parse({palette:"warm"}).season).toBe("none");
    expect(DesignSpecSchema.parse({palette:"warm",season:"moon"}).season).toBe("moon");
  });

  it("asks the plan AI to choose a season motif only when it fits", () => {
    const prompt=buildCarouselPlanPrompt({topic:"추석엔 홍어 한 상",slideCount:5});
    expect(prompt).toContain("design.season");
    expect(prompt).toContain("보름달");
    expect(createFallbackCarouselPlan({topic:"추석엔 홍어 한 상",slideCount:5}).design.season).toBeDefined();
  });
});
