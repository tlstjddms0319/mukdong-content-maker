// 사진 보정 전후 비교 시트. 샘플·나쁜 사진 픽스처마다 [원본 | 예전 보정 | 새 보정]을 카드 크기로 나란히 두고,
// 아래에 가운데 부분 100% 확대(결·선명도 확인용)와 평균 RGB·밝기·채도를 적는다. AI 호출 없음.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/compare-photo-look.mjs
// 결과: output/photo-look/<이름>.jpg, 전체 output/photo-look/all.jpg
import sharp from "sharp";
import { mkdir, readdir } from "node:fs/promises";
import { enhancePhoto, enhancePhotoLegacy } from "../src/features/images/render/photoEnhance.ts";
import { finishPhoto } from "../src/features/images/render/primitives.ts";

const OUT="output/photo-look";
await mkdir(OUT,{recursive:true});
const fixtures=(await readdir("tests/fixtures/photos")).filter(f=>f.endsWith(".jpg")).map(f=>`tests/fixtures/photos/${f}`);
const sources=["assets/design/samples/studio-hongeo.jpg","assets/design/samples/hands-samhap.jpg",...fixtures];

const TW=360,TH=450,CROP=220;
// 평균 RGB, 밝기(Rec.709), 평균 채도((max−min)/max)를 64px 축소본에서 잰다.
async function measure(buffer){
  const {data}=await sharp(buffer).resize(64,80,{fit:"cover"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let r=0,g=0,b=0,sat=0,n=0;
  for(let i=0;i<data.length;i+=3){const max=Math.max(data[i],data[i+1],data[i+2]),min=Math.min(data[i],data[i+1],data[i+2]);r+=data[i];g+=data[i+1];b+=data[i+2];sat+=max?(max-min)/max:0;n++;}
  r/=n;g/=n;b/=n;
  return `RGB ${Math.round(r)}/${Math.round(g)}/${Math.round(b)} · 밝기 ${((r*.2126+g*.7152+b*.0722)/255).toFixed(2)} · 채도 ${(sat/n).toFixed(2)}`;
}
const text=(value,size=18)=>sharp({text:{text:`<span foreground="#222">${value}</span>`,font:`Pretendard ${size}`,fontfile:"assets/fonts/Pretendard-Regular.otf",rgba:true}}).png().toBuffer();

const rows=[];
for(const source of sources){
  const original=await sharp(source).jpeg().toBuffer();
  const versions=[["원본",original],["예전 보정",await enhancePhotoLegacy(original)],["새 보정",await enhancePhoto(original)]];
  const columns=[];
  for(const [label,buffer] of versions){
    // 카드에 들어가는 것과 같은 경로: 원본·예전은 finish 없이, 새 보정은 finishPhoto(선명화 2단)까지.
    const card=label==="새 보정"?await finishPhoto(buffer,1080,1350):await finishPhoto(buffer,1080,1350,{finish:"none"});
    const thumb=await sharp(card).resize(TW,TH).png().toBuffer();
    const crop=await sharp(card).extract({left:540-CROP/2,top:675-CROP/2,width:CROP,height:CROP}).png().toBuffer();
    columns.push({label:await text(label,20),thumb,crop,stats:await text(await measure(buffer),15)});
  }
  const name=source.split("/").pop().replace(".jpg","");
  const W=columns.length*(TW+12),H=36+TH+8+CROP+40;
  const row=await sharp({create:{width:W,height:H+30,channels:3,background:"#ffffff"}}).composite([
    {input:await text(name,22),left:6,top:4},
    ...columns.flatMap((c,i)=>[{input:c.label,left:i*(TW+12)+6,top:32},{input:c.thumb,left:i*(TW+12),top:60},{input:c.crop,left:i*(TW+12),top:60+TH+8},{input:c.stats,left:i*(TW+12)+CROP+8,top:60+TH+12}]),
  ]).jpeg({quality:88}).toBuffer();
  await sharp(row).toFile(`${OUT}/${name}.jpg`);
  rows.push(row);
  console.log(`${OUT}/${name}.jpg`);
}
const metas=await Promise.all(rows.map(r=>sharp(r).metadata()));
const total=metas.reduce((h,m)=>h+m.height+10,0);
let y=0;
await sharp({create:{width:metas[0].width,height:total,channels:3,background:"#ffffff"}}).composite(rows.map((input,i)=>{const top=y;y+=metas[i].height+10;return {input,left:0,top};})).jpeg({quality:85}).toFile(`${OUT}/all.jpg`);
console.log(`${OUT}/all.jpg`);
