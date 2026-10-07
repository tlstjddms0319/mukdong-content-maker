import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer, type Layer, brandName } from "../render/primitives";
import { registerDecor, registerPhoto } from "../render/audit";
import { STORE_NAME } from "../slideLayout";
import { MIN_STROKE, STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, hashtags, nextCue, snap } from "./shared";

// 타이포그래피 텍스처(글자 중심): 사진은 흑백으로 흐리게 깔고(없으면 단색), 굵기·크기가 크게 다른 글자가
// 화면의 80%를 채운다. 제목의 핵심 낱말 하나를 아주 크고 굵게, 나머지는 가늘게 써서 글자만으로 맛의 강약을 보여 준다.
// 제목과 요점 사이 빈 자리에는 핵심 낱말을 아주 크고 옅게 한 번 더 깔아(유령 글자) 포스터처럼 화면을 채운다.
const ACCENTS=["#FF5A36","#FFD23F","#7CFFB2","#FF6FB5"];
// 마지막 장 "저장" 칩 바탕: 강조색은 흰 글자와 대비가 모자라(노랑·민트는 1.5:1 안팎) 흰 글자가 읽히는 진한 주홍 하나로 둔다.
const CHIP="#C23A1C";

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
  // 흑백·흐림이어도 이 바탕은 화면 전체에 깐 실제 음식 사진이다(접시·그릇 윤곽이 보인다). 그래서 캔버스 밑바탕 버퍼를
  // bleed 사진으로 등록한다 — 등록하지 않으면 표지 사진 면적이 0%, 사진 뒤 모든 자리가 "빈 띠"로 잘못 잡힌다.
  // 사진이 없는 장(단색 바탕)은 등록하지 않는다(바탕 단색·안개는 사진이 아니다).
  // 사진을 흑백·흐리게 깐 뒤, 사진이 밝을수록 더 어둡게 눌러 평균 밝기를 0.2 안팎으로 맞춘다(흰 접시 사진에서도 글자가 뜨고, 음식 질감은 남게).
  const blurred=inputs.length?await sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover",position:"attention"}).grayscale().blur(12).png().toBuffer():null;
  const brightness=blurred?Math.min(.55,.2/Math.max(.05,(await sharp(blurred).stats()).channels[0].mean/255)):1;
  const base=blurred
    ?await sharp(blurred).modulate({brightness}).png().toBuffer()
    :await sharp({create:{width:1080,height:1350,channels:3,background:"#141414"}}).png().toBuffer();
  if(blurred)registerPhoto(base,{shape:"bleed"});
  const layers:OverlayOptions[]=[];
  // 사진 없는 장: 단색 #141414만으로는 납작해 보여, 강조색 안개(옅은 원형 그라데이션)를 오른쪽 위와 왼쪽 아래에 깐다.
  // 글자보다 먼저(맨 아래) 깔고 진하기를 .16 이하로 둬 흰 글자 대비를 거의 건드리지 않는다. 질감은 넣지 않는다(글자가 질감).
  if(!blurred)layers.push(svgLayer(`<defs><radialGradient id="fogA"><stop offset="0" stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`
    +`<radialGradient id="fogB"><stop offset="0" stop-color="${accent}" stop-opacity=".09"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>`
    +`<ellipse cx="900" cy="300" rx="620" ry="560" fill="url(#fogA)"/><ellipse cx="120" cy="1150" rx="520" ry="440" fill="url(#fogB)"/>`));
  const {before,hero,after}=splitHero(content.headline,content.keywords);
  // 핵심 낱말은 이미 강조색 덩어리다. 앞말·뒷말에 남은 다른 키워드(예: "막걸리")도 같은 강조색으로 이어 준다.
  const emphasis=emphasisOf(content,accent);
  // 마지막 장 명함은 요점 아래에 두므로 높이를 먼저 잡고, 핵심 낱말 크기 상한을 낮춰 자리를 만든다(요점을 버리지 않게).
  const closing=content.last?await closingBlock({width:W,color:"#FFFFFF",accent:CHIP,font:STYLE_FONTS.gothicBlack}):null;
  let y=M+20;
  // 해시태그는 사진이 밝아도 읽히도록 글자 둘레를 어둡게(shadow) 깐다.
  const tag=await textLayer(hashtags(content),{size:28,color:accent,width:W,height:44,font:STYLE_FONTS.sansBold,shadow:true});
  layers.push({input:tag.data,left:M,top:y});
  y+=tag.info.height+40;
  // 앞말이 길면 작게 써서 한 낱말만 둘째 줄에 덩그러니 남지 않게 한다.
  if(before){const layer=await fitText(before,{sizes:before.length>14?[56,50,46]:[72,62,54],width:W,maxHeight:200,color:"#FFFFFF",font:STYLE_FONTS.gothicLight,spacing:4,emphasis});layers.push({input:layer.data,left:M,top:y});y+=layer.info.height+10;}
  // 핵심 낱말: 들어가는 가장 큰 크기(최대 260px, 마지막 장은 200px), 강조색.
  const heroSizes=[260,230,200,170,150,130,110].filter(size=>!closing||size<=200);
  const heroLayer=await fitText(hero,{sizes:heroSizes,width:W,maxHeight:closing?300:420,color:accent,font:STYLE_FONTS.gothicBlack,spacing:0});
  layers.push({input:heroLayer.data,left:M-6,top:y});
  y+=heroLayer.info.height+10;
  if(after){const layer=await fitText(after,{sizes:[96,84,72,62],width:W,maxHeight:closing?200:300,color:"#FFFFFF",font:STYLE_FONTS.gothicBlack,spacing:4,emphasis});layers.push({input:layer.data,left:M,top:y});y+=layer.info.height;}
  // 표지 부제: 제목 덩어리 바로 아래 한 줄(가는 글자 사이에서 읽히도록 중간 굵기).
  if(content.subline){
    const sub=await textLayer(content.subline,{size:36,color:"#F2F2F2",width:W,height:120,font:STYLE_FONTS.sansSemi,shadow:true});
    y+=22;layers.push({input:sub.data,left:M-10,top:y-10});y+=sub.info.height-20;
  }
  // 요점은 아래쪽에 가는 글자로, 왼쪽에 강조색 세로 막대. 표지는 요점 대신 예고 글을 같은 자리에 작게 둔다.
  // 마지막 장은 요점 + 명함이 제목 아래에 들어갈 때까지 요점 글자를 줄인다(40 → 36 → 32).
  const reserve=closing?closing.height+40:0;
  const pointsAt=(size:number)=>Promise.all(content.points.slice(0,3).map(point=>textLayer(point,{size,color:"#F2F2F2",width:W-40,height:130,font:STYLE_FONTS.gothicLight,spacing:6})));
  const heightOf=(list:Layer[])=>list.reduce((sum,point)=>sum+point.info.height+16,0);
  let points=await pointsAt(40),pointSize=40;
  for(const size of [36,32]){if(!closing||y+50+heightOf(points)+reserve<=1350-110)break;points=await pointsAt(size);pointSize=size;}
  if(content.teaser){points=[await textLayer(content.teaser,{size:27,color:"#F2F2F2",width:W-40,height:60,font:STYLE_FONTS.sansSemi,shadow:true})];pointSize=27;}
  const pointsH=heightOf(points);
  let py=Math.max(y+50,1350-110-pointsH-reserve);
  // 유령 글자: 제목과 요점 사이가 160px 넘게 비면 핵심 낱말을 강조색 17% 농도로 크게 깐다(검수 대상 글자가 아니라 흐려도 된다).
  const gapH=py-y-60;
  // 유령 글자는 한 줄이어야 하므로 글자 수 × 크기가 폭에 들어가는 크기만 고른다(핵심 낱말이 6자를 넘으면 생략).
  const ghostSizes=[420,360,300,260,220,180].filter(size=>size*hero.length<=W+40);
  if(gapH>160&&ghostSizes.length){
    const ghost=await fitText(hero,{sizes:ghostSizes,width:W+40,maxHeight:gapH,color:accent,font:STYLE_FONTS.gothicBlack,spacing:0});
    const faint=await sharp(ghost.data).ensureAlpha().linear([1,1,1,.17],[0,0,0,0]).png().toBuffer();
    // 유령 글자는 일부러 크게 깐 장식이라 빈 띠 계산에서 "찬 자리"로 친다(옅어도 눈에는 큰 글자 덩어리로 보인다).
    // 농도를 .14에서 .17로 올린 이유: 검수는 알파 40(16%) 이하를 "빈 것"으로 보는데, .14면 실제로 보이는 유령 글자가 빈 자리로 잡혔다.
    registerDecor(faint,"ornament");
    layers.push({input:faint,left:M-10,top:y+30+Math.round((gapH-ghost.info.height)/2)});
  }
  // 세로 막대 위, 첫 요점의 첫 줄 높이에 강조색 점 하나: 막대가 "목록의 시작"을 가리키는 표지가 된다.
  if(points.length){
    const firstLine=Math.min(points[0].info.height,Math.round(pointSize*1.5));
    layers.push(svgLayer(`<rect x="${M}" y="${py}" width="8" height="${pointsH-16}" fill="${accent}"/><circle cx="${M+4}" cy="${py+Math.round(firstLine/2)}" r="10" fill="${accent}"/>`));
  }
  for(const point of points){layers.push({input:point.data,left:M+32,top:py});py+=point.info.height+16;}
  if(closing){
    // 명함: 포스터 문법대로 왼쪽 정렬. 가게 이름 위에 강조색 굵은 줄 하나.
    let cy=py+40;
    layers.push(svgLayer(`<rect x="${M}" y="${cy-18}" width="64" height="${Math.max(MIN_STROKE,6)}" fill="${accent}"/>`));
    layers.push({input:closing.wordmark.data,left:M,top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:M,top:cy});cy+=closing.handle.info.height;}
    cy+=30;
    layers.push(svgLayer(closing.chipSvg(M+26,cy)));
    layers.push({input:closing.chip.data,left:M+26,top:cy});
  }
  // 바닥글: 가게 이름과 장 번호(26px, 숫자 폭 고정). 마지막 장은 명함에 계정이 있으므로 이름만.
  const folio=await textLayer(`${content.last?STORE_NAME:brandName()}   ${String(index).padStart(2,"0")} / ${String(total).padStart(2,"0")}`,{size:26,color:"#E2E2E2",width:W,height:40,font:STYLE_FONTS.sansSemi,features:"tnum"});
  layers.push({input:folio.data,left:M,top:1350-70});
  if(!content.cover&&!content.last){
    // 넘겨 보기: 바닥글 줄 오른쪽 끝. 긴 계정과 부딪히면 한 줄 위로 올린다.
    const cue=await nextCue(accent,26);
    const cx=1080-M-cue.width,clash=M+folio.info.width+28>cx;
    const cy=clash?1350-70-cue.height-14:1350-70+Math.round((folio.info.height-cue.height)/2);
    layers.push({input:cue.label.data,left:cx,top:cy},svgLayer(cue.arrow(cx,cy)));
  }
  return sharp(base).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
