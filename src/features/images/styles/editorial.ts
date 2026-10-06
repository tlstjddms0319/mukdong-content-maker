import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svgLayer, textLayer, type CardRenderer, type Font, type Layer, type TextEmphasis } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { MIN_STROKE, STYLE_FONTS, chooseTitleLayout, closingBlock, contentOf, emphasisOf, fitText, hashtags, nextCue, rotated, snap, type StyleContent } from "./shared";
import { STORE_NAME } from "../slideLayout";
import { seeded } from "./handDrawn";

// 푸드 매거진 표지·내지: 사진이 주인공이고 글자는 크고 정갈하게.
// 표지는 사진이 화면을 가득 채우고 맨 위에 제호 "MUKDONG"(Abril Fatface, 폭을 가득 채우는 크기), 그 아래 자간 넓은
// "홍어 이야기 · 1 / 5", 왼쪽에 표지 문구 칩, 아래 1/3의 어두운 그라데이션 위에 명조 제목과 부제, 오른쪽 아래 바코드,
// 왼쪽 아래 예고(이번 호 차례처럼). 제호만 영문으로 두고 나머지 장식 글은 한글로 쓴다(사장님 결정: 한글 중심).
// 내지는 흰 종이에 검은 줄·빨간 섹션 라벨·고정폭 꼬리표, 사진 뒤로 비치는 거대한 쪽 번호, 빨간 세로 막대가 달린 제목.
// 글자만 있는 장은 거대한 빨간 따옴표를 단 인용(pull quote) 페이지다. 시즌 특집·베스트 정리처럼 한 마디로 눈길을 끌 때 쓴다.
// 영문 전용 글꼴(display·condensed)에는 영문·숫자·기호만 넣는다(한글이 들어가면 다른 글꼴로 대체돼 깨져 보인다).
const PAPER="#FFFFFF",INK="#111111",BODY="#1A1A1A",RED="#D22B2B",GHOST="#EDEDED",RULE="#D9D9D9",GREY="#6E6E6E",CAPTION="#3A3A3A";
// 내지 여백과 머리·바닥 줄 위치. 머리 줄 아래 라벨(28px)과 바닥 줄 아래 가게 이름(26px)을 뺀 사이가 본문 칸이다.
const M=64,W=1080-M*2,RIGHT=1080-M;
const HEADER_RULE=56,CONTENT_TOP=134,FOOTER_RULE=1272,CONTENT_BOTTOM=FOOTER_RULE-44;
// 표지 여백. 인스타 프로필 격자는 좌우 34px를 잘라내므로 그보다 넉넉한 60을 둔다.
const COVER_M=60,COVER_W=1080-COVER_M*2;
const MIN_PHOTO=320,MAX_PHOTO=760;

const folioOf=(content:StyleContent)=>`${content.index} / ${content.total}`;
// 제목 핵심어 강조색: 내지(흰 종이)는 잡지 빨강, 표지(어두운 그라데이션 위)는 밝은 산호색이어야 3:1을 넘는다.
const COVER_ACCENT="#FF8A78";
// 한글 눈썹 글자(섹션 라벨·책등): 자간을 넓힌 굵은 고딕. 영문 전용 좁은 글꼴(condensed)에는 한글이 없다.
const eyebrow=(text:string,size:number,color:string,width=600)=>textLayer(text,{size,color,width,height:size*2,font:STYLE_FONTS.sansBold,letterSpacing:size*.18,spacing:0});
const transparent={r:0,g:0,b:0,alpha:0};

