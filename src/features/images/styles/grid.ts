import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { brandName, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, snap } from "./shared";

// 모던 그리드(스위스 포스터·바우하우스): 흰 바탕을 굵은 검은 선으로 칸을 나누고 모든 요소를 칸에 꼭 맞춘다.
// 맨 위 가는 줄에 고정폭 꼬리표, 그 아래 왼쪽 위 칸에 아주 큰 장 번호, 그 오른쪽에 빨간 정사각 브랜드 마크("묵동"),
// 검은 선으로 두른 제목 칸, 칸을 가득 채운 사진(모서리 둥글림 없음), 번호 칸이 달린 요점 행, 바닥글 칸.
// 색은 흰·검정·빨강 하나뿐이고 장식은 선·빨간 네모·큰 숫자만 쓴다. 부위·단계·비교처럼 정리된 정보를 현대적으로 보여 줄 때 쓴다.
const PAPER="#FFFFFF",INK="#111111",RED="#E8321E";
// 선 두께. 짝수여야 선 중심 좌표 ±T/2가 정수가 되어 선끼리 어긋나지 않는다.
const T=6;
// 바깥 틀 선의 중심 좌표. 표지 글자가 인스타 격자 잘림 영역(좌우 34px) 안으로 들어가지 않도록 40에 두고 안쪽 여백을 더한다.
const X0=40,X1=1040,Y0=40,Y1=1310;
const PAD=26;                 // 칸 안쪽 여백(선 가장자리에서 글자까지)
const TAG_H=58,FOOT_H=64;     // 맨 위 꼬리표 줄·바닥글 줄의 높이(선 중심 사이)
const NUM_W=100;              // 요점 행 왼쪽 번호 칸 너비
const ROW_PAD=16;             // 요점 행 위아래 여백
const MIN_PHOTO=280;          // 사진 칸 최소 높이. 요점이 길어 이보다 작아지면 요점 수를 줄인다.

// 두 선 중심 사이의 거리. 안쪽 내용 높이에 위아래 여백과 선 두께를 더한 값이다.
const cell=(contentHeight:number,pad=PAD)=>contentHeight+pad*2+T;
const rect=(x:number,y:number,w:number,h:number,fill:string)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
// 칸을 가득 채우는 사진. 선 중심에서 선 중심까지 덮게 잘라 두고 선을 그 위에 얹으므로 사진과 선 사이에 틈이 생기지 않는다.
const photoCell=(input:Buffer,x0:number,y0:number,x1:number,y1:number):Promise<Buffer>=>sharp(input).rotate().resize(x1-x0,y1-y0,{fit:"cover",position:"attention"}).png().toBuffer();

