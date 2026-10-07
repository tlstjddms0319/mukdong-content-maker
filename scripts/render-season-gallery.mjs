// 계절 소품(render/seasonLayer.ts)이 계열마다 어떻게 얹히는지 한눈에 보는 시트.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-season-gallery.mjs [motif] [--theme=테마]
// 결과: output/season/<motif>.jpg — 계열 × (표지·본문·글자 장) 격자.
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import { composeSlideCard } from "../src/features/images/composeSlide.ts";
import { StyleIdSchema } from "../src/features/images/styleCatalog.ts";
import { SeasonMotifSchema } from "../src/features/images/seasonMotif.ts";

const motif=process.argv.slice(2).find(arg=>!arg.startsWith("--"))??"rain";
if(!SeasonMotifSchema.options.includes(motif))throw new Error(`unknown motif: ${motif}`);
const theme=process.argv.find(arg=>arg.startsWith("--theme="))?.slice(8)??"classic";
const sample=name=>readFile(`assets/design/samples/${name}.jpg`);
const photos=[await sample("hands-samhap"),await sample("studio-hongeo"),await sample("table-topdown")];
const base={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",keywords:["과메기","막걸리"],subline:""};
const slides=[
  {...base,role:"cover",layout:"frame",headline:"겨울엔 과메기 한 점",subline:"찬바람에 꾸덕하게 마른 맛",points:[],index:1},
  {...base,role:"detail",layout:"frame",headline:"김에 싸서 한입에",points:["김 위에 과메기를 올려요","쪽파와 마늘을 곁들여요"],index:2},
  {...base,role:"how-to",layout:"checklist",headline:"처음 먹는다면",points:["작게 한 점부터","초장은 살짝만","막걸리 한 모금"],index:3},
];
const styles=StyleIdSchema.options;
const W=270,H=338,tiles=[];
for(const [row,style] of styles.entries())for(const [col,slide] of slides.entries()){
  const {image}=await composeSlideCard(photos,slide,slide.index,5,"card",{palette:"warm",style,theme,season:motif},{});
  tiles.push({input:await sharp(image).resize(W,H).toBuffer(),left:col*W,top:row*H});
}
await mkdir("output/season",{recursive:true});
const file=`output/season/${motif}${theme!=="classic"?`-${theme}`:""}.jpg`;
await sharp({create:{width:W*slides.length,height:H*styles.length,channels:3,background:"#ffffff"}}).composite(tiles).jpeg({quality:82}).toFile(file);
console.log(file);
