import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, finishPhoto, svgLayer, textLayer, type Font } from "../render/primitives";
import { shadowLayer, textureLayer } from "../decor";
import { STYLE_FONTS, emphasisOf, snap, type StyleContent } from "./shared";
import { MARGIN, SANS, SANS_BOLD, TITLE_SERIF, type TrackSurface, besideMark, fitLines, folioMark, footerRow, logoMark, reasonMark, saveChip, shortLines, storeCardBlock, textWidthBeside } from "./trackKit";
import type { TrackLook } from "./trackLooks";

// 사진 중심 추가 모양 2차(조사 보고서 "한식 카드뉴스 템플릿 레퍼런스" 후보 2·4·8, 2026-10-12). design.look 번호:
//   5 레트로 간판 : 위쪽 빨간 간판 띠(굵은 크림 글씨·안쪽 선), 사진 가득, 노란 별 딱지, 아래 크림 띠에 짧은 글. 을지로 뉴트로.
//   6 원형 그릇   : 주제 짙은 색 바탕에 동심원, 가운데 큰 원형 사진(위에서 찍은 접시와 잘 맞는다), 아래 가운데 제목.
//   7 먹색 액자   : 먹색 바탕, 금색 두 줄 테두리, 아치 창 사진, 명조 제목과 마름모 구분선. 시즌 특선·모임용.
//   8 경매표 꼬리표 · 9 박물관 라벨 : 아래 각 함수 설명(2차 조사 후보 1·4).
// 간판·먹색은 고정 색(주제 색과 무관한 상징색), 원형 그릇은 주제 색을 따른다. 글 양은 기본 모양과 같다(제목 + 짧은 글 한 줄).
const W=1080,H=1350,CONTENT_W=W-MARGIN*2;
const finish=(background:string,layers:OverlayOptions[])=>sharp({create:{width:W,height:H,channels:3,background}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
const centred=(layer:{info:{width:number}},cx=540)=>Math.round(cx-layer.info.width/2);
const title=(content:StyleContent,color:string,accent:string,sizes:number[],font:Font,maxLines=2,align:"left"|"centre"="centre",width=CONTENT_W)=>
  fitLines(content.headline,{sizes,width,font,color,maxLines,prefer:"size",align,spacing:size=>Math.round(size*.1),letterSpacing:size=>-size*.01,emphasis:emphasisOf(content,accent)});
const lineOf=(content:StyleContent)=>content.cover?content.subline:shortLines(content,1)[0];

// ── 5 레트로 간판 ─────────────────────────────────────────────────────────────────────
const SIGN={red:"#B8261C",cream:"#F4E6C8",navy:"#1F2F5C",yellow:"#F2C230",ink:"#1A1A1A"};
function starburst(cx:number,cy:number,R:number,points=14):string {
  let d="";
  for(let i=0;i<points*2;i++){const a=i/(points*2)*Math.PI*2-Math.PI/2,r=i%2?R*.78:R;d+=`${i?"L":"M"}${(cx+Math.cos(a)*r).toFixed(1)} ${(cy+Math.sin(a)*r).toFixed(1)}`;}
  return `<path d="${d}Z" fill="${SIGN.yellow}" stroke="${SIGN.navy}" stroke-width="4" transform="rotate(-10 ${cx} ${cy})"/>`;
}
async function signboard(photo:Buffer,content:StyleContent,index:number):Promise<Buffer> {
  // 사진이 화면의 65% 이상 되게 간판 띠·아래 띠를 글이 들어갈 만큼만 쓴다(예전 표지 최소 300px → 사진 54~60%).
  // 마지막 장은 가게 명함 대신 아래 띠에 "저장해 두고 다시 보세요" 알약 + 바닥글.
  // 이유 장: 간판 띠 안 제목 왼쪽에 남색 이유 도장(시안 B), 별 딱지에는 장 번호를 쓰지 않는다.
  const reason=content.reason?await reasonMark("stamp",content.reason,{accent:SIGN.yellow,ink:SIGN.cream,dim:SIGN.cream,stamp:SIGN.navy}):null;
  const head=await title(content,SIGN.cream,SIGN.yellow,content.cover?[88,82,76,72,68]:[68,64,60,56,52],STYLE_FONTS.comic,2,reason?"left":"centre",textWidthBeside(reason,CONTENT_W-48));
  const BAND_PAD=30;
  const bandH=Math.max(content.cover?220:170,Math.max(head.layer.info.height,reason?.height??0)+BAND_PAD*2+(content.cover?50:0));
  const line=lineOf(content);
  const sub=line?await textLayer(line,{size:42,color:SIGN.navy,width:CONTENT_W,height:4000,font:SANS_BOLD,align:"centre",spacing:10}):null;
  const chip=content.last?await saveChip(SIGN.red,SIGN.cream):null;
  const foot=await footerRow({color:SIGN.navy,cueColor:SIGN.navy,cue:!content.last});
  const bottomH=(sub?sub.info.height+22:0)+(chip?chip.height+20:0)+foot.height+48+20;
  const photoTop=bandH,photoH=H-bandH-bottomH;
  const layers:OverlayOptions[]=[{input:await finishPhoto(photo,W,photoH,{zoom:1.03}),left:0,top:photoTop}];
  let markup=`<rect x="0" y="0" width="${W}" height="${bandH}" fill="${SIGN.red}"/><rect x="18" y="18" width="${W-36}" height="${bandH-36}" rx="10" fill="none" stroke="${SIGN.cream}" stroke-width="3"/>`
    +`<rect x="0" y="${bandH}" width="${W}" height="10" fill="${SIGN.navy}"/><rect x="0" y="${H-bottomH}" width="${W}" height="${bottomH}" fill="${SIGN.cream}"/><rect x="0" y="${H-bottomH-10}" width="${W}" height="10" fill="${SIGN.navy}"/>`;
  // 간판 양 끝 둥근 전구 장식(작은 점 세 개씩).
  for(const x of [52,W-52])for(let i=0;i<3;i++)markup+=`<circle cx="${x}" cy="${bandH/2-30+i*30}" r="7" fill="${SIGN.yellow}"/>`;
  // 별 딱지: 사진 오른쪽 위. 표지는 "명물", 본문은 장 번호.
  const R=content.cover?84:64;
  const cx=W-MARGIN-R+12,cy=photoTop+R+28;
  markup+=starburst(cx,cy,R);
  layers.push(svgLayer(markup));
  const star=await textLayer(content.cover?"묵동\n명물":reason?"묵동":String(index).padStart(2,"0"),{size:content.cover?40:44,color:SIGN.navy,width:R*2,height:R*2,font:STYLE_FONTS.comic,align:"centre",spacing:2});
  layers.push({input:star.data,left:centred(star,cx),top:Math.round(cy-star.info.height/2)});
  let y=Math.round((bandH-head.layer.info.height-(content.cover?50:0))/2);
  if(content.cover){
    const eyebrow=await textLayer("— 묵동홍어마을 —",{size:40,color:SIGN.cream,width:700,height:80,font:SANS_BOLD,align:"centre",letterSpacing:4});
    layers.push({input:eyebrow.data,left:centred(eyebrow),top:y});y+=50;
  }
  if(reason){
    const row=besideMark(reason,head.layer,null);
    const placed=row.place(Math.round(540-row.width/2),Math.round((bandH-row.height)/2));
    layers.push(svgLayer(placed.svg),...placed.layers);
  }else layers.push({input:head.layer.data,left:centred(head.layer),top:y});
  let by=H-bottomH+20;
  if(sub){layers.push({input:sub.data,left:centred(sub),top:by});by+=sub.info.height+22;}
  if(chip){const cx=Math.round(540-chip.width/2);layers.push(svgLayer(chip.svg(cx,by)),{input:chip.layer.data,left:cx+chip.padX,top:by+chip.padY});by+=chip.height+20;}
  const placed=foot.place(by);layers.push(svgLayer(placed.svg),...placed.layers);
  return finish(SIGN.cream,layers);
}

// ── 6 원형 그릇 ──────────────────────────────────────────────────────────────────────
async function plate(photo:Buffer,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const panel:TrackSurface=content.last?look.light:look.dark;
  // 이유 장: 제목 왼쪽에 이유 도장(시안 B), 위 장 번호는 뺀다.
  const reason=content.reason?await reasonMark("stamp",content.reason,{accent:panel.accent,ink:panel.ink,dim:panel.dim}):null;
  const textW=textWidthBeside(reason,CONTENT_W);
  const head=await title(content,panel.ink,panel.accent,content.cover?[88,82,76,72,68]:[68,64,60,56,52],content.cover?TITLE_SERIF:SANS_BOLD,2,reason?"left":"centre",textW);
  const line=lineOf(content);
  const sub=line?await textLayer(line,{size:content.cover?44:40,color:content.cover?panel.accent:panel.dim,width:textW,height:4000,font:SANS,align:reason?"left":"centre",spacing:10}):null;
  const store=content.last?await storeCardBlock({logoSize:96,wordmark:false,surface:panel}):null;
  const foot=store?null:await footerRow({color:panel.dim,cueColor:panel.ink,ring:panel.ring,cue:!content.last});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-(store?52:MARGIN)-bottomH;
  const row=besideMark(reason,head.layer,sub,22);
  const textH=row.height;
  const topRoom=content.cover?MARGIN+110:MARGIN+64;
  const D=Math.max(480,Math.min(content.last?520:720,bottomTop-56-textH-48-topRoom));
  const cx=540,cy=topRoom+D/2;
  let markup="";
  // 동심원: 접시 둘레에 퍼지는 선(주제 강조색, 옅게).
  for(let i=1;i<=4;i++)markup+=`<circle cx="${cx}" cy="${cy}" r="${D/2+18+i*30}" fill="none" stroke="${panel.accent}" stroke-opacity="${(.5-i*.1).toFixed(2)}" stroke-width="3"/>`;
  markup+=`<circle cx="${cx}" cy="${cy}" r="${D/2+10}" fill="${panel.soft}"/>`;
  const layers:OverlayOptions[]=[svgLayer(markup),{input:await croppedPhoto(photo,D,D,D/2,{circle:true,zoom:1.06}),left:Math.round(cx-D/2),top:Math.round(cy-D/2)}];
  if(content.cover)layers.push({input:await logoMark(96,panel.ring),left:centred({info:{width:96}}),top:MARGIN-8});
  else if(!reason){const folio=await folioMark(index,panel.accent,{rule:false});layers.push({input:folio.layer.data,left:centred(folio.layer),top:MARGIN});}
  const textTop=Math.round(cy+D/2+48+Math.max(0,(bottomTop-56-(cy+D/2+48)-textH)/2));
  const copy=reason?row.place(Math.round(540-row.width/2),textTop):row.place(MARGIN,textTop,"centre");
  layers.push(svgLayer(copy.svg),...copy.layers);
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  return finish(panel.bg,layers);
}

// ── 7 먹색 액자 ──────────────────────────────────────────────────────────────────────
const INK={bg:"#16120F",gold:"#C9A35B",cream:"#F3E9DA",dim:"#D8CBB6"};
const archPath=(x:number,y:number,w:number,h:number)=>{const r=w/2;return `M${x} ${y+r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h}H${x}Z`;};
async function inkFrame(photo:Buffer,content:StyleContent,index:number):Promise<Buffer> {
  // 이유 장: 제목 왼쪽에 이유 도장(시안 B), 위 "— 02 —"는 뺀다.
  const reason=content.reason?await reasonMark("stamp",content.reason,{accent:INK.gold,ink:INK.cream,dim:INK.dim}):null;
  const head=await title(content,INK.cream,INK.gold,content.cover?[88,82,76,72,68]:[66,62,58,54,50],TITLE_SERIF,2,reason?"left":"centre",textWidthBeside(reason,CONTENT_W-48));
  const headRow=besideMark(reason,head.layer,null);
  const line=lineOf(content);
  const sub=line?await textLayer(line,{size:40,color:INK.dim,width:CONTENT_W,height:4000,font:SANS,align:"centre",spacing:10}):null;
  const surface={ink:INK.cream,dim:INK.dim,chip:INK.gold,chipInk:INK.bg};
  const store=content.last?await storeCardBlock({logoSize:96,wordmark:false,surface}):null;
  const foot=store?null:await footerRow({color:INK.dim,cueColor:INK.cream,ring:INK.cream,cue:!content.last,left:96,right:96});
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-(store?84:100)-bottomH;
  const textH=headRow.height+52+(sub?sub.info.height+26:0);
  const AW=content.last?560:720,top=content.cover?150:130;
  const AH=Math.max(460,bottomTop-48-textH-40-top);
  const ax=Math.round(540-AW/2);
  // 사진을 아치 모양으로 오린다.
  const raw=await finishPhoto(photo,AW,AH,{zoom:1.04});
  const mask=Buffer.from(`<svg width="${AW}" height="${AH}" xmlns="http://www.w3.org/2000/svg"><path d="${archPath(0,0,AW,AH)}" fill="#fff"/></svg>`);
  const arched=await sharp(raw).composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
  let markup=`<rect x="40" y="40" width="${W-80}" height="${H-80}" fill="none" stroke="${INK.gold}" stroke-width="3"/><rect x="56" y="56" width="${W-112}" height="${H-112}" fill="none" stroke="${INK.gold}" stroke-opacity=".6" stroke-width="1.5"/>`
    +`<path d="${archPath(ax-14,top-14,AW+28,AH+28)}" fill="none" stroke="${INK.gold}" stroke-width="2.5"/>`;
  const textTop=top+AH+48;
  const sepY=textTop+headRow.height+34;
  markup+=`<path d="M${540-110} ${sepY}H${540-22}M${540+22} ${sepY}H${540+110}" stroke="${INK.gold}" stroke-width="2"/><path d="M540 ${sepY-9}L549 ${sepY}L540 ${sepY+9}L531 ${sepY}Z" fill="${INK.gold}"/>`;
  const layers:OverlayOptions[]=[svgLayer(markup),{input:arched,left:ax,top}];
  if(content.cover)layers.push({input:await logoMark(92,INK.cream),left:centred({info:{width:92}}),top:top+AH-92-24});
  else if(!reason){const folio=await textLayer(`— ${String(index).padStart(2,"0")} —`,{size:40,color:INK.gold,width:300,height:70,font:SANS_BOLD,align:"centre",features:"tnum"});layers.push({input:folio.data,left:centred(folio),top:78});}
  const headPlaced=headRow.place(reason?Math.round(540-headRow.width/2):centred(head.layer),textTop);
  layers.push(svgLayer(headPlaced.svg),...headPlaced.layers);
  if(sub)layers.push({input:sub.data,left:centred(sub),top:sepY+26});
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(placed.svg),...placed.layers);}
  const texture=await textureLayer("velvet",{opacity:.18});
  return finish(INK.bg,texture?[texture,...layers]:layers);
}

