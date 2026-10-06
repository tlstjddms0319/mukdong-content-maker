import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { brandHandle, grainLayer, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { washiTape } from "../decor";
import { HANDWRITING_MIN_SIZE, MIN_STROKE, STYLE_FONTS, closingBlock, contentOf, emphasisOf, filmPhoto, fitText, nextCue, rotated, snap } from "./shared";

// 빈티지 다이어리·스크랩북: 크라프트지 바탕 위에 아래쪽이 찢어진 줄 노트를 붙이고, 필름 색감 폴라로이드를 마스킹 테이프로 고정한다.
// 제목·머리말·서명은 나눔펜 손글씨(46px 이상), 요점은 폰에서도 읽히게 고운돋움으로 노트 줄 위에 한 줄씩 적는다.
const KRAFT="#C8A57A",PAPER="#FBF7EC",RULE="#9DB8D6",MARGIN_LINE="#E58C8C",PEN="#1F2A4A",RED_PEN="#C0392B";
const TAPES=["#F4B6C2","#B9E3C6","#FCE38A","#AEC8F2"];

// 흰 테두리를 두른 별 스티커(스크랩북 장식).
function sticker(cx:number,cy:number,r:number,fill:string):string {
  const points=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+(Math.PI*i)/5,k=i%2?.5:1;return `${Math.round(cx+Math.cos(a)*r*k)},${Math.round(cy+Math.sin(a)*r*k)}`;}).join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="#fff" stroke-width="5" stroke-linejoin="round" transform="rotate(14 ${cx} ${cy})"/>`;
}

// 아래 가장자리가 들쭉날쭉한 종이(찢어진 노트) 모양.
function tornPaper(x:number,y:number,w:number,h:number,seed:number):string {
  const teeth=Array.from({length:28},(_,i)=>{const px=x+w-(w*(i+1))/28,dy=((i*7+seed*3)%5)*5;return `L${Math.round(px)} ${y+h-dy}`;}).join("");
  return `<path d="M${x} ${y}H${x+w}V${y+h}${teeth}Z" fill="${PAPER}"/>`;
}


// 폴라로이드 한 장: 흰 틀(아래가 넓음)에 필름 사진, 아래 여백에 손글씨 메모·서명.
// 가로형(표지)·정사각(본문) 모두 이 함수로 만든다. caption은 가운데, sign은 오른쪽(표지의 가게 서명) 손글씨.
const POL_PAD=24,POL_SHADOW=20;
// strip: 자리가 아주 모자랄 때 쓰는 가로로 긴 "와이드 필름" 모양. 아래 여백 없이 테두리만 둘러 사진 높이를 최대한 남긴다.
const polaroidBottom=(photoH:number,strip=false)=>strip?POL_PAD:Math.max(72,Math.round(photoH*.2));
async function polaroid(input:Buffer,w:number,h:number,options:{leak:"left"|"right";caption?:string;sign?:string;handle?:Layer|null;strip?:boolean}):Promise<Buffer> {
  const pad=POL_PAD,bottom=polaroidBottom(h,options.strip);
  const photo=await filmPhoto(input,w,h,options.leak,"diary");
  const W=w+pad*2,H=h+pad+bottom;
  const shadow=Buffer.from(`<svg width="${W+POL_SHADOW}" height="${H+POL_SHADOW}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs><rect x="10" y="14" width="${W}" height="${H}" fill="#000" opacity=".28" filter="url(#b)"/><rect x="0" y="0" width="${W}" height="${H}" fill="#FFFEFA"/></svg>`);
  const parts:OverlayOptions[]=[{input:shadow,left:0,top:0},{input:photo,left:pad,top:pad}];
  // 여백 글씨도 손글씨 최소 크기(HANDWRITING_MIN_SIZE) 이상으로 써서 폰에서 읽히게 한다.
  if(options.caption&&!options.strip){
    const note=await textLayer(options.caption,{size:HANDWRITING_MIN_SIZE,color:PEN,width:w,height:bottom-8,font:STYLE_FONTS.hand,align:"centre"});
    parts.push({input:note.data,left:pad+Math.round((w-note.info.width)/2),top:pad+h+Math.round((bottom-note.info.height)/2)});
  }
  if(options.sign){
    const sign=await textLayer(options.sign,{size:HANDWRITING_MIN_SIZE,color:RED_PEN,width:Math.round(w*.6),height:bottom-8,font:STYLE_FONTS.hand});
    const sx=pad+w-sign.info.width-6,sy=pad+h+Math.round((bottom-sign.info.height)/2)-4;
    parts.push({input:sign.data,left:sx,top:sy});
    // 계정은 서명 왼쪽에 같은 높이로(왼쪽 아래 도장 자리 160px은 비운다). 자리가 없으면 서명 아래 여백 안쪽 줄로 내린다.
    if(options.handle){
      const hw=options.handle.info.width,hh=options.handle.info.height;
      const beside=sx-28-hw>=pad+160;
      parts.push({input:options.handle.data,left:beside?sx-28-hw:pad+w-hw-6,top:beside?sy+Math.round((sign.info.height-hh)/2)+4:Math.min(pad+h+bottom-hh-4,sy+sign.info.height+2)});
    }
    parts.push({input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M${sx-16} ${sy+sign.info.height+8}q${sign.info.width/2+8} 14 ${sign.info.width+28} 0" fill="none" stroke="${RED_PEN}" stroke-width="3"/></svg>`),left:0,top:0});
  }
  return sharp({create:{width:W+POL_SHADOW,height:H+POL_SHADOW,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).png().toBuffer();
}
// 기울인 폴라로이드가 차지하는 세로 높이(회전 뒤 바깥 상자). 사진 크기를 남는 높이에서 역산할 때 쓴다.
const rad=(deg:number)=>Math.abs(deg)*Math.PI/180;
const tiltedHeight=(w:number,h:number,deg:number,strip=false)=>{
  const W=w+POL_PAD*2+POL_SHADOW,H=h+POL_PAD+polaroidBottom(h,strip)+POL_SHADOW;
  return Math.ceil(H*Math.cos(rad(deg))+W*Math.sin(rad(deg)))+4;
};
const tiltedWidth=(w:number,h:number,deg:number)=>{
  const W=w+POL_PAD*2+POL_SHADOW,H=h+POL_PAD+polaroidBottom(h)+POL_SHADOW;
  return Math.ceil(W*Math.cos(rad(deg))+H*Math.sin(rad(deg)))+4;
};
// 높이 limit 안에 들어가는 가장 큰 정사각 사진 한 변(이분 탐색, 정수).
function largestSquare(limit:number,deg:number):number {
  let lo=0,hi=1000;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(tiltedHeight(mid,mid,deg)<=limit)lo=mid;else hi=mid-1;}
  return lo;
}
// 폴라로이드를 기울여 캔버스에 놓을 부품으로 만든다. 부품 대부분이 사진이므로 자동 검수가 사진 면적으로 세도록 등록한다.
async function tiltedPolaroid(...args:[...Parameters<typeof polaroid>,number]):Promise<Layer> {
  const [input,w,h,options,deg]=args;
  const layer=await rotated(await polaroid(input,w,h,options),deg);
  registerPhoto(layer.data);
  return layer;
}

// 노트 줄 위 요점. 손글씨는 가늘어 폰에서 잘 안 읽히므로 고운돋움으로 쓰고, 체크 표시는 빨간 펜 SVG로 여백 칸에 긋는다.
// 줄 간격(spacing)을 "노트 줄 간격 − 실제 한 줄 높이"로 맞춰 요점이 두 줄로 넘어가도 둘째 줄이 다음 노트 줄 위에 앉는다.
type PointSet={size:number;oneLine:number;lines:Layer[];rows:number[]};
async function notePoints(points:string[],size:number,width:number,gap:number):Promise<PointSet> {
  const probe=(text:string)=>textLayer(text,{size,color:PEN,width,height:gap*3,font:STYLE_FONTS.dodum,spacing:0});
  const oneLine=(await probe("가힣")).info.height;
  const pitch=(await probe("가힣\n가힣")).info.height-oneLine;
  const lines=await Promise.all(points.map(point=>textLayer(point,{size,color:PEN,width,height:gap*4,font:STYLE_FONTS.dodum,spacing:Math.max(0,gap-pitch)})));
  const rows=lines.map(line=>1+Math.max(0,Math.round((line.info.height-oneLine)/gap)));
  return {size,oneLine,lines,rows};
}
const totalRows=(set:PointSet)=>set.rows.reduce((sum,rows)=>sum+rows,0);

export const renderDiary:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const v=index-1+(slide.variant??0);
  const layers:OverlayOptions[]=[];
  // 노트 한 장: 위 여백 50, 좌우 46, 아래는 찢어진 가장자리.
  const NX=46,NY=50,NW=1080-NX*2,NH=1350-NY-60;
  let deco=tornPaper(NX,NY,NW,NH,v);
  // 노트 줄 간격은 고운돋움 54px의 실제 줄 높이(약 79px)에 맞춘다. 요점이 줄 위에 앉고 두 줄 요점도 줄을 지킨다.
  // 마지막 장은 아래에 가게 명함을 붙이므로 줄 간격을 68로 좁혀(요점 44px) 같은 요점을 더 적은 높이에 담는다.
  const LINE_GAP=content.last&&!content.cover?68:80,RULE0=NY+150;
  for(let ly=RULE0;ly<NY+NH-40;ly+=LINE_GAP)deco+=`<path d="M${NX} ${ly}H${NX+NW}" stroke="${RULE}" stroke-width="${MIN_STROKE}" opacity=".6"/>`;
  deco+=`<path d="M${NX+110} ${NY}V${NY+NH-20}" stroke="${MARGIN_LINE}" stroke-width="2.5"/>`;
  // 링 구멍(위쪽 펀치 자국).
  for(let i=0;i<9;i++)deco+=`<circle cx="${NX+70+i*112}" cy="${NY+34}" r="11" fill="${KRAFT}"/>`;
  // 날짜 대신 장 번호를 일기 머리말로("Day 01" 같은 영문 장식 대신 한글 쪽수).
  const dayLabel=await textLayer(`${String(index).padStart(2,"0")}쪽  ·  ${content.keywords.map(word=>`#${word}`).join(" ")||STORE_NAME}`,{size:HANDWRITING_MIN_SIZE,color:RED_PEN,width:800,height:70,font:STYLE_FONTS.hand,features:"tnum"});
  layers.push({input:dayLabel.data,left:NX+130,top:NY+74});
  // 스크랩북 장식: 오른쪽 위 별 스티커, 왼쪽 아래 커피잔 자국, 노트 왼쪽 아래 모서리의 마스킹 테이프.
  deco+=sticker(1000,NY+108,22,["#FCE38A","#F4B6C2","#B9E3C6"][v%3])
    +washiTape({x:NX-30,y:NY+NH-70,width:170,height:44,angle:-38,color:TAPES[(v+2)%TAPES.length],opacity:.8});
  // 커피잔 자국은 요점 글자에 겹치지 않게 사진 장의 사진 옆 빈자리(오른쪽 가운데)에만. 사진에 가리면 그대로 둔다.
  if(!content.cover&&inputs.length){const rx=NX+NW-110,ry=NY+590;deco+=`<circle cx="${rx}" cy="${ry}" r="58" fill="none" stroke="#8B5A2B" stroke-width="14" opacity=".12"/><circle cx="${rx}" cy="${ry}" r="46" fill="none" stroke="#8B5A2B" stroke-width="3" opacity=".09"/>`;}
  let y=RULE0;
  // 체크 표시 칸(여백 선 왼쪽)이 따로 있으므로 글자는 여백 선 바로 오른쪽부터 노트 오른쪽 끝 가까이까지 쓴다.
  const TX=NX+130,TW=NW-150;
  const NOTE_BOTTOM=NY+NH-16;
  const hasPhoto=inputs.length>0;
  // 손글씨 서명은 가게 이름+쪽수만(긴 계정을 손글씨로 쓰면 줄어 읽히지 않는다). 계정은 고운돋움 26px로 따로 적는다.
  const signText=`${STORE_NAME}  ${index}/${total}`;
  const account=brandHandle();
  const handleLayer=account?await textLayer(account,{size:26,color:PEN,width:560,height:50,font:STYLE_FONTS.dodum}):null;
  // 마지막 장: 노트 아래쪽에 마스킹 테이프로 붙인 가게 명함 카드. 높이를 먼저 예약하고 요점·사진을 그 위에 맞춘다.
  const closing=content.last?await closingBlock({width:600,color:PEN,accent:RED_PEN}):null;
  const CARD_PAD=24,cardH=closing?closing.height+CARD_PAD*2:0,cardTop=NOTE_BOTTOM-28-cardH;
  // 요점 크기 사다리: 줄 간격 80이면 54→48, 마지막 장(68)이면 44→40.
  const pointSizes=LINE_GAP<80?[44,40]:[54,48];
  if(content.cover&&hasPhoto){
    // 표지: 손글씨 제목 노트(최대 3줄) 아래에 가로형 폴라로이드를 크게. 가게 서명은 폴라로이드 아래 여백 오른쪽에.
    const title=await fitText(content.headline,{sizes:[110,98,88],width:TW,maxHeight:300,color:PEN,font:STYLE_FONTS.hand,spacing:4,emphasis:emphasisOf(content,RED_PEN)});
    layers.push({input:title.data,left:TX,top:y-6});
    const deg=v%2?2.5:-2.5,PW=860,PH_MIN=360;
    // 부제: 손글씨 제목 아래 고운돋움 한 줄(노트에 덧붙인 설명처럼). 예고 띠: 노트 아래 끝에 붙인 마스킹 테이프 위 글자.
    // 사진이 최소 높이(360)도 못 받으면 예고 띠 → 부제 순으로 생략한다(넘침 금지).
    const subline=content.subline?await textLayer(content.subline,{size:34,color:PEN,width:TW,height:60,font:STYLE_FONTS.dodum}):null;
    const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:PEN,width:TW-40,height:50,font:STYLE_FONTS.dodum}):null;
    const titleBottom=y-6+title.info.height;
    const TEASER_H=teaser?teaser.info.height+30:0;
    const plan=(withSub:boolean,withTeaser:boolean)=>({withSub,withTeaser,top:titleBottom+(withSub&&subline?14+subline.info.height:0)+34,bottom:NOTE_BOTTOM-(withTeaser?TEASER_H+10:0)});
    const room=(p:ReturnType<typeof plan>)=>tiltedHeight(PW,PH_MIN,deg)<=p.bottom-p.top;
    const chosen=[plan(true,true),plan(true,false),plan(false,false)].find(room)??plan(false,false);
    if(subline&&chosen.withSub)layers.push({input:subline.data,left:TX,top:titleBottom+14});
    if(teaser&&chosen.withTeaser){
      // 테이프는 글자보다 양옆 40px 넓게, 끝은 손으로 찢은 듯 들쭉날쭉. 글자는 기울이지 않아 작은 글씨도 또렷하다.
      const tw=teaser.info.width+80,th=teaser.info.height+22,tx=Math.round(540-tw/2),ty=NOTE_BOTTOM-TEASER_H+2;
      // 오른쪽 끝은 위→아래, 왼쪽 끝은 아래→위로 톱니를 그린다.
      const right=Array.from({length:5},(_,i)=>`L${tx+tw-(i%2?0:7)} ${Math.round(ty+(th*(i+1))/5)}`).join("");
      const left=Array.from({length:5},(_,i)=>`L${tx+(i%2?0:7)} ${Math.round(ty+th-(th*(i+1))/5)}`).join("");
      deco+=`<path d="M${tx} ${ty}H${tx+tw}${right}H${tx}${left}Z" fill="${TAPES[(v+1)%TAPES.length]}" opacity=".9"/>`;
      layers.push({input:teaser.data,left:Math.round(540-teaser.info.width/2),top:ty+11});
    }
    const top=chosen.top;
    // 사진 높이는 "제목·부제 아래 ~ 예고 띠 위" 남는 높이에서 역산한다(상한 620). 폭 860은 노트 폭 안에서 기울여도 들어가는 크기.
    let PH=620;
    while(PH>PH_MIN&&tiltedHeight(PW,PH,deg)>chosen.bottom-top)PH-=4;
    const pol=await tiltedPolaroid(inputs[0],PW,PH,{leak:v%2?"left":"right",sign:signText,handle:handleLayer},deg);
    const pl=Math.round((1080-pol.info.width)/2);
    layers.push({input:pol.data,left:pl,top});
    deco+=washiTape({x:540-110,y:top-12,width:220,height:54,angle:-6,color:TAPES[v%TAPES.length],opacity:.85});
    // 폴라로이드 왼쪽 아래 모서리에 걸친 둥근 가게 도장(빨간 펜, 점선 링). 오른쪽 아래 서명과 겹치지 않는 자리.
    const sx=pl+70,sy=top+pol.info.height-POL_SHADOW-72;
    const stampDeco=`<g transform="rotate(-14 ${sx} ${sy})" opacity=".85"><circle cx="${sx}" cy="${sy}" r="64" fill="${PAPER}" stroke="${RED_PEN}" stroke-width="4"/><circle cx="${sx}" cy="${sy}" r="54" fill="none" stroke="${RED_PEN}" stroke-width="${MIN_STROKE}" stroke-dasharray="6 5"/></g>`;
    // 도장 글자는 작아서(26px) 손글씨 대신 고운돋움으로 찍는다(손글씨는 46px 이상만).
    const stampText=await textLayer("묵동\n홍어마을",{size:26,color:RED_PEN,width:120,height:80,font:STYLE_FONTS.dodum,align:"centre",spacing:0});
    const stamp=await rotated(stampText.data,-14);
    // 도장은 폴라로이드 위에 찍혀야 하므로 바탕 장식(deco)이 아니라 폴라로이드 다음 레이어로 둔다.
    layers.push(svgLayer(stampDeco),{input:stamp.data,left:Math.round(sx-stamp.info.width/2),top:Math.round(sy-stamp.info.height/2)});
  }else{
    const title=await fitText(content.headline,{sizes:[92,82,72],width:TW,maxHeight:240,color:PEN,font:STYLE_FONTS.hand,spacing:4,emphasis:emphasisOf(content,RED_PEN)});
    layers.push({input:title.data,left:TX,top:y-4});
    // 제목 아래 형광펜 줄.
    deco+=`<path d="M${TX-6} ${y+title.info.height-14}H${TX+Math.min(title.info.width,TW)+6}" stroke="#FCE38A" stroke-width="22" stroke-linecap="round" opacity=".75"/>`;
    const titleBottom=y-4+title.info.height;
    const points=content.points.slice(0,hasPhoto?3:4);
    // 요점이 앉을 수 있는 마지막 노트 줄(서명 위, 마지막 장은 명함 카드 위).
    const lastLine=RULE0+Math.floor(((closing?cardTop-30:NY+NH-120)-RULE0)/LINE_GAP)*LINE_GAP;
    let set:PointSet|null=null;
    let firstLine=0;
    if(hasPhoto){
      const shots=inputs.slice(0,2);
      const polTop=titleBottom+34;
      const degs=shots.length>1?[-5,5]:[v%2?-4:4];
      const captions=content.keywords.length?content.keywords:["한 점","한 잔"];
      // 두 장이면 오른쪽 사진을 40px 내려 엇갈리게 붙인다(자리가 모자라면 나란히).
      let stagger=0;
      if(!points.length&&shots.length===1){
        // 요점 없는 사진 장: 가로형 폴라로이드를 남는 높이에 맞춰 크게.
        const deg=degs[0],PW=Math.min(860,Math.round(1080-2*NX-80));
        let PH=620;
        while(PH>300&&tiltedHeight(PW,PH,deg)>lastLine-polTop)PH-=4;
        const pol=await tiltedPolaroid(shots[0],PW,PH,{leak:"right",caption:captions[0]},deg);
        const top=Math.round(polTop+Math.max(0,(lastLine-polTop-pol.info.height)/2));
        const left=Math.round((1080-pol.info.width)/2);
        layers.push({input:pol.data,left,top});
        deco+=washiTape({x:540-100,y:top-12,width:200,height:50,angle:-6,color:TAPES[v%TAPES.length],opacity:.85});
      }else{
        // 요점 줄 수에 따라 사진 목표 크기(1·2·3줄 → 460·400·340, 두 장이면 340·290).
        const target=shots.length>1?(points.length>2?290:340):([460,460,400,340][points.length]);
        // 두 장이 나란히 노트 폭 안에 들어가는 상한.
        const widthCap=(side:number)=>shots.length<2||tiltedWidth(side,side,5)*2-40<=1080-2*20;
        const tilt=Math.max(...degs.map(Math.abs));
        let side=0;
        // 넘치면 요점을 조용히 빼지 않는다: 글자 54→48로 먼저 양보하고, 그래도 넘치면 사진을 60px씩 줄인다(최소 220).
        for(const size of pointSizes){
          set=await notePoints(points,size,TW,LINE_GAP);
          firstLine=lastLine-(totalRows(set)-1)*LINE_GAP;
          const room=firstLine-set.oneLine-16-polTop;
          stagger=shots.length>1&&largestSquare(room-40,tilt)>=Math.min(target,260)?40:0;
          const max=largestSquare(room-stagger,tilt);
          side=target;
          while(!widthCap(side))side-=10;
          if(side<=max)break;
          if(size===pointSizes[0])continue;
          while(side>220&&side>max)side-=60;
          if(side>max)side=0;
        }
        const polBottomLimit=firstLine-(set?.oneLine??0)-16;
        // 220까지 줄여도 넘치는 아주 긴 문안: 정사각을 더 줄이면 우표만 해지므로, 노트 폭을 쓰는 가로로 긴 필름 띠로 바꿔
        // 남는 높이에 꼭 맞춘다(넘침 금지). 같은 높이에서 사진 면적이 정사각보다 몇 배 크다.
        const strip=side===0;
        const PW=strip?(shots.length>1?400:740):side;
        const stripTilt=strip?(shots.length>1?2:1.5):0;
        if(strip)stagger=0;
        let PH=side;
        if(strip){PH=320;while(PH>100&&tiltedHeight(PW,PH,stripTilt,true)>polBottomLimit-polTop)PH-=4;}
        const polH=strip?tiltedHeight(PW,PH,stripTilt,true):tiltedHeight(side,side,tilt)+stagger;
        // 사진 덩어리는 제목과 요점 사이 가운데에 둔다.
        const blockTop=Math.round(polTop+Math.max(0,(polBottomLimit-polTop-polH)/2));
        for(const [i,shot] of shots.entries()){
          const deg=strip?Math.sign(degs[i])*stripTilt:degs[i];
          const pol=await tiltedPolaroid(shot,PW,PH,{leak:i?"left":"right",caption:captions[i%captions.length],strip},deg);
          const left=shots.length>1?(i?1080-NX-pol.info.width+16:NX-6):Math.round(540-pol.info.width/2+(strip?0:v%2?-50:50));
          const top=blockTop+(i?stagger:0);
          layers.push({input:pol.data,left,top});
          deco+=washiTape({x:left+pol.info.width/2-80,y:top-12,width:160,height:46,angle:i?8:-7,color:TAPES[(v+i)%TAPES.length],opacity:.85});
        }
      }
    }else{
      y=RULE0+Math.ceil((titleBottom+16-RULE0)/LINE_GAP)*LINE_GAP;
      // 글자 장: 요점이 노트 아래까지 들어가는 가장 큰 크기(54→48).
      for(const size of pointSizes){
        set=await notePoints(points,size,TW,LINE_GAP);
        if(y+(totalRows(set)-1)*LINE_GAP+LINE_GAP<=lastLine+LINE_GAP)break;
      }
      firstLine=y+LINE_GAP;
    }
    if(set&&set.lines.length){
      // 글자 장은 남는 노트 줄을 요점 사이에 고르게 나눠(최대 2줄) 아래가 비지 않게 한다.
      const free=Math.floor((lastLine-firstLine)/LINE_GAP)+1-totalRows(set);
      const gapLines=hasPhoto||set.lines.length<2?0:Math.max(0,Math.min(2,Math.floor(free/(set.lines.length-1))));
      let line=firstLine;
      for(const [i,layer] of set.lines.entries()){
        // 글자 아랫부분이 노트 줄(line)에 닿게 놓고, 여백 칸에 빨간 펜 체크를 긋는다.
        layers.push({input:layer.data,left:TX,top:line-set.oneLine-4});
        const cx=NX+58,cy=line-Math.round(set.oneLine*.42);
        deco+=`<path d="M${cx-16} ${cy} L${cx-4} ${cy+14} L${cx+20} ${cy-20}" stroke="${RED_PEN}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        line+=(set.rows[i]+gapLines)*LINE_GAP;
      }
    }
  }
  if(closing){
    // 흰 명함 카드: 위 가장자리 양 끝을 마스킹 테이프로 고정하고, 왼쪽에 빨간 펜 별 스티커를 붙인다.
    const cw=640,cx=Math.round(540-cw/2);
    deco+=`<rect x="${cx+8}" y="${cardTop+10}" width="${cw}" height="${cardH}" fill="#000" opacity=".12"/><rect x="${cx}" y="${cardTop}" width="${cw}" height="${cardH}" fill="#FFFEFA" stroke="${RULE}" stroke-width="${MIN_STROKE}"/>`
      +washiTape({x:cx-34,y:cardTop-14,width:120,height:40,angle:-24,color:TAPES[(v+3)%TAPES.length],opacity:.85})
      +washiTape({x:cx+cw-86,y:cardTop-14,width:120,height:40,angle:24,color:TAPES[(v+1)%TAPES.length],opacity:.85})
      +sticker(cx+cw-20,cardTop+cardH-16,24,["#FCE38A","#F4B6C2","#B9E3C6"][(v+1)%3]);
    let cy=cardTop+CARD_PAD;
    layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
    cy+=18+12;
    const chipLeft=Math.round(540-closing.chip.info.width/2);
    deco+=closing.chipSvg(chipLeft,cy);
    layers.push({input:closing.chip.data,left:chipLeft,top:cy});
  }else if(!(content.cover&&hasPhoto)){
    // 오른쪽 아래 빨간 펜 서명과 쪽수(표지는 폴라로이드 여백에 쓴다).
    const sign=await textLayer(signText,{size:HANDWRITING_MIN_SIZE,color:RED_PEN,width:640,height:64,font:STYLE_FONTS.hand,align:"centre",features:"tnum"});
    layers.push({input:sign.data,left:1080-NX-40-sign.info.width,top:1350-60-sign.info.height-26});
    deco+=`<path d="M${1080-NX-60-sign.info.width} ${1350-82}q${sign.info.width/2} 18 ${sign.info.width+40} 0" fill="none" stroke="${RED_PEN}" stroke-width="3"/>`;
    if(!content.cover){
      // 넘겨 보기: 서명 밑줄 아래, 노트 오른쪽 아래 귀퉁이에 파란 펜으로 작게(페이지 모서리의 "다음 장 →" 메모처럼).
      const cue=await nextCue(PEN,26);
      const qx=1080-NX-40-cue.width,qy=1350-82+20;
      deco+=cue.arrow(qx,qy);
      layers.push({input:cue.label.data,left:qx,top:qy});
    }
    // 계정: 넘겨 보기 왼쪽(없으면 오른쪽 끝) 같은 줄.
    if(handleLayer)layers.push({input:handleLayer.data,left:1080-NX-40-(content.cover?0:150)-handleLayer.info.width,top:1350-82+20});
  }
  layers.unshift(svgLayer(deco));
  layers.push(await grainLayer({opacity:.28}));
  return sharp({create:{width:1080,height:1350,channels:3,background:KRAFT}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
