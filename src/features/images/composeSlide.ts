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

const svg=(width:number,height:number,body:string)=>Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
const svgLayer=(body:string):OverlayOptions=>({input:svg(1080,1350,body),left:0,top:0});
const canvas=(background:string,layers:OverlayOptions[])=>sharp({create:{width:1080,height:1350,channels:3,background}}).composite(layers).jpeg({quality:92}).toBuffer();

const MARGIN=72,CONTENT=1080-MARGIN*2;

// 요점 목록: 강조점(또는 번호)과 보통 굵기 글. top부터 아래로 쌓고 끝 위치를 돌려준다.
async function pointLayers(lines:string[],top:number,options:{left?:number;width?:number;numbered?:boolean;color:string;markerColor:string;size?:number;align?:"left"|"centre"}):Promise<{layers:OverlayOptions[];bottom:number}> {
  const size=options.size??32,left=options.left??MARGIN,width=options.width??CONTENT;
  const indent=options.align==="centre"?0:options.numbered?88:40;
  const layers:OverlayOptions[]=[];
  let cursor=top;
  for(const [i,line] of lines.entries()){
    const text=await textLayer(line,{size,color:options.color,width:width-indent,height:size*3,font:FONTS.regular,spacing:8,align:options.align});
    if(options.align==="centre"){
      layers.push({input:text.data,left:left+Math.round((width-text.info.width)/2),top:cursor});
    }else{
      if(options.numbered){
        const number=await textLayer(String(i+1).padStart(2,"0"),{size:36,color:options.markerColor,width:80,height:48,font:FONTS.bold});
        layers.push({input:number.data,left,top:cursor-4});
      }else{
        // 강조점은 작은 레이어로 그린다. 카드처럼 작은 캔버스 안에서도 합성할 수 있어야 한다.
        layers.push({input:svg(12,12,`<circle cx="6" cy="6" r="5" fill="${options.markerColor}"/>`),left:left-1,top:cursor+Math.round(size*.6)-6});
      }
      layers.push({input:text.data,left:left+indent,top:cursor});
    }
    cursor+=Math.max(text.info.height,options.numbered?48:0)+(options.numbered?24:16);
  }
  return {layers,bottom:cursor};
}

// 1. 감성 풀스크린: 사진이 화면을 채우고, 위 오른쪽에 작은 채널명, 아래 가운데에 작은 부제와 굵은 흰 제목.
async function composeFullscreen(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const white="#ffffff";
  const brand=await textLayer(STORE_NAME,{size:24,color:"#ffffffd9",width:400,height:34,font:FONTS.semibold});
  const corner=slide.role==="cover"
    ? await textLayer("음식 이야기",{size:24,color:"#ffffffd9",width:400,height:34,font:FONTS.semibold})
    : await textLayer(`${index} / ${total}`,{size:24,color:"#ffffffd9",width:200,height:34,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:slide.role==="cover"?72:62,color:white,align:"centre",height:280,balance:false});
  const lines=cleanPoints(slide.points).slice(0,3);
  const sub=lines.length?await textLayer(lines.join("\n"),{size:28,color:"#ffffffe6",width:CONTENT,height:140,font:FONTS.regular,align:"centre",spacing:10}):null;
  const BOTTOM=1350-116;
  const headlineTop=BOTTOM-headline.info.height;
  const subTop=sub?headlineTop-22-sub.info.height:headlineTop;
  // 글자 블록이 차지하는 만큼 아래쪽 그라데이션을 넓힌다.
  const shadeStart=Math.max(.38,(subTop-220)/1350);
  const layers:OverlayOptions[]=[
    svgLayer(`<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="${shadeStart.toFixed(2)}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></linearGradient><linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".18" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#shade)"/><rect width="1080" height="1350" fill="url(#top)"/>`),
    {input:corner.data,left:MARGIN,top:64},
    {input:brand.data,left:1080-MARGIN-brand.info.width,top:64},
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:headlineTop},
  ];
  if(sub)layers.push({input:sub.data,left:Math.round((1080-sub.info.width)/2),top:subTop});
  return sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover"}).composite(layers).jpeg({quality:90}).toBuffer();
}

