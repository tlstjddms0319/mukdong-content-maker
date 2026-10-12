import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, svgLayer, textLayer } from "../render/primitives";
import { shadowLayer, textureLayer } from "../decor";
import { STYLE_FONTS, brandSeal, emphasisOf, snap, type StyleContent } from "./shared";
import { countLines, fitLines, footerRow, logoMark, storeCardBlock, type TrackSurface } from "./trackKit";
import type { TrackLook } from "./trackLooks";
import { renderTextLookPrint } from "./textLooksPrint";

// 글 중심의 추가 모양(사장님 지적 2026-10-12: 게시물마다 같은 템플릿). slide.variant로 고른다(0은 textFocus.ts의 기본 모양).
//   1 메모지 : 줄 노트 종이에 손글씨(개구). 왼쪽 강조색 여백 선, 표지 사진은 테이프로 붙인 인화지처럼.
//   2 노포 메뉴판 : 나무 테 안 짙은 판에 크림 글씨(주아), "차림표" 머리띠, 줄마다 ◆ + 점선(메뉴판 줄). 표지는 둥근 사진.
//   3 한지 붓글씨 : 한지 바탕에 큰 붓글씨 제목, 오른쪽 위 세로 현판("묵동홍어마을")과 낙관, 장 번호는 一·二·三.
// (2·3은 조사 보고서 "한식 카드뉴스 템플릿 레퍼런스" 후보 1·3, 2026-10-12)
// 글 양 규칙은 기본 모양과 같다(제목 + 짧은 글 합쳐 세 줄 이내). 손글씨는 획이 굵은 개구 Bold라 휴대폰에서도 읽힌다.
const W=1080,H=1350,X=120,TEXT_W=W-X-80;
const HAND=STYLE_FONTS.chalk;
const LINE_GAP=96; // 노트 줄 간격
// 개구는 글자 사이가 넓어 낱말이 흩어져 보인다. 6% 좁혀 한 낱말로 읽히게(비교 2026-10-12).
const TIGHT=(size:number)=>-size*.06;

