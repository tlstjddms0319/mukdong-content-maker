import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";
import type { CarouselSlidePlan } from "./carousel";
import { DEFAULT_SLIDE_LAYOUT, STORE_NAME, slideEyebrow, type SlideLayout } from "./slideLayout";
import { type CardLayout, type DesignSpec, type Palette, normalizeCardLayout, paletteOf } from "./design";

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
type Layer={data:Buffer;info:{width:number;height:number}};

// Pango는 한글 음절 사이 어디서든 줄을 바꿔 "놀\n랄까요?"처럼 단어가 잘린다. 공백이 아닌 글자 사이에
// 단어 결합자(U+2060)를 넣어 띄어쓰기 자리에서만 줄이 바뀌게 한다. 너무 긴 단어만 글자 단위로 나뉜다.
const breakOnlyAtSpaces=(value:string)=>value.replace(/(\S)(?=\S)/g,"$1⁠");

// 제목·요점·라벨이 모두 같은 경로로 그려지도록 하는 공용 텍스트 레이어. 결과의 info.height로 다음 요소 위치를 잡는다.
async function textLayer(value:string,style:TextStyle):Promise<Layer> {
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

export async function renderSlideHeadline(headline:string,options:{size?:number;color?:string;align?:"left"|"centre";height?:number;width?:number;balance?:boolean}={}) {
  const text=(options.balance??true)?balanceHeadline(headline):headline.replace(/\s+/g," ").trim();
  return textLayer(text,{size:options.size??58,color:options.color??"#ffffff",width:options.width??936,height:options.height??190,align:options.align,spacing:8});
}

// 요점 2~4줄을 한 덩어리로. 사진 위에서는 불릿 목록으로 쓴다.
export async function renderSlidePoints(points:string[],options:{bullets?:boolean;color?:string;size?:number;align?:"left"|"centre";height?:number}={}) {
  const lines=cleanPoints(points);
  if(!lines.length)return null;
  const bullets=options.bullets??true;
  return textLayer(lines.map(line=>bullets?`•  ${line}`:line).join("\n"),{size:options.size??36,color:options.color??"#ffffff",width:936,height:options.height??320,font:FONTS.regular,align:options.align,spacing:16});
}

const cleanPoints=(points:string[]|undefined)=>(points??[]).map(point=>point.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,4);

// 모서리를 둥글게 자른 사진 레이어. radius 0이면 그대로 자른다.
async function croppedPhoto(input:Buffer,width:number,height:number,radius:number){
  const photo=await sharp(input).rotate().resize(width,height,{fit:"cover"}).png().toBuffer();
  if(!radius)return photo;
  const mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  return sharp(photo).composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
}

const svgLayer=(body:string):OverlayOptions=>({input:Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">${body}</svg>`),left:0,top:0});
const canvas=(background:string,layers:OverlayOptions[])=>sharp({create:{width:1080,height:1350,channels:3,background}}).composite(layers).jpeg({quality:92}).toBuffer();

const POINT_GAP=28;
const MARGIN=72,CONTENT=1080-MARGIN*2,FOOTER_TOP=1262;

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
async function footerLayers(index:number,total:number,cover:boolean,colors:{line:string;brand:string;right:string}):Promise<OverlayOptions[]> {
  const brand=await textLayer(STORE_NAME,{size:24,color:colors.brand,width:600,height:34,font:FONTS.regular});
  const right=cover
    ? await textLayer("다음 장으로 →",{size:24,color:colors.right,width:300,height:34,font:FONTS.semibold})
    : await textLayer(`${index} / ${total}`,{size:24,color:colors.right,width:200,height:34,font:FONTS.semibold});
  return [
    svgLayer(`<path d="M${MARGIN} ${FOOTER_TOP}H${1080-MARGIN}" stroke="${colors.line}" stroke-opacity=".22" stroke-width="2"/>`),
    {input:brand.data,left:MARGIN,top:1284},
    {input:right.data,left:1080-MARGIN-right.info.width,top:1284},
  ];
}

// 요점 목록: 강조점(또는 번호)과 보통 굵기 글. cursor부터 아래로 쌓고 끝 위치를 돌려준다.
async function pointLayers(lines:string[],top:number,palette:Palette,options:{numbered?:boolean;color?:string;markerColor?:string;size?:number}={}):Promise<{layers:OverlayOptions[];bottom:number}> {
  const size=options.size??32,color=options.color??palette.ink,markerColor=options.markerColor??palette.accent;
  const indent=options.numbered?88:40;
  const layers:OverlayOptions[]=[];
  let cursor=top;
  for(const [i,line] of lines.entries()){
    const text=await textLayer(line,{size,color,width:CONTENT-indent,height:size*3,font:FONTS.regular,spacing:8});
    if(options.numbered){
      const number=await textLayer(String(i+1).padStart(2,"0"),{size:40,color:markerColor,width:80,height:52,font:FONTS.bold});
      layers.push({input:number.data,left:MARGIN,top:cursor-6});
    }else{
      layers.push(svgLayer(`<circle cx="${MARGIN+5}" cy="${cursor+Math.round(size*.6)}" r="5" fill="${markerColor}"/>`));
    }
    layers.push({input:text.data,left:MARGIN+indent,top:cursor});
    cursor+=Math.max(text.info.height,options.numbered?52:0)+(options.numbered?26:18);
  }
  return {layers,bottom:cursor};
}

// 표지: 사진이 위쪽을 꽉 채우고, 아래 종이 면에 라벨과 큰 제목을 왼쪽 정렬로 놓는다.
async function composeCoverBleed(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const PHOTO_HEIGHT=840;
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:26,color:palette.accent,width:CONTENT,height:40,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:72,color:palette.ink,align:"left",height:300,balance:false});
  return canvas(palette.paper,[
    {input:await croppedPhoto(input,1080,PHOTO_HEIGHT,0),left:0,top:0},
    {input:eyebrow.data,left:MARGIN,top:PHOTO_HEIGHT+52},
    {input:headline.data,left:MARGIN,top:PHOTO_HEIGHT+52+eyebrow.info.height+22},
    ...await footerLayers(index,total,true,{line:palette.ink,brand:palette.muted,right:palette.accent}),
  ]);
}

// 사진 위 설명: 라벨 → 제목 → 둥근 사진 → 강조점이 붙은 요점. 사진 높이는 제목·요점 길이에 맞춰 남는 공간으로 정한다.
async function composePhotoTop(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:24,color:palette.accent,width:CONTENT,height:36,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:58,color:palette.ink,align:"left",height:240,balance:false});
  const lines=cleanPoints(slide.points);
  // 요점이 차지할 높이를 먼저 재서 사진 높이를 정한다.
  const measured=await pointLayers(lines,0,palette);
  const headlineTop=MARGIN+eyebrow.info.height+18;
  const photoTop=headlineTop+headline.info.height+36;
  const photoHeight=Math.max(420,Math.min(700,FOOTER_TOP-44-(lines.length?measured.bottom+22:0)-photoTop));
  const points=await pointLayers(lines,photoTop+photoHeight+40,palette);
  return canvas(palette.paper,[
    {input:eyebrow.data,left:MARGIN,top:MARGIN},
    {input:headline.data,left:MARGIN,top:headlineTop},
    {input:await croppedPhoto(input,CONTENT,photoHeight,24),left:MARGIN,top:photoTop},
    ...points.layers,
    ...await footerLayers(index,total,false,{line:palette.ink,brand:palette.muted,right:palette.ink}),
  ]);
}

