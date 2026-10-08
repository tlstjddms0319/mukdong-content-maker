import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, finishPhoto, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { shadowLayer, textureLayer } from "../decor";
import { contentOf, emphasisOf, snap, type StyleContent } from "./shared";
import { MARGIN, ON_PHOTO, SANS, SHADE, TITLE_SERIF, TRACK_SURFACES, fitLines, folioMark, footerRow, logoMark, shortLines, storeCardBlock } from "./trackKit";
import { renderTextFocus } from "./textFocus";

// 사진 중심(갈래 "사진"). 사진을 그냥 붙이지 않고 한 가지 고급 모양으로 다듬는다.
//   표지      : 사진을 화면 가득(블리드) 깔고 아래로 짙어지는 밤색 그라데이션 위에 큰 명조 제목(최대 두 줄)과 부제, 왼쪽 위 원형 로고.
//   본문 장   : 두 가지 구도를 장 번호로 번갈아 쓴다(이어지는 두 장이 같은 모양이 되지 않게).
//               짝수 장 = "액자": 크림 종이 위에 넓은 여백을 두고 모서리가 둥근 큰 사진, 아래에 장 번호·한 줄 제목·짧은 글 한 줄.
//               홀수 장 = "꽉 찬 사진": 표지처럼 사진을 가득 깔고 아래 그라데이션 위에 흰 글자.
//   마지막 장 : 액자 구도의 사진(조금 작게) + 가게 명함(원형 로고·가게 이름·계정·"저장해 두고 다시 보세요").
// 글은 제목 한 줄 + 짧은 글 한 줄까지만 쓴다(구성안이 그 길이로 쓰고, 길면 여기서 한 줄만 보인다).
// 표지 명조(함렛)는 음식 잡지 같은 격을, 짧은 글은 프리텐다드로 폰에서 또렷하게 읽히게 한다.
const PAPER=TRACK_SURFACES.cream;

// 차가운 사진만 살짝 데운다. 이미 따뜻한(R−B 평균 차 45 초과) 사진에 또 온기를 얹으면 홍어 살이 주황으로 떠서 그대로 둔다.
// 보정(photoEnhance)은 그리기 전에 이미 끝났으므로 여기서는 색 온도만 아주 조금(정갈한 한 상과 같은 기준).
async function warmed(photo:Buffer):Promise<Buffer> {
  const stats=await sharp(photo).stats();
  if(stats.channels[0].mean-stats.channels[2].mean>45)return photo;
  const out=await sharp(photo).linear([1.03,1,.95],[4,1,-2]).png().toBuffer();
  registerPhoto(out);
  return out;
}

// 사진 위 그라데이션: 위쪽 띠(로고·장 번호용)와 아래에서 from까지 짙어지는 띠, 가장자리를 살짝 누르는 비네트.
// 비네트는 음식이 있는 가운데로 눈이 가게 하고, 아래 띠는 흰 글자가 밝은 사진 위에서도 읽히게 한다(약 4.5:1 이상).
function photoShade(from:number,options:{top?:boolean}={}):string {
  const span=1350-from;
  const stop=(at:number)=>Math.max(0,Math.min(1,(at-from)/span)).toFixed(3);
  return `<defs><linearGradient id="pfB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity="0"/><stop offset="${stop(from+span*.32)}" stop-color="${SHADE}" stop-opacity=".55"/><stop offset="${stop(from+span*.6)}" stop-color="${SHADE}" stop-opacity=".8"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".9"/></linearGradient>`
    +`<linearGradient id="pfT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity=".5"/><stop offset="1" stop-color="${SHADE}" stop-opacity="0"/></linearGradient>`
    +`<radialGradient id="pfV" cx="50%" cy="45%" r="75%"><stop offset=".62" stop-color="${SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".28"/></radialGradient></defs>`
    +`<rect width="1080" height="1350" fill="url(#pfV)"/>`+(options.top===false?"":`<rect width="1080" height="230" fill="url(#pfT)"/>`)
    +`<rect x="0" y="${from}" width="1080" height="${span}" fill="url(#pfB)"/>`;
}

