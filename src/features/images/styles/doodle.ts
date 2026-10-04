import sharp, { type OverlayOptions } from "sharp";
import { brandName, croppedPhoto, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, rotated, snap } from "./shared";
import { handArrow, handEllipse, handStar, seeded, squiggle } from "./handDrawn";

// 사진 위 손그림 낙서: 사진을 화면 가득 쓰고, 그 위에 마커로 동그라미·화살표·별과 짧은 손글씨 메모를 그린다.
// 제목은 노란 형광펜을 그은 띠 위에 검은 손글씨. 아래 요점은 어둡게 깐 사진 위 흰 손글씨.
// 사진이 없는 장은 흰 종이에 같은 낙서로. 친근하고 가볍게 "여기 좀 봐" 하는 카드에 쓴다.
const HIGHLIGHT="#FFE14D",INK="#141414",PAPER="#FAF7F0";
// 메모 문구는 사실을 단정하지 않는 감탄만 쓴다.
const NOTES=["여기 결 좀 봐!","이 한 점!","요기요기","놓치지 마세요","바로 이거","침 고이는 중"];

// 형광펜 띠 위 제목. 띠는 살짝 기울고 양 끝이 들쭉날쭉하다.
async function highlightedTitle(value:string,options:{sizes:number[];width:number;maxHeight:number;angle:number}):Promise<{data:Buffer;info:{width:number;height:number}}> {
  const text=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,color:INK,font:STYLE_FONTS.chalk,align:"left",spacing:6});
  const padX=28,padY=18,W=text.info.width+padX*2,H=text.info.height+padY*2;
  const band=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M6 ${padY*.6} L${W-4} 2 L${W-10} ${H-padY*.5} L2 ${H-2} Z" fill="${HIGHLIGHT}" opacity=".95"/></svg>`);
  const composed=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:band,left:0,top:0},{input:text.data,left:padX,top:padY}]).png().toBuffer();
  return options.angle?rotated(composed,options.angle):sharp(composed).png().toBuffer({resolveWithObject:true});
}