// 2. 대조 프레임: 같은 사진을 흐리고 어둡게 깔고, 가운데 얇은 흰 테두리 프레임 안에 선명한 장면. 아래에 흰 제목과 설명.
async function composeFrame(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const white="#ffffff";
  const headline=await renderSlideHeadline(slide.headline,{size:52,color:white,align:"centre",height:200,balance:false});
  const lines=cleanPoints(slide.points).slice(0,3);
  const sub=lines.length?await textLayer(lines.join("\n"),{size:28,color:"#ffffffe0",width:CONTENT,height:150,font:FONTS.regular,align:"centre",spacing:10}):null;
  const textHeight=headline.info.height+(sub?18+sub.info.height:0);
  const FRAME_TOP=150,FRAME_WIDTH=760;
  const frameHeight=Math.max(560,Math.min(860,1290-48-textHeight-44-FRAME_TOP));
  const frameLeft=Math.round((1080-FRAME_WIDTH)/2);
  const textTop=FRAME_TOP+frameHeight+44;
  const background=await sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover"}).blur(26).modulate({brightness:.62,saturation:.85}).png().toBuffer();
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:"#ffffffcc",width:200,height:34,font:FONTS.semibold});
  const brand=await textLayer(STORE_NAME,{size:24,color:"#ffffffcc",width:400,height:34,font:FONTS.semibold});
  const layers:OverlayOptions[]=[
    {input:await croppedPhoto(inputs[0],FRAME_WIDTH,frameHeight,0),left:frameLeft,top:FRAME_TOP},
    svgLayer(`<rect x="${frameLeft-10}" y="${FRAME_TOP-10}" width="${FRAME_WIDTH+20}" height="${frameHeight+20}" fill="none" stroke="${white}" stroke-width="4"/>`),
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:textTop},
    {input:brand.data,left:MARGIN,top:1296},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:1296},
  ];
  if(sub)layers.push({input:sub.data,left:Math.round((1080-sub.info.width)/2),top:textTop+headline.info.height+18});
  return sharp(background).composite(layers).jpeg({quality:90}).toBuffer();
}

