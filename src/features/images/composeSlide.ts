import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";
import type { CarouselSlidePlan } from "./carousel";
import { DEFAULT_SLIDE_LAYOUT, STORE_NAME, slideEyebrow, type SlideLayout } from "./slideLayout";

function escapeXml(value:string):string {
  return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]!);
}

const FONT_DIR=path.join(process.cwd(),"assets/fonts");
const boldFont={file:path.join(FONT_DIR,"NanumGothic-Bold.ttf"),family:"NanumGothic Bold"};
const regularFont={file:path.join(FONT_DIR,"NanumGothic-Regular.ttf"),family:"NanumGothic"};
const fontfile=boldFont.file;

// 본문은 얇은 글꼴이 있으면 그것을, 없으면 굵은 글꼴로 대체한다(배포본에는 Bold만 들어 있을 수 있다).
async function bodyFont(){
  try { await access(regularFont.file); return regularFont; } catch { return boldFont; }
}

type TextStyle={size:number;color:string;width:number;height:number;font?:{file:string;family:string};align?:"left"|"centre";spacing?:number};

// 제목·요점·라벨이 모두 같은 경로로 그려지도록 하는 공용 텍스트 레이어.
async function textLayer(value:string,style:TextStyle) {
  const font=style.font??boldFont;
  await access(font.file);
  return sharp({text:{text:`<span foreground="${style.color}">${escapeXml(value)}</span>`,font:`${font.family} ${style.size}`,fontfile:font.file,width:style.width,wrap:"word-char",align:style.align??"left",spacing:style.spacing??12,rgba:true}})
    .resize({width:style.width,height:style.height,fit:"inside",withoutEnlargement:true})
    .png().toBuffer({resolveWithObject:true});
}

function balanceHeadline(headline:string){
  const title=headline.replace(/\s+/g," ").trim();
  const breaks=[...title.matchAll(/ /g)].map(match=>match.index!);
  const split=breaks.sort((a,b)=>Math.abs(a-title.length/2)-Math.abs(b-title.length/2))[0]??Math.ceil(title.length/2);
  return title.length>18?`${title.slice(0,split).trim()}\n${title.slice(split).trim()}`:title;
}

export async function renderSlideHeadline(headline:string,options:{size?:number;color?:string;align?:"left"|"centre"}={}) {
  return textLayer(balanceHeadline(headline),{size:options.size??58,color:options.color??"#ffffff",width:936,height:190,align:options.align});
}

// 요점 2~4줄. 사진 위에서는 불릿 목록으로, 카드에서는 가운데 정렬 문단으로 그린다.
export async function renderSlidePoints(points:string[],options:{bullets?:boolean;color?:string;size?:number;align?:"left"|"centre";height?:number}={}) {
  const lines=points.map(point=>point.replace(/\s+/g," ").trim()).filter(Boolean);
  if(!lines.length)return null;
  const bullets=options.bullets??true;
  const font=bullets?boldFont:await bodyFont();
  return textLayer(lines.map(line=>bullets?`•  ${line}`:line).join("\n"),{size:options.size??36,color:options.color??"#ffffff",width:936,height:options.height??320,font,align:options.align,spacing:16});
}

// 모서리를 둥글게 자른 사진 레이어.
async function roundedPhoto(input:Buffer,width:number,height:number,radius:number){
  const photo=await sharp(input).rotate().resize(width,height,{fit:"cover"}).png().toBuffer();
  const mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  return sharp(photo).composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
}

const POINT_GAP=28;
const paper="#f5f1e8",ink="#193c32",muted="#65716a",accent="#c65138";