export const renderGrid:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const shots=inputs.slice(0,2);
  // under: 선 아래 깔리는 색면(빨간 네모). over: 사진 위에 얹는 검은 선과 라벨 네모.
  let under="",over="";
  const photos:OverlayOptions[]=[],texts:OverlayOptions[]=[];
  // 선은 중심 좌표로 그린다. 가로·세로 선이 만나는 자리는 양 끝을 T/2씩 늘려 모서리가 비지 않게 한다.
  const hline=(y:number,x0=X0,x1=X1)=>{over+=rect(x0-T/2,y-T/2,x1-x0+T,T,INK);};
  const vline=(x:number,y0:number,y1:number)=>{over+=rect(x-T/2,y0-T/2,T,y1-y0+T,INK);};
  const put=(layer:Layer,left:number,top:number)=>{texts.push({input:layer.data,left,top});};
  // 선 중심 좌표로 둘러싸인 칸의 한가운데에 글자를 둔다.
  const centre=(layer:Layer,x0:number,y0:number,x1:number,y1:number)=>put(layer,(x0+x1-layer.info.width)/2,(y0+y1-layer.info.height)/2);
  const innerW=X1-X0-T-PAD*2;   // 전체 폭 칸의 글자 폭
  const left=X0+T/2+PAD;        // 전체 폭 칸의 글자 시작 x

  // ── 바깥 틀 ──
  hline(Y0);hline(Y1);vline(X0,Y0,Y1);vline(X1,Y0,Y1);

  // ── 맨 위 가는 줄: 고정폭 꼬리표 "MUKDONG HONGEO — 키워드" ──
  const yTag=Y0+TAG_H;
  hline(yTag);
  const tagWords=content.keywords.length?content.keywords.join(" · "):STORE_NAME;
  const tag=await fitText(`MUKDONG HONGEO — ${tagWords}`,{sizes:[28,26,24],width:innerW,maxHeight:36,color:INK,font:STYLE_FONTS.mono,spacing:0});
  put(tag,left,(Y0+yTag-tag.info.height)/2);

  // ── 머리 줄: 왼쪽 큰 장 번호 칸 + 오른쪽 빨간 정사각 브랜드 마크 칸(한 변 = 줄 높이) ──
  const headH=content.cover?250:200;
  const yHead=yTag+headH,xMark=X1-headH;
  hline(yHead);vline(xMark,yTag,yHead);
  under+=rect(xMark,yTag,X1-xMark,headH,RED);
  const number=await fitText(String(index).padStart(2,"0"),{sizes:content.cover?[200,180]:[170,160],width:600,maxHeight:headH-T-PAD,color:INK,font:STYLE_FONTS.gothicBlack,spacing:0});
  put(number,left-Math.round(number.info.width*.03),(yTag+yHead-number.info.height)/2);
  const mark=await textLayer("묵동",{size:content.cover?88:70,color:PAPER,width:headH,height:headH,font:STYLE_FONTS.heavy,align:"centre",spacing:0});
  centre(mark,xMark,yTag,X1,yHead);
  // 번호 칸의 남는 자리(오른쪽 아래)에는 전체 장 수만큼 작은 네모를 늘어놓고 지금 장만 빨갛게 채운다.
  // 글자 없이 선과 빨간 네모만으로 "몇 번째 장"인지 보여 주는 진행 표시다.
  const SQ=20,GAP=12,count=Math.min(total,12);
  const stripRight=xMark-T/2-PAD,stripBottom=yHead-T/2-PAD;
  for(let i=0;i<count;i++){
    const x=stripRight-(count-i)*(SQ+GAP)+GAP,y=stripBottom-SQ;
    under+=i+1===index?rect(x,y,SQ,SQ,RED):`<rect x="${x+1.5}" y="${y+1.5}" width="${SQ-3}" height="${SQ-3}" fill="none" stroke="${INK}" stroke-width="3"/>`;
  }

  // ── 제목 칸: 검은 선으로 둘러싸고 왼쪽 정렬. 표지는 아주 크게. 칸 높이는 제목 높이에 맞춘다. ──
  // (요점이 없는 글자 장만 아래에서 칸을 키우므로 선과 글자는 장 종류를 정한 뒤 그린다.)
  // 요점 없는 글자 장은 제목이 유일한 내용이라 표지만큼 크게 쓴다.
  const titleOnly=content.kind==="text"&&!content.points.length;
  const title=await fitText(content.headline,{sizes:content.cover||titleOnly?[112,100,88,78]:[72,64,58],width:innerW,maxHeight:content.cover?470:titleOnly?560:250,color:INK,font:STYLE_FONTS.gothicBlack,spacing:6});
  let yTitle=yHead+cell(title.info.height),titleTop=yHead+T/2+PAD;

  // ── 바닥글 칸: 고정폭 가게 이름 왼쪽, 장 번호 오른쪽, 오른쪽 끝에 작은 빨간 정사각 칸 ──
  const yFoot=Y1-FOOT_H,xFootMark=X1-FOOT_H;
  hline(yFoot);vline(xFootMark,yFoot,Y1);
  under+=rect(xFootMark,yFoot,X1-xFootMark,FOOT_H,RED);
  const page=await textLayer(`${index} / ${total}`,{size:26,color:INK,width:200,height:40,font:STYLE_FONTS.mono,spacing:0});
  put(page,xFootMark-T/2-PAD-page.info.width,(yFoot+Y1-page.info.height)/2);
  const brand=await fitText(brandName(),{sizes:[26,24,22],width:xFootMark-X0-page.info.width-PAD*4,maxHeight:34,color:INK,font:STYLE_FONTS.mono,spacing:0});
  put(brand,left,(yFoot+Y1-brand.info.height)/2);

  // ── 가운데: 장 종류에 따라 다르게 ──
  if(content.kind==="cover"){
    // 표지: 제목 아래 남은 칸 전체를 사진이 가득 채운다(제목이 짧을수록 사진이 커진다).
    photos.push({input:await photoCell(shots[0],X0,yTitle,X1,yFoot),left:X0,top:yTitle});
  }else if(content.kind==="text"){
    // 글자만 있는 장: 제목 아래 빨간 가로 막대 하나, 그 아래 요점 행들이 남은 높이를 고르게 나눠 꽉 채운다.
    const points=content.points.slice(0,4);
    // 요점이 하나도 없으면(드물다) 제목 칸을 바닥글까지 키워 큰 제목을 그 한가운데 두고, 바닥글 위에 두꺼운 빨간 막대만 남긴다.
    const BAR=points.length?34:110;
    if(!points.length){yTitle=yFoot-BAR;titleTop=(yHead+yTitle-title.info.height)/2;}
    under+=rect(X0,yTitle,X1-X0,BAR,RED);
    const yBar=yTitle+BAR;
    hline(yBar);
    const rowH=(yFoot-yBar)/Math.max(1,points.length);
    if(points.length)vline(X0+NUM_W,yBar,yFoot);
    for(const [i,point] of points.entries()){
      const top=Math.round(yBar+rowH*i),bottom=i===points.length-1?yFoot:Math.round(yBar+rowH*(i+1));
      if(i)hline(top);
      const label=await textLayer(String(i+1).padStart(2,"0"),{size:40,color:RED,width:NUM_W,height:60,font:STYLE_FONTS.mono,align:"centre",spacing:0});
      centre(label,X0,top,X0+NUM_W,bottom);
      const text=await fitText(point,{sizes:[60,56,52,48,46],width:X1-X0-NUM_W-T-PAD*2,maxHeight:bottom-top-T-ROW_PAD*2,color:INK,font:STYLE_FONTS.sansSemi,spacing:8});
      put(text,X0+NUM_W+T/2+PAD,(top+bottom-text.info.height)/2);
    }
  }else{
    // 사진 장: 제목 아래 사진 칸, 그 아래 요점 행(왼쪽 좁은 번호 칸 + 오른쪽 글). 행 높이는 글 높이에 맞추고
    // 사진이 남은 높이를 모두 가진다. 요점이 길면 글자를 먼저 한 단계 줄이고, 그래도 사진이 MIN_PHOTO보다 작아지면 뒤 요점부터 뺀다.
    const textW=X1-X0-NUM_W-T-PAD*2;
    let points=content.points.slice(0,4);
    const measure=(sizes:number[])=>Promise.all(points.map(point=>fitText(point,{sizes,width:textW,maxHeight:140,color:INK,font:STYLE_FONTS.sansSemi,spacing:6})));
    const rowsHeight=(list:Layer[])=>list.reduce((sum,row)=>sum+cell(Math.max(row.info.height,36),ROW_PAD),0);
    const fits=(list:Layer[])=>yFoot-rowsHeight(list)-yTitle>=MIN_PHOTO+T;
    let rows=await measure([48,46,44]);
    if(!fits(rows))rows=await measure([44,42,40]);
    while(points.length>2&&!fits(rows)){points=points.slice(0,-1);rows=rows.slice(0,-1);}
    const yRows=rows.length?yFoot-rowsHeight(rows):yFoot;
    if(rows.length)hline(yRows);
    if(shots.length>=2){
      // 사진 2장: 가운데 세로선으로 나눈 좌우 칸에 나란히. 각 칸 왼쪽 위 모서리에 빨간 정사각 "A"/"B" 라벨.
      const xMid=(X0+X1)/2;
      vline(xMid,yTitle,yRows);
      for(const [i,shot] of shots.entries()){
        const x0=i?xMid:X0,x1=i?X1:xMid;
        photos.push({input:await photoCell(shot,x0,yTitle,x1,yRows),left:x0,top:yTitle});
        const S=72,sx=x0+T/2,sy=yTitle+T/2;
        over+=rect(sx,sy,S,S,RED);
        const label=await textLayer(i?"B":"A",{size:44,color:PAPER,width:S,height:S,font:STYLE_FONTS.mono,align:"centre",spacing:0});
        centre(label,sx,sy,sx+S,sy+S);
      }
    }else{
      photos.push({input:await photoCell(shots[0],X0,yTitle,X1,yRows),left:X0,top:yTitle});
    }
    if(rows.length)vline(X0+NUM_W,yRows,yFoot);
    let y=yRows;
    for(const [i,row] of rows.entries()){
      const bottom=i===rows.length-1?yFoot:y+cell(Math.max(row.info.height,36),ROW_PAD);
      if(i)hline(y);
      const label=await textLayer(String(i+1).padStart(2,"0"),{size:40,color:RED,width:NUM_W,height:60,font:STYLE_FONTS.mono,align:"centre",spacing:0});
      centre(label,X0,y,X0+NUM_W,bottom);
      put(row,X0+NUM_W+T/2+PAD,(y+bottom-row.info.height)/2);
      y=bottom;
    }
  }

  // 제목 칸의 아래 선과 제목 글자(칸 높이가 정해진 뒤에 그린다).
  hline(yTitle);
  put(title,left,titleTop);

  const layers:OverlayOptions[]=[svgLayer(under),...photos,svgLayer(over),...texts];
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
