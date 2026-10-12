// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { composeSlideCard } from "@/features/images/composeSlide";
import { describeIssue, type AuditReport } from "@/features/images/render/audit";
import { photoFocusComposition } from "@/features/images/styles/photoFocus";
import { glueShortWords } from "@/features/images/styles/trackKit";
import type { CarouselSlidePlan } from "@/features/images/carousel";

// 두 갈래 디자인(사진 중심·글 중심)을 갈래 규칙대로 그려(표지 사진 1장, 사진 중심 본문 frame / 글 중심 본문 browser)
// 자동 검수(넘침·겹침·대비·프로필 격자)가 깨끗한지, 갈래의 약속(글 중심 본문은 사진 없음·세 줄 이내, 사진 중심은 사진이 큼)을 지키는지 본다.
const base={visualPrompt:"",textPosition:"bottom" as const,figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0,subline:"",keywords:["홍어","막걸리"]};
const copies:Record<string,CarouselSlidePlan[]>={
  normal:[
    {...base,role:"cover",layout:"fullscreen",headline:"비 오는 날엔 홍어 한 점 어때요?",subline:"처음이라도 부담 없는 순서",points:[]},
    {...base,role:"detail",layout:"frame",headline:"가까이 보면 결이 살아 있어요",points:["얇게 썰려 빛에 결이 비쳐요","씹을수록 쫀득함이 올라와요"]},
    {...base,role:"how-to",layout:"frame",headline:"한 점은 이렇게 드세요",points:["결 방향으로 한 점 집어요","초장은 살짝만 찍어 보세요"]},
    {...base,role:"pairing",layout:"frame",headline:"막걸리 한 잔이 짝이에요",points:["톡 쏘는 향을 부드럽게 눌러요","한 모금 뒤 다음 점을 집어요"]},
    {...base,role:"visit",layout:"frame",headline:"가기 전에 이것만 보세요",points:["처음이면 덜 삭힌 걸로 주문해요"]},
  ],
  // 갈래 상한 길이(표지 24·20자, 본문 18자·짧은 글 20자)에 꽉 찬 글.
  long:[
    {...base,role:"cover",layout:"fullscreen",headline:"비 오는 저녁, 막걸리와 홍어 한 점이 당기는 이유",subline:"처음 먹는 친구에게 알려 주는 순서",points:[]},
    {...base,role:"detail",layout:"frame",headline:"홍어 살은 가까이 보면 결이 달라요",points:["얇게 썰린 살에 빛이 비쳐 결이 보여요","씹을수록 쫀득하고 감칠맛이 올라와요"]},
    {...base,role:"how-to",layout:"frame",headline:"처음이라면 이 순서로 드셔 보세요",points:["덜 삭힌 쪽부터 작게 한 점 집어요","초장을 살짝 찍어 향을 먼저 봐요"]},
    {...base,role:"pairing",layout:"frame",headline:"막걸리 한 모금이 향을 정리해 줘요",points:["톡 쏘는 향을 막걸리가 부드럽게 눌러요","한 모금 마신 뒤 다음 점을 집어 보세요"]},
    {...base,role:"visit",layout:"frame",headline:"가기 전에 이것만 확인해 두세요",points:["처음이라면 덜 삭힌 걸로 주문해 보세요"]},
  ],
};
const photos=async()=>({
  dark:await readFile("assets/design/samples/hands-makgeolli.jpg"),
  bright:await sharp({create:{width:900,height:1100,channels:3,background:"#f4f2ee"}}).jpeg().toBuffer(),
});
type Track="photo-focus"|"text-focus";
async function render(style:Track,slide:CarouselSlidePlan,index:number,photo:Buffer,total=5){
  const layout=index===1?"fullscreen":style==="photo-focus"?"frame":"browser";
  const inputs=style==="photo-focus"||index===1?[photo]:[];
  return composeSlideCard(inputs,{...slide,layout},index,total,"card",{palette:"warm",style},{contrast:true,brandHandle:"mukdong_hongeo"});
}
// 글 상자의 줄 수(프리텐다드·함렛: 한 줄 높이 ≈ 글자 크기 × 1.2, 줄 간격 ≤ 0.2배).
const linesOf=(box:AuditReport["boxes"][number])=>Math.max(1,Math.round(box.height/(box.size*1.3)));