// 제목: 함렛 명조. 본문은 한 줄이 원칙(68→52px 중 한 줄에 드는 가장 큰 크기), 정 안 되면 두 줄.
const bodyTitle=(content:StyleContent,color:string,accent:string,width=1080-MARGIN*2)=>fitLines(content.headline,{sizes:[68,64,60,56,52],width,font:TITLE_SERIF,color,maxLines:2,prefer:"lines",spacing:size=>Math.round(size*.06),letterSpacing:size=>-size*.01,emphasis:emphasisOf(content,accent)});
// 짧은 글 한 줄: 프리텐다드 40px(두 줄까지 허용, 넘치면 검수가 잡는다).
const sublineOf=(text:string,color:string,shadow=false)=>textLayer(text,{size:40,color,width:1080-MARGIN*2,height:4000,font:SANS,spacing:10,shadow});

// ── 표지 ──────────────────────────────────────────────────────────────────────────────
async function cover(photo:Buffer,content:StyleContent):Promise<Buffer> {
  const base=await warmed(await finishPhoto(photo,1080,1350,{zoom:1.04}));
  const foot=await footerRow({color:ON_PHOTO.ink,ring:PAPER.ring,cue:!content.last,shadow:true});
  const footTop=1350-MARGIN-foot.height;
  // 표지 제목: 두 줄까지 가장 큰 크기(104→76px). 아주 긴 제목은 76px로 세 줄이 될 수 있다(구성안이 24자 이내로 막는다).
  // 줄 간격은 좁게(크기의 4%): 함렛은 글꼴 자체의 줄 높이가 커서 기본 간격이면 두 줄이 떨어져 보인다.
  const title=await fitLines(content.headline,{sizes:[104,96,88,82,76],width:1080-MARGIN*2,font:TITLE_SERIF,color:ON_PHOTO.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.04),letterSpacing:size=>-size*.015,emphasis:emphasisOf(content,ON_PHOTO.accent)});
  const sub=content.subline?await sublineOf(content.subline,ON_PHOTO.dim):null;
  const SUB_GAP=26,FOOT_GAP=64,RULE=36;
  const subTop=footTop-FOOT_GAP-(sub?.info.height??0);
  const titleTop=(sub?subTop-SUB_GAP:footTop-FOOT_GAP)-title.layer.info.height;
  const ruleY=titleTop-RULE;
  const LOGO=128;
  const logo=await logoMark(LOGO,PAPER.ring);
  const placed=foot.place(footTop);
  const layers:OverlayOptions[]=[
    {input:base,left:0,top:0},
    svgLayer(photoShade(Math.max(300,ruleY-260))+`<path d="M${MARGIN} ${ruleY}H${MARGIN+64}" stroke="${ON_PHOTO.accent}" stroke-width="4" stroke-linecap="round"/>`+placed.svg),
    {input:logo,left:MARGIN,top:MARGIN},
    {input:title.layer.data,left:MARGIN,top:titleTop},
    ...(sub?[{input:sub.data,left:MARGIN,top:subTop}]:[]),
    ...placed.layers,
  ];
  return sharp({create:{width:1080,height:1350,channels:3,background:SHADE}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

// ── 꽉 찬 사진(홀수 본문 장) ───────────────────────────────────────────────────────────────
async function bleed(photo:Buffer,content:StyleContent,index:number):Promise<Buffer> {
  const base=await warmed(await finishPhoto(photo,1080,1350));
  const foot=await footerRow({color:ON_PHOTO.ink,ring:PAPER.ring,cue:!content.last,shadow:true});
  const footTop=1350-MARGIN-foot.height;
  const title=await bodyTitle(content,ON_PHOTO.ink,ON_PHOTO.accent);
  const line=shortLines(content,1)[0];
  const sub=line?await sublineOf(line,ON_PHOTO.dim):null;
  const subTop=footTop-56-(sub?.info.height??0);
  const titleTop=(sub?subTop-22:footTop-56)-title.layer.info.height;
  const folio=await folioMark(index,ON_PHOTO.ink,{shadow:true});
  const folioTop=titleTop-34-folio.layer.info.height;
  const placed=foot.place(footTop);
  const layers:OverlayOptions[]=[
    {input:base,left:0,top:0},
    svgLayer(photoShade(Math.max(420,folioTop-200),{top:false})+folio.svg(MARGIN,folioTop)+placed.svg),
    {input:folio.layer.data,left:MARGIN,top:folioTop},
    {input:title.layer.data,left:MARGIN,top:titleTop},
    ...(sub?[{input:sub.data,left:MARGIN,top:subTop}]:[]),
    ...placed.layers,
  ];
  return sharp({create:{width:1080,height:1350,channels:3,background:SHADE}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

// ── 액자(짝수 본문 장·마지막 장) ──────────────────────────────────────────────────────────
// 크림 종이에 리넨 결을 옅게 깔고, 위쪽에 둥근 모서리(28px) 큰 사진과 부드러운 그림자. 사진 높이는 아래 글이 차지하고 남는 높이.
// 마지막 장은 사진 아래 글 + 명함 판(한 톤 짙은 크림 위에 로고·가게 이름·계정·저장 알약)을 둔다.
async function framed(photo:Buffer,content:StyleContent,index:number):Promise<Buffer> {
  const X=64,TOP=64,W=1080-X*2,R=28;
  const title=await bodyTitle(content,PAPER.ink,PAPER.accent);
  const line=shortLines(content,1)[0];
  const sub=line?await sublineOf(line,PAPER.dim):null;
  const folio=await folioMark(index,PAPER.accent);
  const card=content.last?await storeCardBlock({logoSize:120,wordmark:true,surface:PAPER}):null;
  const foot=card?null:await footerRow({color:PAPER.dim,cueColor:PAPER.ink,cue:true});
  // 아래에서 위로 쌓는다: 바닥글(또는 명함 판) → 짧은 글 → 제목 → 장 번호 → 사진.
  const CARD_PAD=40;
  const bottomBlockH=card?card.height+CARD_PAD*2:foot!.height;
  const bottomTop=1350-(card?48:MARGIN)-bottomBlockH;
  const subTop=bottomTop-(card?44:60)-(sub?.info.height??0);
  const titleTop=(sub?subTop-20:bottomTop-(card?44:60))-title.layer.info.height;
  const folioTop=titleTop-26-folio.layer.info.height;
  const photoH=Math.max(420,folioTop-44-TOP);
  const shot=await warmed(await croppedPhoto(photo,W,photoH,R,{zoom:1.03}));
  const shadow=await shadowLayer({x:X,y:TOP+14,width:W,height:photoH,rx:R,blur:26,opacity:.2});
  const layers:OverlayOptions[]=[];
  const paper=await textureLayer("linen",{opacity:.22});
  if(paper)layers.push(paper);
  layers.push(shadow,{input:shot,left:X,top:TOP});
  let markup=folio.svg(MARGIN,folioTop);
  layers.push({input:folio.layer.data,left:MARGIN,top:folioTop},{input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  if(card){
    // 명함 판: 종이보다 한 톤 짙은 크림의 둥근 판. 판 안 가운데에 명함을 세운다.
    markup+=`<rect x="${X}" y="${bottomTop}" width="${W}" height="${bottomBlockH}" rx="24" fill="${PAPER.soft}"/>`;
    const placed=card.place(540,bottomTop+CARD_PAD);
    markup+=placed.svg;
    layers.push(svgLayer(markup),...placed.layers);
  }else{
    const placed=foot!.place(bottomTop);
    layers.push(svgLayer(markup+placed.svg),...placed.layers);
  }
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER.bg}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

export const renderPhotoFocus:CardRenderer=async(inputs,slide,index,total,palette)=>{
  // 사진이 없는 장(예전 초안을 다시 그릴 때 등)은 같은 가게 색의 글 중심 모양으로 그린다.
  if(!inputs.length)return renderTextFocus(inputs,slide,index,total,palette);
  const content=contentOf(slide,inputs,index,total);
  if(content.cover)return cover(inputs[0],content);
  if(content.last||index%2===0)return framed(inputs[0],content,index);
  return bleed(inputs[0],content,index);
};

// 검수·테스트에서 구도를 확인할 때 쓰는 이름(장 번호 → 구도).
export const photoFocusComposition=(index:number,total:number):"cover"|"framed"|"bleed"=>index===1?"cover":index===total||index%2===0?"framed":"bleed";