const finish=(background:string,layers:OverlayOptions[])=>sharp({create:{width:W,height:H,channels:3,background}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();

// 노트 줄 + 왼쪽 여백 선(강조색). 줄은 아주 옅게(글자를 방해하지 않게).
const notebook=(paper:TrackSurface,from=160)=>{
  let lines="";
  for(let y=from;y<H-40;y+=LINE_GAP)lines+=`<path d="M0 ${y}H${W}" stroke="${paper.ink}" stroke-opacity=".09" stroke-width="2"/>`;
  return lines+`<path d="M${X-36} 0V${H}" stroke="${paper.accent}" stroke-opacity=".55" stroke-width="3"/>`;
};

// 손글씨 제목(두 줄까지 가장 큰 크기) + 짧은 글(합쳐서 세 줄 이내). 줄 수는 그린 결과로 센다.
// 개구는 같은 크기에서 고딕보다 작아 보여 기본 모양(84~112px)보다 크게 쓴다.
async function handBlock(content:StyleContent,paper:TrackSurface,sizes:number[]){
  const title=await fitLines(content.headline,{sizes,width:TEXT_W,font:HAND,color:paper.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.12),letterSpacing:TIGHT,emphasis:emphasisOf(content,paper.accent)});
  let used=title.lines;
  const items:Array<{data:Buffer;top:number;height:number}>=[{data:title.layer.data,top:0,height:title.layer.info.height}];
  let y=title.layer.info.height+44;
  for(const point of content.points.slice(0,2)){
    const layer=await textLayer(point,{size:72,color:paper.dim,width:TEXT_W,height:4000,font:HAND,spacing:14,letterSpacing:TIGHT(72)});
    const lines=await countLines(layer,72,HAND,14,TIGHT(72));
    if(used+lines>3)break;
    used+=lines;
    items.push({data:layer.data,top:y,height:layer.info.height});
    y+=layer.info.height+20;
  }
  const last=items[items.length-1];
  return {items,height:last.top+last.height};
}

async function memoCover(photo:Buffer|undefined,content:StyleContent,look:TrackLook):Promise<Buffer> {
  const paper=look.light;
  const title=await fitLines(content.headline,{sizes:[104,96,90,84,78],width:TEXT_W,font:HAND,color:paper.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.08),letterSpacing:TIGHT,emphasis:emphasisOf(content,paper.accent)});
  const sub=content.subline?await textLayer(content.subline,{size:56,color:paper.accent,width:TEXT_W,height:4000,font:HAND,spacing:10,letterSpacing:TIGHT(56)}):null;
  const foot=await footerRow({color:paper.dim,cueColor:paper.ink,cue:true,left:X,right:80});
  const footTop=H-72-foot.height;
  const textH=title.layer.info.height+(sub?18+sub.info.height:0);
  const titleTop=footTop-64-textH;
  const layers:OverlayOptions[]=[svgLayer(notebook(paper))];
  if(photo){
    // 인화지 사진: 흰 테두리 + 살짝 기울임 + 위 모서리에 반투명 테이프 두 장.
    const PW=760,PH=Math.max(480,Math.min(640,titleTop-120-60)),BORDER=22;
    const shot=await croppedPhoto(photo,PW,PH,6,{zoom:1.04});
    const framed=await sharp({create:{width:PW+BORDER*2,height:PH+BORDER*2,channels:4,background:"#FFFFFF"}}).composite([{input:shot,left:BORDER,top:BORDER}]).png().toBuffer();
    const tilted=await sharp(framed).rotate(-2.5,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    const meta=await sharp(tilted).metadata();
    const left=Math.round((W-(meta.width??PW))/2),top=96;
    layers.push(await shadowLayer({x:left+10,y:top+16,width:(meta.width??PW)-20,height:(meta.height??PH)-20,rx:8,blur:22,opacity:.22}),{input:tilted,left,top});
    const tape=(x:number,y:number,rotate:number)=>`<rect x="${x}" y="${y}" width="150" height="46" rx="4" fill="${paper.accent}" fill-opacity=".35" transform="rotate(${rotate} ${x+75} ${y+23})"/>`;
    layers.push(svgLayer(tape(left+40,top-14,-8)+tape(left+(meta.width??PW)-190,top-10,7)));
  }else{
    layers.push({input:await logoMark(200),left:Math.round(540-100),top:200});
  }
  layers.push({input:title.layer.data,left:X,top:titleTop});
  if(sub)layers.push({input:sub.data,left:X,top:titleTop+title.layer.info.height+18});
  const placed=foot.place(footTop);
  layers.push(svgLayer(placed.svg),...placed.layers);
  return finish(paper.bg,layers);
}

async function memoBody(content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  // 바탕은 밝은 종이와 중간 색을 번갈아(넘길 때 색이 바뀌게), 마지막 장은 밝은 종이.
  const paper=content.last||index%2===0?look.light:look.mid;
  const block=await handBlock(content,paper,[136,128,120,112,104,96]);
  const numeral=await textLayer(`${index}.`,{size:130,color:paper.accent,width:300,height:300,font:HAND});
  const card=content.last?await storeCardBlock({logoSize:200,wordmark:false,surface:paper}):null;
  const foot=card?null:await footerRow({color:paper.dim,cueColor:paper.ink,cue:true,left:X,right:80});
  const bottomH=card?card.height:foot!.height;
  const bottomTop=H-72-bottomH;
  const groupH=numeral.info.height+24+block.height;
  const room={top:120,bottom:bottomTop-(card?80:60)};
  const top=Math.round(Math.max(room.top,room.top+(room.bottom-room.top-groupH)/2));
  const layers:OverlayOptions[]=[svgLayer(notebook(paper)),{input:numeral.data,left:X,top}];
  const textTop=top+numeral.info.height+24;
  for(const item of block.items)layers.push({input:item.data,left:X,top:textTop+item.top});
  // 제목 아래 형광펜 같은 강조 밑줄(첫 줄 아래).
  layers.push(svgLayer(`<path d="M${X} ${textTop+block.items[0].height+10}H${X+260}" stroke="${paper.accent}" stroke-opacity=".5" stroke-width="10" stroke-linecap="round"/>`));
  if(card){const placed=card.place(540,bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  return finish(paper.bg,layers);
}

// ── 2 노포 메뉴판 ─────────────────────────────────────────────────────────────────────
// 나무 테(나무결 질감) 안에 짙은 판. 글은 크림색 주아, 강조는 주제 색의 밝은 강조색(짙은 바탕 위 4.5:1 이상).
const BOARD={bg:"#2A1E17",ink:"#F5EEDF",dim:"#D9CBB4"};
const ROUND=STYLE_FONTS.round;
async function boardFrame(look:TrackLook):Promise<OverlayOptions[]> {
  const layers:OverlayOptions[]=[svgLayer(`<rect width="${W}" height="${H}" fill="#6B4A33"/>`)];
  const wood=await textureLayer("wood",{opacity:.75});
  if(wood)layers.push(wood);
  const I=44;
  layers.push(svgLayer(`<rect x="${I}" y="${I}" width="${W-I*2}" height="${H-I*2}" rx="18" fill="${BOARD.bg}"/><rect x="${I+14}" y="${I+14}" width="${W-I*2-28}" height="${H-I*2-28}" rx="12" fill="none" stroke="${look.dark.accent}" stroke-opacity=".55" stroke-width="2"/>`));
  return layers;
}
// "차림표" 머리띠: 가운데 글 + 양옆 선과 마름모.
async function boardHeader(label:string,accent:string,y:number):Promise<{layers:OverlayOptions[];height:number}> {
  const text=await textLayer(label,{size:40,color:accent,width:600,height:100,font:ROUND,align:"centre",letterSpacing:6});
  const cx=540,w=text.info.width,mid=y+text.info.height/2;
  const lines=`<path d="M${cx-w/2-150} ${mid}H${cx-w/2-30}M${cx+w/2+30} ${mid}H${cx+w/2+150}" stroke="${accent}" stroke-width="3"/>`
    +[cx-w/2-160,cx+w/2+160].map(x=>`<path d="M${x} ${mid-9}L${x+9} ${mid}L${x} ${mid+9}L${x-9} ${mid}Z" fill="${accent}"/>`).join("");
  return {layers:[svgLayer(lines),{input:text.data,left:Math.round(cx-w/2),top:y}],height:text.info.height};
}
async function menuBoard(photo:Buffer|undefined,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const accent=look.dark.accent;
  const BX=110,BW=W-BX*2;
  const layers=await boardFrame(look);
  const header=await boardHeader(content.cover?"묵동홍어마을 차림표":content.last?"오늘의 마무리":`차림표 · ${index}`,accent,110);
  layers.push(...header.layers);
  let y=110+header.height+56;
  const surface={ink:BOARD.ink,dim:BOARD.dim,chip:accent,chipInk:BOARD.bg};
  const store=content.last?await storeCardBlock({logoSize:180,wordmark:false,surface,halo:{color:"#3A2A20",pad:24}}):null;
  const foot=store?null:await footerRow({color:BOARD.dim,cueColor:BOARD.ink,ring:"#F5EEDF",cue:!content.last,left:BX,right:BX});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-96-bottomH;
  if(content.cover&&photo){
    const D=520;
    const round=await croppedPhoto(photo,D,D,D/2,{circle:true,zoom:1.05});
    layers.push(svgLayer(`<circle cx="540" cy="${y+D/2}" r="${D/2+10}" fill="none" stroke="${accent}" stroke-width="4"/>`),{input:round,left:540-D/2,top:y});
    y+=D+56;
  }
  const title=await fitLines(content.headline,{sizes:content.cover?[92,86,80,74,68]:[104,98,92,86,80],width:BW,font:ROUND,color:BOARD.ink,maxLines:2,prefer:"size",align:"centre",spacing:size=>Math.round(size*.14),emphasis:emphasisOf(content,accent)});
  const rows:Array<{data:Buffer;height:number;width:number}>=[];
  const lines=content.cover?(content.subline?[content.subline]:[]):content.points.slice(0,2);
  for(const point of lines){
    const layer=await textLayer(content.cover?point:`◆ ${point}`,{size:content.cover?48:54,color:content.cover?accent:BOARD.dim,width:BW,height:4000,font:ROUND,align:"centre",spacing:12});
    if(!content.cover&&(await countLines(layer,54,ROUND,12))>2)continue;
    rows.push({data:layer.data,height:layer.info.height,width:layer.info.width});
  }
  const ROW_GAP=34;
  const blockH=title.layer.info.height+rows.reduce((sum,row)=>sum+ROW_GAP*2+row.height,0);
  const top=content.cover?y:Math.round(Math.max(y,y+(bottomTop-56-y-blockH)/2));
  layers.push({input:title.layer.data,left:Math.round(540-title.layer.info.width/2),top});
  let ry=top+title.layer.info.height;
  let markup="";
  for(const row of rows){
    ry+=ROW_GAP;
    // 메뉴판 줄: 글 아래 점선(차림표의 "…… 가격" 리더 느낌).
    layers.push({input:row.data,left:Math.round(540-row.width/2),top:ry});
    ry+=row.height+ROW_GAP/2;
    if(!content.cover)markup+=`<path d="M${BX+40} ${ry}H${W-BX-40}" stroke="${BOARD.dim}" stroke-opacity=".5" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`;
    ry+=ROW_GAP/2;
  }
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  return finish(BOARD.bg,layers);
}

// ── 3 한지 붓글씨 + 세로 현판 ──────────────────────────────────────────────────────────
// 한지 바탕(질감) 위 왼쪽에 큰 붓글씨 제목, 오른쪽 위에 짙은 세로 현판(가게 이름 세로쓰기)과 붉은 낙관.
// 장 번호는 붓글씨 한자 숫자(一·二·三). 짧은 글은 명조. 가게 철학·숙성 이야기처럼 격을 주고 싶은 글용.
const HANJI={bg:"#F1E7D3",ink:"#1D1A16",dim:"#4E4438",seal:"#B3261E",panel:"#2A1E17",panelInk:"#F3E9DA"};
const HANJA=["一","二","三","四","五","六","七","八","九","十"];
async function hanjiCard(photo:Buffer|undefined,content:StyleContent,index:number):Promise<Buffer> {
  const layers:OverlayOptions[]=[];
  const paper=await textureLayer("hanji",{opacity:.35});
  if(paper)layers.push(paper);
  const M=88,PANEL_W=112,LEFT_W=W-M*2-PANEL_W-48;
  // 세로 현판
  const chars=await Promise.all([..."묵동홍어마을"].map(ch=>textLayer(ch,{size:58,color:HANJI.panelInk,width:PANEL_W,height:90,font:STYLE_FONTS.serifHeavy,align:"centre"})));
  const panelH=chars.reduce((sum,ch)=>sum+ch.info.height+10,0)+56;
  const px=W-M-PANEL_W;
  layers.push(svgLayer(`<rect x="${px}" y="${M}" width="${PANEL_W}" height="${panelH}" rx="6" fill="${HANJI.panel}"/><rect x="${px+8}" y="${M+8}" width="${PANEL_W-16}" height="${panelH-16}" rx="4" fill="none" stroke="#C9A35B" stroke-opacity=".7" stroke-width="2"/>`));
  let cy=M+28;
  for(const ch of chars){layers.push({input:ch.data,left:Math.round(px+PANEL_W/2-ch.info.width/2),top:cy});cy+=ch.info.height+10;}
  const SEAL=96;
  const seal=await brandSeal(SEAL,index*7+3,{on:"light"});
  layers.push(svgLayer(seal.svg(px+8,M+panelH+28)),{input:seal.text.data,left:px+8+Math.round((SEAL-seal.text.info.width)/2),top:M+panelH+28+Math.round((SEAL-seal.text.info.height)/2)});
  const store=content.last?await storeCardBlock({logoSize:200,wordmark:false,surface:{ink:HANJI.ink,dim:HANJI.dim,chip:HANJI.panel,chipInk:HANJI.panelInk}}):null;
  const foot=store?null:await footerRow({color:HANJI.dim,cueColor:HANJI.ink,cue:!content.last,left:M,right:M});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-80-bottomH;
  let y=M;
  if(content.cover&&photo){
    const PH=Math.min(700,bottomTop-M-420);
    layers.push(await shadowLayer({x:M,y:M+10,width:LEFT_W,height:PH,rx:12,blur:20,opacity:.16}),{input:await croppedPhoto(photo,LEFT_W,PH,12,{zoom:1.04}),left:M,top:M});
    y=M+PH+56;
  }else if(!content.cover){
    // 나눔붓글씨에는 한자가 없어 다른 글꼴로 대신 찍힌다(四가 어색했다). 한자가 있는 나눔명조 굵은체로 쓴다.
    const num=await textLayer(HANJA[(index-1)%HANJA.length],{size:120,color:HANJI.seal,width:300,height:240,font:STYLE_FONTS.serifHeavy});
    layers.push({input:num.data,left:M,top:M});
    y=M+num.info.height+24;
  }
  const title=await fitLines(content.headline,{sizes:content.cover?[128,120,112,104,96]:[140,130,120,112,104],width:LEFT_W,font:STYLE_FONTS.brush,color:HANJI.ink,maxLines:content.cover?2:3,prefer:"size",spacing:size=>Math.round(size*.02),emphasis:emphasisOf(content,HANJI.seal)});
  const lines=content.cover?(content.subline?[content.subline]:[]):content.points.slice(0,1);
  const subs=await Promise.all(lines.map(text=>textLayer(text,{size:content.cover?46:48,color:content.cover?HANJI.seal:HANJI.dim,width:LEFT_W,height:4000,font:STYLE_FONTS.serif,spacing:12})));
  const blockH=title.layer.info.height+subs.reduce((sum,sub)=>sum+28+sub.info.height,0);
  const top=content.cover?y:Math.round(Math.max(y,y+(bottomTop-60-y-blockH)/2));
  layers.push({input:title.layer.data,left:M,top});
  let sy=top+title.layer.info.height;
  for(const sub of subs){sy+=28;layers.push({input:sub.data,left:M,top:sy});sy+=sub.info.height;}
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  return finish(HANJI.bg,layers);
}

export function renderTextLook(look:number,photo:Buffer|undefined,content:StyleContent,index:number,colors:TrackLook):Promise<Buffer>|null {
  if(look>=4)return renderTextLookPrint(look,photo,content,index,colors);
  if(look===1)return content.cover?memoCover(photo,content,colors):memoBody(content,index,colors);
  if(look===2)return menuBoard(photo,content,index,colors);
  if(look===3)return hanjiCard(photo,content,index);
  return null;
}
