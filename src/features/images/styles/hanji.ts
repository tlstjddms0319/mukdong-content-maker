import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { MIN_STROKE, STYLE_FONTS, brandSeal, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { access } from "node:fs/promises";
import { cachedLayer, innerShadow, textureFile } from "../decor";
import { seeded, wobblyLine } from "./handDrawn";

// 한지·수묵(전통): 닥나무 섬유 결이 보이는 한지 바탕, 붓글씨 제목 뒤로 번진 먹, 붉은 낙관 도장.
// 사진은 가장자리가 한지에 스며들 듯 흐리게(표지) 또는 먹선 두 줄 테두리(본문). 요점 앞에는 붉은 一·二·三.
// 전라도 잔칫상·삼합 같은 전통 음식 이야기를 고급스럽게 전할 때 쓴다.
const PAPER="#F1E7D3",INK="#1D1A16",SOFT="#2E2822",DIM="#5C5244",SEAL="#B3261E";

// 한지: 가로 섬유 결 + 큰 얼룩 + 가장자리 바램(질감 자산이 없을 때의 폴백 전체).
// withFiber=false면 섬유 결은 빼고 얼룩·바램만 그린다(섬유 결은 미리 구운 한지 질감이 맡는다).
function paperSvg(withFiber:boolean):string {
  return `<defs><filter id="fiber"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .35  0 0 0 0 .24  0 0 0 .28 0"/></filter>`
    +`<filter id="blot"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .22 0"/></filter>`
    +`<radialGradient id="age" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="#7a5a2a" stop-opacity="0"/><stop offset="100%" stop-color="#7a5a2a" stop-opacity=".22"/></radialGradient></defs>`
    +`<rect width="1080" height="1350" fill="${PAPER}"/><rect width="1080" height="1350" filter="url(#blot)"/>${withFiber?`<rect width="1080" height="1350" filter="url(#fiber)"/>`:""}<rect width="1080" height="1350" fill="url(#age)"/>`;
}
// 질감 자산을 불투명하게 미리 섞어 둔다: 색을 흰색 쪽으로 (1-opacity)만큼 당긴 뒤 알파 없이 multiply.
// 공용 textureLayer는 알파를 낮춘 PNG를 multiply로 얹는데, sharp(libvips)의 multiply는 반투명 원본에서
// 기대보다 훨씬 어둡게 나온다(한지 .3이 질감을 100%로 얹은 것보다 어두웠다). 흰색과 섞은 불투명 그림은 정확히 계산된다.
// 파일이 없으면 null(호출하는 쪽이 SVG 섬유 결로 폴백).
async function flatTexture(opacity:number):Promise<Buffer|null> {
  try{await access(textureFile("hanji"));}catch{return null;}
  return sharp(textureFile("hanji")).resize(1080,1350,{fit:"cover"}).removeAlpha().linear(opacity,255*(1-opacity)).png({compressionLevel:1}).toBuffer();
}
// 한지 바탕 한 장(불투명 PNG). 예전에는 카드마다 전면 feTurbulence 두 번(약 1초)을 돌렸다.
// 바탕은 장·내용과 무관하므로 한 번 구워 전역 캐시에 두고, 섬유 결은 한지 질감 자산을 multiply(.3)로 얹는다.
// 질감 파일이 없으면 예전 SVG 섬유 결까지 함께 굽는다(폴백).
function paperLayer():Promise<Buffer> {
  return cachedLayer("hanji:paper:v4",async()=>{
    const texture=await flatTexture(.3);
    // 압축 수준을 낮춰 두면 카드마다 이 PNG를 다시 풀 때 빠르다(크기보다 속도).
    if(!texture)return sharp(Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">${paperSvg(true)}</svg>`)).png({compressionLevel:1}).toBuffer();
    // 섬유 결을 질감이 맡으면 남는 건 저주파 얼룩·바램뿐이라 1/4 크기로 그려 키워도 똑같다(첫 카드의 굽는 시간 단축).
    // 작은 PNG로 먼저 굳힌다: SVG 입력에 바로 resize를 걸면 sharp가 목표 크기로 다시 그린다.
    const small=await sharp(Buffer.from(`<svg width="270" height="338" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">${paperSvg(false)}</svg>`)).png().toBuffer();
    return sharp(small).resize(1080,1350,{fit:"fill"}).composite([{input:texture,blend:"multiply"}]).png({compressionLevel:1}).toBuffer();
  });
}
// 붓 한 획: (x1,y1)에서 (x2,y2)로, 굵기 w. 시작은 붓을 눌러 둥글게 부풀고, 가운데는 조금 가늘어졌다가,
// 끝에서 다시 눌러 멈춘(돈필) 모양. 같은 seed면 같은 획(rand).
function brushSeg(x1:number,y1:number,x2:number,y2:number,w:number,rand:()=>number):string {
  const len=Math.hypot(x2-x1,y2-y1)||1,dx=(x2-x1)/len,dy=(y2-y1)/len,nx=-dy,ny=dx;
  const j=(amount:number)=>(rand()-.5)*2*amount;
  const p=(x:number,y:number,along:number,side:number)=>`${r1(x+dx*along+nx*side)} ${r1(y+dy*along+ny*side)}`;
  const mx=(x1+x2)/2,my=(y1+y2)/2,hw=w/2;
  return `M${p(x1,y1,0,-hw*1.05)}Q${p(mx,my,0,-hw*(.78+j(.06)))} ${p(x2,y2,0,-hw*.95)}`
    +`C${p(x2,y2,w*.7,-hw*.9)} ${p(x2,y2,w*.7,hw*1.1)} ${p(x2,y2,0,hw*1.05)}`
    +`Q${p(mx,my,0,hw*(.8+j(.06)))} ${p(x1,y1,0,hw*.95)}`
    +`C${p(x1,y1,-w*.55,hw)} ${p(x1,y1,-w*.55,-hw*1.1)} ${p(x1,y1,0,-hw*1.05)}Z`;
}
const r1=(value:number)=>Math.round(value*10)/10;
// 요점 번호 一·二·三·四를 붓획으로 직접 그린다. 붓글씨 글꼴에 한자가 없어 예전에는 중국 고딕으로 대체되어
// 가는 고딕 획이 붓 제목 옆에서 어색했다. (cx,cy) 가운데, s 크기 상자 안에 그린다.
function numeral(n:number,cx:number,cy:number,s:number,seed:number):string {
  const rand=seeded(seed),w=s*.15,x0=cx-s/2,y0=cy-s/2;
  const bar=(fy:number,from:number,to:number,tilt=-.04)=>brushSeg(x0+s*from,y0+s*fy,x0+s*to,y0+s*(fy+tilt),w,rand);
  const strokes=n===1?[bar(.5,.06,.94)]
    :n===2?[bar(.3,.2,.8),bar(.76,.04,.96)]
    :n===3?[bar(.16,.16,.84),bar(.48,.26,.74,-.03),bar(.84,.04,.96)]
    // 四: 왼 세로 → 위·오른쪽(꺾임) → 안쪽 두 획 → 아래 가로.
    :[brushSeg(x0+s*.1,y0+s*.14,x0+s*.12,y0+s*.86,w*.9,rand),brushSeg(x0+s*.12,y0+s*.14,x0+s*.88,y0+s*.13,w*.9,rand),brushSeg(x0+s*.88,y0+s*.14,x0+s*.87,y0+s*.86,w*.9,rand),
      brushSeg(x0+s*.38,y0+s*.2,x0+s*.32,y0+s*.6,w*.7,rand),brushSeg(x0+s*.6,y0+s*.2,x0+s*.62,y0+s*.56,w*.7,rand),brushSeg(x0+s*.12,y0+s*.84,x0+s*.88,y0+s*.84,w*.9,rand)];
  return `<path d="${strokes.join("")}" fill="${SEAL}"/>`;
}
// 제목 뒤 먹 번짐: 예전의 균일한 회색 띠 대신, 제목 덩어리 아래 1/3에 붓으로 세 번 쓸어 낸 획.
// 진한 첫 획(.28) 위아래로 옅은 두 획(.16·.08)이 조금씩 어긋나 겹친다.
// 한 획은 가는 붓털 줄 여러 개를 합쳐 그린다: 줄마다 시작·끝·굵기가 조금씩 달라 가장자리가 들쭉날쭉하고,
// 끝 쪽에서는 몇 줄이 끊겨 줄 사이로 종이가 비친다(비백). 털은 한 경로로 칠해 겹친 자리가 더 진해지지 않는다.
// 흐림 필터는 일부러 쓰지 않는다: 획 하나에 100ms 가까이 들었고, 뾰족한 털 끝이 이미 가장자리를 부드럽게 만든다.
function inkStrokes(x:number,y:number,w:number,h:number,seed:number):string {
  const rand=seeded(seed),band=Math.max(34,Math.min(96,h/3)),cy=y+h-band*.6;
  const strokes=[[.28,.02,.92,0,1],[.16,.1,1,band*.46,.66],[.08,-.05,.84,-band*.52,.56]] as const;
  let out="";
  // 붓털 한 가닥: 시작은 둥글고 끝은 뾰족하게 빠지는 가는 줄(마른 붓 끝의 갈라진 털).
  const hair=(xa:number,ya:number,xb:number,yb:number,hw:number)=>{const mx=(xa+xb)/2,my=(ya+yb)/2;
    return `M${r1(xa)} ${r1(ya-hw)}Q${r1(mx)} ${r1(my-hw*.8)} ${r1(xb)} ${r1(yb)}Q${r1(mx)} ${r1(my+hw*.8)} ${r1(xa)} ${r1(ya+hw)}A${r1(hw)} ${r1(hw)} 0 0 1 ${r1(xa)} ${r1(ya-hw)}Z`;};
  for(const [opacity,from,to,dy,thick] of strokes){
    const sy=cy+dy+(rand()-.5)*band*.16,tilt=(rand()-.5)*band*.22,T=band*thick;
    const x1=x+w*from,x2=x+w*to,len=x2-x1,yAt=(px:number)=>sy+tilt*((px-x1)/len);
    // 몸통: 붓을 눌러 시작한 둥근 머리 + 고른 먹. 끝 18%는 비워 두고 털이 맡는다.
    let paths=brushSeg(x1,yAt(x1),x2-len*.18,yAt(x2-len*.18),T*.74,rand);
    // 털: 몸통 위아래 가장자리를 들쭉날쭉하게 넘고, 끝에서 길이가 제각각인 뾰족한 꼬리로 빠진다(마른 붓·비백).
    const hairs=Math.max(10,Math.round(T/4));
    for(let i=0;i<hairs;i++){
      const t=(i+.5)/hairs-.5,edge=Math.abs(t)*2;
      const off=t*T+(rand()-.5)*T*.05,bow=(rand()-.5)*T*.1;
      const start=x1+len*(.02+rand()*.08+edge*edge*.1),end=x2-len*(rand()*.1+edge**2*.2);
      const ya=(px:number)=>yAt(px)+off+bow*Math.sin(Math.PI*(px-x1)/len);
      const hw=Math.max(1.2,T/hairs*(.55+rand()*.5));
      // 가장자리 털 일부는 중간에서 한 번 끊긴다(줄 사이로 종이가 비친다).
      if(edge>.5&&rand()<.55){
        const cut=start+(end-start)*(.45+rand()*.35),gap=len*(.015+rand()*.03);
        paths+=hair(start,ya(start),cut,ya(cut),hw)+hair(cut+gap,ya(cut+gap),end,ya(end),hw*.85);
      }else paths+=hair(start,ya(start),end,ya(end),hw);
    }
    out+=`<path d="${paths}" fill="#2A241D" fill-opacity="${opacity}"/>`;
  }
  return out;
}
// 흐린 그림자 SVG 조각을 1/4 해상도로 그려 제자리 크기로 키운 레이어. 큰 흐림 필터는 librsvg에서 400ms 가까이 들지만
// 흐린 그림은 저해상도로 그려 키워도 똑같이 부드럽다(1/16 픽셀). clip을 주면 키운 뒤 원래 해상도로 창 모양을 또렷하게 자른다.
// SVG를 먼저 작은 PNG로 굳힌 뒤 키운다: SVG 입력에 바로 resize를 걸면 sharp가 SVG를 목표 크기로 다시 그려 이득이 사라진다.
async function lowResLayer(body:string,x:number,y:number,w:number,h:number,clip?:string):Promise<OverlayOptions> {
  const X=Math.floor(x),Y=Math.floor(y),Wd=Math.ceil(w),Hd=Math.ceil(h);
  const small=await sharp(Buffer.from(`<svg width="${Math.ceil(Wd/4)}" height="${Math.ceil(Hd/4)}" viewBox="${X} ${Y} ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`)).png({compressionLevel:1}).toBuffer();
  let image=sharp(small).resize(Wd,Hd,{fit:"fill"});
  if(clip)image=image.composite([{input:Buffer.from(`<svg width="${Wd}" height="${Hd}" viewBox="${X} ${Y} ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg"><path d="${clip}" fill="#fff"/></svg>`),blend:"dest-in"}]);
  return {input:await image.png({compressionLevel:1}).toBuffer(),left:X,top:Y};
}
// 창 안쪽 그림자(공용 innerShadow)를 저해상도로: 공용 조각의 clip-path는 떼고, 자르기는 lowResLayer가 원래 해상도로 한다.
const fastInnerShadow=(x:number,y:number,w:number,h:number,blur:number,opacity:number,path?:string)=>{
  const shape=path??`M${x} ${y}H${x+w}V${y+h}H${x}Z`;
  return lowResLayer(innerShadow({x,y,width:w,height:h,path:shape,blur,opacity}).replace(/ clip-path="url\(#[^)]*\)"/,""),x,y,w,h,shape);
};
// 가장자리가 한지에 스며드는 사진(흐린 사각 마스크를 알파로).
async function inkPhoto(input:Buffer,width:number,height:number):Promise<Buffer> {
  const W=Math.round(width),H=Math.round(height);
  // 종이 톤에 맞추되 홍어 분홍 살이 회색이 되지 않게: 채도 .86→.96, 파랑만 조금 눌러 크림빛(linear)을 남긴다.
  const feather=Math.round(Math.min(W,H)*.07);
  // 흐린 가장자리 마스크는 크기만 같으면 똑같으므로 전역 캐시에 둔다. 보정·마스크 합치기는 중간 PNG 없이 한 번에(인코딩 시간 절약).
  const [finished,mask]=await Promise.all([finishPhoto(input,W,H),cachedLayer(`hanji:feather:${W}x${H}`,()=>sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><rect x="${feather}" y="${feather}" width="${W-feather*2}" height="${H-feather*2}" rx="${feather}" fill="#fff"/></svg>`)).blur(feather*.8).extractChannel(0).png().toBuffer())]);
  const base=await sharp(finished).modulate({saturation:.96}).linear([1.02,.99,.93],[4,2,-2]).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const inked=await sharp(base.data,{raw:base.info}).joinChannel(mask).png({compressionLevel:2}).toBuffer();
  // 보정·흐린 가장자리를 입힌 새 버퍼는 자동 등록되지 않으므로 직접 등록한다(검수의 사진 면적 측정).
  registerPhoto(inked);
  return inked;
}

export const renderHanji:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const layers:OverlayOptions[]=[];
  let deco="",over="";
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
    const no=await textLayer(`${index}`,{size:26,color:DIM,width:300,height:40,font:STYLE_FONTS.serif,features:"tnum"});
    layers.push({input:no.data,left:M,top:60});
  }
  // 제목: 붓글씨. 뒤에 번진 먹. 핵심어는 낙관과 같은 붉은색(종이 위 5:1 이상).
  const title=await fitText(content.headline,{sizes:content.cover?[124,108,96,84]:shots.length?[84,76,68,60]:tight?[88,78,70]:[100,88,78,70],width:content.cover?W-40:W-130,maxHeight:content.cover?380:shots.length?230:tight?260:330,color:INK,font:STYLE_FONTS.brush,align:content.cover?"centre":"left",spacing:4,emphasis:emphasisOf(content,SEAL)});
  const titleX=content.cover?Math.round((1080-title.info.width)/2):M;
  if(!shots.length&&!content.cover&&!tight)y=Math.max(y,Math.round(1350/2-title.info.height-120));
  deco+=inkStrokes(titleX-10,y,title.info.width+20,title.info.height,index*7+3);
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
    return {layers:await Promise.all(list.map(point=>textLayer(point,{size:pointSize,color:SOFT,width:W-70,height:150,font:STYLE_FONTS.serif,spacing:pointSize>40?10:8})))};
  };
  const heightOf=(list:{info:{height:number}}[])=>list.reduce((sum,layer)=>sum+Math.max(layer.info.height,48)+26,0);
  let count=shots.length?3:4;
  let {layers:pointLayers}=await makePoints(count);
  // 사진 장에서 사진에 남는 높이, 글자 장에서 요점이 들어갈 높이.
  const minPH=tight?220:300;
  const roomFor=()=>shots.length?contentBottom-y-(pointLayers.length?heightOf(pointLayers)+30:0)-20:contentBottom-y-20-heightOf(pointLayers);
  if(tight&&roomFor()<(shots.length?minPH:0)){pointSize=shots.length?36:40;({layers:pointLayers}=await makePoints(count));}
  while(tight&&roomFor()<(shots.length?minPH:0)&&count>1){count--;({layers:pointLayers}=await makePoints(count));}
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
        // 먹선 액자 안쪽으로 얕은 그림자: 사진이 틀 안으로 한 겹 들어가 보이게(사진 위에만 얹혀 글자와 겹치지 않는다).
        layers.push(await fastInnerShadow(M+12,y+12,PW-24,PH-24,9,.4));
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
  for(const [i,layer] of pointLayers.entries()){
    // 번호는 요점 첫 줄 가운데 높이에 붓획으로(글자 레이어가 아니므로 검수 글자로 세지 않는다).
    deco+=numeral(i+1,M+28,py+Math.round(pointSize*.7),pointSize>40?40:36,index*17+i);
    layers.push({input:layer.data,left:M+70,top:py});
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
  layers.unshift({input:await paperLayer(),left:0,top:0},svgLayer(deco));
  if(over)layers.push(svgLayer(over));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
