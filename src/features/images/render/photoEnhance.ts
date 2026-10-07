import sharp from "sharp";

// 사진을 카드에 넣기 전에 "맛있어 보이게" 다듬는다.
//
// ── 왜 다시 썼나 ─────────────────────────────────────────────────────────────────────────
// 예전 보정(enhancePhotoLegacy)은 채널 평균을 회색 쪽으로 절반 되돌리는 gray-world 방식이라, 원래 따뜻해야 할 음식 사진의
// 온기를 깎았다(샘플 hands-makgeolli 평균 RGB 140/106/90 → 158/134/120, 파랑이 33% 올라 노을빛이 회색으로).
// 또 sharp에는 톤 커브·"따뜻한 색만 채도 올리기" 연산이 없어서, 그런 보정은 아예 없었다.
//
// ── 새 보정(실제 사진 kind:"real") ──────────────────────────────────────────────────────
// 사진을 1600px 이하 raw 픽셀로 한 번만 풀고(인코드·디코드 1회), 아래를 JS 루프로 처리한 뒤 JPEG으로 묶는다.
// 1. 색 균형(온기 보존): 회색 평균 쪽으로 절반 되돌리되 ±8% 안에서만.
//    - 빨강(R)은 절대 줄이지 않는다(홍어 분홍 살·노을빛 보호).
//    - 파랑(B)은 사진이 푸를 때만 줄이고(이때는 절반이 아니라 3/4만큼, −12%까지: 푸른 기운이 음식을 가장 맛없어 보이게 한다),
//      노랄 때 올리지 않는다(올리면 따뜻한 사진이 회색이 된다).
//    - 사진이 따뜻하면(R 평균 > 회색) 초록(G)도 올리지 않는다(올리면 붉은 픽셀 채도가 깎인다).
// 2. 대비: 밝기 하위·상위 1%로 범위를 넓히되 어두운 쪽은 최대 16단계만 내리고(가게 조명 사진이 새까매지지 않게),
//    밝은 쪽은 230 이상에서만 끌어올린다. 단 상위 1%가 200도 안 되는(하이라이트가 아예 없는) 어두운 사진은
//    흰 점을 max(상위 1% + 20, 170)까지 내려 범위를 넓힌다. 그러지 않으면 감마만으로는 밝기를 .33 위로 못 올린다.
// 3. 밝기: 평균이 .48 미만이면 감마로 .52 근처까지 올린다(최대 감마 1.45). 곱셈(brightness)과 달리 밝은 곳은 덜 올라가
//    흰 접시가 날아가지 않는다. 목표 감마는 히스토그램에서 이분 탐색으로 정확히 찾는다.
// 4. 톤 커브: 약한 S자(중간 대비 +), 230 이상은 기울기 .7로 눌러(하이라이트 롤오프) 흰 접시·막걸리 결을 남긴다.
//    결과 최대값이 약 247이라 상위 1% 밝기가 250을 넘지 않는다.
// 5. 따뜻한 색 vibrance: 색상각 345°~60°(분홍·빨강·주황·노랑)만, 채도가 낮은 픽셀일수록 더 올린다
//    k = 1 + .03 + .18 × 따뜻함 × (1 − 채도). 채도 .06 미만(흰 접시·막걸리·회색 그릇)은 손대지 않는다.
//    2·3단계에서 많이 밝힌 사진(늘림 1.3배 초과 또는 감마 1.2 초과)은 어둠 속 센서 노이즈 색이 함께 커지므로 .10으로 줄인다.
//    메뉴를 알면(options.food) 메뉴별 세기·색 범위를 쓰고(FOOD_LOOKS), 품질이 "어두움"이면 상한을 .08로 더 낮춘다.
// 선명화는 여기서 하지 않는다. 카드 크기로 줄인 뒤 한 번 거는 것이 맞아서 primitives.ts finishPhoto가 맡는다.
//
// ── AI가 만든 사진(kind:"ai") ───────────────────────────────────────────────────────────
// 색·밝기는 이미 정돈돼 있으므로 색 균형·대비·밝기는 건너뛰고 따뜻한 색 vibrance만 약하게(.10) 준다.
const MAX_SIDE=1600,CAST_LIMIT=.08,CAST_STRENGTH=.5,DARK=.48,TARGET=.52,MAX_GAMMA=1.45;
const VIBRANCE_REAL=.18,VIBRANCE_AI=.10,VIBRANCE_LIFTED=.10,VIBRANCE_GLOBAL_REAL=.03,NEUTRAL_SAT=.06;
const BLUE_CAST_LIMIT=.12,BLUE_CAST_STRENGTH=.75,S_CURVE=.12,ROLL_START=230/255,ROLL_SLOPE=.7;
const LEGACY_CAST_LIMIT=.08,LEGACY_CAST_STRENGTH=.5;

