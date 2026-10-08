import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { textureLayer } from "../decor";
import { contentOf, emphasisOf, snap, type StyleContent } from "./shared";
import { SANS, SANS_BOLD, SANS_SEMI, TITLE_SERIF, TRACK_SURFACES, countLines, fitLines, folioMark, footerRow, logoMark, storeCardBlock, type TrackSurface } from "./trackKit";

// 글 중심(갈래 "글"). 큰 글자 세 줄이면 끝나는 카드: 본문 장은 사진 없이 제목 한 줄(64px 이상) + 짧은 글 두 줄까지(44px 이상).
// 넓은 여백과 따뜻한 세 바탕(크림 → 겨자 → 가게 밤색)을 장마다 돌려 넘길 때마다 색이 바뀌게 한다(같은 카드 다섯 장처럼 보이지 않게).
//   표지      : 가게 밤색 판 위쪽에 사진 한 장(AI 그림 또는 사장님 사진)을 둥근 카드로 크게 띄우고, 아래에 큰 제목(최대 두 줄)과 부제.
//   본문 장   : 큰 장 번호(02) → 짧은 선 → 제목 → 짧은 글을 한 덩어리로 눈높이에, 아래에 작은 로고와 가게 이름, "넘겨 보기 ›".
//   마지막 장 : 크림 바탕에 제목·짧은 글, 아래에 크게 놓은 원형 로고와 계정·"저장해 두고 다시 보세요"(가게 명함).
// 줄 수는 그린 결과로 센다: 제목이 두 줄로 접히면 짧은 글을 하나만, 세 줄이면 짧은 글 없이(합쳐서 세 줄 이내).
const X=88,W=1080-X*2;
const BODY_ORDER=[TRACK_SURFACES.cream,TRACK_SURFACES.mustard,TRACK_SURFACES.brown] as const;
export const textSurfaceOf=(index:number):TrackSurface=>BODY_ORDER[((index-2)%3+3)%3];
const LINE_SIZE=52,LINE_SPACING=14;

// 줄 수만 재는 측정. 한글 음절을 같은 폭의 "홍"으로 바꿔 재므로(한글 글꼴은 음절 폭이 같다) 재기만 하고 버린 글이
// "카드에 그린 글"로 검수에 남지 않는다(composeSlideCard가 빠진 요점을 셀 때 헷갈리지 않게).
async function maskedLines(text:string,size:number,width:number):Promise<number> {
  const masked=text.replace(/[가-힣]/g,"홍");
  const layer=await textLayer(masked,{size,color:"#000000",width,height:4000,font:SANS,spacing:LINE_SPACING});
  return countLines(layer,size,SANS,LINE_SPACING);
}

// 제목 + 짧은 글(합쳐서 세 줄 이내). 돌려주는 layers는 (0,0) 기준 상대 위치, height는 덩어리 전체 높이.
async function textBlock(content:StyleContent,surface:TrackSurface,options:{align:"left"|"centre";sizes:number[]}):Promise<{items:Array<{layer:Layer;top:number;kind:"title"|"line"}>;height:number;lines:number}> {
  const title=await fitLines(content.headline,{sizes:options.sizes,width:W,font:SANS_BOLD,color:surface.ink,maxLines:3,prefer:"lines",align:options.align,spacing:size=>Math.round(size*.2),letterSpacing:size=>-size*.015,emphasis:emphasisOf(content,surface.accent)});
  let used=title.lines;
  const items:Array<{layer:Layer;top:number;kind:"title"|"line"}>=[{layer:title.layer,top:0,kind:"title"}];
  let y=title.layer.info.height+44;
  for(const point of content.points.slice(0,2)){
    const lines=await maskedLines(point,LINE_SIZE,W);
    if(used+lines>3)break;
    used+=lines;
    const layer=await textLayer(point,{size:LINE_SIZE,color:surface.dim,width:W,height:4000,font:SANS,spacing:LINE_SPACING,align:options.align});
    items.push({layer,top:y,kind:"line"});
    y+=layer.info.height+20;
  }
  const last=items[items.length-1];
  return {items,height:last.top+last.layer.info.height,lines:used};
}

