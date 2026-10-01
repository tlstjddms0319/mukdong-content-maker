import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";
import type { CarouselSlidePlan } from "./carousel";
import { DEFAULT_SLIDE_LAYOUT, STORE_NAME, slideEyebrow, type SlideLayout } from "./slideLayout";
import { type CardLayout, type DesignSpec, type Palette, inkOn, mutedOn, normalizeCardLayout, paletteOf, photosNeeded } from "./design";
import { blob, cornerMarks, dotGrid, grainLayer, mascotLayer, ring, softShadow, sparkles, stickerBadge, washiTape, wavyUnderline } from "./decor";

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
// 장식: 네 귀퉁이 크롭 마크, 제목 옆 작은 반짝이, 필름 그레인.
async function composeFullscreen(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
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
    svgLayer(cornerMarks({inset:34,length:46,color:white,opacity:.55})),
    {input:corner.data,left:MARGIN,top:64},
    {input:brand.data,left:1080-MARGIN-brand.info.width,top:64},
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:headlineTop},
  ];
  if(sub)layers.push({input:sub.data,left:Math.round((1080-sub.info.width)/2),top:subTop});
  // 제목 블록의 왼쪽 위와 오른쪽 아래에 반짝이를 하나씩. 글자와 겹치지 않게 블록 바깥에 둔다.
  const headlineLeft=Math.round((1080-headline.info.width)/2);
  layers.push(svgLayer(sparkles([[Math.max(40,headlineLeft-38),subTop-30,16],[Math.min(1040,headlineLeft+headline.info.width+34),headlineTop+headline.info.height-10,11]],palette.highlight,.95)));
  layers.push(await grainLayer({opacity:.2}));
  return sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover"}).composite(layers).jpeg({quality:90}).toBuffer();
}

// 2. 대조 프레임: 같은 사진을 흐리고 어둡게 깔고, 가운데 얇은 흰 테두리 프레임 안에 선명한 장면. 아래에 흰 제목과 설명.
// 장식: 프레임 뒤 부드러운 그림자, 양쪽 모서리에 마스킹 테이프, 필름 그레인.
async function composeFrame(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
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
    svgLayer(softShadow({x:frameLeft-10,y:FRAME_TOP-2,width:FRAME_WIDTH+20,height:frameHeight+20,rx:2,blur:22,opacity:.45})),
    {input:await croppedPhoto(inputs[0],FRAME_WIDTH,frameHeight,0),left:frameLeft,top:FRAME_TOP},
    svgLayer(`<rect x="${frameLeft-10}" y="${FRAME_TOP-10}" width="${FRAME_WIDTH+20}" height="${frameHeight+20}" fill="none" stroke="${white}" stroke-width="4"/>`
      +washiTape({x:frameLeft-70,y:FRAME_TOP-14,width:200,color:palette.highlight,angle:-14,opacity:.82})
      +washiTape({x:frameLeft+FRAME_WIDTH-130,y:FRAME_TOP+frameHeight-30,width:200,color:palette.highlight,angle:10,opacity:.82})),
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:textTop},
    {input:brand.data,left:MARGIN,top:1296},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:1296},
  ];
  if(sub)layers.push({input:sub.data,left:Math.round((1080-sub.info.width)/2),top:textTop+headline.info.height+18});
  layers.push(await grainLayer({opacity:.18}));
  return sharp(background).composite(layers).jpeg({quality:90}).toBuffer();
}

