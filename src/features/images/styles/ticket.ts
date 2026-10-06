import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { brandName, croppedPhoto, svgLayer, textLayer, type CardRenderer, type Font, type Layer } from "../render/primitives";
import { STYLE_FONTS, balanceWidth, contentOf, fitText, rotated, snap } from "./shared";
import { seeded } from "./handDrawn";

// 티켓·승차권: 짙은 바탕 한가운데 세로로 긴 입장권 종이 한 장. 아래쪽 절취선(점선과 양옆 반원 홈)으로 본체와 스텁이 나뉜다.
// 본체에는 "ADMIT ONE"·번호·제목·사진 창·요점, 스텁에는 가게 이름·장 번호·바코드. 옛날 극장표·기차표 느낌이라
// 방문 안내·오시는 길·모임 초대처럼 "오세요" 하는 글에 어울린다.
// 장식 글자는 ADMIT ONE·No.·장 번호·가게 이름·키워드뿐이다. 날짜·좌석·가격·시간처럼 사실을 단정하는 글자는 쓰지 않는다.

const TONES=["#1F3A3D","#2B2F4A","#3A2A2A"] as const;      // 바탕색(청록·남색·적갈). 장마다 돌려 쓴다.
const PAPER="#F7EFD9",STUB="#EFE4C8",EDGE="#2B2A26",INK="#1E1C18",TEXT="#2A2824",RED="#C8321E",BAND="#141311",STAMP_INK="#FFF4EC";
// 티켓 종이 자리: 캔버스 가운데 940×1262. 아래 250px이 스텁(절취선 아래), 그 위가 본체.
// 스텁을 더 키우면 본체에서 사진·요점 자리가 모자라므로(긴 요점 4개 × 2줄) 전체의 1/5쯤으로 둔다.
const TX=70,TY=44,TW=940,TH=1262,TR=24,STUB_H=250,PERF=TY+TH-STUB_H;
// 본체 안쪽 글자 칸: 좌우 48px 들여 844px. 위는 40px, 아래는 절취선에서 40px 띄운다.
const PAD=48,CX=TX+PAD,CW=TW-PAD*2,CR=TX+TW-PAD,BODY_TOP=TY+40,BODY_BOTTOM=PERF-40;
const HEADER_H=56;                                          // ADMIT ONE · No. 줄 높이
const STAMP_R=60;                                           // 빨간 도장 반지름

