import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { brandName, finishPhoto, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { STYLE_FONTS, brandSeal, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";

// 모던 그리드(스위스 포스터·바우하우스): 흰 바탕을 굵은 검은 선으로 칸을 나누고 모든 요소를 칸에 꼭 맞춘다.
// 맨 위 가는 줄에 고정폭 꼬리표, 그 아래 왼쪽 위 칸에 아주 큰 장 번호, 그 오른쪽 정사각 칸에 가게 낙관(brandSeal, 모든 계열 공통),
// 검은 선으로 두른 제목 칸, 칸을 가득 채운 사진(모서리 둥글림 없음), 번호 칸이 달린 요점 행, 바닥글 칸.
// 표지는 바닥글 위에 예고 행 하나, 마지막 장은 바닥글 위에 가게 명함 칸 하나를 더 둔다(같은 선·칸 문법).
// 색은 흰·검정·빨강 하나뿐이고 장식은 선·빨간 네모·큰 숫자만 쓴다. 부위·단계·비교처럼 정리된 정보를 현대적으로 보여 줄 때 쓴다.
const PAPER="#FFFFFF",INK="#111111",RED="#E8321E";
// 명함 "저장" 칩 바탕: 바탕 빨강(#E8321E)은 흰 28px 글자와 대비가 4:1에 겨우 걸려 한 단계 진한 빨강을 쓴다.
const CHIP_RED="#C42416";
// 선 두께. 짝수여야 선 중심 좌표 ±T/2가 정수가 되어 선끼리 어긋나지 않는다.
const T=6;
// 바깥 틀 선의 중심 좌표. 표지 글자가 인스타 격자 잘림 영역(좌우 34px) 안으로 들어가지 않도록 40에 두고 안쪽 여백을 더한다.
const X0=40,X1=1040,Y0=40,Y1=1310;
const PAD=26;                 // 칸 안쪽 여백(선 가장자리에서 글자까지)
const TAG_H=58,FOOT_H=64;     // 맨 위 꼬리표 줄·바닥글 줄의 높이(선 중심 사이)
const NUM_W=100;              // 요점 행 왼쪽 번호 칸 너비
const ROW_PAD=16;             // 요점 행 위아래 여백
const MIN_PHOTO=500;          // 사진 장의 사진 칸 최소 높이. 요점이 길어 이보다 작아지면 뒤 요점부터 1개까지 뺀다(음식이 주인공).
// 표지 사진 칸의 최소 높이: 캔버스 넓이의 45% 이상을 사진이 차지하게 한다(폭 X1-X0 기준으로 역산).
const MIN_COVER_PHOTO=Math.ceil(1080*1350*.45/(X1-X0));
// 표지 머리 줄(장 번호·브랜드 마크) 높이 후보. 제목이 길어 사진 45%를 지키기 어려우면 제목 글자보다 머리 줄을 먼저 줄인다.
const COVER_HEADS=[250,210,170];
const COVER_TITLE_SIZES=[112,100,88,80];

// 두 선 중심 사이의 거리. 안쪽 내용 높이에 위아래 여백과 선 두께를 더한 값이다.
const cell=(contentHeight:number,pad=PAD)=>contentHeight+pad*2+T;
const rect=(x:number,y:number,w:number,h:number,fill:string)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
// 칸을 가득 채우는 사진. 선 중심에서 선 중심까지 덮게 잘라 두고 선을 그 위에 얹으므로 사진과 선 사이에 틈이 생기지 않는다.
const photoCell=(input:Buffer,x0:number,y0:number,x1:number,y1:number):Promise<Buffer>=>finishPhoto(input,x1-x0,y1-y0);

// 표지 머리 줄 높이와 제목 크기 고르기. 사진 칸(MIN_COVER_PHOTO)을 먼저 떼고 남는 높이가 제목 칸이다.
// 머리 줄이 큰 것부터 보며 제목이 88px 이상으로 들어가면 그 조합을, 끝까지 안 되면 80px로 들어가는 가장 큰 머리 줄을 쓴다.
// 남는 높이(최대 약 260px)가 80px 네 줄보다 낮으므로 제목은 저절로 3줄 이하가 된다.
// 측정은 높이 4000의 글자 레이어로만 한다(fitText를 여러 번 부르면 외톨이 메모가 중복으로 남는다).
// extra: 제목 칸 안에서 제목 아래에 붙는 부제 높이(간격 포함). 제목이 쓸 수 있는 높이에서 뺀다.
async function coverLayout(headline:string,width:number,yTag:number,yFoot:number,extra=0):Promise<{headH:number;size:number;maxHeight:number}> {
  const heights=new Map<number,number>();
  const heightAt=async(size:number)=>{
    if(!heights.has(size))heights.set(size,(await textLayer(headline,{size,color:INK,width,height:4000,font:STYLE_FONTS.gothicBlack,spacing:6})).info.height);
    return heights.get(size)!;
  };
  const smallest=COVER_TITLE_SIZES[COVER_TITLE_SIZES.length-1];
  let fallback:{headH:number;size:number;maxHeight:number}|null=null;
  for(const headH of COVER_HEADS){
    const maxHeight=yFoot-MIN_COVER_PHOTO-(yTag+headH)-T-PAD*2-extra;
    for(const size of COVER_TITLE_SIZES){
      if(await heightAt(size)>maxHeight)continue;
      if(size>=88)return {headH,size,maxHeight};
      // 80px로만 들어가면 일단 기억해 두고(머리 줄이 큰 쪽을 우선), 더 작은 머리 줄에서 88px 이상이 되는지 본다.
      fallback??={headH,size,maxHeight};
      break;
    }
  }
  if(fallback)return fallback;
  // 아주 긴 제목: 80px로도 안 들어가면 그림째 줄이는 대신 사진 칸을 조금 양보한다(몰래 축소 금지).
  const headH=COVER_HEADS[COVER_HEADS.length-1];
  return {headH,size:smallest,maxHeight:await heightAt(smallest)};
}

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

  // ── 맨 위 가는 줄: 고정폭 꼬리표 "묵동홍어마을 — 키워드"(영문 장식 대신 한글) ──
  const yTag=Y0+TAG_H;
  hline(yTag);
  const tag=await fitText(content.keywords.length?`${STORE_NAME} — ${content.keywords.join(" · ")}`:STORE_NAME,{sizes:[28,26],width:innerW,maxHeight:40,color:INK,font:STYLE_FONTS.mono,spacing:0});
  put(tag,left,(Y0+yTag-tag.info.height)/2);

  // ── 바닥글 위에 붙는 칸: 표지는 예고 행, 마지막 장은 가게 명함 칸. 높이를 먼저 정해 사진·요점이 쓸 바닥(yBottom)을 올린다. ──
  const yFoot=Y1-FOOT_H;
  const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:INK,width:X1-X0-NUM_W-T-PAD*2,height:60,font:STYLE_FONTS.sansSemi,spacing:0}):null;
  const closing=content.last?await closingBlock({width:innerW,color:INK,accent:CHIP_RED,font:STYLE_FONTS.gothicBlack}):null;
  const extraH=teaser?cell(Math.max(teaser.info.height,36),ROW_PAD):closing?cell(closing.height,22):0;
  const yBottom=yFoot-extraH;
  const subline=content.subline?await textLayer(content.subline,{size:34,color:INK,width:innerW,height:110,font:STYLE_FONTS.sansSemi}):null;

  // ── 머리 줄: 왼쪽 큰 장 번호 칸 + 오른쪽 빨간 정사각 브랜드 마크 칸(한 변 = 줄 높이) ──
  // 표지: 사진 45%를 지키면서 제목이 들어가는 가장 큰 머리 줄과 제목 크기를 고른다(아래 coverLayout).
  const coverPick=content.cover?await coverLayout(content.headline,innerW,yTag,yBottom,subline?subline.info.height+14:0):null;
  const headH=coverPick?coverPick.headH:200;
  const yHead=yTag+headH,xMark=X1-headH;
  hline(yHead);vline(xMark,yTag,yHead);
  const number=await fitText(String(index).padStart(2,"0"),{sizes:content.cover?[200,180,160,150,140,130]:[170,160],width:600,maxHeight:headH-T-PAD,color:INK,font:STYLE_FONTS.gothicBlack,spacing:0});
  put(number,left-Math.round(number.info.width*.03),(yTag+yHead-number.info.height)/2);
  // 가게 낙관: 예전 빨간 정사각 마크 자리(머리 줄 오른쪽 칸)에 칸보다 조금 작게 똑바로(격자라 기울이지 않는다) 찍는다.
  // 낙관 테두리가 거칠게 번지므로 선과 닿지 않게 사방 여백을 둔다. 글자 크기는 낙관 한 변에 비례한다.
  const sealSize=headH-T-28,sx=xMark+T/2+14,sy=yTag+T/2+14;
  const seal=await brandSeal(sealSize,index*7+3,{rotate:0});
  under+=seal.svg(sx,sy);
  centre(seal.text,sx,sy,sx+sealSize,sy+sealSize);
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
  const emphasis=emphasisOf(content,RED);
  const title=coverPick
    ?await fitText(content.headline,{sizes:COVER_TITLE_SIZES.filter(size=>size<=coverPick.size),width:innerW,maxHeight:coverPick.maxHeight,color:INK,font:STYLE_FONTS.gothicBlack,spacing:6,emphasis})
    :await fitText(content.headline,{sizes:titleOnly?[112,100,88,78]:closing?[64,58,52]:[72,64,58],width:innerW,maxHeight:titleOnly?560:250,color:INK,font:STYLE_FONTS.gothicBlack,spacing:6,emphasis});
  // 표지 부제는 제목 칸 안, 제목 바로 아래에 둔다.
  const subH=coverPick&&subline?subline.info.height+14:0;
  let yTitle=yHead+cell(title.info.height+subH),titleTop=yHead+T/2+PAD;

  // ── 바닥글 칸: 고정폭 가게 이름 왼쪽, 장 번호 오른쪽, 오른쪽 끝에 작은 빨간 정사각 칸 ──
  // 가운데 장은 장 번호 자리에 "넘겨 보기"를 둔다(장 번호는 머리 줄의 큰 숫자와 진행 네모가 이미 보여 준다).
  // 마지막 장은 명함 칸에 계정이 있으므로 바닥글에는 가게 이름만.
  const xFootMark=X1-FOOT_H;
  hline(yFoot);vline(xFootMark,yFoot,Y1);
  under+=rect(xFootMark,yFoot,X1-xFootMark,FOOT_H,RED);
  const pageRight=xFootMark-T/2-PAD;
  let pageW=0;
  if(!content.cover&&!content.last){
    const cue=await nextCue(RED,26);
    const cx=pageRight-cue.width,cy=Math.round((yFoot+Y1-cue.height)/2);
    put(cue.label,cx,cy);over+=cue.arrow(cx,cy);
    pageW=cue.width;
  }else{
    const page=await textLayer(`${index} / ${total}`,{size:26,color:INK,width:200,height:40,font:STYLE_FONTS.mono,spacing:0,features:"tnum"});
    put(page,pageRight-page.info.width,(yFoot+Y1-page.info.height)/2);
    pageW=page.info.width;
  }
  const brand=await textLayer(content.last?STORE_NAME:brandName(),{size:26,color:INK,width:Math.max(200,pageRight-pageW-24-left),height:44,font:STYLE_FONTS.mono,spacing:0});
  put(brand,left,(yFoot+Y1-brand.info.height)/2);
  // 바닥글 위 칸(표지 예고 행·마지막 장 명함 칸).
  if(extraH){
    hline(yBottom);
    if(teaser){
      // 예고 행: 요점 행과 같은 모양(왼쪽 좁은 칸에 빨간 "다음", 오른쪽에 글).
      vline(X0+NUM_W,yBottom,yFoot);
      const label=await textLayer("다음",{size:28,color:RED,width:NUM_W,height:50,font:STYLE_FONTS.mono,align:"centre",spacing:0});
      centre(label,X0,yBottom,X0+NUM_W,yFoot);
      put(teaser,X0+NUM_W+T/2+PAD,(yBottom+yFoot-teaser.info.height)/2);
    }else if(closing){
      // 명함 칸: 가운데 정렬로 가게 이름·계정·저장 칩.
      let cy=yBottom+T/2+22;
      centre(closing.wordmark,X0,cy,X1,cy+closing.wordmark.info.height);
      cy+=closing.wordmark.info.height;
      if(closing.handle){cy+=8;centre(closing.handle,X0,cy,X1,cy+closing.handle.info.height);cy+=closing.handle.info.height;}
      cy+=30;
      const chipX=Math.round(540-closing.chip.info.width/2);
      over+=closing.chipSvg(chipX,cy);
      put(closing.chip,chipX,cy);
    }
  }

  // ── 가운데: 장 종류에 따라 다르게 ──
  if(content.kind==="cover"){
    // 표지: 제목 아래 남은 칸 전체를 사진이 가득 채운다(제목이 짧을수록 사진이 커진다).
    photos.push({input:await photoCell(shots[0],X0,yTitle,X1,yBottom),left:X0,top:yTitle});
  }else if(content.kind==="text"){
    // 글자만 있는 장: 제목 아래 빨간 가로 막대 하나, 그 아래 요점 행들이 남은 높이를 고르게 나눠 꽉 채운다.
    const points=content.points.slice(0,4);
    // 요점이 하나도 없으면(드물다) 제목 칸을 바닥글까지 키워 큰 제목을 그 한가운데 두고, 바닥글 위에 두꺼운 빨간 막대만 남긴다.
    const BAR=points.length?34:110;
    if(!points.length){yTitle=yBottom-BAR;titleTop=(yHead+yTitle-title.info.height)/2;}
    under+=rect(X0,yTitle,X1-X0,BAR,RED);
    const yBar=yTitle+BAR;
    hline(yBar);
    const rowH=(yBottom-yBar)/Math.max(1,points.length);
    if(points.length)vline(X0+NUM_W,yBar,yBottom);
    for(const [i,point] of points.entries()){
      const top=Math.round(yBar+rowH*i),bottom=i===points.length-1?yBottom:Math.round(yBar+rowH*(i+1));
      if(i)hline(top);
      const label=await textLayer(String(i+1).padStart(2,"0"),{size:40,color:RED,width:NUM_W,height:60,font:STYLE_FONTS.mono,align:"centre",spacing:0});
      centre(label,X0,top,X0+NUM_W,bottom);
      // 마지막 장은 명함 칸만큼 행이 낮아지므로 더 작은 크기(42·38)까지 내려 본다(그림째 줄이지 않게).
      const text=await fitText(point,{sizes:closing?[56,52,48,44,40,38]:[60,56,52,48,46],width:X1-X0-NUM_W-T-PAD*2,maxHeight:bottom-top-T-ROW_PAD*2,color:INK,font:STYLE_FONTS.sansSemi,spacing:8});
      put(text,X0+NUM_W+T/2+PAD,(top+bottom-text.info.height)/2);
    }
  }else{
    // 사진 장: 제목 아래 사진 칸, 그 아래 요점 행(왼쪽 좁은 번호 칸 + 오른쪽 글). 행 높이는 글 높이에 맞추고
    // 사진이 남은 높이를 모두 가진다. 요점이 길면 글자를 먼저 한 단계 줄이고, 그래도 사진이 MIN_PHOTO보다 작아지면 뒤 요점부터 1개까지 뺀다.
    const textW=X1-X0-NUM_W-T-PAD*2;
    let points=content.points.slice(0,4);
    const measure=(sizes:number[])=>Promise.all(points.map(point=>fitText(point,{sizes,width:textW,maxHeight:140,color:INK,font:STYLE_FONTS.sansSemi,spacing:6})));
    const rowsHeight=(list:Layer[])=>list.reduce((sum,row)=>sum+cell(Math.max(row.info.height,36),ROW_PAD),0);
    // 마지막 장은 명함 칸이 들어가므로 제목을 한 단계 작게 쓰고(위 64px부터) 사진 최소 높이를 낮추며(300),
    // 요점을 빼기 전에 글자를 한 단계 더(40·38·36) 줄인다.
    const minPhoto=closing?300:MIN_PHOTO;
    const fits=(list:Layer[])=>yBottom-rowsHeight(list)-yTitle>=minPhoto+T;
    let rows=await measure([48,46,44]);
    if(!fits(rows))rows=await measure([44,42,40]);
    if(closing&&!fits(rows))rows=await measure([40,38,36]);
    while(points.length>1&&!fits(rows)){points=points.slice(0,-1);rows=rows.slice(0,-1);}
    const yRows=rows.length?yBottom-rowsHeight(rows):yBottom;
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
    if(rows.length)vline(X0+NUM_W,yRows,yBottom);
    let y=yRows;
    for(const [i,row] of rows.entries()){
      const bottom=i===rows.length-1?yBottom:y+cell(Math.max(row.info.height,36),ROW_PAD);
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
  if(subH&&subline)put(subline,left,titleTop+title.info.height+14);

  const layers:OverlayOptions[]=[svgLayer(under),...photos,svgLayer(over),...texts];
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