export const renderDoodle:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const rand=seeded(index*29+(slide.variant??0)*7+1);
  const layers:OverlayOptions[]=[];
  const M=70,footerTop=1350-76;
  const hasPhoto=inputs.length>0;
  let deco="";
  const marker=hasPhoto?"#FFFFFF":INK;
  if(hasPhoto){
    // 사진 가득 + 아래쪽 글자가 읽히도록 어둡게.
    layers.push({input:await croppedPhoto(inputs[0],1080,1350,0),left:0,top:0});
    deco+=`<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#fade)"/>`;
  }else{
    deco+=`<defs><pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="#D9D3C4"/></pattern></defs><rect width="1080" height="1350" fill="url(#dots)"/>`;
  }
  // 제목(형광펜 띠). 표지는 크게.
  const title=await highlightedTitle(content.headline,{sizes:content.cover?[92,82,72,64]:hasPhoto?[64,58,52,46]:[80,70,62,56],width:860,maxHeight:content.cover?300:hasPhoto?200:280,angle:(rand()-.5)*3});
  const titleTop=hasPhoto?70:Math.max(110,Math.round(1350/2-300));
  layers.push({input:title.data,left:M-10,top:titleTop});
  const y=titleTop+title.info.height+20;
  // 요점(아래부터 쌓는다): 사진 위는 흰 손글씨에 그림자, 종이 위는 검은 손글씨.
  const points=content.points.slice(0,hasPhoto?3:4);
  const pointLayers=await Promise.all(points.map(point=>textLayer(point,{size:hasPhoto?40:52,color:hasPhoto?"#FFFFFF":INK,width:860,height:150,font:STYLE_FONTS.chalk,spacing:6,...(hasPhoto?{shadow:true}:{})})));
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.info.height+18,0);
  let py=hasPhoto?footerTop-pointsH-16:y+70;
  // 사진 위 낙서: 가운데 비어 있는 곳(제목과 요점 사이)에 동그라미 + 메모 + 화살표.
  const gapTop=y,gapBottom=py-30;
  if(hasPhoto&&inputs[1]){
    // 사진 두 장(비교 장): 두 번째 사진을 동그란 스티커로 붙이고 노란 동그라미와 "이것도!" 메모를 단다.
    const D=Math.round(Math.max(220,Math.min(320,gapBottom-gapTop-40)));
    const sx=1080-M-D,sy=Math.round(Math.max(gapTop+10,(gapTop+gapBottom-D)/2));
    deco+=`<circle cx="${sx+D/2+8}" cy="${sy+D/2+10}" r="${D/2+6}" fill="#000" opacity=".35"/><circle cx="${sx+D/2}" cy="${sy+D/2}" r="${D/2+8}" fill="#FFFFFF"/>`;
    layers.push({input:await croppedPhoto(inputs[1],D,D,D/2,{circle:true}),left:sx,top:sy});
    const extra=await textLayer("이것도!",{size:60,color:HIGHLIGHT,width:300,height:100,font:STYLE_FONTS.marker,shadow:true});
    const ex=Math.max(M,sx-extra.info.width-70),ey=sy+Math.round(D*.15);
    deco+=`<path d="M${ex-16} ${ey+4} L${ex+extra.info.width+14} ${ey-2} L${ex+extra.info.width+18} ${ey+extra.info.height+4} L${ex-12} ${ey+extra.info.height+8} Z" fill="#141414" opacity=".82"/>`;
    layers.push({input:extra.data,left:ex,top:ey});
    deco+=`<path d="${handArrow(ex+extra.info.width+10,ey+extra.info.height,sx+20,sy+D*.55,rand,.25)}" stroke="${HIGHLIGHT}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }else if(hasPhoto&&gapBottom-gapTop>260){
    const cy=(gapTop+gapBottom)/2+20,ry=Math.min(200,(gapBottom-gapTop)/2-30),rx=Math.min(330,ry*1.5);
    const cx=540+(rand()-.5)*80;
    deco+=`<path d="${handEllipse(cx,cy,rx,ry,rand,7)}" stroke="${HIGHLIGHT}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    const note=await textLayer(NOTES[(index+(slide.variant??0))%NOTES.length],{size:64,color:HIGHLIGHT,width:460,height:110,font:STYLE_FONTS.marker,shadow:true});
    const noteLeft=cx>540?M:1080-M-note.info.width,noteTop=Math.max(gapTop,cy-ry-note.info.height-10);
    // 밝은 사진 위에서도 노란 메모가 읽히도록 뒤에 검은 마스킹 테이프 띠를 깐다.
    deco+=`<path d="M${noteLeft-18} ${noteTop+4} L${noteLeft+note.info.width+16} ${noteTop-2} L${noteLeft+note.info.width+20} ${noteTop+note.info.height+4} L${noteLeft-14} ${noteTop+note.info.height+8} Z" fill="#141414" opacity=".82"/>`;
    layers.push({input:note.data,left:noteLeft,top:noteTop});
    const fromX=noteLeft+note.info.width/2,fromY=noteTop+note.info.height-6;
    const toX=cx+(cx>540?-rx*.7:rx*.7),toY=cy-ry*.55;
    deco+=`<path d="${handArrow(fromX,fromY,toX,toY,rand)}" stroke="${HIGHLIGHT}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    deco+=`<path d="${handStar(cx+(cx>540?rx*.85:-rx*.85),cy+ry*.7,26,rand)}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round"/>`;
  }else if(!hasPhoto){
    deco+=`<path d="${handStar(1080-M-40,titleTop+title.info.height+40,30,rand)}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  }
  // 요점 앞에 손으로 그린 체크 상자.
  for(const layer of pointLayers){
    const bx=M,by=py+12;
    deco+=`<path d="M${bx} ${by} l34 -2 l2 34 l-35 2 Z" stroke="${marker}" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M${bx+6} ${by+16} l10 12 l24 -30" stroke="${HIGHLIGHT}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    layers.push({input:layer.data,left:M+56,top:py});
    py+=layer.info.height+18;
  }
  if(!hasPhoto&&pointLayers.length)deco+=`<path d="${squiggle(M,py+6,420,rand,12)}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  const footer=await fitText(`${brandName()}  ·  ${index}/${total}`,{sizes:[26,23,20],width:900,maxHeight:40,color:hasPhoto?"#F2F2F2":"#5C574E",font:STYLE_FONTS.sansSemi,align:"centre",...(hasPhoto?{}:{})});
  layers.push({input:footer.data,left:Math.round((1080-footer.info.width)/2),top:footerTop+22});
  layers.splice(hasPhoto?1:0,0,svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
