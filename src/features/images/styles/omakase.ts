import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, softShadow, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText } from "./shared";

// 오마카세·하이엔드 미니멀: 따뜻한 베이지(또는 흰) 바탕에 여백을 크게 두고, 가운데에 작고 정갈한 사진 한 장.
// 가는 명조로 제목을 시 한 구절처럼, 요점은 짧은 줄로 가운데 정렬. 장식은 가는 세로선과 장 번호 "— 03 —"뿐.
const SURFACES=[{bg:"#F4EFE6",ink:"#2B2622",dim:"#6B6258",line:"#B9AE9F"},{bg:"#FBFAF7",ink:"#1F1F1D",dim:"#66635D",line:"#C9C5BC"},{bg:"#1E1C1A",ink:"#EFE9DF",dim:"#A39B8F",line:"#5A544C"}] as const;

export const renderOmakase:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  // 표지와 마지막 장은 어두운 바탕으로 무게를 준다.
  const surface=content.cover||content.last?SURFACES[2]:SURFACES[(slide.variant??0)%2];
  const layers:OverlayOptions[]=[];
  let y=110;
  const eyebrow=await textLayer("M U K D O N G   H O N G E O",{size:24,color:surface.dim,width:900,height:40,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:eyebrow.data,left:Math.round((1080-eyebrow.info.width)/2),top:y});
  y+=eyebrow.info.height+30;
  let lines=`<path d="M540 ${y}V${y+60}" stroke="${surface.line}" stroke-width="1.5"/>`;
  y+=100;
  if(inputs.length){
    // 사진은 작게(가로 460) 가운데. 얇은 테두리와 아주 옅은 그림자.
    const PW=460,PH=content.cover?600:540;
    layers.push(svgLayer(softShadow({x:540-PW/2,y:y+12,width:PW,height:PH,rx:2,blur:24,opacity:.12})));
    layers.push({input:await croppedPhoto(inputs[0],PW,PH,0),left:540-PW/2,top:y});
    lines+=`<rect x="${540-PW/2-14}" y="${y-14}" width="${PW+28}" height="${PH+28}" fill="none" stroke="${surface.line}" stroke-width="1"/>`;
    y+=PH+70;
  }else{
    y+=80;
  }
  const headline=await fitText(content.headline,{sizes:content.cover?[52,46,42]:inputs.length?[44,40,36]:[60,52,46],width:820,maxHeight:inputs.length?200:340,color:surface.ink,font:STYLE_FONTS.serif,align:"centre",spacing:18});
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:y});
  y+=headline.info.height+40;
  lines+=`<path d="M510 ${y}H570" stroke="${surface.line}" stroke-width="1.5"/>`;
  y+=40;
  for(const point of content.points.slice(0,inputs.length?2:4)){
    const line=await textLayer(point,{size:34,color:surface.dim,width:820,height:110,font:STYLE_FONTS.serif,align:"centre",spacing:10});
    if(y+line.info.height>1350-150)break;
    layers.push({input:line.data,left:Math.round((1080-line.info.width)/2),top:y});
    y+=line.info.height+22;
  }
  const folio=await textLayer(`—  ${String(index).padStart(2,"0")}  —`,{size:26,color:surface.dim,width:300,height:40,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:1350-100});
  layers.unshift(svgLayer(lines));
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(layers).jpeg({quality:94}).toBuffer();
};
