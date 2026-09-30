import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";
import type { CarouselSlidePlan } from "./carousel";
import { DEFAULT_SLIDE_LAYOUT, STORE_NAME, slideEyebrow, type SlideLayout } from "./slideLayout";

function escapeXml(value:string):string {
  return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]!);
}

// 제목은 굵게, 본문은 보통 굵기, 라벨·번호는 중간 굵기. 굵은 글꼴 하나로 모든 글자를 찍으면 위계가 사라진다.
const FONT_DIR=path.join(process.cwd(),"assets/fonts");
type Font={file:string;family:string};
export const FONTS={
  bold:{file:path.join(FONT_DIR,"Pretendard-Bold.otf"),family:"Pretendard Bold"},
  semibold:{file:path.join(FONT_DIR,"Pretendard-SemiBold.otf"),family:"Pretendard SemiBold"},
  regular:{file:path.join(FONT_DIR,"Pretendard-Regular.otf"),family:"Pretendard"},
} as const satisfies Record<string,Font>;

type TextStyle={size:number;color:string;width:number;height:number;font?:Font;align?:"left"|"centre";spacing?:number};

// 제목·요점·라벨이 모두 같은 경로로 그려지도록 하는 공용 텍스트 레이어. 결과의 info.height로 다음 요소 위치를 잡는다.
// Pango는 한글 음절 사이 어디서든 줄을 바꿔 "놀\n랄까요?"처럼 단어가 잘린다. 공백이 아닌 글자 사이에
// 단어 결합자(U+2060)를 넣어 띄어쓰기 자리에서만 줄이 바뀌게 한다. 너무 긴 단어만 글자 단위로 나뉜다.
const breakOnlyAtSpaces=(value:string)=>value.replace(/(\S)(?=\S)/g,"$1\u2060");

async function textLayer(value:string,style:TextStyle) {
  const font=style.font??FONTS.bold;
  await access(font.file);
  return sharp({text:{text:`<span foreground="${style.color}">${escapeXml(breakOnlyAtSpaces(value))}</span>`,font:`${font.family} ${style.size}`,fontfile:font.file,width:style.width,wrap:"word-char",align:style.align??"left",spacing:style.spacing??12,rgba:true}})
    .resize({width:style.width,height:style.height,fit:"inside",withoutEnlargement:true})
    .png().toBuffer({resolveWithObject:true});
}

function balanceHeadline(headline:string){
  const title=headline.replace(/\s+/g," ").trim();
  const breaks=[...title.matchAll(/ /g)].map(match=>match.index!);
  const split=breaks.sort((a,b)=>Math.abs(a-title.length/2)-Math.abs(b-title.length/2))[0]??Math.ceil(title.length/2);
  return title.length>18?`${title.slice(0,split).trim()}\n${title.slice(split).trim()}`:title;
}

export async function renderSlideHeadline(headline:string,options:{size?:number;color?:string;align?:"left"|"centre";height?:number;balance?:boolean}={}) {
  const text=(options.balance??true)?balanceHeadline(headline):headline.replace(/\s+/g," ").trim();
  return textLayer(text,{size:options.size??58,color:options.color??"#ffffff",width:936,height:options.height??190,align:options.align,spacing:8});
}

// 요점 2~4줄을 한 덩어리로. 사진 위에서는 불릿 목록으로 쓴다.
export async function renderSlidePoints(points:string[],options:{bullets?:boolean;color?:string;size?:number;align?:"left"|"centre";height?:number}={}) {
  const lines=points.map(point=>point.replace(/\s+/g," ").trim()).filter(Boolean);
  if(!lines.length)return null;
  const bullets=options.bullets??true;
  return textLayer(lines.map(line=>bullets?`•  ${line}`:line).join("\n"),{size:options.size??36,color:options.color??"#ffffff",width:936,height:options.height??320,font:FONTS.regular,align:options.align,spacing:16});
}

// 모서리를 둥글게 자른 사진 레이어. radius 0이면 그대로 자른다.
async function croppedPhoto(input:Buffer,width:number,height:number,radius:number){
  const photo=await sharp(input).rotate().resize(width,height,{fit:"cover"}).png().toBuffer();
  if(!radius)return photo;
  const mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  return sharp(photo).composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
}