const roundedRect=(x:number,y:number,w:number,h:number,r:number)=>`M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;
// 위 모서리만 둥근 사각형(표지 사진 위 검은 띠: 사진의 둥근 위 모서리를 따라간다).
const topRoundedRect=(x:number,y:number,w:number,h:number,r:number)=>`M${x} ${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h}H${x}Z`;
// 원 경로(절취선 양옆 홈을 클립에서 빼기 위한 부분 경로).
const circlePath=(cx:number,cy:number,r:number)=>`M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0Z`;

// 바탕: 단색 + 옅은 점 무늬 + 가장자리를 어둡게. 티켓 종이의 물결 무늬·그림자 필터도 여기서 정의한다.
function backdrop(tone:string):string {
  return `<defs><pattern id="tkDots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="2.2" fill="#fff" fill-opacity=".09"/></pattern>`
    +`<pattern id="tkWave" width="72" height="9" patternUnits="userSpaceOnUse"><path d="M0 4.5Q18 0 36 4.5T72 4.5" fill="none" stroke="${EDGE}" stroke-opacity=".08" stroke-width="1"/></pattern>`
    +`<radialGradient id="tkVig" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient>`
    +`<filter id="tkShadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="12"/></filter>`
    // 종이 모양 클립: 둥근 사각형에서 절취선 양옆 반원을 뺀다(evenodd). 종이 채우기·무늬·테두리를 모두 이 클립 안에 그려
    // 홈 자리에 바탕(점 무늬·어두운 가장자리)이 그대로 비치게 한다. 홈을 바탕색 원으로 덮으면 가장자리 음영과 어긋나 티가 난다.
    +`<clipPath id="tkClip"><path d="${roundedRect(TX,TY,TW,TH,TR)}${circlePath(TX,PERF,22)}${circlePath(TX+TW,PERF,22)}" clip-rule="evenodd"/></clipPath></defs>`
    +`<rect width="1080" height="1350" fill="${tone}"/><rect width="1080" height="1350" fill="url(#tkDots)"/><rect width="1080" height="1350" fill="url(#tkVig)"/>`;
}
// 티켓 종이: 그림자, 본체 종이, 조금 어두운 스텁 종이, 가는 물결 무늬(guilloche), 테두리 두 겹, 절취선.
function paper():string {
  const outline=roundedRect(TX,TY,TW,TH,TR);
  let s=`<path d="${outline}" transform="translate(0 18)" fill="#000" fill-opacity=".55" filter="url(#tkShadow)"/>`;
  s+=`<g clip-path="url(#tkClip)">`;
  s+=`<rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" fill="${PAPER}"/><rect x="${TX}" y="${PERF}" width="${TW}" height="${STUB_H}" fill="${STUB}"/>`;
  s+=`<rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" fill="url(#tkWave)"/>`;
  // 바깥 테두리는 클립에 반이 잘리므로 4px로 그려 2px만 보이게 한다. 홈 둘레도 같은 굵기로 이어진다.
  s+=`<path d="${outline}" fill="none" stroke="${EDGE}" stroke-width="4"/>`;
  for(const cx of [TX,TX+TW])s+=`<circle cx="${cx}" cy="${PERF}" r="22" fill="none" stroke="${EDGE}" stroke-width="4"/>`;
  s+=`<path d="${roundedRect(TX+9,TY+9,TW-18,TH-18,TR-8)}" fill="none" stroke="${EDGE}" stroke-opacity=".35" stroke-width="1"/>`;
  // 절취선: 홈 사이를 잇는 점선.
  s+=`<path d="M${TX+30} ${PERF}H${TX+TW-30}" stroke="${EDGE}" stroke-opacity=".6" stroke-width="2" stroke-dasharray="12 10"/>`;
  return s+`</g>`;
}
// 제목 아래 굵은 줄 + 가는 줄(극장표의 구획선). 높이 14.
const rules=(x:number,y:number,w:number)=>`<rect x="${x}" y="${y}" width="${w}" height="6" fill="${INK}"/><rect x="${x}" y="${y+12}" width="${w}" height="2" fill="${INK}"/>`;
// 사진 창: 뒤에 옅은 그림자, 흰 종이 띠(8px)와 가는 검은 테두리. 사진은 안쪽에 8px 들여 얹는다.
const photoWindow=(x:number,y:number,w:number,h:number)=>`<rect x="${x+6}" y="${y+8}" width="${w}" height="${h}" rx="12" fill="${INK}" fill-opacity=".16"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#FFFFFF" stroke="${EDGE}" stroke-width="2"/>`;
// 요점 글머리(▸ 모양의 빨간 삼각형). 글꼴에 없는 기호가 다른 글꼴로 바뀌어 보이지 않도록 직접 그린다.
const bullet=(x:number,cy:number)=>`<path d="M${x} ${cy-11}L${x+18} ${cy}L${x} ${cy+11}Z" fill="${RED}"/>`;
// 점선 리더(메뉴판·좌석표의 "……"). 둥근 점을 10px 간격으로 찍는다.
const leader=(x1:number,x2:number,y:number)=>x2-x1>30?`<path d="M${x1} ${y}H${x2}" stroke="${TEXT}" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 10"/>`:"";