// ── 8 경매표 꼬리표 ───────────────────────────────────────────────────────────────────
// 사진을 가득 깔고 오른쪽 위에 마닐라지 꼬리표(모서리 자른 오각형·구멍·끈). 꼬리표에는 장 번호와 장 키워드만 적는다
// (산지·중량·숙성일 같은 확인 안 된 사실은 적지 않는다). 수산시장 경매표 느낌으로 원물을 강조한다(2차 조사 후보 1).
const TAG={paper:"#E9D7AE",ink:"#2B2118",dim:"#5A4732",red:"#A3241F"};
async function auctionTag(photo:Buffer,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const paper=look.light;
  const store=content.last?await storeCardBlock({logoSize:96,wordmark:false,surface:paper}):null;
  const foot=await footerRow({color:"#FFFFFF",ring:paper.ring,cue:!content.last,shadow:true});
  const panelH=store?store.height+96:0;
  const photoH=H-panelH;
  // 제목·짧은 글은 아래 그늘 위 큰 흰 글씨(꼬리표 안 작은 손글씨는 50대 손님이 읽기 어려웠다).
  // 이유 장: 제목 왼쪽에 이유 도장(시안 B), 꼬리표에는 장 번호 대신 품목(키워드).
  const reason=content.reason?await reasonMark("stamp",content.reason,{accent:"#F0C66A",ink:"#FFFFFF",dim:"#FFFFFF",shadow:true}):null;
  const textW=textWidthBeside(reason,CONTENT_W);
  const head=await title(content,"#FFFFFF","#F0C66A",content.cover?[96,88,82,76,70]:[72,68,64,60,56],TITLE_SERIF,2,"left",textW);
  const line=lineOf(content);
  const sub=line?await textLayer(line,{size:content.cover?44:40,color:"#F3E9DA",width:textW,height:4000,font:SANS,spacing:10}):null;
  const footTop=store?photoH:H-MARGIN-foot.height;
  const row=besideMark(reason,head.layer,sub,20);
  const rowTop=footTop-(store?40:56)-row.height;
  const shadeFrom=Math.max(380,rowTop-240);
  const layers:OverlayOptions[]=[
    {input:await finishPhoto(photo,W,photoH,{zoom:1.03}),left:0,top:0},
    svgLayer(`<defs><linearGradient id="atB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C1310" stop-opacity="0"/><stop offset=".45" stop-color="#1C1310" stop-opacity=".62"/><stop offset="1" stop-color="#1C1310" stop-opacity=".9"/></linearGradient></defs><rect x="0" y="${shadeFrom}" width="${W}" height="${photoH-shadeFrom}" fill="url(#atB)"/>`),
  ];
  // 꼬리표: 오른쪽 위, 번호와 품목만(산지·중량·숙성일 같은 확인 안 된 사실은 적지 않는다).
  const TW=360,TX=W-MARGIN-TW+10,TY=MARGIN+20;
  const no=await textLayer(content.cover?"No. 묵동":reason?(content.keywords?.[0]??"홍어").slice(0,6):`No. ${String(index).padStart(3,"0")}`,{size:48,color:TAG.ink,width:TW-80,height:100,font:STYLE_FONTS.heavy,features:"tnum"});
  const item=await textLayer(reason?"묵동홍어마을":`품목 · ${(content.keywords?.[0]??"홍어").slice(0,6)}`,{size:40,color:TAG.dim,width:TW-80,height:80,font:SANS_BOLD});
  const TH=40+no.info.height+18+item.info.height+40;
  const cut=40;
  layers.push(svgLayer(`<path d="M${TX+cut} ${TY+cut}C${TX-30} ${TY-10} ${TX-60} ${TY-40} ${TX-120} ${TY-60}" fill="none" stroke="#F3E9DA" stroke-width="4" stroke-linecap="round"/>`
    +`<path d="M${TX+cut} ${TY}H${TX+TW}V${TY+TH}H${TX}V${TY+cut}Z" fill="${TAG.paper}" stroke="${TAG.dim}" stroke-opacity=".5" stroke-width="2"/>`
    +`<circle cx="${TX+cut}" cy="${TY+cut}" r="11" fill="#1C1310" fill-opacity=".55" stroke="${TAG.dim}" stroke-width="3"/>`
    +`<path d="M${TX+40} ${TY+40+no.info.height+8}H${TX+TW-40}" stroke="${TAG.red}" stroke-width="4"/>`));
  layers.push({input:no.data,left:TX+cut+30,top:TY+40},{input:item.data,left:TX+cut+30,top:TY+40+no.info.height+18});
  if(content.cover)layers.push({input:await logoMark(104,paper.ring),left:MARGIN,top:MARGIN});
  const copy=row.place(MARGIN,rowTop);
  layers.push(svgLayer(copy.svg),...copy.layers);
  if(store){
    const placed=store.place(540,photoH+48);
    layers.push(svgLayer(`<rect x="0" y="${photoH}" width="${W}" height="${panelH}" fill="${paper.bg}"/>`+placed.svg),...placed.layers);
  }else{
    const placed=foot.place(footTop);
    layers.push(svgLayer(placed.svg),...placed.layers);
  }
  return finish("#1C1310",layers);
}

