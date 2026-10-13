import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, svgLayer, textLayer, type Font } from "../render/primitives";
import { textureLayer } from "../decor";
import { registerDecor } from "../render/audit";
import { STYLE_FONTS, emphasisOf, snap, type StyleContent } from "./shared";
import { SANS, SANS_BOLD, countLines, fitLines, footerRow, logoMark, reasonMark, storeCardBlock, type TrackSurface } from "./trackKit";
import type { TrackLook } from "./trackLooks";

// 글 중심 추가 모양 2차(조사 보고서 1차 후보 7·10, 2차 후보 2·6, 2026-10-12). design.look 번호:
//   4 호외 신문     : 신문지 바탕, "묵동 호외" 제호와 두 줄 괘선, 큰 명조 헤드라인, 빨간 號外 딱지, 표지 사진은 흑백 망점 느낌.
//   5 공지·안내판   : 주제 밝은 바탕 위 굵은 테두리 판, 위쪽 "안내" 머리, 가운데 큰 제목, 짧은 글은 표 줄처럼.
//   6 큰 한 글자    : 제목 첫 낱말의 첫 글자를 화면 85% 크기로 한 톤 진하게 깔고(잘려도 됨), 제목·짧은 글은 왼쪽 아래.
//   7 승차권        : 크림 승차권(점선 절취선·반원 홈·바코드 줄)에 "묵동 → ○○" 노선과 제목. 예약·코스·처음 오는 손님 안내용.
// 카드에 사실(날짜·가격·산지)을 지어 넣지 않는다: 장 번호·장 제목·키워드만 쓴다. 글 양은 기본 모양과 같다(합쳐 세 줄 이내).
const W=1080,H=1350;
const finish=(background:string,layers:OverlayOptions[])=>sharp({create:{width:W,height:H,channels:3,background}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
const centred=(layer:{info:{width:number}},cx=540)=>Math.round(cx-layer.info.width/2);

// 제목 + 짧은 글(합쳐 세 줄 이내). 줄 수는 그린 결과로 센다.
async function block(content:StyleContent,options:{width:number;font:Font;color:string;dim:string;accent:string;sizes:number[];lineSize:number;align?:"left"|"centre";lineFont?:Font;maxTitle?:number}){
  const title=await fitLines(content.headline,{sizes:options.sizes,width:options.width,font:options.font,color:options.color,maxLines:options.maxTitle??2,prefer:"size",align:options.align,spacing:size=>Math.round(size*.12),letterSpacing:size=>-size*.015,emphasis:emphasisOf(content,options.accent)});
  let used=title.lines;
  const items=[{data:title.layer.data,width:title.layer.info.width,height:title.layer.info.height,top:0}];
  let y=title.layer.info.height+36;
  const lines=content.cover?(content.subline?[content.subline]:[]):content.points.slice(0,2);
  for(const text of lines){
    const font=options.lineFont??SANS;
    const layer=await textLayer(text,{size:options.lineSize,color:content.cover?options.accent:options.dim,width:options.width,height:4000,font,spacing:12,align:options.align});
    const count=await countLines(layer,options.lineSize,font,12);
    if(!content.cover&&used+count>3)break;
    used+=count;
    items.push({data:layer.data,width:layer.info.width,height:layer.info.height,top:y});
    y+=layer.info.height+20;
  }
  const last=items[items.length-1];
  return {items,height:last.top+last.height};
}

// ── 4 호외 신문 ──────────────────────────────────────────────────────────────────────
const NEWS={paper:"#EEE8DC",ink:"#1B1A17",dim:"#3D3A33",red:"#A3241F"};
async function newspaper(photo:Buffer|undefined,content:StyleContent,index:number):Promise<Buffer> {
  const M=72,CW=W-M*2;
  const layers:OverlayOptions[]=[];
  const kraft=await textureLayer("kraft",{opacity:.12});
  if(kraft)layers.push(kraft);
  const mast=await textLayer("묵동 호외",{size:96,color:NEWS.ink,width:CW,height:200,font:STYLE_FONTS.serifHeavy,align:"centre",letterSpacing:12});
  const date=await textLayer(content.reason?"묵동홍어마을 소식":`제 ${index} 면 · 묵동홍어마을 소식`,{size:30,color:NEWS.dim,width:CW,height:80,font:SANS_BOLD,align:"centre"});
  let y=M;
  layers.push({input:mast.data,left:centred(mast),top:y});
  y+=mast.info.height+18;
  let markup=`<path d="M${M} ${y}H${W-M}" stroke="${NEWS.ink}" stroke-width="5"/><path d="M${M} ${y+10}H${W-M}" stroke="${NEWS.ink}" stroke-width="1.5"/>`;
  y+=24;
  layers.push({input:date.data,left:centred(date),top:y});
  y+=date.info.height+18;
  markup+=`<path d="M${M} ${y}H${W-M}" stroke="${NEWS.ink}" stroke-width="1.5"/>`;
  y+=36;
  // 號外 딱지(빨간 상자, 왼쪽 위 기울임)
  const tag=await textLayer("號外",{size:44,color:"#FBEFE6",width:200,height:100,font:STYLE_FONTS.serifHeavy,align:"centre"});
  const surface={ink:NEWS.ink,dim:NEWS.dim,chip:NEWS.ink,chipInk:NEWS.paper};
  const store=content.last?await storeCardBlock({logoSize:180,wordmark:false,surface}):null;
  const foot=store?null:await footerRow({color:NEWS.dim,cueColor:NEWS.ink,cue:!content.last,left:M,right:M});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-64-bottomH;
  if(content.cover&&photo){
    // 신문 사진: 흑백 + 대비 살짝(망점 인쇄 느낌), 아래 한 줄 사진 설명은 부제.
    const PH=Math.min(560,bottomTop-y-380);
    const shot=await sharp(await croppedPhoto(photo,CW,PH,0,{zoom:1.04})).grayscale().linear(1.08,-8).png().toBuffer();
    layers.push({input:shot,left:M,top:y});
    markup+=`<rect x="${M}" y="${y}" width="${CW}" height="${PH}" fill="none" stroke="${NEWS.ink}" stroke-width="2"/>`;
    y+=PH+28;
  }
  const text=await block(content,{width:CW,font:STYLE_FONTS.serifHeavy,color:NEWS.ink,dim:NEWS.dim,accent:NEWS.red,sizes:content.cover?[92,86,80,74,70]:[100,94,88,82,76],lineSize:content.cover?42:50,lineFont:STYLE_FONTS.serif,maxTitle:content.cover?2:3});
  // 이유 장: 號外 딱지 대신 제목 바로 위에 큰 이유 번호(시안 A).
  const reason=content.reason?await reasonMark("numeral",content.reason,{accent:NEWS.red,ink:NEWS.dim,dim:NEWS.dim}):null;
  const markH=reason?reason.height+24:0;
  const blockTop=content.cover?y:Math.round(Math.max(y+(reason?0:70),y+(reason?0:70)+(bottomTop-60-y-(reason?0:70)-markH-text.height)/2));
  if(reason){const placed=reason.place(M,blockTop);markup+=placed.svg;layers.push(...placed.layers);}
  const top=blockTop+markH;
  if(!content.cover&&!reason){
    markup+=`<rect x="${M}" y="${y}" width="150" height="62" fill="${NEWS.red}" transform="rotate(-4 ${M+75} ${y+31})"/>`;
    layers.push(svgLayer(markup),{input:tag.data,left:M+75-Math.round(tag.info.width/2),top:y+31-Math.round(tag.info.height/2)});
    markup="";
  }
  for(const item of text.items)layers.push({input:item.data,left:M,top:top+item.top});
  // 본문 단 나눔 느낌: 글 아래 가는 괘선
  markup+=`<path d="M${M} ${bottomTop-30}H${W-M}" stroke="${NEWS.ink}" stroke-width="1.5"/>`;
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  return finish(NEWS.paper,layers);
}

// ── 5 공지·안내판 ────────────────────────────────────────────────────────────────────
async function notice(photo:Buffer|undefined,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const paper=look.light,frame=look.dark;
  const PX=70,PY=70,PW=W-PX*2,PH=H-PY*2,IN=56,CW=PW-IN*2;
  const layers:OverlayOptions[]=[];
  let markup=`<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="26" fill="${paper.bg}" stroke="${frame.bg}" stroke-width="10"/>`;
  const headH=120;
  markup+=`<path d="M${PX} ${PY+headH}H${PX+PW}" stroke="${frame.bg}" stroke-width="6"/><rect x="${PX}" y="${PY}" width="${PW}" height="${headH}" rx="26" fill="${frame.bg}"/><rect x="${PX}" y="${PY+headH-30}" width="${PW}" height="30" fill="${frame.bg}"/>`;
  const head=await textLayer(content.cover?"묵동홍어마을 안내":content.last?"알려 드려요":content.reason?"안내":`안내 ${index}`,{size:52,color:frame.ink,width:CW,height:120,font:SANS_BOLD,align:"centre",letterSpacing:4});
  layers.push(svgLayer(markup),{input:head.data,left:centred(head),top:PY+Math.round((headH-head.info.height)/2)});
  let y=PY+headH+48;
  const store=content.last?await storeCardBlock({logoSize:150,wordmark:false,surface:paper}):null;
  const foot=store?null:await footerRow({color:paper.dim,cueColor:paper.ink,cue:!content.last,left:PX+IN,right:PX+IN});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=PY+PH-48-bottomH;
  if(content.cover&&photo){
    const PH2=Math.min(520,bottomTop-y-340);
    layers.push({input:await croppedPhoto(photo,CW,PH2,18,{zoom:1.04}),left:PX+IN,top:y});
    y+=PH2+40;
  }
  const title=await fitLines(content.headline,{sizes:content.cover?[84,78,72,68,64]:[92,86,80,74,70],width:CW,font:SANS_BOLD,color:paper.ink,maxLines:2,prefer:"size",align:"centre",spacing:size=>Math.round(size*.12),letterSpacing:size=>-size*.015,emphasis:emphasisOf(content,paper.accent)});
  // 짧은 글: 표 줄처럼(위아래 가는 선 사이, 왼쪽 ● 표시).
  const rows:Array<{data:Buffer;height:number;width:number}>=[];
  const lines=content.cover?(content.subline?[content.subline]:[]):content.points.slice(0,2);
  let used=title.lines;
  for(const text of lines){
    const layer=await textLayer(content.cover?text:`● ${text}`,{size:content.cover?44:48,color:content.cover?paper.accent:paper.dim,width:CW-40,height:4000,font:SANS,spacing:12,align:"centre"});
    const count=await countLines(layer,content.cover?44:48,SANS,12);
    if(!content.cover&&used+count>3)break;
    used+=count;
    rows.push({data:layer.data,height:layer.info.height,width:layer.info.width});
  }
  const ROW=28;
  // 이유 장: 제목 바로 위 가운데에 큰 이유 번호(시안 A).
  const reason=content.reason?await reasonMark("numeral",content.reason,{accent:paper.accent,ink:paper.dim,dim:paper.dim}):null;
  const markH=reason?reason.height+24:0;
  const blockH=markH+title.layer.info.height+rows.reduce((sum,row)=>sum+row.height+ROW*2,0);
  const blockTop=content.cover?y:Math.round(Math.max(y,y+(bottomTop-40-y-blockH)/2));
  if(reason){const placed=reason.place(Math.round(540-reason.width/2),blockTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  const top=blockTop+markH;
  layers.push({input:title.layer.data,left:centred(title.layer),top});
  let ry=top+title.layer.info.height;
  let lineMarkup="";
  for(const row of rows){
    ry+=ROW;
    if(!content.cover)lineMarkup+=`<path d="M${PX+IN} ${ry-ROW/2}H${PX+PW-IN}" stroke="${paper.ink}" stroke-opacity=".18" stroke-width="2"/>`;
    layers.push({input:row.data,left:Math.round(540-row.width/2),top:ry});
    ry+=row.height+ROW;
  }
  if(rows.length&&!content.cover)lineMarkup+=`<path d="M${PX+IN} ${ry-ROW/2}H${PX+PW-IN}" stroke="${paper.ink}" stroke-opacity=".18" stroke-width="2"/>`;
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(lineMarkup+placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(lineMarkup+placed.svg),...placed.layers);}
  return finish(look.mid.bg,layers);
}

// ── 6 큰 한 글자 ─────────────────────────────────────────────────────────────────────
async function bigLetter(photo:Buffer|undefined,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const surface:TrackSurface=content.cover?look.dark:[look.light,look.mid,look.dark][(index-2+3)%3];
  const M=80,CW=W-M*2;
  const letter=[...content.headline.replace(/[^가-힣]/g,"")][0]??"홍";
  // 배경보다 한 톤 진한(밝은 바탕) 또는 밝은(짙은 바탕) 큰 글자. 글이 아니라 무늬로 읽히게 낮은 대비(soft 색).
  // 큰 글자는 읽는 글이 아니라 무늬다: 캔버스 크기 그림으로 굳혀(잘린 채) 장식으로 알린다(자동 검수가 글자로 재지 않게).
  const big=await textLayer(letter,{size:1150,color:surface.soft,width:1400,height:1600,font:STYLE_FONTS.heavy});
  const pattern=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp(big.data).png().toBuffer(),left:W-big.info.width+150,top:-120}]).png().toBuffer();
  registerDecor(pattern,"ornament");
  const layers:OverlayOptions[]=[{input:pattern,left:0,top:0}];
  const store=content.last?await storeCardBlock({logoSize:150,wordmark:false,surface}):null;
  const foot=store?null:await footerRow({color:surface.dim,cueColor:surface.ink,ring:surface.ring,cue:!content.last,left:M,right:M});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-72-bottomH;
  if(content.cover&&photo){
    const D=420;
    layers.push(svgLayer(`<circle cx="${M+D/2}" cy="${M+D/2}" r="${D/2+8}" fill="${surface.accent}"/>`),{input:await croppedPhoto(photo,D,D,D/2,{circle:true,zoom:1.06}),left:M,top:M});
  }else{
    layers.push({input:await logoMark(96,surface.ring),left:M,top:M});
  }
  const text=await block(content,{width:CW,font:STYLE_FONTS.heavy,color:surface.ink,dim:surface.dim,accent:surface.accent,sizes:content.cover?[104,96,90,84,78]:[100,94,88,82,76],lineSize:content.cover?46:52});
  const top=bottomTop-64-text.height;
  if(content.reason){
    // 이유 장: 강조 막대 대신 글 덩어리 바로 위에 큰 이유 번호(시안 A).
    const mark=await reasonMark("numeral",content.reason,{accent:surface.accent,ink:surface.dim,dim:surface.dim});
    const placed=mark.place(M,top-28-mark.height);
    layers.push(svgLayer(placed.svg),...placed.layers);
  }else{
    // 글 덩어리 바로 위 강조 막대
    layers.push(svgLayer(`<rect x="${M}" y="${top-40}" width="88" height="10" rx="5" fill="${surface.accent}"/>`));
  }
  for(const item of text.items)layers.push({input:item.data,left:M,top:top+item.top});
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  return finish(surface.bg,layers);
}

