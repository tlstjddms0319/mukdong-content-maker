// 모든 디자인 계열과 템플릿 레이아웃을 까다로운 문안·밝은/어두운 사진으로 그려 자동 검수(render/audit.ts) 결과를 모은다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/audit-cards.mjs [--verbose] [--style=계열] [--handle=계정]
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { composeSlideCard } from "../src/features/images/composeSlide.ts";
import { CardLayoutSchema, LAYOUT_VARIANTS, photosNeeded } from "../src/features/images/design.ts";
import { StyleIdSchema } from "../src/features/images/styleCatalog.ts";
import { describeIssue } from "../src/features/images/render/audit.ts";

const verbose=process.argv.includes("--verbose");
const only=process.argv.find(arg=>arg.startsWith("--style="))?.slice(8);
// --handle=계정 : 브랜드 키트 계정을 바닥글에 넣고 검수(긴 계정에서도 넘치지 않는지).
const brandHandle=process.argv.find(arg=>arg.startsWith("--handle="))?.slice(9)??"";
const sample=name=>readFile(`assets/design/samples/${name}.jpg`);
const dark=await sample("hands-makgeolli"),bright=await sample("studio-hongeo"),busy=await sample("table-topdown");
const white=await sharp({create:{width:900,height:1100,channels:3,background:"#f4f2ee"}}).jpeg().toBuffer();
const longPoints=["홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요","처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요","묵은지에 싸서 수육과 함께 한입에 넣으면 향이 부드러워져요","막걸리 한 모금으로 입안을 정리하고 다음 점을 집어요"];
const copies={
  normal:{headline:"홍어 한 점, 이렇게 드세요",points:["홍어 한 점을 결 방향으로 집어요","묵은지에 싸 한입 크기로 만들어요","막걸리 한 모금으로 마무리해요"]},
  stress:{headline:"비 오는 날 막걸리 한 잔과 함께 먹는 홍어 한 점은 왜 생각날까",points:longPoints},
};
const base={visualPrompt:"",textPosition:"bottom",figure:"7일",titleFont:"auto",bodyFont:"auto",keywords:["홍어","막걸리","비 오는 날"]};
// 어두운 실사진·밝은 단색 사진 두 가지로 글자 대비를 확인한다.
const photoSets={dark:[dark,busy,bright],white:[white,bright,white]};
const cases=[];
for(const style of StyleIdSchema.options.filter(id=>!only||id===only)){
  const layouts=style==="template"?CardLayoutSchema.options:["frame","versus","checklist"];
  for(const layout of layouts){
    const variants=style==="template"?LAYOUT_VARIANTS[layout]:1;
    for(let variant=0;variant<variants;variant++)for(const [copyName,copy] of Object.entries(copies))for(const [photoName,photos] of Object.entries(photoSets)){
      for(const role of ["cover","detail"]){
        if(role==="cover"&&(layout==="versus"||photosNeeded(layout)===0))continue;
        cases.push({style,layout,variant,copyName,photoName,role,photos,copy});
      }
    }
  }
}
const counts={};let failed=0;
// 측정값(문제는 아님): 몰래 축소·외톨이 줄 건수, 표지 사진 면적(계열·레이아웃별 최소값).
const measured={shrinks:{},orphans:{},coverArea:{}};
for(const c of cases){
  const slide={...base,...c.copy,role:c.role,layout:c.layout,variant:c.variant,points:c.role==="cover"?[]:c.copy.points};
  const index=c.role==="cover"?1:2;
  const {report}=await composeSlideCard(c.photos.slice(0,Math.max(1,photosNeeded(c.layout))),slide,index,5,"card",{palette:"warm",style:c.style},{contrast:true,brandHandle});
  const key=`${c.style}/${c.style==="template"?c.layout:"*"}`;
  if(report.metrics.shrinks)measured.shrinks[key]=(measured.shrinks[key]??0)+report.metrics.shrinks;
  if(report.metrics.orphans)measured.orphans[key]=(measured.orphans[key]??0)+report.metrics.orphans;
  if(c.role==="cover"&&c.copyName==="normal")measured.coverArea[key]=Math.min(measured.coverArea[key]??1,report.metrics.photoArea);
  if(verbose&&(report.metrics.shrinks||report.metrics.orphans))console.log(`${c.style} ${c.layout}#${c.variant} ${c.role} ${c.copyName} ${c.photoName}: 측정`,report.notes.map(n=>n.kind==="shrink"?`축소 "${n.text}" ${n.from}→${n.to}px`:`외톨이 줄 "${n.text}" ${n.ratio}`).join(" | "));
  if(report.issues.length){
    failed++;
    for(const issue of report.issues){const key=`${c.style}/${c.style==="template"?c.layout:"*"} ${issue.kind}`;counts[key]=(counts[key]??0)+1;}
    if(verbose)console.log(`${c.style} ${c.layout}#${c.variant} ${c.role} ${c.copyName} ${c.photoName}:`,report.issues.map(issue=>`${describeIssue(issue)}${"box" in issue?` [${issue.box.size}px ${issue.box.color}]`:""}`).join(" | "));
  }
}
console.log(`검수 ${cases.length}건 중 문제 ${failed}건`);
for(const [key,count] of Object.entries(counts).sort((a,b)=>b[1]-a[1]))console.log(`  ${key}: ${count}`);
const sum=table=>Object.values(table).reduce((a,b)=>a+b,0);
console.log(`몰래 축소 ${sum(measured.shrinks)}건, 외톨이 줄 ${sum(measured.orphans)}건`);
for(const [key,count] of Object.entries(measured.shrinks).sort((a,b)=>b[1]-a[1]))console.log(`  축소 ${key}: ${count}`);
for(const [key,count] of Object.entries(measured.orphans).sort((a,b)=>b[1]-a[1]))console.log(`  외톨이 ${key}: ${count}`);
if(process.argv.includes("--area")){
  console.log("표지 사진 면적(보통 문안, 최소값):");
  for(const [key,area] of Object.entries(measured.coverArea).sort((a,b)=>a[1]-b[1]))console.log(`  ${key}: ${Math.round(area*100)}%`);
}
