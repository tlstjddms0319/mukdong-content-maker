import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { createHash } from "node:crypto";
import { STORE_NAME } from "../slideLayout";
import type { CarouselSlidePlan } from "../carousel";
import { teaserText } from "../teaser";
import { noteAudit } from "../render/audit";
import { seeded } from "./handDrawn";
import { brandHandle, cleanPoints, currentRemoteCutout, currentStoreCard, finishPhoto, textLayer, type TextEmphasis, type Font, type Layer } from "../render/primitives";

// 스타일 계열(styles/*.ts)이 함께 쓰는 도구. 계열마다 고유한 글꼴·색을 쓰므로 여기의 글꼴은 사용자가 고른 제목·본문 글꼴로
// 바뀌지 않는다(render/primitives의 FONTS 역할 객체가 아니라서 resolveFont가 그대로 둔다).

const FONT_DIR=path.join(process.cwd(),"assets/fonts");
const face=(fileName:string,family:string):Font=>({file:path.join(FONT_DIR,fileName),family});
export const STYLE_FONTS={
  pixel:face("Galmuri11.ttf","Galmuri11"),
  pixelBold:face("Galmuri11-Bold.ttf","Galmuri11 Bold"),
  serif:face("NanumMyeongjo-Regular.ttf","NanumMyeongjo"),
  serifHeavy:face("NanumMyeongjo-ExtraBold.ttf","NanumMyeongjo ExtraBold"),
  brushSerif:face("SongMyung-Regular.ttf","Song Myung"),
  hand:face("NanumPenScript-Regular.ttf","Nanum Pen"),
  heavy:face("BlackHanSans-Regular.ttf","Black Han Sans"),
  comic:face("DoHyeon-Regular.ttf","Do Hyeon"),
  gothicBlack:face("GothicA1-Black.ttf","Gothic A1 Black"),
  gothicLight:face("GothicA1-Light.ttf","Gothic A1 Light"),
  sans:face("Pretendard-Regular.otf","Pretendard"),
  sansBold:face("Pretendard-Bold.otf","Pretendard Bold"),
  sansSemi:face("Pretendard-SemiBold.otf","Pretendard SemiBold"),
  round:face("Jua-Regular.ttf","Jua"),                        // 네온 간판(둥근 글자)
  brush:face("NanumBrushScript-Regular.ttf","Nanum Brush Script"), // 한지·수묵(붓글씨)
  chalk:face("Gaegu-Bold.ttf","Gaegu Bold"),                  // 칠판(분필 손글씨)
  marker:face("EastSeaDokdo-Regular.ttf","East Sea Dokdo"),   // 사진 위 낙서(마커 손글씨)
  soft:face("GamjaFlower-Regular.ttf","Gamja Flower"),        // 수채화(둥근 손글씨)
  dodum:face("GowunDodum-Regular.ttf","Gowun Dodum"),         // 수채화 요점(부드러운 고딕)
  mono:face("NanumGothicCoding-Bold.ttf","NanumGothicCoding Bold"), // 모던 그리드·티켓(번호·꼬리표)
  display:face("AbrilFatface-Regular.ttf","Abril Fatface"),   // 푸드 매거진 표지(제호, 영문 전용)
  condensed:face("BebasNeue-Regular.ttf","Bebas Neue"),       // 티켓·라벨(좁은 영문 대문자, 영문 전용)
  modernSerif:face("Hahmlet-Variable.ttf","Hahmlet Bold"),    // 현대 명조(골드·라벨·오마카세 제목). 2,788음절, 빠진 음절은 Pretendard로 대체
  modernSerifHeavy:face("Hahmlet-Variable.ttf","Hahmlet ExtraBold"),
  displayHeavy:face("GasoekOne-Regular.ttf","Gasoek One"),    // 아주 굵은 좁은 디스플레이(키치·팝업 큰 제목). 2,780음절
} as const;

// 장 하나를 스타일이 그리기 쉬운 모양으로 정리한다. 표지·사진 장·글자 장 가운데 어느 쪽인지 kind로 알려 준다.
//   subline : 표지 부제(큰 훅 제목 아래 작은 한 줄). 표지가 아니거나 구성안에 없으면 "".
//   teaser  : 표지 하단 예고 띠 글("먹는 법 · 곁들임 · 방문 전 확인", 전체 장 수는 쓰지 않음). 표지가 아니면 "".
export type StyleContent={
  headline:string;subline:string;teaser:string;points:string[];keywords:string[];index:number;total:number;cover:boolean;last:boolean;
  kind:"cover"|"photo"|"photos"|"text";
  // 두 사진을 견주는 비교 장(layout versus)인지. 사진이 두 장이어도 비교 장이 아니면 "vs" 같은 비교 표시를 하지 않는다
  // (실제 사진 캐러셀은 남는 사진을 두 장짜리 장으로 넣는데, 그 장의 글은 비교가 아니다).
  compare:boolean;
  // 이유 장 번호(사장님 요청 2026-10-13): 갈래 게시물은 표지 질문 → 이유 장들 → 결론 장이라, 이유 장에는 장 번호 대신
  // "몇 번째 이유 / 이유가 모두 몇 개"를 제목 앞에 크게 보인다. 표지·결론 장(내용 마지막 장)·홍보 카드는 null.
  reason?:{n:number;of:number}|null;
};
// 내용 장 수(맨 뒤 홍보 카드는 빼고) 안에서 표지(1)와 결론(마지막 내용 장) 사이가 이유 장이다.
export function reasonOf(index:number,total:number,cover=index===1):{n:number;of:number}|null {
  const content=currentStoreCard()?total-1:total;
  const of=content-2;
  if(cover||of<1||index<2||index>=content)return null;
  return {n:index-1,of};
}

export function contentOf(slide:CarouselSlidePlan,inputs:Buffer[],index:number,total:number):StyleContent {
  const cover=slide.role==="cover";
  return {
    headline:slide.headline.replace(/\s+/g," ").trim(),subline:cover?(slide.subline??"").replace(/\s+/g," ").trim():"",teaser:cover?teaserText(total,currentStoreCard()):"",
    points:cleanPoints(slide.points),keywords:slide.keywords,index,total,cover,last:index===total,
    kind:cover?"cover":inputs.length>=2?"photos":inputs.length===1?"photo":"text",
    compare:slide.layout==="versus"&&inputs.length>=2,
    reason:reasonOf(index,total,cover),
  };
}

// ── 표지 예고 띠·넘김 표시·마지막 장 명함(계획서 B9) ──────────────────────────────────────────
// 표지 예고 띠 글은 화면도 쓰므로 sharp 없는 teaser.ts에 둔다(여기서는 그대로 내보낸다).
export { teaserText } from "../teaser";

