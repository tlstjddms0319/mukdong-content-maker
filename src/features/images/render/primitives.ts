import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { isLight, type Palette } from "../design";
import { typographyOf, type FontFace, type Typography } from "../typography";
import type { ThemeId } from "../themes";
import * as decor from "../decor";

// 모든 카드 레이아웃(composeSlide.ts, render/extraLayouts.ts)이 함께 쓰는 그리기 도구.
// 글자 레이어, 요점 목록, 사진 자르기, 캔버스와 함께, 게시물 테마에 따라 모양이 바뀌는 장식 함수(테이프·반짝이 등)를 둔다.
// 레이아웃 코드는 장식을 "어디에 둘지"만 정하고, "어떤 모양으로 그릴지"는 여기의 테마 규칙(THEME_KITS)이 정한다.

export function escapeXml(value:string):string {
  return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]!);
}

// ── 글꼴 ──────────────────────────────────────────────────────────────────────────────
// 글자의 역할은 세 가지다. bold=제목·강조(제목 글꼴), semibold=채널명·장 번호 같은 보조 글(본문 글꼴의 굵은 쪽),
// regular=요점·설명(본문 글꼴). 각 그리기 함수는 역할만 고르고, 실제 글꼴 파일은 카드마다 고른 글꼴 설정에서 정해진다.
const FONT_DIR=path.join(process.cwd(),"assets/fonts");
export type Font={file:string;family:string};
const fontFile=(face:FontFace):Font=>({file:path.join(FONT_DIR,face.fileName),family:face.family});
const DEFAULT_TYPOGRAPHY=typographyOf();
export const FONTS={
  bold:fontFile(DEFAULT_TYPOGRAPHY.title),
  semibold:fontFile(DEFAULT_TYPOGRAPHY.label),
  regular:fontFile(DEFAULT_TYPOGRAPHY.body),
} as const satisfies Record<string,Font>;

// 큰 따옴표처럼 모양 자체가 장식인 기호는 고른 글꼴과 무관하게 Pretendard로 찍는다(주아·검은고딕의 따옴표는 가는 막대처럼 보인다).
// FONTS.bold와 다른 객체라 resolveFont가 바꾸지 않는다.
export const DECOR_FONT:Font={...FONTS.bold};

// ── 카드 한 장을 그리는 동안의 설정 ─────────────────────────────────────────────────────────
// 글꼴·테마·변형 번호·색 조합. 서버는 여러 카드를 동시에 그릴 수 있으므로 모듈 변수 대신 AsyncLocalStorage에 담아,
// 같은 비동기 흐름 안의 함수만 그 값을 보게 한다(요청끼리 글꼴이나 테마가 섞이지 않는다).
export type RenderContext={typography:Typography;theme:ThemeId;variant:number;palette:Palette};
const renderStore=new AsyncLocalStorage<RenderContext>();
export const withRenderContext=<T,>(context:RenderContext,task:()=>Promise<T>)=>renderStore.run(context,task);
export const currentTheme=():ThemeId=>renderStore.getStore()?.theme??"classic";
// 레이아웃 변형 번호(0부터). 레이아웃마다 변형 수가 다르므로 쓰는 쪽에서 % 개수로 고른다.
export const currentVariant=():number=>renderStore.getStore()?.variant??0;

function resolveFont(role:Font):Font {
  const typography=renderStore.getStore()?.typography;
  if(!typography)return role;
  if(role===FONTS.bold)return fontFile(typography.title);
  if(role===FONTS.semibold)return fontFile(typography.label);
  if(role===FONTS.regular)return fontFile(typography.body);
  return role;
}

// ── 글자 ──────────────────────────────────────────────────────────────────────────────
type TextStyle={size:number;color:string;width:number;height:number;font?:Font;align?:"left"|"centre";spacing?:number};
export type Layer={data:Buffer;info:{width:number;height:number}};

// Pango는 한글 음절 사이 어디서든 줄을 바꿔 "놀\n랄까요?"처럼 단어가 잘린다. 공백이 아닌 글자 사이에
// 단어 결합자(U+2060)를 넣어 띄어쓰기 자리에서만 줄이 바뀌게 한다. 너무 긴 단어만 글자 단위로 나뉜다.
const breakOnlyAtSpaces=(value:string)=>value.replace(/(\S)(?=\S)/g,"$1⁠");

