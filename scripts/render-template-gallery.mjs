// 모든 카드 레이아웃 × 모양 변형을 한 테마로 그려 한 장의 미리보기 시트로 모은다. AI 호출 없이 샘플 사진만 쓴다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-template-gallery.mjs [theme] [palette] [titleFont] [bodyFont]
// 결과: output/template-gallery/<theme>-<palette>.jpg
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { composeSlideImage } from "../src/features/images/composeSlide.ts";
import { CARD_LAYOUTS, CardLayoutSchema, LAYOUT_VARIANTS, PALETTES } from "../src/features/images/design.ts";
import { THEMES } from "../src/features/images/themes.ts";

const [theme="classic",palette="warm",titleFont="pretendard",bodyFont="pretendard"]=process.argv.slice(2);
if(!THEMES[theme])throw new Error(`unknown theme: ${theme}. one of ${Object.keys(THEMES).join(", ")}`);
if(!PALETTES[palette])throw new Error(`unknown palette: ${palette}`);

const sample=async name=>readFile(path.join("assets/design/samples",`${name}.jpg`));
const photos=[await sample("hands-makgeolli"),await sample("table-topdown"),await sample("hands-samhap"),await sample("studio-hongeo"),await sample("studio-ray"),await sample("illustration-plate")];
// 레이아웃마다 어울리는 사진 순서(비교형은 홍어·가오리, 일러스트는 접시 그림).
const photosFor=layout=>layout==="versus"?[photos[3],photos[4]]:layout==="illustration"?[photos[5]]:layout==="polaroid"?[photos[2],photos[0]]:layout==="collage"?[photos[1],photos[3],photos[2]]:[photos[0],photos[2]];

const base={role:"pairing",visualPrompt:"",textPosition:"bottom",figure:"7일",titleFont:"auto",bodyFont:"auto"};
const copy={
  headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",
  points:["홍어 살은 얇게 썰려 결이 비쳐 보여요","홍어를 묵은지에 싸 한입에 넣어요","막걸리 한 모금으로 마무리해요"],
  keywords:["홍어","가오리"],
};
const roleFor=layout=>layout==="qa"?"cta":"pairing";

const tiles=[];
for(const layout of CardLayoutSchema.options){
  for(let variant=0;variant<LAYOUT_VARIANTS[layout];variant++){
    const slide={...base,...copy,role:roleFor(layout),layout,variant};
    const image=await composeSlideImage(photosFor(layout),slide,3,7,"card",{palette,theme,titleFont,bodyFont});
    const label=await sharp({text:{text:`<span foreground="#222">${CARD_LAYOUTS[layout].label.replace(/&/g,"&amp;")}${LAYOUT_VARIANTS[layout]>1?` · 변형 ${variant+1}`:""}</span>`,font:"Pretendard Bold 20",fontfile:"assets/fonts/Pretendard-Bold.otf",rgba:true}}).png().toBuffer();
    tiles.push({image:await sharp(image).resize(270,338).png().toBuffer(),label});
  }
}
const COLS=6,W=270,H=338,LABEL=32,GAP=8;
const rows=Math.ceil(tiles.length/COLS);
const sheet=sharp({create:{width:COLS*(W+GAP),height:rows*(H+LABEL+GAP),channels:3,background:"#ffffff"}})
  .composite(tiles.flatMap((tile,i)=>{const x=(i%COLS)*(W+GAP),y=Math.floor(i/COLS)*(H+LABEL+GAP);return [{input:tile.label,left:x+4,top:y+4},{input:tile.image,left:x,top:y+LABEL}];}));
await mkdir("output/template-gallery",{recursive:true});
const file=`output/template-gallery/${theme}-${palette}.jpg`;
await sheet.jpeg({quality:85}).toFile(file);
console.log(`${tiles.length} templates → ${file}`);
