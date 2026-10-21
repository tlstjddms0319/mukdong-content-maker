import sharp, { type OverlayOptions } from "sharp";
import { brandHandle, finishPhoto, svgLayer, textLayer } from "../render/primitives";
import { nextCue, snap, type StyleContent } from "./shared";
import { MARGIN, SANS, SANS_SEMI, SAVE_CHIP, SHADE, TITLE_SERIF, fitLines, logoMark, shortLines } from "./trackKit";

// 화이트 매거진 모양(2026-10-21, 풀블리드와 함께 만든 두 번째 시안). 흰 종이에 사진은 위쪽 가장자리까지, 아래에 명조 제목.
//   사진 장   : 위 58%(표지 62%) 사진을 가장자리까지(액자·둥근 모서리 없음), 아래 흰 종이에 가는 진행 막대 → 먹색 명조 제목 → 원인 한 줄.
//   글 중심   : 본문은 흰 종이 전체, 가는 선 아래 큰 제목(세 줄까지) + 원인 한 줄을 한가운데. 표지는 사진 장과 같다.
//   장 번호   : 사진 위 왼쪽 위 얇은 흰 "02"(사진 없는 장은 먹색). 바닥글은 작은 로고만, "넘겨 보기"는 표지에만, 마지막 장만 알약 + 계정.
// 색: 종이 #FBF8F3, 먹색 #241E1B, 보조 #6E625B. 강조색 없음.
const W=1080,H=1350;
const CONTENT_W=W-MARGIN*2;
const PAPER="#FBF8F3",INK="#241E1B",DIM="#6E625B",RULE="#D9D2C8";

const titleOf=(content:StyleContent,sizes:number[],maxLines:number)=>fitLines(content.headline,{sizes,width:CONTENT_W,font:TITLE_SERIF,color:INK,maxLines,prefer:sizes[0]>=96?"size":"lines",spacing:size=>Math.round(size*.06),letterSpacing:size=>-size*.015});
const lineOf=(text:string,size:number)=>textLayer(text,{size,color:DIM,width:CONTENT_W,height:4000,font:SANS,spacing:10});

function progress(x:number,y:number,reason:{n:number;of:number}):string {
  const seg=56,gap=10,h=6;
  return Array.from({length:reason.of},(_,i)=>`<rect x="${x+i*(seg+gap)}" y="${y}" width="${seg}" height="${h}" rx="3" fill="${i<reason.n?INK:RULE}"/>`).join("");
}

async function card(photo:Buffer|undefined,content:StyleContent,index:number):Promise<Buffer> {
  const photoH=photo?Math.round(H*(content.cover?.62:.58)):0;
  const shot=photo?await finishPhoto(photo,W,photoH,{zoom:1.03}):null;
  const plain=!photo;
  const title=await titleOf(content,content.cover?[96,88,80,74,68]:plain?[100,92,84,78,72]:[80,74,68,62,56],plain?3:2);
  const line=content.cover?content.subline:shortLines(content,1)[0];
  const sub=line?await lineOf(line,content.cover||plain?44:40):null;
  const chip=content.last?await textLayer(SAVE_CHIP,{size:32,color:PAPER,width:900,height:80,font:SANS_SEMI}):null;
  const padX=24,padY=10,chipH=chip?chip.info.height+padY*2:0;
  const bars=!content.cover&&!content.last&&content.reason?content.reason:null;
  const LOGO=content.last?56:48;
  const logo=await logoMark(LOGO);
  const handle=content.last&&brandHandle()?await textLayer(brandHandle(),{size:32,color:DIM,width:700,height:60,font:SANS_SEMI}):null;
  const cue=content.cover?await nextCue(INK,36):null;
  const footH=Math.max(LOGO,handle?.info.height??0,cue?.height??0);
  const footTop=H-MARGIN-footH;
  // 사진 없는 장은 가는 선 하나를 제목 위에.
  const markH=chip?chipH:bars?6:plain?4:0,markGap=chip?26:bars?28:plain?36:0;
  const blockH=(markH?markH+markGap:0)+title.layer.info.height+(sub?18+sub.info.height:0);
  const area=plain?{top:MARGIN+60,bottom:footTop-40}:{top:photoH+56,bottom:footTop-40};
  const blockTop=plain?Math.round(area.top+(area.bottom-area.top-blockH)/2):Math.max(area.top,Math.round(area.top+(area.bottom-area.top-blockH)/2));
  const markTop=blockTop,titleTop=blockTop+(markH?markH+markGap:0),subTop=titleTop+title.layer.info.height+18;
  let svg="";
  const layers:OverlayOptions[]=[];
  if(shot)layers.push({input:shot,left:0,top:0});
  const marks:OverlayOptions[]=[];
  // 장 번호·로고는 사진 위면 흰색(그늘 없이 읽히게 위쪽에 얇은 그늘), 종이 위면 먹색.
  if(shot)svg+=`<defs><linearGradient id="wmT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity=".38"/><stop offset="1" stop-color="${SHADE}" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="180" fill="url(#wmT)"/>`;
  if(content.cover)marks.push({input:await logoMark(96,"#F5EFE5"),left:MARGIN,top:MARGIN});
  else{const folio=await textLayer(String(index).padStart(2,"0"),{size:30,color:shot?"#FFFFFF":DIM,width:120,height:60,font:SANS_SEMI,features:"tnum",letterSpacing:2,shadow:Boolean(shot)});marks.push({input:folio.data,left:MARGIN,top:MARGIN});}
  if(chip){svg+=`<rect x="${MARGIN}" y="${markTop}" width="${chip.info.width+padX*2}" height="${chipH}" rx="${chipH/2}" fill="${INK}"/>`;marks.push({input:chip.data,left:MARGIN+padX,top:markTop+padY});}
  else if(bars)svg+=progress(MARGIN,markTop,bars);
  else if(plain)svg+=`<rect x="${MARGIN}" y="${markTop}" width="64" height="4" rx="2" fill="${INK}"/>`;
  const footMid=footTop+footH/2;
  marks.push({input:logo,left:MARGIN,top:Math.round(footMid-LOGO/2)});
  if(handle)marks.push({input:handle.data,left:MARGIN+LOGO+16,top:Math.round(footMid-handle.info.height/2)});
  if(cue){const x=W-MARGIN-cue.width,y=Math.round(footMid-cue.height/2);svg+=cue.arrow(x,y);marks.push({input:cue.label.data,left:x,top:y});}
  layers.push(svgLayer(svg),...marks,{input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  return sharp({create:{width:W,height:H,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

export const renderWhiteMagazinePhoto=(photo:Buffer,content:StyleContent,index:number)=>card(photo,content,index);
export const renderWhiteMagazineText=(photo:Buffer|undefined,content:StyleContent,index:number)=>card(content.cover?photo:undefined,content,index);
