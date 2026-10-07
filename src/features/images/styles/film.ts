import sharp, { type OverlayOptions } from "sharp";
import { textureLayer } from "../decor";
import { grainLayer, svgLayer, textLayer, type CardRenderer, type Layer, type TextEmphasis, brandName } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STORE_NAME } from "../slideLayout";
import { MIN_STROKE, STYLE_FONTS, chooseTitleLayout, closingBlock, contentOf, emphasisOf, filmPhoto, fitText, nextCue, snap, type StyleContent } from "./shared";

// 감성 필름: 검은 필름 띠 양옆에 톱니 구멍과 주황 가장자리 글자("묵동홍어마을 · 장 번호")를 넣고,
// 가운데 프레임에 따뜻하게 바랜 필름 사진(빛샘·비네트)을 놓는다. 글은 영화 자막처럼 사진 아래 가운데에 흰 명조로.
// 사진 오른쪽 아래에는 옛 필름 카메라의 주황 숫자 도장처럼 장 번호만 찍는다(필름 감도·날짜 같은 숫자는 사실처럼 보여 넣지 않는다).
const BASE="#121110",EDGE_TEXT="#E8923A",SUB="#F4EFE4",DIM="#C9C2B6";
// 명함 칩 바탕: 가장자리 주황(#E8923A)은 흰 글자와 대비가 2.4:1이라 같은 계열의 진한 구릿빛을 쓴다.
const CHIP="#A24E17";
const FX=100,FW=1080-FX*2,FOOT_TOP=1350-54;

// 톱니 구멍(스프로킷): 필름에 뚫린 구멍이라 위 안쪽 가장자리는 필름 두께의 그늘로 어둡고, 아래 가장자리는 빛을 조금 받는다.
// 세로 그라데이션 채움(위 진하게 → 아래 밝게) + 아래 가장자리 가는 밝은 선으로 얕은 안쪽 그림자를 낸다(흐림 필터 없이).
function filmStrip():string {
  let holes=`<defs><linearGradient id="filmHole" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B0A09"/><stop offset=".35" stop-color="#211F1C"/><stop offset="1" stop-color="#302C28"/></linearGradient></defs>`;
  const hole=(x:number,y:number)=>`<rect x="${x}" y="${y}" width="34" height="38" rx="6" fill="url(#filmHole)"/><path d="M${x+6} ${y+37}H${x+28}" stroke="#4A443D" stroke-width="2" stroke-linecap="round"/>`;
  for(let y=24;y<1350;y+=62)holes+=hole(18,y)+hole(1080-52,y);
  return holes+`<path d="M70 0V1350M${1080-70} 0V1350" stroke="#2A2724" stroke-width="${MIN_STROKE}"/>`;
}

// 프레임 뒤 따뜻한 후광: 영사기 빛이 필름 프레임 둘레로 번지는 느낌. 프레임보다 조금 큰 타원에 반경 그라데이션
// (가운데~70%는 .18, 바깥으로 0)을 깔아 프레임 테두리 밖으로만 은은하게 보인다. 큰 흐림 필터 대신 그라데이션이라 싸다.
let haloId=0;
function warmHalo(x:number,y:number,w:number,h:number):string {
  const id=`filmHalo${haloId++}`;
  return `<defs><radialGradient id="${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFB46A" stop-opacity=".18"/><stop offset=".72" stop-color="#FFB46A" stop-opacity=".18"/><stop offset="1" stop-color="#FFB46A" stop-opacity="0"/></radialGradient></defs>`
    +`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${Math.round(w*.5/.72+40)}" ry="${Math.round(h*.5/.72+30)}" fill="url(#${id})"/>`;
}

// 필름 먼지(질감 자산 filmdust: 검은 바탕 + 밝은 먼지·긁힘)를 사진 칸 안에만 screen으로 얹는다.
// 세기 .3: 가까이 보면 먼지·긁힘이 보이고, 폰 크기에서는 지저분하지 않은 선(.4 넘으면 사진이 뿌옇게 뜬다).
// 질감을 사진 칸 크기로 덮어 맞추므로 같은 크기의 칸은 늘 같은 먼지(같은 입력 → 같은 그림). 파일이 없으면 null.
const filmDust=(x:number,y:number,w:number,h:number,strength=.3)=>textureLayer("filmdust",{opacity:strength,blend:"screen",left:x,top:y,width:w,height:h});