// 3. 일러스트 설명: 파스텔 배경 위에 살짝 기울어진 흰 카드. 카드 안에 강조색 제목, 그림, 본문. 아래에 노란 말풍선.
async function composeIllustration(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const CARD_W=900,PAD=56,TILT=-3,PHOTO_H=460;
  const lines=cleanPoints(slide.points);
  const bubbleText=lines.length>1?lines[lines.length-1]:slide.keywords[0]?`#${slide.keywords.join(" #")}`:"";
  const bodyLines=lines.length>1?lines.slice(0,-1):lines;
  const headline=await renderSlideHeadline(slide.headline,{size:46,color:palette.accent,align:"left",width:CARD_W-PAD*2,height:170,balance:false});
  const photoTop=PAD+headline.info.height+28;
  const points=await pointLayers(bodyLines,photoTop+PHOTO_H+32,{left:PAD,width:CARD_W-PAD*2,color:"#2a2a2a",markerColor:palette.accent,size:28});
  // 카드 높이는 내용에 맞춘다. 비어 있는 카드 아래쪽이 남지 않는다.
  const CARD_H=Math.max(820,Math.min(1080,(bodyLines.length?points.bottom:photoTop+PHOTO_H)+PAD+8));
  const card=await sharp({create:{width:CARD_W,height:CARD_H,channels:4,background:"#fffdf8"}})
    .composite([
      {input:svg(CARD_W,CARD_H,`<rect width="${CARD_W}" height="${CARD_H}" rx="14" fill="#fffdf8"/>`),left:0,top:0},
      {input:headline.data,left:PAD,top:PAD},
      {input:await croppedPhoto(inputs[0],CARD_W-PAD*2,PHOTO_H,18),left:PAD,top:photoTop},
      ...points.layers,
    ]).png().toBuffer();
  // 카드를 살짝 기울이고(투명 배경), 그 뒤에 같은 각도의 옅은 그림자를 깐다.
  const tilted=await sharp(card).rotate(TILT,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  const cardLeft=Math.round((1080-tilted.info.width)/2),cardTop=Math.max(72,Math.round((1350-tilted.info.height)/2)-30);
  const cx=cardLeft+tilted.info.width/2,cy=cardTop+tilted.info.height/2;
  const layers:OverlayOptions[]=[
    svgLayer(`<rect x="${Math.round(cx-CARD_W/2)+14}" y="${Math.round(cy-CARD_H/2)+18}" width="${CARD_W}" height="${CARD_H}" rx="14" fill="#000" fill-opacity=".14" transform="rotate(${TILT} ${cx} ${cy})"/>`),
    {input:tilted.data,left:cardLeft,top:cardTop},
  ];
  if(bubbleText){
    // 노란 말풍선은 카드의 오른쪽 아래 모서리에 살짝 걸친다. 꼬리는 왼쪽 아래로 뻗는다.
    const text=await textLayer(bubbleText,{size:28,color:"#2a2a2a",width:700,height:80,font:FONTS.bold,spacing:6});
    const bw=text.info.width+72,bh=text.info.height+40;
    const bx=1080-MARGIN-bw,by=Math.min(cardTop+tilted.info.height-Math.round(bh/2)-20,1350-110-bh);
    layers.push(svgLayer(`<rect x="${bx+8}" y="${by+10}" width="${bw}" height="${bh}" rx="28" fill="#000" fill-opacity=".12"/><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="28" fill="${palette.highlight}"/><path d="M${bx+54} ${by+bh-6}l-26 40 56-12z" fill="${palette.highlight}"/>`));
    layers.push({input:text.data,left:bx+36,top:by+20});
  }
  const brand=await textLayer(`${STORE_NAME} · ${index} / ${total}`,{size:22,color:palette.ink,width:500,height:32,font:FONTS.semibold});
  layers.push({input:brand.data,left:MARGIN,top:1350-MARGIN-20});
  return canvas(palette.soft,layers);
}

// 4. 사진 콜라주: 밝은 바탕에 큰 제목과 설명, 사진 격자, 남은 요점, 태그 알약.
async function composeCollage(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const headline=await renderSlideHeadline(slide.headline,{size:56,color:palette.ink,align:"left",height:200,balance:false});
  const lines=cleanPoints(slide.points);
  const sub=lines[0]?await textLayer(lines[0],{size:30,color:palette.muted,width:CONTENT,height:90,font:FONTS.regular,spacing:8}):null;
  const gridTop=MARGIN+headline.info.height+(sub?16+sub.info.height:0)+36;
  const photos=inputs.slice(0,3);
  const rest=lines.slice(1,3);
  const tags=slide.keywords.slice(0,3);
  // 아래 요점·태그에 필요한 높이를 빼고 남는 만큼 격자를 키운다.
  const reserved=(rest.length?rest.length*48+24:0)+(tags.length?70:0)+44;
  const gridHeight=Math.max(420,Math.min(640,1262-reserved-gridTop));
  const GAP=20;
  const layers:OverlayOptions[]=[{input:headline.data,left:MARGIN,top:MARGIN}];
  if(sub)layers.push({input:sub.data,left:MARGIN,top:MARGIN+headline.info.height+16});
  if(photos.length>=3){
    const leftW=Math.round(CONTENT*.58),rightW=CONTENT-leftW-GAP,halfH=Math.round((gridHeight-GAP)/2);
    layers.push({input:await croppedPhoto(photos[0],leftW,gridHeight,18),left:MARGIN,top:gridTop});
    layers.push({input:await croppedPhoto(photos[1],rightW,halfH,18),left:MARGIN+leftW+GAP,top:gridTop});
    layers.push({input:await croppedPhoto(photos[2],rightW,gridHeight-halfH-GAP,18),left:MARGIN+leftW+GAP,top:gridTop+halfH+GAP});
  }else if(photos.length===2){
    const w=Math.round((CONTENT-GAP)/2);
    layers.push({input:await croppedPhoto(photos[0],w,gridHeight,18),left:MARGIN,top:gridTop});
    layers.push({input:await croppedPhoto(photos[1],CONTENT-w-GAP,gridHeight,18),left:MARGIN+w+GAP,top:gridTop});
  }else{
    layers.push({input:await croppedPhoto(photos[0],CONTENT,gridHeight,18),left:MARGIN,top:gridTop});
  }
  let cursor=gridTop+gridHeight+32;
  if(rest.length){
    const points=await pointLayers(rest,cursor,{color:palette.ink,markerColor:palette.accent,size:28});
    layers.push(...points.layers);cursor=points.bottom+6;
  }
  if(tags.length){
    let x=MARGIN;
    for(const tag of tags){
      const text=await textLayer(`#${tag}`,{size:26,color:palette.ink,width:400,height:36,font:FONTS.semibold});
      const w=text.info.width+44;
      layers.push(svgLayer(`<rect x="${x}" y="${cursor}" width="${w}" height="52" rx="26" fill="${palette.soft}"/>`));
      layers.push({input:text.data,left:x+22,top:cursor+Math.round((52-text.info.height)/2)});
      x+=w+12;
    }
  }
  const brand=await textLayer(STORE_NAME,{size:24,color:palette.muted,width:600,height:34,font:FONTS.regular});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:palette.ink,width:200,height:34,font:FONTS.semibold});
  layers.push(svgLayer(`<path d="M${MARGIN} 1262H${1080-MARGIN}" stroke="${palette.ink}" stroke-opacity=".2" stroke-width="2"/>`),{input:brand.data,left:MARGIN,top:1284},{input:counter.data,left:1080-MARGIN-counter.info.width,top:1284});
  return canvas(palette.paper,layers);
}

