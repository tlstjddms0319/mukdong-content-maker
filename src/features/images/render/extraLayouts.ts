import sharp, { type OverlayOptions } from "sharp";
import type { CarouselSlidePlan } from "../carousel";
import { STORE_NAME } from "../slideLayout";
import { inkOn, mutedOn, readableOn } from "../design";
import { CONTENT, FONTS, MARGIN, META, brandName, canvas, cleanPoints, croppedPhoto, currentTheme, currentVariant, grainLayer, mascotLayer, pointLayers, ring, softShadow, sparkles, svg, svgLayer, textLayer, washiTape, wavyUnderline, type CardRenderer, type Layer } from "./primitives";
import { MIN_STROKE, closingBlock, emphasisOf, fitText, nextCue, teaserText } from "../styles/shared";
import { registerPhoto } from "./audit";
import { ROLE_POSES, contactShadow, propLayer, shadowLayer, textureLayer, type PropName, type TextureName } from "../decor";

// 추가 레이아웃 8종: 잡지 편집형, 반반 분할, 폴라로이드, 영수증, 체크리스트, 타임라인, 큰 글자 포스터, 원형 사진.
// 모두 같은 원칙을 따른다. ① 글자 레이어를 먼저 그려 높이를 잰다 ② 남는 높이에 맞춰 사진·간격을 정한다
// ③ 채널명과 장 번호는 다른 카드와 같은 자리(아래 왼쪽·오른쪽)에 둔다. 장식은 primitives의 테마 함수로 그려
// 게시물 테마(잡지·노트·포스터 등)에 따라 모양이 바뀐다.
// 이 파일 앞부분의 글자 크기·바닥글·표지 부제·넘겨 보기·명함 도구는 composeSlide.ts의 레이아웃 10종도 함께 쓴다.

export const FOOTER_TOP=1286;
const keywordLine=(slide:CarouselSlidePlan)=>slide.keywords.length?slide.keywords.map(word=>`#${word}`).join("  "):STORE_NAME;

// ── 글자 크기 단계(모듈러 스케일) ──────────────────────────────────────────────────────────
// 제목과 요점의 크기 차가 1.3~1.6배면 카드가 "문서"처럼 평평해 보인다. 표지 제목 88~100, 본문 장 제목 64~72(최소 56),
// 요점 36, 바닥글 26으로 두 배 이상 벌려 제목이 한눈에 먼저 읽히게 한다. 사다리는 큰 것부터 그려 보고 들어가는 첫 크기를 쓴다.
// 표지 사다리 끝의 80·72는 33자짜리 긴 훅처럼 88로는 상자를 넘는 경우의 마지막 대안이다(넘침·몰래 축소보다 낫다).
export const COVER_TITLE=[100,96,92,88,80,72];
export const BODY_TITLE=[72,68,64,60,56];
export const POINT=36;
const SUBLINE=36,TEASER=26;
// 자간은 조이지 않는다: 음수 letterSpacing이면 Pango가 그린 폭이 줄바꿈 폭보다 몇 px 넓어져, 균형 줄바꿈 측정(balanceWidth)이
// 좁은 폭에서 "몰래 축소"로 잘못 기록된다(64px·768px 제목에서 재현). 크기 차(2배 이상)만으로 위계를 만든다.

export const isCover=(slide:CarouselSlidePlan)=>slide.role==="cover";
export const isLast=(slide:CarouselSlidePlan,index:number,total:number)=>!isCover(slide)&&index===total;

// 제목: 균형 줄바꿈 + 핵심어 색 강조(키워드 중 제목에 든 낱말). renderSlideHeadline(primitives)은 강조를 넘길 수 없어
// 템플릿 레이아웃은 모두 이 함수로 제목을 그린다. accent는 제목이 놓인 바탕 위에서 3:1 이상 나오는 강조색이어야 한다.
export async function slideTitle(slide:CarouselSlidePlan,options:{sizes:number[];color:string;accent:string;maxHeight:number;width?:number;align?:"left"|"centre";balance?:boolean}):Promise<Layer> {
  const headline=slide.headline.replace(/\s+/g," ").trim();
  return fitText(headline,{sizes:options.sizes,width:options.width??CONTENT,maxHeight:options.maxHeight,color:options.color,font:FONTS.bold,align:options.align,balance:options.balance??true,
    emphasis:emphasisOf({headline,keywords:slide.keywords},options.accent)});
}

// 장 번호: 숫자 폭을 고정(tnum)해 "1 / 5"와 "10 / 10"이 흔들리지 않게 한다.
export const counterLayer=(index:number,total:number,color:string,shadow=false)=>
  textLayer(`${index} / ${total}`,{size:META,color,width:200,height:40,font:FONTS.semibold,features:"tnum",shadow});

// 표지 부제(제목 아래 한 줄, 길면 두 줄). 표지가 아니거나 부제가 없으면 null.
export async function sublineLayer(slide:CarouselSlidePlan,options:{color:string;width?:number;align?:"left"|"centre";shadow?:boolean}):Promise<Layer|null> {
  const text=isCover(slide)?(slide.subline??"").replace(/\s+/g," ").trim():"";
  return text?textLayer(text,{size:SUBLINE,color:options.color,width:options.width??CONTENT,height:SUBLINE*3,font:FONTS.semibold,align:options.align,spacing:8,shadow:options.shadow}):null;
}

// 표지 예고 띠("먹는 법 · 곁들임 · 방문 전 확인 — 5장"). 표지가 아니면 null.
export async function teaserLayer(slide:CarouselSlidePlan,total:number,color:string,shadow=false):Promise<Layer|null> {
  const text=isCover(slide)?teaserText(total):"";
  return text?textLayer(text,{size:TEASER,color,width:CONTENT,height:44,font:FONTS.semibold,shadow}):null;
}

// 넘겨 보기 ›: (x,y)에 놓는 글자 레이어와 화살표 SVG.
// backdrop: 사진 위에 놓을 때 글자 뒤에 반투명 검은 알약을 깐다(그림자 없는 26px 글자가 흰 사진에서 4.5:1을 넘게).
export async function cueAt(color:string,options:{backdrop?:boolean}={}):Promise<{width:number;height:number;place:(x:number,y:number)=>{layer:OverlayOptions;svg:string}}> {
  const cue=await nextCue(color,26);
  return {width:cue.width,height:cue.height,place:(x,y)=>{
    const X=Math.round(x),Y=Math.round(y);
    const pill=options.backdrop?`<rect x="${X-16}" y="${Y-8}" width="${cue.width+32}" height="${cue.height+16}" rx="${(cue.height+16)/2}" fill="#000" fill-opacity=".55"/>`:"";
    return {layer:{input:cue.label.data,left:X,top:Y},svg:pill+cue.arrow(X,Y)};
  }};
}

