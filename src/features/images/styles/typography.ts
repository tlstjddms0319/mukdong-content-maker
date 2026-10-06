import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer, brandName } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, hashtags, snap } from "./shared";

// 타이포그래피 텍스처(글자 중심): 사진은 흑백으로 흐리게 깔고(없으면 단색), 굵기·크기가 크게 다른 글자가
// 화면의 80%를 채운다. 제목의 핵심 낱말 하나를 아주 크고 굵게, 나머지는 가늘게 써서 글자만으로 맛의 강약을 보여 준다.
// 제목과 요점 사이 빈 자리에는 핵심 낱말을 아주 크고 옅게 한 번 더 깔아(유령 글자) 포스터처럼 화면을 채운다.
const ACCENTS=["#FF5A36","#FFD23F","#7CFFB2","#FF6FB5"];

// 제목을 "핵심 낱말"과 나머지로 나눈다. 키워드가 제목 안에 있으면 그것을, 없으면 가장 긴 어절을 핵심으로 고른다.
// 키워드가 붙은 어절 전체("홍어와")를 핵심으로 잡아 "홍어 / 와 가오리는"처럼 조사가 떨어져 나가지 않게 한다.
function splitHero(headline:string,keywords:string[]):{before:string;hero:string;after:string} {
  const words=headline.split(" ").filter(Boolean);
  const keyword=keywords.find(word=>word&&headline.includes(word));
  const index=keyword?words.findIndex(word=>word.includes(keyword)):-1;
  const heroIndex=index>=0?index:words.reduce((best,word,i)=>word.length>words[best].length?i:best,0);
  return {before:words.slice(0,heroIndex).join(" "),hero:words[heroIndex]??headline,after:words.slice(heroIndex+1).join(" ")};
}

export const renderTypography:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const accent=ACCENTS[(index-1+(slide.variant??0))%ACCENTS.length];
  const M=64,W=1080-M*2;
  // 사진을 흑백·흐리게 깐 뒤, 사진이 밝을수록 더 어둡게 눌러 평균 밝기를 0.2 안팎으로 맞춘다(흰 접시 사진에서도 글자가 뜨고, 음식 질감은 남게).
  const blurred=inputs.length?await sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover",position:"attention"}).grayscale().blur(12).png().toBuffer():null;
  const brightness=blurred?Math.min(.55,.2/Math.max(.05,(await sharp(blurred).stats()).channels[0].mean/255)):1;
  const base=blurred
    ?await sharp(blurred).modulate({brightness}).png().toBuffer()
    :await sharp({create:{width:1080,height:1350,channels:3,background:"#141414"}}).png().toBuffer();
  const layers:OverlayOptions[]=[];
  const {before,hero,after}=splitHero(content.headline,content.keywords);
  let y=M+20;
  // 해시태그는 사진이 밝아도 읽히도록 글자 둘레를 어둡게(shadow) 깐다.
  const tag=await textLayer(hashtags(content),{size:28,color:accent,width:W,height:44,font:STYLE_FONTS.sansBold,shadow:true});
  layers.push({input:tag.data,left:M,top:y});
  y+=tag.info.height+40;
  // 앞말이 길면 작게 써서 한 낱말만 둘째 줄에 덩그러니 남지 않게 한다.
  if(before){const layer=await fitText(before,{sizes:before.length>14?[56,50,46]:[72,62,54],width:W,maxHeight:200,color:"#FFFFFF",font:STYLE_FONTS.gothicLight,spacing:4});layers.push({input:layer.data,left:M,top:y});y+=layer.info.height+10;}
  // 핵심 낱말: 들어가는 가장 큰 크기(최대 260px), 강조색.
  const heroLayer=await fitText(hero,{sizes:[260,230,200,170,150,130,110],width:W,maxHeight:420,color:accent,font:STYLE_FONTS.gothicBlack,spacing:0});
  layers.push({input:heroLayer.data,left:M-6,top:y});
  y+=heroLayer.info.height+10;
  if(after){const layer=await fitText(after,{sizes:[96,84,72,62],width:W,maxHeight:300,color:"#FFFFFF",font:STYLE_FONTS.gothicBlack,spacing:4});layers.push({input:layer.data,left:M,top:y});y+=layer.info.height;}
  // 요점은 아래쪽에 가는 글자로, 왼쪽에 강조색 세로 막대.
  const points=await Promise.all(content.points.slice(0,3).map(point=>textLayer(point,{size:40,color:"#F2F2F2",width:W-40,height:130,font:STYLE_FONTS.gothicLight,spacing:6})));
  const pointsH=points.reduce((sum,point)=>sum+point.info.height+16,0);
  let py=Math.max(y+50,1350-110-pointsH);
  // 유령 글자: 제목과 요점 사이가 160px 넘게 비면 핵심 낱말을 강조색 14% 농도로 크게 깐다(검수 대상 글자가 아니라 흐려도 된다).
  const gapH=py-y-60;
  // 유령 글자는 한 줄이어야 하므로 글자 수 × 크기가 폭에 들어가는 크기만 고른다(핵심 낱말이 6자를 넘으면 생략).
  const ghostSizes=[420,360,300,260,220,180].filter(size=>size*hero.length<=W+40);
  if(gapH>160&&ghostSizes.length){
    const ghost=await fitText(hero,{sizes:ghostSizes,width:W+40,maxHeight:gapH,color:accent,font:STYLE_FONTS.gothicBlack,spacing:0});
    const faint=await sharp(ghost.data).ensureAlpha().linear([1,1,1,.14],[0,0,0,0]).png().toBuffer();
    layers.push({input:faint,left:M-10,top:y+30+Math.round((gapH-ghost.info.height)/2)});
  }
  if(points.length)layers.push(svgLayer(`<rect x="${M}" y="${py}" width="8" height="${pointsH-16}" fill="${accent}"/>`));
  for(const point of points){layers.push({input:point.data,left:M+32,top:py});py+=point.info.height+16;}
  const folio=await textLayer(`${brandName()}   ${String(index).padStart(2,"0")} / ${String(total).padStart(2,"0")}`,{size:26,color:"#E2E2E2",width:W,height:40,font:STYLE_FONTS.sansSemi});
  layers.push({input:folio.data,left:M,top:1350-70});
  return sharp(base).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
