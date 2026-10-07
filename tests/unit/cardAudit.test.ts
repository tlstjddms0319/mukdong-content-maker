// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { auditRender, registerPhoto, DEAD_BAND } from "@/features/images/render/audit";
import { mascotLayer } from "@/features/images/decor";
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

describe("card audit warnings", () => {
  // 경고는 재시도 대상(issues)에 들어가지 않고 notes·metrics에만 남는다.
  it("notes a mascot covering text but forgives a light touch", async () => {
    const title=await textLayer("마스코트 뒤에 숨은 글자",{size:60,color:"#111111",width:900,height:120});
    const mascot=(await mascotLayer({width:200,left:0,top:0}))!;
    const draw=(left:number,top:number)=>auditRender(async()=>canvas("#ffffff").composite([
      {input:title.data,left:60,top:400},{input:mascot.input,left,top},
    ]).jpeg().toBuffer());
    const covered=await draw(120,380);
    expect(covered.report.issues).toEqual([]);
    expect(covered.report.metrics.warnings["decor-overlap"]).toBe(1);
    expect(covered.report.notes.find(note=>note.kind==="decor-overlap")).toMatchObject({decor:"mascot"});
    // 글자 상자 바로 아래에 발끝만 닿게 둔 경우는 경고하지 않는다.
    const touching=await draw(120,400+title.info.height-4);
    expect(touching.report.metrics.warnings["decor-overlap"]).toBe(0);
  });

  it("finds an empty band between content but ignores the outer margins", async () => {
    const line=await textLayer("한 줄",{size:50,color:"#111111",width:400,height:80});
    const photo=await sharp({create:{width:900,height:300,channels:3,background:"#b06050"}}).png().toBuffer();
    registerPhoto(photo);
    const {report}=await auditRender(async()=>canvas("#f4f2ee").composite([
      {input:photo,left:90,top:100},{input:line.data,left:90,top:420},{input:line.data,left:90,top:900},
    ]).jpeg().toBuffer(),{cover:true});
    const bands=report.notes.filter(note=>note.kind==="dead-band");
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({kind:"dead-band"});
    if(bands[0].kind==="dead-band"){
      expect(bands[0].top).toBeGreaterThan(420);
      expect(bands[0].bottom).toBeLessThanOrEqual(920);
      expect(bands[0].bottom-bands[0].top).toBeGreaterThanOrEqual(DEAD_BAND);
    }
    // 사진 900×300은 캔버스의 약 19%: 사각 기준 40%에 못 미친다.
    expect(report.notes.find(note=>note.kind==="photo-area")).toMatchObject({shape:"rect",limit:.4});
    expect(report.issues).toEqual([]);
  });

  it("uses the shape-specific photo area limit and treats full-width photos as bleed", async () => {
    const round=await sharp({create:{width:700,height:700,channels:3,background:"#b06050"}}).png().toBuffer();
    registerPhoto(round,{shape:"circle"});
    const circle=await auditRender(async()=>canvas("#f4f2ee").composite([{input:round,left:190,top:200}]).jpeg().toBuffer(),{cover:true});
    expect(circle.report.metrics.photoShape).toBe("circle");
    // 700×700 상자는 약 35%라 원형 기준(30%)은 넘는다.
    expect(circle.report.notes.some(note=>note.kind==="photo-area")).toBe(false);
    const wide=await sharp({create:{width:1080,height:600,channels:3,background:"#b06050"}}).png().toBuffer();
    registerPhoto(wide);
    const bleed=await auditRender(async()=>canvas("#1e1c1a").composite([{input:wide,left:0,top:0}]).jpeg().toBuffer(),{cover:true});
    expect(bleed.report.metrics.photoShape).toBe("bleed");
    expect(bleed.report.notes.find(note=>note.kind==="photo-area")).toMatchObject({shape:"bleed",limit:.5});
  });

  it("records the input photos' quality flags and skips warnings in the fast app mode", async () => {
    const dark=await sharp({create:{width:400,height:300,channels:3,background:"#141414"}}).jpeg().toBuffer();
    const draw=async()=>canvas("#ffffff").jpeg().toBuffer();
    const audited=await auditRender(draw,{photos:[dark]});
    const quality=audited.report.notes.find(note=>note.kind==="photo-quality");
    expect(quality&&quality.kind==="photo-quality"?quality.flags:[]).toEqual(expect.arrayContaining(["dark","lowres"]));
    expect(audited.report.issues).toEqual([]);
    const fast=await auditRender(draw,{contrast:false,photos:[dark]});
    expect(fast.report.notes).toEqual([]);
    expect(Object.values(fast.report.metrics.warnings).every(count=>count===0)).toBe(true);
  });
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

describe("brand kit", () => {
  it("prints the Instagram handle next to the store name in every family's footer", async () => {
    const photo=await sharp({create:{width:900,height:1100,channels:3,background:"#c08070"}}).jpeg().toBuffer();
    const slide={visualPrompt:"",textPosition:"bottom" as const,figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,keywords:["홍어"],variant:0,role:"detail" as const,layout:"frame" as CardLayout,headline:"홍어 한 점은 씹을수록 맛이 올라와요",points:["홍어 살은 얇게 썰려 결이 보여요","묵은지에 싸 한입에 넣어요"]};
    for(const style of StyleIdSchema.options){
      const plain=await composeSlideCard([photo],slide,2,5,"card",{palette:"warm",style},{brandHandle:""});
      const branded=await composeSlideCard([photo],slide,2,5,"card",{palette:"warm",style},{brandHandle:"@mukdong_hongeo"});
      // 계정이 들어간 바닥글 글자 상자가 하나 이상 더 넓어지고, 넘침·겹침은 없다.
      // 계정을 따로 한 줄로 적는 계열(diary 등)은 글자 상자가 하나 늘 수 있다.
      const widest=(boxes:{width:number}[])=>boxes.reduce((max,box)=>Math.max(max,box.width),0);
      expect(branded.report.issues,style).toEqual([]);
      expect(branded.report.boxes.length,style).toBeGreaterThanOrEqual(plain.report.boxes.length);
      expect(widest(branded.report.boxes),style).toBeGreaterThanOrEqual(widest(plain.report.boxes));
    }
  },120_000);
});