// 마지막 장 가게 명함. 흰 글자 알약은 강조색을 흰 글자와 4.5:1이 나오게 어둡게 맞춰 칠한다(밤 팔레트의 밝은 주황 등).
// place(cx, top, surface): surface는 1080×1350이 아닌 작은 판(일러스트의 흰 카드) 위에 놓을 때 그 크기. 가로 가운데 cx, 위 top에 워드마크·계정·칩을 차례로 놓는다. height는 SVG 알약까지 포함한 전체 높이.
export async function closingPlan(options:{color:string;accent:string;width?:number}):Promise<{height:number;place:(cx:number,top:number,surface?:{width:number;height:number})=>OverlayOptions[]}> {
  const block=await closingBlock({width:options.width??CONTENT,color:options.color,accent:readableOn(options.accent,"#ffffff",4.5),font:FONTS.bold});
  return {height:block.height,place:(cx,top,surface)=>{
    const layers:OverlayOptions[]=[{input:block.wordmark.data,left:Math.round(cx-block.wordmark.info.width/2),top:Math.round(top)}];
    let y=top+block.wordmark.info.height;
    if(block.handle){y+=8;layers.push({input:block.handle.data,left:Math.round(cx-block.handle.info.width/2),top:Math.round(y)});y+=block.handle.info.height;}
    // 칩 알약(padY 12) 위 여백 18.
    const chipX=Math.round(cx-block.chip.info.width/2),chipY=Math.round(y+18+12);
    layers.unshift(surface?{input:svg(surface.width,surface.height,block.chipSvg(chipX,chipY)),left:0,top:0}:svgLayer(block.chipSvg(chipX,chipY)));
    layers.push({input:block.chip.data,left:chipX,top:chipY});
    return layers;
  }};
}

// 바닥글 계획: 채널명(왼쪽)과 오른쪽 묶음을 한 줄에 둔다. 오른쪽은 장 역할에 따라
//   표지: 예고 띠(장 번호 "1 / 5"보다 뒤에 무엇이 나오는지가 넘길 이유가 된다)
//   본문: 장 번호 + 넘겨 보기 ›   마지막: 장 번호
// 긴 계정으로 한 줄에 안 들어가면 본문은 장 번호를 빼고 넘겨 보기만, 그래도 안 되면 넘겨 보기·예고 띠를 한 줄 위로 올린다.
// extra는 바닥글이 FOOTER 위로 더 차지하는 높이(0 또는 44). 레이아웃은 내용의 아래 끝을 그만큼 올린다.
export async function footerPlan(slide:CarouselSlidePlan,index:number,total:number,options:{ink:string;muted:string;accent?:string;left?:number;width?:number;top?:number;shadow?:boolean}):Promise<{extra:number;layers:OverlayOptions[]}> {
  const left=options.left??MARGIN,width=options.width??CONTENT,top=options.top??FOOTER_TOP,right=left+width,GAP=32,ROW=44;
  const shadow=options.shadow??false;
  const brand=await textLayer(brandName(),{size:META,color:options.muted,width,height:40,font:FONTS.regular,shadow});
  const layers:OverlayOptions[]=[{input:brand.data,left,top}];
  let extra=0,svg="";
  if(isCover(slide)){
    const teaser=await teaserLayer(slide,total,options.accent??options.ink,shadow);
    if(teaser){
      const inRow=brand.info.width+GAP+teaser.info.width<=width;
      if(!inRow)extra=ROW;
      layers.push({input:teaser.data,left:inRow?right-teaser.info.width:left,top:inRow?top:top-ROW});
    }
  }else if(index<total){
    const counter=await counterLayer(index,total,options.ink,shadow);
    const cue=await cueAt(options.ink,{backdrop:shadow});
    const both=counter.info.width+24+cue.width;
    if(brand.info.width+GAP+both<=width){
      const placed=cue.place(right-cue.width,top+Math.round((counter.info.height-cue.height)/2));
      layers.push({input:counter.data,left:right-both,top},placed.layer);svg+=placed.svg;
    }else if(brand.info.width+GAP+cue.width<=width){
      const placed=cue.place(right-cue.width,top);layers.push(placed.layer);svg+=placed.svg;
    }else{
      extra=ROW;
      const placed=cue.place(right-cue.width,top-ROW);layers.push(placed.layer);svg+=placed.svg;
    }
  }else{
    const counter=await counterLayer(index,total,options.ink,shadow);
    if(brand.info.width+GAP+counter.info.width<=width)layers.push({input:counter.data,left:right-counter.info.width,top});
  }
  if(svg)layers.unshift(svgLayer(svg));
  return {extra,layers};
}

// ── 테마별 바탕 질감(4단계 B6) ─────────────────────────────────────────────────────────────
// 손글씨 노트는 리넨, 레트로 메뉴판은 크라프트 종이 결을 바탕(canvas) 위·모든 글자 아래에 아주 옅게 깐다.
// 잡지·미니멀·포스터는 "깨끗한 인쇄면"이 문법이라 질감을 넣지 않는다(classic은 지금처럼 그레인만).
// 질감 파일이 없으면 null이 되어 예전처럼 그레인만 남는다(폴백). 이 레이어는 layers 맨 앞에 넣어야 사진·글자를 물들이지 않는다.
const THEME_TEXTURE:Partial<Record<ReturnType<typeof currentTheme>,{name:TextureName;opacity:number}>>={
  notebook:{name:"linen",opacity:.14},
  retro:{name:"kraft",opacity:.2},
};
export async function themeTexture():Promise<OverlayOptions|null> {
  const pick=THEME_TEXTURE[currentTheme()];
  return pick?textureLayer(pick.name,{opacity:pick.opacity}):null;
}
// 템플릿 레이아웃이 쓰는 바탕 캔버스: 테마 질감을 맨 아래에 끼운 뒤 canvas로 그린다.
export async function texturedCanvas(background:string,layers:OverlayOptions[]):Promise<Buffer> {
  const texture=await themeTexture();
  return canvas(background,texture?[texture,...layers]:layers);
}