// 3. 일러스트 설명: 파스텔 배경 위에 살짝 기울어진 흰 카드. 카드 안에 강조색 제목, 그림, 본문. 아래에 노란 말풍선.
// 장식: 배경 블롭과 점 무늬, 카드 뒤 번진 그림자, 카드 모서리 마스킹 테이프, 제목 밑 물결 밑줄, 말풍선 옆 반짝이,
// 카드 왼쪽 아래에서 고개를 내미는 마스코트, 종이 질감.
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
      // 제목 마지막 줄 아래에 짧은 물결 밑줄. 제목과 사진 사이 여백 안에 들어간다.
      {input:svg(CARD_W,CARD_H,wavyUnderline({x:PAD,y:PAD+headline.info.height+12,width:Math.min(300,headline.info.width),color:palette.highlight,strokeWidth:6})),left:0,top:0},
      {input:await croppedPhoto(inputs[0],CARD_W-PAD*2,PHOTO_H,18),left:PAD,top:photoTop},
      ...points.layers,
    ]).png().toBuffer();
  // 카드를 살짝 기울이고(투명 배경), 그 뒤에 같은 각도의 번진 그림자를 깐다.
  const tilted=await sharp(card).rotate(TILT,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  const cardLeft=Math.round((1080-tilted.info.width)/2),cardTop=Math.max(72,Math.round((1350-tilted.info.height)/2)-30);
  const cx=cardLeft+tilted.info.width/2,cy=cardTop+tilted.info.height/2;
  const layers:OverlayOptions[]=[
    // 배경 장식은 카드 뒤에. 오른쪽 위 밝은 덩어리, 왼쪽 아래 옅은 강조색 덩어리, 오른쪽 아래 점 무늬.
    svgLayer(blob({cx:940,cy:150,r:230,color:palette.highlight,opacity:.42,seed:3})+blob({cx:120,cy:1180,r:190,color:palette.accent,opacity:.12,seed:9})+dotGrid({x:760,y:1010,width:280,height:250,color:palette.ink,opacity:.22})),
    svgLayer(softShadow({x:Math.round(cx-CARD_W/2)+6,y:Math.round(cy-CARD_H/2)+22,width:CARD_W,height:CARD_H,rx:14,blur:20,opacity:.2,rotate:TILT})),
    {input:tilted.data,left:cardLeft,top:cardTop},
    svgLayer(washiTape({x:cardLeft+2,y:cardTop+6,width:210,color:palette.highlight,angle:-12,opacity:.8})),
  ];
  if(bubbleText){
    // 노란 말풍선은 카드의 오른쪽 아래 모서리에 살짝 걸친다. 꼬리는 왼쪽 아래로 뻗는다.
    const text=await textLayer(bubbleText,{size:28,color:"#2a2a2a",width:700,height:80,font:FONTS.bold,spacing:6});
    const bw=text.info.width+72,bh=text.info.height+40;
    const bx=1080-MARGIN-bw,by=Math.min(cardTop+tilted.info.height-Math.round(bh/2)-20,1350-110-bh);
    layers.push(svgLayer(`<rect x="${bx+8}" y="${by+10}" width="${bw}" height="${bh}" rx="28" fill="#000" fill-opacity=".12"/><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="28" fill="${palette.highlight}"/><path d="M${bx+54} ${by+bh-6}l-26 40 56-12z" fill="${palette.highlight}"/>`
      +sparkles([[bx-26,by-8,15],[Math.min(1056,bx+bw+22),by+bh-10,10]],palette.accent)));
    layers.push({input:text.data,left:bx+36,top:by+20});
  }
  // 마스코트가 카드의 왼쪽 아래 모서리를 살짝 가리며 고개를 내민다. 채널명 줄 위에서 끝난다.
  const mascot=await mascotLayer({width:200,pose:"hello",left:MARGIN-26,top:Math.min(1244,cardTop+tilted.info.height+36),anchor:"bottom-left"});
  if(mascot)layers.push(mascot);
  const brand=await textLayer(`${STORE_NAME} · ${index} / ${total}`,{size:22,color:palette.ink,width:500,height:32,font:FONTS.semibold});
  layers.push({input:brand.data,left:MARGIN,top:1350-MARGIN-20});
  layers.push(await grainLayer());
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
  // 오른쪽 아래 점 무늬는 사진·태그 뒤에 깔린다. 왼쪽 위 모서리는 종이색 그대로 둔다.
  const layers:OverlayOptions[]=[svgLayer(dotGrid({x:800,y:1060,width:280,height:200,color:palette.accent,opacity:.25})),{input:headline.data,left:MARGIN,top:MARGIN}];
  if(sub)layers.push({input:sub.data,left:MARGIN,top:MARGIN+headline.info.height+16});
  // 격자의 각 칸을 (x, y, w, h)로 먼저 정한 뒤, 칸마다 번진 그림자와 사진을 올린다.
  const cells:Array<[number,number,number,number]>=[];
  if(photos.length>=3){
    const leftW=Math.round(CONTENT*.58),rightW=CONTENT-leftW-GAP,halfH=Math.round((gridHeight-GAP)/2);
    cells.push([MARGIN,gridTop,leftW,gridHeight],[MARGIN+leftW+GAP,gridTop,rightW,halfH],[MARGIN+leftW+GAP,gridTop+halfH+GAP,rightW,gridHeight-halfH-GAP]);
  }else if(photos.length===2){
    const w=Math.round((CONTENT-GAP)/2);
    cells.push([MARGIN,gridTop,w,gridHeight],[MARGIN+w+GAP,gridTop,CONTENT-w-GAP,gridHeight]);
  }else{
    cells.push([MARGIN,gridTop,CONTENT,gridHeight]);
  }
  layers.push(svgLayer(cells.map(([x,y,w,h])=>softShadow({x,y:y+10,width:w,height:h,rx:18,blur:14,opacity:.16})).join("")));
  for(const [i,[x,y,w,h]] of cells.entries())layers.push({input:await croppedPhoto(photos[i],w,h,18),left:x,top:y});
  // 첫 사진의 왼쪽 위 모서리에 마스킹 테이프, 마지막 사진 근처에 작은 반짝이.
  const last=cells[cells.length-1];
  layers.push(svgLayer(washiTape({x:MARGIN-40,y:gridTop-18,width:190,color:palette.highlight,angle:-9,opacity:.8})+sparkles([[last[0]+last[2]+6,last[1]+last[3]+4,14]],palette.accent)));
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
  // 장 번호는 톱니 스티커 안에 흰 글자로.
  const counter=await textLayer(`${index}/${total}`,{size:22,color:"#ffffff",width:120,height:32,font:FONTS.bold,align:"centre"});
  const badgeX=1080-MARGIN-38,badgeY=1298;
  layers.push(svgLayer(`<path d="M${MARGIN} 1262H${1080-MARGIN-90}" stroke="${palette.ink}" stroke-opacity=".2" stroke-width="2"/>`+stickerBadge({cx:badgeX,cy:badgeY,r:38,fill:palette.accent,rotate:8})),{input:brand.data,left:MARGIN,top:1284},{input:counter.data,left:badgeX-Math.round(counter.info.width/2),top:badgeY-Math.round(counter.info.height/2)});
  layers.push(await grainLayer());
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
  // 마스코트가 창의 왼쪽 아래 모서리에 걸터앉는다. 채널명은 마스코트 오른쪽으로 비킨다.
  const mascot=await mascotLayer({width:150,pose:"curious",left:MARGIN-12,top:WIN_TOP+WIN_H+88,anchor:"bottom-left"});
  return canvas(palette.soft,[
    // 창 뒤 배경 장식: 오른쪽 위 밝은 덩어리, 왼쪽 아래 옅은 강조색 덩어리, 창 모서리 밖 반짝이.
    svgLayer(blob({cx:960,cy:130,r:210,color:palette.highlight,opacity:.5,seed:5})+blob({cx:110,cy:1230,r:170,color:palette.accent,opacity:.12,seed:11})
      +sparkles([[WIN_LEFT+WIN_W+16,WIN_TOP-14,20],[WIN_LEFT+WIN_W+40,WIN_TOP+34,11],[WIN_LEFT-22,WIN_TOP+WIN_H-60,14]],palette.accent)),
    svgLayer(`<rect x="${WIN_LEFT+12}" y="${WIN_TOP+14}" width="${WIN_W}" height="${WIN_H}" rx="20" fill="#000" fill-opacity=".9"/>
      <rect x="${WIN_LEFT}" y="${WIN_TOP}" width="${WIN_W}" height="${WIN_H}" rx="20" fill="#ffffff" stroke="#000" stroke-width="5"/>
      <path d="M${WIN_LEFT} ${WIN_TOP+BAR}H${WIN_LEFT+WIN_W}" stroke="#000" stroke-width="5"/>
      <circle cx="${WIN_LEFT+38}" cy="${WIN_TOP+BAR/2}" r="11" fill="#000"/><circle cx="${WIN_LEFT+74}" cy="${WIN_TOP+BAR/2}" r="11" fill="#000"/><circle cx="${WIN_LEFT+110}" cy="${WIN_TOP+BAR/2}" r="11" fill="#000"/>
      <rect x="${capX}" y="${capY}" width="${capW}" height="${capH}" rx="36" fill="${palette.highlight}" stroke="#000" stroke-width="4"/>
      <circle cx="${capX+40}" cy="${capY+34}" r="12" fill="none" stroke="#000" stroke-width="4"/><path d="M${capX+49} ${capY+43}l12 12" stroke="#000" stroke-width="4" stroke-linecap="round"/>`),
    {input:headline.data,left:WIN_LEFT+PAD,top:contentTop},
    ...points.layers,
    {input:search.data,left:capX+78,top:capY+Math.round((capH-search.info.height)/2)},
    ...(mascot?[mascot]:[]),
    {input:brand.data,left:MARGIN+(mascot?150:0),top:WIN_TOP+WIN_H+44},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:WIN_TOP+WIN_H+44},
    await grainLayer(),
  ]);
}


