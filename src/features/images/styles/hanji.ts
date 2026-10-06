import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { MIN_STROKE, STYLE_FONTS, brandSeal, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { seeded, wobblyLine } from "./handDrawn";

// 한지·수묵(전통): 닥나무 섬유 결이 보이는 한지 바탕, 붓글씨 제목 뒤로 번진 먹, 붉은 낙관 도장.
// 사진은 가장자리가 한지에 스며들 듯 흐리게(표지) 또는 먹선 두 줄 테두리(본문). 요점 앞에는 붉은 一·二·三.
// 전라도 잔칫상·삼합 같은 전통 음식 이야기를 고급스럽게 전할 때 쓴다.
const PAPER="#F1E7D3",INK="#1D1A16",SOFT="#2E2822",DIM="#5C5244",SEAL="#B3261E";
const NUMERALS=["一","二","三","四"];

// 한지: 가로 섬유 결 + 큰 얼룩 + 가장자리 바램.
function paper():string {
  return `<defs><filter id="fiber"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .35  0 0 0 0 .24  0 0 0 .28 0"/></filter>`
    +`<filter id="blot"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .22 0"/></filter>`
    +`<radialGradient id="age" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="#7a5a2a" stop-opacity="0"/><stop offset="100%" stop-color="#7a5a2a" stop-opacity=".22"/></radialGradient></defs>`
    +`<rect width="1080" height="1350" filter="url(#blot)"/><rect width="1080" height="1350" filter="url(#fiber)"/><rect width="1080" height="1350" fill="url(#age)"/>`;
}
// 붓으로 크게 쓸어 번진 먹(제목 뒤 배경).
function inkWash(x:number,y:number,w:number,h:number,seed:number,opacity=.16):string {
  const rand=seeded(seed);
  const id=`wash${seed}`;
  return `<filter id="${id}" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="40"/><feGaussianBlur stdDeviation="10"/></filter>`
    +`<path d="${wobblyLine(x,y+h/2,x+w,y+h/2+((rand()-.5)*30),rand,h*.12,6)}" stroke="#2A241D" stroke-width="${h}" stroke-linecap="round" fill="none" opacity="${opacity}" filter="url(#${id})"/>`;
}
// 가장자리가 한지에 스며드는 사진(흐린 사각 마스크를 알파로).
async function inkPhoto(input:Buffer,width:number,height:number):Promise<Buffer> {
  const W=Math.round(width),H=Math.round(height);
  // 종이 톤에 맞추되 홍어 분홍 살이 회색이 되지 않게: 채도 .86→.96, 파랑만 조금 눌러 크림빛(linear)을 남긴다.
  const base=await sharp(await finishPhoto(input,W,H)).modulate({saturation:.96}).linear([1.02,.99,.93],[4,2,-2]).removeAlpha().png().toBuffer();
  const feather=Math.round(Math.min(W,H)*.07);
  const mask=await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><rect x="${feather}" y="${feather}" width="${W-feather*2}" height="${H-feather*2}" rx="${feather}" fill="#fff"/></svg>`)).blur(feather*.8).extractChannel(0).toBuffer();
  const inked=await sharp(base).joinChannel(mask).png().toBuffer();
  // 보정·흐린 가장자리를 입힌 새 버퍼는 자동 등록되지 않으므로 직접 등록한다(검수의 사진 면적 측정).
  registerPhoto(inked);
  return inked;
}

export const renderHanji:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const layers:OverlayOptions[]=[];
  let deco=paper(),over="";
  const M=96,W=1080-M*2,footerTop=1350-84;
  const shots=inputs.slice(0,2);
  // 마지막 장 명함: 바닥 선 위에 두고 그 높이만큼 사진·요점 자리를 미리 뺀다(contentBottom).
  const closing=content.last?await closingBlock({width:W,color:INK,accent:SEAL}):null;
  const CLOSING_GAP=48;
  const contentBottom=footerTop-(closing?closing.height+CLOSING_GAP:0);
  const tight=!!closing;
  let y=content.cover?120:100;
  // 표지: 왼쪽에 세로로 쓴 가게 이름. 본문: 위에 "第 二 張" 대신 작은 장 번호.
  if(content.cover||!shots.length){
    // 표지와 글자 장은 왼쪽 가장자리에 세로로 쓴 가게 이름으로 옆을 채운다.
    // 긴 제목의 먹 번짐이 왼쪽 가장자리까지 닿아도 읽히도록 옅은 색 대신 본문 글자색을 쓴다.
    const vertical=await textLayer([..."묵동홍어마을"].join("\n"),{size:30,color:SOFT,width:44,height:400,font:STYLE_FONTS.serif,align:"centre",spacing:6});
    layers.push({input:vertical.data,left:44,top:130});
  }
  if(!content.cover){
    const no=await textLayer(`${index} / ${total}`,{size:26,color:DIM,width:300,height:40,font:STYLE_FONTS.serif,features:"tnum"});
    layers.push({input:no.data,left:M,top:60});
  }
  // 제목: 붓글씨. 뒤에 번진 먹. 핵심어는 낙관과 같은 붉은색(종이 위 5:1 이상).
  const title=await fitText(content.headline,{sizes:content.cover?[124,108,96,84]:shots.length?[84,76,68,60]:tight?[88,78,70]:[100,88,78,70],width:content.cover?W-40:W-130,maxHeight:content.cover?380:shots.length?230:tight?260:330,color:INK,font:STYLE_FONTS.brush,align:content.cover?"centre":"left",spacing:4,emphasis:emphasisOf(content,SEAL)});
  const titleX=content.cover?Math.round((1080-title.info.width)/2):M;
  if(!shots.length&&!content.cover&&!tight)y=Math.max(y,Math.round(1350/2-title.info.height-120));
  deco+=inkWash(titleX-30,y-10,title.info.width+60,title.info.height+20,index*7+3);
  layers.push({input:title.data,left:titleX,top:y});
  y+=title.info.height+30;
  // 낙관: 본문은 제목 줄 끝. 표지는 사진 오른쪽 위 모서리에 걸쳐 찍는다(그림에 낙관을 찍듯).
  // 모든 계열이 같은 가게 낙관(brandSeal "묵동/홍어")을 쓴다. 크기·자리는 예전 한지 낙관 그대로.
  const stampSize=content.cover?128:96;
  const stamp=await brandSeal(stampSize,index*13+5,{on:"light"});
  const stampLayers=(x:number,y:number):OverlayOptions[]=>[svgLayer(stamp.svg(x,y)),{input:stamp.text.data,left:x+Math.round((stampSize-stamp.text.info.width)/2),top:y+Math.round((stampSize-stamp.text.info.height)/2)}];
  let coverStamp:OverlayOptions[]=[];
  // 표지 예고 띠: 바닥 선 바로 위 가운데, 양옆 작은 붉은 점(낙관 인주). 자리는 사진 높이 계산에서 미리 뺀다.
  const teaser=content.teaser?await textLayer(content.teaser,{size:28,color:SOFT,width:W-80,height:48,font:STYLE_FONTS.serif,align:"centre"}):null;
  const teaserH=teaser?teaser.info.height+30:0;
  if(content.cover){
    // 표지 부제: 붓 제목 아래 작은 명조 한 줄. 사진이 너무 작아지면(460 미만) 뺀다.
    const sub=content.subline?await textLayer(content.subline,{size:34,color:SOFT,width:W-40,height:56,font:STYLE_FONTS.serif,align:"centre"}):null;
    if(sub&&footerTop-teaserH-(y-10+sub.info.height+24)-20>=460){
      layers.push({input:sub.data,left:Math.round((1080-sub.info.width)/2),top:y-10});
      y+=sub.info.height+14;
    }
    y+=10;
  }else{
    layers.push(...stampLayers(1080-M-96,58));
    deco+=`<path d="${wobblyLine(M,y,M+220,y+2,seeded(index),2,5)}" stroke="${SEAL}" stroke-width="3" fill="none" opacity=".8"/>`;y+=34;
  }
  // 요점: 마지막 장은 명함 자리 때문에 좁으므로 요점 수를 줄이기 전에 글자를 먼저 줄인다(사진 장 40→36, 글자 장 46→40).
  let pointSize=shots.length?40:46;
  const makePoints=async(count:number)=>{
    const list=content.points.slice(0,count);
    return {layers:await Promise.all(list.map(point=>textLayer(point,{size:pointSize,color:SOFT,width:W-70,height:150,font:STYLE_FONTS.serif,spacing:pointSize>40?10:8}))),
      numerals:await Promise.all(list.map((_,i)=>textLayer(NUMERALS[i],{size:pointSize>40?44:40,color:SEAL,width:60,height:60,font:STYLE_FONTS.brush})))};
  };
  const heightOf=(list:{info:{height:number}}[])=>list.reduce((sum,layer)=>sum+Math.max(layer.info.height,48)+26,0);
  let count=shots.length?3:4;
  let {layers:pointLayers,numerals}=await makePoints(count);
  // 사진 장에서 사진에 남는 높이, 글자 장에서 요점이 들어갈 높이.
  const minPH=tight?220:300;
  const roomFor=()=>shots.length?contentBottom-y-(pointLayers.length?heightOf(pointLayers)+30:0)-20:contentBottom-y-20-heightOf(pointLayers);
  if(tight&&roomFor()<(shots.length?minPH:0)){pointSize=shots.length?36:40;({layers:pointLayers,numerals}=await makePoints(count));}
  while(tight&&roomFor()<(shots.length?minPH:0)&&count>1){count--;({layers:pointLayers,numerals}=await makePoints(count));}
  const pointsH=heightOf(pointLayers);
  if(shots.length){
    const room=roomFor()-(content.cover?teaserH:0);
    // 사진 높이는 남는 높이에서 정한다(표지 상한 820: 예전 680 상한은 아래에 빈 띠를 남겼다).
    const PH=Math.round(Math.max(minPH,Math.min(content.cover?820:740,room)));
    if(content.cover||shots.length===1){
      const PW=W;
      if(content.cover){
        layers.push({input:await inkPhoto(shots[0],PW,PH),left:M,top:y});
        // 낙관은 흐린 가장자리 안쪽, 사진 오른쪽 위에 조금 기울여(-3도) 얹는다.
        coverStamp=stampLayers(1080-M-stampSize-18,y+22);
      }else{
        const framed=await sharp(await finishPhoto(shots[0],PW-24,PH-24)).modulate({saturation:.96}).png().toBuffer();
        registerPhoto(framed);
        layers.push({input:framed,left:M+12,top:y+12});
        // 먹선 두 줄 테두리: 바깥 굵은 선 + 안쪽 가는 선(폰에서 사라지지 않게 MIN_STROKE).
        deco+=`<rect x="${M}" y="${y}" width="${PW}" height="${PH}" fill="none" stroke="${INK}" stroke-width="3"/><rect x="${M+6}" y="${y+6}" width="${PW-12}" height="${PH-12}" fill="none" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
      }
    }else{
      const PW=Math.round((W-30)/2);
      for(const [i,shot] of shots.entries())layers.push({input:await inkPhoto(shot,PW,PH),left:M+i*(PW+30),top:y});
    }
    layers.push(...coverStamp);
    y+=PH+36;
  }
  // 사진 장은 사진 바로 아래에, 글자 장은 남은 칸 가운데보다 조금 위에(명함 칸 위로 넘지 않게).
  let py=shots.length?y:Math.min(contentBottom-20-pointsH,Math.max(y+40,Math.round((y+contentBottom-pointsH)/2)-40));
  // 글자 장: 요점 뒤에 옅은 묵선 붓자국을 넓게 깔아 수묵 느낌을 더한다(글자보다 아래 레이어, 아주 옅게).
  if(!shots.length&&pointLayers.length)deco+=inkWash(M-30,py-10,W+60,pointsH+20,index*11+7,.07);
  for(const [i,layer] of pointLayers.entries()){
    layers.push({input:numerals[i].data,left:M,top:py-6},{input:layer.data,left:M+70,top:py});
    py+=Math.max(layer.info.height,48)+26;
  }
  if(teaser){
    const ty=footerTop-12-teaser.info.height,tx=Math.round((1080-teaser.info.width)/2),tcy=ty+teaser.info.height/2;
    layers.push({input:teaser.data,left:tx,top:ty});
    deco+=`<rect x="${tx-30}" y="${tcy-6}" width="12" height="12" fill="${SEAL}" transform="rotate(8 ${tx-24} ${tcy})"/><rect x="${tx+teaser.info.width+18}" y="${tcy-6}" width="12" height="12" fill="${SEAL}" transform="rotate(-6 ${tx+teaser.info.width+24} ${tcy})"/>`;
  }
  // 마지막 장 명함: 붉은 붓 한 획 아래 가게 이름·계정·붉은 칩.
  if(closing){
    let cy=footerTop-16-closing.height;
    deco+=`<path d="${wobblyLine(540-110,cy-CLOSING_GAP/2+4,540+110,cy-CLOSING_GAP/2+6,seeded(index+40),2,5)}" stroke="${SEAL}" stroke-width="3" fill="none" opacity=".8"/>`;
    layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
    cy+=18+12;
    const chipX=Math.round(540-closing.chip.info.width/2);
    deco+=closing.chipSvg(chipX,cy);
    layers.push({input:closing.chip.data,left:chipX,top:cy});
  }
  // 바닥: 옅은 먹선 위에 가게 이름. 표지·마지막 장이 아니면 먹선 오른쪽 끝을 끊고 "넘겨 보기 ›"를 넣는다.
  const cue=!content.cover&&!content.last?await nextCue(DIM,26):null;
  const lineY=footerTop+6,lineEnd=cue?1080-M-cue.width-18:1080-M;
  deco+=`<path d="M${M} ${lineY}H${lineEnd}" stroke="${DIM}" stroke-width="${MIN_STROKE}" opacity=".6"/>`;
  if(cue){
    const cx=1080-M-cue.width,cy=Math.round(lineY-cue.height/2);
    layers.push({input:cue.label.data,left:cx,top:cy});
    over+=cue.arrow(cx,cy);
  }
  const footer=await fitText(brandName(),{sizes:[28,26],width:W,maxHeight:44,color:DIM,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:footer.data,left:Math.round((1080-footer.info.width)/2),top:footerTop+24});
  layers.unshift(svgLayer(deco));
  if(over)layers.push(svgLayer(over));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