// 반반: 사진이 위 절반을 가장자리까지 채우고, 아래 종이 면에 라벨·제목·요점.
async function composeSplit(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:24,color:palette.accent,width:CONTENT,height:36,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:54,color:palette.ink,align:"left",height:200,balance:false});
  const lines=cleanPoints(slide.points);
  // 글 블록 높이를 먼저 재서, 사진이 남는 공간을 모두 차지하게 한다.
  const measured=await pointLayers(lines,0,palette,{size:30});
  const textHeight=48+eyebrow.info.height+16+headline.info.height+(lines.length?30+measured.bottom:0);
  const PHOTO_HEIGHT=Math.max(520,Math.min(820,FOOTER_TOP-44-textHeight));
  const headlineTop=PHOTO_HEIGHT+48+eyebrow.info.height+16;
  const points=await pointLayers(lines,headlineTop+headline.info.height+30,palette,{size:30});
  return canvas(palette.paper,[
    {input:await croppedPhoto(input,1080,PHOTO_HEIGHT,0),left:0,top:0},
    {input:eyebrow.data,left:MARGIN,top:PHOTO_HEIGHT+48},
    {input:headline.data,left:MARGIN,top:headlineTop},
    ...points.layers,
    ...await footerLayers(index,total,false,{line:palette.ink,brand:palette.muted,right:palette.ink}),
  ]);
}