// 6. 대형 숫자: 짙은 배경 가운데 아주 큰 숫자, 그 아래 굵은 흰 설명. 위에 얇은 캡슐 제목, 아래 작은 회색 부연.
async function composeStat(slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const bg="#182533",white="#ffffff",gray="#9aa6b2";
  const title=await textLayer(slideEyebrow(slide.role,index),{size:24,color:white,width:700,height:34,font:FONTS.semibold});
  const capW=title.info.width+64,capX=Math.round((1080-capW)/2),capY=88;
  const figure=await textLayer(slide.figure||slide.keywords[0]||"",{size:300,color:palette.highlight,width:CONTENT,height:420,font:FONTS.bold,align:"centre",spacing:0});
  const headline=await renderSlideHeadline(slide.headline,{size:44,color:white,align:"centre",height:200,balance:false});
  const lines=cleanPoints(slide.points);
  const note=lines.length?await textLayer(lines.join("\n"),{size:26,color:gray,width:CONTENT,height:140,font:FONTS.regular,align:"centre",spacing:8}):null;
  const blockHeight=figure.info.height+28+headline.info.height+(note?36+note.info.height:0);
  const blockTop=Math.max(190,Math.round((1350-blockHeight)/2)-20);
  const brand=await textLayer(STORE_NAME,{size:24,color:gray,width:600,height:34,font:FONTS.regular});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:white,width:200,height:34,font:FONTS.semibold});
  // 숫자 뒤에 강조색 빛무리와 점선 고리, 주변에 반짝이. 네 귀퉁이에는 옅은 크롭 마크.
  const figureCy=blockTop+Math.round(figure.info.height/2);
  const layers:OverlayOptions[]=[
    svgLayer(`<defs><radialGradient id="glow"><stop offset="0" stop-color="${palette.highlight}" stop-opacity=".28"/><stop offset="1" stop-color="${palette.highlight}" stop-opacity="0"/></radialGradient></defs><circle cx="540" cy="${figureCy}" r="400" fill="url(#glow)"/>`
      +ring({cx:540,cy:figureCy,r:330,color:white,strokeWidth:3,dashed:true,opacity:.22})
      +sparkles([[214,figureCy-150,22],[870,figureCy-190,15],[900,figureCy+120,26],[180,figureCy+170,12]],palette.highlight,.9)
      +cornerMarks({inset:34,length:46,color:white,opacity:.3})),
    svgLayer(`<rect x="${capX}" y="${capY}" width="${capW}" height="56" rx="28" fill="none" stroke="${white}" stroke-opacity=".6" stroke-width="2"/>`),
    {input:title.data,left:capX+32,top:capY+Math.round((56-title.info.height)/2)},
    {input:figure.data,left:Math.round((1080-figure.info.width)/2),top:blockTop},
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:blockTop+figure.info.height+28},
    {input:brand.data,left:MARGIN,top:1284},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:1284},
  ];
  if(note)layers.push({input:note.data,left:Math.round((1080-note.info.width)/2),top:blockTop+figure.info.height+28+headline.info.height+36});
  layers.push(await grainLayer({opacity:.22}));
  return canvas(bg,layers);
}