// ── 9 박물관 라벨 ────────────────────────────────────────────────────────────────────
// 연회색 벽에 걸린 큰 액자 사진(가는 그림자), 액자 아래 오른쪽 모서리에 걸친 흰 전시 라벨: 키워드 · 제목(명조) · 짧은 글 한 줄.
// 정보 위계가 분명하고 20~30대 감성에 맞는 '전시' 느낌(2차 조사 후보 4).
// 라벨을 액자 아래에 따로 두지 않고 모서리에 걸쳐 사진이 화면의 65% 이상 되게 한다(예전 36~47%).
// 마지막 장은 가게 명함 대신 라벨 안에 "저장해 두고 다시 보세요" 알약.
const MUSEUM={wall:"#E7E4DE",label:"#FFFFFF",ink:"#22201D",dim:"#55514A",rule:"#B9B2A6"};
async function museum(photo:Buffer,content:StyleContent,index:number):Promise<Buffer> {
  const foot=await footerRow({color:MUSEUM.dim,cueColor:MUSEUM.ink,cue:!content.last});
  const LW=620,LX=W-MARGIN-LW,IN=36;
  // 이유 장: 라벨 안 제목 왼쪽에 이유 도장(시안 B), 메타 줄의 "전시 02"는 "전시"만.
  const reason=content.reason?await reasonMark("stamp",content.reason,{accent:"#8A3A1F",ink:MUSEUM.ink,dim:MUSEUM.rule}):null;
  const head=await fitLines(content.headline,{sizes:content.cover?[68,64,60,56]:[64,60,56,52],width:textWidthBeside(reason,LW-IN*2),font:TITLE_SERIF,color:MUSEUM.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.08),emphasis:emphasisOf(content,"#8A3A1F")});
  const meta=await textLayer(`${content.cover?"특별전":reason?"전시":`전시 ${String(index).padStart(2,"0")}`} · ${(content.keywords??["홍어"]).slice(0,2).join(" · ")}`,{size:40,color:MUSEUM.dim,width:LW-IN*2,height:80,font:SANS_BOLD,letterSpacing:1});
  const line=lineOf(content);
  const sub=line?await textLayer(line,{size:40,color:MUSEUM.dim,width:textWidthBeside(reason,LW-IN*2),height:4000,font:SANS,spacing:8}):null;
  const row=besideMark(reason,head.layer,sub);
  const chip=content.last?await saveChip(MUSEUM.ink,MUSEUM.label):null;
  const LH=IN+meta.info.height+14+row.height+(chip?22+chip.height:0)+IN;
  const bottomTop=H-56-foot.height;
  const labelTop=bottomTop-32-LH;
  // 액자는 라벨 높이의 55%까지 내려온다(라벨이 액자 아래 모서리에 걸친다).
  const FX=40,FY=40,FW=W-FX*2,FH=Math.max(560,Math.round(labelTop+LH*.55)-FY);
  const layers:OverlayOptions[]=[
    await shadowLayer({x:FX,y:FY+16,width:FW,height:FH,rx:2,blur:30,opacity:.28}),
    svgLayer(`<rect x="${FX-12}" y="${FY-12}" width="${FW+24}" height="${FH+24}" fill="#FAF8F4"/>`),
    {input:await finishPhoto(photo,FW,FH,{zoom:1.03}),left:FX,top:FY},
    await shadowLayer({x:LX,y:labelTop+6,width:LW,height:LH,rx:2,blur:14,opacity:.24}),
  ];
  let markup=`<rect x="${LX}" y="${labelTop}" width="${LW}" height="${LH}" fill="${MUSEUM.label}"/><path d="M${LX+IN} ${labelTop+IN+meta.info.height+6}H${LX+LW-IN}" stroke="${MUSEUM.rule}" stroke-width="1.5"/>`;
  const texts:OverlayOptions[]=[];
  let y=labelTop+IN;
  texts.push({input:meta.data,left:LX+IN,top:y});y+=meta.info.height+14;
  const copy=row.place(LX+IN,y);markup+=copy.svg;texts.push(...copy.layers);y+=row.height;
  if(chip){y+=22;markup+=chip.svg(LX+IN,y);texts.push({input:chip.layer.data,left:LX+IN+chip.padX,top:y+chip.padY});}
  const frameBottom=FY+FH+12;
  if(content.cover)texts.push({input:await logoMark(96,"#FAF8F4"),left:MARGIN,top:Math.round(frameBottom+(labelTop+LH-frameBottom-96)/2)});
  const placed=foot.place(bottomTop);
  layers.push(svgLayer(markup+placed.svg),...texts,...placed.layers);
  return finish(MUSEUM.wall,layers);
}

export function renderPhotoLookRetro(look:number,photo:Buffer,content:StyleContent,index:number,colors:TrackLook):Promise<Buffer>|null {
  if(look===8)return auctionTag(photo,content,index,colors);
  if(look===9)return museum(photo,content,index);
  if(look===5)return signboard(photo,content,index);
  if(look===6)return plate(photo,content,index,colors);
  if(look===7)return inkFrame(photo,content,index);
  return null;
}
