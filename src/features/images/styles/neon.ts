import sharp, { type OverlayOptions } from "sharp";
import { brandName, croppedPhoto, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, snap } from "./shared";
import { glowText, neonStroke } from "./handDrawn";

// 네온 간판(밤 술집): 어두운 벽돌 벽에 빛나는 네온관 글자. 맨 위 작은 간판("묵동 홍어 · 막걸리"),
// 가운데 네온 테두리를 두른 사진, 아래 요점은 밝은 글자에 네온 점. 퇴근 후 한잔 분위기의 저녁 게시물용.
// 장마다 네온 색(분홍·하늘·호박색)을 돌려 쓴다.
const THEMES=[
  {glow:"#FF3EA5",core:"#FFE9F4",accent:"#38E8FF"},
  {glow:"#38E8FF",core:"#E9FCFF",accent:"#FF3EA5"},
  {glow:"#FFB23E",core:"#FFF5E2",accent:"#9DFF6B"},
] as const;
const WALL="#0E0B13",TEXT="#F2EEF7",DIM="#9C94AE";

// 벽돌 벽 + 가장자리 어둡게 + 바닥에 번진 빛.
function wall(glow:string):string {
  let bricks="";
  for(let row=0;row<1350/46;row++){
    const y=row*46,shift=row%2?60:0;
    bricks+=`<path d="M0 ${y}H1080" stroke="#1C1724" stroke-width="3"/>`;
    for(let x=-shift;x<1080;x+=120)bricks+=`<path d="M${x} ${y}V${y+46}" stroke="#1C1724" stroke-width="3"/>`;
  }
  return `<defs><radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".7"/></radialGradient>`
    +`<radialGradient id="spill" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="${glow}" stop-opacity=".16"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`
    +bricks+`<rect width="1080" height="1350" fill="url(#spill)"/><rect width="1080" height="1350" fill="url(#vig)"/>`;
}
const roundedRect=(x:number,y:number,w:number,h:number,r:number)=>`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;

export const renderNeon:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const theme=THEMES[(index-1+(slide.variant??0))%THEMES.length];
  const layers:OverlayOptions[]=[];
  let deco=wall(theme.glow);
  // 맨 위 작은 간판.
  const sign=await glowText(content.cover?"묵동 홍어 · 막걸리":`${index} / ${total}`,{sizes:[34],width:600,maxHeight:60,font:STYLE_FONTS.round,core:"#FFFFFF",glow:theme.accent,align:"centre"});
  const signW=sign.info.width-sign.pad*2+64,signX=Math.round((1080-signW)/2),signY=48;
  deco+=neonStroke(roundedRect(signX,signY,signW,70,35),theme.accent,4);
  layers.push({input:sign.data,left:Math.round(540-sign.info.width/2),top:Math.round(signY+35-sign.info.height/2)});
  let y=signY+70+40;
  // 제목: 네온관 글자.
  const shots=inputs.slice(0,2);
  const title=await glowText(content.headline,{sizes:content.cover?[96,86,76,66]:shots.length?[74,66,58,52]:[96,84,74,64],width:900,maxHeight:content.cover?330:shots.length?230:360,font:STYLE_FONTS.round,core:theme.core,glow:theme.glow,align:"centre",spacing:12});
  const titleH=title.info.height-title.pad*2;
  const footerTop=1350-70;
  const points=content.points.slice(0,shots.length?3:4);
  const pointLayers=await Promise.all(points.map(point=>textLayer(point,{size:shots.length?36:44,color:TEXT,width:800,height:140,font:STYLE_FONTS.sansSemi,spacing:8})));
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.info.height+22,0);
  // 글자 장: 제목과 요점 상자를 한 덩어리로 세로 가운데에 둔다.
  if(!shots.length)y=Math.max(y,Math.round((y+footerTop-(titleH+70+pointsH+40))/2));
  layers.push({input:title.data,left:Math.round(540-title.info.width/2),top:y-title.pad});
  y+=titleH+(shots.length?44:70);
  if(shots.length){
    // 사진: 네온 테두리를 두른 액자. 두 장이면 나란히.
    const room=footerTop-y-(pointsH?pointsH+40:0)-30;
    const PH=Math.round(Math.max(300,Math.min(760,room)));
    const PW=shots.length>1?430:Math.min(860,Math.round(PH*1.3));
    const gap=40,rowW=shots.length*PW+(shots.length-1)*gap;
    for(const [i,shot] of shots.entries()){
      const x=Math.round((1080-rowW)/2)+i*(PW+gap);
      const photo=await sharp(await croppedPhoto(shot,PW,PH,22)).modulate({brightness:.95,saturation:1.08}).png().toBuffer();
      layers.push({input:photo,left:x,top:y});
      deco+=neonStroke(roundedRect(x-10,y-10,PW+20,PH+20,30),i?theme.accent:theme.glow,5);
    }
    y+=PH+50;
  }
  // 요점: 네온 점 + 밝은 글자. 사진이 없으면 네온 테두리 상자 안에.
  if(pointLayers.length){
    const boxed=!shots.length;
    let py=boxed?y+10:Math.max(y,footerTop-pointsH-20);
    if(boxed){deco+=neonStroke(roundedRect(90,py-30,900,pointsH+40,28),theme.accent,4);}
    for(const layer of pointLayers){
      deco+=`<circle cx="${boxed?140:150}" cy="${py+24}" r="9" fill="${theme.glow}"/><circle cx="${boxed?140:150}" cy="${py+24}" r="18" fill="${theme.glow}" opacity=".25"/>`;
      layers.push({input:layer.data,left:boxed?170:180,top:py});
      py+=layer.info.height+22;
    }
  }
  const footer=await fitText(`${brandName()}  ·  ${index}/${total}`,{sizes:[26,23,20],width:900,maxHeight:40,color:DIM,font:STYLE_FONTS.sansSemi,align:"centre"});
  layers.push({input:footer.data,left:Math.round((1080-footer.info.width)/2),top:footerTop+18});
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:WALL}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
