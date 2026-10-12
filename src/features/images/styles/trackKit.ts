import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { STORE_NAME } from "../slideLayout";
import { registerDecor } from "../render/audit";
import { cachedLayer } from "../decor";
import { brandHandle, svg, textLayer, type Font, type Layer } from "../render/primitives";
import { STYLE_FONTS, fitText, nextCue, type StyleContent } from "./shared";

// 두 갈래(사진 중심 photoFocus.ts · 글 중심 textFocus.ts)가 함께 쓰는 색·로고·바닥글·가게 명함·줄 수 재기.
// 두 갈래는 사장님이 "사진이냐 글이냐"만 고르면 나머지를 앱이 정하는 디자인이라(계획서 SIMPLIFY_PLAN),
// 같은 가게 색(로고의 짙은 밤색 #4f3c39)과 같은 로고·바닥글을 써서 어느 쪽을 골라도 한 가게의 게시물로 보이게 한다.
// 폰에서 50대 이상도 읽히도록 장 번호 같은 작은 표시를 빼면 글자는 30px 이상만 쓴다.

// 따뜻한 세 바탕. 글자색 대비(WCAG): 크림 위 ink 13:1·dim 7:1·accent 6:1, 밤색 위 ink 9:1·dim 7:1·accent 6:1,
// 겨자 위 ink 8:1·dim 6:1·accent 5:1. 작은 글(40px 미만) 검수 기준 4:1을 넉넉히 넘긴다.
export type TrackSurface={name:"cream"|"brown"|"mustard";bg:string;ink:string;dim:string;accent:string;soft:string;chip:string;chipInk:string;ring:string};
export const TRACK_SURFACES={
  cream:{name:"cream",bg:"#F5EFE5",ink:"#2F231E",dim:"#5E4E45",accent:"#A9472A",soft:"#EAE0D0",chip:"#4F3C39",chipInk:"#F8F1E6",ring:"#F5EFE5"},
  brown:{name:"brown",bg:"#4F3C39",ink:"#F8F1E6",dim:"#E3D5C2",accent:"#E9BC5C",soft:"#5C4844",chip:"#E9BC5C",chipInk:"#2B1F1A",ring:"#F5EFE5"},
  mustard:{name:"mustard",bg:"#E3B556",ink:"#2B1F1A",dim:"#4A372D",accent:"#7A2E1C",soft:"#D9A944",chip:"#4F3C39",chipInk:"#F8F1E6",ring:"#F5EFE5"},
} as const satisfies Record<string,TrackSurface>;
// 사진 위 글자: 흰 글자와 크림 보조 글. 사진 위에는 아래로 짙어지는 밤색 그라데이션을 깔고 쓴다.
export const ON_PHOTO={ink:"#FFFFFF",dim:"#F3E9DA",accent:"#F0C66A"} as const;
// 사진 위 그라데이션 색(로고 밤색보다 한 톤 짙게). 검정보다 따뜻해 음식 색이 탁해지지 않는다.
export const SHADE="#1C1310";

export const MARGIN=72;
export const TITLE_SERIF=STYLE_FONTS.modernSerif;
export const SANS_BOLD=STYLE_FONTS.sansBold;
export const SANS_SEMI=STYLE_FONTS.sansSemi;
export const SANS=STYLE_FONTS.sans;

