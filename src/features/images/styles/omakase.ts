import sharp, { type OverlayOptions } from "sharp";
import { brandHandle, croppedPhoto, finishPhoto, softShadow, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STYLE_FONTS, contentOf, fitText, snap } from "./shared";

// 오마카세·하이엔드 미니멀: 따뜻한 베이지(또는 흰) 바탕에 여백을 크게 두고, 가운데에 정갈한 사진 한 장.
// 명조로 제목을 시 한 구절처럼, 요점은 짧은 줄로 가운데 정렬. 장식은 가는 세로선과 장 번호 "— 03 —"뿐.
// 여백이 미덕이지만 폰에서 읽혀야 하므로 글자는 작지 않게(요점 38px 이상), 사진·글 덩어리는 남는 높이의 가운데에 둔다.
const SURFACES=[{bg:"#F4EFE6",ink:"#2B2622",dim:"#4E463E",line:"#B9AE9F"},{bg:"#FBFAF7",ink:"#1F1F1D",dim:"#4A4741",line:"#C9C5BC"},{bg:"#1E1C1A",ink:"#EFE9DF",dim:"#C4BBAD",line:"#5A544C"}] as const;

// 오마카세는 따뜻한 조명 아래 한 상 느낌이라 차가운 사진만 살짝 데운다.
// 이미 따뜻한 사진(R−B 평균 차 45 초과)에 또 온기를 얹으면 홍어 살이 주황으로 떠서 그대로 둔다.
async function warmed(photo:Buffer):Promise<Buffer> {
  const stats=await sharp(photo).stats();
  if(stats.channels[0].mean-stats.channels[2].mean>45)return photo;
  const out=await sharp(photo).linear([1.03,1,.94],[4,1,-3]).png().toBuffer();
  // 색만 손댄 새 버퍼라 검수 사진 면적에 잡히도록 다시 등록한다.
  registerPhoto(out);
  return out;
}

// 표지: 사진을 화면 위쪽 끝까지 꽉 채우고(블리드), 아래 어두운 패널에 명조 제목을 둔다.
// 사진 높이는 제목이 차지하고 "남는 높이"에서 역산한다(최대 880). 제목을 줄여 사진 자리를 만들지 않는다.
async function bleedCover(shots:Buffer[],headline:string,index:number):Promise<Buffer> {
  const surface=SURFACES[2];
  const handle=brandHandle();
  const folioTop=1350-(handle?118:100);
  const PHOTO_MAX=880,PHOTO_MIN=640,EYEBROW_GAP=44,TITLE_GAP=26,FOLIO_GAP=34;
  const eyebrow=await textLayer("M U K D O N G   H O N G E O",{size:24,color:surface.dim,width:900,height:40,font:STYLE_FONTS.serif,align:"centre"});
  // 제목 상한은 사진이 최소 높이일 때 패널 안 바닥글 위까지 남는 높이.
  const titleRoom=folioTop-FOLIO_GAP-(PHOTO_MIN+EYEBROW_GAP+eyebrow.info.height+TITLE_GAP);
  // 긴 제목은 88px로 4줄이 되느니 80px로 3줄이 사진도 크고 읽기도 편하다: 줄 수가 가장 적은 크기 중 가장 큰 것을 고른다.
  let best={size:88,lines:99};
  for(const size of [88,84,80]){
    const measure=(text:string)=>textLayer(text,{size,color:surface.ink,width:920,height:4000,font:STYLE_FONTS.serif,align:"centre",spacing:14}).then(layer=>layer.info.height);
    const [h,one,two]=await Promise.all([measure(headline),measure("홍"),measure("홍\n홍")]);
    const lines=Math.round((h-one)/(two-one))+1;
    if(lines<best.lines)best={size,lines};
  }
  const title=await fitText(headline,{sizes:[best.size,80],width:920,maxHeight:titleRoom,color:surface.ink,font:STYLE_FONTS.serif,align:"centre",spacing:14});
  const PH=Math.min(PHOTO_MAX,folioTop-FOLIO_GAP-title.info.height-TITLE_GAP-eyebrow.info.height-EYEBROW_GAP);
  const layers:OverlayOptions[]=[];
  if(shots.length>1){
    // 두 장이면 좌우로 나눠 꽉 채우고 가운데에 가는 틈만 둔다.
    const gap=6,w=(1080-gap)/2;
    for(const [i,shot] of shots.entries())layers.push({input:await warmed(await finishPhoto(shot,w,PH)),left:i?1080-Math.round(w):0,top:0});
  }else layers.push({input:await warmed(await finishPhoto(shots[0],1080,PH,{zoom:1.06})),left:0,top:0});
  // 사진 아래 끝을 패널 색으로 살짝 녹여 경계가 칼로 자른 듯 딱딱하지 않게. 음식 가운데에는 닿지 않는 아래 70px만.
  const fade=`<defs><linearGradient id="omf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${surface.bg}" stop-opacity="0"/><stop offset="1" stop-color="${surface.bg}" stop-opacity=".85"/></linearGradient></defs><rect x="0" y="${PH-70}" width="1080" height="70" fill="url(#omf)"/>`;
  let y=PH+EYEBROW_GAP;
  layers.push({input:eyebrow.data,left:Math.round((1080-eyebrow.info.width)/2),top:y});
  y+=eyebrow.info.height+TITLE_GAP;
  // 제목은 패널의 남는 높이 가운데에 둔다(제목이 짧아 사진이 상한에 걸린 경우 위아래 여백을 고르게).
  const slack=folioTop-FOLIO_GAP-y-title.info.height;
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:y+Math.max(0,Math.round(slack/2))});
  const folio=await textLayer(`—  ${String(index).padStart(2,"0")}  —${handle?`\n${handle}`:""}`,{size:26,color:surface.dim,width:500,height:handle?80:40,font:STYLE_FONTS.serif,align:"centre",spacing:8});
  layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:folioTop});
  layers.splice(shots.length,0,svgLayer(fade));
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(snap(layers)).jpeg({quality:94}).toBuffer();
}