// 큰 글자: 강조색 배경에 큰 제목과 요점. 사진은 아래쪽에 좁은 띠로만 들어가 리듬을 바꾼다.
async function composeStatement(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const STRIP_HEIGHT=300,STRIP_TOP=FOOTER_TOP-44-STRIP_HEIGHT;
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:24,color:palette.onAccent,width:CONTENT,height:36,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:72,color:palette.onAccent,align:"left",height:330,balance:false});
  const lines=cleanPoints(slide.points);
  // 라벨·제목·요점 블록을 사진 띠 위 공간의 가운데에 놓는다. 짧은 글이어도 위에 몰리지 않는다.
  const measured=await pointLayers(lines,0,palette,{size:30});
  const blockHeight=eyebrow.info.height+26+headline.info.height+(lines.length?40+measured.bottom:0);
  const blockTop=MARGIN+Math.max(0,Math.round((STRIP_TOP-48-MARGIN-blockHeight)/2));
  const headlineTop=blockTop+eyebrow.info.height+26;
  const points=await pointLayers(lines,headlineTop+headline.info.height+40,palette,{size:30,color:palette.onAccent,markerColor:palette.onAccent});
  return canvas(palette.accent,[
    svgLayer(`<rect x="${MARGIN}" y="${blockTop+eyebrow.info.height+8}" width="64" height="6" fill="${palette.onAccent}" fill-opacity=".7"/>`),
    {input:eyebrow.data,left:MARGIN,top:blockTop},
    {input:headline.data,left:MARGIN,top:headlineTop},
    ...points.layers,
    {input:await croppedPhoto(input,CONTENT,STRIP_HEIGHT,24),left:MARGIN,top:STRIP_TOP},
    ...await footerLayers(index,total,false,{line:palette.onAccent,brand:palette.onAccent,right:palette.onAccent}),
  ]);
}

// 순서: 제목 아래 작은 사진, 그 아래 번호가 크게 붙은 단계 목록.
async function composeSteps(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const eyebrow=await textLayer(slideEyebrow(slide.role,index),{size:24,color:palette.accent,width:CONTENT,height:36,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:56,color:palette.ink,align:"left",height:200,balance:false});
  const headlineTop=MARGIN+eyebrow.info.height+18;
  const photoTop=headlineTop+headline.info.height+32;
  const lines=cleanPoints(slide.points);
  // 단계 목록 높이를 먼저 재서 사진이 남는 공간을 채우게 한다.
  const measured=await pointLayers(lines,0,palette,{numbered:true,size:32});
  const PHOTO_HEIGHT=Math.max(360,Math.min(640,FOOTER_TOP-44-(lines.length?measured.bottom+44:0)-photoTop));
  const points=await pointLayers(lines,photoTop+PHOTO_HEIGHT+44,palette,{numbered:true,size:32});
  return canvas(palette.paper,[
    {input:eyebrow.data,left:MARGIN,top:MARGIN},
    {input:headline.data,left:MARGIN,top:headlineTop},
    {input:await croppedPhoto(input,CONTENT,PHOTO_HEIGHT,24),left:MARGIN,top:photoTop},
    ...points.layers,
    ...await footerLayers(index,total,false,{line:palette.ink,brand:palette.muted,right:palette.ink}),
  ]);
}

const CARD_RENDERERS:Record<CardLayout,(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,palette:Palette)=>Promise<Buffer>>={
  "cover-bleed":composeCoverBleed,
  "photo-top":composePhotoTop,
  split:composeSplit,
  statement:composeStatement,
  steps:composeSteps,
};

export async function composeSlideImage(input:Buffer,slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT,design?:DesignSpec):Promise<Buffer> {
  await access(FONTS.bold.file);
  if(layout==="overlay")return composeOverlay(input,slide,index,total);
  return CARD_RENDERERS[normalizeCardLayout(slide.role,slide.layout)](input,slide,index,total,paletteOf(design));
}
