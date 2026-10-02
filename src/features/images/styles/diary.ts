import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { grainLayer, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { washiTape } from "../decor";
import { STYLE_FONTS, contentOf, filmPhoto, fitText, rotated , snap } from "./shared";

// 빈티지 다이어리·스크랩북: 크라프트지 바탕 위에 아래쪽이 찢어진 줄 노트를 붙이고, 필름 색감 폴라로이드를 마스킹 테이프로 고정한다.
// 글씨는 모두 나눔펜 손글씨. 요점은 노트 줄 위에 한 줄씩 적고, 핵심 낱말에는 형광펜 줄을 긋는다.
const KRAFT="#C8A57A",PAPER="#FBF7EC",RULE="#9DB8D6",MARGIN_LINE="#E58C8C",PEN="#2D3A5C",RED_PEN="#C0392B";
const TAPES=["#F4B6C2","#B9E3C6","#FCE38A","#AEC8F2"];

// 아래 가장자리가 들쭉날쭉한 종이(찢어진 노트) 모양.
function tornPaper(x:number,y:number,w:number,h:number,seed:number):string {
  const teeth=Array.from({length:28},(_,i)=>{const px=x+w-(w*(i+1))/28,dy=((i*7+seed*3)%5)*5;return `L${Math.round(px)} ${y+h-dy}`;}).join("");
  return `<path d="M${x} ${y}H${x+w}V${y+h}${teeth}Z" fill="${PAPER}"/>`;
}

// 폴라로이드 한 장: 흰 틀(아래가 넓음)에 필름 사진, 아래 여백에 손글씨 메모.
async function polaroid(input:Buffer,side:number,caption:string,leak:"left"|"right"):Promise<Buffer> {
  const pad=24,bottom=Math.round(side*.26);
  const photo=await filmPhoto(input,side,side,leak);
  const note=await textLayer(caption,{size:Math.round(side*.085),color:PEN,width:side,height:bottom-10,font:STYLE_FONTS.hand,align:"centre"});
  const W=side+pad*2,H=side+pad+bottom;
  const shadow=Buffer.from(`<svg width="${W+20}" height="${H+20}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs><rect x="10" y="14" width="${W}" height="${H}" fill="#000" opacity=".28" filter="url(#b)"/><rect x="0" y="0" width="${W}" height="${H}" fill="#FFFEFA"/></svg>`);
  return sharp({create:{width:W+20,height:H+20,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:shadow,left:0,top:0},{input:photo,left:pad,top:pad},{input:note.data,left:pad+Math.round((side-note.info.width)/2),top:pad+side+Math.round((bottom-note.info.height)/2)}]).png().toBuffer();
}

export const renderDiary:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const v=index-1+(slide.variant??0);
  const layers:OverlayOptions[]=[];
  // 노트 한 장: 위 여백 50, 좌우 46, 아래는 찢어진 가장자리.
  const NX=46,NY=50,NW=1080-NX*2,NH=1350-NY-60;
  let deco=tornPaper(NX,NY,NW,NH,v);
  const LINE_GAP=62;
  for(let ly=NY+150;ly<NY+NH-40;ly+=LINE_GAP)deco+=`<path d="M${NX} ${ly}H${NX+NW}" stroke="${RULE}" stroke-width="2" opacity=".7"/>`;
  deco+=`<path d="M${NX+110} ${NY}V${NY+NH-20}" stroke="${MARGIN_LINE}" stroke-width="2.5"/>`;
  // 링 구멍(위쪽 펀치 자국).
  for(let i=0;i<9;i++)deco+=`<circle cx="${NX+70+i*112}" cy="${NY+34}" r="11" fill="${KRAFT}"/>`;
  // 날짜 대신 장 번호를 일기 머리말로.
  const dayLabel=await textLayer(`Day ${String(index).padStart(2,"0")}  ·  ${content.keywords.map(word=>`#${word}`).join(" ")||STORE_NAME}`,{size:44,color:RED_PEN,width:820,height:70,font:STYLE_FONTS.hand});
  layers.push({input:dayLabel.data,left:NX+130,top:NY+76});
  let y=NY+150;
  const TX=NX+130,TW=NW-170;
  const hasPhoto=inputs.length>0;
  // 사진 장: 폴라로이드를 오른쪽(또는 두 장이면 엇갈리게)에 기울여 붙이고, 제목은 왼쪽 위에 손글씨로.
  if(content.cover&&hasPhoto){
    const pol=await rotated(await polaroid(inputs[0],620,"오늘의 기록",v%2?"left":"right"),v%2?4:-3);
    const title=await fitText(content.headline,{sizes:[110,98,88],width:TW,maxHeight:300,color:PEN,font:STYLE_FONTS.hand,spacing:4});
    layers.push({input:title.data,left:TX,top:y-6});
    y+=title.info.height+30;
    const pl=Math.round((1080-pol.info.width)/2);
    layers.push({input:pol.data,left:pl,top:y});
    deco+=washiTape({x:540-110,y:y-10,width:220,height:54,angle:-6,color:TAPES[v%TAPES.length],opacity:.85});
  }else{
    const title=await fitText(content.headline,{sizes:[92,82,72],width:TW,maxHeight:240,color:PEN,font:STYLE_FONTS.hand,spacing:4});
    layers.push({input:title.data,left:TX,top:y-4});
    // 제목 아래 형광펜 줄.
    deco+=`<path d="M${TX-6} ${y+title.info.height-14}H${TX+Math.min(title.info.width,TW)+6}" stroke="#FCE38A" stroke-width="22" stroke-linecap="round" opacity=".75"/>`;
    y+=Math.ceil((title.info.height+20)/LINE_GAP)*LINE_GAP;
    if(hasPhoto){
      const shots=inputs.slice(0,2);
      const side=shots.length>1?340:(content.points.length>1?360:420);
      const captions=content.keywords.length?content.keywords:["한 점","한 잔"];
      for(const [i,shot] of shots.entries()){
        const pol=await rotated(await polaroid(shot,side,captions[i%captions.length],i?"left":"right"),shots.length>1?(i?5:-5):(v%2?-4:4));
        const left=shots.length>1?(i?1080-NX-pol.info.width+10:NX+20):Math.round(540-pol.info.width/2+(v%2?-60:60));
        layers.push({input:pol.data,left,top:y+(i?40:0)});
        deco+=washiTape({x:left+pol.info.width/2-90,y:y-14+(i?40:0),width:180,height:48,angle:i?8:-7,color:TAPES[(v+i)%TAPES.length],opacity:.85});
      }
      y+=(shots.length>1?side*1.26+60:side*1.26+40);
      y=Math.ceil((y-NY-150)/LINE_GAP)*LINE_GAP+NY+150;
    }
  }
  // 요점: 줄 위에 손글씨로 한 줄씩. 첫 낱말 앞에 체크 표시.
  // y는 항상 노트 줄 위치에 맞춰 두고, 글자 아랫부분이 다음 줄(y+LINE_GAP)에 닿게 놓는다.
  // 줄 간격(spacing)을 노트 줄 간격에 맞춰, 요점이 두 줄로 넘어가도 둘째 줄이 다음 노트 줄 위에 앉는다.
  if(!content.cover){
    const size=hasPhoto?50:64;
    const bottom=NY+NH-120;
    const lines=await Promise.all(content.points.slice(0,hasPhoto?3:4).map(point=>textLayer(`✓ ${point}`,{size,color:PEN,width:TW,height:LINE_GAP*3,font:STYLE_FONTS.hand,spacing:LINE_GAP-Math.round(size*1.2)})));
    const rowsOf=(line:typeof lines[number])=>Math.max(1,Math.round(line.info.height/LINE_GAP));
    // 글자 장은 남는 노트 줄을 요점 사이에 고르게 나눠(최대 3줄) 아래가 비지 않게 한다.
    const free=Math.floor((bottom-y)/LINE_GAP)-lines.reduce((sum,line)=>sum+rowsOf(line),0);
    const gapLines=hasPhoto||lines.length<2?0:Math.max(1,Math.min(3,Math.floor(free/(lines.length-1))));
    for(const line of lines){
      const rows=rowsOf(line);
      if(y+rows*LINE_GAP>bottom)break;
      layers.push({input:line.data,left:TX,top:y+LINE_GAP-Math.round(size*1.2)-2});
      y+=(rows+gapLines)*LINE_GAP;
    }
  }
  // 오른쪽 아래 빨간 펜 낙서와 쪽수.
  const sign=await textLayer(`${STORE_NAME} 다이어리  ${index}/${total}`,{size:40,color:RED_PEN,width:640,height:60,font:STYLE_FONTS.hand,align:"centre"});
  layers.push({input:sign.data,left:1080-NX-40-sign.info.width,top:1350-60-sign.info.height-26});
  deco+=`<path d="M${1080-NX-60-sign.info.width} ${1350-82}q${sign.info.width/2} 18 ${sign.info.width+40} 0" fill="none" stroke="${RED_PEN}" stroke-width="3"/>`;
  layers.unshift(svgLayer(deco));
  layers.push(await grainLayer({opacity:.28}));
  return sharp({create:{width:1080,height:1350,channels:3,background:KRAFT}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
