// 보정 회귀 테스트용 "나쁜 사장님 사진" 픽스처를 샘플에서 합성한다. AI 호출 없음, 같은 입력 → 같은 결과.
// 실행: node scripts/make-photo-fixtures.mjs  →  tests/fixtures/photos/*.jpg
//
// 왜: assets/design/samples 6장은 모두 노출이 정상이라, 어두운 가게 조명·흔들림·형광등 초록 기운·카톡으로 받은
// 저화질 사진에서 보정이 어떻게 되는지 확인할 방법이 없었다. 저장소 용량을 아끼려고 768×1024로 만든다.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT="tests/fixtures/photos";
const W=768,H=1024;
await mkdir(OUT,{recursive:true});
const base=name=>sharp(`assets/design/samples/${name}.jpg`).resize(W,H,{fit:"cover"});

// 결정적 노이즈: 같은 씨앗이면 항상 같은 알갱이(Math.random을 쓰지 않는다).
function noiseBuffer(width,height,sigma,seed=7){
  let s=seed>>>0;
  const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const data=Buffer.alloc(width*height*3);
  for(let i=0;i<data.length;i++){
    // 균등분포 세 개의 합으로 대략 정규분포를 만든다(평균 128).
    const g=(rand()+rand()+rand()-1.5)*2*sigma;
    data[i]=Math.max(0,Math.min(255,Math.round(128+g)));
  }
  return sharp(data,{raw:{width,height,channels:3}}).png().toBuffer();
}

const write=(pipeline,name)=>pipeline.jpeg({quality:82}).toFile(`${OUT}/${name}.jpg`).then(()=>console.log(`${OUT}/${name}.jpg`));

// 1. 정상(따뜻한 노을빛) — 보정이 온기를 깎지 않는지 보는 기준.
await write(base("hands-makgeolli"),"warm");
// 2. 어두운 가게 조명: 밝기 .4 + 센서 노이즈(soft-light로 얹어 어두운 곳에 더 보이게).
await write(sharp(await base("studio-hongeo").modulate({brightness:.4}).png().toBuffer()).composite([{input:await noiseBuffer(W,H,10),blend:"soft-light"}]),"dark");
// 3. 흔들림: 가우시안 blur 3.
await write(base("studio-hongeo").blur(3),"blurry");
// 4. 형광등 초록 기운.
await write(base("table-topdown").linear([.9,1.06,.92],[0,0,0]),"cast-green");
// 5. 카카오톡 전송본 흉내: 긴 변 600px·JPEG q55로 깨뜨린 뒤 다시 키운다(블록·흐림).
const small=await base("hands-samhap").resize(450,600).jpeg({quality:55}).toBuffer();
await write(sharp(small).resize(W,H),"lowres");
// 6. 가로 사진(세로 카드에 자르면 확대가 커지는 경우).
await write(sharp("assets/design/samples/table-topdown.jpg").resize(1024,768,{fit:"cover"}),"landscape");
// 7. 흰 접시 클로즈업(하이라이트 날림 검사용): 밝기 1.25로 접시를 거의 흰색에 붙인다.
await write(base("studio-ray").modulate({brightness:1.25}),"bright-plate");
