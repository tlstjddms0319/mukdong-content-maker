// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { auditRender } from "@/features/images/render/audit";
import { textLayer } from "@/features/images/render/primitives";
import { enhancePhoto, photoStats } from "@/features/images/render/photoEnhance";
import { composeSlideCard } from "@/features/images/composeSlide";
import { StyleIdSchema } from "@/features/images/styleCatalog";
import { photosNeeded, type CardLayout } from "@/features/images/design";
import { readableOn, contrastRatio } from "@/features/images/design";

const canvas=(background:string)=>sharp({create:{width:1080,height:1350,channels:3,background}});

describe("card audit", () => {
  it("catches text that leaves the canvas, overlapping text and low contrast", async () => {
    const title=await textLayer("홍어 한 점은 이렇게 드세요",{size:60,color:"#111111",width:900,height:200});
    const faint=await textLayer("흐린 글자",{size:30,color:"#dddddd",width:400,height:60});
    const {report}=await auditRender(async()=>canvas("#ffffff").composite([
      {input:title.data,left:700,top:100},                 // 오른쪽으로 넘침
      {input:title.data,left:60,top:400},
      {input:(await textLayer("겹치는 글자 두 줄",{size:60,color:"#111111",width:900,height:200})).data,left:80,top:410}, // 겹침
      {input:faint.data,left:60,top:900},                  // 흰 바탕에 연회색
    ]).jpeg().toBuffer(),{cover:true});
    const kinds=report.issues.map(issue=>issue.kind);
    expect(kinds).toContain("overflow");
    expect(kinds).toContain("overlap");
    expect(kinds).toContain("contrast");
    expect(kinds).toContain("gridSafe");
  });

  it("passes clean text and makes white meta text readable on a bright photo with its outline", async () => {
    const dark=await textLayer("또렷한 글자",{size:40,color:"#111111",width:600,height:100});
    const clean=await auditRender(async()=>canvas("#f4f2ee").composite([{input:dark.data,left:100,top:100}]).jpeg().toBuffer());
    expect(clean.report.issues).toEqual([]);
    const ratioOf=async(shadow:boolean)=>{
      const meta=await textLayer("2 / 5",{size:26,color:"#fffffff2",width:200,height:36,shadow});
      const {report}=await auditRender(async()=>canvas("#f4f2ee").composite([{input:meta.data,left:100,top:400}]).jpeg().toBuffer());
      const issue=report.issues.find(item=>item.kind==="contrast");
      return issue&&"ratio" in issue?issue.ratio:99;
    };
    // 흰 사진 위 흰 글자: 외곽 그림자가 없으면 거의 안 보이고(1.1:1 안팎), 있으면 최소 3:1 이상으로 읽힌다.
    expect(await ratioOf(false)).toBeLessThan(1.5);
    expect(await ratioOf(true)).toBeGreaterThanOrEqual(3);
  });

  it("keeps every design family readable with long copy on a bright photo", async () => {
    const white=await sharp({create:{width:900,height:1100,channels:3,background:"#f4f2ee"}}).jpeg().toBuffer();
    const points=["홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요","처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요","묵은지에 싸서 수육과 함께 한입에 넣으면 향이 부드러워져요","막걸리 한 모금으로 입안을 정리하고 다음 점을 집어요"];
    const base={visualPrompt:"",textPosition:"bottom" as const,figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,keywords:["홍어","막걸리"],variant:0};
    const problems:string[]=[];
    for(const style of StyleIdSchema.options){
      for(const [role,layout] of [["cover","fullscreen"],["detail","frame"],["how-to","checklist"]] as const){
        const slide={...base,role,layout:layout as CardLayout,headline:"비 오는 날 막걸리 한 잔과 함께 먹는 홍어 한 점은 왜 생각날까",points:role==="cover"?[]:points};
        const {report}=await composeSlideCard(Array.from({length:Math.max(1,photosNeeded(layout))},()=>white),slide,role==="cover"?1:2,5,"card",{palette:"warm",style},{contrast:true});
        problems.push(...report.issues.map(issue=>`${style}/${layout}: ${issue.kind}`));
      }
    }
    expect(problems).toEqual([]);
  },180_000);
});

describe("photo enhancement", () => {
  it("brightens a dark, blue-tinted phone photo without flattening it", async () => {
    const dark=await sharp({create:{width:600,height:800,channels:3,background:{r:60,g:70,b:105}}})
      .composite([{input:await sharp({create:{width:300,height:300,channels:3,background:{r:150,g:70,b:70}}}).png().toBuffer(),left:150,top:250}]).jpeg().toBuffer();
    const before=await photoStats(dark),after=await photoStats(await enhancePhoto(dark));
    expect(after.luminance).toBeGreaterThan(before.luminance+.05);
    // 파란 기운(B-R 차이)이 줄어든다.
    expect(after.mean[2]-after.mean[0]).toBeLessThan(before.mean[2]-before.mean[0]);
    const meta=await sharp(await enhancePhoto(dark)).metadata();
    expect([meta.width,meta.height]).toEqual([600,800]);
  });

  it("corrects accent text colors only as much as needed", () => {
    expect(readableOn("#1f2b27","#f6f2ea")).toBe("#1f2b27");
    const fixed=readableOn("#c65138","#1f2023");
    expect(contrastRatio(fixed,"#1f2023")).toBeGreaterThanOrEqual(4.5);
  });
});