// 본문 장 오른쪽 아래 "넘겨 보기 ›": 글자(검수 추적)와 화살표(SVG)를 따로 돌려준다. 마지막 장에는 쓰지 않는다.
// 화살표 글리프(▸)는 대부분 글꼴에 없어 SVG 경로로 그린다. width·height는 글자+화살표 전체 크기.
export async function nextCue(color:string,size=26):Promise<{label:Layer;arrow:(x:number,y:number)=>string;width:number;height:number}> {
  const label=await textLayer("넘겨 보기",{size,color,width:300,height:size*2,font:STYLE_FONTS.sansSemi,letterSpacing:size*.04});
  const gap=10,arrowW=Math.round(size*.55);
  return {label,width:label.info.width+gap+arrowW,height:label.info.height,arrow:(x,y)=>{
    const ax=x+label.info.width+gap,mid=y+label.info.height/2;
    return `<path d="M${ax} ${mid-arrowW*.6}L${ax+arrowW} ${mid}L${ax} ${mid+arrowW*.6}" fill="none" stroke="${color}" stroke-width="${Math.max(MIN_STROKE,size*.12)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }};
}

// 마지막 장 "가게 명함": 워드마크(가게 이름) + 계정 + "저장해 두고 다시 보세요" 칩. 주소·영업시간은 넣지 않는다(확인 안 된 사실).
// 높이는 240px 이하라 각 계열의 마지막 장 남는 높이 계산에 그대로 예약할 수 있다. chip은 알약 배경 SVG를 함께 돌려준다.
export async function closingBlock(options:{width:number;color:string;accent:string;chipText?:string;font?:Font}):Promise<{wordmark:Layer;handle:Layer|null;chip:Layer;chipSvg:(x:number,y:number)=>string;height:number}> {
  const wordmark=await textLayer(STORE_NAME,{size:44,color:options.color,width:options.width,height:120,font:options.font??STYLE_FONTS.serifHeavy,letterSpacing:44*.12,align:"centre"});
  const account=brandHandle();
  const handle=account?await textLayer(account,{size:28,color:options.color,width:options.width,height:60,font:STYLE_FONTS.sansSemi,align:"centre"}):null;
  const chip=await textLayer(options.chipText??"저장해 두고 다시 보세요",{size:28,color:"#FFFFFF",width:options.width,height:60,font:STYLE_FONTS.sansSemi});
  const padX=26,padY=12;
  const height=wordmark.info.height+(handle?8+handle.info.height:0)+18+chip.info.height+padY*2;
  return {wordmark,handle,chip,height,chipSvg:(x,y)=>`<rect x="${x-padX}" y="${y-padY}" width="${chip.info.width+padX*2}" height="${chip.info.height+padY*2}" rx="${(chip.info.height+padY*2)/2}" fill="${options.accent}"/>`};
}

// ── 브랜드 마크·선 두께(계획서 B8) ─────────────────────────────────────────────────────────
// 폰 화면에서 1px 선은 사라진다. 장식 선은 이 두께 이상으로 그린다.
export const MIN_STROKE=2.5;
// 낙관(붉은 도장): 테두리가 살짝 거친 붉은 사각 안에 "묵동/홍어" 두 줄. 한지·티켓·그리드·라벨이 같은 모양을 쓴다(통일된 가게 표식).
// on:"dark"면 어두운 바탕용으로 바탕을 종이색, 글자를 인주색으로 뒤집는다. 글자는 검수가 추적하는 textLayer다.
export const SEAL_RED="#B8322A";
export async function brandSeal(size:number,seed:number,options:{on?:"light"|"dark";rotate?:number}={}):Promise<{svg:(x:number,y:number)=>string;text:Layer}> {
  const dark=options.on==="dark";
  const ink=dark?SEAL_RED:"#FBEFE6",paper=dark?"#F3E9DA":SEAL_RED;
  const text=await textLayer("묵동\n홍어",{size:Math.round(size*.3),color:ink,width:size,height:size,font:STYLE_FONTS.serifHeavy,align:"centre",spacing:2});
  const id=`brandSeal${seed}`,angle=options.rotate??-3;
  return {text,svg:(x,y)=>`<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size*.08)}" fill="${paper}" filter="url(#${id})" transform="rotate(${angle} ${x+size/2} ${y+size/2})"/>`};
}

// 제목 핵심어 강조(계획서 B13): 키워드 중 제목에 들어 있는 낱말 최대 2개를 색만 바꿔 강조한다. 없으면 undefined.
export function emphasisOf(content:Pick<StyleContent,"headline"|"keywords">,color:string):TextEmphasis|undefined {
  const words=content.keywords.map(word=>word.trim()).filter(word=>word.length>=2&&content.headline.includes(word)).slice(0,2);
  return words.length?{words,color}:undefined;
}
export const hashtags=(content:StyleContent)=>content.keywords.length?content.keywords.map(word=>`#${word}`).join(" "):STORE_NAME;

// ── 제목 배치(크기 + 균형 줄바꿈) ─────────────────────────────────────────────────────────
// 모든 계열의 제목이 같은 규칙을 쓰도록 "어떤 크기·어떤 폭으로 그릴지"만 정하는 함수. 그리기는 부르는 쪽이 한다
// (일반 글자 fitText, 금박 foilText, 외곽선 fitOutlined, 티켓 fitTitle). 같은 글꼴·크기·폭이면 줄바꿈이 같으므로
// 측정은 항상 평범한 textLayer로 한다.
//
// 1) 크기: sizes를 큰 것부터 그려 보고 maxHeight 안에 들어가는 첫 크기. 하나도 안 들어가면 가장 작은 크기(fits=false).
// 2) 균형 줄바꿈: 2줄 이상이면 "줄 수가 그대로인 가장 좁은 폭(Wmin)"을 이분 탐색으로 찾는다(폭 40%까지, 6번).
//    탐욕 줄바꿈은 앞 줄을 꽉 채우고 남은 것을 마지막 줄에 두므로, 글자 총길이 L ≈ (n−1)·W + r·W 이고 Wmin ≈ L/n 이다.
//    여기서 마지막 줄 비율 r ≈ n·Wmin/W − (n−1)을 얻는다. r < .6이면(마지막 줄이 짧으면) 폭을 Wmin+2%로 좁혀
//    "홍어 한 점은 씹을수록 진한 / 감칠맛" 같은 줄을 "홍어 한 점은 씹을수록 / 진한 감칠맛이 올라와요"처럼 고르게 만든다.
//    줄 수가 같으므로 높이도 같다(배치가 바뀌지 않는다). 탐색은 여러 줄 제목에서만 해서 제목당 +30~80ms.
// 3) 의미 단위 우선: 두 줄 제목에 쉼표·물음표·느낌표·마침표 뒤 띄어쓰기가 가운데쯤(25~75%)에 있고 그 자리에서 나눈
//    두 줄이 각각 한 줄에 들어가면, 폭 조정 대신 그 자리에 줄바꿈을 넣는다("비 오는 날엔 홍어 한 / 점, 막걸리 한 잔" 대신
//    "비 오는 날엔 홍어 한 점, / 막걸리 한 잔"). 그 크기에서 안 들어가면 두 단계 작은 크기까지 시도한다.
//    그래서 부르는 쪽은 value가 아니라 돌려받은 text·size를 그려야 한다.
// 4) 측정 메모: 균형을 잡고도 r < .35면 "외톨이 줄"(orphan)로 검수에 남긴다(한 낱말이 폭보다 긴 경우 등).
// 손글씨 글꼴(나눔손글씨 붓·개구·감자꽃·동해독도 등)은 획이 가늘고 불규칙해 폰에서 작으면 읽히지 않는다.
// 손글씨는 이 크기 이상의 제목·짧은 라벨에만 쓰고, 요점처럼 여러 줄 읽는 글은 고딕·돋움 계열로 쓴다(계획서 B12).
export const HANDWRITING_MIN_SIZE=46;

export type TitleLayout={text:string;size:number;width:number;lines:number;lastLineRatio:number;fits:boolean};
type TitleMeasure={sizes:number[];width:number;maxHeight:number;font:Font;align?:"left"|"centre";spacing?:number|((size:number)=>number);letterSpacing?:(size:number)=>number};
const spacingOf=(options:TitleMeasure,size:number)=>typeof options.spacing==="function"?options.spacing(size):options.spacing??Math.round(size*.12);
const ORPHAN=.35,BALANCE_BELOW=.6;

export async function chooseTitleLayout(value:string,options:TitleMeasure):Promise<TitleLayout> {
  const measure=(size:number,width:number,height=4000,text=value)=>textLayer(text,{size,color:"#000000",width,height,font:options.font,align:options.align,spacing:spacingOf(options,size),letterSpacing:options.letterSpacing?.(size)});
  let size=options.sizes[options.sizes.length-1],height=0,fits=false;
  for(const candidate of options.sizes){
    size=candidate;
    height=(await measure(size,options.width)).info.height;
    if(height<=options.maxHeight){fits=true;break;}
  }
  const balanced=await balanceWidth(value,{size,width:options.width,font:options.font,align:options.align,spacing:spacingOf(options,size),height,letterSpacing:options.letterSpacing?.(size)});
  if(balanced.lines===2){
    const split=punctuationSplit(value);
    // 나눈 두 줄이 각각 한 줄에 들어가면 높이가 "두 줄 높이"(한 줄 높이×2 + 줄 간격)와 같다
    // (줄마다 획 높이가 달라 글자 크기의 30%까지 허용, 한 줄이 늘면 그보다 훨씬 크다).
    // 지금 크기에서 쉼표 앞 절반이 한 줄에 안 들어가면 두 단계 작은 크기까지 시도한다: "홍어 한 / 점," 같은 끊김보다
    // 글자가 한 단계 작은 편이 읽기 좋다.
    const start=options.sizes.indexOf(size);
    for(const candidate of split?options.sizes.slice(Math.max(0,start),Math.max(0,start)+3):[]){
      const two=2*(await measure(candidate,options.width,4000,"홍")).info.height+spacingOf(options,candidate);
      const h=(await measure(candidate,options.width,4000,split!)).info.height;
      if(Math.abs(h-two)<=Math.max(2,candidate*.3)&&h<=options.maxHeight)return {text:split!,size:candidate,width:options.width,lines:2,lastLineRatio:1,fits};
    }
  }
  if(balanced.lines>=2&&balanced.lastLineRatio<ORPHAN)noteAudit({kind:"orphan",text:value.slice(0,24),ratio:Math.round(balanced.lastLineRatio*100)/100});
  return {text:value,size,width:balanced.width,lines:balanced.lines,lastLineRatio:balanced.lastLineRatio,fits};
}

// 문장부호(, . ? ! …) 바로 뒤 띄어쓰기 중 가운데에 가장 가까운 자리(전체의 25~75% 안)에서 두 줄로 나눈다. 없으면 null.
function punctuationSplit(value:string):string|null {
  if(value.includes("\n"))return null;
  const title=value.replace(/\s+/g," ").trim();
  const spots=[...title.matchAll(/ /g)].map(match=>match.index!).filter(at=>/[,，.?!…]/.test(title[at-1])&&at>=title.length*.25&&at<=title.length*.75);
  if(!spots.length)return null;
  const at=spots.sort((a,b)=>Math.abs(a-title.length/2)-Math.abs(b-title.length/2))[0];
  return `${title.slice(0,at)}\n${title.slice(at+1)}`;
}

// 크기가 정해진 글자의 균형 폭. height를 이미 재 두었으면 넘겨서 한 번 덜 그린다.
export async function balanceWidth(value:string,options:{size:number;width:number;font:Font;align?:"left"|"centre";spacing:number;height?:number;letterSpacing?:number}):Promise<{width:number;lines:number;lastLineRatio:number}> {
  const measure=(width:number,text=value)=>textLayer(text,{size:options.size,color:"#000000",width,height:4000,font:options.font,align:options.align,spacing:options.spacing,letterSpacing:options.letterSpacing}).then(layer=>layer.info.height);
  const W=Math.round(options.width);
  const full=options.height??await measure(W);
  // 줄 수: 한 줄 높이(h1, "홍" 한 글자)와 줄 간격(spacing)으로 H = n·h1 + (n−1)·spacing 을 푼다.
  const h1=await measure(W,"홍");
  const countLines=(height:number)=>Math.max(1,Math.round((height+options.spacing)/(h1+options.spacing)));
  const lines=countLines(full);
  // 줄바꿈 문자가 든 글(요점 목록 등)은 문단이 여럿이라 위 공식이 맞지 않는다. 폭은 그대로 둔다.
  if(lines<2||value.includes("\n"))return {width:W,lines,lastLineRatio:1};
  let lo=Math.round(W*.4),hi=W;
  for(let step=0;step<6;step++){
    const mid=Math.round((lo+hi)/2);
    // 높이 차(±2px)가 아니라 줄 수로 비교한다. 손글씨처럼 줄마다 획 높이가 다른 글꼴은 줄 수가 같아도 높이가 몇 px 달라진다.
    if(countLines(await measure(mid))===lines)hi=mid;else lo=mid;
  }
  const ratio=Math.max(0,Math.min(1,lines*hi/W-(lines-1)));
  if(ratio>=BALANCE_BELOW)return {width:W,lines,lastLineRatio:ratio};
  const width=Math.min(W,Math.round(hi*1.02));
  return {width,lines,lastLineRatio:Math.max(0,Math.min(1,lines*hi/width-(lines-1)))};
}

// 들어가는 가장 큰 글자 크기를 고르고(chooseTitleLayout), 여러 줄이면 줄 길이를 고르게 맞춰 그린다.
// balance:false는 요점 목록처럼 왼쪽 정렬 폭을 맞춰야 하는 글자용(크기만 고른다).
// emphasis: 제목 속 핵심어 색 강조(emphasisOf). letterSpacing: 크기별 자간(px), 예) size=>-size*.02.
export async function fitText(value:string,options:{sizes:number[];width:number;maxHeight:number;color:string;font:Font;align?:"left"|"centre";spacing?:number;balance?:boolean;emphasis?:TextEmphasis;letterSpacing?:(size:number)=>number}):Promise<Layer> {
  const spacing=(size:number)=>options.spacing??Math.round(size*.12);
  const extra=(size:number)=>({emphasis:options.emphasis,letterSpacing:options.letterSpacing?.(size)});
  if(options.balance===false){
    let last:Layer|null=null;
    for(const size of options.sizes){
      last=await textLayer(value,{size,color:options.color,width:options.width,height:4000,font:options.font,align:options.align,spacing:spacing(size),...extra(size)});
      if(last.info.height<=options.maxHeight)return last;
    }
    const smallest=options.sizes[options.sizes.length-1];
    return textLayer(value,{size:smallest,color:options.color,width:options.width,height:options.maxHeight,font:options.font,align:options.align,spacing:options.spacing,...extra(smallest)});
  }
  const layout=await chooseTitleLayout(value,{...options,spacing,letterSpacing:options.letterSpacing});
  // 가장 작은 크기로도 넘치면 높이에 맞춰 줄인다(검수에 shrink 메모가 남는다).
  return textLayer(layout.text,{size:layout.size,color:options.color,width:layout.width,height:layout.fits?4000:options.maxHeight,font:options.font,align:options.align,spacing:layout.fits?spacing(layout.size):options.spacing,...extra(layout.size)});
}

// 외곽선 글자(만화 제목·키치 글자). 같은 글자를 외곽선 색으로 8방향으로 밀어 찍고 그 위에 본래 색을 얹는다.
// Pango는 글자 외곽선을 직접 그리지 못해서 이렇게 흉내 낸다. shadow를 주면 오른쪽 아래로 진한 그림자를 한 번 더 깐다.
export async function outlinedText(value:string,options:{size:number;width:number;height?:number;font:Font;fill:string;stroke:string;strokeWidth:number;align?:"left"|"centre";shadow?:string;spacing?:number}):Promise<Layer> {
  const style={size:options.size,width:options.width,height:options.height??4000,font:options.font,align:options.align,spacing:options.spacing??Math.round(options.size*.1)};
  const fill=await textLayer(value,{...style,color:options.fill});
  const stroke=await textLayer(value,{...style,color:options.stroke});
  const s=options.strokeWidth,shadowOffset=options.shadow?Math.round(s*1.6):0;
  const W=fill.info.width+s*2+shadowOffset,H=fill.info.height+s*2+shadowOffset;
  const layers:OverlayOptions[]=[];
  if(options.shadow){
    const shade=await textLayer(value,{...style,color:options.shadow});
    for(const [dx,dy] of ring8(s))layers.push({input:shade.data,left:s+dx+shadowOffset,top:s+dy+shadowOffset});
  }
  for(const [dx,dy] of ring8(s))layers.push({input:stroke.data,left:s+dx,top:s+dy});
  layers.push({input:fill.data,left:s,top:s});
  return sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}
// 반지름 r 둘레의 16방향 오프셋(외곽선이 둥글게 보이도록).
function ring8(r:number):Array<[number,number]> {
  return Array.from({length:16},(_,i)=>{const a=(Math.PI*2*i)/16;return [Math.round(Math.cos(a)*r),Math.round(Math.sin(a)*r)] as [number,number];});
}

// 원격 누끼(Higgsfield 배경 제거) 결과를 렌더 동안 꺼내 쓰는 보관소. 렌더는 동기 흐름이라 렌더 안에서 외부를 부르지 않고,
// 카드 생성 라우트가 렌더 전에 받아 둔 투명 PNG를 원본 사진의 sha1 열쇠로 넣어 둔다(features/images/remoteCutout.ts).
// 렌더가 받는 사진은 보정(photoEnhance)을 거쳐 바이트가 달라지므로, sha1이 안 맞으면 밝기 차이 지문(dHash 64비트)과
// 가로세로 비율로 같은 사진을 찾는다. 지문은 밝기·색 보정에는 거의 안 바뀌고 다른 사진끼리는 크게 다르다.
// 서버 메모리만 쓰므로 오래된 것부터 지워 크기를 묶는다. 영구 캐시는 remoteCutout.ts의 저장소 캐시가 맡는다.
type PreparedCutout={png:Buffer;print:Uint8Array;aspect:number};
const PREPARED_CUTOUTS=new Map<string,PreparedCutout>();
const PREPARED_LIMIT=48;
export const cutoutKey=(input:Buffer):string=>createHash("sha1").update(input).digest("hex");
async function fingerprint(input:Buffer):Promise<{print:Uint8Array;aspect:number}> {
  const meta=await sharp(input).rotate().metadata();
  const turned=(meta.orientation??1)>=5;
  const w=(turned?meta.height:meta.width)??1,h=(turned?meta.width:meta.height)??1;
  const grey=await sharp(input).rotate().greyscale().resize(9,8,{fit:"fill"}).raw().toBuffer();
  const print=new Uint8Array(64);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)print[y*8+x]=grey[y*9+x]<grey[y*9+x+1]?1:0;
  return {print,aspect:w/h};
}
export async function registerPreparedCutout(original:Buffer,png:Buffer):Promise<void> {
  const key=cutoutKey(original);
  PREPARED_CUTOUTS.delete(key);
  PREPARED_CUTOUTS.set(key,{png,...await fingerprint(original)});
  while(PREPARED_CUTOUTS.size>PREPARED_LIMIT)PREPARED_CUTOUTS.delete(PREPARED_CUTOUTS.keys().next().value!);
}
export const hasPreparedCutout=(original:Buffer):boolean=>PREPARED_CUTOUTS.has(cutoutKey(original));
export const clearPreparedCutouts=():void=>PREPARED_CUTOUTS.clear();
async function preparedCutoutFor(input:Buffer):Promise<Buffer|null> {
  if(!PREPARED_CUTOUTS.size)return null;
  const exact=PREPARED_CUTOUTS.get(cutoutKey(input));
  if(exact)return exact.png;
  const {print,aspect}=await fingerprint(input);
  let best:{png:Buffer;distance:number}|null=null;
  for(const entry of PREPARED_CUTOUTS.values()){
    if(Math.abs(entry.aspect/aspect-1)>.02)continue;
    let distance=0;
    for(let i=0;i<64;i++)distance+=entry.print[i]^print[i];
    if(distance<=8&&(!best||distance<best.distance))best={png:entry.png,distance};
  }
  return best?.png??null;
}

