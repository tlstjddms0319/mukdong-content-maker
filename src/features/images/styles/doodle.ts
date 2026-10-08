import sharp, { type OverlayOptions } from "sharp";
import { brandName, croppedPhoto, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, rotated, snap, type StyleContent } from "./shared";
import { handStar, seeded, squiggle } from "./handDrawn";

// 사진 위 손그림 낙서: 사진을 화면 가득 쓰고, 그 위에 마커로 동그라미·화살표·별과 짧은 손글씨 메모를 그린다.
// 제목은 노란 형광펜을 그은 띠 위에 검은 손글씨. 아래 요점은 어둡게 깐 사진 위 흰 고딕(그림자).
// 사진이 없는 장은 흰 종이에 같은 낙서로. 친근하고 가볍게 "여기 좀 봐" 하는 카드에 쓴다.
const HIGHLIGHT="#FFE14D",INK="#141414",PAPER="#FAF7F0";
// 빨간 마커: 노란 형광펜 띠 위 제목 핵심어(대비 4:1 이상)와 명함 저장 칩(흰 글자 5:1 이상)에 쓴다.
const RED_MARKER="#C8102E";
// 메모 문구는 사실을 단정하지 않는 감탄만 쓴다.
const NOTES=["여기 결 좀 봐!","이 한 점!","요기요기","놓치지 마세요","바로 이거","침 고이는 중"];