export type PhotoKind="real"|"ai"|"none";
export type PhotoStats={mean:[number,number,number];luminance:number};

export async function photoStats(input:Buffer):Promise<PhotoStats> {
  const {channels}=await sharp(input).rotate().resize(256,256,{fit:"inside"}).removeAlpha().stats();
  const mean=[channels[0].mean,channels[1].mean,channels[2].mean] as [number,number,number];
  // 사람 눈 기준 밝기(Rec.709 가중치), 0~1.
  const luminance=(mean[0]*.2126+mean[1]*.7152+mean[2]*.0722)/255;
  return {mean,luminance};
}

// ── 사진 품질(계획서 A11) ─────────────────────────────────────────────────────────────────
// 사장님 사진을 보관함에 넣을 때 한 번 재서 "어두움·흔들림·색 틀어짐·작은 사진" 배지를 붙이고,
// 표지 추천과 렌더(흐린 사진은 선명화를 약하게)에 쓴다. 긴 변 384px 축소본에서 재므로 사진 한 장 100ms 안팎이다.
// - luminance: 평균 밝기(0~1). .35 미만이면 어두움.
// - saturation: 평균 채도(0~1). 홍어·막걸리는 원래 채도가 낮아 배지에는 쓰지 않고 참고값으로만 둔다.
// - cast: 빨강·파랑 평균 차이를 평균 밝기로 나눈 값(음수면 푸르스름). −.18 미만 또는 .75 초과면 색 틀어짐.
// - green: 초록이 빨강·파랑 평균보다 많은 정도(형광등). .08 초과면 색 틀어짐.
// - sharpness: 가장 날카로운 경계(라플라시안 상위 1%)를 밝기 표준편차로 나눈 값. 샘플·픽스처의 정상 사진 .85~2.3,
//   blur 3을 건 사진 .15~.38, 9px 흔들림 .43~.88. .6 미만이면 흔들림.
// - longSide: 원본 긴 변(px). 900 미만이면 카카오톡 전송본처럼 작은 사진.
import { PHOTO_QUALITY_LABELS, type PhotoQualityFlag } from "../freeCards";
export { PHOTO_QUALITY_LABELS, type PhotoQualityFlag };
export type PhotoQuality={luminance:number;saturation:number;cast:number;green:number;sharpness:number;longSide:number;flags:PhotoQualityFlag[]};
export const PHOTO_QUALITY_LIMITS={dark:.35,blurry:.6,cast:.18,warmCast:.75,green:.08,lowres:900} as const;
const QUALITY_SIDE=384;
export async function photoQuality(input:Buffer):Promise<PhotoQuality> {
  const meta=await sharp(input).rotate().metadata();
  const longSide=Math.max(meta.autoOrient?.width??meta.width??0,meta.autoOrient?.height??meta.height??0);
  const {data,info}=await sharp(input).rotate().resize(QUALITY_SIDE,QUALITY_SIDE,{fit:"inside"}).removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
  return qualityOfPixels(data,info.width,info.height,longSide);
}

