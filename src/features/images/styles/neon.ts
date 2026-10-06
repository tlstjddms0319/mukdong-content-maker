import sharp, { type OverlayOptions } from "sharp";
import { brandName, croppedPhoto, svgLayer, textLayer, type CardRenderer, type Font, type Layer, type TextEmphasis } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STORE_NAME } from "../slideLayout";
import { STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { glowText, handStar, neonStroke, seeded } from "./handDrawn";

// 네온 간판(밤 술집): 어두운 벽돌 벽에 빛나는 네온관 글자. 맨 위 작은 간판("묵동 홍어 · 막걸리"),
// 가운데 네온 테두리를 두른 사진, 아래 요점은 밝은 글자에 네온 점. 퇴근 후 한잔 분위기의 저녁 게시물용.
// 장마다 네온 색(분홍·하늘·호박색)을 돌려 쓴다.
// chip: 마지막 장 "저장" 칩 바탕. 네온 원색은 흰 글자와 대비가 3:1 남짓이라 같은 색의 진한 쪽(4.5:1 이상)을 쓴다.
const THEMES=[
  {glow:"#FF3EA5",core:"#FFE9F4",accent:"#38E8FF",chip:"#C2186F"},
  {glow:"#38E8FF",core:"#E9FCFF",accent:"#FF3EA5",chip:"#0B7C93"},
  {glow:"#FFB23E",core:"#FFF5E2",accent:"#9DFF6B",chip:"#A85A00"},
] as const;
const WALL="#0E0B13",TEXT="#F2EEF7",DIM="#9C94AE";

// 벽돌 벽 + 가장자리 어둡게 + 바닥에 번진 빛. 벽돌마다 밝기를 조금씩 다르게 하고 거친 알갱이를 얹어 진짜 벽처럼 보이게 한다.
function wall(glow:string,seed:number):string {
  const rand=seeded(seed);
  let bricks="";
  for(let row=0;row<1350/46;row++){
    const y=row*46,shift=row%2?60:0;
    for(let x=-shift;x<1080;x+=120){const tone=rand();if(tone<.35)bricks+=`<rect x="${x+2}" y="${y+2}" width="116" height="42" fill="${tone<.12?"#000":"#fff"}" opacity="${.02+rand()*.04}"/>`;}
    bricks+=`<path d="M0 ${y}H1080" stroke="#1C1724" stroke-width="3"/>`;
    for(let x=-shift;x<1080;x+=120)bricks+=`<path d="M${x} ${y}V${y+46}" stroke="#1C1724" stroke-width="3"/>`;
  }
  bricks+=`<filter id="neonGrit"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 .6  0 0 0 0 .55  0 0 0 0 .7  0 0 0 .07 0"/></filter><rect width="1080" height="1350" filter="url(#neonGrit)"/>`;
  return `<defs><radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".7"/></radialGradient>`
    +`<radialGradient id="spill" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="${glow}" stop-opacity=".16"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
    +`<radialGradient id="floor" cx="50%" cy="100%" r="55%"><stop offset="0" stop-color="${glow}" stop-opacity=".2"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`
    +bricks+`<rect width="1080" height="1350" fill="url(#spill)"/><rect width="1080" height="1350" fill="url(#floor)"/><rect width="1080" height="1350" fill="url(#vig)"/>`;
}
// 제목 네온관 글자: handDrawn의 glowText와 같은 번짐(세 겹 흐림 + 밝은 심)인데, 핵심어만 다른 색 네온관으로 켜기 위해
// 심 글자와 번짐 글자에 같은 강조(emphasis)를 건다.
async function neonTitle(value:string,options:{sizes:number[];width:number;maxHeight:number;font:Font;core:string;glow:string;spacing:number;emphasis?:TextEmphasis}):Promise<Layer&{pad:number}> {
  const common={sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,font:options.font,align:"centre" as const,spacing:options.spacing};
  const core=await fitText(value,{...common,color:options.core,emphasis:options.emphasis});
  // 번짐도 핵심어 자리만 같은 강조색으로 물들인다(다른 색 심 둘레에 바탕 번짐이 섞이면 탁한 보라로 뭉개진다).
  const tinted=await fitText(value,{...common,color:options.glow,emphasis:options.emphasis});
  const pad=Math.round(Math.max(18,core.info.height*.18));
  const padded=await sharp(tinted.data).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const blur=async(sigma:number)=>sharp(padded).blur(sigma).png().toBuffer();
  const result=await sharp({create:{width:core.info.width+pad*2,height:core.info.height+pad*2,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:await blur(pad*.9),left:0,top:0},{input:await blur(pad*.45),left:0,top:0},{input:await blur(Math.max(1,pad*.12)),left:0,top:0},{input:core.data,left:pad,top:pad}])
    .png().toBuffer({resolveWithObject:true});
  return {...result,pad};
}

const roundedRect=(x:number,y:number,w:number,h:number,r:number)=>`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;

export const renderNeon:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const theme=THEMES[(index-1+(slide.variant??0))%THEMES.length];
  const layers:OverlayOptions[]=[];
  const rand=seeded(index*41+(slide.variant??0));
  let deco=wall(theme.glow,index*17+(slide.variant??0));
  // 간판 양옆 작은 네온 별(표지·글자 장). 사진 장은 사진이 주인공이라 두지 않는다.
  if(content.cover||!inputs.length)deco+=neonStroke(handStar(150,96,22,rand),theme.accent,3)+neonStroke(handStar(930,86,18,rand),theme.glow,3);
  // 맨 위 작은 간판.
  const sign=await glowText(content.cover?"묵동 홍어 · 막걸리":`${index} / ${total}`,{sizes:[34],width:600,maxHeight:60,font:STYLE_FONTS.round,core:"#FFFFFF",glow:theme.accent,align:"centre"});
  const signW=sign.info.width-sign.pad*2+64,signX=Math.round((1080-signW)/2),signY=48;
  deco+=neonStroke(roundedRect(signX,signY,signW,70,35),theme.accent,4);
  layers.push({input:sign.data,left:Math.round(540-sign.info.width/2),top:Math.round(signY+35-sign.info.height/2)});
  let y=signY+70+40;
  // 제목: 네온관 글자.
  const shots=inputs.slice(0,2);
  // 핵심어는 맞은편 네온 색(accent)으로 켠다. 심 글자 색이라 어두운 벽 위 대비는 3:1을 넉넉히 넘는다.
  const title=await neonTitle(content.headline,{sizes:content.cover?[96,86,76,66]:shots.length?[74,66,58,52]:[96,84,74,64],width:900,maxHeight:content.cover?330:shots.length?230:360,font:STYLE_FONTS.round,core:theme.core,glow:theme.glow,spacing:12,emphasis:emphasisOf(content,theme.accent)});
  const titleH=title.info.height-title.pad*2;
  const footerTop=1350-70;
  // 마지막 장 가게 명함(제목·요점 아래, 바닥글 위)과 표지 예고 띠(사진 아래 작은 네온 간판)의 높이를 먼저 예약한다.
  const closing=content.last?await closingBlock({width:900,color:theme.core,accent:theme.chip,font:STYLE_FONTS.round}):null;
  const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:TEXT,width:860,height:60,font:STYLE_FONTS.sansSemi}):null;
  const reserved=(closing?closing.height+44:0)+(teaser?teaser.info.height+24+30:0);
  const points=content.points.slice(0,shots.length?3:4);
  // 요점이 길어 사진(한 장 기준 380px)이 모자라면 요점을 버리지 않고 글자를 한 단계 줄인다.
  const pointsAt=(size:number)=>Promise.all(points.map(point=>textLayer(point,{size,color:TEXT,width:800,height:150,font:STYLE_FONTS.sansSemi,spacing:8})));
  const heightOf=(list:Layer[])=>list.reduce((sum,layer)=>sum+layer.info.height+22,0);
  let pointLayers=await pointsAt(shots.length?40:46);
  const subline=content.subline?await textLayer(content.subline,{size:34,color:TEXT,width:860,height:110,font:STYLE_FONTS.sansSemi,align:"centre"}):null;
  const headH=titleH+(subline?subline.info.height+22:0)+(shots.length?44:70);
  const photoRoom=()=>footerTop-y-headH-(pointLayers.length?heightOf(pointLayers)+40:0)-30-reserved;
  const textRoom=()=>footerTop-y-headH-heightOf(pointLayers)-40-reserved;
  if(shots.length?photoRoom()<380:textRoom()<0)pointLayers=await pointsAt(shots.length?36:40);
  const pointsH=heightOf(pointLayers);
  // 글자 장: 제목과 요점 상자(마지막 장이면 명함까지)를 한 덩어리로 세로 가운데에 둔다.
  if(!shots.length)y=Math.max(y,Math.round((y+footerTop-(headH+pointsH+40+reserved))/2));
  layers.push({input:title.data,left:Math.round(540-title.info.width/2),top:y-title.pad});
  y+=titleH;
  if(subline){y+=22;layers.push({input:subline.data,left:Math.round(540-subline.info.width/2),top:y});y+=subline.info.height;}
  y+=shots.length?44:70;
  if(shots.length){
    // 사진: 네온 테두리를 두른 액자. 두 장이면 나란히.
    // 사진이 주인공이므로 제목과 요점 사이 남는 높이를 사진이 다 쓴다(예전엔 760에서 멈춰 사진 아래 빈 띠가 생겼다).
    // 한 장은 폭도 860을 꽉 채운다. 두 장(각 430)은 너무 길쭉하면 어색하므로 세로를 폭의 1.6배까지만 키우고 남는 만큼 가운데로 내린다.
    const room=footerTop-y-(pointsH?pointsH+40:0)-30-reserved;
    const PW=shots.length>1?430:860;
    const PH=Math.round(Math.max(300,shots.length>1?Math.min(PW*1.6,room):room));
    y+=Math.max(0,Math.round((room-PH)/2));
    const gap=40,rowW=shots.length*PW+(shots.length-1)*gap;
    for(const [i,shot] of shots.entries()){
      const x=Math.round((1080-rowW)/2)+i*(PW+gap);
      const photo=await sharp(await croppedPhoto(shot,PW,PH,22)).modulate({brightness:.95,saturation:1.08}).png().toBuffer();
      // 색을 다시 만져 새 버퍼가 되었으므로 캔버스에 놓는 이 버퍼를 사진으로 등록한다(검수의 사진 면적).
      registerPhoto(photo);
      layers.push({input:photo,left:x,top:y});
      deco+=neonStroke(roundedRect(x-10,y-10,PW+20,PH+20,30),i?theme.accent:theme.glow,5);
    }
    y+=PH+50;
  }
  // 요점: 네온 점 + 밝은 글자. 사진이 없으면 네온 테두리 상자 안에.
  if(pointLayers.length){
    const boxed=!shots.length;
    let py=boxed?y+10:Math.max(y,footerTop-pointsH-20-reserved);
    if(boxed){deco+=neonStroke(roundedRect(90,py-30,900,pointsH+40,28),theme.accent,4);}
    for(const layer of pointLayers){
      deco+=`<circle cx="${boxed?140:150}" cy="${py+24}" r="9" fill="${theme.glow}"/><circle cx="${boxed?140:150}" cy="${py+24}" r="18" fill="${theme.glow}" opacity=".25"/>`;
      layers.push({input:layer.data,left:boxed?170:180,top:py});
      py+=layer.info.height+22;
    }
    y=py+(boxed?30:0);
  }
  if(closing){
    // 명함: 요점 아래 남는 자리 가운데. 워드마크는 간판과 같은 둥근 글자, 저장 칩은 네온관을 한 번 더 두른다.
    const top=Math.max(y+24,Math.round(y+(footerTop-y-closing.height)/2));
    layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top});
    let cy=top+closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
    cy+=30;
    const cx=Math.round(540-closing.chip.info.width/2);
    deco+=closing.chipSvg(cx,cy)+neonStroke(roundedRect(cx-32,cy-18,closing.chip.info.width+64,closing.chip.info.height+36,(closing.chip.info.height+36)/2),theme.glow,3);
    layers.push({input:closing.chip.data,left:cx,top:cy});
  }
  if(teaser){
    // 표지 예고 띠: 바닥글 바로 위 작은 네온 간판(가는 관 테두리) 안에.
    const ty=footerTop-teaser.info.height-16;
    deco+=neonStroke(roundedRect(540-teaser.info.width/2-30,ty-12,teaser.info.width+60,teaser.info.height+24,(teaser.info.height+24)/2),theme.accent,3);
    layers.push({input:teaser.data,left:Math.round(540-teaser.info.width/2),top:ty});
  }
  // 바닥글: 가게 이름·장 번호(26px, 숫자 폭 고정). 마지막 장은 명함에 계정이 있으므로 이름만.
  // 가운데 장은 오른쪽 아래에 "넘겨 보기"를 같은 줄에 두고, 긴 계정과 부딪히면 바닥글을 왼쪽 정렬로 옮긴다.
  const footer=await textLayer(`${content.last?STORE_NAME:brandName()}  ·  ${index} / ${total}`,{size:26,color:DIM,width:900,height:44,font:STYLE_FONTS.sansSemi,features:"tnum"});
  let footerX=Math.round((1080-footer.info.width)/2);
  if(!content.cover&&!content.last){
    const cue=await nextCue(theme.glow,26);
    const cx=1080-60-cue.width,cy=footerTop+18+Math.round((footer.info.height-cue.height)/2);
    if(footerX+footer.info.width+28>cx)footerX=60;
    layers.push({input:cue.label.data,left:cx,top:cy});
    deco+=cue.arrow(cx,cy);
  }
  layers.push({input:footer.data,left:footerX,top:footerTop+18});
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:WALL}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
