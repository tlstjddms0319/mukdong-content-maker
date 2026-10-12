import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, finishPhoto, svgLayer, textLayer } from "../render/primitives";
import { shadowLayer, textureLayer } from "../decor";
import { emphasisOf, snap, type StyleContent } from "./shared";
import { MARGIN, SANS, SANS_BOLD, TITLE_SERIF, type TrackSurface, fitLines, folioMark, footerRow, logoMark, shortLines, storeCardBlock } from "./trackKit";
import type { TrackLook } from "./trackLooks";
import { renderPhotoLookRetro } from "./photoLooksRetro";

// 사진 중심의 추가 모양(사장님 지적 2026-10-12: 게시물마다 같은 템플릿). slide.variant로 고른다(0은 photoFocus.ts의 기본 모양).
//   1 매거진 : 표지는 종이 위쪽에 큰 명조 제목, 아래로 사진이 화면 끝까지. 본문은 위쪽 사진(가장자리까지) + 아래 종이에 글.
//   2 반반   : 사진과 주제 색 판을 위아래로 나눈다. 본문은 장마다 사진 위/아래를 바꿔 넘길 때 리듬이 생기게.
//   3 숙성 라벨·도장 : 꽉 찬 사진 + 인주색 둥근 도장(키워드·가게 이름), 본문은 No.02 꼬리표.
//   4 삼합 순서 카드 : 큰 원 번호 + 제목, 둥근 사진, 진행 점. 먹는 순서처럼 단계가 있는 이야기용.
// (3·4는 조사 보고서 "한식 카드뉴스 템플릿 레퍼런스" 후보 5·6, 2026-10-12)
// 색은 구성안 색 조합(trackLooks)을 따르고, 글 양·글자 크기는 기본 모양과 같은 규칙(제목 한 줄 + 짧은 글 한 줄).
const W=1080,H=1350;
const CONTENT_W=W-MARGIN*2;

const titleOf=(content:StyleContent,color:string,accent:string,sizes:number[],font=TITLE_SERIF,maxLines=2)=>
  fitLines(content.headline,{sizes,width:CONTENT_W,font,color,maxLines,prefer:sizes[0]>=90?"size":"lines",spacing:size=>Math.round(size*.06),letterSpacing:size=>-size*.012,emphasis:emphasisOf(content,accent)});
const lineOf=(text:string,color:string,size=40)=>textLayer(text,{size,color,width:CONTENT_W,height:4000,font:SANS,spacing:10});

