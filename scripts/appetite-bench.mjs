// 식욕 벤치마크(계획서 '검증과 측정'). 계열마다 갤러리 표지 1장(--subset, 기본)을 그려 Gemini 비전에 보내
// 식욕(appetite)·조명(lighting)·구도(composition)를 1~5점으로 받고, tests/fixtures/appetite-baseline.json과 비교해 Δ를 보여 준다.
// 실행: node --conditions=react-server --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/appetite-bench.mjs [--subset] [--style=계열] [--save]
//   --save : 이번 점수를 기준선으로 저장한다(기준선 파일이 없으면 첫 실행에 자동 저장).
// 비용: 그림마다 한 번 호출한다. 같은 그림(sha1)은 output/appetite-cache.json에 남겨 다시 부르지 않는다.
// 키(GEMINI_API_KEY)는 .env.local에서 읽고 어디에도 출력하지 않는다. 없으면 안내만 하고 끝낸다.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BASELINE_FILE="tests/fixtures/appetite-baseline.json";
export const CACHE_FILE="output/appetite-cache.json";
export const SCORE_KEYS=["appetite","lighting","composition"];

export const sha1=buffer=>createHash("sha1").update(buffer).digest("hex");

const readJson=async(file,fallback)=>{try{return JSON.parse(await readFile(file,"utf8"));}catch{return fallback;}};
const writeJson=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,`${JSON.stringify(value,null,2)}\n`);};

// cards: [{style,image}] → {scores:{계열:{sha1,appetite,lighting,composition}}, calls, failed:[계열]}
// cache: {sha1:{appetite,lighting,composition}} (이 함수가 새 점수를 채워 넣는다). 캐시에 있는 그림은 호출하지 않는다.
// 실패한 그림은 캐시하지 않는다(다음 실행에서 다시 시도).
export async function scoreCards(cards,{cache,apiKey,fetch:request,model}){
  const scores={},failed=[];
  const missing=cards.filter(card=>!cache[sha1(card.image)]);
  // 같은 그림이 두 계열에 나와도 한 번만 보낸다.
  const unique=[...new Map(missing.map(card=>[sha1(card.image),card.image])).entries()];
  let calls=0;
  if(unique.length){
    const counting=request?async(...args)=>{calls++;return request(...args);}:async(...args)=>{calls++;return fetch(...args);};
    // 점수 함수는 서버 전용 모듈이라 필요할 때만 불러온다(키가 없으면 불러오지도 않는다).
    const {scoreImages}=await import("../src/features/images/coverCheck.ts");
    const results=await scoreImages(unique.map(([,image])=>image),{apiKey,fetch:counting,model});
    for(const [i,[hash]] of unique.entries()){
      const result=results?.[i];
      if(result)cache[hash]=Object.fromEntries(SCORE_KEYS.map(key=>[key,result[key]]));
    }
  }
  for(const card of cards){
    const hash=sha1(card.image),hit=cache[hash];
    if(hit)scores[card.style]={sha1:hash,...hit};else failed.push(card.style);
  }
  return {scores,calls,failed};
}

// 기준선과 비교한 줄들. 기준선에 없는 계열은 "새로", 그림이 같으면(sha1) 변화 없음으로 표시한다.
export function compareToBaseline(scores,baseline){
  const lines=[];
  const totals=Object.fromEntries(SCORE_KEYS.map(key=>[key,0]));let compared=0;
  for(const [style,now] of Object.entries(scores)){
    const before=baseline?.scores?.[style];
    const cells=SCORE_KEYS.map(key=>`${key} ${now[key]}`);
    if(!before){lines.push(`  ${style}: ${cells.join(" · ")} (기준선 없음)`);continue;}
    compared++;
    const deltas=SCORE_KEYS.map(key=>{const d=now[key]-before[key];totals[key]+=d;return `${key} ${now[key]} (Δ${d>0?"+":""}${d})`;});
    lines.push(`  ${style}: ${deltas.join(" · ")}${before.sha1===now.sha1?" · 그림 같음":""}`);
  }
  if(compared)lines.push(`  평균 Δ: ${SCORE_KEYS.map(key=>`${key} ${(totals[key]/compared>0?"+":"")}${(totals[key]/compared).toFixed(2)}`).join(" · ")}`);
  return lines;
}

// 갤러리(scripts/render-style-gallery.mjs)의 표지와 같은 장을 계열마다 한 장씩 그린다(사장님 사진과 같은 보정).
async function renderCovers(only){
  const sharp=(await import("sharp")).default;
  const {composeSlideImage}=await import("../src/features/images/composeSlide.ts");
  const {StyleIdSchema}=await import("../src/features/images/styleCatalog.ts");
  const photo=await readFile("assets/design/samples/hands-makgeolli.jpg");
  const slide={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:0,role:"cover",layout:"fullscreen",
    headline:"비 오는 날엔 홍어 한 점, 막걸리 한 잔",subline:"처음이라도 부담 없이 즐기는 법",points:[],keywords:["홍어","막걸리"]};
  const cards=[];
  for(const style of StyleIdSchema.options.filter(id=>id!=="template"&&(!only||id===only))){
    const image=await composeSlideImage([photo],slide,1,5,"card",{palette:"warm",style},{photoKind:"real"});
    // 보내는 크기를 고정(512px 안쪽 JPEG)해 같은 카드면 같은 sha1이 나오게 한다.
    cards.push({style,image:await sharp(image).resize(512,512,{fit:"inside"}).jpeg({quality:80}).toBuffer()});
  }
  return cards;
}

async function main(){
  try{process.loadEnvFile(".env.local");}catch{}
  const apiKey=process.env.GEMINI_API_KEY?.trim();
  if(!apiKey){
    console.log("GEMINI_API_KEY가 없어 식욕 점수를 잴 수 없어요.\n.env.local에 GEMINI_API_KEY=... 를 넣고 다시 실행해 주세요(계열마다 표지 1장, 처음 한 번만 호출하고 같은 그림은 다시 부르지 않아요).");
    return;
  }
  const only=process.argv.find(arg=>arg.startsWith("--style="))?.slice(8);
  const cards=await renderCovers(only);
  const cache=await readJson(CACHE_FILE,{});
  const {scores,calls,failed}=await scoreCards(cards,{cache,apiKey});
  await writeJson(CACHE_FILE,cache);
  console.log(`표지 ${cards.length}장, Gemini 호출 ${calls}번(나머지는 캐시)`);
  if(failed.length)console.log(`점수를 못 받은 계열: ${failed.join(", ")} (키·할당량을 확인해 주세요. 다음 실행에서 다시 시도해요)`);
  const baseline=await readJson(BASELINE_FILE,null);
  for(const line of compareToBaseline(scores,baseline))console.log(line);
  if(Object.keys(scores).length&&(!baseline||process.argv.includes("--save"))){
    // 일부 계열만 잰 경우에도 나머지 계열의 기준선은 지우지 않는다.
    await writeJson(BASELINE_FILE,{updatedAt:new Date().toISOString().slice(0,10),scores:{...baseline?.scores,...scores}});
    console.log(`기준선 저장: ${BASELINE_FILE}`);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
