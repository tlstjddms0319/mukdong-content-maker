// 모든 디자인 계열과 템플릿 레이아웃을 까다로운 문안·밝은/어두운 사진으로 그려 자동 검수(render/audit.ts) 결과를 모은다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/audit-cards.mjs [--verbose] [--style=계열] [--handle=계정] [--theme=테마] [--area]
// 문제(issues)와 따로 경고(장식 겹침·빈 띠·표지 사진 면적·사진 품질)를 계열별로 센다. 경고는 실패로 치지 않는다(다음 개선 목록).
// 식욕 점수(Gemini 비전)는 scripts/appetite-bench.mjs가 따로 잰다.
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { composeSlideCard } from "../src/features/images/composeSlide.ts";
import { CardLayoutSchema, LAYOUT_VARIANTS, photosNeeded } from "../src/features/images/design.ts";
import { StyleIdSchema } from "../src/features/images/styleCatalog.ts";
import { AUDIT_WARNING_KINDS, describeIssue, describeNote } from "../src/features/images/render/audit.ts";
import { photoQuality } from "../src/features/images/render/photoEnhance.ts";

const verbose=process.argv.includes("--verbose");
const only=process.argv.find(arg=>arg.startsWith("--style="))?.slice(8);
// --handle=계정 : 브랜드 키트 계정을 바닥글에 넣고 검수(긴 계정에서도 넘치지 않는지).
const brandHandle=process.argv.find(arg=>arg.startsWith("--handle="))?.slice(9)??"";
// --theme=테마 : 템플릿 게시물 테마(themes.ts)를 바꿔 검수(예: 조각보 테두리가 글자와 부딪히지 않는지).
const theme=process.argv.find(arg=>arg.startsWith("--theme="))?.slice(8);
const sample=name=>readFile(`assets/design/samples/${name}.jpg`);
const dark=await sample("hands-makgeolli"),bright=await sample("studio-hongeo"),busy=await sample("table-topdown");
const white=await sharp({create:{width:900,height:1100,channels:3,background:"#f4f2ee"}}).jpeg().toBuffer();
const longPoints=["홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요","처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요","묵은지에 싸서 수육과 함께 한입에 넣으면 향이 부드러워져요","막걸리 한 모금으로 입안을 정리하고 다음 점을 집어요"];
const copies={
  normal:{headline:"홍어 한 점, 이렇게 드세요",subline:"처음 먹는 친구에게 알려 주는 순서",points:["홍어 한 점을 결 방향으로 집어요","묵은지에 싸 한입 크기로 만들어요","막걸리 한 모금으로 마무리해요"]},
  stress:{headline:"비 오는 날 막걸리 한 잔과 함께 먹는 홍어 한 점은 왜 생각날까",subline:"처음이라도 부담 없이 즐기는 방법을 모았어요",points:longPoints},
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
      // 마지막 장(visit, 5/5)은 가게 명함 블록이 들어가므로 따로 검수한다.
      for(const role of ["cover","detail","visit"]){
        if(role==="cover"&&(layout==="versus"||photosNeeded(layout)===0))continue;
        cases.push({style,layout,variant,copyName,photoName,role,photos,copy});
      }
    }
  }
}
const counts={};let failed=0;
// 측정값(문제는 아님): 몰래 축소·외톨이 줄 건수, 표지 사진 면적(계열·레이아웃별 최소값).
const measured={shrinks:{},orphans:{},coverArea:{}};
// 경고: 종류 → 계열 키 → 건수.
const warned=Object.fromEntries(AUDIT_WARNING_KINDS.map(kind=>[kind,{}]));
// 사진 품질은 넣은 사진에 달린 것이라 사진마다 한 번만 잰다. 카드 그리기가 품질 메모를 남기지 않는 경로(composeSlideCard가
// 원본 사진을 검수에 넘기지 않을 때)에서는 여기서 잰 값으로 센다.
const qualityCache=new Map();
const flagsOf=photo=>{if(!qualityCache.has(photo))qualityCache.set(photo,photoQuality(photo).then(q=>q.flags).catch(()=>[]));return qualityCache.get(photo);};
for(const c of cases){
  const slide={...base,...c.copy,subline:c.role==="cover"?c.copy.subline:"",role:c.role,layout:c.layout,variant:c.variant,points:c.role==="cover"?[]:c.copy.points};
  const index=c.role==="cover"?1:c.role==="visit"?5:2;
  const {report}=await composeSlideCard(c.photos.slice(0,Math.max(1,photosNeeded(c.layout))),slide,index,5,"card",{palette:"warm",style:c.style,...(theme?{theme}:{})},{contrast:true,brandHandle});
  const key=`${c.style}/${c.style==="template"?c.layout:"*"}`;
  if(report.metrics.shrinks)measured.shrinks[key]=(measured.shrinks[key]??0)+report.metrics.shrinks;
  if(report.metrics.orphans)measured.orphans[key]=(measured.orphans[key]??0)+report.metrics.orphans;
  if(c.role==="cover"&&c.copyName==="normal")measured.coverArea[key]=Math.min(measured.coverArea[key]??1,report.metrics.photoArea);
  const notes=[...report.notes];
  if(!report.notes.some(note=>note.kind==="photo-quality"))for(const [i,photo] of c.photos.slice(0,Math.max(1,photosNeeded(c.layout))).entries()){
    const flags=await flagsOf(photo);
    if(flags.length)notes.push({kind:"photo-quality",photo:i,flags});
  }
  // 한 장에 빈 띠가 둘이어도 한 건(걸린 카드 수)으로 센다.
  for(const kind of new Set(notes.map(note=>note.kind)))if(kind in warned)warned[kind][key]=(warned[kind][key]??0)+1;
  if(verbose&&notes.length)console.log(`${c.style} ${c.layout}#${c.variant} ${c.role} ${c.copyName} ${c.photoName}: 측정`,notes.map(describeNote).join(" | "));
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
// 경고는 계열별로(많은 순), 걸린 카드 수다.
const LABELS={"decor-overlap":"장식 겹침","dead-band":"빈 띠","photo-area":"표지 사진 면적 부족","photo-quality":"사진 품질"};
console.log(`경고 ${AUDIT_WARNING_KINDS.map(kind=>`${LABELS[kind]} ${sum(warned[kind])}`).join(", ")}`);
for(const kind of AUDIT_WARNING_KINDS)for(const [key,count] of Object.entries(warned[kind]).sort((a,b)=>b[1]-a[1]))console.log(`  ${LABELS[kind]} ${key}: ${count}`);