// 미리 받은 원격 누끼를 이 렌더의 사진 크기에 맞춘다. 원격 결과는 보정 전 원본에서 나왔으므로, 비율이 같으면 그 알파만 빌려
// 렌더가 받은 (보정된) 사진에 씌워 다른 장과 색을 맞춘다. 비율이 다르면(원격이 잘라 낸 경우) 원격 결과를 그대로 쓴다.
// 지운 비율이 이상하면(거의 다 지웠거나 거의 안 지움) 원격 결과가 틀린 것으로 보고 null → 로컬 누끼로 넘어간다.
async function fromPreparedCutout(input:Buffer,prepared:Buffer,maxSide:number):Promise<{data:Buffer;width:number;height:number}|null> {
  const {data,info}=await sharp(input).rotate().resize(maxSide,maxSide,{fit:"inside"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const meta=await sharp(prepared).metadata();
  if(!meta.width||!meta.height)return null;
  let rgba:Buffer;
  if(Math.abs(meta.width/meta.height-info.width/info.height)<.02){
    const alpha=await sharp(prepared).ensureAlpha().extractChannel(3).resize(info.width,info.height,{fit:"fill"}).raw().toBuffer();
    for(let p=0;p<info.width*info.height;p++)data[p*4+3]=alpha[p];
    rgba=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
  }else rgba=await sharp(prepared).ensureAlpha().resize(maxSide,maxSide,{fit:"inside"}).png().toBuffer();
  const {data:pixels,info:size}=await sharp(rgba).raw().toBuffer({resolveWithObject:true});
  let clear=0;
  for(let p=0;p<size.width*size.height;p++)if(pixels[p*4+3]<16)clear++;
  const ratio=clear/(size.width*size.height);
  if(ratio<.05||ratio>.92)return null;
  const trimmed=await sharp(rgba).trim({threshold:1}).png().toBuffer({resolveWithObject:true});
  return {data:trimmed.data,width:trimmed.info.width,height:trimmed.info.height};
}

// 사진의 배경을 지워 음식만 남긴다(누끼). 가장자리 픽셀의 평균색과 비슷한 영역을 바깥에서부터 지워 나간다.
// 단색에 가까운 배경(스튜디오 사진, 흰 접시 뒤 단색 테이블)에서 잘 되고, 복잡한 배경이면 지운 비율이 이상해
// null을 돌려준다. 그러면 스타일은 원형 스티커 사진으로 대신 그린다.
export async function cutoutPhoto(input:Buffer,maxSide:number):Promise<{data:Buffer;width:number;height:number}|null> {
  // 설정에서 원격 누끼를 켰고 카드 생성 라우트가 이 사진의 누끼를 미리 받아 두었으면 그것을 먼저 쓴다(렌더 중에는 조회만).
  // 설정이 꺼져 있으면 보관소를 보지 않는다(검수 스크립트·테스트는 늘 로컬 누끼).
  if(currentRemoteCutout()){
    const prepared=await preparedCutoutFor(input).catch(()=>null);
    if(prepared){const remote=await fromPreparedCutout(input,prepared,maxSide).catch(()=>null);if(remote)return remote;}
  }
  const {data,info}=await sharp(input).rotate().resize(maxSide,maxSide,{fit:"inside"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:W,height:H}=info;
  const at=(x:number,y:number)=>(y*W+x)*4;
  let r=0,g=0,b=0,n=0;
  for(let x=0;x<W;x++)for(const y of [0,H-1]){const i=at(x,y);r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
  for(let y=0;y<H;y++)for(const x of [0,W-1]){const i=at(x,y);r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
  r/=n;g/=n;b/=n;
  // 가장자리 색이 들쭉날쭉하면(식탁 위 반찬 그릇, 어두운 나무결처럼) 배경이 단색이 아니므로 누끼를 포기한다.
  // 가장자리 픽셀이 평균색에서 평균적으로 얼마나 떨어졌는지 보고 기준(40)을 넘으면 null.
  // 기준이 30이던 때는 사진 보정(대비·vibrance) 뒤 단색 스튜디오 사진이 30.7로 넘어 누끼가 실패했다.
  // 샘플 실측: 단색 배경 19~31, 식탁·손 사진 94 이상이라 40이면 둘 사이에 여유가 크다.
  let spread=0;
  for(let x=0;x<W;x++)for(const y of [0,H-1]){const i=at(x,y);spread+=Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);}
  for(let y=0;y<H;y++)for(const x of [0,W-1]){const i=at(x,y);spread+=Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);}
  if(spread/n>40)return null;
  // 배경이 고를수록 기준을 좁힌다. 밝은 회색 배경 위 흰 접시처럼 배경과 비슷한 물체를 함께 지우지 않도록.
  const limit=Math.max(18,Math.min(46,(spread/n)*2+12));
  const fromMean=(i:number)=>Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);
  const between=(i:number,j:number)=>Math.hypot(data[i]-data[j],data[i+1]-data[j+1],data[i+2]-data[j+2]);
  // 배경으로 볼 조건: 가장자리 평균색과 가깝거나(limit 미만), 이미 지운 이웃과 거의 같은 색이면서(3 미만) 평균에서 너무 멀지 않음(limit+20 미만).
  // 두 번째 조건 덕분에 스튜디오 사진처럼 위에서 아래로 밝기가 서서히 바뀌는 배경도 따라가며 지운다.
  const close=(i:number,parent:number)=>{const d=fromMean(i);return d<limit||(parent>=0&&d<limit+20&&between(i,parent)<3);};
  const removed=new Uint8Array(W*H);
  // [픽셀, 이 픽셀로 오게 한 이웃 픽셀] 쌍을 쌓는다. 가장자리에서 시작하는 픽셀은 이웃이 없다(-1).
  const stack:number[]=[];
  for(let x=0;x<W;x++){stack.push(x,-1,(H-1)*W+x,-1);}
  for(let y=0;y<H;y++){stack.push(y*W,-1,y*W+W-1,-1);}
  // 윤곽선 장벽: 밝기가 급하게 바뀌는 자리(접시 테두리, 음식 윤곽)를 찾아 두 픽셀 두껍게 만든다.
  // 지우기는 이 장벽을 넘지 못하므로, 배경과 비슷한 흰 접시라도 테두리의 작은 틈으로 새어 들어가 지워지지 않는다.
  const lum=new Float32Array(W*H);
  for(let p=0;p<W*H;p++)lum[p]=data[p*4]*.299+data[p*4+1]*.587+data[p*4+2]*.114;
  let barrier=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x;if(Math.abs(lum[p+1]-lum[p-1])+Math.abs(lum[p+W]-lum[p-W])>16)barrier[p]=1;}
  for(let pass=0;pass<2;pass++){
    const grown=barrier.slice();
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x;if(barrier[p-1]||barrier[p+1]||barrier[p-W]||barrier[p+W])grown[p]=1;}
    barrier=grown;
  }
  while(stack.length){
    const parent=stack.pop()!,p=stack.pop()!;
    if(removed[p]||barrier[p]||!close(p*4,parent<0?-1:parent*4))continue;
    removed[p]=1;
    const x=p%W,y=(p-x)/W;
    if(x>0)stack.push(p-1,p);if(x<W-1)stack.push(p+1,p);if(y>0)stack.push(p-W,p);if(y<H-1)stack.push(p+W,p);
  }
  // 장벽 때문에 배경 쪽에 남은 2~3픽셀 띠: 지운 픽셀과 맞닿아 있고 배경색에 가까우면 몇 번에 걸쳐 마저 지운다.
  for(let pass=0;pass<3;pass++){
    const next=removed.slice();
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const p=y*W+x;
      if(!removed[p]&&barrier[p]&&(removed[p-1]||removed[p+1]||removed[p-W]||removed[p+W])&&fromMean(p*4)<limit+12)next[p]=1;
    }
    removed.set(next);
  }
  // 남은 부분(음식)의 볼록 껍질 안쪽은 모두 살린다. 배경과 색이 비슷한 흰 접시는 위에서 군데군데 지워지기 쉬운데,
  // 접시 조각이 테두리까지 남아 있으면 껍질이 접시 원 전체를 감싸 접시가 온전히 돌아온다.
  // 껍질을 잡기 전에 외톨이 점(배경에 남은 잡티)은 빼서 껍질이 엉뚱하게 커지지 않게 한다.
  const solid=(p:number)=>!removed[p]&&!removed[p-1]&&!removed[p+1]&&!removed[p-W]&&!removed[p+W];
  const points:Array<[number,number]>=[];
  for(let y=2;y<H-2;y++){
    let left=-1,right=-1;
    for(let x=2;x<W-2;x++)if(solid(y*W+x)){if(left<0)left=x;right=x;}
    if(left>=0)points.push([left,y],[right,y]);
  }
  if(points.length<6)return null;
  const hull=convexHull(points);
  const mask=await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><polygon points="${hull.map(([x,y])=>`${x},${y}`).join(" ")}" fill="#fff"/></svg>`)).extractChannel(0).raw().toBuffer();
  let kept=0;
  for(let p=0;p<W*H;p++){if(mask[p]>127){removed[p]=0;kept++;}else removed[p]=1;}
  const ratio=1-kept/(W*H);
  if(ratio<.12||ratio>.85)return null;
  shaveFloorShadow(data,removed,W,H,[r,g,b]);
  // 가장자리 1px 수축: 경계 픽셀에는 바탕색이 반쯤 섞여 있어(안티에일리어싱) 남겨 두면 색 바탕 위에서 회색 테두리가 된다.
  // 지운 픽셀과 맞닿은 살린 픽셀을 한 겹 지워 가장 많이 섞인 띠를 버리고, 남은 띠는 decontaminateEdge가 바탕색을 빼 되살린다.
  const edge:number[]=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x;if(!removed[p]&&(removed[p-1]||removed[p+1]||removed[p-W]||removed[p+W]))edge.push(p);}
  for(const p of edge)removed[p]=1;
  decontaminateEdge(data,removed,W,H,[r,g,b]);
  for(let p=0;p<W*H;p++)if(removed[p])data[p*4+3]=0;
  // 가장자리를 살짝 부드럽게(알파만 흐리게) 해서 계단 모양을 줄인다.
  // 알파만 따로 꺼내 흐린 뒤 원래 RGBA에 다시 써 넣는다. (joinChannel로 PNG 알파를 붙이면 알파가 빠진 3채널이 될 수 있어
  // 픽셀 배열에서 직접 합친다.) 흐림으로 반투명해진 바깥 픽셀은 decontaminateEdge가 안쪽 색을 미리 칠해 두어 테두리가 물들지 않는다.
  // 아주 옅은 픽셀(알파<24)은 지운다.
  const alpha=await sharp(Buffer.from(Array.from({length:W*H},(_,p)=>data[p*4+3])),{raw:{width:W,height:H,channels:1}}).blur(1.2).extractChannel(0).raw().toBuffer();
  for(let p=0;p<W*H;p++)data[p*4+3]=alpha[p]<24?0:alpha[p];
  const smooth=await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
  const trimmed=await sharp(smooth).trim({threshold:1}).png().toBuffer({resolveWithObject:true});
  return {data:trimmed.data,width:trimmed.info.width,height:trimmed.info.height};
}

// 접시 바깥 바닥 그림자 깎기: 볼록 껍질은 접시 옆에 드리운 그림자까지 감싸 스티커 아래·옆에 갈색·회색 덩어리가 붙는다.
// 그림자는 "바탕색을 어둡게 한 색"(밝기만 낮고 색 비율은 바탕과 같음)이라 그런 픽셀을 뺀 나머지(접시·음식)로 타원을 맞추고,
// 타원 바깥에 있는 그림자 같은 픽셀만 지운다. 타원 안쪽(접시 위 어두운 음식)은 건드리지 않는다.
// 남은 부분이 타원 모양이 아니면(그릇 여러 개, 네모 도마) 엉뚱하게 깎을 수 있어 아무것도 하지 않는다.
function hueSat(r:number,g:number,b:number):[number,number] {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  if(!max||!d)return [0,0];
  const h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return [h*60,d/max];
}
function shaveFloorShadow(data:Buffer,removed:Uint8Array,W:number,H:number,bg:[number,number,number]):void {
  const bgLum=bg[0]*.299+bg[1]*.587+bg[2]*.114||1,bgHsv=hueSat(bg[0],bg[1],bg[2]);
  // 그림자는 바탕보다 어둡고 색이 진해지지만 색상(hue)은 거의 같다(살구색 바탕 → 갈색 그림자). 회색 바탕이면 그림자도 무채색이다.
  const shadowLike=(p:number)=>{
    const i=p*4;
    // 그림자 끝의 옅은 번짐은 거의 바탕색이다. 볼록 껍질이 다시 살려 둔 바탕색 픽셀도 함께 깎는다.
    // 회색 바탕이면 흰 접시 테두리 음영도 바탕색과 비슷해 깎이므로 색 있는 바탕에서만 쓴다.
    if(bgHsv[1]>=.12&&Math.hypot(data[i]-bg[0],data[i+1]-bg[1],data[i+2]-bg[2])<28)return true;
    const k=(data[i]*.299+data[i+1]*.587+data[i+2]*.114)/bgLum;
    if(k<.3||k>.93)return false;
    const [h,sat]=hueSat(data[i],data[i+1],data[i+2]);
    if(bgHsv[1]<.12)return sat<.18;
    const dh=Math.min(Math.abs(h-bgHsv[0]),360-Math.abs(h-bgHsv[0]));
    return dh<12&&sat>=bgHsv[1]*.6;
  };
  let n=0,sx=0,sy=0;
  const shade=new Uint8Array(W*H);
  for(let p=0;p<W*H;p++){if(removed[p])continue;if(shadowLike(p)){shade[p]=1;continue;}n++;sx+=p%W;sy+=Math.floor(p/W);}
  if(n<200)return;
  const cx=sx/n,cy=sy/n;
  let xx=0,yy=0,xy=0;
  for(let p=0;p<W*H;p++){if(removed[p]||shade[p])continue;const dx=p%W-cx,dy=Math.floor(p/W)-cy;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
  xx/=n;yy/=n;xy/=n;
  // 공분산의 고유값으로 타원 반지름을 구한다(꽉 찬 타원이면 반지름 = 2√고유값).
  const tr=(xx+yy)/2,det=Math.sqrt(Math.max(0,((xx-yy)/2)**2+xy*xy));
  const a=2*Math.sqrt(tr+det),b=2*Math.sqrt(Math.max(1e-6,tr-det)),theta=.5*Math.atan2(2*xy,xx-yy);
  if(!(a>8&&b>8))return;
  const cos=Math.cos(theta),sin=Math.sin(theta);
  const reach=(p:number)=>{const dx=p%W-cx,dy=Math.floor(p/W)-cy,u=dx*cos+dy*sin,v=-dx*sin+dy*cos;return (u/a)**2+(v/b)**2;};
  let inside=0;
  for(let p=0;p<W*H;p++)if(!removed[p]&&!shade[p]&&reach(p)<=1.06)inside++;
  // 타원 모양 판정: 접시·음식의 93% 이상이 타원 안에 있고, 타원 넓이의 88% 이상을 채운다.
  if(inside/n<.93||n/(Math.PI*a*b)<.88)return;
  const cut:number[]=[];
  // 색 있는 바탕이면 그림자(같은 색상의 진한 색)와 흰·회색 접시 테두리가 확실히 구별돼 타원 바로 바깥부터 깎는다.
  // 회색 바탕이면 접시 테두리 음영도 그림자처럼 보여 4% 여유를 둔다.
  const margin=bgHsv[1]>=.12?1.005:1.04;
  for(let p=0;p<W*H;p++)if(shade[p]&&reach(p)>margin**2)cut.push(p);
  // 깎을 몫이 지나치게 크면(남은 부분의 절반 넘게) 판정이 틀렸을 수 있으니 그대로 둔다.
  if(cut.length>n*.5)return;
  for(const p of cut)removed[p]=1;
  // 깎고 나면 그림자 자리에 떨어진 작은 섬(잡티)이 남을 수 있다. 타원 중심에서 이어진 덩어리만 남긴다.
  const start=Math.round(cy)*W+Math.round(cx);
  if(removed[start])return;
  const seen=new Uint8Array(W*H),stack=[start];
  seen[start]=1;
  while(stack.length){
    const p=stack.pop()!,x=p%W;
    for(const q of [x>0?p-1:-1,x<W-1?p+1:-1,p-W,p+W])if(q>=0&&q<W*H&&!seen[q]&&!removed[q]){seen[q]=1;stack.push(q);}
  }
  for(let p=0;p<W*H;p++)if(!seen[p])removed[p]=1;
}

// 헤일로 제거(디컨태미네이션): 가장자리 2px 띠의 픽셀에는 바탕색이 섞여 있어 색 바탕 위에 올리면 회색·흰 테두리가 보인다.
// 1) 안쪽(가장자리에서 3px 이상 들어간) 깨끗한 색을 바깥으로 번져 띠와 그 바깥 3px까지 "가까운 안쪽 색" F를 정한다.
// 2) 띠의 픽셀 c를 바탕색 B와 F를 잇는 선에 투영해 섞인 비율 t를 구하고, 바탕 몫(1−t)·B를 빼고 t로 나눠 원래 색을 되살린다.
//    t가 너무 작으면(거의 바탕) 나눗셈이 잡음을 키우므로 F를 그대로 쓴다. F와 B가 거의 같으면(흰 접시·흰 바탕) 건드리지 않는다.
// 3) 지운 쪽 3px에는 F를 칠해 둔다. 알파를 흐리면 이 픽셀들이 반투명하게 살아나는데, 원래 색(바탕·그림자)이 아니라 안쪽 색으로 보인다.
function decontaminateEdge(data:Buffer,removed:Uint8Array,W:number,H:number,bg:[number,number,number]):void {
  const N=W*H,BAND=3;
  // 지운 영역에서의 거리(살린 픽셀, 최대 BAND)와 살린 영역에서의 거리(지운 픽셀, 최대 BAND)를 함께 잰다.
  const dist=new Uint8Array(N).fill(255);
  let frontier:number[]=[];
  for(let p=0;p<N;p++){
    const x=p%W;
    const touches=(q:number)=>q>=0&&q<N&&removed[q]!==removed[p];
    if(touches(p-W)||touches(p+W)||(x>0&&touches(p-1))||(x<W-1&&touches(p+1))){dist[p]=1;frontier.push(p);}
  }
  for(let d=2;d<=BAND&&frontier.length;d++){
    const next:number[]=[];
    for(const p of frontier){const x=p%W;for(const q of [p-W,p+W,x>0?p-1:-1,x<W-1?p+1:-1])if(q>=0&&q<N&&dist[q]===255&&removed[q]===removed[p]){dist[q]=d;next.push(q);}}
    frontier=next;
  }
  // 안쪽 색 번지기: 띠 밖의 살린 픽셀(dist 255)이 씨앗. 띠(dist≤BAND)로 한 겹씩 넓혀 가며 이웃 씨앗의 색을 물려준다.
  const owner=new Int32Array(N).fill(-1);
  frontier=[];
  for(let p=0;p<N;p++)if(!removed[p]&&dist[p]===255){owner[p]=p;}
  for(let p=0;p<N;p++){
    if(owner[p]<0||dist[p]!==255)continue;
    const x=p%W;
    for(const q of [p-W,p+W,x>0?p-1:-1,x<W-1?p+1:-1])if(q>=0&&q<N&&dist[q]!==255){frontier.push(p);break;}
  }
  for(let step=0;step<BAND*2+1&&frontier.length;step++){
    const next:number[]=[];
    for(const p of frontier){const x=p%W;for(const q of [p-W,p+W,x>0?p-1:-1,x<W-1?p+1:-1])if(q>=0&&q<N&&owner[q]<0&&dist[q]!==255){owner[q]=owner[p];next.push(q);}}
    frontier=next;
  }
  for(let p=0;p<N;p++){
    const source=owner[p];
    if(source<0||source===p)continue;
    const i=p*4,f=source*4;
    if(removed[p]){data[i]=data[f];data[i+1]=data[f+1];data[i+2]=data[f+2];continue;}
    const d0=data[f]-bg[0],d1=data[f+1]-bg[1],d2=data[f+2]-bg[2],len=d0*d0+d1*d1+d2*d2;
    if(len<100)continue;
    const t=Math.max(0,Math.min(1,((data[i]-bg[0])*d0+(data[i+1]-bg[1])*d1+(data[i+2]-bg[2])*d2)/len));
    if(t>=.95)continue;
    if(t<.3){data[i]=data[f];data[i+1]=data[f+1];data[i+2]=data[f+2];continue;}
    for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,Math.round((data[i+c]-(1-t)*bg[c])/t)));
  }
}

// 누끼 둘레에 흰 스티커 테두리를 두르고(알파를 번지게 해 키운 흰 실루엣), 아래에 그림자를 깐다.
//   shadow+shadowOffset : 팝아트식 딱딱한 그림자(같은 실루엣을 진한 색으로 오른쪽 아래에). 컬러 블록·팝업북의 문법.
//   contact             : 바닥에 "붙어 있는" 느낌의 부드러운 접촉 그림자. 실루엣 알파를 세로로 .3배 눌러 아래쪽에 깔고
//                         blur 10·불투명 .35로 번지게 한다(공중에 뜬 스티커처럼 보이지 않게). 딱딱한 그림자와 함께 써도 된다.
export async function stickerize(cutout:{data:Buffer;width:number;height:number},options:{border?:number;shadow?:string;shadowOffset?:number;contact?:boolean}={}):Promise<Layer> {
  const border=options.border??14,offset=options.shadow?options.shadowOffset??14:0;
  const pad=border*2+offset;
  const W=cutout.width+pad*2,H=cutout.height+pad*2;
  const padded=await sharp(cutout.data).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  // blur와 threshold를 한 파이프라인에 두면 sharp가 threshold를 먼저 적용해 실루엣이 흐릿하게 번진다(흰 테두리가 글로우처럼,
  // 딱딱한 그림자가 흐린 그림자처럼 보임). 흐린 결과를 버퍼로 한 번 끊은 뒤 threshold를 건다.
  const blurred=await sharp(padded).extractChannel(3).blur(border*.6).toBuffer();
  const alpha=await sharp(blurred).threshold(8).toBuffer();
  const silhouette=(color:string)=>sharp({create:{width:W,height:H,channels:3,background:color}}).joinChannel(alpha).png().toBuffer();
  const layers:OverlayOptions[]=[];
  const CONTACT=options.contact?24:0;
  if(options.contact){
    // 실루엣 아래 1/3 높이로 눌러 납작한 그림자를 만들고 바닥(실루엣 아랫단) 쪽에 둔다.
    const squashed=await sharp(await silhouette("#000000")).resize(W,Math.max(1,Math.round(H*.3)),{fit:"fill"}).blur(10).ensureAlpha().linear([1,1,1,.35],[0,0,0,0]).png().toBuffer();
    layers.push({input:squashed,left:0,top:Math.round(H*.7)+CONTACT-pad});
  }
  if(options.shadow)layers.push({input:await silhouette(options.shadow),left:offset,top:offset});
  layers.push({input:await silhouette("#ffffff"),left:0,top:0},{input:padded,left:0,top:0});
  return sharp({create:{width:W+offset,height:H+offset+CONTACT,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}

// 누끼가 실패했을 때(식탁 위 여러 그릇처럼 배경이 단색이 아닐 때) 쓰는 대체 모양: 사진을 1.15배 가깝게 잘라
// 손으로 오린 듯한 둥근 블롭(가장자리가 조금씩 불룩한 원)으로 오린다. 검은 원보다 "오려 붙인 스티커"에 가깝게 보인다.
// seed가 같으면 모양도 같다(같은 입력 → 같은 그림). 결과는 stickerize에 그대로 넘길 수 있다.
export async function blobCutout(input:Buffer,size:number,seed:number):Promise<{data:Buffer;width:number;height:number}> {
  const S=Math.round(size);
  const photo=await finishPhoto(input,S,S,{zoom:1.15});
  const rand=seeded(seed);
  const N=10,cx=S/2,cy=S/2,base=S*.46;
  const radii=Array.from({length:N},()=>base*(.9+rand()*.1));
  const point=(i:number)=>{const a=(i/N)*Math.PI*2-Math.PI/2,rr=radii[i%N];return [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr];};
  // 꼭짓점 사이를 2차 베지어로 이어 매끈한 블롭을 만든다(각 변의 가운데를 지나도록).
  let d="";
  for(let i=0;i<N;i++){
    const [x0,y0]=point(i),[x1,y1]=point(i+1);
    const mx=(x0+x1)/2,my=(y0+y1)/2;
    d+=i===0?`M${mx.toFixed(1)} ${my.toFixed(1)}`:"";
    const [x2,y2]=point(i+2);
    d+=`Q${x1.toFixed(1)} ${y1.toFixed(1)} ${((x1+x2)/2).toFixed(1)} ${((y1+y2)/2).toFixed(1)}`;
  }
  const mask=Buffer.from(`<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg"><path d="${d}Z" fill="#fff"/></svg>`);
  const shaped=await sharp(photo).ensureAlpha().composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
  const trimmed=await sharp(shaped).trim({threshold:1}).png().toBuffer({resolveWithObject:true});
  return {data:trimmed.data,width:trimmed.info.width,height:trimmed.info.height};
}

