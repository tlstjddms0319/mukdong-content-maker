import sharp, { type OverlayOptions } from "sharp";
import { brandHandle, croppedPhoto, finishPhoto, softShadow, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { MIN_STROKE, STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap, type StyleContent } from "./shared";

// 오마카세·하이엔드 미니멀: 따뜻한 베이지(또는 흰) 바탕에 여백을 크게 두고, 가운데에 정갈한 사진 한 장.
// 명조로 제목을 시 한 구절처럼, 요점은 짧은 줄로 가운데 정렬. 장식은 가는 세로선과 장 번호 "— 03 —"뿐.
// 여백이 미덕이지만 폰에서 읽혀야 하므로 글자는 작지 않게(요점 38px 이상), 사진·글 덩어리는 남는 높이의 가운데에 둔다.
// accent: 제목 핵심어 강조색. 밝은 바탕엔 짙은 주홍(대비 약 7:1), 어두운 바탕엔 놋쇠빛(약 7:1). 화려한 원색은 이 계열의 절제와 맞지 않는다.
const SURFACES=[{bg:"#F4EFE6",ink:"#2B2622",dim:"#4E463E",line:"#B9AE9F",accent:"#9A4A24"},{bg:"#FBFAF7",ink:"#1F1F1D",dim:"#4A4741",line:"#C9C5BC",accent:"#9A4A24"},{bg:"#1E1C1A",ink:"#EFE9DF",dim:"#C4BBAD",line:"#5A544C",accent:"#D8A25E"}] as const;
type Surface=typeof SURFACES[number];
// 마지막 장 명함의 "저장해 두고 다시 보세요" 알약. 흰 글자가 읽히는(약 5.8:1) 짙은 갈색이라 어두운 바탕에서도 튀지 않는다.
const CHIP_BROWN="#7A4A22";

// 눈썹 글자 "묵동홍어마을": 예전 영문 눈썹(M U K D O N G …)처럼 넓은 자간을 공백 대신 letterSpacing으로 준다.
const eyebrowLayer=(surface:Surface)=>textLayer("묵동홍어마을",{size:26,color:surface.dim,width:900,height:44,font:STYLE_FONTS.serif,align:"centre",letterSpacing:26*.5});

// 장 번호 "— 03 —"(+계정). 숫자 폭이 같도록 tnum.
const folioLayer=(surface:Surface,index:number,handle:string)=>textLayer(`—  ${String(index).padStart(2,"0")}  —${handle?`\n${handle}`:""}`,{size:26,color:surface.dim,width:620,height:handle?80:40,font:STYLE_FONTS.serif,align:"centre",spacing:8,features:"tnum"});

// 표지 부제: 제목 아래 명조 한 줄(34px). 길면 두 줄까지만 허용한다(그 이상이면 자리 계산에서 빠진다).
const sublineLayer=(content:StyleContent,surface:Surface)=>content.subline?textLayer(content.subline,{size:34,color:surface.dim,width:860,height:110,font:STYLE_FONTS.serif,align:"centre",spacing:8}):Promise.resolve(null);

// 표지 예고 띠: 양옆에 짧은 가로선을 둔 작은 명조 줄. 오마카세 코스 안내서의 "차림" 줄처럼 조용하게.
async function teaserLine(content:StyleContent,surface:Surface):Promise<{layer:Layer;svg:(y:number)=>string}|null> {
  if(!content.teaser)return null;
  const layer=await textLayer(content.teaser,{size:26,color:surface.dim,width:860,height:44,font:STYLE_FONTS.serif,align:"centre",letterSpacing:26*.04});
  if(layer.info.height>44)return null;
  return {layer,svg:y=>{
    const mid=y+layer.info.height/2,left=Math.round((1080-layer.info.width)/2);
    return `<path d="M${left-70} ${mid}H${left-22}M${left+layer.info.width+22} ${mid}H${left+layer.info.width+70}" stroke="${surface.line}" stroke-width="${MIN_STROKE}"/>`;
  }};
}

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
// 부제·예고 띠도 패널 몫이다. 이 둘 때문에 사진이 최소 높이(640)보다 작아지면 예고 띠, 그다음 부제 순으로 뺀다.
async function bleedCover(shots:Buffer[],content:StyleContent,index:number):Promise<Buffer> {
  const surface=SURFACES[2];
  const handle=brandHandle();
  const folioTop=1350-(handle?118:100);
  const PHOTO_MAX=880,PHOTO_MIN=640,EYEBROW_GAP=44,TITLE_GAP=26,FOLIO_GAP=34,SUB_GAP=20,TEASER_GAP=26;
  const eyebrow=await eyebrowLayer(surface);
  // 제목 상한은 사진이 최소 높이일 때 패널 안 바닥글 위까지 남는 높이.
  const titleRoom=folioTop-FOLIO_GAP-(PHOTO_MIN+EYEBROW_GAP+eyebrow.info.height+TITLE_GAP);
  // 긴 제목은 88px로 4줄이 되느니 80px로 3줄이 사진도 크고 읽기도 편하다: 줄 수가 가장 적은 크기 중 가장 큰 것을 고른다.
  let best={size:88,lines:99};
  for(const size of [88,84,80]){
    const measure=(text:string)=>textLayer(text,{size,color:surface.ink,width:920,height:4000,font:STYLE_FONTS.serif,align:"centre",spacing:14}).then(layer=>layer.info.height);
    const [h,one,two]=await Promise.all([measure(content.headline),measure("홍"),measure("홍\n홍")]);
    const lines=Math.round((h-one)/(two-one))+1;
    if(lines<best.lines)best={size,lines};
  }
  const title=await fitText(content.headline,{sizes:[best.size,80],width:920,maxHeight:titleRoom,color:surface.ink,font:STYLE_FONTS.serif,align:"centre",spacing:14,emphasis:emphasisOf(content,surface.accent)});
  let subline=await sublineLayer(content,surface);
  let teaser=await teaserLine(content,surface);
  const photoHeight=()=>Math.min(PHOTO_MAX,folioTop-FOLIO_GAP-title.info.height-TITLE_GAP-eyebrow.info.height-EYEBROW_GAP
    -(subline?SUB_GAP+subline.info.height:0)-(teaser?TEASER_GAP+teaser.layer.info.height:0));
  if(photoHeight()<PHOTO_MIN)teaser=null;
  if(photoHeight()<PHOTO_MIN)subline=null;
  const PH=photoHeight();
  const layers:OverlayOptions[]=[];
  if(shots.length>1){
    // 두 장이면 좌우로 나눠 꽉 채우고 가운데에 가는 틈만 둔다.
    const gap=6,w=(1080-gap)/2;
    for(const [i,shot] of shots.entries())layers.push({input:await warmed(await finishPhoto(shot,w,PH)),left:i?1080-Math.round(w):0,top:0});
  }else layers.push({input:await warmed(await finishPhoto(shots[0],1080,PH,{zoom:1.06})),left:0,top:0});
  // 사진 아래 끝을 패널 색으로 살짝 녹여 경계가 칼로 자른 듯 딱딱하지 않게. 음식 가운데에는 닿지 않는 아래 70px만.
  let svg=`<defs><linearGradient id="omf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${surface.bg}" stop-opacity="0"/><stop offset="1" stop-color="${surface.bg}" stop-opacity=".85"/></linearGradient></defs><rect x="0" y="${PH-70}" width="1080" height="70" fill="url(#omf)"/>`;
  let y=PH+EYEBROW_GAP;
  layers.push({input:eyebrow.data,left:Math.round((1080-eyebrow.info.width)/2),top:y});
  y+=eyebrow.info.height+TITLE_GAP;
  // 제목(+부제) 덩어리는 패널의 남는 높이 가운데에 둔다(제목이 짧아 사진이 상한에 걸린 경우 위아래 여백을 고르게).
  const teaserTop=teaser?folioTop-FOLIO_GAP-teaser.layer.info.height:folioTop;
  const blockBottom=teaser?teaserTop-TEASER_GAP:folioTop-FOLIO_GAP;
  const blockH=title.info.height+(subline?SUB_GAP+subline.info.height:0);
  y+=Math.max(0,Math.round((blockBottom-y-blockH)/2));
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:y});
  y+=title.info.height;
  if(subline)layers.push({input:subline.data,left:Math.round((1080-subline.info.width)/2),top:y+SUB_GAP});
  if(teaser){
    layers.push({input:teaser.layer.data,left:Math.round((1080-teaser.layer.info.width)/2),top:teaserTop});
    svg+=teaser.svg(teaserTop);
  }
  const folio=await folioLayer(surface,index,handle);
  layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:folioTop});
  layers.splice(shots.length,0,svgLayer(svg));
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(snap(layers)).jpeg({quality:94}).toBuffer();
}