// 5. 브라우저 프레임: 파스텔 배경 위 검은 테두리 브라우저 창. 안에 굵은 제목, 번호 목록, 아래 돋보기 검색창 캡슐. 사진은 쓰지 않는다.
async function composeBrowser(slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const WIN_LEFT=MARGIN,WIN_W=CONTENT,BAR=66,PAD=52,capH=72;
  const ink="#141414";
  const headline=await renderSlideHeadline(slide.headline,{size:50,color:ink,align:"left",width:WIN_W-PAD*2,height:200,balance:false});
  const lines=cleanPoints(slide.points);
  // 창 높이는 내용에 맞추고, 창을 화면 가운데에 둔다. 글이 짧아도 빈 창이 남지 않는다.
  const measured=await pointLayers(lines,0,{left:WIN_LEFT+PAD,width:WIN_W-PAD*2,numbered:true,color:ink,markerColor:palette.accent,size:30});
  const WIN_H=Math.max(640,Math.min(1010,BAR+PAD+headline.info.height+36+measured.bottom+40+capH+PAD));
  const WIN_TOP=Math.max(96,Math.round((1350-WIN_H-90)/2));
  const contentTop=WIN_TOP+BAR+PAD;
  const points=await pointLayers(lines,contentTop+headline.info.height+36,{left:WIN_LEFT+PAD,width:WIN_W-PAD*2,numbered:true,color:ink,markerColor:palette.accent,size:30});
  const query=slide.keywords.length?slide.keywords.join(" "):slideEyebrow(slide.role,index).split(" · ").pop()??"";
  const search=await textLayer(query,{size:28,color:ink,width:WIN_W-PAD*2-160,height:40,font:FONTS.bold});
  const capW=Math.min(WIN_W-PAD*2,search.info.width+150),capX=WIN_LEFT+PAD,capY=WIN_TOP+WIN_H-PAD-capH;
  const brand=await textLayer(STORE_NAME,{size:24,color:palette.ink,width:600,height:34,font:FONTS.regular});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:palette.ink,width:200,height:34,font:FONTS.semibold});
  return canvas(palette.soft,[
    svgLayer(`<rect x="${WIN_LEFT+12}" y="${WIN_TOP+14}" width="${WIN_W}" height="${WIN_H}" rx="20" fill="#000" fill-opacity=".9"/>
      <rect x="${WIN_LEFT}" y="${WIN_TOP}" width="${WIN_W}" height="${WIN_H}" rx="20" fill="#ffffff" stroke="#000" stroke-width="5"/>
      <path d="M${WIN_LEFT} ${WIN_TOP+BAR}H${WIN_LEFT+WIN_W}" stroke="#000" stroke-width="5"/>
      <circle cx="${WIN_LEFT+38}" cy="${WIN_TOP+BAR/2}" r="11" fill="#000"/><circle cx="${WIN_LEFT+74}" cy="${WIN_TOP+BAR/2}" r="11" fill="#000"/><circle cx="${WIN_LEFT+110}" cy="${WIN_TOP+BAR/2}" r="11" fill="#000"/>
      <rect x="${capX}" y="${capY}" width="${capW}" height="${capH}" rx="36" fill="${palette.highlight}" stroke="#000" stroke-width="4"/>
      <circle cx="${capX+40}" cy="${capY+34}" r="12" fill="none" stroke="#000" stroke-width="4"/><path d="M${capX+49} ${capY+43}l12 12" stroke="#000" stroke-width="4" stroke-linecap="round"/>`),
    {input:headline.data,left:WIN_LEFT+PAD,top:contentTop},
    ...points.layers,
    {input:search.data,left:capX+78,top:capY+Math.round((capH-search.info.height)/2)},
    {input:brand.data,left:MARGIN,top:WIN_TOP+WIN_H+44},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:WIN_TOP+WIN_H+44},
  ]);
}

const CARD_RENDERERS:Record<CardLayout,(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette)=>Promise<Buffer>>={
  fullscreen:(inputs,slide,index,total)=>composeFullscreen(inputs,slide,index,total),
  frame:(inputs,slide,index,total)=>composeFrame(inputs,slide,index,total),
  illustration:composeIllustration,
  collage:composeCollage,
  browser:(_inputs,slide,index,total,palette)=>composeBrowser(slide,index,total,palette),
};

// 사진 한 장 또는 여러 장(콜라주)을 받아 한 장의 카드로 만든다. 브라우저형은 사진 없이 그린다.
export async function composeSlideImage(input:Buffer|Buffer[],slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT,design?:DesignSpec):Promise<Buffer> {
  await access(FONTS.bold.file);
  const inputs=Array.isArray(input)?input:[input];
  const card:CardLayout=layout==="overlay"?"fullscreen":normalizeCardLayout(slide.role,slide.layout);
  if(card!=="browser"&&!inputs.length)throw new Error("slide image required");
  return CARD_RENDERERS[card](inputs,slide,index,total,paletteOf(design));
}