// 사진 창 안쪽 그림자(얕게): 사진이 틀 "안으로" 살짝 들어가 보이게 한다. 진하면 음식 가장자리가 지저분해져 .2~.3 안에서 쓴다.
// decor.innerShadow(큰 가우스 번짐)는 900×860 창 하나에 200ms 가까이 들어 프레임 장 렌더 예산(+150ms)을 넘는다.
// 템플릿의 창은 모두 직각 사각형이라, 네 변에 안쪽으로 옅어지는 선형 그라데이션 띠를 깔아 같은 모양을 거의 공짜로 만든다.
// 빛이 위에서 온다고 보고 위 변을 조금 진하고 깊게, 아래 변은 옅게 둔다. 모서리는 두 띠가 겹쳐 자연스럽게 더 어두워진다.
let wellId=0;
export function photoWell(x:number,y:number,width:number,height:number,options:{depth?:number;opacity?:number}={}):string {
  const id=`well${wellId++}`,d=options.depth??26,o=options.opacity??.26;
  const grad=(key:string,x1:number,y1:number,x2:number,y2:number,alpha:number)=>`<linearGradient id="${id}${key}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="#000" stop-opacity="${(alpha).toFixed(3)}"/><stop offset=".45" stop-color="#000" stop-opacity="${(alpha*.35).toFixed(3)}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;
  const top=Math.round(d*1.3);
  return `<defs>${grad("t",0,0,0,1,o*1.25)}${grad("b",0,1,0,0,o*.6)}${grad("l",0,0,1,0,o)}${grad("r",1,0,0,0,o)}</defs>`
    +`<rect x="${x}" y="${y}" width="${width}" height="${top}" fill="url(#${id}t)"/><rect x="${x}" y="${y+height-d}" width="${width}" height="${d}" fill="url(#${id}b)"/>`
    +`<rect x="${x}" y="${y}" width="${d}" height="${height}" fill="url(#${id}l)"/><rect x="${x+width-d}" y="${y}" width="${d}" height="${height}" fill="url(#${id}r)"/>`;
}

// 큰 카드·사진 뒤 그림자. SVG 흐림(softShadow)은 큰 판 하나에 0.4~0.8초가 들어, 1/4 해상도로 굽고 캐시하는 shadowLayer를 쓴다.
// 단 잡지·미니멀(옅게)·포스터(딱딱한 그림자)는 THEME_KITS가 그림자 모양을 바꾸므로 그 테마에서는 테마 함수(softShadow)를 그대로 쓴다.
const FAST_SHADOW_THEMES=new Set(["classic","notebook","retro"]);
// shadowLayer는 번짐 여백까지 포함한 판이라 화면(1080×1350)보다 크거나 바깥으로 삐져나올 수 있다.
// sharp composite는 바탕보다 큰 그림·음수 좌표를 받지 않으므로 화면 안쪽만 잘라 낸다.
const clipCache=new Map<string,Promise<OverlayOptions>>();
async function clipToCanvas(layer:OverlayOptions&{left:number;top:number}):Promise<OverlayOptions> {
  const input=layer.input as Buffer;
  const meta=await sharp(input).metadata();
  const w=meta.width!,h=meta.height!;
  const x0=Math.max(0,layer.left),y0=Math.max(0,layer.top),x1=Math.min(1080,layer.left+w),y1=Math.min(1350,layer.top+h);
  if(x0===layer.left&&y0===layer.top&&x1===layer.left+w&&y1===layer.top+h)return layer;
  if(x1<=x0||y1<=y0)return svgLayer("");
  const key=`${w}x${h}:${layer.left}:${layer.top}:${input.length}`;
  if(!clipCache.has(key)){
    if(clipCache.size>32)clipCache.clear();
    clipCache.set(key,sharp(input).extract({left:x0-layer.left,top:y0-layer.top,width:x1-x0,height:y1-y0}).png().toBuffer().then(cut=>({input:cut,left:x0,top:y0})));
  }
  return clipCache.get(key)!;
}
export async function cardShadow(options:Parameters<typeof softShadow>[0]):Promise<OverlayOptions> {
  return FAST_SHADOW_THEMES.has(currentTheme())?clipToCanvas(await shadowLayer(options)):svgLayer(softShadow(options));
}

// 마스코트가 바닥에 닿는 자리의 납작한 그림자. 마스코트 레이어보다 먼저 깔아야 발 밑으로 들어간다.
// 그림 아래 끝에는 투명 여백이 조금 있어 발바닥 높이를 4% 올려 잡는다.
export const mascotContact=(mascot:{left:number;top:number;width:number;height:number},opacity=.24)=>
  contactShadow({cx:mascot.left+mascot.width/2,cy:mascot.top+mascot.height*.96,rx:mascot.width*.34,ry:Math.max(6,Math.round(mascot.width*.045)),opacity});

// 사진 없는 글자 장(브라우저·체크리스트·타임라인·영수증)에서 짧은 문안 때문에 남는 자리를 채우는 소품 스티커.
// 바탕만 보이던 150px 넘는 빈 띠를 "글을 늘리거나 장식으로 덮는" 대신, 장 내용과 맞는 메뉴 그림 한 점으로 채운다.
// 키워드(앞쪽 우선)와 제목에서 메뉴를 찾고, 못 찾으면 홍어 한 점. 소품 파일이 없으면 propLayer가 null을 돌려 그냥 비워 둔다.
const PROP_WORDS:[RegExp,PropName][]=[[/막걸리/,"makgeolli"],[/김치|묵은지/,"kimchi"],[/수육|삼합/,"suyuk"],[/홍어|가오리/,"skate"]];
export function fillerProps(slide:CarouselSlidePlan):PropName[] {
  const picked:PropName[]=[];
  for(const text of [...slide.keywords,slide.headline])for(const [pattern,name] of PROP_WORDS)if(pattern.test(text)&&!picked.includes(name))picked.push(name);
  for(const name of ["skate","makgeolli","kimchi"] as const)if(!picked.includes(name))picked.push(name);
  return picked;
}
// 빈 자리(box) 안에 소품 하나를 놓는다. box가 소품 최소 크기(높이 110)보다 작으면 null.
// align: 상자 안 가로 위치. 소품은 살짝 기울여 손으로 붙인 스티커처럼 보이게 한다.
export async function fillerProp(name:PropName,box:{left:number;top:number;width:number;height:number},options:{align?:"left"|"centre"|"right";rotate?:number;maxSize?:number}={}):Promise<(OverlayOptions&{left:number;top:number;width:number;height:number})|null> {
  // 기울이면 그림 상자가 커지므로 9할 크기로 그려 상자 안에 들어가게 한다.
  const size=Math.floor(Math.min(options.maxSize??240,box.width,box.height)*.9);
  if(size<110)return null;
  const prop=await propLayer(name,{width:size,maxHeight:size,left:0,top:0,rotate:options.rotate??-6});
  if(!prop)return null;
  const align=options.align??"centre";
  const left=align==="left"?box.left:align==="right"?box.left+box.width-prop.width:box.left+Math.round((box.width-prop.width)/2);
  return {...prop,left:Math.round(left),top:Math.round(box.top+(box.height-prop.height)/2)};
}

// 투명 PNG(마스코트)의 위쪽 빈 줄 수. 포즈 그림마다 위 여백이 달라 그림이 실제로 시작하는 높이에 맞춰 놓을 때 쓴다.
const inkTopCache=new WeakMap<Buffer,Promise<number>>();
function inkTop(buffer:Buffer):Promise<number> {
  if(!inkTopCache.has(buffer))inkTopCache.set(buffer,sharp(buffer).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true}).then(({data,info})=>{
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[y*info.width+x]>40)return y;
    return 0;
  }));
  return inkTopCache.get(buffer)!;
}

// 11. 잡지 편집형: 위쪽 가득 찬 사진, 아래 작은 머리글(키워드)·큰 제목·가는 선·본문 문단.
// 표지는 제목 아래 부제, 마지막 장은 바닥글 위에 가게 명함. 둘 다 사진 높이에서 자리를 뺀다.
const composeMagazine:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.paper,palette),muted=mutedOn(palette.paper,palette),accent=readableOn(palette.accent,palette.paper,3);
  // 예고 띠(26px)는 작은 글자라 4.5:1.
  const teaserInk=readableOn(palette.accent,palette.paper);
  const cover=isCover(slide),last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink,muted,accent:teaserInk});
  const eyebrow=await textLayer(keywordLine(slide),{size:META,color:readableOn(palette.accent,palette.paper),width:CONTENT,height:40,font:FONTS.semibold});
  const headline=await slideTitle(slide,{sizes:cover?COVER_TITLE:BODY_TITLE,color:ink,accent,maxHeight:cover?320:240});
  const subline=await sublineLayer(slide,{color:muted});
  const lines=cleanPoints(slide.points);
  const body=lines.length?await textLayer(lines.join(" "),{size:POINT,color:ink,width:CONTENT,height:600,font:FONTS.regular,spacing:12}):null;
  const closing=last?await closingPlan({color:ink,accent:palette.accent}):null;
  const textHeight=eyebrow.info.height+18+headline.info.height+(subline?20+subline.info.height:0)+(body?30+2+30+body.info.height:0);
  const bottom=FOOTER_TOP-foot.extra-40-(closing?closing.height+36:0);
  // 글 아래 여백(본문 끝 ~ 채널명 줄)을 40px 남기고 나머지를 사진에 준다. 마지막 장은 명함 자리만큼 사진 최소 높이를 낮춘다.
  // 위 한도는 880(예전 820은 짧은 문안 본문 장에서 본문 아래가 150px 넘게 비었다).
  const PHOTO_H=Math.max(closing?320:440,Math.min(880,bottom-44-textHeight));
  let cursor=PHOTO_H+44;
  const layers:OverlayOptions[]=[{input:await croppedPhoto(inputs[0],1080,PHOTO_H,0),left:0,top:0},{input:eyebrow.data,left:MARGIN,top:cursor}];
  cursor+=eyebrow.info.height+18;
  layers.push({input:headline.data,left:MARGIN,top:cursor});
  cursor+=headline.info.height;
  if(subline){layers.push({input:subline.data,left:MARGIN,top:cursor+20});cursor+=20+subline.info.height;}
  if(body){
    // 제목과 본문 사이 가는 선. 짧은 강조색 선과 긴 옅은 선을 겹쳐 잡지 기사의 머리 줄처럼 보이게 한다.
    layers.push(svgLayer(`<path d="M${MARGIN} ${cursor+30}H${1080-MARGIN}" stroke="${ink}" stroke-opacity=".18" stroke-width="${MIN_STROKE}"/><path d="M${MARGIN} ${cursor+30}H${MARGIN+120}" stroke="${palette.accent}" stroke-width="4"/>`));
    layers.push({input:body.data,left:MARGIN,top:cursor+62});
  }
  if(closing)layers.push(...closing.place(540,FOOTER_TOP-foot.extra-30-closing.height));
  layers.push(svgLayer(sparkles([[1080-MARGIN-10,PHOTO_H+52,14]],palette.accent)));
  layers.push(...foot.layers,await grainLayer({opacity:.12}));
  return texturedCanvas(palette.paper,layers);
};

// 12. 반반 분할: 화면 반쪽은 세로 사진, 반쪽은 제목·요점. 변형 1은 사진이 오른쪽에 온다.
// 마지막 장은 아래쪽에 화면 폭 전체의 명함 띠를 깔고(좁은 반쪽에는 긴 계정이 안 들어간다) 사진·글 묶음을 그 위로 올린다.
const composeSplit:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const photoRight=currentVariant()%2===1;
  const HALF=540,PAD=52,W=HALF-PAD*2;
  const panelX=photoRight?0:HALF,photoX=photoRight?HALF:0;
  const ink=inkOn(palette.paper,palette),muted=mutedOn(palette.paper,palette),accent=readableOn(palette.accent,palette.paper,3);
  // 예고 띠(26px)는 작은 글자라 4.5:1.
  const teaserInk=readableOn(palette.accent,palette.paper);
  const cover=isCover(slide),last=isLast(slide,index,total);
  const closing=last?await closingPlan({color:ink,accent:palette.accent}):null;
  // 바닥글은 화면 폭 전체의 종이 띠에 둔다(반쪽 패널 폭 436px에는 "묵동홍어마을 · @긴계정"이 한 줄에 안 들어간다).
  // 그래서 사진은 바닥글 띠 위에서 끝난다. 마지막 장은 그 띠를 명함 높이만큼 더 키운다.
  const foot=await footerPlan(slide,index,total,{ink,muted,accent:teaserInk});
  const bandTop=closing?FOOTER_TOP-foot.extra-36-closing.height-30:FOOTER_TOP-foot.extra-30;
  const eyebrow=await textLayer(keywordLine(slide),{size:META,color:readableOn(palette.accent,palette.paper),width:W,height:80,font:FONTS.semibold});
  // 반쪽 폭(436)이라 표지 제목도 88부터 시작한다(100이면 한 줄에 네 글자).
  const headline=await slideTitle(slide,{sizes:cover?[88,80,72,64,56]:[64,60,56],color:ink,accent,width:W,maxHeight:cover?520:470,balance:true});
  const subline=await sublineLayer(slide,{color:muted,width:W});
  const lines=cleanPoints(slide.points);
  const measured=await pointLayers(lines,0,{left:panelX+PAD,width:W,color:ink,markerColor:palette.accent,size:POINT});
  const blockHeight=eyebrow.info.height+20+headline.info.height+(subline?24+subline.info.height:0)+(lines.length?40+measured.bottom:0);
  const textBottom=bandTop-30;
  // 글 묶음을 패널 세로 가운데에 둔다(위아래 여백이 같게).
  let cursor=Math.max(closing?72:96,Math.round((textBottom-blockHeight)/2));
  const layers:OverlayOptions[]=[{input:await croppedPhoto(inputs[0],HALF,Math.min(1350,bandTop),0),left:photoX,top:0}];
  layers.push({input:eyebrow.data,left:panelX+PAD,top:cursor});cursor+=eyebrow.info.height+20;
  layers.push({input:headline.data,left:panelX+PAD,top:cursor});cursor+=headline.info.height;
  layers.push(svgLayer(wavyUnderline({x:panelX+PAD,y:cursor+16,width:Math.min(220,headline.info.width),color:palette.highlight,strokeWidth:6})));
  if(subline){layers.push({input:subline.data,left:panelX+PAD,top:cursor+30});cursor+=30+subline.info.height;}
  if(lines.length){const points=await pointLayers(lines,cursor+40,{left:panelX+PAD,width:W,color:ink,markerColor:palette.accent,size:POINT});layers.push(...points.layers);}
  if(closing){
    layers.push(svgLayer(`<path d="M${MARGIN} ${bandTop}H${1080-MARGIN}" stroke="${ink}" stroke-opacity=".18" stroke-width="${MIN_STROKE}"/>`));
    layers.push(...closing.place(540,bandTop+30));
  }
  // 사진과 글 사이 경계에 테이프 한 조각.
  layers.push(svgLayer(washiTape({x:HALF-90,y:120,width:180,color:palette.highlight,angle:photoRight?8:-8,opacity:.82})));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.paper,layers);
};

// 13. 폴라로이드: 위에 제목, 가운데 기울어진 폴라로이드 두 장(아래 흰 여백에 손글씨 메모), 아래 요점.
const composePolaroid:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.soft,palette),muted=mutedOn(palette.soft,palette),accent=readableOn(palette.accent,palette.soft,3);
  // 예고 띠(26px)는 작은 글자라 4.5:1.
  const teaserInk=readableOn(palette.accent,palette.soft);
  const last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink,muted,accent:teaserInk});
  const closing=last?await closingPlan({color:ink,accent:palette.accent}):null;
  const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:ink,accent,maxHeight:240});
  const lines=cleanPoints(slide.points);
  const measured=await pointLayers(lines,0,{color:ink,markerColor:palette.accent,size:POINT});
  const TOP=MARGIN+headline.info.height+40;
  const pointsHeight=lines.length?measured.bottom+30:0;
  const bottom=FOOTER_TOP-foot.extra-40-(closing?closing.height+36:0);
  // 폴라로이드 크기는 남는 높이에 맞춘다(사진 정사각형 + 아래 메모 여백).
  // 짧은 문안이면 위 한도(500)까지 키운다. 두 장이 조금 더 겹치지만 아래가 비는 것보다 낫다.
  // 사진 아래로 더 차지하는 높이: 테두리·메모 여백 96 + 기울기로 커지는 약 60 + 둘째 장이 내려간 70 ≈ 230.
  // (예전 150은 모자라 긴 문안의 마지막 장에서 요점이 명함에 닿았다.)
  const SIDE=Math.max(closing?240:280,Math.min(500,bottom-pointsHeight-TOP-230));
  const BORDER=18,CAPTION=78;
  const make=async(photo:Buffer,caption:string)=>{
    const W=SIDE+BORDER*2,H=SIDE+BORDER+CAPTION;
    const note=caption?await textLayer(caption,{size:34,color:"#2a2a2a",width:W-36,height:56,font:FONTS.bold,align:"centre"}):null;
    return sharp({create:{width:W,height:H,channels:4,background:"#fffdf8"}})
      // 사진 칸 안쪽 가장자리를 얕게 어둡게 해 흰 테두리 "안에 끼운" 인화지처럼 보이게 한다.
      .composite([{input:await croppedPhoto(photo,SIDE,SIDE,0),left:BORDER,top:BORDER},{input:svg(W,H,photoWell(BORDER,BORDER,SIDE,SIDE,{opacity:.22,depth:18})),left:0,top:0},...(note?[{input:note.data,left:Math.round((W-note.info.width)/2),top:SIDE+BORDER+Math.round((CAPTION-note.info.height)/2)}]:[])])
      .png().toBuffer();
  };
  const cards=[
    {image:await make(inputs[0],slide.keywords[0]??""),angle:-6,x:MARGIN-6,y:TOP},
    {image:await make(inputs[1]??inputs[0],slide.keywords[1]??""),angle:5,x:1080-MARGIN-(SIDE+BORDER*2)+6,y:TOP+70},
  ];
  const layers:OverlayOptions[]=[{input:headline.data,left:MARGIN,top:MARGIN}];
  let photosBottom=TOP;
  for(const card of cards){
    const tilted=await sharp(card.image).rotate(card.angle,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
    // 사진을 인화지(폴라로이드) 안에 넣고 그 인화지를 캔버스에 놓으므로, 놓는 인화지를 사진으로 등록해야 검수가 사진 자리로 본다.
    registerPhoto(tilted.data);
    const meta=await sharp(card.image).metadata();
    layers.push(await cardShadow({x:card.x+8,y:card.y+16,width:meta.width!,height:meta.height!,rx:4,blur:14,opacity:.22,rotate:card.angle}));
    layers.push({input:tilted.data,left:card.x,top:card.y});
    layers.push(svgLayer(washiTape({x:card.x+Math.round(tilted.info.width/2)-80,y:card.y-14,width:160,color:palette.highlight,angle:card.angle*-1.2,opacity:.8})));
    photosBottom=Math.max(photosBottom,card.y+tilted.info.height);
  }
  // 요점은 사진 아래 남는 자리의 가운데에 둔다. 예전에는 바닥(채널명 위)에 붙여 사진과 요점 사이가 250px 넘게 비었다.
  if(lines.length){const points=await pointLayers(lines,Math.max(photosBottom+30,Math.round((photosBottom+30+bottom-measured.bottom)/2)),{color:ink,markerColor:palette.accent,size:POINT});layers.push(...points.layers);}
  if(closing)layers.push(...closing.place(540,FOOTER_TOP-foot.extra-30-closing.height));
  layers.push(svgLayer(sparkles([[1080-MARGIN-20,MARGIN+20,16]],palette.accent)));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.soft,layers);
};

// 14. 영수증·메뉴판: 사진 없이 가운데 영수증 종이. 가게 이름, 점선, 제목, 번호 매긴 항목, 항목 수 합계, 바코드.
// 마지막 장은 영수증 아래(바닥글 위)에 가게 명함을 두고 종이를 그만큼 위로 올린다.
const composeReceipt:CardRenderer=async(_inputs,slide,index,total,palette)=>{
  const W=840,X=Math.round((1080-W)/2),PAD=60,TEXT_W=W-PAD*2;
  const paperInk="#2a2a2a",dim="#6f6f6f";
  const softInk=inkOn(palette.soft,palette),softMuted=mutedOn(palette.soft,palette);
  const last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink:softInk,muted:softMuted,accent:readableOn(palette.accent,palette.soft)});
  const closing=last?await closingPlan({color:softInk,accent:palette.accent}):null;
  const lines=cleanPoints(slide.points);
  const shop=await textLayer(STORE_NAME,{size:34,color:paperInk,width:TEXT_W,height:48,font:FONTS.semibold,align:"centre"});
  // 종이는 늘 크림색이라 강조어는 팔레트 강조색을 종이 위 3:1로 맞춘다.
  const title=await slideTitle(slide,{sizes:[64,60,56],color:paperInk,accent:readableOn(palette.accent,"#fffdf8",3),width:TEXT_W,maxHeight:240,align:"centre"});
  const items=await Promise.all(lines.map(line=>textLayer(line,{size:POINT+2,color:paperInk,width:TEXT_W-80,height:(POINT+2)*5,font:FONTS.regular,spacing:6})));
  const numbers=await Promise.all(lines.map((_,i)=>textLayer(String(i+1).padStart(2,"0"),{size:34,color:readableOn(palette.accent,palette.soft,3),width:70,height:44,font:FONTS.bold,features:"tnum"})));
  // 합계 줄: 영문 TOTAL 대신 한글(사장님 결정: 영문 장식 문구 한글화). 값은 항목 수(사실 단정 숫자가 아님).
  const totalLabel=await textLayer("합계",{size:30,color:paperInk,width:200,height:44,font:FONTS.bold});
  const totalValue=await textLayer(`${lines.length}가지`,{size:30,color:paperInk,width:200,height:44,font:FONTS.bold});
  const thanks=await textLayer(keywordLine(slide),{size:META,color:dim,width:TEXT_W,height:40,font:FONTS.regular,align:"centre"});
  // 항목 사이 여백은 남는 높이에 맞춘다(16~64). 예전 고정 36은 짧은 문안에서 종이가 작게 떠 아래가 300px 넘게 비었고,
  // 긴 문안의 마지막 장에서는 종이가 명함 뒤까지 내려가 겹쳤다.
  const top0=closing?56:70;
  const bottom=FOOTER_TOP-foot.extra-30-(closing?closing.height+50:0);
  // 마지막 항목 아래(합계 점선 위)는 늘 36. 바코드(80)는 장식이라, 항목 여백을 16까지 줄여도 명함 위에 안 들어가면 뺀다.
  const LAST_GAP=36,BARS=80;
  const baseH=PAD+shop.info.height+30+title.info.height+40+items.reduce((sum,item)=>sum+item.info.height,0)+LAST_GAP+30+40+40+70+20+thanks.info.height+PAD-BARS;
  const gapsN=Math.max(1,items.length-1),room=bottom-top0-14;
  const bars=baseH+BARS+16*gapsN<=room;
  const fixedH=baseH+(bars?BARS:0);
  const ITEM_GAP=Math.max(16,Math.min(64,Math.floor((room-fixedH)/gapsN)));
  const H=fixedH+ITEM_GAP*Math.max(0,items.length-1);
  // 그래도 종이 아래가 크게 남으면(짧은 문안 본문 장) 종이 아래에 메뉴 소품을 하나 놓고, 종이+소품 묶음을 세로 가운데에 둔다.
  const PROP_GAP=24,spareBelow=bottom-top0-(H+14);
  const prop=!closing&&spareBelow>=200?await fillerProp(fillerProps(slide)[0],{left:0,top:0,width:W,height:Math.min(260,spareBelow-PROP_GAP-40)},{rotate:-8}):null;
  const stackH=H+14+(prop?PROP_GAP+prop.height:0);
  // 마지막 장은 종이를 명함 바로 위로 내린다(남는 높이를 모두 위에). 가운데에 두면 종이 끝과 명함 사이가 250px 넘게 빈다.
  const Y=Math.max(top0,Math.round(top0+(bottom-top0-stackH)*(closing?1:.5)));
  const dashed=(y:number)=>`<path d="M${X+PAD} ${y}H${X+W-PAD}" stroke="${dim}" stroke-width="${MIN_STROKE}" stroke-dasharray="8 8"/>`;
  // 종이 아래 끝은 톱니 모양으로 찢는다.
  let zig=`M${X} ${Y}H${X+W}V${Y+H}`;
  for(let x=X+W;x>X;x-=26)zig+=`L${x-13} ${Y+H+14}L${Math.max(X,x-26)} ${Y+H}`;
  zig+="Z";
  let cursor=Y+PAD;
  const layers:OverlayOptions[]=[await cardShadow({x:X,y:Y+10,width:W,height:H,rx:4,blur:16,opacity:.18}),svgLayer(`<path d="${zig}" fill="#fffdf8"/>`)];
  layers.push({input:shop.data,left:X+Math.round((W-shop.info.width)/2),top:cursor});cursor+=shop.info.height+14;
  let svgBody=dashed(cursor);cursor+=16;
  layers.push({input:title.data,left:X+Math.round((W-title.info.width)/2),top:cursor});cursor+=title.info.height+20;
  svgBody+=dashed(cursor);cursor+=20;
  for(const [i,item] of items.entries()){
    layers.push({input:numbers[i].data,left:X+PAD,top:cursor+2},{input:item.data,left:X+PAD+80,top:cursor});
    cursor+=item.info.height+(i<items.length-1?ITEM_GAP:LAST_GAP);
  }
  svgBody+=dashed(cursor+6);cursor+=30;
  layers.push({input:totalLabel.data,left:X+PAD,top:cursor},{input:totalValue.data,left:X+W-PAD-totalValue.info.width,top:cursor});
  cursor+=40+30;
  // 바코드: 굵기가 다른 세로줄. 장식이라 내용과 무관하게 장 번호로 무늬만 바꾼다.
  if(bars){
    let barcode="",bx=X+PAD+120;
    for(let i=0;bx<X+W-PAD-120;i++){const w=MIN_STROKE+((i*7+index*3)%4);barcode+=`<rect x="${bx}" y="${cursor}" width="${w}" height="60" fill="${paperInk}"/>`;bx+=w+3+((i*5)%3);}
    svgBody+=barcode;cursor+=70+10;
  }
  layers.push({input:thanks.data,left:X+Math.round((W-thanks.info.width)/2),top:cursor});
  layers.push(svgLayer(svgBody+sparkles([[X-30,Y+40,16],[X+W+28,Y+H-60,12]],palette.accent)));
  if(prop)layers.push({...prop,left:Math.round(540+W/4-prop.width/2),top:Y+H+14+PROP_GAP});
  if(closing)layers.push(...closing.place(540,FOOTER_TOP-foot.extra-30-closing.height));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.soft,layers);
};

// 15. 체크리스트: 스프링 수첩 위에 제목과 체크 상자 목록, 오른쪽 아래에 키워드 포스트잇.
// 마지막 장은 수첩을 줄이고 그 아래에 가게 명함.
const composeChecklist:CardRenderer=async(_inputs,slide,index,total,palette)=>{
  const X=MARGIN,W=CONTENT,PAD=56,ink="#2a2a2a";
  const pageInk=inkOn(palette.paper,palette),pageMuted=mutedOn(palette.paper,palette);
  const last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink:pageInk,muted:pageMuted,accent:readableOn(palette.accent,palette.paper)});
  const closing=last?await closingPlan({color:pageInk,accent:palette.accent}):null;
  const lines=cleanPoints(slide.points);
  const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:ink,accent:readableOn(palette.accent,"#fffdf8",3),width:W-PAD*2,maxHeight:240});
  const items=await Promise.all(lines.map(line=>textLayer(line,{size:POINT,color:ink,width:W-PAD*2-80,height:POINT*5,font:FONTS.regular,spacing:6})));
  const contentHeight=headline.info.height+40+items.reduce((sum,item)=>sum+Math.max(item.info.height,52)+34,0);
  // 수첩은 늘 바닥글(마지막 장은 명함) 바로 위까지 내린다. 예전에는 내용 높이에 맞춰(최소 700) 수첩 아래 바탕이 500px 넘게 비었다.
  const Y=110,H=FOOTER_TOP-foot.extra-40-Y-(closing?closing.height+20:0);
  // 남는 높이를 항목 사이에 조금 나눈다(최대 70). 더 벌리면 목록이 듬성듬성해 보여, 나머지는 아래 마스코트 자리로 남긴다.
  // 마스코트 칸(목록 끝+10 ~ 수첩 아래 끝-20)이 170보다 좁아지면 마스코트 없이 항목 사이를 최대 90까지 벌려 맨종이를 줄인다.
  // 여백은 항목 "사이"에만 둔다(마지막 항목 뒤에 두면 그만큼 수첩 아래가 빈다).
  const slack=H-PAD*2-60-contentHeight,rows=Math.max(1,items.length-1);
  // 여백 e일 때 마지막 줄 밑선 바로 아래 위치.
  const listEndAt=(e:number)=>Y+PAD+20+contentHeight+e*rows-14;
  const e70=Math.max(0,Math.min(70,Math.floor(slack/rows)));
  const roomy=Y+H-20-(listEndAt(e70)+10)>=170;
  // 마스코트가 없으면 수첩 아래 여분(60)까지 항목 사이로 돌린다.
  const extra=roomy?e70:Math.max(0,Math.min(90,Math.floor((slack+60)/rows)));
  const listEnd=listEndAt(extra);
  let rings="";
  for(let x=X+70;x<X+W-40;x+=74)rings+=`<rect x="${x}" y="${Y-26}" width="16" height="52" rx="8" fill="${palette.ink}" fill-opacity=".7"/>`;
  const layers:OverlayOptions[]=[await cardShadow({x:X,y:Y+10,width:W,height:H,rx:18,blur:16,opacity:.18}),svgLayer(`<rect x="${X}" y="${Y}" width="${W}" height="${H}" rx="18" fill="#fffdf8"/>`+rings)];
  let cursor=Y+PAD+20;
  layers.push({input:headline.data,left:X+PAD,top:cursor});cursor+=headline.info.height+40;
  let boxes="";
  for(const [i,item] of items.entries()){
    const rowH=Math.max(item.info.height,52);
    // 체크 상자와 강조색 체크 표시. 줄 아래에 옅은 노트 선.
    boxes+=`<rect x="${X+PAD}" y="${cursor+4}" width="40" height="40" rx="8" fill="none" stroke="${ink}" stroke-width="3"/><path d="M${X+PAD+8} ${cursor+24}l10 11 22-26" fill="none" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
      +`<path d="M${X+PAD} ${cursor+rowH+16}H${X+W-PAD}" stroke="${ink}" stroke-opacity=".12" stroke-width="${MIN_STROKE}"/>`;
    layers.push({input:item.data,left:X+PAD+72,top:cursor+Math.max(0,Math.round((48-Math.min(item.info.height,48))/2))});
    cursor+=rowH+34+(i<items.length-1?extra:0);
  }
  layers.push(svgLayer(boxes));
  // 그래도 목록 아래 수첩 왼쪽이 크게 비면(짧은 문안) 수첩에 붙인 스티커처럼 마스코트를 세운다. 오른쪽 아래는 포스트잇 자리.
  // 그림 위쪽 투명 여백을 빼고 실제 그림이 목록 끝 30px 아래에서 시작하게 둔다(수첩 아래 끝에 붙이면 목록과 사이가 다시 빈다).
  const zoneTop=listEnd+10,zoneBottom=Y+H-20;
  const mascot=roomy?await mascotLayer({width:380,pose:ROLE_POSES[slide.role]??"tip",left:X+PAD-10,top:zoneBottom,anchor:"bottom-left",maxHeight:Math.min(340,zoneBottom-zoneTop),minHeight:160}):null;
  if(mascot){
    const blank=await inkTop(mascot.input as Buffer);
    mascot.top=Math.round(Math.max(zoneTop-blank,Math.min(zoneBottom-mascot.height,listEnd+30-blank)));
    layers.push(svgLayer(mascotContact(mascot,.16)),mascot);
  }
  // 포스트잇은 목록 마지막 줄과 겹치지 않을 때만 붙인다(마지막 장은 수첩이 짧아 자리가 모자랄 수 있다).
  if(slide.keywords[0]&&listEnd<=Y+H-190){
    const note=await textLayer(`#${slide.keywords[0]}`,{size:30,color:"#2a2a2a",width:200,height:90,font:FONTS.bold,align:"centre"});
    const nx=X+W-230,ny=Y+H-190;
    layers.push(svgLayer(`<g transform="rotate(6 ${nx+100} ${ny+80})"><rect x="${nx+6}" y="${ny+8}" width="200" height="160" fill="#000" fill-opacity=".12"/><rect x="${nx}" y="${ny}" width="200" height="160" fill="${palette.highlight}"/></g>`));
    layers.push({input:note.data,left:nx+Math.round((200-note.info.width)/2),top:ny+Math.round((160-note.info.height)/2)});
  }
  if(closing)layers.push(...closing.place(540,FOOTER_TOP-foot.extra-30-closing.height));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.paper,layers);
};

