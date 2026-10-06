// 스타일 계열마다 표지·사진 장·글자 장·마지막 장을 그려 한 장의 비교 시트로 모은다. AI 호출 없이 샘플 사진만 쓴다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-style-gallery.mjs [style ...]
// 결과: output/style-gallery/<style>.jpg 와 전체 비교 output/style-gallery/all.jpg
// --stress 를 붙이면 긴 제목·긴 요점 4개·사진 2장 같은 까다로운 장으로 그려 넘침·겹침을 찾는다(output/style-gallery-stress/).
// --photo=real|ai|none|legacy : 사진 보정 방식(기본 real = 사장님 사진과 같은 보정). legacy는 1단계 이전 보정으로 그려 전후를 비교한다.
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { composeSlideImage } from "../src/features/images/composeSlide.ts";
import { enhancePhotoLegacy } from "../src/features/images/render/photoEnhance.ts";
import { STYLES, StyleIdSchema } from "../src/features/images/styleCatalog.ts";

const stress=process.argv.includes("--stress");
const photo=process.argv.find(arg=>arg.startsWith("--photo="))?.split("=")[1]??"real";
if(!["real","ai","none","legacy"].includes(photo))throw new Error(`--photo는 real|ai|none|legacy 중 하나: ${photo}`);
const args=process.argv.slice(2).filter(arg=>arg!=="--stress"&&!arg.startsWith("--photo="));
const chosen=args.length?args:StyleIdSchema.options.filter(id=>id!=="template");
const OUT=stress?"output/style-gallery-stress":"output/style-gallery";
const sample=async name=>readFile(path.join("assets/design/samples",`${name}.jpg`));
const photos={cover:await sample("hands-makgeolli"),studio:await sample("studio-hongeo"),table:await sample("table-topdown"),samhap:await sample("hands-samhap")};
const base={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:0};
const slides=[
  {...base,role:"cover",layout:"fullscreen",headline:"비 오는 날엔 홍어 한 점, 막걸리 한 잔",subline:"처음이라도 부담 없이 즐기는 법",points:[],keywords:["홍어","막걸리"],inputs:[photos.cover],index:1},
  {...base,role:"detail",layout:"frame",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 결이 비쳐 보여요","톡 쏘는 향이 입안에 퍼져요","다음 장에서 먹는 법을 볼게요"],keywords:["홍어","감칠맛"],inputs:[photos.studio],index:2},
  {...base,role:"how-to",layout:"browser",headline:"홍어 한 점, 이렇게 드세요",points:["홍어 한 점을 결 방향으로 집어요","묵은지에 싸 한입 크기로 만들어요","코로 숨을 내쉬며 향을 느껴요","막걸리 한 모금으로 마무리해요"],keywords:["먹는 법","홍어"],inputs:[],index:3},
  {...base,role:"visit",layout:"frame",headline:"가기 전에 이것만 확인하면 돼요",points:["처음이라면 덜 삭힌 걸로 주문해요","저장해 두면 다음에 찾기 편해요"],keywords:["방문 전","확인"],inputs:[photos.table],index:5},
];
// 까다로운 경우: 아주 긴 표지 제목, 긴 요점 4개(사진 장), 사진 2장 비교, 긴 요점 4개(글자 장).
const longPoints=["홍어 살은 얇게 썰려 빛에 비추면 결이 또렷하게 보여요","처음이라면 덜 삭힌 쪽부터 작게 한 점 집어 보세요","묵은지에 싸서 수육과 함께 한입에 넣으면 향이 부드러워져요","막걸리 한 모금으로 입안을 정리하고 다음 점을 집어요"];
const stressSlides=[
  {...base,role:"cover",layout:"fullscreen",headline:"비 오는 날 막걸리 한 잔과 함께 먹는 홍어 한 점은 왜 이렇게 생각날까?",subline:"처음 먹는 친구에게 알려 주는 순서를 모았어요",points:[],keywords:["홍어","막걸리","비 오는 날"],inputs:[photos.cover],index:1},
  {...base,role:"detail",layout:"frame",headline:"홍어 한 점을 씹을수록 진한 감칠맛이 천천히 올라오는 이유",points:longPoints,keywords:["홍어","감칠맛"],inputs:[photos.studio],index:2},
  {...base,role:"pairing",layout:"versus",headline:"홍어와 가오리는 썰어 놓으면 어떻게 다를까요?",points:longPoints.slice(0,3),keywords:["홍어","가오리"],inputs:[photos.studio,photos.table],index:3},
  {...base,role:"how-to",layout:"checklist",headline:"처음 홍어를 먹는 친구에게 알려 주는 순서",points:longPoints,keywords:["먹는 법"],inputs:[],index:4},
];
await mkdir(OUT,{recursive:true});
const rows=[];
for(const style of chosen){
  const tiles=[];
  for(const slide of stress?stressSlides:slides){
    const {inputs,index,...plan}=slide;
    // legacy는 예전 보정을 미리 적용한 사진을 보정 없이 넘긴다.
    const prepared=photo==="legacy"?await Promise.all(inputs.map(enhancePhotoLegacy)):inputs;
    const image=await composeSlideImage(prepared,plan,index,5,"card",{palette:"warm",style},{photoKind:photo==="legacy"?"none":photo});
    tiles.push(await sharp(image).resize(324,405).png().toBuffer());
  }
  const label=await sharp({text:{text:`<span foreground="#222">${STYLES[style].label.replace(/&/g,"&amp;")}</span>`,font:"Pretendard Bold 26",fontfile:"assets/fonts/Pretendard-Bold.otf",rgba:true}}).png().toBuffer();
  const row=await sharp({create:{width:324*4+24,height:405+44,channels:3,background:"#ffffff"}}).composite([{input:label,left:6,top:6},...tiles.map((input,i)=>({input,left:i*332,top:44}))]).png().toBuffer();
  await sharp(row).jpeg({quality:88}).toFile(`${OUT}/${style}.jpg`);
  rows.push(row);
  console.log(`rendered ${style}`);
}
await sharp({create:{width:324*4+24,height:rows.length*(405+44+10),channels:3,background:"#ffffff"}}).composite(rows.map((input,i)=>({input,left:0,top:i*(405+44+10)}))).jpeg({quality:85}).toFile(`${OUT}/all.jpg`);
console.log(`${OUT}/all.jpg`);