// 384px 이하 RGB raw 픽셀에서 품질을 잰다. enhancePhoto는 이미 풀어 둔 픽셀을 줄여 여기로 넘겨, 원본을 다시 디코드하지 않는다.
function qualityOfPixels(data:Buffer,W:number,H:number,longSide:number):PhotoQuality {
  const n=W*H;
  let r=0,g=0,b=0,sat=0;
  const gray=new Float32Array(n);
  for(let i=0,p=0;p<n;p++,i+=3){
    const R=data[i],G=data[i+1],B=data[i+2];
    r+=R;g+=G;b+=B;
    const max=Math.max(R,G,B),min=Math.min(R,G,B);
    sat+=max?(max-min)/max:0;
    gray[p]=R*.2126+G*.7152+B*.0722;
  }
  r/=n;g/=n;b/=n;
  const luminance=(r*.2126+g*.7152+b*.0722)/255;
  const average=Math.max(1,(r+g+b)/3);
  const cast=(r-b)/average;
  // 초록 기운(형광등): 초록이 빨강·파랑 평균보다 얼마나 많은가.
  const green=(g-(r+b)/2)/average;
  // 선명도: 라플라시안(가운데×4 − 상하좌우) 절댓값의 상위 1% 값. 분산을 쓰면 흰 접시처럼 무늬가 적은 사진이
  // 흐린 사진으로 잘못 잡힌다. 상위 1%는 "가장 또렷한 경계가 얼마나 날카로운가"라서, 접시 테두리 하나만 또렷해도 높게 나온다.
  const histogram=new Uint32Array(1024);
  let count=0;
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x,v=Math.abs(4*gray[p]-gray[p-1]-gray[p+1]-gray[p-W]-gray[p+W]);
    histogram[Math.min(1023,Math.round(v))]++;count++;
  }
  let edge=0;
  for(let v=1023,seen=0;v>=0;v--){seen+=histogram[v];if(seen>=count*.01){edge=v;break;}}
  // 어둡거나 뿌연(대비가 낮은) 사진은 경계 값도 함께 작아진다. 밝기 표준편차로 나눠 "대비에 비해 경계가 얼마나 날카로운가"를 잰다.
  let graySum=0,graySq=0;
  for(let p=0;p<n;p++){graySum+=gray[p];graySq+=gray[p]*gray[p];}
  const grayStdev=Math.sqrt(Math.max(1,graySq/n-(graySum/n)**2));
  const sharpness=Math.round(edge/grayStdev*100)/100;
  const flags:PhotoQualityFlag[]=[];
  if(luminance<PHOTO_QUALITY_LIMITS.dark)flags.push("dark");
  if(sharpness<PHOTO_QUALITY_LIMITS.blurry)flags.push("blurry");
  // 홍어·수육·묵은지·백열등 아래 사진은 원래 붉다(샘플 삼합 사진 .52). 따뜻한 쪽은 아주 크게 틀어졌을 때(>.75)만,
  // 형광등·그늘에서 생기는 푸른 쪽(<−.18)은 민감하게 본다. 푸르스름한 홍어는 식욕을 떨어뜨린다.
  if(cast<-PHOTO_QUALITY_LIMITS.cast||cast>PHOTO_QUALITY_LIMITS.warmCast||green>PHOTO_QUALITY_LIMITS.green)flags.push("cast");
  if(longSide>0&&longSide<PHOTO_QUALITY_LIMITS.lowres)flags.push("lowres");
  const round=(value:number,digits=3)=>Math.round(value*10**digits)/10**digits;
  return {luminance:round(luminance),saturation:round(sat/n),cast:round(cast),green:round(green),sharpness,longSide,flags};
}

