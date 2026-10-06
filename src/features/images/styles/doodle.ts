import sharp, { type OverlayOptions } from "sharp";
import { brandName, croppedPhoto, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, rotated, snap, type StyleContent } from "./shared";
import { handArrow, handEllipse, handStar, seeded, squiggle } from "./handDrawn";

// 사진 위 손그림 낙서: 사진을 화면 가득 쓰고, 그 위에 마커로 동그라미·화살표·별과 짧은 손글씨 메모를 그린다.
// 제목은 노란 형광펜을 그은 띠 위에 검은 손글씨. 아래 요점은 어둡게 깐 사진 위 흰 고딕(그림자).
// 사진이 없는 장은 흰 종이에 같은 낙서로. 친근하고 가볍게 "여기 좀 봐" 하는 카드에 쓴다.
const HIGHLIGHT="#FFE14D",INK="#141414",PAPER="#FAF7F0";
// 빨간 마커: 노란 형광펜 띠 위 제목 핵심어(대비 4:1 이상)와 명함 저장 칩(흰 글자 5:1 이상)에 쓴다.
const RED_MARKER="#C8102E";
// 메모 문구는 사실을 단정하지 않는 감탄만 쓴다.
const NOTES=["여기 결 좀 봐!","이 한 점!","요기요기","놓치지 마세요","바로 이거","침 고이는 중"];

// 마스킹 테이프 한 조각(살짝 비뚤어진 사각형). 메모 글자 뒤에 깐다.
const tapeStrip=(x:number,y:number,w:number,h:number,fill:string,opacity:number)=>`<path d="M${x-16} ${y+4} L${x+w+16} ${y-2} L${x+w+20} ${y+h+4} L${x-12} ${y+h+8} Z" fill="${fill}" opacity="${opacity}"/>`;

// 형광펜 띠 위 제목. 띠는 살짝 기울고 양 끝이 들쭉날쭉하다.
async function highlightedTitle(content:StyleContent,options:{sizes:number[];width:number;maxHeight:number;angle:number}):Promise<{data:Buffer;info:{width:number;height:number}}> {
  const text=await fitText(content.headline,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,color:INK,font:STYLE_FONTS.chalk,align:"left",spacing:6,emphasis:emphasisOf(content,RED_MARKER)});
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
  // 사진 가득(croppedPhoto가 자동 검수용 사진으로 등록한다). 아래 그라데이션은 요점 높이가 정해진 뒤 깐다.
  const photo=hasPhoto?await croppedPhoto(inputs[0],1080,1350,0):null;
  if(photo){
    layers.push({input:photo,left:0,top:0});
    // 위쪽은 제목 띠 둘레만 살짝(.22) 어둡게.
    deco+=`<defs><linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="420" fill="url(#fadeTop)"/>`;
  }else{
    deco+=`<defs><pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="#D9D3C4"/></pattern></defs><rect width="1080" height="1350" fill="url(#dots)"/>`;
  }
  // 제목(형광펜 띠). 표지는 크게.
  const title=await highlightedTitle(content,{sizes:content.cover?[92,82,74,68]:hasPhoto?[68,64]:[80,72,64],width:860,maxHeight:content.cover?300:hasPhoto?240:280,angle:(rand()-.5)*3});
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
  layers.push({input:title.data,left:M-10,top:titleTop});
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
    const region=await sharp(photo).extract({left:0,top:Math.min(1300,Math.max(0,py)),width:1080,height:Math.max(50,1350-Math.min(1300,Math.max(0,py)))}).stats();
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
    // 종이 장 낙서: 제목 띠를 한 바퀴 두른 손그림 동그라미, 오른쪽 위 별, 아래쪽 노란 띠 위 마커 메모와 화살표.
    deco+=`<path d="${handEllipse(M-10+title.info.width/2,titleTop+title.info.height/2,title.info.width/2+36,title.info.height/2+26,rand,6)}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"/>`
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
      deco+=`<path d="M${nx-16} ${ny+6} L${nx+note.info.width+18} ${ny} L${nx+note.info.width+14} ${ny+note.info.height+6} L${nx-12} ${ny+note.info.height+10} Z" fill="${HIGHLIGHT}" opacity=".95"/>`
        +`<path d="${handArrow(nx-30,ny+note.info.height/2,M+480,py-30,rand,.2)}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
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
    const footer=await textLayer(`${brandName()}  ·  ${index}/${total}`,{size:26,color:footColor,width:1080-2*M-(cue?cue.width+40:0),height:40,font:STYLE_FONTS.sansSemi,features:"tnum"});
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