// 테이프 아래 얇은 그림자(작은 번짐). 종이 위에 붙은 테이프 한 겹의 두께만 보이게 짧고 옅게. 필터 정의는 deco 맨 앞에 한 번.
const TAPE_SHADOW_DEFS=`<defs><filter id="tapeShadow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>`;
const tape=(d:string,fill:string,opacity:number)=>`<path d="${d}" transform="translate(2 3)" fill="#000" opacity=".26" filter="url(#tapeShadow)"/><path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
// 마스킹 테이프 한 조각(살짝 비뚤어진 사각형). 메모 글자 뒤에 깐다.
const tapeStrip=(x:number,y:number,w:number,h:number,fill:string,opacity:number)=>tape(`M${x-16} ${y+4} L${x+w+16} ${y-2} L${x+w+20} ${y+h+4} L${x-12} ${y+h+8} Z`,fill,opacity);

// ── 손그림 마커 획(필압) ─────────────────────────────────────────────────────────────
// 같은 굵기의 stroke는 "도형"처럼 보인다. 마커로 그은 선은 처음 누를 때 굵고 끝으로 갈수록 가늘어지므로,
// 선 중심을 따라 좌우로 굵기만큼 벌린 테두리(리본)를 채워 그린다.
type Pt=[number,number];
const r1=(v:number)=>Math.round(v*10)/10;
const jit=(rand:()=>number,amount:number)=>(rand()-.5)*2*amount;
// 점들을 이웃 점의 중간을 지나는 2차 곡선으로 잇는다(이미 그린 경로에 이어 붙일 수 있게 M 없이).
function through(points:Pt[]):string {
  let d="";
  for(let i=1;i<points.length-1;i++){const [x,y]=points[i],[nx,ny]=points[i+1];d+=` Q${r1(x)} ${r1(y)} ${r1((x+nx)/2)} ${r1((y+ny)/2)}`;}
  const last=points[points.length-1];
  return d+` L${r1(last[0])} ${r1(last[1])}`;
}
function ribbon(points:Pt[],width:(u:number)=>number):string {
  const n=points.length,left:Pt[]=[],right:Pt[]=[];
  for(let i=0;i<n;i++){
    const [px,py]=points[Math.max(0,i-1)],[qx,qy]=points[Math.min(n-1,i+1)],[x,y]=points[i];
    const len=Math.hypot(qx-px,qy-py)||1,nx=-(qy-py)/len,ny=(qx-px)/len,w=width(i/(n-1))/2;
    left.push([x+nx*w,y+ny*w]);right.push([x-nx*w,y-ny*w]);
  }
  right.reverse();
  return `M${r1(left[0][0])} ${r1(left[0][1])}${through(left)} L${r1(right[0][0])} ${r1(right[0][1])}${through(right)} Z`;
}
// 마커 필압: 처음 눌러 굵고(.82) 가운데에서 가장 굵었다가(1.15) 손을 떼며 가늘어진다(.55).
const pressure=(base:number)=>(u:number)=>base*(.55+.6*Math.sin(Math.PI*Math.min(1,.15+u*.85)));
// 손으로 두른 동그라미(한 바퀴 조금 넘게, 시작과 끝이 어긋남)를 필압 리본으로.
function markerEllipse(cx:number,cy:number,rx:number,ry:number,rand:()=>number,amount:number,base:number):string {
  const start=rand()*Math.PI*2,turns=1.12,steps=40;
  const points:Pt[]=Array.from({length:steps+1},(_,i)=>{
    const a=start+(Math.PI*2*turns*i)/steps,grow=1+.05*(i/steps);
    return [cx+Math.cos(a)*rx*grow+jit(rand,amount*.6),cy+Math.sin(a)*ry*grow+jit(rand,amount*.6)];
  });
  return ribbon(points,pressure(base));
}
// 손으로 그린 화살표: 휘어진 몸통은 필압 리본, 머리 두 갈래는 짧게 끝이 가늘어지는 획.
function markerArrow(x1:number,y1:number,x2:number,y2:number,rand:()=>number,bend:number,base:number):string {
  const mx=(x1+x2)/2,my=(y1+y2)/2,dx=x2-x1,dy=y2-y1;
  const cx=mx-dy*bend+jit(rand,8),cy=my+dx*bend+jit(rand,8);
  const steps=18,shaft:Pt[]=Array.from({length:steps+1},(_,i)=>{const t=i/steps,u=1-t;return [u*u*x1+2*u*t*cx+t*t*x2,u*u*y1+2*u*t*cy+t*t*y2];});
  const angle=Math.atan2(y2-cy,x2-cx),head=Math.max(22,Math.hypot(dx,dy)*.14);
  const wing=(side:number):Pt[]=>{const a=angle+side*.5;return [[x2,y2],[x2-Math.cos(a)*head*.5,y2-Math.sin(a)*head*.5],[x2-Math.cos(a)*head,y2-Math.sin(a)*head]];};
  const taper=(u:number)=>base*(1.05-.5*u);
  return ribbon(shaft,(u:number)=>base*(.7+.45*Math.sin(Math.PI*Math.min(1,.2+u*.7))))+ribbon(wing(1),taper)+ribbon(wing(-1),taper);
}
// 형광펜 한 줄 획: 가장자리는 잘게 거칠고(짧은 직선 마디 + 떨림), 양 끝(특히 끝 쪽)이 펜을 멈추며 조금 굵어진다.
function highlighterStroke(x0:number,x1:number,yc:number,t:number,rand:()=>number):string {
  const n=Math.max(8,Math.round((x1-x0)/14)),drift=jit(rand,4),top:Pt[]=[],bottom:Pt[]=[];
  for(let i=0;i<=n;i++){
    const u=i/n,x=x0+(x1-x0)*u,y=yc+drift*(u-.5)*2;
    const swell=1+.08*Math.max(0,1-u/.1)+.14*Math.max(0,(u-.88)/.12),half=t/2*swell;
    top.push([x,y-half+jit(rand,1.6)]);bottom.push([x,y+half+jit(rand,1.6)]);
  }
  const line=(points:Pt[])=>points.map(([x,y])=>`L${r1(x)} ${r1(y)}`).join("");
  const end=top[n],start=top[0];
  return `M${r1(start[0])} ${r1(start[1])}${line(top.slice(1))}Q${r1(end[0]+t*.22)} ${r1(yc+drift)} ${r1(bottom[n][0])} ${r1(bottom[n][1])}${line(bottom.slice(0,n).reverse())}Q${r1(start[0]-t*.14)} ${r1(yc-drift)} ${r1(start[0])} ${r1(start[1])}Z`;
}

// 형광펜 띠 위 제목. 줄마다 따로 그은 마커 획(글자 줄 폭만큼)을 글자와 같은 캔버스에 그려, 같이 기울인 뒤 두 장으로 돌려준다.
// 띠를 따로 돌려주는 이유: 밝은 바탕에서는 띠를 multiply로 얹어 종이·사진 결이 비치는 "진짜 형광펜"처럼 보이게 하려는 것.
// 줄 위치는 글자 알파를 가로줄 단위로 훑어 잉크가 있는 줄 묶음으로 찾는다(줄 사이 빈 줄 8px 이상이면 다른 줄).
async function highlightedTitle(content:StyleContent,options:{sizes:number[];width:number;maxHeight:number;angle:number;rand:()=>number;multiply:boolean}):Promise<{band:Layer;under:Layer|null;text:Layer}> {
  const text=await fitText(content.headline,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,color:INK,font:STYLE_FONTS.chalk,align:"left",spacing:6,emphasis:emphasisOf(content,RED_MARKER)});
  const padX=28,padY=18,W=text.info.width+padX*2,H=text.info.height+padY*2;
  const {data,info}=await sharp(text.data).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true});
  const runs:Array<{y0:number;y1:number;x0:number;x1:number}>=[];
  let gap=99;
  for(let y=0;y<info.height;y++){
    let x0=-1,x1=-1;
    for(let x=0;x<info.width;x++)if(data[y*info.width+x]>40){if(x0<0)x0=x;x1=x;}
    if(x0<0){gap++;continue;}
    const last=runs[runs.length-1];
    if(last&&gap<8){last.y1=y;last.x0=Math.min(last.x0,x0);last.x1=Math.max(last.x1,x1);}
    else runs.push({y0:y,y1:y,x0,x1});
    gap=0;
  }
  // 잉크가 거의 없는 짧은 묶음(쉼표 꼬리 같은 것)은 앞 줄에 붙인다.
  const lines=runs.filter(run=>run.y1-run.y0>=12);
  if(!lines.length)lines.push({y0:0,y1:info.height-1,x0:0,x1:info.width-1});
  const strokes=lines.map(line=>highlighterStroke(padX+line.x0-18,padX+line.x1+20,padY+(line.y0+line.y1)/2+3,line.y1-line.y0+22,options.rand)).join("");
  // multiply만 쓰면 회색·푸른 바탕에서 노랑이 겨자색으로 탁해진다. 그 아래에 반투명(.7) 보통 띠를 한 겹 깔아
  // 노랑의 맑기를 지키고, 위의 multiply 띠(옅은 노랑)는 바탕 결이 살짝 비치는 정도로만 쓴다.
  // sharp(libvips)의 multiply는 반투명 덧칠을 미리 곱한(premultiplied) 색으로 계산해 투명도를 낮출수록 오히려 더 어두워진다.
  // 그래서 multiply 띠는 불투명하게 두고, 세기는 색으로 조절한다(노랑을 흰색 쪽으로 40% 섞은 옅은 노랑 = 세기 .6).
  const bandSvg=(opacity:number,color=HIGHLIGHT)=>Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="${strokes}" fill="${color}" fill-opacity="${opacity}"/></svg>`);
  const transparent={r:0,g:0,b:0,alpha:0};
  const onCanvas=async(input:Buffer,left:number,top:number)=>{
    const flat=await sharp({create:{width:W,height:H,channels:4,background:transparent}}).composite([{input,left,top}]).png().toBuffer();
    return options.angle?rotated(flat,options.angle):sharp(flat).png().toBuffer({resolveWithObject:true});
  };
  return {
    band:await onCanvas(options.multiply?bandSvg(1,"#FFED94"):bandSvg(.95),0,0),
    under:options.multiply?await onCanvas(bandSvg(.7),0,0):null,
    text:await onCanvas(text.data,padX,padY),
  };
}