// ── 메뉴별 보정(계획서 A10) ───────────────────────────────────────────────────────────────
// 같은 "맛있게"라도 메뉴마다 살려야 할 색이 다르다. 슬라이드 제목·키워드로 메뉴를 고르고(foodLookOf), 5단계 vibrance를 바꾼다.
// - hongeo(홍어): 분홍·붉은 살(색상각 320°~30°)을 기본보다 세게(k .22). 다른 따뜻한 색은 기본과 같게 둔다.
// - samhap(삼합·수육·묵은지): 붉은 수육·묵은지는 이미 R이 높아 vibrance가 채널을 255로 날려 결이 뭉개진다.
//   어느 채널이든 245를 넘기지 않게 픽셀마다 k를 줄인다(이미 245를 넘은 픽셀은 손대지 않는다).
// - makgeolli(막걸리): 흰 사발·뽀얀 막걸리가 누렇게 물들지 않게 vibrance를 약하게(k .10), 채도 .10 미만은 아예 건너뛰고
//   .10~.18은 서서히 적용한다(기본은 .06 미만만 보호).
// - jeon(전·부침): 색상각 0°~60°(노릇한 색)에서 밝은 곳은 조금 밝히고 중간 그늘은 조금 눌러 기름 윤기(하이라이트 대비)를 낸다.
// 메뉴를 못 찾으면 null(기본 보정 = 지금 동작).
export type FoodLook="hongeo"|"samhap"|"makgeolli"|"jeon";
type Look={amount:number;global:number;neutral:number;ramp:number;weight:(hue:number)=>number;clip:number;sheen:boolean};
const FOOD_WORDS:Record<FoodLook,string[]>={
  samhap:["삼합","수육","묵은지","보쌈"],
  hongeo:["홍어","홍어회","홍어무침","홍어애","애탕"],
  jeon:["파전","김치전","해물전","모둠전","녹두전","육전","동태전","호박전","부침개","부침","빈대떡","지짐이","전"],
  makgeolli:["막걸리","동동주","탁주"],
};
// 같은 글에 여러 메뉴가 나오면 먼저 나온 메뉴를 고른다. 단 삼합은 홍어를 품고 있어 삼합이 보이면 삼합.
// "전"은 한 글자라 "전통·이전" 같은 낱말에 섞이지 않게, 낱말 하나가 정확히 "전"이거나 "~전"으로 끝나는 메뉴 이름일 때만 본다.
export function foodLookOf(text:string):FoodLook|null {
  const normalized=text.normalize("NFKC");
  const tokens=normalized.split(/[^가-힣a-zA-Z0-9]+/).filter(Boolean);
  const indexOf=(word:string)=>word.length===1?tokens.some(token=>token===word||token===`${word}을`||token===`${word}이`||token===`${word}은`||token===`${word}에`)?normalized.indexOf(word):-1:normalized.indexOf(word);
  let best:{look:FoodLook;at:number}|null=null;
  for(const look of Object.keys(FOOD_WORDS) as FoodLook[]){
    const hits=FOOD_WORDS[look].map(indexOf).filter(at=>at>=0);
    if(!hits.length)continue;
    if(look==="samhap")return "samhap";
    const at=Math.min(...hits);
    if(!best||at<best.at)best={look,at};
  }
  return best?.look??null;
}
// 분홍·붉은 살 가중치: 320°~30°는 1, 양쪽 25°에 걸쳐 0으로.
function pinkWeight(h:number):number {
  if(h>=320||h<=30)return 1;
  if(h>30&&h<55)return 1-(h-30)/25;
  if(h>295&&h<320)return (h-295)/25;
  return 0;
}
const DEFAULT_LOOK:Look={amount:VIBRANCE_REAL,global:VIBRANCE_GLOBAL_REAL,neutral:NEUTRAL_SAT,ramp:0,weight:h=>warmWeight(h),clip:255,sheen:false};
const HONGEO_VIBRANCE=.22;
export const FOOD_LOOKS:Record<FoodLook,Look>={
  // 분홍 살은 .22, 그 밖의 따뜻한 색은 기본(.18)과 같은 세기가 되도록 가중치를 맞춘다.
  hongeo:{...DEFAULT_LOOK,amount:HONGEO_VIBRANCE,weight:h=>Math.max(pinkWeight(h),warmWeight(h)*VIBRANCE_REAL/HONGEO_VIBRANCE)},
  samhap:{...DEFAULT_LOOK,clip:245},
  makgeolli:{...DEFAULT_LOOK,amount:.10,global:.015,neutral:.10,ramp:.08},
  jeon:{...DEFAULT_LOOK,sheen:true},
};
// 어두운 사진(품질 dark)은 밝히면서 센서 노이즈 색도 커지므로 vibrance 상한을 더 낮춘다.
const VIBRANCE_DARK_CAP=.08,GLOBAL_DARK_CAP=.01;

// 보정한 사진 버퍼 → 보정 전에 잰 품질. finishPhoto가 흐리거나 작은 사진의 선명화를 약하게 할 때 쓴다.
// 렌더 때 다시 재면 사진마다 100ms가 들어서, 보정 단계에서 이미 풀어 둔 픽셀로 한 번만 재 둔다.
const enhancedQuality=new WeakMap<Buffer,PhotoQuality>();
export const qualityOfEnhanced=(buffer:Buffer):PhotoQuality|undefined=>enhancedQuality.get(buffer);

