// 스타일 계열마다 표지·사진 장·글자 장·마지막 장을 그려 한 장의 비교 시트로 모은다. AI 호출 없이 샘플 사진만 쓴다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-style-gallery.mjs [style ...]
// 결과: output/style-gallery/<style>.jpg 와 전체 비교 output/style-gallery/all.jpg
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { composeSlideImage } from "../src/features/images/composeSlide.ts";
import { STYLES, StyleIdSchema } from "../src/features/images/styleCatalog.ts";

const chosen=process.argv.slice(2).length?process.argv.slice(2):StyleIdSchema.options.filter(id=>id!=="template");
const sample=async name=>readFile(path.join("assets/design/samples",`${name}.jpg`));
const photos={cover:await sample("hands-makgeolli"),studio:await sample("studio-hongeo"),table:await sample("table-topdown"),samhap:await sample("hands-samhap")};
const base={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:0};
const slides=[
  {...base,role:"cover",layout:"fullscreen",headline:"비 오는 날엔 홍어 한 점, 막걸리 한 잔",points:[],keywords:["홍어","막걸리"],inputs:[photos.cover],index:1},
  {...base,role:"detail",layout:"frame",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 결이 비쳐 보여요","톡 쏘는 향이 입안에 퍼져요","다음 장에서 먹는 법을 볼게요"],keywords:["홍어","감칠맛"],inputs:[photos.studio],index:2},
  {...base,role:"how-to",layout:"browser",headline:"홍어 한 점, 이렇게 드세요",points:["홍어 한 점을 결 방향으로 집어요","묵은지에 싸 한입 크기로 만들어요","코로 숨을 내쉬며 향을 느껴요","막걸리 한 모금으로 마무리해요"],keywords:["먹는 법","홍어"],inputs:[],index:3},
  {...base,role:"visit",layout:"frame",headline:"가기 전에 이것만 확인하면 돼요",points:["처음이라면 덜 삭힌 걸로 주문해요","저장해 두면 다음에 찾기 편해요"],keywords:["방문 전","확인"],inputs:[photos.table],index:5},
];
await mkdir("output/style-gallery",{recursive:true});
const rows=[];
for(const style of chosen){
  const tiles=[];
  for(const slide of slides){
    const {inputs,index,...plan}=slide;
    const image=await composeSlideImage(inputs,plan,index,5,"card",{palette:"warm",style});
    tiles.push(await sharp(image).resize(324,405).png().toBuffer());
  }
  const label=await sharp({text:{text:`<span foreground="#222">${STYLES[style].label}</span>`,font:"Pretendard Bold 26",fontfile:"assets/fonts/Pretendard-Bold.otf",rgba:true}}).png().toBuffer();
  const row=await sharp({create:{width:324*4+24,height:405+44,channels:3,background:"#ffffff"}}).composite([{input:label,left:6,top:6},...tiles.map((input,i)=>({input,left:i*332,top:44}))]).png().toBuffer();
  await sharp(row).jpeg({quality:88}).toFile(`output/style-gallery/${style}.jpg`);
  rows.push(row);
  console.log(`rendered ${style}`);
}
await sharp({create:{width:324*4+24,height:rows.length*(405+44+10),channels:3,background:"#ffffff"}}).composite(rows.map((input,i)=>({input,left:0,top:i*(405+44+10)}))).jpeg({quality:85}).toFile("output/style-gallery/all.jpg");
console.log("output/style-gallery/all.jpg");