// 7. A vs B: 화면을 좌우로 나눠 각각 사진, 이름, 체크 목록을 두고 가운데 VS 원. 아래에 제목.
async function composeVersus(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const HALF=540,PHOTO_H=600,cool="#dfe9ef",warm=palette.soft;
  // 왼쪽은 고정된 연한 파랑, 오른쪽은 팔레트 파스텔. 글자색은 각 면의 밝기에 맞춘다(밤 팔레트에서도 읽히게).
  const coolInk=inkOn(cool,palette);
  const lines=cleanPoints(slide.points);
  const splitAt=Math.ceil(lines.length/2);
  const sides=[
    {left:0,bg:cool,ink:coolInk,label:slide.keywords[0]??"A",items:lines.slice(0,splitAt),photo:inputs[0]},
    {left:HALF,bg:warm,ink:inkOn(warm,palette),label:slide.keywords[1]??"B",items:lines.slice(splitAt),photo:inputs[1]??inputs[0]},
  ];
  const layers:OverlayOptions[]=[svgLayer(`<rect x="${HALF}" y="0" width="${HALF}" height="1350" fill="${warm}"/>`)];
  let listsBottom=PHOTO_H;
  for(const side of sides){
    layers.push({input:await croppedPhoto(side.photo,HALF,PHOTO_H,0),left:side.left,top:0});
    const label=await textLayer(side.label,{size:34,color:side.ink,width:HALF-80,height:48,font:FONTS.bold,align:"centre"});
    const labelLeft=side.left+Math.round((HALF-label.info.width)/2);
    layers.push({input:label.data,left:labelLeft,top:PHOTO_H+44});
    // 이름 밑에 강조색 물결 밑줄. 사진 아래 모서리에는 반투명 테이프를 붙여 두 장이 스크랩처럼 보이게 한다.
    layers.push(svgLayer(wavyUnderline({x:labelLeft-6,y:PHOTO_H+44+label.info.height+6,width:label.info.width+12,color:palette.accent,strokeWidth:5})
      +washiTape({x:side.left+(side.left?HALF-200:30),y:PHOTO_H-26,width:170,color:palette.highlight,angle:side.left?8:-8,opacity:.78})));
    let cursor=PHOTO_H+44+label.info.height+28;
    for(const item of side.items){
      const text=await textLayer(item,{size:26,color:side.ink,width:HALF-80-40,height:90,font:FONTS.regular,spacing:6});
      layers.push({input:svg(26,26,`<path d="M4 13l6 6 12-13" fill="none" stroke="${palette.accent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`),left:side.left+40,top:cursor+4});
      layers.push({input:text.data,left:side.left+40+40,top:cursor});
      cursor+=text.info.height+16;
    }
    listsBottom=Math.max(listsBottom,cursor);
  }
  const vs=await textLayer("VS",{size:36,color:"#ffffff",width:120,height:48,font:FONTS.bold,align:"centre"});
  // VS 원 둘레에 점선 고리와 반짝이를 둔다.
  layers.push(svgLayer(ring({cx:HALF,cy:PHOTO_H,r:86,color:coolInk,strokeWidth:3,dashed:true,opacity:.45})+sparkles([[HALF-108,PHOTO_H-74,16],[HALF+112,PHOTO_H+70,12]],palette.accent)
    +`<circle cx="${HALF}" cy="${PHOTO_H}" r="62" fill="${coolInk}" stroke="#ffffff" stroke-width="6"/>`));
  layers.push({input:vs.data,left:HALF-Math.round(vs.info.width/2),top:PHOTO_H-Math.round(vs.info.height/2)});
  // 제목은 두 목록 아래 남는 공간의 가운데, 양쪽 면에 걸치는 흰 알약 위에 둔다. 한쪽 면이 어두운 팔레트에서도 끝까지 읽힌다.
  const headline=await renderSlideHeadline(slide.headline,{size:44,color:inkOn("#ffffff",palette),align:"centre",height:140,balance:false});
  const titleTop=listsBottom+Math.max(24,Math.round((1262-listsBottom-headline.info.height-30)/2));
  const pillW=headline.info.width+80,pillH=headline.info.height+40,pillX=Math.round((1080-pillW)/2),pillY=titleTop-20;
  layers.push(svgLayer(`<path d="M${MARGIN} ${titleTop-26}H${1080-MARGIN}" stroke="${coolInk}" stroke-opacity=".2" stroke-width="2"/>`
    +softShadow({x:pillX,y:pillY+8,width:pillW,height:pillH,rx:pillH/2,blur:12,opacity:.14})
    +`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH/2}" fill="#ffffff" fill-opacity=".94"/>`));
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:titleTop});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:inkOn(warm,palette),width:200,height:34,font:FONTS.semibold});
  layers.push({input:counter.data,left:1080-MARGIN-counter.info.width,top:1296});
  layers.push(await grainLayer());
  return canvas(cool,layers);
}