// 한 줄로 들어가는 가장 큰 크기(제호용). sharp의 글자 레이어는 잉크에 꼭 맞게 잘려 나오므로, 한 줄이면 높이가
// 글자 크기보다 작고 두 줄로 꺾이면 1.5배를 넘는다. 그 차이로 "한 줄에 들어갔는지"를 판단한다.
async function fitLine(value:string,options:{sizes:number[];maxWidth:number;font:Font;color:string}):Promise<Layer> {
  let last:Layer|null=null;
  for(const size of options.sizes){
    last=await textLayer(value,{size,color:options.color,width:options.maxWidth,height:4000,font:options.font,align:"centre",spacing:0});
    if(last.info.height<=size*1.1)return last;
  }
  return last!;
}
// 그림자를 깐 글자를 들어가는 가장 큰 크기로(표지 제목). 크기와 균형 줄바꿈 폭은 fitText와 같은 공용 규칙(chooseTitleLayout)으로
// 고르고 shadow만 켠다. 돌려주는 레이어는 그림자 여백(10px)을 사방에 더 가진다.
async function fitShadowed(value:string,options:{sizes:number[];width:number;maxHeight:number;color:string;font:Font;spacing:number;emphasis?:TextEmphasis}):Promise<Layer> {
  const layout=await chooseTitleLayout(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,font:options.font,spacing:options.spacing});
  return textLayer(layout.text,{size:layout.size,color:options.color,width:layout.width,height:layout.fits?4000:options.maxHeight,font:options.font,spacing:options.spacing,shadow:true,emphasis:options.emphasis});
}

// 사진 뒤로 비치는 거대한 쪽 번호. 아주 옅은 회색이라 읽는 글자가 아니라 종이 무늬에 가깝다.
// 자동 검수는 1080×1350 캔버스에 바로 놓인 글자 레이어만 재므로, 제 크기의 투명 조각에 먼저 얹어 "장식 부품"으로 만든다
// (외곽선 글자·폴라로이드와 같은 방식). 그래야 일부러 옅게 둔 무늬가 대비 부족으로 잡히지 않는다.
async function ghostNumber(index:number):Promise<Layer> {
  const text=await textLayer(String(index).padStart(2,"0"),{size:300,color:GHOST,width:800,height:600,font:STYLE_FONTS.display,spacing:0});
  return sharp({create:{width:text.info.width,height:text.info.height,channels:4,background:transparent}}).composite([{input:text.data,left:0,top:0}]).png().toBuffer({resolveWithObject:true});
}