// 사진 위 자막용: 들어가는 가장 큰 크기와 균형 줄바꿈 폭은 공용 규칙(chooseTitleLayout)으로 고르고, 글자 둘레에 그림자를 깐다
// (fitText는 그림자 옵션이 없다). 그림자 여백(사방 10px)은 높이 계산에서 뺀다.
async function fitShadowText(value:string,sizes:number[],width:number,maxHeight:number,emphasis?:TextEmphasis){
  const layout=await chooseTitleLayout(value,{sizes,width,maxHeight:maxHeight-20,font:STYLE_FONTS.brushSerif,align:"centre",spacing:12});
  return textLayer(layout.text,{size:layout.size,color:SUB,width:layout.width,height:layout.fits?4000:maxHeight-20,font:STYLE_FONTS.brushSerif,align:"centre",spacing:12,shadow:true,emphasis});
}

// 필름 사진은 finishPhoto 뒤에 색·빛샘을 다시 입혀 새 버퍼가 되므로, 캔버스에 놓는 최종 버퍼를 사진으로 등록한다(검수의 사진 면적).
async function framePhoto(...args:Parameters<typeof filmPhoto>):Promise<Buffer> {
  const photo=await filmPhoto(...args);
  registerPhoto(photo);
  return photo;
}

const centred=(layer:Layer,top:number):OverlayOptions=>({input:layer.data,left:Math.round((1080-layer.info.width)/2),top});

// 마지막 장 가게 명함을 가운데에 놓는다. 레이어와 칩 바탕 SVG를 돌려준다(SVG는 글자보다 먼저 깔아야 한다).
async function closingLayers(top:number):Promise<{layers:OverlayOptions[];svg:string;height:number}> {
  const block=await closingBlock({width:FW,color:SUB,accent:CHIP});
  const layers:OverlayOptions[]=[centred(block.wordmark,top)];
  let y=top+block.wordmark.info.height;
  if(block.handle){y+=8;layers.push(centred(block.handle,y));y+=block.handle.info.height;}
  y+=18+12;
  const chipX=Math.round((1080-block.chip.info.width)/2);
  layers.push({input:block.chip.data,left:chipX,top:y});
  return {layers,svg:block.chipSvg(chipX,y),height:block.height};
}
const closingHeight=async()=>(await closingBlock({width:FW,color:SUB,accent:CHIP})).height;

// 아래 가장자리 줄: 왼쪽에 가게 이름·장 번호, 오른쪽에 "넘겨 보기"(가운데 장) 또는 "그날의 한 점"(표지·마지막 장).
// 긴 계정이 들어가 한 줄에 다 안 들어가면 오른쪽 글을 한 줄 위로 올린다(겹치지 않게, 생략하지 않게).
async function edgeFooter(content:StyleContent):Promise<{layers:OverlayOptions[];svg:string;top:number}> {
  // 마지막 장은 명함에 계정이 이미 크게 있으므로 바닥글에는 가게 이름만 둔다(같은 계정을 두 번 쓰지 않게).
  const folio=await textLayer(`${content.last?STORE_NAME:brandName()}  ·  ${content.index} / ${content.total}`,{size:26,color:EDGE_TEXT,width:FW,height:44,font:STYLE_FONTS.sansBold,features:"tnum"});
  const layers:OverlayOptions[]=[{input:folio.data,left:FX,top:FOOT_TOP}];
  const middle=!content.cover&&!content.last;
  const right=middle?await nextCue(EDGE_TEXT,26):null;
  const slogan=middle?null:await textLayer("그날의 한 점",{size:26,color:EDGE_TEXT,width:FW,height:44,font:STYLE_FONTS.serifHeavy});
  const rightW=right?right.width:slogan!.info.width;
  const sameLine=folio.info.width+40+rightW<=FW;
  const top=sameLine?FOOT_TOP:FOOT_TOP-(right?right.height:slogan!.info.height)-12;
  const x=FX+FW-rightW;
  let svg="";
  if(right){layers.push({input:right.label.data,left:x,top});svg=right.arrow(x,top);}
  else layers.push({input:slogan!.data,left:x,top});
  return {layers,svg,top:Math.min(top,FOOT_TOP)};
}