// 8. 단계 가이드: 왼쪽 위 STEP 스티커, 큰 제목, 가운데 사진, 아래 흰 둥근 상자 안 설명.
async function composeStep(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const R=66,stickerX=MARGIN+R,stickerY=84+R;
  const stepWord=await textLayer("STEP",{size:20,color:palette.accent,width:120,height:28,font:FONTS.semibold,align:"centre"});
  const stepNo=await textLayer(String(Math.max(1,index-1)).padStart(2,"0"),{size:44,color:palette.accent,width:120,height:56,font:FONTS.bold,align:"centre"});
  const headline=await renderSlideHeadline(slide.headline,{size:46,color:palette.ink,align:"left",width:CONTENT-R*2-36,height:170,balance:false});
  const lines=cleanPoints(slide.points);
  // 설명 상자는 흰색이라 글자는 항상 짙은 색(밤 팔레트의 밝은 ink는 여기서 사라진다).
  const boxInk=inkOn("#ffffff",palette);
  const measured=await pointLayers(lines,0,{left:MARGIN+40,width:CONTENT-80,color:boxInk,markerColor:palette.accent,size:28});
  const boxH=lines.length?measured.bottom+72:0;
  const photoTop=Math.max(84+R*2+40,84+headline.info.height+48);
  const PHOTO_H=Math.max(380,Math.min(640,1262-(boxH?boxH+32:0)-photoTop));
  const boxTop=photoTop+PHOTO_H+32;
  const points=await pointLayers(lines,boxTop+40,{left:MARGIN+40,width:CONTENT-80,color:boxInk,markerColor:palette.accent,size:28});
  const brand=await textLayer(STORE_NAME,{size:24,color:palette.ink,width:600,height:34,font:FONTS.regular});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:palette.ink,width:200,height:34,font:FONTS.semibold});
  const layers:OverlayOptions[]=[
    // STEP 스티커는 점선 고리로 한 번 더 두르고, 옆에 반짝이. 사진과 설명 상자 뒤에는 번진 그림자.
    svgLayer(ring({cx:stickerX,cy:stickerY,r:R+14,color:palette.accent,strokeWidth:3,dashed:true,opacity:.5})+sparkles([[stickerX+R+30,stickerY-R-4,14],[stickerX-R-18,stickerY+R+10,10]],palette.accent)
      +`<circle cx="${stickerX+4}" cy="${stickerY+6}" r="${R}" fill="#000" fill-opacity=".12"/><circle cx="${stickerX}" cy="${stickerY}" r="${R}" fill="#ffffff" stroke="${palette.accent}" stroke-width="6"/>`
      +softShadow({x:MARGIN,y:photoTop+12,width:CONTENT,height:PHOTO_H,rx:24,blur:16,opacity:.18})),
    {input:stepWord.data,left:stickerX-Math.round(stepWord.info.width/2),top:stickerY-44},
    {input:stepNo.data,left:stickerX-Math.round(stepNo.info.width/2),top:stickerY-18},
    {input:headline.data,left:MARGIN+R*2+36,top:84+Math.max(0,Math.round((R*2-headline.info.height)/2))},
    {input:await croppedPhoto(inputs[0],CONTENT,PHOTO_H,24),left:MARGIN,top:photoTop},
    svgLayer(washiTape({x:1080-MARGIN-150,y:photoTop-20,width:200,color:palette.highlight,angle:9,opacity:.8})),
  ];
  if(boxH){
    layers.push(svgLayer(softShadow({x:MARGIN,y:boxTop+8,width:CONTENT,height:boxH,rx:28,blur:14,opacity:.12})+`<rect x="${MARGIN}" y="${boxTop}" width="${CONTENT}" height="${boxH}" rx="28" fill="#ffffff"/>`));
    layers.push(...points.layers);
  }
  layers.push({input:brand.data,left:MARGIN,top:1284},{input:counter.data,left:1080-MARGIN-counter.info.width,top:1284});
  layers.push(await grainLayer());
  return canvas(palette.soft,layers);
}