// 제목·요점·라벨이 모두 같은 경로로 그려지도록 하는 공용 텍스트 레이어. 결과의 info.height로 다음 요소 위치를 잡는다.
export async function textLayer(value:string,style:TextStyle):Promise<Layer> {
  const font=resolveFont(style.font??FONTS.bold);
  await access(font.file);
  return sharp({text:{text:`<span foreground="${style.color}">${escapeXml(breakOnlyAtSpaces(value))}</span>`,font:`${font.family} ${style.size}`,fontfile:font.file,width:Math.round(style.width),wrap:"word-char",align:style.align??"left",spacing:style.spacing??12,rgba:true}})
    .resize({width:Math.round(style.width),height:Math.round(style.height),fit:"inside",withoutEnlargement:true})
    .png().toBuffer({resolveWithObject:true});
}

// 제목을 두 줄로 나눌 때 의미 단위에서 끊는다. "비 오는 날, 막걸리 / 한 잔"처럼 낱말 묶음이 갈라지지 않도록
// 쉼표·물음표·느낌표·마침표 바로 뒤의 띄어쓰기를 먼저 고르고, 없을 때만 가운데에 가까운 띄어쓰기를 쓴다.
// 한 줄이 전체의 1/4보다 짧아지는 자리는 고르지 않는다(한 글자만 덩그러니 남는 줄 방지).
export function balanceHeadline(headline:string){
  const title=headline.replace(/\s+/g," ").trim();
  if(title.length<=12)return title;
  const spaces=[...title.matchAll(/ /g)].map(match=>match.index!);
  const balanced=(at:number)=>at>=title.length/4&&title.length-at>=title.length/4;
  const afterPunctuation=spaces.filter(at=>/[,，.?!…]/.test(title[at-1])&&balanced(at));
  const pool=afterPunctuation.length?afterPunctuation:spaces;
  if(!pool.length)return title;
  const split=[...pool].sort((a,b)=>Math.abs(a-title.length/2)-Math.abs(b-title.length/2))[0];
  return `${title.slice(0,split)}\n${title.slice(split+1)}`;
}

export async function renderSlideHeadline(headline:string,options:{size?:number;color?:string;align?:"left"|"centre";height?:number;width?:number;balance?:boolean}={}) {
  const text=(options.balance??true)?balanceHeadline(headline):headline.replace(/\s+/g," ").trim();
  return textLayer(text,{size:options.size??58,color:options.color??"#ffffff",width:options.width??936,height:options.height??190,align:options.align,spacing:8});
}

export const cleanPoints=(points:string[]|undefined)=>(points??[]).map(point=>point.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,4);

// 요점 2~4줄을 한 덩어리로. 사진 위에서는 불릿 목록으로 쓴다.
export async function renderSlidePoints(points:string[],options:{bullets?:boolean;color?:string;size?:number;align?:"left"|"centre";height?:number}={}) {
  const lines=cleanPoints(points);
  if(!lines.length)return null;
  const bullets=options.bullets??true;
  return textLayer(lines.map(line=>bullets?`•  ${line}`:line).join("\n"),{size:options.size??36,color:options.color??"#ffffff",width:936,height:options.height??320,font:FONTS.regular,align:options.align,spacing:16});
}

// ── 크기 기준 ────────────────────────────────────────────────────────────────────────────
export const MARGIN=72,CONTENT=1080-MARGIN*2;
// 휴대폰 화면에서 읽히는 최소 크기. 본문(요점·설명)은 34px 이상, 채널명·장 번호·태그 같은 보조 글은 26px.
export const BODY=34,META=26;

export const svg=(width:number,height:number,body:string)=>Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
export const svgLayer=(body:string):OverlayOptions=>({input:svg(1080,1350,body),left:0,top:0});

