// 두 갈래(사진 중심·글 중심) 디자인을 샘플 사진으로 그려 한 장의 비교 시트로 모은다. AI 호출 없음.
// --look=0~3: 모양(slide.variant), --palette=warm|sea|night|herb|clay|plum: 색 조합.
// 실행: node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs scripts/render-track-samples.mjs [--out=폴더] [--track=photo|text] [--full]
// 결과: <폴더>/photo-focus.jpg, <폴더>/text-focus.jpg (행 = 어두운/밝은 사진 × 보통/긴 글, 열 = 표지·본문 3장·마지막 장)
// --full 을 붙이면 장마다 원본 크기(1080×1350)도 <폴더>/full/에 남긴다. 각 장의 자동 검수 문제·경고도 함께 출력한다.
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { composeSlideCard } from "../src/features/images/composeSlide.ts";
import { describeIssue, describeNote } from "../src/features/images/render/audit.ts";
import { fitTrackCopy } from "../src/features/images/track.ts";

const OUT=process.argv.find(arg=>arg.startsWith("--out="))?.slice(6)??"output/track-samples";
const only=process.argv.find(arg=>arg.startsWith("--track="))?.slice(8);
const full=process.argv.includes("--full");
const look=Number(process.argv.find(arg=>arg.startsWith("--look="))?.slice(7)??0);
const paletteId=process.argv.find(arg=>arg.startsWith("--palette="))?.slice(10)??"warm";
const handle=process.argv.find(arg=>arg.startsWith("--handle="))?.slice(9)??"mukdong_hongeo";
const sample=name=>readFile(path.join("assets/design/samples",`${name}.jpg`));
const photoSets={
  "어두운 사진":[await sample("hands-makgeolli"),await sample("table-topdown"),await sample("hands-samhap"),await sample("hands-makgeolli"),await sample("table-topdown")],
  "밝은 사진":[await sample("studio-hongeo"),await sample("studio-ray"),await sample("illustration-plate"),await sample("studio-hongeo"),await sample("studio-ray")],
};
// 문안(보통: 짧게, 긴 글: 상한 근처나 조금 넘게). 그리기 전에 구성안과 같은 갈래 글 길이 맞추기(fitTrackCopy)를 거쳐
// 사장님이 실제로 받게 될 글로 그린다(사진 중심은 짧은 글 1개, 글 중심은 2개까지).
const copies={
  "보통 글":[
    {role:"cover",headline:"비 오는 날엔 홍어 한 점 어때요?",subline:"처음이라도 부담 없는 순서",points:[]},
    {role:"detail",headline:"가까이 보면 결이 살아 있어요",points:["얇게 썰려 빛에 결이 비쳐요","씹을수록 쫀득함이 올라와요"]},
    {role:"how-to",headline:"한 점은 이렇게 드세요",points:["결 방향으로 한 점 집어요","초장은 살짝만 찍어 보세요"]},
    {role:"pairing",headline:"막걸리 한 잔이 짝이에요",points:["톡 쏘는 향을 부드럽게 눌러요","한 모금 뒤 다음 점을 집어요"]},
    {role:"visit",headline:"가기 전에 이것만 보세요",points:["처음이면 덜 삭힌 걸로 주문해요"]},
  ],
  "긴 글":[
    {role:"cover",headline:"비 오는 저녁, 막걸리와 홍어 한 점이 당기는 이유",subline:"처음 먹는 친구에게 알려 주는 순서",points:[]},
    {role:"detail",headline:"홍어 살은 가까이 보면 결이 달라요",points:["얇게 썰린 살에 빛이 비쳐 결이 보여요","씹을수록 쫀득하고 감칠맛이 올라와요"]},
    {role:"how-to",headline:"처음이라면 이 순서로 드셔 보세요",points:["덜 삭힌 쪽부터 작게 한 점 집어요","초장을 살짝 찍어 향을 먼저 봐요"]},
    {role:"pairing",headline:"막걸리 한 모금이 향을 정리해 줘요",points:["톡 쏘는 향을 막걸리가 부드럽게 눌러요","한 모금 마신 뒤 다음 점을 집어 보세요"]},
    {role:"visit",headline:"가기 전에 이것만 확인해 두세요",points:["처음이라면 덜 삭힌 걸로 주문해 보세요"]},
  ],
};
const base={visualPrompt:"",textPosition:"bottom",figure:"",titleFont:"auto",bodyFont:"auto",variant:look,subline:"",keywords:["홍어","막걸리"]};
const tracks=[["photo","photo-focus","사진 중심"],["text","text-focus","글 중심"]].filter(([track])=>!only||only===track);
await mkdir(OUT,{recursive:true});
if(full)await mkdir(path.join(OUT,"full"),{recursive:true});
const TW=324,TH=405,GAP=10,LABEL=40;
let problems=0;
for(const [track,style,label] of tracks){
  const rows=[];
  for(const [photoName,photos] of Object.entries(photoSets))for(const [copyName,copy] of Object.entries(copies)){
    const tiles=[];
    for(const [i,slide] of copy.entries()){
      const index=i+1;
      // 사진 중심은 모든 장이 사진 1장(표지 fullscreen, 본문 frame), 글 중심은 표지만 사진 1장이고 본문·마지막 장은 사진 없음(browser).
      const layout=index===1?"fullscreen":track==="photo"?"frame":"browser";
      const inputs=track==="photo"||index===1?[photos[i]]:[];
      const fitted={...base,...slide,...fitTrackCopy({...base,...slide},track),layout};
      const {image,report}=await composeSlideCard(inputs,fitted,index,copy.length,"card",{palette:paletteId,style},{photoKind:"real",contrast:true,brandHandle:handle});
      const notes=report.notes.filter(note=>!["photo-crop","photo-quality"].includes(note.kind));
      if(report.issues.length){problems++;console.log(`✗ ${style} ${photoName} ${copyName} ${index}장:`,report.issues.map(describeIssue).join(" | "));}
      if(notes.length)console.log(`· ${style} ${photoName} ${copyName} ${index}장 메모:`,notes.map(describeNote).join(" | "));
      if(full)await writeFile(path.join(OUT,"full",`${style}-${photoName.replace(/\s/g,"")}-${copyName.replace(/\s/g,"")}-${index}.jpg`),image);
      tiles.push(await sharp(image).resize(TW,TH).png().toBuffer());
    }
    const caption=await sharp({text:{text:`<span foreground="#333">${label} · ${photoName} · ${copyName}</span>`,font:"Pretendard SemiBold 24",fontfile:"assets/fonts/Pretendard-SemiBold.otf",rgba:true}}).png().toBuffer();
    rows.push(await sharp({create:{width:TW*5+GAP*4,height:TH+LABEL,channels:3,background:"#FFFFFF"}}).composite([{input:caption,left:4,top:6},...tiles.map((input,i)=>({input,left:i*(TW+GAP),top:LABEL}))]).png().toBuffer());
  }
  const sheet=path.join(OUT,`${style}-look${look}-${paletteId}.jpg`);
  await sharp({create:{width:TW*5+GAP*4+32,height:rows.length*(TH+LABEL+GAP)+32,channels:3,background:"#FFFFFF"}}).composite(rows.map((input,i)=>({input,left:16,top:16+i*(TH+LABEL+GAP)}))).jpeg({quality:90}).toFile(sheet);
  console.log(sheet);
}
console.log(problems?`자동 검수 문제가 있는 장 ${problems}개`:"자동 검수 문제 없음");