// maxSide: 보정하며 줄이는 긴 변. 파노라마(표지+2장이 한 사진을 2160px 폭으로 나눠 씀)는 2160으로 받아야 다시 키우지 않는다.
export async function enhancePhoto(input:Buffer,options:{kind?:Exclude<PhotoKind,"none">;food?:FoodLook|null;maxSide?:number}={}):Promise<Buffer> {
  const kind=options.kind??"real";
  const side=options.maxSide??MAX_SIDE;
  // toColourspace("srgb"): 흑백 사진도 RGB 3채널로 받아 아래 루프가 항상 3칸 단위로 돈다.
  const [{data,info},meta]=await Promise.all([
    sharp(input).rotate().resize(side,side,{fit:"inside",withoutEnlargement:true}).removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true}),
    kind==="real"?sharp(input).metadata().catch(()=>null):Promise.resolve(null),
  ]);
  if(info.channels!==3)return sharp(input).rotate().jpeg({quality:92}).toBuffer();
  // 사장님 사진만 품질을 잰다(AI 사진은 크기·밝기가 이미 정돈돼 있다). 실패해도 보정은 계속한다.
  let quality:PhotoQuality|null=null;
  if(kind==="real"){
    try{
      const small=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).resize(QUALITY_SIDE,QUALITY_SIDE,{fit:"inside"}).raw().toBuffer({resolveWithObject:true});
      const longSide=Math.max(meta?.width??0,meta?.height??0)||Math.max(info.width,info.height);
      quality=qualityOfPixels(small.data,small.info.width,small.info.height,longSide);
    }catch{quality=null;}
  }
  const lifted=kind==="real"?applyTone(data):false;
  const base=options.food?FOOD_LOOKS[options.food]:DEFAULT_LOOK;
  // AI 사진·많이 밝힌 사진은 기본 .18 대비 .10의 비율로 메뉴 세기도 함께 줄인다.
  const scale=kind==="ai"?VIBRANCE_AI/VIBRANCE_REAL:lifted?VIBRANCE_LIFTED/VIBRANCE_REAL:1;
  let amount=base.amount*scale,global=kind==="real"?base.global:0;
  if(quality?.flags.includes("dark")){amount=Math.min(amount,VIBRANCE_DARK_CAP);global=Math.min(global,GLOBAL_DARK_CAP);}
  applyWarmVibrance(data,{...base,amount,global});
  const output=await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).jpeg({quality:92}).toBuffer();
  if(quality)enhancedQuality.set(output,quality);
  return output;
}