// ── 로고 ──────────────────────────────────────────────────────────────────────────────
// 가게 원형 로고(밤색 원 안에 "묵동 홍어마을"). 밤색 바탕·어두운 사진 위에서는 원이 바탕에 묻히므로 ring 색 테두리를 두른다.
// 자동 검수에는 "큰 장식(ornament)"으로 알려 빈 띠 계산에서 찬 자리로 치고, 글자 가림 검사에서는 뺀다.
const LOGO_FILE=path.join(process.cwd(),"assets/brand/logo-round.png");
export async function logoMark(size:number,ring?:string):Promise<Buffer> {
  const S=Math.round(size);
  const buffer=await cachedLayer(`track-logo:${S}:${ring??""}`,async()=>{
    const pad=ring?Math.max(3,Math.round(S*.04)):0;
    const logo=await sharp(LOGO_FILE).resize(S-pad*2,S-pad*2).png().toBuffer();
    if(!pad)return logo;
    return sharp({create:{width:S,height:S,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
      .composite([{input:svg(S,S,`<circle cx="${S/2}" cy="${S/2}" r="${S/2-.5}" fill="${ring}"/>`)},{input:logo,left:pad,top:pad}]).png().toBuffer();
  });
  registerDecor(buffer,"ornament");
  return buffer;
}

// ── 줄 수에 맞춘 글자 ─────────────────────────────────────────────────────────────────────
// 같은 글꼴·크기의 한 줄 높이(h1)와 줄 사이 간격(두 줄 높이 − 한 줄 높이)으로 줄 수를 센다.
// 한 줄 높이만으로 나누면 틀린다: 함렛처럼 글꼴의 줄 상자가 획보다 훨씬 큰 글꼴은 한 줄 그림(획만큼)과 줄 간격이 크게 달라
// 두 줄 제목을 세 줄로 셌다.
const lineMetrics=async(size:number,font:Font,spacing:number,letterSpacing?:number)=>{
  const style={size,color:"#000000",width:400,height:4000,font,spacing,letterSpacing};
  const [one,two]=await Promise.all([textLayer("홍",style),textLayer("홍\n홍",style)]);
  return {h1:one.info.height,pitch:Math.max(1,two.info.height-one.info.height)};
};
export async function countLines(layer:Layer,size:number,font:Font,spacing:number,letterSpacing?:number):Promise<number> {
  const {h1,pitch}=await lineMetrics(size,font,spacing,letterSpacing);
  return Math.max(1,1+Math.round((layer.info.height-h1)/pitch));
}

// 줄 수 상한(maxLines) 안에서 들어가는 글자를 고른다.
//   prefer:"lines" — 줄이 적은 쪽이 먼저(본문 제목은 한 줄이 원칙: 한 줄에 들어가는 가장 큰 크기 → 없으면 두 줄 …).
//   prefer:"size"  — 큰 글자가 먼저(표지 제목: 상한 줄 수 안에서 가장 큰 크기).
// 여러 줄이면 fitText(균형 줄바꿈·쉼표 자리 우선)로 다시 그린다. 상한 안에 안 들어가면 가장 작은 크기로 그대로 그린다
// (줄은 늘지만 글자를 몰래 줄이지 않는다). 돌려주는 lines로 부르는 쪽이 요점 수를 줄인다.
// 줄바꿈이 꾸밈말 바로 뒤에서 일어나지 않게("막걸리와 홍어 한 / 점이 당기는 이유") 한 글자 낱말(한·두·덜·비 …)과
// 다음 낱말 사이 띄어쓰기를 줄바꿈 없는 공백(U+00A0)으로 묶는다. 보이는 모양은 같고, Pango가 그 자리에서만 줄을 안 바꾼다.
export const glueShortWords=(value:string)=>value.replace(/(?<=^|[\s\u00A0])([가-힣]) (?=\S)/g,"$1\u00A0");
export async function fitLines(rawValue:string,options:{sizes:number[];width:number;font:Font;color:string;maxLines:number;prefer:"lines"|"size";align?:"left"|"centre";spacing?:(size:number)=>number;letterSpacing?:(size:number)=>number;emphasis?:{words:string[];color:string}}):Promise<{layer:Layer;lines:number;size:number}> {
  const spacing=options.spacing??((size:number)=>Math.round(size*.18));
  const value=glueShortWords(rawValue);
  const measure=async(size:number)=>{
    const layer=await textLayer(value,{size,color:options.color,width:options.width,height:4000,font:options.font,align:options.align,spacing:spacing(size),letterSpacing:options.letterSpacing?.(size)});
    return {size,lines:await countLines(layer,size,options.font,spacing(size),options.letterSpacing?.(size))};
  };
  const measured:Array<{size:number;lines:number}>=[];
  for(const size of options.sizes)measured.push(await measure(size));
  const pick=options.prefer==="size"
    ?measured.find(item=>item.lines<=options.maxLines)
    :Array.from({length:options.maxLines},(_,i)=>measured.find(item=>item.lines===i+1)).find(Boolean);
  const chosen=pick??measured[measured.length-1];
  const layer=await fitText(value,{sizes:[chosen.size],width:options.width,maxHeight:4000,color:options.color,font:options.font,align:options.align,spacing:spacing(chosen.size),emphasis:options.emphasis,letterSpacing:options.letterSpacing});
  return {layer,lines:await countLines(layer,chosen.size,options.font,spacing(chosen.size),options.letterSpacing?.(chosen.size)),size:chosen.size};
}

// ── 바닥글: 작은 로고 + 가게 이름(·계정) / 오른쪽 "넘겨 보기 ›" ─────────────────────────────────
// 마지막 장에는 넘겨 보기를 두지 않는다(cue:false). 돌려주는 height로 부르는 쪽이 위 내용의 바닥을 정한다.
export async function footerRow(options:{color:string;cueColor?:string;ring?:string;cue:boolean;shadow?:boolean;left?:number;right?:number}):Promise<{height:number;place:(top:number)=>{layers:OverlayOptions[];svg:string}}> {
  const left=options.left??MARGIN,right=options.right??MARGIN;
  const LOGO=64;
  const logo=await logoMark(LOGO,options.ring);
  const handle=brandHandle();
  const cue=options.cue?await nextCue(options.cueColor??options.color,40):null;
  const nameWidth=1080-left-right-LOGO-16-(cue?cue.width+40:0);
  // 가게 이름 · 계정이 한 줄에 안 들어가면(긴 계정) 계정만 쓴다(옆 로고에 가게 이름이 있다). 그래도 길면 두 줄로 접는다(글자를 줄이지 않는다).
  const line=(value:string)=>textLayer(value,{size:40,color:options.color,width:nameWidth,height:4000,font:SANS_SEMI,shadow:options.shadow});
  let name=await line(handle?`${STORE_NAME} · ${handle}`:STORE_NAME);
  if(handle&&name.info.height>(options.shadow?80:56))name=await line(handle);
  const height=Math.max(LOGO,name.info.height,cue?.height??0);
  return {height,place:top=>{
    const mid=top+height/2;
    const layers:OverlayOptions[]=[{input:logo,left,top:Math.round(mid-LOGO/2)},{input:name.data,left:left+LOGO+16,top:Math.round(mid-name.info.height/2)}];
    let markup="";
    if(cue){
      const x=1080-right-cue.width,y=Math.round(mid-cue.height/2);
      layers.push({input:cue.label.data,left:x,top:y});
      markup=cue.arrow(x,y);
    }
    return {layers,svg:markup};
  }};
}

// 장 번호: 두 자리 숫자(02) + 짧은 선. tnum으로 숫자 폭을 맞춘다. 작은 표시라 30px.
export async function folioMark(index:number,color:string,options:{shadow?:boolean;rule?:boolean}={}):Promise<{layer:Layer;svg:(x:number,y:number)=>string;width:number}> {
  const layer=await textLayer(String(index).padStart(2,"0"),{size:40,color,width:140,height:70,font:SANS_BOLD,features:"tnum",letterSpacing:1.5,shadow:options.shadow});
  const rule=options.rule??true;
  return {layer,width:layer.info.width+(rule?76:0),svg:(x,y)=>rule?`<path d="M${x+layer.info.width+18} ${Math.round(y+layer.info.height/2)}H${x+layer.info.width+76}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`:""};
}

// ── 가게 명함(마지막 장) ─────────────────────────────────────────────────────────────────
// 원형 로고 → (워드마크) → 계정(설정에 있을 때) → "저장해 두고 다시 보세요" 알약. 가운데 정렬로 cx 기준에 놓는다.
// 주소·영업시간은 넣지 않는다(확인 안 된 사실). 로고 안의 전화번호는 가게가 직접 쓰는 로고 그대로다.
export const SAVE_CHIP="저장해 두고 다시 보세요";
// halo: 로고 뒤에 깔 한 톤 짙은 원(색·로고 밖으로 나오는 폭). 원이 계정 글자에 걸리지 않게 그 폭만큼 아래로 띄운다
// (예전에는 원을 따로 그려 계정 글자 윗부분이 원 테두리에 잘려 보였다).
export async function storeCardBlock(options:{logoSize:number;ring?:string;wordmark:boolean;surface:Pick<TrackSurface,"ink"|"dim"|"chip"|"chipInk">;width?:number;halo?:{color:string;pad:number}}):Promise<{height:number;place:(cx:number,top:number)=>{layers:OverlayOptions[];svg:string}}> {
  const width=options.width??900,s=options.surface,halo=options.halo;
  const logo=await logoMark(options.logoSize,options.ring);
  const word=options.wordmark?await textLayer(STORE_NAME,{size:48,color:s.ink,width,height:120,font:TITLE_SERIF,align:"centre",letterSpacing:48*.06}):null;
  const account=brandHandle();
  const handle=account?await textLayer(account,{size:40,color:s.dim,width,height:70,font:SANS_SEMI,align:"centre"}):null;
  const chip=await textLayer(SAVE_CHIP,{size:40,color:s.chipInk,width,height:70,font:SANS_SEMI});
  const padX=34,padY=16,chipH=chip.info.height+padY*2,chipW=chip.info.width+padX*2;
  const GAP=22;
  const pad=halo?.pad??0;
  const height=pad*2+options.logoSize+(word?GAP+word.info.height:0)+(handle?(word?12:GAP)+handle.info.height:0)+GAP+6+chipH;
  return {height,place:(cx,top)=>{
    const layers:OverlayOptions[]=[{input:logo,left:Math.round(cx-options.logoSize/2),top:top+pad}];
    let markup=halo?`<circle cx="${cx}" cy="${top+pad+options.logoSize/2}" r="${options.logoSize/2+pad}" fill="${halo.color}"/>`:"";
    let y=top+pad*2+options.logoSize;
    if(word){y+=GAP;layers.push({input:word.data,left:Math.round(cx-word.info.width/2),top:y});y+=word.info.height;}
    if(handle){y+=word?12:GAP;layers.push({input:handle.data,left:Math.round(cx-handle.info.width/2),top:y});y+=handle.info.height;}
    y+=GAP+6;
    const x=Math.round(cx-chipW/2);
    layers.push({input:chip.data,left:x+padX,top:y+padY});
    markup+=`<rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="${chipH/2}" fill="${s.chip}"/>`;
    return {layers,svg:markup};
  }};
}

// 이 장에서 보여 줄 짧은 글. 두 갈래는 글을 적게 쓰는 디자인이라 앞에서부터 max개만 쓴다
// (나머지는 캡션에 남고, 화면이 "들어가지 않은 요점"으로 알려 준다).
export const shortLines=(content:StyleContent,max:number)=>content.points.slice(0,max);
