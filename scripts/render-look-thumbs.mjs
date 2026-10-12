// 확인 화면 '모양 바꾸기' 목록에 보여 줄 모양별 견본(표지)을 그린다. AI 호출 없음.
// 결과: public/looks/<photo|text>-<번호>.jpg (360×450). 모양을 더하거나 고치면 다시 실행한다
// (tests/unit/lookThumbs.test.ts가 TRACK_LOOKS마다 견본 파일이 있는지 확인한다).
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-look-thumbs.mjs
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { composeSlideCard } from "../src/features/images/composeSlide.ts";
import { TRACK_LOOKS } from "../src/features/images/track.ts";

const OUT="public/looks";
await mkdir(OUT,{recursive:true});
const photo=await readFile(path.join("assets/design/samples","hands-makgeolli.jpg"));
const cover={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:0,keywords:["홍어","막걸리"],role:"cover",layout:"fullscreen",headline:"비 오는 날엔 홍어 한 점 어때요?",subline:"처음이라도 부담 없는 순서",points:[]};
for(const [track,style] of [["photo","photo-focus"],["text","text-focus"]]){
  for(const [look,{name}] of TRACK_LOOKS[track].entries()){
    const {image}=await composeSlideCard([photo],cover,1,5,"card",{palette:"warm",style,look},{photoKind:"real",brandHandle:"mukdong_hongeo"});
    await sharp(image).resize(360,450).jpeg({quality:80,mozjpeg:true}).toFile(path.join(OUT,`${track}-${look}.jpg`));
    console.log(`${track}-${look} ${name}`);
  }
}