// ── 7 승차권 ─────────────────────────────────────────────────────────────────────────
async function ticket(photo:Buffer|undefined,content:StyleContent,index:number,total:number,look:TrackLook):Promise<Buffer> {
  const bg=look.dark,paper=look.light;
  const TX=60,TY=150,TW=W-TX*2,TH=content.cover?1000:880,STUB=210,R=34;
  const layers:OverlayOptions[]=[];
  // 승차권: 둥근 사각형 + 양옆 반원 홈(절취선 높이) + 점선 절취선 + 아래 바코드 줄.
  const cutY=TY+TH-STUB;
  let markup=`<path d="M${TX+24} ${TY}H${TX+TW-24}Q${TX+TW} ${TY} ${TX+TW} ${TY+24}V${cutY-R}A${R} ${R} 0 0 0 ${TX+TW} ${cutY+R}V${TY+TH-24}Q${TX+TW} ${TY+TH} ${TX+TW-24} ${TY+TH}H${TX+24}Q${TX} ${TY+TH} ${TX} ${TY+TH-24}V${cutY+R}A${R} ${R} 0 0 0 ${TX} ${cutY-R}V${TY+24}Q${TX} ${TY} ${TX+24} ${TY}Z" fill="${paper.bg}"/>`
    +`<path d="M${TX+R+16} ${cutY}H${TX+TW-R-16}" stroke="${paper.ink}" stroke-opacity=".35" stroke-width="3" stroke-dasharray="14 12"/>`;
  // 바코드 줄(장식): 굵기를 번갈아.
  for(let i=0,x=TX+TW-330;x<TX+TW-60;i++){const w=[4,8,3,6,10,4][i%6];markup+=`<rect x="${x}" y="${cutY+50}" width="${w}" height="${STUB-100}" fill="${paper.ink}" fill-opacity=".8"/>`;x+=w+6;}
  // 노선: 묵동 → (키워드 첫 낱말)
  const dest=(content.keywords?.[0]??"홍어").slice(0,6);
  const from=await textLayer("묵동",{size:76,color:paper.ink,width:400,height:150,font:STYLE_FONTS.heavy});
  const to=await textLayer(dest,{size:76,color:paper.accent,width:400,height:150,font:STYLE_FONTS.heavy});
  const label=await textLayer(content.cover?"처음 오시는 손님용":content.last?"도착 · 묵동홍어마을":content.reason?`${content.reason.n} / ${content.reason.of} 구간`:`${index-1} / ${Math.max(1,total-2)} 구간`,{size:30,color:paper.dim,width:600,height:80,font:SANS_BOLD});
  let y=TY+56;
  const PAD=64;
  layers.push(svgLayer(markup),{input:label.data,left:TX+PAD,top:y});
  y+=label.info.height+18;
  layers.push({input:from.data,left:TX+PAD,top:y},{input:to.data,left:TX+TW-PAD-to.info.width,top:y});
  // 화살표(기차 노선)
  const ay=y+Math.round(from.info.height/2);
  layers.push(svgLayer(`<path d="M${TX+PAD+from.info.width+30} ${ay}H${TX+TW-PAD-to.info.width-40}" stroke="${paper.ink}" stroke-width="4"/><path d="M${TX+TW-PAD-to.info.width-56} ${ay-14}L${TX+TW-PAD-to.info.width-36} ${ay}L${TX+TW-PAD-to.info.width-56} ${ay+14}" fill="none" stroke="${paper.ink}" stroke-width="4"/>`));
  y+=from.info.height+40;
  const CW=TW-PAD*2;
  if(content.cover&&photo){
    const PH=300;
    layers.push({input:await croppedPhoto(photo,CW,PH,16,{zoom:1.04}),left:TX+PAD,top:y});
    y+=PH+36;
  }
  const text=await block(content,{width:CW,font:SANS_BOLD,color:paper.ink,dim:paper.dim,accent:paper.accent,sizes:content.cover?[72,68,64,60,56]:[80,74,70,66,62],lineSize:content.cover?40:46});
  // 이유 장: 제목 바로 위에 큰 이유 번호(시안 A).
  const reason=content.reason?await reasonMark("numeral",content.reason,{accent:paper.accent,ink:paper.dim,dim:paper.dim}):null;
  const markH=reason?reason.height+20:0;
  const blockTop=content.cover?y:Math.round(Math.max(y,y+(cutY-40-y-markH-text.height)/2));
  if(reason){const placed=reason.place(TX+PAD,blockTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  const top=blockTop+markH;
  for(const item of text.items)layers.push({input:item.data,left:TX+PAD,top:top+item.top});
  const stubLabel=await textLayer(content.last?"좋은 여행 되세요":"다음 장으로 넘겨 주세요 ›",{size:34,color:paper.ink,width:560,height:80,font:SANS_BOLD});
  layers.push({input:stubLabel.data,left:TX+PAD,top:cutY+Math.round(STUB/2-stubLabel.info.height/2)});
  const store=content.last?await storeCardBlock({logoSize:80,wordmark:false,surface:bg}):null;
  const foot=store?null:await footerRow({color:bg.dim,cueColor:bg.ink,ring:bg.ring,cue:false,left:TX,right:TX});
  const footTop=content.last?TY+TH+28:H-56-(foot?.height??0);
  if(store){const placed=store.place(540,footTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  else{const placed=foot!.place(footTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  if(content.cover)layers.push({input:await logoMark(80,bg.ring),left:TX,top:42});
  return finish(bg.bg,layers);
}

export function renderTextLookPrint(look:number,photo:Buffer|undefined,content:StyleContent,index:number,colors:TrackLook):Promise<Buffer>|null {
  if(look===4)return newspaper(photo,content,index);
  if(look===5)return notice(photo,content,index,colors);
  if(look===6)return bigLetter(photo,content,index,colors);
  if(look===7)return ticket(photo,content,index,content.total,colors);
  return null;
}