async function composeOverlay(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const headline=await renderSlideHeadline(slide.headline);
  const points=await renderSlidePoints(slide.points??[]);
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:26,color:"#ffffffcc",width:936,height:40});
  // 요점이 있으면 글자 영역이 커지므로 어두운 그라데이션도 더 넓게 깐다.
  const shadeSpan=points?.info.height?Math.min(.62,.42+(points.info.height+POINT_GAP)/1350):.42;
  const gradient=slide.textPosition==="top"
    ? `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".74"/><stop offset="${shadeSpan.toFixed(2)}" stop-color="#000" stop-opacity="0"/></linearGradient>`
    : `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="${(1-shadeSpan-.03).toFixed(2)}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></linearGradient>`;
  const overlay=Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg"><defs>${gradient}</defs><rect width="1080" height="1350" fill="url(#shade)"/></svg>`);
  const counter=await textLayer(`${index} / ${total}`,{size:30,color:"#ffffff",width:200,height:40});

  // 라벨 → 제목 → 요점을 한 블록으로 잡고, 위(top)면 72px에서 시작, 아래(bottom)면 카운터 위 1200px에서 끝나게 놓는다.
  const eyebrowSpace=eyebrow.info.height+14;
  const blockHeight=eyebrowSpace+headline.info.height+(points?POINT_GAP+points.info.height:0);
  const blockTop=slide.textPosition==="top"?72:1200-blockHeight;
  const layers:OverlayOptions[]=[{input:overlay},{input:eyebrow.data,left:72,top:blockTop},{input:headline.data,left:72,top:blockTop+eyebrowSpace}];
  if(points)layers.push({input:points.data,left:72,top:blockTop+eyebrowSpace+headline.info.height+POINT_GAP});
  layers.push({input:counter.data,left:1008-counter.info.width,top:1250});
  return sharp(input).rotate().resize(1080,1350,{fit:"cover"}).composite(layers).jpeg({quality:90}).toBuffer();
}

// 참고 템플릿(카드뉴스)의 문법: 상단 라벨, 큰 제목, 둥근 사진, 본문, 하단 브랜드 줄과 번호.
async function composeCard(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const cover=slide.role==="cover";
  const layers:OverlayOptions[]=[];
  const eyebrowText=slideEyebrow(slide.role,index);
  if(cover){
    // 표지 라벨은 강조색 필 안에 흰 글자.
    const label=await textLayer(eyebrowText,{size:26,color:"#ffffff",width:700,height:40});
    const pillWidth=label.info.width+64,pillLeft=Math.round((1080-pillWidth)/2);
    layers.push({input:Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect x="${pillLeft}" y="92" width="${pillWidth}" height="60" rx="30" fill="${accent}"/></svg>`),left:0,top:0});
    layers.push({input:label.data,left:pillLeft+32,top:92+Math.round((60-label.info.height)/2)});
  }else{
    const label=await textLayer(eyebrowText,{size:26,color:muted,width:700,height:40,align:"centre"});
    layers.push({input:label.data,left:Math.round((1080-label.info.width)/2),top:100});
  }
  const headline=await renderSlideHeadline(slide.headline,{size:cover?78:66,color:ink,align:"centre"});
  const headlineTop=cover?176:158;
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:headlineTop});

  const photoTop=cover?330:340,photoHeight=cover?890:650;
  layers.push({input:await roundedPhoto(input,952,photoHeight,28),left:64,top:photoTop});

  if(!cover){
    const points=await renderSlidePoints(slide.points??[],{bullets:false,color:ink,size:34,align:"centre",height:206});
    if(points)layers.push({input:points.data,left:Math.round((1080-points.info.width)/2),top:photoTop+photoHeight+32});
  }

  const brand=await textLayer(STORE_NAME,{size:24,color:muted,width:600,height:34});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:muted,width:200,height:34});
  layers.push({input:Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><path d="M64 1262H1016" stroke="${ink}" stroke-opacity=".25" stroke-width="2"/></svg>`),left:0,top:0});
  layers.push({input:brand.data,left:64,top:1284},{input:counter.data,left:1016-counter.info.width,top:1284});
  return sharp({create:{width:1080,height:1350,channels:3,background:paper}}).composite(layers).jpeg({quality:92}).toBuffer();
}

export async function composeSlideImage(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT):Promise<Buffer> {
  await access(fontfile);
  return layout==="overlay"?composeOverlay(input,slide,index,total):composeCard(input,slide,index,total);
}