// 요점 목록: 강조점(또는 번호)과 보통 굵기 글. top부터 아래로 쌓고 끝 위치를 돌려준다.
// gap은 줄 사이 추가 여백. 카드에 남는 공간을 요점 사이로 나눠 아래쪽이 비지 않게 할 때 쓴다.
export async function pointLayers(lines:string[],top:number,options:{left?:number;width?:number;numbered?:boolean;color:string;markerColor:string;size?:number;align?:"left"|"centre";gap?:number}):Promise<{layers:OverlayOptions[];bottom:number}> {
  const size=options.size??BODY,left=options.left??MARGIN,width=options.width??CONTENT;
  const indent=options.align==="centre"?0:options.numbered?88:40;
  const layers:OverlayOptions[]=[];
  let cursor=top;
  for(const [i,line] of lines.entries()){
    const text=await textLayer(line,{size,color:options.color,width:width-indent,height:size*3,font:FONTS.regular,spacing:8,align:options.align});
    if(options.align==="centre"){
      layers.push({input:text.data,left:left+Math.round((width-text.info.width)/2),top:cursor});
    }else{
      if(options.numbered){
        const number=await textLayer(String(i+1).padStart(2,"0"),{size:36,color:options.markerColor,width:80,height:48,font:FONTS.bold});
        layers.push({input:number.data,left,top:cursor-4});
      }else{
        // 강조점은 작은 레이어로 그린다. 카드처럼 작은 캔버스 안에서도 합성할 수 있어야 한다.
        layers.push({input:svg(12,12,`<circle cx="6" cy="6" r="5" fill="${options.markerColor}"/>`),left:left-1,top:cursor+Math.round(size*.6)-6});
      }
      layers.push({input:text.data,left:left+indent,top:cursor});
    }
    cursor+=Math.max(text.info.height,options.numbered?48:0)+(options.numbered?24:16)+(i<lines.length-1?options.gap??0:0);
  }
  return {layers,bottom:cursor};
}

// ── 게시물 테마 ───────────────────────────────────────────────────────────────────────────
// 테마마다 장식 함수를 갈아 끼운다. 빈 문자열을 돌려주면 그 장식은 그 테마에서 그리지 않는다는 뜻이다.
type Decor={
  sparkles:typeof decor.sparkles;washiTape:typeof decor.washiTape;wavyUnderline:typeof decor.wavyUnderline;
  blob:typeof decor.blob;dotGrid:typeof decor.dotGrid;cornerMarks:typeof decor.cornerMarks;softShadow:typeof decor.softShadow;ring:typeof decor.ring;
};
type ThemeKit=Decor&{
  // 사진 모서리 반지름. 레이아웃이 원한 값을 받아 테마에 맞게 바꾼다.
  photoRadius:(requested:number)=>number;
  // 사진 가장자리에 두를 선(없으면 null).
  photoStroke:(palette:Palette)=>{color:string;width:number}|null;
  grainOpacity:(requested:number)=>number;
  // 단색 바탕(canvas) 위에 까는 무늬. 레이아웃의 모든 요소 아래에 놓인다.
  background:(palette:Palette,surface:string)=>string;
  // 사진이 화면을 채우는 레이아웃(풀스크린·프레임·인용구) 위에 마지막으로 얹는 테두리.
  photoOverlay:(palette:Palette)=>string;
};

const none=()=>"";
// 줄·테두리처럼 바탕 위에 옅게 그리는 선의 색. 밝은 바탕엔 검정, 어두운 바탕엔 흰색을 옅게 쓴다.
const faint=(surface:string,opacity:number)=>isLight(surface)?`stroke="#000" stroke-opacity="${opacity}"`:`stroke="#fff" stroke-opacity="${opacity*1.4}"`;
// 다이아몬드(마름모) 장식. 레트로 테마에서 반짝이 대신 쓴다.
const diamonds=(points:ReadonlyArray<readonly [number,number,number]>,color:string,opacity=1)=>points.map(([x,y,s])=>{const r=s*.8;return `<path d="M${x} ${y-r}L${x+r*.7} ${y}L${x} ${y+r}L${x-r*.7} ${y}Z" fill="${color}" fill-opacity="${opacity}"/>`;}).join("");
// 곧은 밑줄(물결 대신). double이면 두 줄.
const straightRule=(double:boolean,scale=1):typeof decor.wavyUnderline=>options=>{
  const sw=Math.max(2,Math.round((options.strokeWidth??5)*scale*.6));
  const line=(dy:number)=>`<path d="M${options.x} ${options.y+dy}H${options.x+options.width}" stroke="${options.color}" stroke-opacity="${options.opacity??1}" stroke-width="${sw}" stroke-linecap="square"/>`;
  return double?line(-3)+line(5):line(0);
};

const CLASSIC:ThemeKit={
  sparkles:decor.sparkles,washiTape:decor.washiTape,wavyUnderline:decor.wavyUnderline,blob:decor.blob,dotGrid:decor.dotGrid,
  cornerMarks:decor.cornerMarks,softShadow:decor.softShadow,ring:decor.ring,
  photoRadius:requested=>requested,photoStroke:()=>null,grainOpacity:requested=>requested,background:none,photoOverlay:none,
};

