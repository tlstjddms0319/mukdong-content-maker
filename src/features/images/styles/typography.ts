import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, hashtags } from "./shared";

// 타이포그래피 텍스처(글자 중심): 사진은 흑백으로 아주 흐리게 깔고(없으면 단색), 굵기·크기가 크게 다른 글자가
// 화면의 80%를 채운다. 제목의 핵심 낱말 하나를 아주 크고 굵게, 나머지는 가늘게 써서 글자만으로 맛의 강약을 보여 준다.
const ACCENTS=["#FF5A36","#FFD23F","#7CFFB2","#FF6FB5"];

// 제목을 "핵심 낱말"과 나머지로 나눈다. 키워드가 제목 안에 있으면 그것을, 없으면 가장 긴 어절을 핵심으로 고른다.
function splitHero(headline:string,keywords:string[]):{before:string;hero:string;after:string} {
  const keyword=keywords.find(word=>word&&headline.includes(word));
  const hero=keyword??headline.split(" ").reduce((a,b)=>b.length>a.length?b:a,"");
  const at=headline.indexOf(hero);
  return {before:headline.slice(0,at).trim(),hero,after:headline.slice(at+hero.length).trim()};
}

export const renderTypography:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const accent=ACCENTS[(index-1+(slide.variant??0))%ACCENTS.length];
  const M=64,W=1080-M*2;
  const base=inputs.length
    ?await sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover"}).grayscale().blur(18).modulate({brightness:.42}).png().toBuffer()
    :await sharp({create:{width:1080,height:1350,channels:3,background:"#141414"}}).png().toBuffer();
  const layers:OverlayOptions[]=[];
  const {before,hero,after}=splitHero(content.headline,content.keywords);
  let y=M+20;
  const tag=await textLayer(hashtags(content),{size:28,color:accent,width:W,height:44,font:STYLE_FONTS.sansBold});
  layers.push({input:tag.data,left:M,top:y});
  y+=tag.info.height+40;
  if(before){const layer=await fitText(before,{sizes:[72,62,54],width:W,maxHeight:200,color:"#FFFFFF",font:STYLE_FONTS.gothicLight,spacing:4});layers.push({input:layer.data,left:M,top:y});y+=layer.info.height+10;}
  // 핵심 낱말: 들어가는 가장 큰 크기(최대 260px), 강조색.
  const heroLayer=await fitText(hero,{sizes:[260,230,200,170,150,130,110],width:W,maxHeight:420,color:accent,font:STYLE_FONTS.gothicBlack,spacing:0});
  layers.push({input:heroLayer.data,left:M-6,top:y});
  y+=heroLayer.info.height+10;
  if(after){const layer=await fitText(after,{sizes:[96,84,72,62],width:W,maxHeight:300,color:"#FFFFFF",font:STYLE_FONTS.gothicBlack,spacing:4});layers.push({input:layer.data,left:M,top:y});y+=layer.info.height;}
  // 요점은 아래쪽에 가는 글자로, 왼쪽에 강조색 세로 막대.
  const points=await Promise.all(content.points.slice(0,3).map(point=>textLayer(point,{size:34,color:"#E8E8E8",width:W-40,height:110,font:STYLE_FONTS.gothicLight,spacing:6})));
  const pointsH=points.reduce((sum,point)=>sum+point.info.height+14,0);
  let py=Math.max(y+50,1350-110-pointsH);
  if(points.length)layers.push(svgLayer(`<rect x="${M}" y="${py}" width="8" height="${pointsH-14}" fill="${accent}"/>`));
  for(const point of points){layers.push({input:point.data,left:M+32,top:py});py+=point.info.height+14;}
  const folio=await textLayer(`묵동홍어마을   ${String(index).padStart(2,"0")} / ${String(total).padStart(2,"0")}`,{size:26,color:"#BDBDBD",width:W,height:40,font:STYLE_FONTS.sansSemi});
  layers.push({input:folio.data,left:M,top:1350-70});
  return sharp(base).composite(layers).jpeg({quality:92}).toBuffer();
};