// 9. Q&A 말풍선: 연회색 바탕에 위 왼쪽 어두운 질문 말풍선, 아래 오른쪽 강조색 답변 말풍선, 그 아래 형광펜 팁.
async function composeQa(slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const bg="#eef0f1",dark="#2f3337";
  // 바탕은 팔레트와 무관한 연회색이라 바탕 위 글자색은 밝기에 맞춰 고른다.
  const bgInk=inkOn(bg,palette),bgMuted=mutedOn(bg,palette);
  const lines=cleanPoints(slide.points);
  const answer=lines.length>=2?lines.slice(0,-1).join(" "):lines[0]??"";
  const tip=lines.length>=2?lines[lines.length-1]:"";
  const BUBBLE_W=800,PAD=40;
  const q=await textLayer(slide.headline,{size:36,color:"#ffffff",width:BUBBLE_W-PAD*2,height:260,font:FONTS.bold,spacing:8});
  const a=await textLayer(answer||"—",{size:34,color:palette.onAccent,width:BUBBLE_W-PAD*2,height:320,font:FONTS.bold,spacing:8});
  // 마스코트가 오른쪽 아래에서 답변을 거든다. 마스코트가 있으면 팁 글은 그만큼 좁게 접는다.
  const MASCOT_W=210;
  const mascot=await mascotLayer({width:MASCOT_W,pose:"tip",left:1080-MARGIN+18,top:1266,anchor:"bottom-right"});
  const tipLayer=tip?await textLayer(tip,{size:28,color:bgInk,width:CONTENT-120-(mascot?MASCOT_W-20:0),height:120,font:FONTS.semibold,spacing:6}):null;
  const qH=q.info.height+PAD*2,aH=a.info.height+PAD*2;
  // 질문·답변·팁 블록을 화면 세로 가운데에 둔다.
  const blockHeight=qH+90+aH+(tipLayer?70+tipLayer.info.height:0);
  const qX=MARGIN+70,qY=Math.max(120,Math.round((1262-blockHeight)/2));
  const aX=1080-MARGIN-70-BUBBLE_W,aY=qY+qH+90;
  const badge=(x:number,y:number,letter:string,fill:string)=>`<circle cx="${x}" cy="${y}" r="34" fill="${fill}"/>`;
  const qLetter=await textLayer("Q",{size:34,color:"#ffffff",width:60,height:44,font:FONTS.bold,align:"centre"});
  const aLetter=await textLayer("A",{size:34,color:"#ffffff",width:60,height:44,font:FONTS.bold,align:"centre"});
  const layers:OverlayOptions[]=[
    // 배경 장식: 오른쪽 위 점 무늬, 왼쪽 아래 옅은 강조색 덩어리. 말풍선 뒤에 번진 그림자.
    svgLayer(dotGrid({x:820,y:48,width:230,height:Math.max(60,qY-70),color:bgInk,opacity:.18})+blob({cx:90,cy:1230,r:160,color:palette.accent,opacity:.12,seed:4})
      +softShadow({x:qX,y:qY+12,width:BUBBLE_W,height:qH,rx:30,blur:16,opacity:.16})+softShadow({x:aX,y:aY+12,width:BUBBLE_W,height:aH,rx:30,blur:16,opacity:.16})),
    svgLayer(`<rect x="${qX}" y="${qY}" width="${BUBBLE_W}" height="${qH}" rx="30" fill="${dark}"/><path d="M${qX+30} ${qY+qH-2}l-26 34 60-10z" fill="${dark}"/>${badge(MARGIN+34,qY+34,"Q",dark)}`),
    {input:qLetter.data,left:MARGIN+34-Math.round(qLetter.info.width/2),top:qY+34-Math.round(qLetter.info.height/2)},
    {input:q.data,left:qX+PAD,top:qY+PAD},
    svgLayer(`<rect x="${aX}" y="${aY}" width="${BUBBLE_W}" height="${aH}" rx="30" fill="${palette.accent}"/><path d="M${aX+BUBBLE_W-30} ${aY+aH-2}l26 34-60-10z" fill="${palette.accent}"/>${badge(1080-MARGIN-34,aY+34,"A",palette.accent)}`),
    {input:aLetter.data,left:1080-MARGIN-34-Math.round(aLetter.info.width/2),top:aY+34-Math.round(aLetter.info.height/2)},
    {input:a.data,left:aX+PAD,top:aY+PAD},
  ];
  if(tipLayer){
    const label=await textLayer("TIP",{size:22,color:bgInk,width:80,height:30,font:FONTS.bold});
    const text=tipLayer;
    const tipY=aY+aH+70;
    // 형광펜 자국은 글 바로 뒤의 평행사변형. skewX를 그대로 쓰면 원점 기준으로 밀려 글과 어긋난다.
    const hx=MARGIN+92,hy=tipY+8,hw=text.info.width+36,hh=text.info.height,slant=Math.round(hh*.12);
    layers.push(svgLayer(`<polygon points="${hx+slant},${hy} ${hx+hw+slant},${hy} ${hx+hw},${hy+hh} ${hx},${hy+hh}" fill="${palette.highlight}" fill-opacity=".7"/>`
      +sparkles([[MARGIN+52,tipY-12,13],[MARGIN+140+text.info.width,tipY+text.info.height+10,10]],palette.accent)));
    layers.push({input:label.data,left:MARGIN+20,top:tipY+8},{input:text.data,left:MARGIN+100,top:tipY});
  }
  // 마스코트는 답변 말풍선과 겹치지 않을 때만 올린다.
  if(mascot&&aY+aH+16<=1266-Math.round(MASCOT_W*598/640))layers.push(mascot);
  const brand=await textLayer(STORE_NAME,{size:24,color:bgMuted,width:600,height:34,font:FONTS.regular});
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:bgInk,width:200,height:34,font:FONTS.semibold});
  layers.push({input:brand.data,left:MARGIN,top:1284},{input:counter.data,left:1080-MARGIN-counter.info.width,top:1284});
  layers.push(await grainLayer());
  return canvas(bg,layers);
}