// ── 본문 장 ──────────────────────────────────────────────────────────────────────────
// 큰 장 번호(함렛 명조 200px, 강조색) → 짧은 선 → 제목 → 짧은 글을 한 덩어리로 눈높이(가운데보다 조금 위)에 둔다.
// 큰 번호는 순서를 한눈에 알려 주는 장 번호이자, 글 세 줄뿐인 카드의 빈자리를 의도한 여백으로 보이게 하는 장식이다.
async function body(content:StyleContent,index:number):Promise<Buffer> {
  const surface=textSurfaceOf(index);
  const block=await textBlock(content,surface,{align:"left",sizes:[92,88,84,80,76,72,68,64]});
  const numeral=await textLayer(String(index).padStart(2,"0"),{size:200,color:surface.accent,width:600,height:400,font:TITLE_SERIF,features:"tnum",letterSpacing:-6,spacing:0});
  const foot=await footerRow({color:surface.dim,cueColor:surface.ink,ring:surface.name==="brown"?surface.ring:undefined,cue:!content.last,left:X,right:X});
  const footTop=1350-80-foot.height;
  const NUM_GAP=34,RULE_GAP=56;
  const blockH=numeral.info.height+NUM_GAP+RULE_GAP+block.height;
  const room={top:96,bottom:footTop-72};
  const top=Math.round(Math.max(room.top,room.top+(room.bottom-room.top-blockH)*.54));
  const ruleY=top+numeral.info.height+NUM_GAP;
  const textTop=ruleY+RULE_GAP;
  const placed=foot.place(footTop);
  const markup=`<path d="M${X+4} ${ruleY}H${X+88}" stroke="${surface.ink}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`+placed.svg;
  const layers:OverlayOptions[]=[];
  if(surface.name==="cream"){const paper=await textureLayer("linen",{opacity:.2});if(paper)layers.push(paper);}
  layers.push(svgLayer(markup),{input:numeral.data,left:X-6,top});
  for(const item of block.items)layers.push({input:item.layer.data,left:X,top:textTop+item.top});
  layers.push(...placed.layers);
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

// ── 마지막 장(가게 명함) ─────────────────────────────────────────────────────────────────
async function last(content:StyleContent,index:number):Promise<Buffer> {
  const surface=TRACK_SURFACES.cream;
  const block=await textBlock(content,surface,{align:"centre",sizes:[76,72,68,64]});
  const card=await storeCardBlock({logoSize:300,wordmark:false,surface});
  const folio=await folioMark(index,surface.accent,{rule:false});
  const HEAD=96,GAP=110;
  // 제목·짧은 글과 명함을 한 덩어리로 장 번호 아래 남는 높이의 가운데에 둔다(위아래 여백을 고르게).
  const roomTop=HEAD+folio.layer.info.height+40,roomBottom=1350-80;
  const groupH=block.height+GAP+card.height;
  const top=Math.round(Math.max(roomTop,roomTop+(roomBottom-roomTop-groupH)/2));
  const cardTop=top+block.height+GAP;
  const placed=card.place(540,cardTop);
  const layers:OverlayOptions[]=[];
  const paper=await textureLayer("linen",{opacity:.2});
  if(paper)layers.push(paper);
  // 로고 뒤에 한 톤 짙은 원을 깔아 명함 자리를 잡는다(로고가 종이 위에 떠 보이지 않게).
  layers.push(svgLayer(`<circle cx="540" cy="${cardTop+150}" r="186" fill="${surface.soft}"/>`+placed.svg),{input:folio.layer.data,left:Math.round(540-folio.layer.info.width/2),top:HEAD});
  for(const item of block.items)layers.push({input:item.layer.data,left:Math.round(540-item.layer.info.width/2),top:top+item.top});
  layers.push(...placed.layers);
  return sharp({create:{width:1080,height:1350,channels:3,background:surface.bg}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

// ── 표지 ──────────────────────────────────────────────────────────────────────────────
async function cover(photo:Buffer|undefined,content:StyleContent):Promise<Buffer> {
  const panel=TRACK_SURFACES.brown;
  const title=await fitLines(content.headline,{sizes:[100,92,86,80,74],width:W,font:SANS_BOLD,color:panel.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.06),letterSpacing:size=>-size*.02,emphasis:emphasisOf(content,panel.accent)});
  const sub=content.subline?await textLayer(content.subline,{size:40,color:panel.accent,width:W,height:4000,font:SANS_SEMI,spacing:10}):null;
  const foot=await footerRow({color:panel.dim,cueColor:panel.ink,ring:panel.ring,cue:!content.last,left:X,right:X});
  const footTop=1350-72-foot.height;
  const SUB_GAP=22,FOOT_GAP=64,PAD=76,INSET=44,R=32;
  const textH=title.layer.info.height+(sub?SUB_GAP+sub.info.height:0);
  // 사진은 밤색 판 위에 둥근 모서리 카드로 띄운다(사방 44px 여백). 높이 = 제목·부제·바닥글을 빼고 남는 높이(최소 600, 최대 840).
  // 사진 아래를 판 색으로 녹이는 대신 카드로 두면 밝은 사진도 경계가 탁해지지 않는다.
  const photoH=photo?Math.max(600,Math.min(840,footTop-FOOT_GAP-textH-PAD-INSET)):0;
  const titleTop=photo?INSET+photoH+PAD:Math.round(560+(footTop-FOOT_GAP-560-textH)/2);
  const placed=foot.place(footTop);
  const layers:OverlayOptions[]=[];
  let markup="";
  if(photo){
    layers.push({input:await croppedPhoto(photo,1080-INSET*2,photoH,R,{zoom:1.04}),left:INSET,top:INSET});
    // 로고가 놓이는 왼쪽 위만 살짝 눌러 밝은 사진에서도 로고 테두리가 또렷하게.
    markup+=`<defs><radialGradient id="tfL" cx="${INSET+100}" cy="${INSET+100}" r="220" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1C1310" stop-opacity=".28"/><stop offset="1" stop-color="#1C1310" stop-opacity="0"/></radialGradient></defs>`
      +`<rect x="${INSET}" y="${INSET}" width="${1080-INSET*2}" height="${photoH}" rx="${R}" fill="url(#tfL)"/>`;
  }
  markup+=`<rect x="${X}" y="${titleTop-40}" width="64" height="8" rx="4" fill="${panel.accent}"/>`+placed.svg;
  layers.push(svgLayer(markup));
  const LOGO=photo?116:220;
  layers.push({input:await logoMark(LOGO,panel.ring),left:photo?INSET+32:Math.round(540-LOGO/2),top:photo?INSET+32:200});
  layers.push({input:title.layer.data,left:X,top:titleTop});
  if(sub)layers.push({input:sub.data,left:X,top:titleTop+title.layer.info.height+SUB_GAP});
  layers.push(...placed.layers);
  return sharp({create:{width:1080,height:1350,channels:3,background:panel.bg}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

export const renderTextFocus:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  // 표지만 사진을 쓴다. 본문 장은 사진이 들어와도(예전 초안·사진 장 레이아웃) 쓰지 않는다 — 글 중심은 글이 주인공.
  if(content.cover)return cover(inputs[0],content);
  if(content.last)return last(content,index);
  return body(content,index);
};