const svgLayer=(body:string):OverlayOptions=>({input:Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">${body}</svg>`),left:0,top:0});

const POINT_GAP=28;
const paper="#f6f2ea",ink="#1f2b27",muted="#6d746f",accent="#c65138";
const MARGIN=72,CONTENT=1080-MARGIN*2;

async function composeOverlay(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const headline=await renderSlideHeadline(slide.headline);
  const points=await renderSlidePoints(slide.points??[]);
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:26,color:"#ffffffcc",width:936,height:40,font:FONTS.semibold});
  // 요점이 있으면 글자 영역이 커지므로 어두운 그라데이션도 더 넓게 깐다.
  const shadeSpan=points?.info.height?Math.min(.62,.42+(points.info.height+POINT_GAP)/1350):.42;
  const gradient=slide.textPosition==="top"
    ? `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".74"/><stop offset="${shadeSpan.toFixed(2)}" stop-color="#000" stop-opacity="0"/></linearGradient>`
    : `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="${(1-shadeSpan-.03).toFixed(2)}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></linearGradient>`;
  const overlay=Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg"><defs>${gradient}</defs><rect width="1080" height="1350" fill="url(#shade)"/></svg>`);
  const counter=await textLayer(`${index} / ${total}`,{size:30,color:"#ffffff",width:200,height:40,font:FONTS.semibold});

  // 라벨 → 제목 → 요점을 한 블록으로 잡고, 위(top)면 72px에서 시작, 아래(bottom)면 카운터 위 1200px에서 끝나게 놓는다.
  const eyebrowSpace=eyebrow.info.height+14;
  const blockHeight=eyebrowSpace+headline.info.height+(points?POINT_GAP+points.info.height:0);
  const blockTop=slide.textPosition==="top"?72:1200-blockHeight;
  const layers:OverlayOptions[]=[{input:overlay},{input:eyebrow.data,left:72,top:blockTop},{input:headline.data,left:72,top:blockTop+eyebrowSpace}];
  if(points)layers.push({input:points.data,left:72,top:blockTop+eyebrowSpace+headline.info.height+POINT_GAP});
  layers.push({input:counter.data,left:1008-counter.info.width,top:1250});
  return sharp(input).rotate().resize(1080,1350,{fit:"cover"}).composite(layers).jpeg({quality:90}).toBuffer();
}

// 하단 브랜드 줄. 왼쪽은 가게 이름, 오른쪽은 표지면 넘김 안내, 본문이면 장 번호.
async function footerLayers(index:number,total:number,cover:boolean):Promise<OverlayOptions[]> {
  const brand=await textLayer(STORE_NAME,{size:24,color:muted,width:600,height:34,font:FONTS.regular});
  const right=cover
    ? await textLayer("다음 장으로 →",{size:24,color:accent,width:300,height:34,font:FONTS.semibold})
    : await textLayer(`${index} / ${total}`,{size:24,color:ink,width:200,height:34,font:FONTS.semibold});
  return [
    svgLayer(`<path d="M${MARGIN} 1262H${1080-MARGIN}" stroke="${ink}" stroke-opacity=".18" stroke-width="2"/>`),
    {input:brand.data,left:MARGIN,top:1284},
    {input:right.data,left:1080-MARGIN-right.info.width,top:1284},
  ];
}

// 표지: 사진이 위쪽을 꽉 채우고, 아래 종이 면에 라벨과 큰 제목을 왼쪽 정렬로 놓는다.
async function composeCover(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const PHOTO_HEIGHT=840;
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:26,color:accent,width:CONTENT,height:40,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:72,color:ink,align:"left",height:300,balance:false});
  const layers:OverlayOptions[]=[
    {input:await croppedPhoto(input,1080,PHOTO_HEIGHT,0),left:0,top:0},
    {input:eyebrow.data,left:MARGIN,top:PHOTO_HEIGHT+52},
    {input:headline.data,left:MARGIN,top:PHOTO_HEIGHT+52+eyebrow.info.height+22},
    ...await footerLayers(index,total,true),
  ];
  return sharp({create:{width:1080,height:1350,channels:3,background:paper}}).composite(layers).jpeg({quality:92}).toBuffer();
}

// 본문: 라벨 → 제목 → 둥근 사진 → 강조점이 붙은 요점 → 브랜드 줄. 사진 높이는 제목·요점 길이에 맞춰 남는 공간으로 정한다.
async function composeBody(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const FOOTER_TOP=1262,PHOTO_RADIUS=24,BULLET=10,BULLET_GAP=30;
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:24,color:accent,width:CONTENT,height:36,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:58,color:ink,align:"left",height:240,balance:false});
  const lines=(slide.points??[]).map(point=>point.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,4);
  const points=await Promise.all(lines.map(line=>textLayer(line,{size:32,color:ink,width:CONTENT-BULLET-BULLET_GAP,height:96,font:FONTS.regular,spacing:8})));
  const pointsHeight=points.reduce((sum,point,i)=>sum+point.info.height+(i?18:0),0);

  const layers:OverlayOptions[]=[{input:eyebrow.data,left:MARGIN,top:MARGIN}];
  const headlineTop=MARGIN+eyebrow.info.height+18;
  layers.push({input:headline.data,left:MARGIN,top:headlineTop});
  const photoTop=headlineTop+headline.info.height+36;
  const photoHeight=Math.max(420,Math.min(700,FOOTER_TOP-44-(points.length?pointsHeight+40:0)-photoTop));
  layers.push({input:await croppedPhoto(input,CONTENT,photoHeight,PHOTO_RADIUS),left:MARGIN,top:photoTop});

  let cursor=photoTop+photoHeight+40;
  for(const point of points){
    layers.push(svgLayer(`<circle cx="${MARGIN+BULLET/2}" cy="${cursor+19}" r="${BULLET/2}" fill="${accent}"/>`));
    layers.push({input:point.data,left:MARGIN+BULLET+BULLET_GAP,top:cursor});
    cursor+=point.info.height+18;
  }
  layers.push(...await footerLayers(index,total,false));
  return sharp({create:{width:1080,height:1350,channels:3,background:paper}}).composite(layers).jpeg({quality:92}).toBuffer();
}

export async function composeSlideImage(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT):Promise<Buffer> {
  await access(FONTS.bold.file);
  if(layout==="overlay")return composeOverlay(input,slide,index,total);
  return slide.role==="cover"?composeCover(input,slide,index,total):composeBody(input,slide,index,total);
}