const finish=(background:string,layers:OverlayOptions[])=>sharp({create:{width:W,height:H,channels:3,background}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();

// ── 1 매거진 ──────────────────────────────────────────────────────────────────────────
async function magazineCover(photo:Buffer,content:StyleContent,look:TrackLook):Promise<Buffer> {
  const paper=look.light;
  const LOGO=96,TOP=MARGIN;
  const title=await titleOf(content,paper.ink,paper.accent,[100,92,86,80,74]);
  const sub=content.subline?await lineOf(content.subline,paper.dim,44):null;
  const titleTop=TOP+LOGO+44;
  const textBottom=titleTop+title.layer.info.height+(sub?22+sub.info.height:0);
  const photoTop=Math.min(760,textBottom+56);
  const shot=await finishPhoto(photo,W,H-photoTop,{zoom:1.04});
  const foot=await footerRow({color:"#FFFFFF",ring:paper.ring,cue:true,shadow:true});
  const footTop=H-MARGIN-foot.height;
  const placed=foot.place(footTop);
  const shade=`<defs><linearGradient id="pmB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C1310" stop-opacity="0"/><stop offset="1" stop-color="#1C1310" stop-opacity=".7"/></linearGradient></defs><rect x="0" y="${footTop-120}" width="${W}" height="${H-footTop+120}" fill="url(#pmB)"/>`;
  const layers:OverlayOptions[]=[];
  const texture=await textureLayer("linen",{opacity:.2});
  if(texture)layers.push(texture);
  layers.push(
    {input:await logoMark(LOGO,paper.ring),left:MARGIN,top:TOP},
    {input:title.layer.data,left:MARGIN,top:titleTop},
    ...(sub?[{input:sub.data,left:MARGIN,top:titleTop+title.layer.info.height+22}]:[]),
    {input:shot,left:0,top:photoTop},
    svgLayer(`<rect x="${MARGIN}" y="${photoTop-6}" width="120" height="12" rx="6" fill="${paper.accent}"/>`+shade+placed.svg),
    ...placed.layers,
  );
  return finish(paper.bg,layers);
}

async function magazineBody(photo:Buffer,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const paper=look.light;
  const title=await titleOf(content,paper.ink,paper.accent,[68,64,60,56,52]);
  const line=shortLines(content,1)[0];
  const sub=line?await lineOf(line,paper.dim):null;
  const folio=await folioMark(index,paper.accent);
  const card=content.last?await storeCardBlock({logoSize:110,wordmark:true,surface:paper}):null;
  const foot=card?null:await footerRow({color:paper.dim,cueColor:paper.ink,cue:true});
  const bottomH=card?card.height:foot!.height;
  const bottomTop=H-(card?52:MARGIN)-bottomH;
  const subTop=bottomTop-(card?40:56)-(sub?.info.height??0);
  const titleTop=(sub?subTop-20:bottomTop-56)-title.layer.info.height;
  const folioTop=titleTop-24-folio.layer.info.height;
  const photoH=Math.max(480,folioTop-48);
  const shot=await finishPhoto(photo,W,photoH,{zoom:1.03});
  const layers:OverlayOptions[]=[];
  const texture=await textureLayer("linen",{opacity:.2});
  if(texture)layers.push(texture);
  layers.push({input:shot,left:0,top:0},{input:folio.layer.data,left:MARGIN,top:folioTop},{input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  let markup=`<rect x="0" y="${photoH}" width="${W}" height="8" fill="${paper.accent}"/>`+folio.svg(MARGIN,folioTop);
  if(card){const placed=card.place(540,bottomTop);markup+=placed.svg;layers.push(svgLayer(markup),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  return finish(paper.bg,layers);
}

// ── 2 반반 ────────────────────────────────────────────────────────────────────────────
// photoTop: 사진이 위쪽이면 true. 판 색은 표지 dark, 본문은 mid/dark를 번갈아, 마지막 장은 light(명함이 또렷하게).
async function splitCard(photo:Buffer,content:StyleContent,index:number,look:TrackLook,options:{photoTop:boolean;panel:TrackSurface}):Promise<Buffer> {
  const panel=options.panel;
  const cover=content.cover;
  const title=await titleOf(content,panel.ink,panel.accent,cover?[96,88,82,76,72]:[72,68,64,60,56],SANS_BOLD);
  const line=cover?content.subline:shortLines(content,1)[0];
  const sub=line?await lineOf(line,cover?panel.accent:panel.dim,cover?44:40):null;
  const card=content.last?await storeCardBlock({logoSize:104,wordmark:false,surface:panel}):null;
  const foot=card?null:await footerRow({color:panel.dim,cueColor:panel.ink,ring:panel.ring,cue:!content.last});
  const folio=cover?null:await folioMark(index,panel.accent);
  // 판 높이: 글 덩어리 + 여백(최소 화면의 42%). 사진은 나머지.
  const PAD=64;
  const textH=(folio?folio.layer.info.height+22:0)+title.layer.info.height+(sub?20+sub.info.height:0);
  const bottomH=card?card.height:foot!.height;
  const panelH=Math.max(Math.round(H*.42),PAD+textH+48+bottomH+PAD);
  const photoH=H-panelH;
  const panelTop=options.photoTop?photoH:0;
  const shot=await finishPhoto(photo,W,photoH,{zoom:1.03});
  const layers:OverlayOptions[]=[{input:shot,left:0,top:options.photoTop?0:panelH}];
  const bottomTop=panelTop+panelH-PAD-bottomH;
  // 글 덩어리는 판 위쪽 여백과 바닥글 사이 남는 높이의 가운데에(판이 넓을 때 아래가 비어 보이지 않게).
  const room=bottomTop-48-(panelTop+PAD);
  let y=panelTop+PAD+Math.max(0,Math.round((room-textH)/2));
  let markup="";
  if(folio){markup+=folio.svg(MARGIN,y);layers.push({input:folio.layer.data,left:MARGIN,top:y});y+=folio.layer.info.height+22;}
  layers.push({input:title.layer.data,left:MARGIN,top:y});y+=title.layer.info.height;
  if(sub){y+=20;layers.push({input:sub.data,left:MARGIN,top:y});}
  if(cover)layers.push({input:await logoMark(104,panel.ring),left:W-MARGIN-104,top:options.photoTop?MARGIN:panelH+MARGIN});
  if(card){const placed=card.place(540,bottomTop);markup+=placed.svg;layers.push(svgLayer(markup),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  // 사진과 판 경계에 강조색 짧은 막대(어느 쪽이 위든 경계 위에).
  layers.push(svgLayer(`<rect x="${MARGIN}" y="${(options.photoTop?photoH:panelH)-6}" width="120" height="12" rx="6" fill="${panel.accent}"/>`));
  return finish(panel.bg,layers);
}

// ── 3 숙성 라벨·도장 ──────────────────────────────────────────────────────────────────
// 사진을 화면 가득 깔고, 오른쪽 위에 둥근 도장(인주색, 톱니 테두리)을 살짝 기울여 찍는다. 도장 글은 장 키워드(예: "홍어")와 가게 이름.
// 홍어의 냄새·위생 걱정을 "어디서 온, 며칠 숙성한" 이야기로 바꿔 믿음을 주는 모양.
const SEAL_INK="#B3261E";
function sealSvg(cx:number,cy:number,R:number,rotate:number):string {
  const teeth=36;let d="";
  for(let i=0;i<=teeth*2;i++){const a=i/(teeth*2)*Math.PI*2,r=i%2?R:R-9;d+=`${i?"L":"M"}${(cx+Math.cos(a)*r).toFixed(1)} ${(cy+Math.sin(a)*r).toFixed(1)}`;}
  return `<g transform="rotate(${rotate} ${cx} ${cy})"><path d="${d}Z" fill="${SEAL_INK}" fill-opacity=".92"/><circle cx="${cx}" cy="${cy}" r="${R-24}" fill="none" stroke="#FBEFE6" stroke-width="3" stroke-dasharray="7 7"/><circle cx="${cx}" cy="${cy}" r="${R-40}" fill="none" stroke="#FBEFE6" stroke-width="2"/></g>`;
}
async function sealLayers(content:StyleContent,cx:number,cy:number,R:number):Promise<OverlayOptions[]> {
  const word=(content.keywords?.[0]??"홍어").slice(0,4);
  const big=await textLayer(word,{size:Math.round(R*.42),color:"#FBEFE6",width:R*2,height:R,font:TITLE_SERIF,align:"centre"});
  const small=await textLayer("묵동홍어마을",{size:Math.max(20,Math.round(R*.16)),color:"#FBEFE6",width:R*2,height:R,font:SANS_BOLD,align:"centre",letterSpacing:2});
  const top=cy-(big.info.height+8+small.info.height)/2;
  return [svgLayer(sealSvg(cx,cy,R,-8)),{input:big.data,left:Math.round(cx-big.info.width/2),top:Math.round(top)},{input:small.data,left:Math.round(cx-small.info.width/2),top:Math.round(top+big.info.height+8)}];
}
async function labelCard(photo:Buffer,content:StyleContent,index:number,look:TrackLook):Promise<Buffer> {
  const paper=look.light;
  const shot=await finishPhoto(photo,W,H,{zoom:content.cover?1.04:1.02});
  const title=await titleOf(content,"#FFFFFF","#F0C66A",content.cover?[100,92,86,80,74]:[72,68,64,60,56]);
  const line=content.cover?content.subline:shortLines(content,1)[0];
  const sub=line?await textLayer(line,{size:content.cover?46:40,color:"#F3E9DA",width:CONTENT_W,height:4000,font:SANS,spacing:10}):null;
  const foot=await footerRow({color:"#FFFFFF",ring:paper.ring,cue:!content.last,shadow:true});
  // 마지막 장: 아래쪽을 밝은 종이 판으로 덮고 명함을 둔다.
  const store=content.last?await storeCardBlock({logoSize:100,wordmark:false,surface:paper}):null;
  const panelH=store?store.height+96:0;
  const footTop=store?H-panelH:H-MARGIN-foot.height;
  const subTop=footTop-(store?40:56)-(sub?.info.height??0);
  const titleTop=(sub?subTop-20:footTop-56)-title.layer.info.height;
  const shadeFrom=Math.max(360,titleTop-220);
  const shade=`<defs><linearGradient id="plB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C1310" stop-opacity="0"/><stop offset=".45" stop-color="#1C1310" stop-opacity=".6"/><stop offset="1" stop-color="#1C1310" stop-opacity=".88"/></linearGradient></defs><rect x="0" y="${shadeFrom}" width="${W}" height="${H-shadeFrom}" fill="url(#plB)"/>`;
  const layers:OverlayOptions[]=[{input:shot,left:0,top:0},svgLayer(shade)];
  const R=content.cover?150:104;
  layers.push(...await sealLayers(content,W-MARGIN-R+10,MARGIN+R-10,R));
  if(content.cover)layers.push({input:await logoMark(104,paper.ring),left:MARGIN,top:MARGIN});
  else{
    // 본문: 왼쪽 위 꼬리표(No.02)로 순서를 알린다.
    const tag=await textLayer(`No.${String(index).padStart(2,"0")}`,{size:40,color:"#2B1F1A",width:300,height:80,font:SANS_BOLD,features:"tnum"});
    const tw=tag.info.width+44;
    layers.push(svgLayer(`<path d="M${MARGIN} ${MARGIN}H${MARGIN+tw}L${MARGIN+tw+22} ${MARGIN+30}L${MARGIN+tw} ${MARGIN+60}H${MARGIN}Z" fill="#F3E9DA"/><circle cx="${MARGIN+tw-2}" cy="${MARGIN+30}" r="6" fill="#2B1F1A"/>`),{input:tag.data,left:MARGIN+20,top:MARGIN+30-Math.round(tag.info.height/2)});
  }
  layers.push({input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  if(store){
    const placed=store.place(540,H-panelH+48);
    layers.push(svgLayer(`<rect x="0" y="${H-panelH}" width="${W}" height="${panelH}" fill="${paper.bg}"/>`+placed.svg),...placed.layers);
  }else{
    const placed=foot.place(footTop);
    layers.push(svgLayer(placed.svg),...placed.layers);
  }
  return finish("#1C1310",layers);
}

// ── 4 삼합 순서 카드 ──────────────────────────────────────────────────────────────────
// 밝은 종이 위쪽에 큰 원 번호(1·2·3…)와 제목, 가운데 둥근 사진, 아래 짧은 글. 맨 위 진행 점(●●○○)으로 몇 번째 단계인지 보인다.
// "처음 먹는 법"처럼 순서가 있는 이야기용(저장을 부르는 정보형). 표지는 "순서대로 넘겨 보세요" 알약을 단다.
async function stepCard(photo:Buffer,content:StyleContent,index:number,total:number,look:TrackLook):Promise<Buffer> {
  const paper=look.light;
  const cover=content.cover;
  const step=index-1,steps=Math.max(1,total-2);
  const line=cover?content.subline:shortLines(content,1)[0];
  const sub=line?await lineOf(line,paper.dim,cover?44:40):null;
  const store=content.last?await storeCardBlock({logoSize:100,wordmark:false,surface:paper}):null;
  const foot=store?null:await footerRow({color:paper.dim,cueColor:paper.ink,cue:!content.last});
  const layers:OverlayOptions[]=[];
  const texture=await textureLayer("linen",{opacity:.2});
  if(texture)layers.push(texture);
  let markup="";
  let y=MARGIN;
  if(!cover&&!content.last){
    for(let i=0;i<steps;i++)markup+=`<circle cx="${MARGIN+12+i*36}" cy="${y+12}" r="10" fill="${i<step?paper.accent:paper.soft}"/>`;
    y+=48;
  }
  const NUM=150;
  const num=await textLayer(cover?"홍":content.last?"✓":String(step),{size:84,color:paper.chipInk,width:NUM,height:NUM,font:TITLE_SERIF,align:"centre",features:"tnum"});
  // 도형은 글보다 먼저 깐다(나중에 깔면 글을 덮는다).
  layers.push(svgLayer(markup+`<circle cx="${MARGIN+NUM/2}" cy="${y+NUM/2}" r="${NUM/2}" fill="${paper.chip}"/>`));
  markup="";
  layers.push({input:num.data,left:Math.round(MARGIN+NUM/2-num.info.width/2),top:Math.round(y+NUM/2-num.info.height/2)});
  const head=await fitLines(content.headline,{sizes:cover?[80,74,68,62,58]:[64,60,56,52,48],width:W-MARGIN*2-NUM-36,font:SANS_BOLD,color:paper.ink,maxLines:2,prefer:"size",spacing:size=>Math.round(size*.12),letterSpacing:size=>-size*.015,emphasis:emphasisOf(content,paper.accent)});
  layers.push({input:head.layer.data,left:MARGIN+NUM+36,top:Math.round(y+NUM/2-head.layer.info.height/2)});
  y+=Math.max(NUM,head.layer.info.height)+44;
  // 아래에서 위로: 바닥글(명함) → 짧은 글 → 사진.
  const bottomH=store?store.height:foot!.height;
  const bottomTop=H-(store?52:MARGIN)-bottomH;
  const subTop=bottomTop-44-(sub?.info.height??0);
  const photoH=Math.max(380,(sub?subTop-36:bottomTop-44)-y);
  layers.push(await shadowLayer({x:MARGIN,y:y+12,width:CONTENT_W,height:photoH,rx:28,blur:24,opacity:.18}),{input:await croppedPhoto(photo,CONTENT_W,photoH,28,{zoom:1.03}),left:MARGIN,top:y});
  if(cover){
    const chip=await textLayer("순서대로 넘겨 보세요 ›",{size:40,color:paper.chipInk,width:700,height:80,font:SANS_BOLD});
    const ch=chip.info.height+28,cw=chip.info.width+56;
    layers.push(svgLayer(`<rect x="${MARGIN+24}" y="${y+photoH-ch-24}" width="${cw}" height="${ch}" rx="${ch/2}" fill="${paper.chip}"/>`));
    layers.push({input:chip.data,left:MARGIN+52,top:y+photoH-ch-24+14});
  }
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  if(store){const placed=store.place(540,bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  else{const placed=foot!.place(bottomTop);layers.push(svgLayer(markup+placed.svg),...placed.layers);}
  return finish(paper.bg,layers);
}

export function renderPhotoLook(look:number,photo:Buffer,content:StyleContent,index:number,colors:TrackLook,total=index):Promise<Buffer>|null {
  if(look>=5)return renderPhotoLookRetro(look,photo,content,index,colors);
  if(look===3)return labelCard(photo,content,index,colors);
  if(look===4)return stepCard(photo,content,index,total,colors);
  if(look===1)return content.cover?magazineCover(photo,content,colors):magazineBody(photo,content,index,colors);
  if(look===2){
    if(content.cover)return splitCard(photo,content,index,colors,{photoTop:true,panel:colors.dark});
    if(content.last)return splitCard(photo,content,index,colors,{photoTop:true,panel:colors.light});
    return splitCard(photo,content,index,colors,{photoTop:index%2===1,panel:index%2===0?colors.mid:colors.dark});
  }
  return null;
}