// 바코드: 굵기가 다른 검은 세로줄 40~50개. seed가 같으면 같은 모양. 양 끝 줄은 조금 길게(진짜 바코드의 가드 바).
function barcode(x:number,y:number,w:number,h:number,rand:()=>number):string {
  const widths=[2,3,4,6,8];
  let s="",cx=x;
  const bars:number[][]=[];
  while(cx<x+w-8){const bw=widths[Math.floor(rand()*widths.length)];bars.push([cx,bw]);cx+=bw+2+Math.floor(rand()*4);}
  for(const [i,[bx,bw]] of bars.entries()){const guard=i<2||i>=bars.length-2;s+=`<rect x="${bx}" y="${y}" width="${bw}" height="${guard?h+10:h}" fill="${INK}"/>`;}
  return s;
}
// 빨간 원형 도장: 붉은 원 + 안쪽 흰 이중 링, -12도 기울임, 살짝 거친 가장자리(잉크가 고르게 안 묻은 느낌).
// 안의 "묵동" 글자는 따로 글자 레이어로 그려 같은 각도로 돌려 얹는다.
function stampSvg(cx:number,cy:number,r:number,seed:number):string {
  const id=`tkStamp${seed}`;
  return `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>`
    +`<g transform="rotate(-12 ${cx} ${cy})" filter="url(#${id})" opacity=".93"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${RED}"/><circle cx="${cx}" cy="${cy}" r="${r-7}" fill="none" stroke="${STAMP_INK}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r-14}" fill="none" stroke="${STAMP_INK}" stroke-width="1.5"/></g>`;
}
async function stampText(cx:number,cy:number,r:number):Promise<OverlayOptions> {
  const text=await textLayer("묵동",{size:Math.round(r*.6),color:STAMP_INK,width:r*2,height:r*2,font:STYLE_FONTS.heavy,align:"centre",spacing:0});
  const tilted=await rotated(text.data,-12);
  return {input:tilted.data,left:cx-tilted.info.width/2,top:cy-tilted.info.height/2};
}
// 제목 크기 고르기: 들어가는 가장 큰 크기를 쓰되, 한 단계 작은 크기로 줄이면 줄 수가 하나 줄 때("드세요"만 다음 줄로
// 떨어지는 경우)는 작은 쪽을 쓴다. 크기 한 단계 차이는 높이 1.1배쯤이고 줄이 하나 늘면 1.3배를 넘으므로 그 비율로 가른다.
// 가장 작은 크기로도 넘치면 null(호출한 쪽이 요점을 줄이거나 fitText의 축소로 넘어간다).
// 크기를 고른 뒤에는 모든 계열 공용 규칙(balanceWidth)으로 줄 길이를 고르게 맞춰 다시 그린다.
async function fitTitle(value:string,sizes:number[],width:number,maxHeight:number,font:Font,color:string,spacing:number):Promise<Layer|null> {
  const balanced=async(layer:Layer,size:number)=>{
    const fit=await balanceWidth(value,{size,width,font,spacing,height:layer.info.height});
    return fit.width<width?textLayer(value,{size,color,width:fit.width,height:4000,font,spacing}):layer;
  };
  for(const [i,size] of sizes.entries()){
    const layer=await textLayer(value,{size,color,width,height:4000,font,spacing});
    if(layer.info.height>maxHeight)continue;
    if(i+1<sizes.length){
      const smaller=await textLayer(value,{size:sizes[i+1],color,width,height:4000,font,spacing});
      if(layer.info.height>smaller.info.height*1.3)return balanced(smaller,sizes[i+1]);
    }
    return balanced(layer,size);
  }
  return null;
}
const sumH=(layers:Layer[],gap:number)=>layers.reduce((sum,layer)=>sum+layer.info.height,0)+gap*Math.max(0,layers.length-1);