// 1~4단계: 채널별 배율 → 대비 늘림 → 감마 밝히기 → S자·롤오프를 256칸 표(LUT) 3개로 미리 계산해 한 번에 적용한다.
// 돌려주는 값: 많이 밝혔는지(true면 vibrance를 줄인다).
function applyTone(data:Buffer):boolean {
  // 통계는 4픽셀마다 하나만 본다(1600px 사진이면 약 48만 점, 평균·분위수에 충분하다).
  const STEP=12;
  let sumR=0,sumG=0,sumB=0,count=0;
  for(let i=0;i<data.length;i+=STEP){sumR+=data[i];sumG+=data[i+1];sumB+=data[i+2];count++;}
  const mean=[sumR/count,sumG/count,sumB/count];
  const gray=(mean[0]+mean[1]+mean[2])/3||1;
  const half=(value:number,limit=CAST_LIMIT,strength=CAST_STRENGTH)=>Math.min(1+limit,Math.max(1-limit,1+(gray/(value||1)-1)*strength));
  const warm=mean[0]>gray;
  const gains=[
    Math.max(1,half(mean[0])),                       // R: 줄이지 않는다.
    warm?Math.min(1,half(mean[1])):half(mean[1]),     // G: 따뜻한 사진이면 올리지 않는다.
    mean[2]>gray?Math.min(1,half(mean[2],BLUE_CAST_LIMIT,BLUE_CAST_STRENGTH)):1, // B: 푸를 때만 내린다.
  ];
  // 배율을 적용한 뒤의 밝기 히스토그램으로 분위수와 평균을 잰다.
  const hist=new Float64Array(256);
  for(let i=0;i<data.length;i+=STEP){
    const y=Math.min(255,data[i]*gains[0])*.2126+Math.min(255,data[i+1]*gains[1])*.7152+Math.min(255,data[i+2]*gains[2])*.0722;
    hist[Math.min(255,Math.round(y))]++;
  }
  const at=(q:number)=>{let acc=0;const target=q*count;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=target)return v;}return 255;};
  const hi=at(.99);
  const black=Math.min(at(.01),16),white=hi<200?Math.max(hi+20,170):Math.max(hi,230);
  const scale=255/Math.max(1,white-black);
  const stretched=(v:number)=>Math.min(1,Math.max(0,(v-black)*scale/255));
  // 늘린 뒤의 평균 밝기가 어두우면, 히스토그램 위에서 평균이 TARGET이 되는 지수 p(=1/감마)를 찾는다.
  const meanAfter=(p:number)=>{let acc=0;for(let v=0;v<256;v++)if(hist[v])acc+=hist[v]*Math.pow(stretched(v),p);return acc/count;};
  let p=1;
  if(meanAfter(1)<DARK){
    let lo=1/MAX_GAMMA,hi=1;
    for(let step=0;step<20;step++){const mid=(lo+hi)/2;if(meanAfter(mid)<TARGET)hi=mid;else lo=mid;}
    p=Math.max(1/MAX_GAMMA,lo);
  }
  // 채널별 LUT: v → 배율 → 늘림 → 감마 → S자 → 롤오프.
  const luts=gains.map(gain=>{
    const lut=new Uint8Array(256);
    for(let v=0;v<256;v++){
      let x=Math.pow(stretched(Math.min(255,v*gain)),p);
      const smooth=x*x*(3-2*x);
      x+=S_CURVE*(smooth-x);
      if(x>ROLL_START)x=ROLL_START+(x-ROLL_START)*ROLL_SLOPE;
      lut[v]=Math.round(Math.min(1,Math.max(0,x))*255);
    }
    return lut;
  });
  for(let i=0;i<data.length;i+=3){data[i]=luts[0][data[i]];data[i+1]=luts[1][data[i+1]];data[i+2]=luts[2][data[i+2]];}
  return scale>1.3||p<1/1.2;
}

// 5단계: 따뜻한 색만, 채도가 낮을수록 더 올린다. 밝기(Rec.709 휘도)를 축으로 색을 바깥으로 민다.
// look.clip: 어느 채널도 이 값을 넘지 않게 k를 줄인다(삼합). look.sheen: 노릇한 색의 하이라이트 대비(전).
function applyWarmVibrance(data:Buffer,look:Look):void {
  const {amount,global,neutral,ramp,weight,clip,sheen}=look;
  for(let i=0;i<data.length;i+=3){
    const r=data[i],g=data[i+1],b=data[i+2];
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(max===0)continue;
    const sat=(max-min)/max;
    if(sat<neutral)continue;
    const hue=hueOf(r,g,b,max,min);
    // ramp: 중립 경계 바로 위 픽셀은 서서히 적용한다(흰 사발이 경계에서 갑자기 물들지 않게).
    const fade=ramp>0?Math.min(1,(sat-neutral)/ramp):1;
    let k=1+(global+amount*weight(hue)*(1-sat))*fade;
    const y=r*.2126+g*.7152+b*.0722;
    if(clip<255&&k>1){
      // 가장 큰 채널이 clip을 넘지 않는 k까지만. 이미 넘은 픽셀은 그대로 둔다.
      if(max>=clip)k=1;
      else if(max-y>0)k=Math.min(k,(clip-y)/(max-y));
    }
    let gain=1;
    if(sheen){
      const w=hue<=60?1:hue<75?1-(hue-60)/15:hue>=345?(hue-345)/15:0;
      if(w>0){
        // 밝은 곳(140~230)은 최대 +6%, 중간 그늘(<140)은 최대 −4%. 결과가 250을 넘지 않게 묶는다.
        const t=Math.min(1,Math.max(0,(y-140)/90)),up=t*t*(3-2*t);
        const down=y<140?Math.min(1,y/70)*Math.min(1,(140-y)/70):0;
        gain=1+w*(.06*up-.04*down);
      }
    }
    if(k===1&&gain===1)continue;
    let R=y+(r-y)*k,G=y+(g-y)*k,B=y+(b-y)*k;
    if(gain!==1){
      const top=Math.max(R,G,B);
      if(gain>1&&top*gain>250)gain=Math.max(1,250/Math.max(1,top));
      R*=gain;G*=gain;B*=gain;
    }
    data[i]=clamp8(R);data[i+1]=clamp8(G);data[i+2]=clamp8(B);
  }
}