export const renderFilm:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const frame=String(index).padStart(2,"0");
  const emphasis=emphasisOf(content,EDGE_TEXT);
  const layers:OverlayOptions[]=[];
  let deco=filmStrip();
  // 필름 가장자리 글자(위): 가게 이름과 장 번호만.
  const edgeTop=await textLayer(`묵동홍어마을  ·  ${frame}`,{size:26,color:EDGE_TEXT,width:FW,height:44,font:STYLE_FONTS.sansBold,align:"centre",features:"tnum",letterSpacing:2});
  layers.push(centred(edgeTop,24));
  const footer=await edgeFooter(content);
  // 본문이 쓸 수 있는 바닥: 아래 가장자리 줄 위로 20px.
  const floor=footer.top-20;
  let y=90;
  const shots=inputs.slice(0,2);
  const leak=(index+(slide.variant??0))%2?"left":"right";
  const closingH=content.last?await closingHeight():0;
  if(shots.length&&content.cover){
    // 표지: 사진을 거의 끝까지 키우고 자막(제목·부제)을 사진 위에 얹는다. 예고 띠는 사진 아래 필름 여백에.
    const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:DIM,width:FW,height:50,font:STYLE_FONTS.serif,align:"centre"}):null;
    const FH=Math.min(1100,floor-y-(teaser?teaser.info.height+36:16));
    const shot=shots[0];
    layers.push({input:await framePhoto(shot,FW,FH,leak,"strong"),left:FX,top:y});
    const dust=await filmDust(FX,y,FW,FH);
    if(dust)layers.push(dust);
    deco+=warmHalo(FX,y,FW,FH)+`<rect x="${FX-6}" y="${y-6}" width="${FW+12}" height="${FH+12}" fill="none" stroke="#000" stroke-width="12"/>`;
    const stamp=await textLayer(frame,{size:40,color:"#FF9A3C",width:300,height:60,font:STYLE_FONTS.pixelBold});
    layers.push({input:await sharp(stamp.data).blur(.6).png().toBuffer(),left:FX+FW-stamp.info.width-30,top:y+60});
    // 표지 자막: 사진 아래쪽을 어둡게 깔고 그 위에 큰 제목을, 바로 밑에 작은 부제를 영화 자막처럼 얹는다.
    // 흰 접시 사진처럼 밝은 사진에서도 읽히도록 글자 둘레에 그림자(shadow)를 깔고, 그 아래쪽은 진하게 어둡게 한다.
    const sub=content.subline?await textLayer(content.subline,{size:34,color:DIM,width:FW-120,height:120,font:STYLE_FONTS.serif,align:"centre",shadow:true}):null;
    const subH=sub?sub.info.height+10:0;
    const title=await fitShadowText(content.headline,[88,78,70,62],FW-100,360,emphasis);
    const titleTop=y+FH-title.info.height-subH-44;
    // 어둡게 하는 띠는 사진 위에 와야 하므로 바닥 장식(deco)이 아니라 사진 다음 레이어로 넣는다.
    layers.push(svgLayer(`<defs><linearGradient id="filmFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".45" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs><rect x="${FX}" y="${titleTop-140}" width="${FW}" height="${y+FH-(titleTop-140)}" fill="url(#filmFade)"/>`));
    layers.push(centred(title,titleTop));
    if(sub)layers.push(centred(sub,titleTop+title.info.height+4));
    if(teaser){
      // 예고 띠: 사진 아래 필름 여백에 가는 주황 선 두 개 사이로 자막처럼.
      const ty=y+FH+24;
      layers.push(centred(teaser,ty));
      const mid=ty+teaser.info.height/2,half=teaser.info.width/2;
      deco+=`<path d="M${540-half-70} ${mid}H${540-half-24}M${540+half+24} ${mid}H${540+half+70}" stroke="${EDGE_TEXT}" stroke-width="${MIN_STROKE}"/>`;
    }
  }else if(shots.length){
    // 사진 장: 자막(제목·요점)과 마지막 장 명함을 먼저 재고, 남는 높이를 사진에 준다(요점을 버리지 않는다).
    // 사진이 너무 작아지면(한 장 320px 미만) 요점 글자를 한 단계 줄여 다시 잰다.
    const two=shots.length>1;
    const pointCount=two?2:3;
    let subtitle:Layer,lines:Layer[]=[],textH=0;
    for(const [size,titleSizes] of [[36,[52,46,42]],[32,[46,42,40]]] as const){
      subtitle=await fitText(content.headline,{sizes:[...titleSizes],width:FW-40,maxHeight:150,color:SUB,font:STYLE_FONTS.brushSerif,align:"centre",spacing:10,emphasis});
      lines=await Promise.all(content.points.slice(0,pointCount).map(point=>textLayer(point,{size,color:DIM,width:FW-60,height:110,font:STYLE_FONTS.serif,align:"centre",spacing:6})));
      textH=subtitle.info.height+22+lines.reduce((sum,line)=>sum+line.info.height+14,0);
      const room=floor-y-40-textH-(closingH?closingH+36:0)-(two?24:0);
      if((two?room/2:room)>=320)break;
    }
    const room=floor-y-40-textH-(closingH?closingH+36:0);
    // 한 장 상한 860(폭 880에 거의 정사각): 760이면 짧은 자막(요점 3개 한 줄씩)에서 자막 아래 바닥글까지 200px 가까이 비었다.
    const FH=two?Math.round((room-24)/2):Math.min(860,room);
    for(const [i,shot] of shots.entries()){
      layers.push({input:await framePhoto(shot,FW,FH,i?(leak==="left"?"right":"left"):leak,"light"),left:FX,top:y});
      const dust=await filmDust(FX,y,FW,FH);
      if(dust)layers.push(dust);
      deco+=warmHalo(FX,y,FW,FH)+`<rect x="${FX-6}" y="${y-6}" width="${FW+12}" height="${FH+12}" fill="none" stroke="#000" stroke-width="12"/>`;
      // 옛 카메라 날짜 도장 자리에 장 번호(첫 사진에만).
      if(!i){
        const stamp=await textLayer(frame,{size:40,color:"#FF9A3C",width:300,height:60,font:STYLE_FONTS.pixelBold});
        layers.push({input:await sharp(stamp.data).blur(.6).png().toBuffer(),left:FX+FW-stamp.info.width-30,top:y+FH-stamp.info.height-24});
      }
      y+=FH+24;
    }
    y+=16;
    // 자막: 제목은 흰 명조, 요점은 밝은 회색. 자막답게 가운데 정렬.
    layers.push(centred(subtitle!,y));
    y+=subtitle!.info.height+22;
    for(const line of lines){layers.push(centred(line,y));y+=line.info.height+14;}
    if(content.last){
      const closing=await closingLayers(y+Math.max(22,Math.round((floor-y-closingH)/2)));
      deco+=closing.svg;layers.push(...closing.layers);
    }
  }else{
    // 사진 없는 장: 빈 검은 프레임 안 가운데에 큰 자막. 프레임 한쪽에 주황 빛샘을, 왼쪽 위에 큰 따옴표를 둔다.
    // 마지막 장이면 프레임 아래 캡션 자리에 가게 명함을 둔다(그만큼 프레임을 줄이고, 안 들어가면 요점 글자를 줄인다).
    const below=content.last?closingH+40:80;
    const FH=floor-y-below;
    deco+=`<defs><radialGradient id="filmLeak" cx="${leak==="left"?FX:FX+FW}" cy="${y+FH*.15}" r="${FW*.7}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF7A1A" stop-opacity=".4"/><stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/></radialGradient></defs>`
      +warmHalo(FX,y,FW,FH)+`<rect x="${FX}" y="${y}" width="${FW}" height="${FH}" fill="#1B1917" stroke="#000" stroke-width="12"/><rect x="${FX}" y="${y}" width="${FW}" height="${FH}" fill="url(#filmLeak)"/>`;
    const quoteMark=await textLayer("“",{size:220,color:EDGE_TEXT,width:200,height:260,font:STYLE_FONTS.serifHeavy});
    layers.push({input:quoteMark.data,left:FX+40,top:y+10});
    let quote:Layer,lines:Layer[]=[],blockH=0;
    for(const [size,titleSizes] of [[38,[72,64,56]],[34,[64,56,50]],[32,[56,50,46]]] as const){
      quote=await fitText(content.headline,{sizes:[...titleSizes],width:FW-120,maxHeight:320,color:SUB,font:STYLE_FONTS.brushSerif,align:"centre",spacing:14,emphasis});
      lines=await Promise.all(content.points.slice(0,4).map(point=>textLayer(point,{size,color:DIM,width:FW-140,height:120,font:STYLE_FONTS.serif,align:"centre",spacing:8})));
      blockH=quote.info.height+60+lines.reduce((sum,line)=>sum+line.info.height+26,0);
      // 따옴표(위 180px 남짓)와 겹치지 않도록 프레임 안 위아래 여백을 남긴다.
      if(blockH<=FH-160)break;
    }
    let cy=y+Math.max(150,Math.round((FH-blockH)/2));
    layers.push(centred(quote!,cy));
    cy+=quote!.info.height+30;
    deco+=`<path d="M510 ${cy}H570" stroke="${EDGE_TEXT}" stroke-width="${MIN_STROKE}"/>`;
    cy+=30;
    for(const line of lines){layers.push(centred(line,cy));cy+=line.info.height+26;}
    y+=FH+30;
    if(content.last){
      const closing=await closingLayers(y+6);
      deco+=closing.svg;layers.push(...closing.layers);
    }else{
      const caption=await textLayer(`— ${content.keywords[0]??"홍어"}, 그날의 기록 —`,{size:30,color:DIM,width:FW,height:50,font:STYLE_FONTS.serif,align:"centre"});
      layers.push(centred(caption,y+4));
    }
  }
  deco+=footer.svg;
  layers.push(...footer.layers);
  layers.unshift(svgLayer(deco));
  layers.push(await grainLayer({opacity:.3}));
  return sharp({create:{width:1080,height:1350,channels:3,background:BASE}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
