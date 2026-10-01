// AI 호출 없이 열 가지 카드 템플릿을 실제 사진 샘플로 그려 본다. 결과는 output/card-samples/에 쌓인다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-card-samples.mjs [palette] [titleFont] [bodyFont]
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { composeSlideImage } from "../src/features/images/composeSlide.ts";
import { PALETTES } from "../src/features/images/design.ts";
import { BODY_FONTS, TITLE_FONTS } from "../src/features/images/typography.ts";

const palette=process.argv[2]??"warm";
const titleFont=process.argv[3]??"pretendard",bodyFont=process.argv[4]??"pretendard";
if(!PALETTES[palette])throw new Error(`unknown palette: ${palette}. one of ${Object.keys(PALETTES).join(", ")}`);
if(!TITLE_FONTS[titleFont])throw new Error(`unknown title font: ${titleFont}. one of ${Object.keys(TITLE_FONTS).join(", ")}`);
if(!BODY_FONTS[bodyFont])throw new Error(`unknown body font: ${bodyFont}. one of ${Object.keys(BODY_FONTS).join(", ")}`);
const fontSuffix=titleFont==="pretendard"&&bodyFont==="pretendard"?"":`-${titleFont}-${bodyFont}`;
const directory=`output/card-samples/${palette}${fontSuffix}`;
await mkdir(directory,{recursive:true});

const sample=async(name)=>readFile(path.join("assets/design/samples",`${name}.jpg`));
const photos={
  hands:await sample("hands-makgeolli"),
  samhap:await sample("hands-samhap"),
  table:await sample("table-topdown"),
  hongeo:await sample("studio-hongeo"),
  ray:await sample("studio-ray"),
  plate:await sample("illustration-plate"),
};

const base={visualPrompt:"",textPosition:"bottom",figure:""};
// 장마다 템플릿, 문안, 사진을 짝지었다. 실제 서비스에서는 구성안 AI가 이 조합을 고른다.
const slides=[
  ["fullscreen",{role:"cover",headline:"비 오는 날엔 홍어 한 점, 막걸리 한 잔",points:["묵동홍어마을 사장님이 알려 주는 첫 한 점"],keywords:["홍어","막걸리"]},[photos.hands]],
  ["frame",{role:"detail",headline:"처음이라면 살코기부터 시작하세요",points:["코 부위는 향이 가장 진해요","살코기는 담백하고 쫄깃해요"],keywords:["부위"]},[photos.samhap]],
  ["illustration",{role:"pairing",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 빛에 비치면 고유의 결이 보여요","특유의 알싸한 향이 입안에 퍼지며 침이 돌게 만들어요","다음 장에서는 이 맛이 왜 수육을 만나는지 살펴볼게요"],keywords:["홍어","감칠맛"]},[photos.plate]],
  ["collage",{role:"overview",headline:"홍어가 가운데 놓이는 한 상",points:["홍어회가 큰 접시 한가운데 둥글게 깔려요","홍어는 실온으로, 막걸리는 차갑게","묵은지·수육은 홍어 옆에 작게 놓여요"],keywords:["홍어회","한상","막걸리"]},[photos.table,photos.hongeo,photos.samhap]],
  ["browser",{role:"how-to",headline:"홍어 한 점, 이렇게 드세요",points:["홍어 한 점을 결 방향으로 집어요","홍어를 묵은지에 싸 한입 크기로 만들어요","한입에 넣고 코로 숨을 내쉬어요","막걸리 한 모금으로 마무리해요"],keywords:["먹는 법","홍어"]},[]],
  ["stat",{role:"process",headline:"항아리에서 삭히는 시간",points:["온도와 습도에 따라 하루 이틀 달라져요"],keywords:["숙성"],figure:"7일"},[]],
  ["versus",{role:"detail",headline:"홍어와 가오리, 이렇게 달라요",points:["붉은빛 도는 속살이에요","결이 굵고 또렷해요","하얗고 투명한 살이에요","결이 곱고 잘아요"],keywords:["홍어","가오리"]},[photos.hongeo,photos.ray]],
  ["step",{role:"how-to",headline:"홍어 한 점을 묵은지로 감싸요",points:["홍어 한 점을 묵은지 가운데에 올려요","홍어가 보이게 반만 감싸 한입에 넣어요"],keywords:["홍어"]},[photos.samhap]],
  ["qa",{role:"cta",headline:"냄새가 너무 강하면 어떡하죠?",points:["처음엔 덜 삭힌 '초보용'으로 주문해 보세요","막걸리와 함께 드시면 향이 훨씬 부드러워져요","사장님께 '처음이에요'라고 말씀하시면 돼요"],keywords:["초보"]},[]],
  ["quote",{role:"mood",headline:"코끝이 찡한 만큼, 마음은 뜨거워집니다",points:["비 오는 저녁, 묵동홍어마을에서"],keywords:["저녁","비"]},[photos.hands]],
];

const tiles=[];
for(const [i,[layout,slide,inputs]] of slides.entries()){
  const image=await composeSlideImage(inputs,{...base,...slide,layout},i+1,slides.length,"card",{palette,titleFont,bodyFont});
  const file=`${directory}/${String(i+1).padStart(2,"0")}-${layout}.jpg`;
  await sharp(image).toFile(file);
  tiles.push(await sharp(image).resize(360,450).png().toBuffer());
  console.log(`rendered ${file}`);
}
// 다섯 장씩 두 줄로 모은 한눈에 보기 시트.
const sheet=sharp({create:{width:360*5+6*4,height:450*2+6,channels:3,background:"#ffffff"}})
  .composite(tiles.map((input,i)=>({input,left:(i%5)*(360+6),top:Math.floor(i/5)*(450+6)})));
await sheet.jpeg({quality:88}).toFile(`${directory}/contact-sheet.jpg`);
console.log(`contact sheet: ${directory}/contact-sheet.jpg`);
