import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { brandHandle, croppedPhoto, svgLayer, textLayer, type CardRenderer, type Font, type Layer, type TextEmphasis } from "../render/primitives";
import { MIN_STROKE, STYLE_FONTS, brandSeal, chooseTitleLayout, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { seeded } from "./handDrawn";

// 티켓·승차권: 짙은 바탕 한가운데 세로로 긴 입장권 종이 한 장. 아래쪽 절취선(점선과 양옆 반원 홈)으로 본체와 스텁이 나뉜다.
// 본체에는 "ADMIT ONE"(아래에 한글 "입장권 · 묵동홍어마을" 병기)·번호·제목·사진 창·요점, 스텁에는 가게 이름·장 번호·바코드. 옛날 극장표·기차표 느낌이라
// 방문 안내·오시는 길·모임 초대처럼 "오세요" 하는 글에 어울린다.
// 장식 글자는 ADMIT ONE·입장권·No.(장 번호)·가게 이름·키워드뿐이다. 날짜·좌석·가격·시간처럼 사실을 단정하는 글자는 쓰지 않는다.

const TONES=["#1F3A3D","#2B2F4A","#3A2A2A"] as const;      // 바탕색(청록·남색·적갈). 장마다 돌려 쓴다.
const PAPER="#F7EFD9",STUB="#EFE4C8",EDGE="#2B2A26",INK="#1E1C18",TEXT="#2A2824",RED="#C8321E",BAND_COLOR="#141311";
// 티켓 종이 자리: 캔버스 가운데 940×1262. 아래 250px이 스텁(절취선 아래), 그 위가 본체.
// 스텁을 더 키우면 본체에서 사진·요점 자리가 모자라므로(긴 요점 4개 × 2줄) 전체의 1/5쯤으로 둔다.
const TX=70,TY=44,TW=940,TH=1262,TR=24,STUB_H=250,PERF=TY+TH-STUB_H;
// 본체 안쪽 글자 칸: 좌우 48px 들여 844px. 위는 40px, 아래는 절취선에서 40px 띄운다.
const PAD=48,CX=TX+PAD,CW=TW-PAD*2,CR=TX+TW-PAD,BODY_TOP=TY+40,BODY_BOTTOM=PERF-40;
const HEADER_H=90;                                          // ADMIT ONE(46px) + 입장권 줄(26px) 머리글 높이
const STAMP_R=60;                                           // 도장 자리 반지름(예전 원형 도장). 낙관은 이 원에 맞는 사각(지름×.9)으로 찍는다.
const ADMIT_KO="입장권 · 묵동홍어마을";                       // ADMIT ONE 아래 한글 병기(사장님 결정: 영문은 유지하고 한글을 함께)

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
  // 바깥 테두리는 클립에 반이 잘리므로 5px로 그려 2.5px(MIN_STROKE)이 보이게 한다. 홈 둘레도 같은 굵기로 이어진다.
  s+=`<path d="${outline}" fill="none" stroke="${EDGE}" stroke-width="5"/>`;
  for(const cx of [TX,TX+TW])s+=`<circle cx="${cx}" cy="${PERF}" r="22" fill="none" stroke="${EDGE}" stroke-width="5"/>`;
  s+=`<path d="${roundedRect(TX+9,TY+9,TW-18,TH-18,TR-8)}" fill="none" stroke="${EDGE}" stroke-opacity=".35" stroke-width="${MIN_STROKE}"/>`;
  // 절취선: 홈 사이를 잇는 점선.
  s+=`<path d="M${TX+30} ${PERF}H${TX+TW-30}" stroke="${EDGE}" stroke-opacity=".6" stroke-width="${MIN_STROKE}" stroke-dasharray="12 10"/>`;
  return s+`</g>`;
}
// 제목 아래 굵은 줄 + 가는 줄(극장표의 구획선). 높이 14.
const rules=(x:number,y:number,w:number)=>`<rect x="${x}" y="${y}" width="${w}" height="6" fill="${INK}"/><rect x="${x}" y="${y+11}" width="${w}" height="3" fill="${INK}"/>`;
// 사진 창: 뒤에 옅은 그림자, 흰 종이 띠(8px)와 가는 검은 테두리. 사진은 안쪽에 8px 들여 얹는다.
const photoWindow=(x:number,y:number,w:number,h:number)=>`<rect x="${x+6}" y="${y+8}" width="${w}" height="${h}" rx="12" fill="${INK}" fill-opacity=".16"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#FFFFFF" stroke="${EDGE}" stroke-width="${MIN_STROKE}"/>`;
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
// 도장: 예전 빨간 원형 "묵동" 도장 대신 모든 계열이 같이 쓰는 가게 낙관(brandSeal "묵동/홍어")을 같은 자리에 찍는다.
// (cx,cy)는 예전 원의 가운데, r은 그 반지름. 낙관 한 변은 지름의 .9배라 원 자리와 비슷한 크기로 보인다.
async function seal(cx:number,cy:number,r:number,seed:number):Promise<{svg:string;text:OverlayOptions}> {
  const size=Math.round(r*1.8),x=Math.round(cx-size/2),y=Math.round(cy-size/2);
  const mark=await brandSeal(size,seed,{on:"light",rotate:-8});
  return {svg:mark.svg(x,y),text:{input:mark.text.data,left:x+Math.round((size-mark.text.info.width)/2),top:y+Math.round((size-mark.text.info.height)/2)}};
}
// 제목 크기 고르기: 들어가는 가장 큰 크기를 쓰되, 한 단계 작은 크기로 줄이면 줄 수가 하나 줄 때("드세요"만 다음 줄로
// 떨어지는 경우)는 작은 쪽을 쓴다. 크기 한 단계 차이는 높이 1.1배쯤이고 줄이 하나 늘면 1.3배를 넘으므로 그 비율로 가른다.
// 가장 작은 크기로도 넘치면 null(호출한 쪽이 요점을 줄이거나 fitText의 축소로 넘어간다).
// 크기를 고른 뒤에는 모든 계열 공용 규칙(balanceWidth)으로 줄 길이를 고르게 맞춰 다시 그린다.
async function fitTitle(value:string,sizes:number[],width:number,maxHeight:number,font:Font,color:string,spacing:number,emphasis?:TextEmphasis):Promise<Layer|null> {
  // 크기가 정해지면 공용 규칙(chooseTitleLayout)으로 줄을 나눈다: 쉼표 뒤 의미 단위 줄바꿈("홍어 한 / 점," 방지) 또는 균형 폭.
  const balanced=async(layer:Layer,size:number)=>{
    // 고른 크기부터 작은 크기 목록을 넘겨, 쉼표 앞 절반이 한 줄에 안 들어가면 두 단계 작은 크기까지 의미 단위 줄바꿈을 시도하게 한다.
    const fit=await chooseTitleLayout(value,{sizes:sizes.slice(Math.max(0,sizes.indexOf(size))),width,maxHeight,font,spacing});
    return fit.text!==value||fit.width<width?textLayer(fit.text,{size:fit.size,color,width:fit.width,height:4000,font,spacing,emphasis}):layer;
  };
  for(const [i,size] of sizes.entries()){
    const layer=await textLayer(value,{size,color,width,height:4000,font,spacing,emphasis});
    if(layer.info.height>maxHeight)continue;
    if(i+1<sizes.length){
      const smaller=await textLayer(value,{size:sizes[i+1],color,width,height:4000,font,spacing,emphasis});
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
  // 제목 핵심어: 도장과 같은 빨강(종이 위 4.5:1 이상).
  const emphasis=emphasisOf(content,RED);
  let deco=backdrop(tone)+paper();     // 모든 것의 아래(바탕·종이·창틀·줄)
  let over="";                          // 사진 위에 얹는 장식(검은 띠·도장)
  const photos:OverlayOptions[]=[];     // 사진 레이어
  const layers:OverlayOptions[]=[];     // 글자 레이어(맨 위)
  let watermark:OverlayOptions|null=null;
  // 마지막 장 명함: 본체 아래쪽(절취선 위)에 두고, 그 높이만큼 본체 글자 칸을 미리 줄인다.
  const closing=content.last?await closingBlock({width:CW,color:INK,accent:RED,font:STYLE_FONTS.heavy}):null;
  const CLOSING_GAP=40;
  const bodyBottom=BODY_BOTTOM-(closing?closing.height+CLOSING_GAP:0);
  const tight=!!closing;

  if(content.cover){
    // ── 표지: 본체 위쪽 대부분을 사진이 채우고, 사진 위 검은 띠에 흰 ADMIT ONE(아래 한글 병기)·번호. 아래에 큰 제목과 부제. ──
    // 키워드 줄은 스텁(절취선 아래)으로 옮기고, 낙관은 사진 오른쪽 아래 모서리에 찍어 제목 아래 줄을 없앤다 → 그만큼 사진이 커진다.
    const PX=TX+16,PW=TW-32,PY=TY+16,BASE_PH=600,MAX_PH=860,GAP=36,BAND=104;
    const admit=await textLayer("ADMIT ONE",{size:46,color:"#FFFFFF",width:500,height:80,font:STYLE_FONTS.condensed,spacing:0});
    const admitKo=await textLayer(ADMIT_KO,{size:26,color:"#FFFFFF",width:500,height:44,font:STYLE_FONTS.sansSemi,letterSpacing:26*.06});
    const num=await textLayer(no,{size:30,color:"#FFFFFF",width:300,height:60,font:STYLE_FONTS.mono,spacing:0,features:"tnum"});
    const headH=admit.info.height+2+admitKo.info.height,headTop=PY+(BAND-headH)/2;
    layers.push({input:admit.data,left:PX+26,top:headTop},{input:admitKo.data,left:PX+28,top:headTop+admit.info.height+2},{input:num.data,left:PX+PW-26-num.info.width,top:PY+(BAND-num.info.height)/2});
    // 제목 칸: 사진(기본 600px) 아래부터 절취선 위까지. 그 높이 안에서 가장 큰 제목 크기를 고른다(maxHeight는 이 칸 전체, 부제 자리를 뺀다).
    const baseAreaH=BODY_BOTTOM-(PY+BASE_PH+GAP);
    const sub=content.subline?await textLayer(content.subline,{size:34,color:TEXT,width:CW,height:56,font:STYLE_FONTS.sansSemi}):null;
    const subH=sub?sub.info.height+14:0;
    // 부제까지 넣으면 제목이 가장 작은 크기로도 안 들어가면 부제를 빼고 제목만(넘침 금지).
    let title=sub?await fitTitle(content.headline,[100,90,80,72,68],CW,baseAreaH-subH,STYLE_FONTS.heavy,INK,10,emphasis):null;
    const useSub=!!title;
    title??=await fitTitle(content.headline,[100,90,80,72,68],CW,baseAreaH,STYLE_FONTS.heavy,INK,10,emphasis)??await fitText(content.headline,{sizes:[68],width:CW,maxHeight:baseAreaH,color:INK,font:STYLE_FONTS.heavy,spacing:10,emphasis});
    const textH=title.info.height+(useSub?subH:0);
    // 제목이 들어가고 남는 높이는 모두 사진에 준다(상한 860). 남은 몇 px는 제목 위아래로 나눈다.
    const PH=Math.round(Math.min(MAX_PH,BASE_PH+Math.max(0,baseAreaH-textH-8)));
    photos.push({input:await croppedPhoto(shots[0],PW,PH,16),left:PX,top:PY});
    over+=`<path d="${topRoundedRect(PX,PY,PW,BAND,16)}" fill="${BAND_COLOR}" fill-opacity=".9"/><rect x="${PX+1}" y="${PY+1}" width="${PW-2}" height="${PH-2}" rx="15" fill="none" stroke="${EDGE}" stroke-width="${MIN_STROKE}"/>`;
    const areaTop=PY+PH+GAP,areaH=BODY_BOTTOM-areaTop;
    const top=areaTop+Math.max(0,(areaH-textH)/2);
    layers.push({input:title.data,left:CX,top});
    if(useSub&&sub)layers.push({input:sub.data,left:CX,top:top+title.info.height+14});
    // 낙관: 사진 오른쪽 아래 모서리 안쪽(검표 도장을 사진에 찍은 듯). 음식은 대개 가운데라 모서리는 가리지 않는다.
    const mark=await seal(PX+PW-STAMP_R-22,PY+PH-STAMP_R-22,STAMP_R,index*7+1);
    over+=mark.svg;layers.push(mark.text);
  }else{
    // ── 본문 머리글: 왼쪽 ADMIT ONE(좁은 영문 대문자)과 그 아래 한글 "입장권 · 묵동홍어마을", 오른쪽 고정폭 번호. ──
    const admit=await textLayer("ADMIT ONE",{size:46,color:INK,width:500,height:80,font:STYLE_FONTS.condensed,spacing:0});
    const admitKo=await textLayer(ADMIT_KO,{size:26,color:TEXT,width:500,height:44,font:STYLE_FONTS.sansSemi,letterSpacing:26*.06});
    const num=await textLayer(no,{size:30,color:INK,width:300,height:60,font:STYLE_FONTS.mono,spacing:0,features:"tnum"});
    const headTop=BODY_TOP+(HEADER_H-admit.info.height-2-admitKo.info.height)/2;
    layers.push({input:admit.data,left:CX,top:headTop},{input:admitKo.data,left:CX+2,top:headTop+admit.info.height+2},{input:num.data,left:CR-num.info.width,top:BODY_TOP+(56-num.info.height)/2});
    const titleTop=BODY_TOP+HEADER_H+16;
    if(shots.length){
      // ── 사진 장: 제목 → 구획선 → 사진 창(한 장은 가득, 두 장은 나란히) → ▸ 요점. ──
      const title=await fitTitle(content.headline,[76,68,60,54],CW,240,STYLE_FONTS.heavy,INK,8,emphasis)??await fitText(content.headline,{sizes:[54],width:CW,maxHeight:240,color:INK,font:STYLE_FONTS.heavy,spacing:8,emphasis});
      layers.push({input:title.data,left:CX,top:titleTop});
      let y=titleTop+title.info.height+10;
      deco+=rules(CX,y,CW);
      y+=14+28;
      // 요점을 먼저 만들어 높이를 알고, 남는 자리로 사진 높이를 정한다. 사진이 너무 납작해지면 마지막 요점을 뺀다.
      // 마지막 장(명함)은 요점을 빼기 전에 글자를 36px로 줄이고 사진 하한도 낮춘다.
      const GAP=18,MIN_PH=tight?200:250;
      const makePoints=(size:number)=>Promise.all(content.points.slice(0,3).map(point=>textLayer(point,{size,color:TEXT,width:CW-44,height:240,font:STYLE_FONTS.sansSemi,spacing:6})));
      let pointSize=40,points=await makePoints(pointSize);
      const two=shots.length>1;
      const tagH=two?42:0;                      // 두 장일 때 창 아래 A·B 꼬리표 줄
      const room=()=>bodyBottom-y-tagH-(points.length?sumH(points,GAP)+30:0);
      if(tight&&room()<MIN_PH){pointSize=36;points=await makePoints(pointSize);}
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
        // 두 창 사이에 작은 낙관을 걸쳐 찍어 "짝 장"임을 보여 준다.
        const mark=await seal(CX+CW/2,y+PH/2,48,index*7+1);
        over+=mark.svg;layers.push(mark.text);
      }else{
        deco+=photoWindow(CX,y,CW,PH);
        photos.push({input:await croppedPhoto(shots[0],CW-16,PH-16,6),left:CX+8,top:y+8});
        // 창 모서리에 기울어진 낙관. 장마다 오른쪽 위·왼쪽 아래를 번갈아 찍는다.
        const topRight=(index+variant)%2===0;
        const mark=await seal(topRight?CX+CW-44:CX+44,topRight?y+44:y+PH-44,STAMP_R,index*7+1);
        over+=mark.svg;layers.push(mark.text);
      }
      y+=PH+tagH+30;
      // 요점: 남는 공간은 요점 사이와 위에 고루 나눠 아래가 비지 않게 한다.
      if(points.length){
        const spare=Math.max(0,bodyBottom-y-sumH(points,GAP));
        const extra=Math.min(28,spare/(points.length+1));
        let py=y+extra;
        for(const point of points){
          deco+=bullet(CX,py+Math.round(pointSize*.62));
          layers.push({input:point.data,left:CX+44,top:py});
          py+=point.info.height+GAP+extra;
        }
      }
    }else{
      // ── 글자 장: 제목 → 구획선 → 메뉴판처럼 "요점 ……… 01" 줄. 뒤에 아주 옅은 TICKET 워터마크. ──
      // 요점(46px 이상, 마지막 장은 40px까지)이 먼저 자리를 차지하고, 제목은 남는 높이에 들어가는 가장 큰 크기를 쓴다.
      const avail=bodyBottom-titleTop,GAP=tight?20:26,NUM_W=110;
      let points:Layer[]=[],title:Layer|null=null,size=46;
      for(let count=4;count>=1&&!title;count--){
        for(const candidate of tight?[50,46,42,40]:[54,50,46]){
          size=candidate;
          points=await Promise.all(content.points.slice(0,count).map(point=>textLayer(point,{size,color:TEXT,width:CW-NUM_W,height:400,font:STYLE_FONTS.sansSemi,spacing:6})));
          const titleMax=avail-(points.length?sumH(points,GAP)+60:0);
          title=await fitTitle(content.headline,tight?[76,68,60]:[92,84,76,68,60],CW,titleMax,STYLE_FONTS.heavy,INK,8,emphasis);
          if(title)break;
        }
        // 마지막 장이 아니면 요점 수는 그대로 두고 아래 fitText로 넘어간다(예전 동작).
        if(!tight)break;
      }
      // 가장 작은 조합으로도 넘치면 제목을 높이에 맞춰 줄인다(fitText의 마지막 수단).
      title??=await fitText(content.headline,{sizes:[60],width:CW,maxHeight:Math.max(80,avail-(points.length?sumH(points,GAP)+60:0)),color:INK,font:STYLE_FONTS.heavy,spacing:8,emphasis});
      // 오른쪽 끝 번호(01·02…)는 요점 글자의 3/4 크기, 최소 34px.
      const numSize=Math.max(34,Math.round(size*.74));
      const numbers=await Promise.all(points.map((_,i)=>textLayer(String(i+1).padStart(2,"0"),{size:numSize,color:RED,width:NUM_W,height:60,font:STYLE_FONTS.mono,spacing:0,features:"tnum"})));
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
      watermark={input:faint.data,left:TX+(TW-faint.info.width)/2,top:(titleTop+bodyBottom)/2-faint.info.height/2+20};
    }
  }
  // ── 마지막 장 명함: 구획선(굵은 줄+가는 줄) 아래 가게 이름·계정·빨간 칩. 절취선 위 본체 안. ──
  if(closing){
    let cy=BODY_BOTTOM-closing.height;
    deco+=rules(CX+CW/2-160,cy-CLOSING_GAP/2-7,320);
    layers.push({input:closing.wordmark.data,left:Math.round(CX+(CW-closing.wordmark.info.width)/2),top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(CX+(CW-closing.handle.info.width)/2),top:cy});cy+=closing.handle.info.height;}
    cy+=18+12;
    const chipX=Math.round(CX+(CW-closing.chip.info.width)/2);
    deco+=closing.chipSvg(chipX,cy);
    layers.push({input:closing.chip.data,left:chipX,top:cy});
  }
  // ── 스텁(절취선 아래): 왼쪽 가게 이름 + 장 번호, 오른쪽 바코드 + 글자 줄. 각각 스텁 높이 가운데에. ──
  // 가게 이름과 계정은 두 줄로 나눠 쓴다: 한 줄(가게 · 긴 계정)을 왼쪽 칸에 우겨넣으면 26px 아래로 줄어 읽히지 않는다.
  const brand=await textLayer(STORE_NAME,{size:30,color:INK,width:430,height:50,font:STYLE_FONTS.sansBold});
  const account=brandHandle();
  const handle=account?await fitText(account,{sizes:[28,26],width:CW-200-40,maxHeight:44,color:TEXT,font:STYLE_FONTS.sansSemi,balance:false}):null;
  const handleH=handle?4+handle.info.height:0;
  const pageNo=await textLayer(`${index} / ${total}`,{size:32,color:TEXT,width:300,height:50,font:STYLE_FONTS.mono,spacing:0,features:"tnum"});
  // 표지 예고 띠(이 뒤에 무엇이 나오는지)는 스텁 맨 아래 한 줄로 본체 폭 전체에 쓴다. 예고가 없으면 예전처럼 키워드(#홍어 #막걸리)를
  // 장 번호 아래에 두되, 바코드 왼쪽 칸(430px)에 한 줄로 안 들어가면 뒤 키워드부터 뺀다.
  const teaser=content.teaser?await textLayer(content.teaser,{size:26,color:TEXT,width:CW,height:44,font:STYLE_FONTS.sansSemi}):null;
  let tag:Layer|null=null;
  if(content.cover&&!teaser){
    const words=content.keywords.length?content.keywords.map(word=>`#${word}`):[`#${STORE_NAME}`];
    for(let n=words.length;n>0&&!tag;n--){
      const candidate=await textLayer(words.slice(0,n).join("  "),{size:28,color:TEXT,width:2000,height:50,font:STYLE_FONTS.mono,spacing:0});
      if(candidate.info.width<=430)tag=candidate;
    }
  }
  // 바코드 아래 글자: 장 번호만 쓴 가게 표기(사실을 단정하는 코드·숫자 대신). 표지·마지막 장이 아니면 그 자리에 "넘겨 보기 ›".
  const cue=!content.cover&&!content.last?await nextCue(TEXT,26):null;
  // 바코드 폭: 기본 360, 계정이 길면 왼쪽 칸에 자리를 내주도록 줄인다(최소 200).
  const leftW=Math.max(brand.info.width,handle?.info.width??0,tag?.info.width??0);
  const BW=Math.max(200,Math.min(360,CW-leftW-40)),BH=70,bx=CR-BW;
  const code=cue?null:await textLayer(`묵동홍어마을 · ${String(index).padStart(2,"0")}`,{size:26,color:TEXT,width:360,height:44,font:STYLE_FONTS.mono,align:"centre",spacing:0,features:"tnum"});
  const lowerH=code?code.info.height:cue!.height;
  const leftH=brand.info.height+handleH+8+pageNo.info.height+(tag?14+tag.info.height:0);
  const rightH=BH+10+10+lowerH;
  const rowH=Math.max(leftH,rightH),teaserH=teaser?16+teaser.info.height:0;
  const rowTop=PERF+(STUB_H-rowH-teaserH)/2;
  const leftTop=rowTop+(rowH-leftH)/2,by=rowTop+(rowH-rightH)/2;
  layers.push({input:brand.data,left:CX,top:leftTop},{input:pageNo.data,left:CX,top:leftTop+brand.info.height+handleH+8});
  if(handle)layers.push({input:handle.data,left:CX,top:leftTop+brand.info.height+4});
  if(tag)layers.push({input:tag.data,left:CX,top:leftTop+brand.info.height+handleH+8+pageNo.info.height+14});
  deco+=barcode(bx,by,BW,BH,rand);
  // 바코드가 좁아졌을 때도 글자가 왼쪽 칸(계정)으로 넘어가지 않게 바코드 가운데가 아니라 오른쪽 끝(CR)에 맞춘다.
  if(code)layers.push({input:code.data,left:Math.min(bx+(BW-code.info.width)/2,CR-code.info.width),top:by+BH+10+10});
  if(cue){
    const cx=CR-cue.width,cy=by+BH+10+10;
    layers.push({input:cue.label.data,left:cx,top:cy});
    deco+=cue.arrow(cx,cy);
  }
  if(teaser){
    // 예고 띠 앞에 작은 빨간 ▸(요점 글머리와 같은 모양).
    const ty=rowTop+rowH+16;
    deco+=bullet(CX,ty+teaser.info.height/2);
    layers.push({input:teaser.data,left:CX+30,top:ty});
  }
  const stack:OverlayOptions[]=[svgLayer(deco),...(watermark?[watermark]:[]),...photos,...(over?[svgLayer(over)]:[]),...layers];
  return sharp({create:{width:1080,height:1350,channels:3,background:tone}}).composite(snap(stack)).jpeg({quality:92}).toBuffer();
};
