// 카드 그리기 시간 측정. 사진 보정·계열별 표지를 같은 입력으로 여러 번 그려 중앙값(ms)을 잰다.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/bench-cards.mjs [--runs=5] [--out=output/bench.json] [--compare=output/bench-baseline.json]
//
// 왜 필요한가: 사진 보정·선명화·그림자 같은 품질 개선은 장마다 수백 ms씩 쌓인다. 단계마다 "카드 한 장 2.5초 이하"를
// 지키는지 숫자로 확인하려고, 콜드(프로세스 첫 호출, 글꼴·캐시 준비 포함)와 웜(그 뒤 반복의 중앙값)을 따로 기록한다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { composeSlideImage } from "../src/features/images/composeSlide.ts";
import { enhancePhoto } from "../src/features/images/render/photoEnhance.ts";

const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split("=")[1]??fallback;
const RUNS=Number(arg("runs","5"));
const OUT=arg("out","output/bench.json");
const COMPARE=arg("compare","");

// 샘플은 384px로 작아서, 실제 사장님 사진(보관함 미리보기 1400px)에 가깝게 1400px로 키운 입력을 쓴다.
const sample=async name=>sharp(await readFile(path.join("assets/design/samples",`${name}.jpg`))).resize(1050,1400,{fit:"fill"}).jpeg({quality:88}).toBuffer();
const cover=await sample("hands-makgeolli"),studio=await sample("studio-hongeo");
const base={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:0};
const coverSlide={...base,role:"cover",layout:"fullscreen",headline:"비 오는 날엔 홍어 한 점, 막걸리 한 잔",points:[],keywords:["홍어","막걸리"]};
const detailSlide={...base,role:"detail",layout:"frame",headline:"홍어 한 점은 씹을수록 진한 감칠맛이 올라와요",points:["홍어 살은 얇게 썰려 결이 비쳐 보여요","톡 쏘는 향이 입안에 퍼져요"],keywords:["홍어"]};

const cases=[
  ["enhancePhoto",()=>enhancePhoto(cover)],
  ...["fullscreen","frame","quote"].map(layout=>[`template/${layout}`,()=>composeSlideImage([cover],{...detailSlide,layout},2,5,"card",{palette:"warm"})]),
  ...["hanji","neon","label","watercolor","gold","chalkboard","ticket","film","editorial"].map(style=>[`${style}/cover`,()=>composeSlideImage([cover],coverSlide,1,5,"card",{palette:"warm",style})]),
  ["template/frame+real",()=>composeSlideImage([studio],detailSlide,2,5,"card",{palette:"warm"},{photoKind:"real"})],
];

const median=values=>{const s=[...values].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const result={};
for(const [name,run] of cases){
  const t0=performance.now();await run();const cold=performance.now()-t0;
  const warm=[];
  for(let i=0;i<RUNS;i++){const t=performance.now();await run();warm.push(performance.now()-t);}
  result[name]={cold:Math.round(cold),warm:Math.round(median(warm))};
}
await mkdir(path.dirname(OUT),{recursive:true});
await writeFile(OUT,JSON.stringify(result,null,1));
const before=COMPARE?JSON.parse(await readFile(COMPARE,"utf8")):{};
for(const [name,{cold,warm}] of Object.entries(result)){
  const prev=before[name];
  const delta=prev?` (Δ ${warm-prev.warm>=0?"+":""}${warm-prev.warm}ms)`:"";
  console.log(`${name.padEnd(22)} warm ${String(warm).padStart(5)}ms  cold ${String(cold).padStart(5)}ms${delta}`);
}
console.log(OUT);