export const renderDoodle:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const rand=seeded(index*29+(slide.variant??0)*7+1);
  const layers:OverlayOptions[]=[];
  const M=70,footerTop=1350-76;
  const hasPhoto=inputs.length>0;
  let deco=TAPE_SHADOW_DEFS;
  const marker=hasPhoto?"#FFFFFF":INK;
  // 사진 가득(croppedPhoto가 자동 검수용 사진으로 등록한다). 아래 그라데이션은 요점 높이가 정해진 뒤 깐다.
  const photo=hasPhoto?await croppedPhoto(inputs[0],1080,1350,0):null;
  if(photo){
    layers.push({input:photo,left:0,top:0});
    // 위쪽은 제목 띠 둘레만 살짝(.22) 어둡게.
    deco+=`<defs><linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="420" fill="url(#fadeTop)"/>`;
  }else{
    deco+=`<defs><pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="#D9D3C4"/></pattern></defs><rect width="1080" height="1350" fill="url(#dots)"/>`;
  }
  // 제목(형광펜 띠). 표지는 크게. 띠 아래 바탕이 밝으면(밝기 .55 이상) multiply로 얹어 바탕 결이 비치게,
  // 어두운 사진 위에서는 multiply가 노랑을 죽이므로 보통 겹치기로. 사진 위쪽은 위 그라데이션(.22)만큼 어둡게 쳐서 잰다.
  let bright=true;
  if(photo){
    // sharp의 stats()는 extract 같은 앞단 처리를 무시하고 원본 전체를 잰다. 잘라 낸 버퍼를 따로 만든 뒤 잰다.
    const region=await sharp(await sharp(photo).extract({left:60,top:70,width:860,height:280}).toBuffer()).stats();
    bright=(.2126*region.channels[0].mean+.7152*region.channels[1].mean+.0722*region.channels[2].mean)/255*.85>=.55;
  }
  const angle=(rand()-.5)*3;
  const {band,under,text:title}=await highlightedTitle(content,{sizes:content.cover?[92,82,74,68]:hasPhoto?[68,64]:[80,72,64],width:860,maxHeight:content.cover?300:hasPhoto?240:280,angle,rand,multiply:bright});
  // 요점(아래부터 쌓는다): 여러 줄 읽는 글이라 마커 손글씨 대신 프리텐다드 세미볼드로 쓴다(손글씨는 짧은 메모만).
  // 사진 위는 흰 글자 + 그림자 40px, 종이 위는 검은 글자 48px(글자만 장 46px 이상).
  const points=content.points.slice(0,hasPhoto?3:4);
  // 마지막 장: 바닥글 자리에 노란 테이프로 붙인 흰 메모지 명함. 높이를 먼저 예약하고 요점을 그 위에 쌓는다.
  const closing=content.last?await closingBlock({width:860,color:INK,accent:RED_MARKER,font:STYLE_FONTS.sansBold}):null;
  const CARD_PAD=24,CARD_GAP=44;
  const nameW=closing?Math.max(closing.wordmark.info.width,closing.handle?.info.width??0):0,chipW=closing?closing.chip.info.width+52:0;
  // 자리를 아끼려고 "가게 이름·계정 | 저장 칩" 가로 한 줄, 긴 계정이라 폭이 모자라면 세로로 쌓는다.
  const cardWide=!!closing&&nameW+CARD_GAP+chipW+72<=1080-2*M;
  const nameH=closing?closing.wordmark.info.height+(closing.handle?8+closing.handle.info.height:0):0;
  const cardH=!closing?0:cardWide?Math.max(nameH,closing.chip.info.height+24)+CARD_PAD*2:closing.height+CARD_PAD*2;
  const cardTop=1300-cardH;
  // 표지: 제목 띠 아래 검은 테이프 위 부제, 바닥글 위 노란 테이프 위 예고 글.
  const subline=content.subline?await textLayer(content.subline,{size:34,color:"#FFFFFF",width:860,height:60,font:STYLE_FONTS.sansSemi}):null;
  const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:INK,width:860,height:50,font:STYLE_FONTS.sansSemi}):null;
  const bottom=closing?cardTop-24:teaser?footerTop-teaser.info.height-40:footerTop;
  // 요점 크기: 사진 위 40 / 종이 48. 마지막 장은 명함 자리만큼 넘치면 고딕 44·40·36까지 낮춘다(요점 수는 그대로).
  const sizes=hasPhoto?(closing?[40,36]:[40]):(closing?[48,44,40,36]:[48]);
  // 종이 장은 요점 사이를 조금 더 벌려(30) 목록이 빽빽해 보이지 않게 한다.
  const POINT_GAP=hasPhoto?18:30;
  // 종이 장은 제목·요점·메모(마지막 장은 명함) 덩어리를 세로 가운데에 둔다(메모 자리 150px).
  const tail=closing?0:150;
  let pointSize=sizes[0],pointLayers:Layer[]=[],pointsH=0;
  for(const size of sizes){
    pointSize=size;
    pointLayers=await Promise.all(points.map(point=>textLayer(point,{size,color:hasPhoto?"#FFFFFF":INK,width:860,height:600,font:STYLE_FONTS.sansSemi,spacing:Math.round(size*.22),...(hasPhoto?{shadow:true}:{})})));
    pointsH=pointLayers.reduce((sum,layer)=>sum+layer.info.height+POINT_GAP,0);
    const need=hasPhoto?70+title.info.height+60+pointsH:110+title.info.height+90+pointsH+tail;
    if(need<=bottom)break;
  }
  const titleTop=hasPhoto?70:Math.max(110,Math.round((bottom-(title.info.height+90+pointsH+tail))/2));
  if(under)layers.push({input:under.data,left:M-10,top:titleTop});
  layers.push({input:band.data,left:M-10,top:titleTop,...(bright?{blend:"multiply" as const}:{})},{input:title.data,left:M-10,top:titleTop});
  let y=titleTop+title.info.height+20;
  if(subline){
    // 부제는 제목 띠 바로 아래 검은 마스킹 테이프 위 흰 글자(사진 위에서도 또렷하게).
    const sx=M+6,sy=y+4;
    deco+=tapeStrip(sx,sy-6,subline.info.width,subline.info.height+12,"#141414",.85);
    layers.push({input:subline.data,left:sx,top:sy});
    y=sy+subline.info.height+24;
  }
  let py=hasPhoto?bottom-pointsH-16:y+70;
  if(photo){
    // 아래 그라데이션은 요점 덩어리에 맞춘다: 요점 시작 140px 위에서 0으로 시작해 바닥에서 .72.
    // 요점 뒤 사진이 밝으면(흰 접시·밝은 상) 흰 글자가 묻히므로 .82까지 더 어둡게 한다.
    const from=Math.max(0,Math.round(py-140));
    const region=await sharp(await sharp(photo).extract({left:0,top:Math.min(1300,Math.max(0,py)),width:1080,height:Math.max(50,1350-Math.min(1300,Math.max(0,py)))}).toBuffer()).stats();
    const luma=.2126*region.channels[0].mean+.7152*region.channels[1].mean+.0722*region.channels[2].mean;
    const end=luma>150?.82:.72;
    deco+=`<defs><linearGradient id="fadeBottom" gradientUnits="userSpaceOnUse" x1="0" y1="${from}" x2="0" y2="1350"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".45" stop-color="#000" stop-opacity="${Math.round(end*.62*100)/100}"/><stop offset="1" stop-color="#000" stop-opacity="${end}"/></linearGradient></defs><rect y="${from}" width="1080" height="${1350-from}" fill="url(#fadeBottom)"/>`;
  }
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
    deco+=tape(`M${ex-16} ${ey+4} L${ex+extra.info.width+14} ${ey-2} L${ex+extra.info.width+18} ${ey+extra.info.height+4} L${ex-12} ${ey+extra.info.height+8} Z`,"#141414",.82);
    layers.push({input:extra.data,left:ex,top:ey});
    deco+=`<path d="${markerArrow(ex+extra.info.width+10,ey+extra.info.height,sx+20,sy+D*.55,rand,.25,8)}" fill="${HIGHLIGHT}"/>`;
  }else if(hasPhoto&&gapBottom-gapTop>260){
    const cy=(gapTop+gapBottom)/2+20,ry=Math.min(200,(gapBottom-gapTop)/2-30),rx=Math.min(330,ry*1.5);
    const cx=540+(rand()-.5)*80;
    deco+=`<path d="${markerEllipse(cx,cy,rx,ry,rand,7,10)}" fill="${HIGHLIGHT}"/>`;
    const note=await textLayer(NOTES[(index+(slide.variant??0))%NOTES.length],{size:64,color:HIGHLIGHT,width:460,height:110,font:STYLE_FONTS.marker,shadow:true});
    const noteLeft=cx>540?M:1080-M-note.info.width,noteTop=Math.max(gapTop,cy-ry-note.info.height-10);
    // 밝은 사진 위에서도 노란 메모가 읽히도록 뒤에 검은 마스킹 테이프 띠를 깐다.
    deco+=tape(`M${noteLeft-18} ${noteTop+4} L${noteLeft+note.info.width+16} ${noteTop-2} L${noteLeft+note.info.width+20} ${noteTop+note.info.height+4} L${noteLeft-14} ${noteTop+note.info.height+8} Z`,"#141414",.82);
    layers.push({input:note.data,left:noteLeft,top:noteTop});
    const fromX=noteLeft+note.info.width/2,fromY=noteTop+note.info.height-6;
    const toX=cx+(cx>540?-rx*.7:rx*.7),toY=cy-ry*.55;
    deco+=`<path d="${markerArrow(fromX,fromY,toX,toY,rand,.18,8)}" fill="${HIGHLIGHT}"/>`;
    deco+=`<path d="${handStar(cx+(cx>540?rx*.85:-rx*.85),cy+ry*.7,26,rand)}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round"/>`;
  }else if(!hasPhoto){
    // 종이 장 낙서: 제목 띠를 한 바퀴 두른 손그림 동그라미, 오른쪽 위 별, 아래쪽 노란 띠 위 마커 메모와 화살표.
    deco+=`<path d="${markerEllipse(M-10+title.info.width/2,titleTop+title.info.height/2,title.info.width/2+36,title.info.height/2+26,rand,6,6)}" fill="${INK}" opacity=".9"/>`
      +`<path d="${handStar(1080-M-30,Math.max(60,titleTop-40),30,rand)}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  }
  // 요점 앞에 손으로 그린 체크 상자.
  for(const layer of pointLayers){
    // 체크 상자(34px)를 첫 줄 글자 가운데 높이에 맞춘다(그림자 글자는 사방 10px 여백이 붙어 있다).
    const bx=M,by=py+(hasPhoto?10:0)+Math.round(pointSize*.62)-17;
    deco+=`<path d="M${bx} ${by} l34 -2 l2 34 l-35 2 Z" stroke="${marker}" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M${bx+6} ${by+16} l10 12 l24 -30" stroke="${HIGHLIGHT}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    layers.push({input:layer.data,left:M+56,top:py});
    py+=layer.info.height+POINT_GAP;
  }
  if(!hasPhoto&&pointLayers.length){
    deco+=`<path d="${squiggle(M,py+6,420,rand,12)}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    // 남는 자리에 노란 띠 위 마커 메모 + 마지막 요점을 가리키는 화살표.
    if(!closing&&footerTop-py>150){
      const note=await textLayer(NOTES[(index+(slide.variant??0))%NOTES.length],{size:60,color:INK,width:460,height:100,font:STYLE_FONTS.marker});
      const nx=1080-M-note.info.width-20,ny=py+40;
      // 화살표 끝은 마지막 요점 글줄의 오른쪽 끝 옆(글자 위를 긁지 않게). 글줄이 길어 메모 쪽까지 닿으면
      // 글줄과 밑줄(구불선) 사이 빈 틈을 가리킨다.
      const lastPoint=pointLayers[pointLayers.length-1],lineEnd=M+56+lastPoint.info.width+22;
      const besideLine=lineEnd<=nx-60;
      const arrowX=besideLine?lineEnd:Math.min(M+480,nx-80),arrowY=besideLine?py-POINT_GAP-Math.round(lastPoint.info.height*.45):py-POINT_GAP+12;
      deco+=tape(`M${nx-16} ${ny+6} L${nx+note.info.width+18} ${ny} L${nx+note.info.width+14} ${ny+note.info.height+6} L${nx-12} ${ny+note.info.height+10} Z`,HIGHLIGHT,.95)
        +`<path d="${markerArrow(nx-30,ny+note.info.height/2,arrowX,arrowY,rand,.2,6)}" fill="${INK}"/>`;
      layers.push({input:note.data,left:nx,top:ny});
    }
  }
  const footColor=hasPhoto?"#F2F2F2":"#5C574E";
  if(teaser){
    // 표지 예고: 바닥글 위 노란 마스킹 테이프 한 조각 위 검은 글자(살짝 비뚤게 붙인 메모 테이프).
    const tx=M+6,ty=footerTop-teaser.info.height-18;
    deco+=tapeStrip(tx,ty-8,teaser.info.width,teaser.info.height+16,HIGHLIGHT,.95);
    layers.push({input:teaser.data,left:tx,top:ty});
  }
  if(closing){
    // 흰 메모지 명함: 위 가운데를 노란 테이프로 고정. 바닥글(가게 이름)은 명함과 겹치므로 생략한다.
    const cw=cardWide?nameW+CARD_GAP+chipW+72:Math.max(nameW,chipW)+100,cx=Math.round(540-cw/2);
    deco+=`<rect x="${cx+10}" y="${cardTop+12}" width="${cw}" height="${cardH}" fill="#000" opacity=".3"/><path d="M${cx} ${cardTop+3} L${cx+cw} ${cardTop} L${cx+cw-2} ${cardTop+cardH} L${cx+2} ${cardTop+cardH-2} Z" fill="#FFFFFF"/>`
      +tapeStrip(540-70,cardTop-20,140,36,HIGHLIGHT,.92);
    if(cardWide){
      const nameMid=cx+36+nameW/2;
      let ny=cardTop+Math.round((cardH-nameH)/2);
      layers.push({input:closing.wordmark.data,left:Math.round(nameMid-closing.wordmark.info.width/2),top:ny});
      ny+=closing.wordmark.info.height+8;
      if(closing.handle)layers.push({input:closing.handle.data,left:Math.round(nameMid-closing.handle.info.width/2),top:ny});
      const chipLeft=cx+cw-36-chipW+26,chipTop=cardTop+Math.round((cardH-closing.chip.info.height)/2);
      deco+=closing.chipSvg(chipLeft,chipTop);
      layers.push({input:closing.chip.data,left:chipLeft,top:chipTop});
    }else{
      let cy=cardTop+CARD_PAD;
      layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top:cy});
      cy+=closing.wordmark.info.height;
      if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
      cy+=18+12;
      const chipLeft=Math.round(540-closing.chip.info.width/2);
      deco+=closing.chipSvg(chipLeft,cy);
      layers.push({input:closing.chip.data,left:chipLeft,top:cy});
    }
  }else{
    // 바닥글: 가게 이름·장 번호(26px, 고정폭 숫자). 본문 장은 왼쪽에 두고 오른쪽 끝에 "넘겨 보기"를 같은 줄로.
    const cue=content.cover?null:await nextCue(hasPhoto?"#FFFFFF":INK,26);
    const footer=await textLayer(`${brandName()}  ·  ${index}`,{size:26,color:footColor,width:1080-2*M-(cue?cue.width+40:0),height:40,font:STYLE_FONTS.sansSemi,features:"tnum"});
    const fy=footerTop+22;
    layers.push({input:footer.data,left:cue?M:Math.round((1080-footer.info.width)/2),top:fy});
    if(cue){
      const qx=1080-M-cue.width,qy=fy+Math.round((footer.info.height-cue.height)/2);
      deco+=cue.arrow(qx,qy);
      layers.push({input:cue.label.data,left:qx,top:qy});
    }
  }
  layers.splice(hasPhoto?1:0,0,svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