// 들어가는 가장 큰 크기의 외곽선 글자. 크기·균형 폭은 chooseTitleLayout으로 정하고(외곽선 두께만큼 높이 여유를 뺀다)
// 그 크기·폭으로 외곽선을 한 번만 그린다.
export async function fitOutlined(value:string,options:Omit<Parameters<typeof outlinedText>[1],"size">&{sizes:number[];maxHeight:number}):Promise<Layer> {
  const extra=options.strokeWidth*2+(options.shadow?Math.round(options.strokeWidth*1.6):0);
  const layout=await chooseTitleLayout(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-extra,font:options.font,align:options.align,spacing:size=>options.spacing??Math.round(size*.1)});
  return outlinedText(layout.text,{...options,size:layout.size,width:layout.width});
}

// 입체(돌출) 글자. 같은 글자를 진한 색으로 오른쪽 아래로 1px씩 depth번 겹쳐 찍어 두께를 만들고, 맨 위에 본래 색을 얹는다.
// 팝업북·키치 제목처럼 화면에서 튀어나와 보이는 글자에 쓴다.
export async function extrudedText(value:string,options:{sizes:number[];maxHeight:number;width:number;font:Font;fill:string;side:string;depth:number;align?:"left"|"centre";spacing?:number}):Promise<Layer> {
  const face=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-options.depth,color:options.fill,font:options.font,align:options.align,spacing:options.spacing});
  const side=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-options.depth,color:options.side,font:options.font,align:options.align,spacing:options.spacing});
  const d=options.depth;
  const layers:OverlayOptions[]=Array.from({length:d},(_,i)=>({input:side.data,left:d-i,top:d-i}));
  layers.push({input:face.data,left:0,top:0});
  return sharp({create:{width:face.info.width+d,height:face.info.height+d,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}

// 레이어를 투명 배경으로 기울인다(폴라로이드·키치 사진·스티커).
export const rotated=async(input:Buffer,degrees:number):Promise<Layer>=>sharp(input).rotate(degrees,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});

// 필름 사진 느낌: 채널별 곱셈으로 따뜻하게(tint는 단색 사진이 되므로 쓰지 않는다), 가장자리를 어둡게(비네트), 한쪽에 빛샘.
// 예전 값(채도 .88·파랑 .88·비네트 .45·주황 빛샘 .55)은 홍어 살을 탁한 주황으로 바꿔 놓아(studio-hongeo 189/163/173 →
// 193/131/108) 강도별 프리셋으로 나눴다. 빛샘 색도 진한 주황(#FF7A1A)에서 살구빛(#FFB04A)으로 바꿨다.
//   strong: 필름 표지(분위기가 주인공)  light: 필름 본문 장  diary: 다이어리 폴라로이드(사진이 작아 색을 거의 그대로)
const FILM_PRESETS={
  strong:{saturation:.95,gain:[1.04,1,.92],offset:[10,6,2],vignette:.32,leak:.4},
  light:{saturation:.97,gain:[1.02,.98,.94],offset:[12,8,5],vignette:.26,leak:.3},
  diary:{saturation:1.02,gain:[1.02,1,.96],offset:[6,4,2],vignette:.22,leak:.22},
} as const;
export type FilmPreset=keyof typeof FILM_PRESETS;
export async function filmPhoto(input:Buffer,width:number,height:number,leak:"left"|"right"="right",preset:FilmPreset="strong"):Promise<Buffer> {
  width=Math.round(width);height=Math.round(height);
  const look=FILM_PRESETS[preset];
  const base=await sharp(await finishPhoto(input,width,height)).modulate({saturation:look.saturation}).linear([...look.gain],[...look.offset]).png().toBuffer();
  const lx=leak==="right"?width:0;
  const overlay=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="v" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${look.vignette}"/></radialGradient><radialGradient id="l" cx="${lx}" cy="${height*.2}" r="${width*.6}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB04A" stop-opacity="${look.leak}"/><stop offset="1" stop-color="#FFB04A" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/><rect width="100%" height="100%" fill="url(#l)"/></svg>`);
  return sharp(base).composite([{input:overlay,left:0,top:0}]).png().toBuffer();
}

// sharp는 레이어 위치가 정수여야 한다. 계산 중 생긴 소수(높이의 절반 등)를 마지막에 한 번에 반올림한다.
export const snap=(layers:OverlayOptions[]):OverlayOptions[]=>layers.map(layer=>({...layer,...(layer.left!==undefined?{left:Math.round(layer.left)}:{}),...(layer.top!==undefined?{top:Math.round(layer.top)}:{})}));

// 점들의 볼록 껍질(가장 바깥 점들을 이은 다각형). 단조 사슬(Andrew) 방식: x로 정렬해 아래·위 사슬을 만든다.
function convexHull(points:Array<[number,number]>):Array<[number,number]> {
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o:[number,number],a:[number,number],b:[number,number])=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const chain=(list:Array<[number,number]>)=>{const out:Array<[number,number]>=[];for(const p of list){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}out.pop();return out;};
  return [...chain(sorted),...chain([...sorted].reverse())];
}