const THEME_KITS:Record<ThemeId,ThemeKit>={
  classic:CLASSIC,
  // 잡지: 장식을 걷어내고 가는 선과 여백으로만 정리한다. 사진은 각지게, 밑줄은 곧은 한 줄.
  magazine:{...CLASSIC,
    sparkles:none,washiTape:none,blob:none,dotGrid:none,wavyUnderline:straightRule(false,.7),
    cornerMarks:options=>decor.cornerMarks({...options,strokeWidth:2,opacity:(options.opacity??.7)*.7}),
    softShadow:options=>decor.softShadow({...options,opacity:(options.opacity??.22)*.5}),
    photoRadius:()=>0,grainOpacity:requested=>requested*.4,
    background:(_palette,surface)=>`<path d="M56 46H1024M56 52H1024M56 1304H1024" ${faint(surface,.35)} stroke-width="1.5"/>`,
    photoOverlay:()=>`<rect x="28" y="28" width="1024" height="1294" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>`,
  },
  // 손글씨 노트: 줄 노트 바탕과 빨간 여백선. 테이프·반짝이·물결 밑줄은 그대로 살린다.
  notebook:{...CLASSIC,
    blob:none,dotGrid:none,photoRadius:()=>6,grainOpacity:requested=>Math.max(requested,.2),
    background:(palette,surface)=>{
      let lines="";
      for(let y=150;y<1300;y+=54)lines+=`<path d="M0 ${y}H1080" ${faint(surface,.09)} stroke-width="2"/>`;
      return lines+`<path d="M52 0V1350" stroke="${palette.accent}" stroke-opacity=".35" stroke-width="3"/>`;
    },
  },
  // 포스터: 굵은 테두리, 딱딱한(번지지 않는) 그림자, 큰 망점 무늬와 대각선 띠. 테이프는 쓰지 않는다.
  poster:{...CLASSIC,
    washiTape:none,
    sparkles:(points,color,opacity)=>decor.sparkles(points.map(([x,y,s])=>[x,y,Math.round(s*1.35)] as const),color,opacity),
    blob:options=>decor.blob({...options,opacity:Math.min(.9,(options.opacity??.5)*1.6)}),
    dotGrid:options=>decor.dotGrid({...options,gap:28,r:6,opacity:Math.min(.7,(options.opacity??.35)*1.6)}),
    wavyUnderline:straightRule(false,2),
    softShadow:options=>`<rect x="${options.x+12}" y="${options.y+12}" width="${options.width}" height="${options.height}" rx="${options.rx??16}" fill="#000" fill-opacity=".85" transform="rotate(${options.rotate??0} ${options.x+options.width/2} ${options.y+options.height/2})"/>`,
    photoRadius:()=>0,photoStroke:palette=>({color:isLight(palette.paper)?palette.ink:"#000000",width:8}),
    grainOpacity:requested=>requested*.6,
    // 망점은 오른쪽 위 모서리에만, 띠는 화면 맨 아래 가장자리에만 둬서 제목·채널명 글자를 가리지 않는다.
    background:(palette)=>decor.dotGrid({x:800,y:0,width:280,height:230,color:palette.accent,gap:30,r:7,opacity:.35})
      +`<rect x="0" y="1334" width="1080" height="16" fill="${palette.accent}"/><rect x="0" y="1326" width="1080" height="8" fill="${palette.highlight}"/>`,
    photoOverlay:palette=>`<rect x="20" y="20" width="1040" height="1310" fill="none" stroke="${palette.highlight}" stroke-width="10"/>`,
  },
  // 미니멀: 장식을 모두 빼고 여백만 남긴다. 사진 모서리만 살짝 둥글게.
  minimal:{...CLASSIC,
    sparkles:none,washiTape:none,blob:none,dotGrid:none,wavyUnderline:none,cornerMarks:none,ring:none,
    softShadow:options=>decor.softShadow({...options,opacity:(options.opacity??.22)*.45}),
    photoRadius:requested=>requested?12:0,grainOpacity:()=>0,
  },
  // 레트로 메뉴판: 두 줄 테두리와 모서리 다이아몬드, 반짝이 대신 다이아몬드, 두 줄 밑줄. 사진은 크게 둥글린다.
  retro:{...CLASSIC,
    washiTape:none,blob:none,sparkles:diamonds,wavyUnderline:straightRule(true,.8),
    photoRadius:requested=>requested?Math.max(requested,28):0,grainOpacity:requested=>Math.max(requested,.26),
    background:(palette,surface)=>`<rect x="26" y="26" width="1028" height="1298" fill="none" stroke="${palette.accent}" stroke-opacity=".75" stroke-width="4"/>`
      +`<rect x="38" y="38" width="1004" height="1274" fill="none" ${faint(surface,.25)} stroke-width="1.5"/>`
      +diamonds([[26,26,14],[1054,26,14],[26,1324,14],[1054,1324,14]],palette.accent),
    photoOverlay:palette=>`<rect x="26" y="26" width="1028" height="1298" fill="none" stroke="${palette.highlight}" stroke-opacity=".9" stroke-width="4"/><rect x="38" y="38" width="1004" height="1274" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>`
      +diamonds([[26,26,14],[1054,26,14],[26,1324,14],[1054,1324,14]],palette.highlight),
  },
};
const kit=()=>THEME_KITS[currentTheme()];

