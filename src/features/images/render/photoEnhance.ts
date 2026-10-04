import sharp from "sharp";

// 휴대폰으로 찍은 실제 사진을 카드에 넣기 전에 다듬는다. AI가 만든 사진은 이미 색이 정돈돼 있어 쓰지 않는다.
//
// 동작 순서
// 1. EXIF 방향대로 세우고, 너무 큰 사진은 2048px로 줄인다(이후 계산을 가볍게).
// 2. 색 균형: 채널 평균으로 노란·푸른 기운을 잰 뒤 절반만큼 되돌린다. 음식 사진은 원래 따뜻한 색이라
//    완전히 회색으로 맞추면(gray world) 맛없어 보이므로 보정 폭을 채널마다 ±8%로 제한한다.
// 3. 대비: 밝기 하위·상위 1%로 범위를 넓히되, 어두운 쪽은 최대 16단계만 내리고 밝은 쪽은 230 이상으로만 올린다.
// 4. 밝기: 2·3을 적용한 뒤 다시 재서 평균 밝기가 어두우면(0.48 미만) 0.54 근처까지, 최대 1.4배만 올린다.
// 5. 채도를 조금(+6%) 올리고 가볍게 선명하게 한다.
const MAX_SIDE=2048,CAST_LIMIT=.08,CAST_STRENGTH=.5,DARK=.48,TARGET=.54,MAX_LIFT=1.4;

export type PhotoStats={mean:[number,number,number];luminance:number};

export async function photoStats(input:Buffer):Promise<PhotoStats> {
  const {channels}=await sharp(input).rotate().resize(256,256,{fit:"inside"}).removeAlpha().stats();
  const mean=[channels[0].mean,channels[1].mean,channels[2].mean] as [number,number,number];
  // 사람 눈 기준 밝기(Rec.709 가중치), 0~1.
  const luminance=(mean[0]*.2126+mean[1]*.7152+mean[2]*.0722)/255;
  return {mean,luminance};
}

export async function enhancePhoto(input:Buffer):Promise<Buffer> {
  const base=await sharp(input).rotate().resize(MAX_SIDE,MAX_SIDE,{fit:"inside",withoutEnlargement:true}).removeAlpha().toBuffer();
  const {mean}=await photoStats(base);
  const gray=(mean[0]+mean[1]+mean[2])/3||1;
  // 채널마다 회색 평균에 가까워지는 배율의 절반만 적용하고, 범위를 제한한다.
  const gains=mean.map(value=>{
    const full=gray/(value||1);
    return Math.min(1+CAST_LIMIT,Math.max(1-CAST_LIMIT,1+(full-1)*CAST_STRENGTH));
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
  const lift=after<DARK?Math.min(MAX_LIFT,TARGET/Math.max(after,.05)):1;
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