// 바코드: 흰 상자 안에 굵기가 제멋대로인 검은 세로줄. 양 끝 두 줄은 조금 길게(진짜 바코드의 가드 바처럼).
function barcode(x:number,y:number,w:number,h:number,rand:()=>number):string {
  let bars="";
  const bands:Array<[number,number]>=[];
  let cx=x+14;
  while(cx<x+w-14){
    const bw=1+Math.round(rand()*3);
    if(cx+bw>x+w-14)break;
    bands.push([cx,bw]);
    cx+=bw+1+Math.round(rand()*3);
  }
  for(const [i,[bx,bw]] of bands.entries()){
    const guard=i<2||i>=bands.length-2;
    bars+=`<rect x="${bx}" y="${y+12}" width="${bw}" height="${h-(guard?18:24)}" fill="#111"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`+bars;
}

// 표지 위 어두운 그라데이션. 위는 제호·호수가 밝은 사진에서도 읽히게, 아래는 제목·바코드 자리.
function coverShade():string {
  // 위 그라데이션은 제호(y 46~185)와 호수(y ~210~235)가 밝은 사진에서도 4:1 넘게 읽히는 선에서 가장 옅게 잡았다.
  // 아래는 제목(그림자 있음)보다 바코드 밑 작은 가게 이름(26px)이 기준이라 맨 아래를 가장 진하게 둔다.
  return `<defs><linearGradient id="ed-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset=".26" stop-color="#000" stop-opacity=".46"/><stop offset=".5" stop-color="#000" stop-opacity="0"/></linearGradient>`
    +`<linearGradient id="ed-bottom" x1="0" y1="0" x2="0" y2="1"><stop offset=".58" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs>`
    +`<rect width="1080" height="1350" fill="url(#ed-top)"/><rect width="1080" height="1350" fill="url(#ed-bottom)"/>`;
}

// 사진은 각진 모서리에 가는 검은 테두리. 테두리는 사진 위에 얹는 svg 문자열로 돌려준다.
// 폰에서 1px 선은 사라지므로 최소 두께(MIN_STROKE)로 그린다.
const photoFrame=(x:number,y:number,w:number,h:number)=>`<rect x="${x+MIN_STROKE/2}" y="${y+MIN_STROKE/2}" width="${w-MIN_STROKE}" height="${h-MIN_STROKE}" fill="none" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
const plainPhoto=(input:Buffer,w:number,h:number)=>finishPhoto(input,w,h);

// ── 표지 ──────────────────────────────────────────────────────────────────────────────
async function renderCover(inputs:Buffer[],content:StyleContent,variant:number):Promise<Buffer> {
  const layers:OverlayOptions[]=[];
  const shot=inputs[0];
  if(shot){
    // 색을 살짝 다시 만져 새 버퍼가 되므로, 캔버스에 놓는 이 버퍼를 사진으로 등록한다(검수의 사진 면적).
    const photo=await sharp(await finishPhoto(shot,1080,1350)).modulate({brightness:1.03,saturation:1.06}).png().toBuffer();
    registerPhoto(photo);
    layers.push({input:photo,left:0,top:0});
  }
  let deco=coverShade();
  // 제호: 폭(여백 60 안쪽)을 가득 채우는 가장 큰 크기.
  const masthead=await fitLine("MUKDONG",{sizes:[200,196,192,188,184,180,176,172,168,164,160],maxWidth:COVER_W,font:STYLE_FONTS.display,color:"#FFFFFF"});
  let y=46;
  layers.push({input:masthead.data,left:Math.round((1080-masthead.info.width)/2),top:y});
  y+=masthead.info.height+26;
  // 호수: 자간 넓은 한글 눈썹 글자("홍어 이야기 · 1 / 5"), 양옆에 흰 줄. 숫자는 장 번호뿐이다.
  const issue=await textLayer(`홍어 이야기  ·  ${folioOf(content)}`,{size:30,color:"#FFFFFF",width:900,height:60,font:STYLE_FONTS.sansBold,letterSpacing:30*.16,features:"tnum",spacing:0});
  const ix=Math.round((1080-issue.info.width)/2),lineY=y+Math.round(issue.info.height/2);
  layers.push({input:issue.data,left:ix,top:y});
  deco+=`<path d="M${COVER_M} ${lineY}H${ix-28}M${ix+issue.info.width+28} ${lineY}H${1080-COVER_M}" stroke="#fff" stroke-opacity=".85" stroke-width="${MIN_STROKE}"/>`;
  y+=issue.info.height+64;
  // 표지 문구 칩: 왼쪽 가장자리에 세로로. 흰 테두리 안을 반투명 검정으로 채워 밝은 사진에서도 글자가 읽힌다.
  for(const word of content.keywords.slice(0,3)){
    const text=await textLayer(word.toUpperCase(),{size:28,color:"#FFFFFF",width:420,height:44,font:STYLE_FONTS.sansBold,spacing:0});
    const w=text.info.width+40,h=text.info.height+26;
    deco+=`<rect x="${COVER_M}" y="${y}" width="${w}" height="${h}" fill="#000" fill-opacity=".48" stroke="#fff" stroke-width="${MIN_STROKE}"/>`;
    layers.push({input:text.data,left:COVER_M+20,top:y+13});
    y+=h+14;
  }
  // 바닥: 오른쪽 아래 바코드와 그 밑 가게 이름(26px), 왼쪽 아래 이번 호 예고(잡지 표지의 차례 한 줄처럼).
  const brand=await textLayer(brandName(),{size:26,color:"#FFFFFF",width:COVER_W,height:44,font:STYLE_FONTS.sansSemi});
  const brandTop=1350-56-brand.info.height;
  layers.push({input:brand.data,left:1080-COVER_M-brand.info.width,top:brandTop});
  const BW=230,BH=74,bx=1080-COVER_M-BW,by=brandTop-16-BH;
  deco+=barcode(bx,by,BW,BH,seeded(content.index*31+variant));
  if(content.teaser){
    // 가게 이름 줄에 같이 들어가면 그 줄 왼쪽, 긴 계정 때문에 안 들어가면 바코드 왼쪽 줄로 올린다.
    const teaser=await textLayer(content.teaser,{size:27,color:"#FFFFFF",width:COVER_W-BW-40,height:60,font:STYLE_FONTS.sansSemi,spacing:0});
    const sameRow=teaser.info.width+40+brand.info.width<=COVER_W;
    const ty=sameRow?brandTop+Math.round((brand.info.height-teaser.info.height)/2):by+BH-teaser.info.height-4;
    layers.push({input:teaser.data,left:COVER_M,top:ty});
    deco+=`<rect x="${COVER_M}" y="${ty-16}" width="44" height="${MIN_STROKE+1}" fill="${COVER_ACCENT}"/>`;
  }
  // 제목: 바코드 위에서 위로 쌓는다(부제가 있으면 제목 바로 아래). 그 위에 흰 줄. 그림자를 깔아 그라데이션이 옅은 자리에서도 읽힌다.
  const sub=content.subline?await textLayer(content.subline,{size:34,color:"#FFFFFF",width:COVER_W,height:110,font:STYLE_FONTS.sansSemi,shadow:true}):null;
  const subH=sub?sub.info.height-8:0;
  const title=await fitShadowed(content.headline,{sizes:[96,86,76,68],width:COVER_W,maxHeight:460-subH,color:"#FFFFFF",font:STYLE_FONTS.serifHeavy,spacing:10,emphasis:emphasisOf(content,COVER_ACCENT)});
  const titleTop=by-40-subH-(title.info.height-20);
  layers.push({input:title.data,left:COVER_M-10,top:titleTop-10});
  if(sub)layers.push({input:sub.data,left:COVER_M-10,top:titleTop+title.info.height-20});
  deco+=`<path d="M${COVER_M} ${titleTop-30}H${1080-COVER_M}" stroke="#fff" stroke-opacity=".9" stroke-width="${MIN_STROKE}"/>`;
  // 그라데이션·칩·바코드는 사진 위, 글자 아래.
  layers.splice(shot?1:0,0,svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:"#141414"}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
}

// ── 내지 공통: 머리(가는 줄·빨간 섹션 라벨·고정폭 키워드)와 바닥(가는 줄·가게 이름·쪽 번호) ──────────────
async function chrome(content:StyleContent,label:string):Promise<{layers:OverlayOptions[];deco:string}> {
  const layers:OverlayOptions[]=[];
  let deco=`<path d="M${M} ${HEADER_RULE}H${RIGHT}" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
  const section=await eyebrow(label,26,RED,500);
  layers.push({input:section.data,left:M,top:HEADER_RULE+18});
  // 오른쪽 꼬리표: 키워드를 고정폭으로(쪽 번호는 바닥글에 있으므로 머리에는 키워드). 키워드가 없으면 바닥글의 가게 이름과
  // 겹치지 않게 짧은 분류 글을 쓴다.
  const tag=await fitText(content.keywords.length?hashtags(content):"홍어 이야기",{sizes:[26,24,22],width:460,maxHeight:34,color:INK,font:STYLE_FONTS.mono,spacing:0});
  layers.push({input:tag.data,left:RIGHT-tag.info.width,top:HEADER_RULE+18+Math.round((section.info.height-tag.info.height)/2)});
  deco+=`<path d="M${M} ${FOOTER_RULE}H${RIGHT}" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
  // 바닥글: 왼쪽 가게 이름(마지막 장은 명함에 계정이 있으므로 이름만), 오른쪽 쪽 번호, 가운데 장이면 쪽 번호 왼쪽에 "넘겨 보기".
  const brand=await textLayer(content.last?STORE_NAME:brandName(),{size:26,color:INK,width:W,height:44,font:STYLE_FONTS.sansSemi});
  const footTop=FOOTER_RULE+22;
  layers.push({input:brand.data,left:M,top:footTop});
  const folio=await textLayer(folioOf(content),{size:26,color:INK,width:200,height:40,font:STYLE_FONTS.mono,spacing:0,features:"tnum"});
  const mid=footTop+brand.info.height/2;
  layers.push({input:folio.data,left:RIGHT-folio.info.width,top:Math.round(mid-folio.info.height/2)});
  if(!content.cover&&!content.last){
    const cue=await nextCue(RED,26);
    const x=RIGHT-folio.info.width-36-cue.width,top=Math.round(mid-cue.height/2);
    // 긴 계정과 같은 줄에 안 들어가면 바닥 줄 바로 위 오른쪽으로 올린다(본문 칸은 그 위에서 끝난다).
    const clash=M+brand.info.width+30>x;
    const cx=clash?RIGHT-cue.width:x,cy=clash?FOOTER_RULE-12-cue.height:top;
    layers.push({input:cue.label.data,left:cx,top:cy});
    deco+=cue.arrow(cx,cy);
  }
  return {layers,deco};
}

// 사진 장의 글 덩어리: 빨간 세로 막대가 달린 명조 제목과 그 아래 요점(요점 사이 가는 회색 줄).
type Body={title:Layer;points:Layer[]};
async function bodyOf(content:StyleContent,maxPoints:number,pointSize=40):Promise<Body> {
  const titleSizes=pointSize<40?[58,52,48]:[64,58,52];
  const title=await fitText(content.headline,{sizes:titleSizes,width:W-32,maxHeight:290,color:INK,font:STYLE_FONTS.serifHeavy,spacing:8,emphasis:emphasisOf(content,RED)});
  const points=await Promise.all(content.points.slice(0,maxPoints).map(point=>textLayer(point,{size:pointSize,color:BODY,width:W,height:300,font:STYLE_FONTS.sans,spacing:10})));
  return {title,points};
}
const POINT_GAP=34,TITLE_GAP=36;
const bodyHeight=(body:Body,pointGap=POINT_GAP)=>body.title.info.height+(body.points.length?TITLE_GAP:0)+body.points.reduce((sum,point)=>sum+point.info.height,0)+Math.max(0,body.points.length-1)*pointGap;
function placeBody(layers:OverlayOptions[],body:Body,top:number,pointGap:number):{deco:string;bottom:number} {
  let deco=`<rect x="${M}" y="${top+4}" width="8" height="${Math.max(24,body.title.info.height-6)}" fill="${RED}"/>`;
  layers.push({input:body.title.data,left:M+32,top});
  let y=top+body.title.info.height+TITLE_GAP;
  for(const [i,point] of body.points.entries()){
    layers.push({input:point.data,left:M,top:y});
    y+=point.info.height;
    if(i<body.points.length-1){deco+=`<path d="M${M} ${y+pointGap/2}H${RIGHT}" stroke="${RULE}" stroke-width="${MIN_STROKE}"/>`;y+=pointGap;}
  }
  return {deco,bottom:y};
}
// 사진 높이와 남는 공간 나누기. 요점이 길어 사진이 너무 작아지면 먼저 요점·제목 글자를 한 단계 줄이고(40→36),
// 그래도 모자라면 요점 하나를 뺀다. 남는 공간은 사진(최대 760) →
// 사진·제목 간격 → 요점 사이 간격 순으로 채우고, 그래도 남으면 덩어리를 그만큼 내려 위아래가 고르게 비게 한다.
async function fitPhotoPage(content:StyleContent,extra:number):Promise<{body:Body;photoH:number;gapTitle:number;pointGap:number;shift:number}> {
  let body=await bodyOf(content,4);
  const room=()=>CONTENT_BOTTOM-CONTENT_TOP-extra-40-bodyHeight(body);
  if(room()<MIN_PHOTO+40)body=await bodyOf(content,4,36);
  if(room()<MIN_PHOTO+40&&body.points.length>3)body={...body,points:body.points.slice(0,3)};
  const avail=room();
  const photoH=Math.round(Math.max(MIN_PHOTO,Math.min(MAX_PHOTO,avail)));
  let leftover=Math.max(0,avail-photoH);
  const gapTitle=40+Math.min(36,Math.round(leftover/3));leftover-=gapTitle-40;
  const perGap=body.points.length>1?Math.min(30,Math.round(leftover/(body.points.length-1))):0;
  const pointGap=POINT_GAP+perGap;leftover-=perGap*Math.max(0,body.points.length-1);
  return {body,photoH,gapTitle,pointGap,shift:Math.round(leftover/2)};
}

// 마지막 장 가게 명함: 판권면(콜로폰)처럼 가운데에 가게 이름·계정·저장 칩. 칩 바탕 SVG를 돌려준다.
const CLOSING_GAP=44;
function placeClosing(layers:OverlayOptions[],block:Awaited<ReturnType<typeof closingBlock>>,top:number):string {
  layers.push({input:block.wordmark.data,left:Math.round(540-block.wordmark.info.width/2),top});
  let y=top+block.wordmark.info.height;
  if(block.handle){y+=8;layers.push({input:block.handle.data,left:Math.round(540-block.handle.info.width/2),top:y});y+=block.handle.info.height;}
  y+=18+12;
  const x=Math.round(540-block.chip.info.width/2);
  layers.push({input:block.chip.data,left:x,top:y});
  return block.chipSvg(x,y);
}

// ── 사진 1장 장 ─────────────────────────────────────────────────────────────────────────
async function renderPhotoPage(inputs:Buffer[],content:StyleContent):Promise<Buffer> {
  const {layers,deco:chromeDeco}=await chrome(content,content.last?"마지막 장":"특집");
  const closing=content.last?await closingBlock({width:W,color:INK,accent:RED}):null;
  const {body,photoH,gapTitle,pointGap,shift}=await fitPhotoPage(content,closing?closing.height+CLOSING_GAP:0);
  const photoTop=CONTENT_TOP+shift,photoBottom=photoTop+photoH;
  // 거대한 쪽 번호는 사진의 왼쪽 아래 모서리에 걸쳐 두어 아래쪽 절반만 사진 밖으로 비친다.
  const ghost=await ghostNumber(content.index);
  const parts:OverlayOptions[]=[{input:ghost.data,left:M-28,top:photoBottom-Math.round(ghost.info.height*.55)}];
  parts.push({input:await plainPhoto(inputs[0],W,photoH),left:M,top:photoTop});
  let deco=chromeDeco+photoFrame(M,photoTop,W,photoH);
  const placed=placeBody(layers,body,photoBottom+gapTitle,pointGap);
  deco+=placed.deco;
  if(closing)deco+=placeClosing(layers,closing,placed.bottom+CLOSING_GAP);
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap([...parts,svgLayer(deco),...layers])).jpeg({quality:92}).toBuffer();
}

// ── 사진 2장 장: 좌우 2단, 각 사진 아래 고정폭 캡션 ───────────────────────────────────────────
async function renderPhotosPage(inputs:Buffer[],content:StyleContent):Promise<Buffer> {
  const {layers,deco:chromeDeco}=await chrome(content,content.last?"마지막 장":"나란히 보기");
  const closing=content.last?await closingBlock({width:W,color:INK,accent:RED}):null;
  const GAP=32,PW=Math.round((W-GAP)/2);
  const captions=await Promise.all(inputs.slice(0,2).map((_,i)=>{
    const word=content.keywords[i];
    return textLayer(`사진 ${i+1}${word?`  ·  ${word}`:""}`,{size:26,color:CAPTION,width:PW,height:40,font:STYLE_FONTS.mono,spacing:0});
  }));
  const captionH=Math.max(...captions.map(caption=>caption.info.height))+14;
  const fitted=await fitPhotoPage(content,captionH+(closing?closing.height+CLOSING_GAP:0));
  // 2단 사진은 세로가 너무 길면 어색하므로 4:5 비율까지만 키운다.
  const photoH=Math.min(fitted.photoH,Math.round(PW*1.25));
  const shift=fitted.shift+Math.round((fitted.photoH-photoH)/2);
  const photoTop=CONTENT_TOP+shift,photoBottom=photoTop+photoH;
  const ghost=await ghostNumber(content.index);
  const parts:OverlayOptions[]=[{input:ghost.data,left:M-28,top:photoBottom-Math.round(ghost.info.height*.55)}];
  let deco=chromeDeco;
  for(const [i,shot] of inputs.slice(0,2).entries()){
    const x=M+i*(PW+GAP);
    parts.push({input:await plainPhoto(shot,PW,photoH),left:x,top:photoTop});
    deco+=photoFrame(x,photoTop,PW,photoH);
    layers.push({input:captions[i].data,left:x,top:photoBottom+14});
  }
  const placed=placeBody(layers,fitted.body,photoBottom+captionH+fitted.gapTitle+Math.round((fitted.photoH-photoH)/2),fitted.pointGap);
  deco+=placed.deco;
  if(closing)deco+=placeClosing(layers,closing,placed.bottom+CLOSING_GAP);
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap([...parts,svgLayer(deco),...layers])).jpeg({quality:92}).toBuffer();
}

// ── 글자만 있는 장: 인용(pull quote) 페이지 ─────────────────────────────────────────────────
async function renderTextPage(content:StyleContent):Promise<Buffer> {
  const {layers,deco:chromeDeco}=await chrome(content,content.last?"마지막 장":"한 마디");
  const closing=content.last?await closingBlock({width:W,color:INK,accent:RED}):null;
  let deco=chromeDeco;
  // 거대한 여는 따옴표(빨강), 가운데 정렬 명조 제목, 짧은 줄, 가운데 정렬 요점.
  const quote=await textLayer("“",{size:260,color:RED,width:320,height:400,font:STYLE_FONTS.display,spacing:0});
  const title=await fitText(content.headline,{sizes:closing?[72,64,58]:[80,72,64],width:880,maxHeight:420,color:INK,font:STYLE_FONTS.serifHeavy,align:"centre",spacing:10,emphasis:emphasisOf(content,RED)});
  // 마지막 장은 명함 높이를 먼저 빼고 남는 칸에 인용 덩어리를 놓는다.
  const avail=CONTENT_BOTTOM-CONTENT_TOP-(closing?closing.height+CLOSING_GAP:0);
  const QUOTE_GAP=16,RULE_GAP=30;
  let pointGap=30;
  const stack=(list:Layer[])=>quote.info.height+QUOTE_GAP+title.info.height+(list.length?RULE_GAP*2+2+list.reduce((sum,point)=>sum+point.info.height,0)+(list.length-1)*pointGap:0);
  // 요점 크기는 공간에 맞춰 고른다: 덩어리가 본문 칸의 80%를 넘지 않는 가장 큰 크기(54 → 50), 안 되면 기준 크기 46.
  const pointsAt=(size:number)=>Promise.all(content.points.slice(0,4).map(point=>textLayer(point,{size,color:BODY,width:860,height:300,font:STYLE_FONTS.sans,align:"centre",spacing:10})));
  let points=await pointsAt(46);
  for(const size of [54,50]){const bigger=await pointsAt(size);if(stack(bigger)<=avail*.8){points=bigger;break;}}
  // 넘치면 요점을 빼기 전에 글자를 먼저 줄인다(42 → 38).
  for(const size of [42,38]){if(stack(points)<=avail)break;points=await pointsAt(size);}
  const blockHeight=()=>stack(points);
  // 넘치면 요점 간격을 좁히고, 그래도 넘치면 마지막 요점을 뺀다.
  if(blockHeight()>avail)pointGap=16;
  while(blockHeight()>avail&&points.length>1)points=points.slice(0,-1);
  // 요점이 적어 공간이 남으면 요점 사이를 조금 벌린다(최대 56).
  if(points.length>1)pointGap=Math.min(56,pointGap+Math.floor(Math.max(0,avail-blockHeight())/(points.length+1)));
  let y=CONTENT_TOP+Math.round((avail-blockHeight())/2);
  layers.push({input:quote.data,left:M+12,top:y});
  y+=quote.info.height+QUOTE_GAP;
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:y});
  y+=title.info.height;
  if(points.length){
    y+=RULE_GAP;
    deco+=`<path d="M${540-90} ${y+1}H${540+90}" stroke="${INK}" stroke-width="2"/>`;
    y+=2+RULE_GAP;
    for(const [i,point] of points.entries()){
      layers.push({input:point.data,left:Math.round((1080-point.info.width)/2),top:y});
      y+=point.info.height+(i<points.length-1?pointGap:0);
    }
  }
  if(closing)deco+=placeClosing(layers,closing,y+CLOSING_GAP);
  // 오른쪽 가장자리에 세로로 돌린 잡지 이름(책등처럼 위에서 아래로 읽힌다).
  const spineText=await eyebrow("묵동홍어마을  ·  홍어 이야기",28,GREY,900);
  const spine=await rotated(spineText.data,90);
  layers.push({input:spine.data,left:1080-44-Math.round(spine.info.width/2),top:Math.round((CONTENT_TOP+CONTENT_BOTTOM-spine.info.height)/2)});
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap([svgLayer(deco),...layers])).jpeg({quality:92}).toBuffer();
}

export const renderEditorial:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const variant=slide.variant??0;
  if(content.kind==="cover")return renderCover(inputs,content,variant);
  if(content.kind==="photos")return renderPhotosPage(inputs,content);
  if(content.kind==="photo")return renderPhotoPage(inputs,content);
  return renderTextPage(content);
};