// 색상각(0~360°). max·min을 이미 구했으므로 다시 계산하지 않는다.
function hueOf(r:number,g:number,b:number,max:number,min:number):number {
  const d=max-min;
  if(d===0)return 0;
  const h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return (h*60+360)%360;
}
// 따뜻함 가중치: 345°~60°는 1, 양쪽 25°에 걸쳐 0으로 줄어든다(320°·85° 밖은 0). 초록·파랑 배경은 그대로 둔다.
function warmWeight(h:number):number {
  if(h>=345||h<=60)return 1;
  if(h>60&&h<85)return 1-(h-60)/25;
  if(h>320&&h<345)return (h-320)/25;
  return 0;
}
const clamp8=(v:number)=>v<0?0:v>255?255:Math.round(v);

// 예전 보정. 1단계 전후 비교(갤러리 --photo=legacy)용으로만 남겨 둔다. 설정에 보정 끄기·예전 방식 선택이 생기면 정리한다.
export async function enhancePhotoLegacy(input:Buffer):Promise<Buffer> {
  const base=await sharp(input).rotate().resize(2048,2048,{fit:"inside",withoutEnlargement:true}).removeAlpha().toBuffer();
  const {mean}=await photoStats(base);
  const gray=(mean[0]+mean[1]+mean[2])/3||1;
  // 채널마다 회색 평균에 가까워지는 배율의 절반만 적용하고, 범위를 제한한다.
  const gains=mean.map(value=>{
    const full=gray/(value||1);
    return Math.min(1+LEGACY_CAST_LIMIT,Math.max(1-LEGACY_CAST_LIMIT,1+(full-1)*LEGACY_CAST_STRENGTH));
  });
  // 색 균형과 대비를 먼저 맞춘 뒤 밝기를 다시 재서, 그래도 어두우면 끌어올린다.
  const tinted=await sharp(base).linear(gains,[0,0,0]).toBuffer();
  // 대비: 밝기 기준 하위 1%·상위 1% 값을 재서 그 사이를 넓힌다. 단 어두운 쪽은 최대 16단계까지만 내리고(어두운 가게 사진이
  // 새까맣게 뭉개지지 않게), 밝은 쪽은 230 이상으로만 끌어올린다(흰 접시가 날아가지 않게).
  const [lo,hi]=await luminancePercentiles(tinted,.01,.99);
  const black=Math.min(lo,16),white=Math.max(hi,230);
  const scale=255/Math.max(1,white-black);
  const balanced=await sharp(tinted).linear(scale,-black*scale).toBuffer();
  const after=(await photoStats(balanced)).luminance;
  const lift=after<.48?Math.min(1.4,.54/Math.max(after,.05)):1;
  return sharp(balanced)
    .modulate({brightness:lift,saturation:1.06})
    .sharpen({sigma:.8})
    .jpeg({quality:92})
    .toBuffer();
}

// 작게 줄인 사진에서 밝기(0~255) 분위수를 구한다.
async function luminancePercentiles(input:Buffer,low:number,high:number):Promise<[number,number]> {
  const {data}=await sharp(input).resize(160,160,{fit:"inside"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const values:number[]=[];
  for(let i=0;i<data.length;i+=3)values.push(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722);
  values.sort((a,b)=>a-b);
  const at=(q:number)=>values[Math.min(values.length-1,Math.max(0,Math.round(q*(values.length-1))))];
  return [at(low),at(high)];
}