// 16. 타임라인: 위에 머리글·제목, 왼쪽 세로 선 위에 번호 점, 오른쪽에 각 단계. 남는 높이는 단계 사이로 나눈다.
const composeTimeline:CardRenderer=async(_inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.soft,palette),muted=mutedOn(palette.soft,palette),accent=readableOn(palette.accent,palette.soft,3);
  // 예고 띠(26px)는 작은 글자라 4.5:1.
  const teaserInk=readableOn(palette.accent,palette.soft);
  const last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink,muted,accent:teaserInk});
  const closing=last?await closingPlan({color:ink,accent:palette.accent}):null;
  const eyebrow=await textLayer(keywordLine(slide),{size:META,color:readableOn(palette.accent,palette.paper),width:CONTENT,height:40,font:FONTS.semibold});
  const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:ink,accent,maxHeight:240});
  const lines=cleanPoints(slide.points);
  const LINE_X=MARGIN+36,TEXT_X=MARGIN+110,TEXT_W=1080-MARGIN-TEXT_X;
  const steps=await Promise.all(lines.map(line=>textLayer(line,{size:POINT+2,color:ink,width:TEXT_W,height:(POINT+2)*5,font:FONTS.regular,spacing:8})));
  let top=MARGIN+eyebrow.info.height+16+headline.info.height+70;
  const used=steps.reduce((sum,step)=>sum+Math.max(step.info.height,72),0);
  const bottom=FOOTER_TOP-foot.extra-60-(closing?closing.height+30:0);
  // 단계 사이는 최대 110(번호 점 높이 72와 합쳐 글줄 사이 맨바닥이 150을 넘지 않게). 예전 150은 단계 사이마다 빈 띠가 생겼다.
  const gapFor=(cap:number)=>steps.length>1?Math.max(closing?28:40,Math.min(cap,Math.floor((bottom-top-used)/(steps.length-1)))):0;
  const endFor=(g:number)=>top+used+g*Math.max(0,steps.length-1);
  // 그래도 마지막 단계 아래가 크게 남으면(짧은 문안) 오른쪽 아래에 마스코트를 세워 순서를 안내하는 모습으로 채운다.
  // 마스코트가 들어가지 않을 만큼만 남으면 단계 묶음을 남는 높이의 절반만큼 내려 제목 아래와 단계 아래 여백을 나눈다.
  const gap=gapFor(110);
  const zone=bottom+40-endFor(gap);
  const mascot=zone>=200?await mascotLayer({width:400,pose:ROLE_POSES[slide.role]??"point",left:1080-MARGIN,top:bottom+40,anchor:"bottom-right",maxHeight:Math.min(360,zone-20),minHeight:160}):null;
  const shift=mascot?0:Math.max(0,Math.floor((bottom-endFor(gap))/2));
  top+=shift;
  const stepsEnd=endFor(gap);
  if(mascot){
    // 그림 위 투명 여백을 빼고, 마지막 단계와 바닥 사이 가운데에 둔다.
    const blank=await inkTop(mascot.input as Buffer),inked=mascot.height-blank;
    mascot.top=Math.round(Math.min(bottom+40-mascot.height,stepsEnd+(bottom+40-stepsEnd-inked)/2-blank));
  }
  const layers:OverlayOptions[]=[{input:eyebrow.data,left:MARGIN,top:MARGIN},{input:headline.data,left:MARGIN,top:MARGIN+eyebrow.info.height+16}];
  let cursor=top,dots="";
  const centers:number[]=[];
  for(const [i,step] of steps.entries()){
    const cy=cursor+36;centers.push(cy);
    const number=await textLayer(String(i+1),{size:34,color:palette.onAccent,width:72,height:46,font:FONTS.bold,align:"centre",features:"tnum"});
    dots+=`<circle cx="${LINE_X}" cy="${cy}" r="34" fill="${palette.accent}"/>`;
    layers.push({input:number.data,left:LINE_X-Math.round(number.info.width/2),top:cy-Math.round(number.info.height/2)});
    layers.push({input:step.data,left:TEXT_X,top:cursor+Math.max(0,Math.round((72-step.info.height)/2))});
    cursor+=Math.max(step.info.height,72)+gap;
  }
  const line=centers.length>1?`<path d="M${LINE_X} ${centers[0]}V${centers[centers.length-1]}" stroke="${palette.accent}" stroke-opacity=".45" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round"/>`:"";
  layers.splice(0,0,svgLayer(line+dots+sparkles([[1080-MARGIN-20,MARGIN+16,16]],palette.accent)));
  // 번호 점(svg)은 숫자 레이어보다 먼저 깔려야 하므로 맨 앞에 넣었다.
  if(mascot)layers.push(svgLayer(mascotContact(mascot,.18)),mascot);
  if(closing)layers.push(...closing.place(540,FOOTER_TOP-foot.extra-30-closing.height));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.soft,layers);
};