export const renderTicket:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const variant=slide.variant??0;
  const tone=TONES[(index-1+variant)%TONES.length];
  const rand=seeded(index*31+variant);
  const shots=inputs.slice(0,2);
  const no=`No. ${String(index).padStart(3,"0")}`;
  let deco=backdrop(tone)+paper();     // 모든 것의 아래(바탕·종이·창틀·줄)
  let over="";                          // 사진 위에 얹는 장식(검은 띠·도장)
  const photos:OverlayOptions[]=[];     // 사진 레이어
  const layers:OverlayOptions[]=[];     // 글자 레이어(맨 위)
  let watermark:OverlayOptions|null=null;

  if(content.cover){
    // ── 표지: 본체 위쪽 대부분을 사진이 채우고, 사진 위 검은 띠에 흰 ADMIT ONE·번호. 아래에 큰 제목. ──
    // 키워드 줄은 스텁(절취선 아래)으로 옮기고, 빨간 도장은 사진 오른쪽 아래 모서리에 찍어 제목 아래 줄을 없앤다 → 그만큼 사진이 커진다.
    const PX=TX+16,PW=TW-32,PY=TY+16,BASE_PH=600,MAX_PH=860,GAP=36;
    const admit=await textLayer("ADMIT ONE",{size:46,color:"#FFFFFF",width:500,height:80,font:STYLE_FONTS.condensed,spacing:0});
    const num=await textLayer(no,{size:30,color:"#FFFFFF",width:300,height:60,font:STYLE_FONTS.mono,spacing:0});
    layers.push({input:admit.data,left:PX+26,top:PY+(72-admit.info.height)/2},{input:num.data,left:PX+PW-26-num.info.width,top:PY+(72-num.info.height)/2});
    // 제목 칸: 사진(기본 600px) 아래부터 절취선 위까지. 그 높이 안에서 가장 큰 제목 크기를 고른다(maxHeight는 이 칸 전체).
    const baseAreaH=BODY_BOTTOM-(PY+BASE_PH+GAP);
    const title=await fitTitle(content.headline,[100,90,80,72,68],CW,baseAreaH,STYLE_FONTS.heavy,INK,10)??await fitText(content.headline,{sizes:[68],width:CW,maxHeight:baseAreaH,color:INK,font:STYLE_FONTS.heavy,spacing:10});
    // 제목이 들어가고 남는 높이는 모두 사진에 준다(상한 860). 남은 몇 px는 제목 위아래로 나눈다.
    const PH=Math.round(Math.min(MAX_PH,BASE_PH+Math.max(0,baseAreaH-title.info.height-8)));
    photos.push({input:await croppedPhoto(shots[0],PW,PH,16),left:PX,top:PY});
    over+=`<path d="${topRoundedRect(PX,PY,PW,72,16)}" fill="${BAND}" fill-opacity=".9"/><rect x="${PX+1}" y="${PY+1}" width="${PW-2}" height="${PH-2}" rx="15" fill="none" stroke="${EDGE}" stroke-width="2"/>`;
    const areaTop=PY+PH+GAP,areaH=BODY_BOTTOM-areaTop;
    const top=areaTop+Math.max(0,(areaH-title.info.height)/2);
    layers.push({input:title.data,left:CX,top});
    // 도장: 사진 오른쪽 아래 모서리 안쪽(검표 도장을 사진에 찍은 듯). 음식은 대개 가운데라 모서리는 가리지 않는다.
    const scx=PX+PW-STAMP_R-22,scy=PY+PH-STAMP_R-22;
    over+=stampSvg(scx,scy,STAMP_R,index*7+1);
    layers.push(await stampText(scx,scy,STAMP_R));
  }else{
    // ── 본문 머리글: 왼쪽 ADMIT ONE(좁은 영문 대문자), 오른쪽 고정폭 번호. 한 줄에 세로 가운데. ──
    const admit=await textLayer("ADMIT ONE",{size:46,color:INK,width:500,height:80,font:STYLE_FONTS.condensed,spacing:0});
    const num=await textLayer(no,{size:30,color:INK,width:300,height:60,font:STYLE_FONTS.mono,spacing:0});
    layers.push({input:admit.data,left:CX,top:BODY_TOP+(HEADER_H-admit.info.height)/2},{input:num.data,left:CR-num.info.width,top:BODY_TOP+(HEADER_H-num.info.height)/2});
    const titleTop=BODY_TOP+HEADER_H+16;
    if(shots.length){
      // ── 사진 장: 제목 → 구획선 → 사진 창(한 장은 가득, 두 장은 나란히) → ▸ 요점. ──
      const title=await fitTitle(content.headline,[76,68,60,54],CW,240,STYLE_FONTS.heavy,INK,8)??await fitText(content.headline,{sizes:[54],width:CW,maxHeight:240,color:INK,font:STYLE_FONTS.heavy,spacing:8});
      layers.push({input:title.data,left:CX,top:titleTop});
      let y=titleTop+title.info.height+10;
      deco+=rules(CX,y,CW);
      y+=14+28;
      // 요점을 먼저 만들어 높이를 알고, 남는 자리로 사진 높이를 정한다. 사진이 너무 납작해지면 마지막 요점을 뺀다.
      const GAP=18,MIN_PH=250;
      let points=await Promise.all(content.points.slice(0,3).map(point=>textLayer(point,{size:40,color:TEXT,width:CW-44,height:240,font:STYLE_FONTS.sansSemi,spacing:6})));
      const two=shots.length>1;
      const tagH=two?42:0;                      // 두 장일 때 창 아래 A·B 꼬리표 줄
      const room=()=>BODY_BOTTOM-y-tagH-(points.length?sumH(points,GAP)+30:0);
      while(room()<MIN_PH&&points.length>1)points=points.slice(0,-1);
      const PH=Math.round(Math.min(points.length?(two?440:520):760,Math.max(MIN_PH,room())));
      if(two){
        const gap=32,PW=Math.round((CW-gap)/2);
        const tags=await Promise.all(shots.map((_,i)=>textLayer(`${i?"B":"A"} · ${content.keywords[i]??(i?"비교":"기준")}`,{size:28,color:TEXT,width:PW,height:44,font:STYLE_FONTS.mono,align:"centre",spacing:0})));
        for(const [i,shot] of shots.entries()){
          const x=CX+i*(PW+gap);
          deco+=photoWindow(x,y,PW,PH);
          photos.push({input:await croppedPhoto(shot,PW-16,PH-16,6),left:x+8,top:y+8});
          layers.push({input:tags[i].data,left:x+(PW-tags[i].info.width)/2,top:y+PH+10});
        }
        // 두 창 사이에 작은 도장을 걸쳐 찍어 "짝 장"임을 보여 준다.
        const scx=CX+CW/2,scy=y+PH/2,r=48;
        over+=stampSvg(scx,scy,r,index*7+1);
        layers.push(await stampText(scx,scy,r));
      }else{
        deco+=photoWindow(CX,y,CW,PH);
        photos.push({input:await croppedPhoto(shots[0],CW-16,PH-16,6),left:CX+8,top:y+8});
        // 창 모서리에 기울어진 도장. 장마다 오른쪽 위·왼쪽 아래를 번갈아 찍는다. 창 밖으로는 16px만 나가게 해 제목·요점과 떨어뜨린다.
        const topRight=(index+variant)%2===0;
        const scx=topRight?CX+CW-44:CX+44,scy=topRight?y+44:y+PH-44;
        over+=stampSvg(scx,scy,STAMP_R,index*7+1);
        layers.push(await stampText(scx,scy,STAMP_R));
      }
      y+=PH+tagH+30;
      // 요점: 남는 공간은 요점 사이와 위에 고루 나눠 아래가 비지 않게 한다.
      if(points.length){
        const spare=Math.max(0,BODY_BOTTOM-y-sumH(points,GAP));
        const extra=Math.min(28,spare/(points.length+1));
        let py=y+extra;
        for(const point of points){
          deco+=bullet(CX,py+Math.round(40*.62));
          layers.push({input:point.data,left:CX+44,top:py});
          py+=point.info.height+GAP+extra;
        }
      }
    }else{
      // ── 글자 장: 제목 → 구획선 → 메뉴판처럼 "요점 ……… 01" 줄. 뒤에 아주 옅은 TICKET 워터마크. ──
      // 요점(46px 이상)이 먼저 자리를 차지하고, 제목은 남는 높이에 들어가는 가장 큰 크기를 쓴다.
      const avail=BODY_BOTTOM-titleTop,GAP=26,NUM_W=110;
      let points:Layer[]=[],title:Layer|null=null,size=46;
      for(const candidate of [54,50,46]){
        size=candidate;
        points=await Promise.all(content.points.slice(0,4).map(point=>textLayer(point,{size,color:TEXT,width:CW-NUM_W,height:400,font:STYLE_FONTS.sansSemi,spacing:6})));
        const titleMax=avail-(points.length?sumH(points,GAP)+60:0);
        title=await fitTitle(content.headline,[92,84,76,68,60],CW,titleMax,STYLE_FONTS.heavy,INK,8);
        if(title)break;
      }
      // 가장 작은 조합으로도 넘치면 제목을 높이에 맞춰 줄인다(fitText의 마지막 수단).
      title??=await fitText(content.headline,{sizes:[60],width:CW,maxHeight:Math.max(80,avail-(points.length?sumH(points,GAP)+60:0)),color:INK,font:STYLE_FONTS.heavy,spacing:8});
      // 오른쪽 끝 번호(01·02…)는 요점 글자의 3/4 크기, 최소 34px.
      const numSize=Math.max(34,Math.round(size*.74));
      const numbers=await Promise.all(points.map((_,i)=>textLayer(String(i+1).padStart(2,"0"),{size:numSize,color:RED,width:NUM_W,height:60,font:STYLE_FONTS.mono,spacing:0})));
      const used=title.info.height+10+14+36+(points.length?sumH(points,GAP):0);
      const spare=Math.max(0,avail-used);
      // 요점이 있으면 남는 높이를 요점 사이에 나누고(최대 76px), 그래도 남으면 덩어리를 세로 가운데에 둔다.
      const extra=points.length>1?Math.min(76,spare/(points.length-1)):0;
      const blockH=used+extra*Math.max(0,points.length-1);
      let y=titleTop+Math.max(0,(avail-blockH)/2);
      layers.push({input:title.data,left:CX,top:y});
      y+=title.info.height+10;
      deco+=rules(CX,y,CW);
      y+=14+36;
      for(const [i,point] of points.entries()){
        layers.push({input:point.data,left:CX,top:y});
        const num=numbers[i];
        const baseline=y+point.info.height-Math.round(size*.3);
        layers.push({input:num.data,left:CR-num.info.width,top:baseline-Math.round(num.info.height*.72)});
        deco+=leader(CX+point.info.width+16,CR-num.info.width-18,baseline);
        y+=point.info.height+GAP+extra;
      }
      // 워터마크: 검은 TICKET을 5% 농도로 본체 가운데에. 글자 레이어를 투명하게 바꾼 별도 버퍼라 읽는 글자로 세지 않는다.
      const mark=await textLayer("TICKET",{size:330,color:"#000000",width:1000,height:420,font:STYLE_FONTS.condensed,spacing:0});
      const faint=await sharp(mark.data).ensureAlpha().linear([1,1,1,.05],[0,0,0,0]).png().toBuffer({resolveWithObject:true});
      watermark={input:faint.data,left:TX+(TW-faint.info.width)/2,top:(titleTop+BODY_BOTTOM)/2-faint.info.height/2+20};
    }
  }
  // ── 스텁(절취선 아래): 왼쪽 가게 이름 + 장 번호, 오른쪽 바코드 + 글자 코드. 각각 스텁 높이 가운데에. ──
  const brand=await fitText(brandName(),{sizes:[30,28,26],width:430,maxHeight:72,color:INK,font:STYLE_FONTS.sansBold});
  const pageNo=await textLayer(`${index} / ${total}`,{size:32,color:TEXT,width:300,height:50,font:STYLE_FONTS.mono,spacing:0});
  // 표지 키워드(#홍어 #막걸리)는 스텁 왼쪽, 장 번호 아래에 둔다. 바코드 왼쪽 칸(430px)에 한 줄로 안 들어가면 뒤 키워드부터 뺀다.
  let tag:Layer|null=null;
  if(content.cover){
    const words=content.keywords.length?content.keywords.map(word=>`#${word}`):[`#${STORE_NAME}`];
    for(let n=words.length;n>0&&!tag;n--){
      const candidate=await textLayer(words.slice(0,n).join("  "),{size:28,color:TEXT,width:2000,height:50,font:STYLE_FONTS.mono,spacing:0});
      if(candidate.info.width<=430)tag=candidate;
    }
  }
  const leftH=brand.info.height+8+pageNo.info.height+(tag?14+tag.info.height:0),leftTop=PERF+(STUB_H-leftH)/2;
  layers.push({input:brand.data,left:CX,top:leftTop},{input:pageNo.data,left:CX,top:leftTop+brand.info.height+8});
  if(tag)layers.push({input:tag.data,left:CX,top:leftTop+brand.info.height+8+pageNo.info.height+14});
  const BW=360,BH=70,bx=CR-BW;
  const code=await textLayer(`MUKDONG ${index}${total}`,{size:26,color:TEXT,width:BW,height:40,font:STYLE_FONTS.mono,align:"centre",spacing:0});
  const rightH=BH+10+10+code.info.height,by=PERF+(STUB_H-rightH)/2;
  deco+=barcode(bx,by,BW,BH,rand);
  layers.push({input:code.data,left:bx+(BW-code.info.width)/2,top:by+BH+10+10});
  const stack:OverlayOptions[]=[svgLayer(deco),...(watermark?[watermark]:[]),...photos,...(over?[svgLayer(over)]:[]),...layers];
  return sharp({create:{width:1080,height:1350,channels:3,background:tone}}).composite(snap(stack)).jpeg({quality:92}).toBuffer();
};