export const renderOmakase:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  // 작은 액자 표지는 네 번에 한 번(variant%4===3)만 남겨 변주로 쓴다.
  if(content.cover&&inputs.length&&(slide.variant??0)%4!==3)return bleedCover(inputs.slice(0,2),content.headline,index);
  // 표지와 마지막 장은 어두운 바탕으로 무게를 준다.
  const surface=content.cover||content.last?SURFACES[2]:SURFACES[(slide.variant??0)%2];
  const layers:OverlayOptions[]=[];
  const eyebrow=await textLayer("M U K D O N G   H O N G E O",{size:24,color:surface.dim,width:900,height:40,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:eyebrow.data,left:Math.round((1080-eyebrow.info.width)/2),top:110});
  const lineTop=110+eyebrow.info.height+30;
  let lines=`<path d="M540 ${lineTop}V${lineTop+60}" stroke="${surface.line}" stroke-width="1.5"/>`;
  // 내용이 들어갈 범위: 세로선 아래부터 쪽 번호 위까지.
  const handle=brandHandle();
  const folioTop=1350-(handle?118:100);
  const contentTop=lineTop+100,contentBottom=folioTop-40;
  const shots=inputs.slice(0,2);
  // 사진 크기: 표지는 크게, 본문은 요점 수에 따라, 두 장이면 작은 두 장 나란히.
  const PW=shots.length>1?400:content.cover?560:520;
  let PH=shots.length>1?480:content.cover?700:content.points.length>2?520:600;
  const headline=await fitText(content.headline,{sizes:content.cover?[84,80]:shots.length?[60,56]:[76,68,60],width:content.cover?920:860,maxHeight:content.cover?280:shots.length?200:360,color:surface.ink,font:STYLE_FONTS.serif,align:"centre",spacing:16});
  const pointLayers:Layer[]=[];
  for(const point of content.points.slice(0,shots.length?(content.points.length>2&&PH>=600?2:3):4))pointLayers.push(await textLayer(point,{size:shots.length?40:46,color:surface.dim,width:820,height:130,font:STYLE_FONTS.serif,align:"centre",spacing:10}));
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.info.height+22,0);
  // 제목이 길어 덩어리가 범위를 넘으면 사진 높이를 줄여 맞춘다(최소 420).
  const textH=headline.info.height+(pointLayers.length?40+40+pointsH:0);
  if(shots.length)PH=Math.max(420,Math.min(PH,contentBottom-contentTop-textH-70));
  const blockH=(shots.length?PH+70:0)+textH;
  let y=contentTop+Math.max(0,Math.round((contentBottom-contentTop-blockH)/2));
  if(shots.length){
    // 사진은 얇은 테두리와 아주 옅은 그림자. 두 장이면 가운데 간격 40.
    const gap=40,rowW=shots.length*PW+(shots.length-1)*gap;
    for(const [i,shot] of shots.entries()){
      const x=Math.round((1080-rowW)/2)+i*(PW+gap);
      layers.push(svgLayer(softShadow({x,y:y+12,width:PW,height:PH,rx:2,blur:24,opacity:.12})));
      layers.push({input:await warmed(await croppedPhoto(shot,PW,PH,0)),left:x,top:y});
      lines+=`<rect x="${x-14}" y="${y-14}" width="${PW+28}" height="${PH+28}" fill="none" stroke="${surface.line}" stroke-width="1"/>`;
    }
    y+=PH+70;
  }
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:y});
  y+=headline.info.height;
  if(pointLayers.length){
    y+=40;
    lines+=`<path d="M510 ${y}H570" stroke="${surface.line}" stroke-width="1.5"/>`;
    y+=40;
    for(const line of pointLayers){
      if(y+line.info.height>contentBottom+20)break;
      layers.push({input:line.data,left:Math.round((1080-line.info.width)/2),top:y});
      y+=line.info.height+22;
    }
  }
  // 쪽 번호 아래에 브랜드 키트의 Instagram 계정을 작게(설정에 있을 때만). 여백을 해치지 않게 쪽 번호와 같은 색·크기.
  const folio=await textLayer(`—  ${String(index).padStart(2,"0")}  —${handle?`\n${handle}`:""}`,{size:handle?24:26,color:surface.dim,width:500,height:handle?74:40,font:STYLE_FONTS.serif,align:"centre",spacing:8});
  layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:folioTop});
  layers.unshift(svgLayer(lines));
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(snap(layers)).jpeg({quality:94}).toBuffer();
};