// 17. 큰 글자 포스터: 화면을 채우는 큰 제목, 오른쪽 아래 둥근 사진, 왼쪽 아래 요점.
// 표지는 강조선 아래 부제, 마지막 장은 왼쪽 아래(요점 자리 아래)에 가게 명함.
const composePoster:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.paper,palette),muted=mutedOn(palette.paper,palette),accent=readableOn(palette.accent,palette.paper,3);
  // 예고 띠(26px)는 작은 글자라 4.5:1.
  const teaserInk=readableOn(palette.accent,palette.paper);
  const cover=isCover(slide),last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink,muted,accent:teaserInk});
  const tag=await textLayer(keywordLine(slide),{size:META+2,color:readableOn(palette.accent,palette.paper),width:CONTENT,height:44,font:FONTS.semibold});
  const lines=cleanPoints(slide.points).slice(0,3);
  const subline=await sublineLayer(slide,{color:muted});
  // 제목은 들어가는 가장 큰 크기를 고른다(위쪽 영역 높이 안에서 128px부터 줄여 본다). 부제가 있으면 그 자리를 먼저 뺀다.
  // 제목 자리는 예전처럼 지름 360 원 기준으로 잡는다(원을 키우려고 제목 높이를 줄이지 않는다).
  const D0=360,room=FOOTER_TOP-foot.extra-60-D0-40-(MARGIN+tag.info.height+24)-(subline?48+subline.info.height:0);
  const headline=await slideTitle(slide,{sizes:cover?[128,112,100,92,88,80,72]:[128,112,98,86,72,64,56],color:ink,accent,maxHeight:room,balance:true});
  const titleTop=MARGIN+tag.info.height+24,ruleY=titleTop+headline.info.height+24;
  // 제목(·부제) 아래 빈 자리. 예전에는 지름 360 원과 요점을 바닥에 붙여 제목과 원 사이가 400px 가까이 비었고,
  // 표지 사진 면적도 9%뿐이었다. 이제 원을 이 자리에 들어가는 만큼 키운다(표지 최대 720, 본문 520, 마지막 장 440).
  // 요점은 원 왼쪽 칸에 제목 바로 아래부터 쌓는다(원이 아래쪽 줄을 채운다).
  const contentTop=ruleY+(subline?28+subline.info.height:0)+40;
  const circleBottom=FOOTER_TOP-foot.extra-60;
  // 원의 맨 위는 가운데(CX)만 뾰족하게 올라오므로, 부제 줄이 원 가운데보다 60 이상 왼쪽에서 끝나면 원 위 끝이 부제 아래 여백(40)까지 올라와도 된다.
  const reach=(d:number)=>subline&&MARGIN+subline.info.width<1080-MARGIN-d/2-60?40:0;
  const sizes=(cover?[720,680,640,600,560,520,480,440,400]:last?[440,400]:[520,480,440,400]).filter(d=>circleBottom-d-18>=contentTop-reach(d)-(lines.length?0:10));
  let plan:{D:number;COL:number;closing:Awaited<ReturnType<typeof closingPlan>>|null;points:Awaited<ReturnType<typeof pointLayers>>|null}|null=null;
  for(const d of [...sizes,D0]){
    const col=CONTENT-d-40;
    const closingTry=last?await closingPlan({color:ink,accent:palette.accent,width:col}):null;
    const pointsTry=lines.length?await pointLayers(lines,contentTop,{width:col,color:ink,markerColor:palette.accent,size:POINT}):null;
    const limit=closingTry?FOOTER_TOP-foot.extra-30-closingTry.height-30:FOOTER_TOP-foot.extra-50;
    plan={D:d,COL:col,closing:closingTry,points:pointsTry};
    if(!pointsTry||pointsTry.bottom<=limit)break;
  }
  const {D,COL,closing,points}=plan!;
  const CX=1080-MARGIN-D/2,CY=circleBottom-D/2;
  const photo=await croppedPhoto(inputs[0],D,D,0,{circle:true});
  // 원형 사진은 모서리가 비므로 검수의 사진 면적을 원 기준(30%)으로 재게 모양을 알려 준다.
  registerPhoto(photo,{shape:"circle"});
  const layers:OverlayOptions[]=[
    {input:tag.data,left:MARGIN,top:MARGIN},
    {input:headline.data,left:MARGIN,top:titleTop},
    svgLayer(`<path d="M${MARGIN} ${ruleY}H${MARGIN+180}" stroke="${palette.accent}" stroke-width="10"/>`
      +ring({cx:CX,cy:CY,r:D/2+18,color:palette.accent,strokeWidth:4,dashed:true,opacity:.6})+sparkles([[CX-D/2-20,CY-D/2+10,20]],palette.highlight)),
    // 원형 사진 뒤 두 겹 그림자(주변광+주광 두 겹). 원이 종이 위에 "놓인" 두께가 생긴다.
    await cardShadow({x:CX-D/2,y:CY-D/2+14,width:D,height:D,rx:D/2,blur:18,opacity:.22}),
    {input:photo,left:CX-D/2,top:CY-D/2},
  ];
  if(subline)layers.push({input:subline.data,left:MARGIN,top:ruleY+28});
  const closingTop=closing?FOOTER_TOP-foot.extra-30-closing.height:FOOTER_TOP-foot.extra-50;
  if(points)layers.push(...points.layers);
  if(closing)layers.push(...closing.place(MARGIN+COL/2,closingTop));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.paper,layers);
};

