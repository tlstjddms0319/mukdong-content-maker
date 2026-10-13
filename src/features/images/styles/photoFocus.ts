import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, finishPhoto, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { shadowLayer, textureLayer } from "../decor";
import { contentOf, emphasisOf, snap, type StyleContent } from "./shared";
import { MARGIN, ON_PHOTO, SANS, SANS_SEMI, SAVE_CHIP, SHADE, TITLE_SERIF, TRACK_SURFACES, type TrackSurface, fitLines, folioMark, footerRow, logoMark, shortLines } from "./trackKit";
import { trackLookOf } from "./trackLooks";
import { renderTextFocus } from "./textFocus";
import { renderPhotoLook } from "./photoLooks";
import { quietSide } from "./textSide";

// 사진 중심(갈래 "사진"). 사진을 그냥 붙이지 않고 한 가지 고급 모양으로 다듬는다.
//   표지      : 사진을 화면 가득(블리드) 깔고 아래로 짙어지는 밤색 그라데이션 위에 큰 명조 제목(최대 두 줄)과 부제, 왼쪽 위 원형 로고.
//   본문 장   : 두 가지 구도를 장 번호로 번갈아 쓴다(이어지는 두 장이 같은 모양이 되지 않게).
//               짝수 장 = "액자": 크림 종이 위에 넓은 여백을 두고 모서리가 둥근 큰 사진, 아래에 장 번호·한 줄 제목·짧은 글 한 줄.
//               홀수 장 = "꽉 찬 사진": 표지처럼 사진을 가득 깔고 아래 그라데이션 위에 흰 글자.
//   마지막 장 : 꽉 찬 사진 + 제목 위 "저장해 두고 다시 보세요" 알약 + 바닥글(로고·가게 이름·계정).
// 꽉 찬 사진 장(표지·홀수 본문·마지막)은 사진 위쪽이 뚜렷이 단순하면 제목을 위로 올린다(textSide.ts, 장마다 따로 고른다).
// 사진이 주인공: 어느 장이든 사진이 화면의 65% 이상(보고서 "사진 중심 한식 카드뉴스 재분석", 2026-10-12). 예전에는 액자 장 61%, 마지막 장 40%였다.
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

// 제목을 위에 둘 때(사진 위쪽이 단순할 때, textSide.ts): 위에서 to까지 옅어지는 그늘 + 바닥글이 읽히게 아래 260px 옅은 그늘 + 비네트.
function topTextShade(to:number):string {
  return `<defs><linearGradient id="ptT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity=".88"/><stop offset="${((to-220)/to).toFixed(3)}" stop-color="${SHADE}" stop-opacity=".72"/><stop offset="1" stop-color="${SHADE}" stop-opacity="0"/></linearGradient>`
    +`<linearGradient id="ptB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".72"/></linearGradient>`
    +`<radialGradient id="pfV" cx="50%" cy="55%" r="75%"><stop offset=".62" stop-color="${SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".28"/></radialGradient></defs>`
    +`<rect width="1080" height="1350" fill="url(#pfV)"/><rect x="0" y="0" width="1080" height="${to}" fill="url(#ptT)"/><rect x="0" y="1090" width="1080" height="260" fill="url(#ptB)"/>`;
}

// 제목: 함렛 명조. 본문은 한 줄이 원칙(68→52px 중 한 줄에 드는 가장 큰 크기), 정 안 되면 두 줄.
const bodyTitle=(content:StyleContent,color:string,accent:string,width=1080-MARGIN*2)=>fitLines(content.headline,{sizes:[68,64,60,56,52],width,font:TITLE_SERIF,color,maxLines:2,prefer:"lines",spacing:size=>Math.round(size*.06),letterSpacing:size=>-size*.01,emphasis:emphasisOf(content,accent)});
// 짧은 글 한 줄: 프리텐다드 40px(두 줄까지 허용, 넘치면 검수가 잡는다).
const sublineOf=(text:string,color:string,shadow=false,size=40)=>textLayer(text,{size,color,width:1080-MARGIN*2,height:4000,font:SANS,spacing:10,shadow});