// 레이아웃 코드가 부르는 장식 함수. 이름과 인자는 decor.ts와 같고, 지금 그리는 카드의 테마에 맞는 모양으로 그린다.
export const sparkles:typeof decor.sparkles=(...args)=>kit().sparkles(...args);
export const washiTape:typeof decor.washiTape=(...args)=>kit().washiTape(...args);
export const wavyUnderline:typeof decor.wavyUnderline=(...args)=>kit().wavyUnderline(...args);
export const blob:typeof decor.blob=(...args)=>kit().blob(...args);
export const dotGrid:typeof decor.dotGrid=(...args)=>kit().dotGrid(...args);
export const cornerMarks:typeof decor.cornerMarks=(...args)=>kit().cornerMarks(...args);
export const softShadow:typeof decor.softShadow=(...args)=>kit().softShadow(...args);
export const ring:typeof decor.ring=(...args)=>kit().ring(...args);
export const mascotLayer=decor.mascotLayer;

// 종이 질감. 미니멀 테마처럼 0이면 아무것도 없는 레이어를 돌려준다.
const EMPTY_LAYER:OverlayOptions={input:svg(1,1,""),left:0,top:0};
export async function grainLayer(options:{opacity?:number}={}):Promise<OverlayOptions> {
  const opacity=kit().grainOpacity(options.opacity??.16);
  return opacity>0?decor.grainLayer({opacity:Math.round(opacity*100)/100}):EMPTY_LAYER;
}

// 사진이 화면을 채우는 레이아웃의 마지막 장식(테마 테두리). 테마에 테두리가 없으면 빈 레이어.
export function photoOverlayLayer():OverlayOptions {
  const store=renderStore.getStore();
  const body=store?kit().photoOverlay(store.palette):"";
  return body?svgLayer(body):EMPTY_LAYER;
}

// ── 사진·캔버스 ─────────────────────────────────────────────────────────────────────────
// 모서리를 둥글게 자른 사진 레이어. radius는 테마에 맞게 바뀌고(잡지·포스터는 각지게), 포스터는 굵은 테두리를 두른다.
export async function croppedPhoto(input:Buffer,width:number,height:number,radius:number,options:{circle?:boolean}={}){
  const photo=await sharp(input).rotate().resize(width,height,{fit:"cover"}).png().toBuffer();
  const store=renderStore.getStore();
  const r=options.circle?Math.min(width,height)/2:kit().photoRadius(radius);
  const stroke=store?kit().photoStroke(store.palette):null;
  const layers:OverlayOptions[]=[];
  if(r)layers.push({input:svg(width,height,`<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/>`),blend:"dest-in"});
  if(stroke)layers.push({input:svg(width,height,`<rect x="${stroke.width/2}" y="${stroke.width/2}" width="${width-stroke.width}" height="${height-stroke.width}" rx="${Math.max(0,r-stroke.width/2)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"/>`)});
  return layers.length?sharp(photo).composite(layers).png().toBuffer():photo;
}

// 단색 바탕 캔버스. 테마의 바탕 무늬(줄 노트·테두리 등)를 모든 레이어 아래에 먼저 깐다.
export function canvas(background:string,layers:OverlayOptions[]){
  const store=renderStore.getStore();
  const pattern=store?kit().background(store.palette,background):"";
  return sharp({create:{width:1080,height:1350,channels:3,background}}).composite(pattern?[svgLayer(pattern),...layers]:layers).jpeg({quality:92}).toBuffer();
}

// 카드 그리기 함수의 모양. 사진(0~3장), 장 내용, 장 번호, 전체 장 수, 색 조합을 받아 1080×1350 JPEG을 돌려준다.
export type CardRenderer=(inputs:Buffer[],slide:import("../carousel").CarouselSlidePlan,index:number,total:number,palette:Palette)=>Promise<Buffer>;