// 18. 원형 사진: 가운데 큰 원형 사진(점선 고리), 아래 가운데 정렬 제목과 요점.
const composeCircle:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.soft,palette),muted=mutedOn(palette.soft,palette),accent=readableOn(palette.accent,palette.soft,3);
  // 예고 띠(26px)는 작은 글자라 4.5:1.
  const teaserInk=readableOn(palette.accent,palette.soft);
  const cover=isCover(slide),last=isLast(slide,index,total);
  const foot=await footerPlan(slide,index,total,{ink,muted,accent:teaserInk});
  const closing=last?await closingPlan({color:ink,accent:palette.accent}):null;
  const headline=await slideTitle(slide,{sizes:cover?COVER_TITLE:BODY_TITLE,color:ink,accent,align:"centre",maxHeight:cover?320:240,balance:true});
  const subline=await sublineLayer(slide,{color:muted,align:"centre"});
  const lines=cleanPoints(slide.points).slice(0,3);
  const measured=await pointLayers(lines,0,{align:"centre",color:ink,markerColor:palette.accent,size:POINT});
  const textHeight=headline.info.height+(subline?20+subline.info.height:0)+(lines.length?30+measured.bottom:0);
  const TOP=closing?72:100;
  const bottom=FOOTER_TOP-foot.extra-40-(closing?closing.height+36:0);
  // 지름은 짝수로(반지름이 정수여야 사진 위치가 정수 픽셀이 된다). 위 한도 660은 짧은 문안에서 글 아래가 200px 넘게 비어
  // 780으로 올렸다(고리 포함 폭 824 < 화면 1080).
  const D=2*Math.round(Math.max(closing?320:400,Math.min(780,bottom-TOP-50-textHeight))/2);
  const cx=540,cy=TOP+D/2;
  const photo=await croppedPhoto(inputs[0],D,D,0,{circle:true});
  // 원형 사진: 검수의 사진 면적을 원 기준(30%)으로 재게 모양을 알려 준다.
  registerPhoto(photo,{shape:"circle"});
  const layers:OverlayOptions[]=[
    svgLayer(ring({cx,cy,r:D/2+22,color:palette.accent,strokeWidth:4,dashed:true,opacity:.5})+sparkles([[cx+D/2+10,cy-D/2+30,20],[cx-D/2-14,cy+D/2-40,13]],palette.accent)),
    await cardShadow({x:cx-D/2,y:cy-D/2+14,width:D,height:D,rx:D/2,blur:18,opacity:.22}),
    {input:photo,left:cx-D/2,top:TOP},
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:TOP+D+50},
  ];
  let cursor=TOP+D+50+headline.info.height;
  if(subline){layers.push({input:subline.data,left:Math.round((1080-subline.info.width)/2),top:cursor+20});cursor+=20+subline.info.height;}
  if(lines.length){const points=await pointLayers(lines,cursor+30,{align:"centre",color:ink,markerColor:palette.accent,size:POINT});layers.push(...points.layers);}
  if(closing)layers.push(...closing.place(540,FOOTER_TOP-foot.extra-30-closing.height));
  layers.push(...foot.layers,await grainLayer());
  return texturedCanvas(palette.soft,layers);
};

export const EXTRA_RENDERERS={
  magazine:composeMagazine,
  split:composeSplit,
  polaroid:composePolaroid,
  receipt:composeReceipt,
  checklist:composeChecklist,
  timeline:composeTimeline,
  poster:composePoster,
  circle:composeCircle,
} satisfies Record<string,CardRenderer>;