// 10. 인용구: 톤을 낮춘 사진 위에 큰 따옴표, 흰 인용구, 아래 구분선과 출처 줄.
async function composeQuote(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const white="#ffffff";
  const background=await sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover"}).modulate({saturation:.3,brightness:.55}).png().toBuffer();
  const mark=await textLayer("“",{size:220,color:palette.highlight,width:300,height:240,font:FONTS.bold,spacing:0});
  const quote=await renderSlideHeadline(slide.headline,{size:56,color:white,align:"left",width:860,height:420,balance:false});
  const lines=cleanPoints(slide.points);
  const source=await textLayer(slide.keywords.length?`${STORE_NAME} · ${slide.keywords.join(" · ")}`:STORE_NAME,{size:26,color:white,width:CONTENT,height:36,font:FONTS.semibold});
  const sub=lines[0]?await textLayer(lines[0],{size:26,color:"#ffffffcc",width:CONTENT,height:80,font:FONTS.regular,spacing:6}):null;
  const quoteTop=Math.max(320,Math.round((1350-quote.info.height)/2)-80);
  const counter=await textLayer(`${index} / ${total}`,{size:24,color:"#ffffffcc",width:200,height:34,font:FONTS.semibold});
  const layers:OverlayOptions[]=[
    svgLayer(`<rect width="1080" height="1350" fill="#000" fill-opacity=".18"/>`+cornerMarks({inset:40,length:54,color:palette.highlight,opacity:.65})),
    {input:mark.data,left:MARGIN-8,top:quoteTop-150},
    {input:quote.data,left:MARGIN,top:quoteTop},
    // 따옴표 옆과 인용구 끝에 작은 반짝이. 출처 줄 위의 짧은 강조선은 그대로 둔다.
    svgLayer(`<path d="M${MARGIN} 1150H${MARGIN+120}" stroke="${palette.highlight}" stroke-width="3"/>`
      +sparkles([[MARGIN+150,quoteTop-96,18],[Math.min(1030,MARGIN+quote.info.width+30),quoteTop+quote.info.height+6,12]],palette.highlight,.9)),
    {input:source.data,left:MARGIN,top:1176},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:64},
  ];
  if(sub)layers.push({input:sub.data,left:MARGIN,top:1176+source.info.height+12});
  layers.push(await grainLayer({opacity:.22}));
  return sharp(background).composite(layers).jpeg({quality:90}).toBuffer();
}