export const renderOmakase:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  // 작은 액자 표지는 네 번에 한 번(variant%4===3)만 남겨 변주로 쓴다.
  if(content.cover&&inputs.length&&(slide.variant??0)%4!==3)return bleedCover(inputs.slice(0,2),content,index);
  // 표지와 마지막 장은 어두운 바탕으로 무게를 준다.
  const surface=content.cover||content.last?SURFACES[2]:SURFACES[(slide.variant??0)%2];
  const layers:OverlayOptions[]=[];
  let lines="";
  const handle=brandHandle();
  // 마지막 장은 아래 명함이 가게 이름·계정을 맡으므로 위 눈썹·세로선과 쪽 번호 아래 계정을 뺀다(같은 이름 두 번 금지, 사진 자리 확보).
  const folioHandle=content.last?"":handle;
  const folioTop=1350-(folioHandle?118:100);
  let contentTop=110;
  if(!content.last){
    const eyebrow=await eyebrowLayer(surface);
    layers.push({input:eyebrow.data,left:Math.round((1080-eyebrow.info.width)/2),top:110});
    const lineTop=110+eyebrow.info.height+30;
    lines+=`<path d="M540 ${lineTop}V${lineTop+60}" stroke="${surface.line}" stroke-width="${MIN_STROKE}"/>`;
    contentTop=lineTop+100;
  }
  // 마지막 장 명함은 쪽 번호 위에 예약한다. 높이가 모자라면 요점을 버리지 않고 사진을 먼저 줄인다(아래 PH 하한).
  const card=content.last?await closingBlock({width:860,color:surface.ink,accent:CHIP_BROWN,font:STYLE_FONTS.modernSerif}):null;
  const CARD_GAP=56;
  const cardTop=card?folioTop-34-card.height:folioTop;
  // 표지 예고 띠도 쪽 번호 위 자리를 쓴다.
  const teaser=content.cover?await teaserLine(content,surface):null;
  const teaserTop=teaser?folioTop-34-teaser.layer.info.height:folioTop;
  // 내용이 들어갈 범위: 세로선 아래부터 쪽 번호(또는 명함·예고 띠) 위까지.
  const contentBottom=card?cardTop-CARD_GAP:teaser?teaserTop-40:folioTop-40;
  const shots=inputs.slice(0,2);
  // 사진 크기: 표지는 크게, 본문은 요점 수에 따라, 두 장이면 작은 두 장 나란히.
  const PW=shots.length>1?400:content.cover?560:520;
  let PH=shots.length>1?480:content.cover?700:content.points.length>2?520:600;
  const headline=await fitText(content.headline,{sizes:content.cover?[84,80]:shots.length?[60,56]:[76,68,60],width:content.cover?920:860,maxHeight:content.cover?280:shots.length?200:360,color:surface.ink,font:STYLE_FONTS.serif,align:"centre",spacing:16,emphasis:emphasisOf(content,surface.accent)});
  const subline=content.cover?await sublineLayer(content,surface):null;
  const pointLayers:Layer[]=[];
  // 명함이 있는 마지막 장은 요점 글자를 한 단계(40→38, 46→42) 줄여 사진·요점이 모두 들어가게 한다.
  const pointSize=shots.length?(card?38:40):(card?42:46);
  for(const point of content.points.slice(0,shots.length?(content.points.length>2&&PH>=600?2:3):4))pointLayers.push(await textLayer(point,{size:pointSize,color:surface.dim,width:820,height:130,font:STYLE_FONTS.serif,align:"centre",spacing:10}));
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.info.height+22,0);
  // 제목이 길어 덩어리가 범위를 넘으면 사진 높이를 줄여 맞춘다(최소 420, 명함이 있는 마지막 장은 300까지).
  const textH=headline.info.height+(subline?20+subline.info.height:0)+(pointLayers.length?40+40+pointsH:0);
  if(shots.length)PH=Math.max(card?300:420,Math.min(PH,contentBottom-contentTop-textH-70));
  const blockH=(shots.length?PH+70:0)+textH;
  let y=contentTop+Math.max(0,Math.round((contentBottom-contentTop-blockH)/2));
  if(shots.length){
    // 사진은 얇은 테두리와 아주 옅은 그림자. 두 장이면 가운데 간격 40.
    const gap=40,rowW=shots.length*PW+(shots.length-1)*gap;
    for(const [i,shot] of shots.entries()){
      const x=Math.round((1080-rowW)/2)+i*(PW+gap);
      layers.push(svgLayer(softShadow({x,y:y+12,width:PW,height:PH,rx:2,blur:24,opacity:.12})));
      layers.push({input:await warmed(await croppedPhoto(shot,PW,PH,0)),left:x,top:y});
      lines+=`<rect x="${x-14}" y="${y-14}" width="${PW+28}" height="${PH+28}" fill="none" stroke="${surface.line}" stroke-width="${MIN_STROKE}"/>`;
    }
    y+=PH+70;
  }
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:y});
  y+=headline.info.height;
  if(subline){
    layers.push({input:subline.data,left:Math.round((1080-subline.info.width)/2),top:y+20});
    y+=20+subline.info.height;
  }
  if(pointLayers.length){
    y+=40;
    lines+=`<path d="M510 ${y}H570" stroke="${surface.line}" stroke-width="${MIN_STROKE}"/>`;
    y+=40;
    for(const line of pointLayers){
      if(y+line.info.height>contentBottom+20)break;
      layers.push({input:line.data,left:Math.round((1080-line.info.width)/2),top:y});
      y+=line.info.height+22;
    }
  }
  if(teaser){
    layers.push({input:teaser.layer.data,left:Math.round((1080-teaser.layer.info.width)/2),top:teaserTop});
    lines+=teaser.svg(teaserTop);
  }
  if(card){
    // 명함: 위에 짧은 가로선 하나로 본문과 나누고, 가게 이름(넓은 자간 명조) · 계정 · 저장 알약을 가운데 쌓는다.
    lines+=`<path d="M500 ${cardTop-28}H580" stroke="${surface.line}" stroke-width="${MIN_STROKE}"/>`;
    let cy=cardTop;
    layers.push({input:card.wordmark.data,left:Math.round((1080-card.wordmark.info.width)/2),top:cy});
    cy+=card.wordmark.info.height;
    if(card.handle){
      cy+=8;
      layers.push({input:card.handle.data,left:Math.round((1080-card.handle.info.width)/2),top:cy});
      cy+=card.handle.info.height;
    }
    cy+=18+12;
    const chipX=Math.round((1080-card.chip.info.width)/2);
    lines+=card.chipSvg(chipX,cy);
    layers.push({input:card.chip.data,left:chipX,top:cy});
  }
  // 쪽 번호 아래에 브랜드 키트의 Instagram 계정(설정에 있을 때만). 여백을 해치지 않게 쪽 번호와 같은 색·크기.
  const folio=await folioLayer(surface,index,folioHandle);
  layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:folioTop});
  // 넘겨 보기: 표지·마지막 장이 아닌 장의 오른쪽 아래, 쪽 번호와 같은 줄(가운데 쪽 번호와 겹치지 않는 오른쪽 끝).
  if(!content.cover&&!content.last){
    const cue=await nextCue(surface.dim,26);
    const cx=1080-72-cue.width,cy=folioTop;
    layers.push({input:cue.label.data,left:cx,top:cy});
    lines+=cue.arrow(cx,cy);
  }
  layers.unshift(svgLayer(lines));
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(snap(layers)).jpeg({quality:94}).toBuffer();
};