// ── 표지 ──────────────────────────────────────────────────────────────────────────────
async function cover(photo:Buffer,content:StyleContent):Promise<Buffer> {
  const base=await warmed(await finishPhoto(photo,1080,1350,{zoom:1.04}));
  const foot=await footerRow({color:ON_PHOTO.ink,ring:PAPER.ring,cue:!content.last,shadow:true});
  const footTop=1350-MARGIN-foot.height;
  // 표지 제목: 두 줄까지 가장 큰 크기(104→76px). 아주 긴 제목은 76px로 세 줄이 될 수 있다(구성안이 24자 이내로 막는다).
  // 줄 간격은 좁게(크기의 4%): 함렛은 글꼴 자체의 줄 높이가 커서 기본 간격이면 두 줄이 떨어져 보인다.
  const title=await fitLines(content.headline,{sizes:[104,96,88,82,76],width:1080-MARGIN*2,font:TITLE_SERIF,color:ON_PHOTO.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.04),letterSpacing:size=>-size*.015,emphasis:emphasisOf(content,ON_PHOTO.accent)});
  // 표지 부제는 피드에서도 읽히게 본문 짧은 글(40px)보다 크게(일반 사용자 비판 C1).
  const sub=content.subline?await sublineOf(content.subline,ON_PHOTO.dim,false,46):null;
  const SUB_GAP=26,FOOT_GAP=64,RULE=36;
  const LOGO=128;
  // 사진 위쪽이 뚜렷이 단순하면(음식이 아래) 제목 덩어리를 로고 아래로 올린다. 아니면 기존처럼 바닥글 위.
  const top=await quietSide(base)==="top";
  let ruleY:number,titleTop:number,subTop:number;
  if(top){
    ruleY=MARGIN+LOGO+48;titleTop=ruleY+RULE;subTop=titleTop+title.layer.info.height+SUB_GAP;
  }else{
    subTop=footTop-FOOT_GAP-(sub?.info.height??0);
    titleTop=(sub?subTop-SUB_GAP:footTop-FOOT_GAP)-title.layer.info.height;
    ruleY=titleTop-RULE;
  }
  const blockBottom=sub?subTop+sub.info.height:titleTop+title.layer.info.height;
  const logo=await logoMark(LOGO,PAPER.ring);
  const placed=foot.place(footTop);
  const layers:OverlayOptions[]=[
    {input:base,left:0,top:0},
    svgLayer((top?topTextShade(blockBottom+220):photoShade(Math.max(300,ruleY-260)))+`<path d="M${MARGIN} ${ruleY}H${MARGIN+64}" stroke="${ON_PHOTO.accent}" stroke-width="4" stroke-linecap="round"/>`+placed.svg),
    {input:logo,left:MARGIN,top:MARGIN},
    {input:title.layer.data,left:MARGIN,top:titleTop},
    ...(sub?[{input:sub.data,left:MARGIN,top:subTop}]:[]),
    ...placed.layers,
  ];
  return sharp({create:{width:1080,height:1350,channels:3,background:SHADE}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

// ── 꽉 찬 사진(홀수 본문 장·마지막 장) ─────────────────────────────────────────────────────
// 마지막 장은 장 번호 자리에 "저장해 두고 다시 보세요" 알약을 두고, 바닥글(로고·가게 이름·계정)이 가게 명함 몫을 한다.
async function bleed(photo:Buffer,content:StyleContent,index:number):Promise<Buffer> {
  const base=await warmed(await finishPhoto(photo,1080,1350));
  const foot=await footerRow({color:ON_PHOTO.ink,ring:PAPER.ring,cue:!content.last,shadow:true});
  const footTop=1350-MARGIN-foot.height;
  const title=await bodyTitle(content,ON_PHOTO.ink,ON_PHOTO.accent);
  const line=shortLines(content,1)[0];
  const sub=line?await sublineOf(line,ON_PHOTO.dim):null;
  const placed=foot.place(footTop);
  // 장 번호(마지막 장은 저장 알약) 판: 높이를 먼저 알아야 위·아래 어느 쪽에 쌓든 자리를 잡는다.
  const chip=content.last?await textLayer(SAVE_CHIP,{size:40,color:PAPER.ink,width:900,height:80,font:SANS_SEMI}):null;
  const folio=chip?null:await folioMark(index,ON_PHOTO.ink,{shadow:true});
  const padX=30,padY=12,markH=chip?chip.info.height+padY*2:folio!.layer.info.height,markGap=chip?30:34;
  // 사진 위쪽이 뚜렷이 단순하면(음식이 아래) 장 번호·제목·짧은 글을 위에서부터 쌓는다. 아니면 기존처럼 바닥글 위.
  const top=await quietSide(base)==="top";
  let markTop:number,titleTop:number,subTop:number;
  if(top){
    markTop=MARGIN;titleTop=markTop+markH+markGap;subTop=titleTop+title.layer.info.height+22;
  }else{
    subTop=footTop-56-(sub?.info.height??0);
    titleTop=(sub?subTop-22:footTop-56)-title.layer.info.height;
    markTop=titleTop-markGap-markH;
  }
  const mark:{svg:string;data:Buffer;top:number;left:number}=chip
    ?{svg:`<rect x="${MARGIN}" y="${markTop}" width="${chip.info.width+padX*2}" height="${markH}" rx="${markH/2}" fill="${ON_PHOTO.ink}" fill-opacity=".94"/>`,data:chip.data,top:markTop+padY,left:MARGIN+padX}
    :{svg:folio!.svg(MARGIN,markTop),data:folio!.layer.data,top:markTop,left:MARGIN};
  const blockBottom=sub?subTop+sub.info.height:titleTop+title.layer.info.height;
  const layers:OverlayOptions[]=[
    {input:base,left:0,top:0},
    svgLayer((top?topTextShade(blockBottom+220):photoShade(Math.max(420,markTop-200),{top:false}))+mark.svg+placed.svg),
    {input:mark.data,left:mark.left,top:mark.top},
    {input:title.layer.data,left:MARGIN,top:titleTop},
    ...(sub?[{input:sub.data,left:MARGIN,top:subTop}]:[]),
    ...placed.layers,
  ];
  return sharp({create:{width:1080,height:1350,channels:3,background:SHADE}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

// ── 액자(짝수 본문 장) ───────────────────────────────────────────────────────────────────
// 크림 종이에 리넨 결을 옅게 깔고, 위쪽에 둥근 모서리(28px) 큰 사진과 부드러운 그림자. 사진 높이는 아래 글이 차지하고 남는 높이.
// 장 번호는 사진 왼쪽 위에 얹고 여백을 줄여(64→36px) 사진이 화면의 65% 이상 되게 한다.
async function framed(photo:Buffer,content:StyleContent,index:number,PAPER:TrackSurface):Promise<Buffer> {
  const X=36,TOP=36,W=1080-X*2,R=28;
  const title=await bodyTitle(content,PAPER.ink,PAPER.accent);
  const line=shortLines(content,1)[0];
  const sub=line?await sublineOf(line,PAPER.dim):null;
  const folio=await folioMark(index,ON_PHOTO.ink,{shadow:true});
  const foot=await footerRow({color:PAPER.dim,cueColor:PAPER.ink,cue:true});
  // 아래에서 위로 쌓는다: 바닥글 → 짧은 글 → 제목 → 사진.
  const bottomTop=1350-56-foot.height;
  const subTop=bottomTop-44-(sub?.info.height??0);
  const titleTop=(sub?subTop-18:bottomTop-44)-title.layer.info.height;
  const photoH=Math.max(420,titleTop-36-TOP);
  const shot=await warmed(await croppedPhoto(photo,W,photoH,R,{zoom:1.03}));
  const shadow=await shadowLayer({x:X,y:TOP+14,width:W,height:photoH,rx:R,blur:26,opacity:.2});
  const layers:OverlayOptions[]=[];
  const paper=await textureLayer("linen",{opacity:.22});
  if(paper)layers.push(paper);
  layers.push(shadow,{input:shot,left:X,top:TOP});
  // 장 번호: 사진 왼쪽 위, 짙은 반투명 알약 위(밝은 사진에서도 흰 숫자가 읽히게).
  const folioTop=TOP+30;
  const pillH=folio.layer.info.height+16;
  const markup=`<rect x="${MARGIN-18}" y="${folioTop-8}" width="${folio.width+36}" height="${pillH}" rx="${pillH/2}" fill="${SHADE}" fill-opacity=".72"/>`+folio.svg(MARGIN,folioTop);
  const placed=foot.place(bottomTop);
  // 도형(알약·바닥글 화살표)을 먼저 깔고 글자를 그 위에 올린다.
  layers.push(svgLayer(markup+placed.svg),{input:folio.layer.data,left:MARGIN,top:folioTop},{input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  layers.push(...placed.layers);
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER.bg}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

export const renderPhotoFocus:CardRenderer=async(inputs,slide,index,total,palette)=>{
  // 사진이 없는 장(예전 초안을 다시 그릴 때 등)은 같은 가게 색의 글 중심 모양으로 그린다.
  if(!inputs.length)return renderTextFocus(inputs,slide,index,total,palette);
  const content=contentOf(slide,inputs,index,total);
  // 모양(slide.variant): 0은 아래 기본 모양, 1~3은 photoLooks.ts. 한 게시물의 장은 모두 같은 모양을 쓴다.
  const looked=renderPhotoLook(slide.variant??0,inputs[0],content,index,trackLookOf(palette),total);
  if(looked)return looked;
  if(content.cover)return cover(inputs[0],content);
  // 액자 장의 종이 색은 구성안의 색 조합을 따른다(trackLooks.ts, 주제마다 바뀐다).
  if(!content.last&&index%2===0)return framed(inputs[0],content,index,trackLookOf(palette).light);
  return bleed(inputs[0],content,index);
};

// 검수·테스트에서 구도를 확인할 때 쓰는 이름(장 번호 → 구도). 마지막 장은 꽉 찬 사진.
export const photoFocusComposition=(index:number,total:number):"cover"|"framed"|"bleed"=>index===1?"cover":index!==total&&index%2===0?"framed":"bleed";