const CARD_RENDERERS:Record<CardLayout,(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette)=>Promise<Buffer>>={
  fullscreen:composeFullscreen,
  frame:composeFrame,
  illustration:composeIllustration,
  collage:composeCollage,
  browser:(_inputs,slide,index,total,palette)=>composeBrowser(slide,index,total,palette),
  stat:(_inputs,slide,index,total,palette)=>composeStat(slide,index,total,palette),
  versus:composeVersus,
  step:composeStep,
  qa:(_inputs,slide,index,total,palette)=>composeQa(slide,index,total,palette),
  quote:(inputs,slide,index,total,palette)=>composeQuote(inputs,slide,index,total,palette),
};

// 사진 한 장 또는 여러 장(콜라주)을 받아 한 장의 카드로 만든다. 브라우저형은 사진 없이 그린다.
export async function composeSlideImage(input:Buffer|Buffer[],slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT,design?:DesignSpec):Promise<Buffer> {
  await access(FONTS.bold.file);
  const inputs=Array.isArray(input)?input:[input];
  const card:CardLayout=layout==="overlay"?"fullscreen":normalizeCardLayout(slide);
  if(photosNeeded(card)>0&&!inputs.length)throw new Error("slide image required");
  return CARD_RENDERERS[card](inputs,slide,index,total,paletteOf(design));
}