describe("track design families", () => {
  it("keeps one-syllable words on the same line as the next word in titles", () => {
    // "막걸리와 홍어 한 / 점이 당기는 이유"처럼 꾸밈말 뒤에서 줄이 바뀌지 않게 줄바꿈 없는 공백으로 묶는다.
    expect(glueShortWords("막걸리와 홍어 한 점이 당기는 이유")).toBe("막걸리와 홍어 한\u00A0점이 당기는 이유");
    expect(glueShortWords("비 오는 날엔 홍어 한 점 어때요?")).toBe("비\u00A0오는 날엔 홍어 한\u00A0점\u00A0어때요?");
    expect(glueShortWords("가까이 보면 결이 살아 있어요")).toBe("가까이 보면 결이 살아 있어요");
  });


  it("draws every slide of both tracks without audit issues on dark and bright photos, normal and long copy", async () => {
    const shots=await photos();
    const problems:string[]=[];
    for(const style of ["photo-focus","text-focus"] as const)for(const [copyName,copy] of Object.entries(copies))for(const [photoName,photo] of Object.entries(shots)){
      for(const [i,slide] of copy.entries()){
        const {image,report}=await render(style,slide,i+1,photo);
        expect(await sharp(image).metadata()).toMatchObject({width:1080,height:1350});
        problems.push(...report.issues.map(issue=>`${style} ${copyName} ${photoName} #${i+1}: ${describeIssue(issue)}`));
        // 폰에서 읽히는 크기: 장 번호 같은 작은 표시도 30px 이상.
        for(const box of report.boxes)expect(box.size,`${style} #${i+1} ${box.size}px`).toBeGreaterThanOrEqual(30);
        // 글자가 몰래 줄어들지 않는다.
        expect(report.metrics.shrinks,`${style} ${copyName} #${i+1}`).toBe(0);
      }
    }
    expect(problems).toEqual([]);
  },240_000);

  it("keeps text-focus body cards photo-free with at most three big lines and rotating backgrounds", async () => {
    const {dark}=await photos();
    const corners:string[]=[];
    for(const copy of Object.values(copies))for(const index of [2,3,4,5]){
      // 사진을 넘겨도(예전 초안의 사진 장) 본문 장에는 쓰지 않는다.
      const {image,report}=await composeSlideCard([dark],{...copy[index-1],layout:"frame"},index,5,"card",{palette:"warm",style:"text-focus"},{contrast:true});
      expect(report.metrics.photoArea).toBe(0);
      // 제목(84px 이상)과 짧은 글(58px 이상)만 센다. 큰 장 번호(300px)와 바닥글(40px)은 글 줄이 아니다.
      const copyBoxes=report.boxes.filter(box=>box.size>=44&&box.size<=120);
      const title=copyBoxes.find(box=>box.size>=84)!;
      expect(title).toBeTruthy();
      expect(copyBoxes.reduce((sum,box)=>sum+linesOf(box),0)).toBeLessThanOrEqual(3);
      for(const box of copyBoxes)expect(box.size).toBeGreaterThanOrEqual(58);
      // 큰 장 번호 + 글 덩어리가 바닥글 위 남는 높이의 가운데에 있다(예전에는 글 아래로 330px 넘는 빈 띠가 남았다).
      if(index<5){
      const numeral=report.boxes.find(box=>box.size>=200)!,footer=report.boxes.filter(box=>box.size<=40).reduce((min,box)=>Math.min(min,box.top),1350);
      const textBottom=Math.max(...copyBoxes.map(box=>box.top+box.height));
      expect(Math.abs((numeral.top-96)-(footer-56-textBottom)),`${index}장 위아래 여백`).toBeLessThan(140);
      expect(footer-textBottom,`${index}장 글 아래 빈자리`).toBeLessThan(330);
      }
      if(index<5){const {data}=await sharp(image).extract({left:8,top:8,width:1,height:1}).raw().toBuffer({resolveWithObject:true});corners.push([...data].join(","));}
    }
    // 이어지는 본문 장은 바탕색이 다르다(크림 → 겨자 → 밤색).
    expect(new Set(corners.slice(0,3)).size).toBe(3);
  },120_000);

  it("drops a short line rather than going past three lines when the headline wraps", async () => {
    const slide={...copies.normal[1],headline:"홍어 한 점은 씹을수록 진한 감칠맛이 천천히 올라오는 이유가 있어요"};
    const {report,droppedPoints}=await composeSlideCard([],{...slide,layout:"browser"},2,5,"card",{palette:"warm",style:"text-focus"},{contrast:true});
    expect(report.issues).toEqual([]);
    expect(report.boxes.filter(box=>box.size>=44&&box.size<=120).reduce((sum,box)=>sum+linesOf(box),0)).toBeLessThanOrEqual(3);
    expect(droppedPoints).toBeGreaterThanOrEqual(1);
  },60_000);

  it("gives photo-focus a large photo and alternates two compositions between body slides", async () => {
    const {dark}=await photos();
    const areas:number[]=[];
    for(const [i,slide] of copies.normal.entries())areas.push((await render("photo-focus",slide,i+1,dark)).report.metrics.photoArea);
    expect(areas[0]).toBeGreaterThanOrEqual(.95);              // 표지: 화면 가득
    for(const area of areas.slice(1,4))expect(area).toBeGreaterThanOrEqual(.5); // 본문: 액자형도 절반 넘게
    expect(areas[4]).toBeGreaterThanOrEqual(.3);               // 마지막 장: 사진 + 가게 명함
    expect([2,3,4,5].map(index=>photoFocusComposition(index,6))).toEqual(["framed","bleed","framed","bleed"]);
    expect(photoFocusComposition(5,5)).toBe("framed");
    // 사진이 없는 장(예전 초안)도 깨지지 않고 그린다.
    const empty=await composeSlideCard([],{...copies.normal[2],layout:"browser"},3,5,"card",{palette:"warm",style:"photo-focus"});
    expect(empty.report.issues).toEqual([]);
  },120_000);

  it("shows only one short line on photo-focus body slides and the store card on the last slide", async () => {
    const {bright}=await photos();
    const body=await render("photo-focus",copies.normal[1],2,bright);
    expect(body.droppedPoints).toBe(1);
    const last=await render("photo-focus",copies.normal[4],5,bright);
    expect(last.report.texts.join("\n")).toContain("저장해 두고 다시 보세요");
    expect(last.report.texts.join("\n")).toContain("@mukdong_hongeo");
    // 홍보 카드가 따로 붙으면(장 번호 5/6) 5번째 장은 본문 장이라 명함 대신 "넘겨 보기"를 단다.
    const notLast=await render("photo-focus",copies.normal[4],5,bright,6);
    expect(notLast.report.texts.join("\n")).toContain("넘겨 보기");
    expect(notLast.report.texts.join("\n")).not.toContain("저장해 두고 다시 보세요");
  },60_000);
});
