import { noteAudit, registerPhoto, registerText } from "./audit";
import { STORE_NAME } from "../slideLayout";
import sharp, { type OverlayOptions } from "sharp";
import type { Sharp } from "sharp";
import path from "node:path";
import { access, readdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { isLight, type Palette } from "../design";
import { typographyOf, type FontFace, type Typography } from "../typography";
import type { ThemeId } from "../themes";
import * as decor from "../decor";
import { qualityOfEnhanced } from "./photoEnhance";

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
export type RenderContext={typography:Typography;theme:ThemeId;variant:number;palette:Palette;brandHandle?:string;tone?:"loud"|"calm";remoteCutout?:boolean};
const renderStore=new AsyncLocalStorage<RenderContext>();
export const withRenderContext=<T,>(context:RenderContext,task:()=>Promise<T>)=>renderStore.run(context,task);
export const currentTheme=():ThemeId=>renderStore.getStore()?.theme??"classic";
// 레이아웃 변형 번호(0부터). 레이아웃마다 변형 수가 다르므로 쓰는 쪽에서 % 개수로 고른다.
export const currentVariant=():number=>renderStore.getStore()?.variant??0;
// 장식 세기(계획서 B11). "calm"이면 장식이 많은 계열(kitsch·popup·neon·chalkboard)이 절제 변형으로 그린다.
export const currentTone=():"loud"|"calm"=>renderStore.getStore()?.tone??"loud";
// 원격 누끼(계획서 A7): 설정에서 켠 경우에만 true. 꺼져 있으면 지금처럼 서버 안에서만 누끼를 딴다(비용 없음).
export const currentRemoteCutout=():boolean=>renderStore.getStore()?.remoteCutout??false;
// 브랜드 키트: 바닥글의 가게 표시. 설정에 Instagram 계정이 있으면 "묵동홍어마을 · @계정"으로 모든 계열에 같은 모양으로 찍는다.
export const brandHandle=():string=>{const handle=renderStore.getStore()?.brandHandle?.replace(/^@/,"").trim();return handle?`@${handle}`:"";};
export const brandName=():string=>{
  const handle=brandHandle();
  return handle?`${STORE_NAME} · ${handle}`:STORE_NAME;
};

function resolveFont(role:Font):Font {
  const typography=renderStore.getStore()?.typography;
  if(!typography)return role;
  if(role===FONTS.bold)return fontFile(typography.title);
  if(role===FONTS.semibold)return fontFile(typography.label);
  if(role===FONTS.regular)return fontFile(typography.body);
  return role;
}

// ── 글자 ──────────────────────────────────────────────────────────────────────────────
// shadow: 사진 위에 얹는 글자용. 같은 글자를 검게 흐리게 한 그림자를 아래에 깔아 밝은 사진에서도 읽히게 한다.
// 그림자가 번질 자리만큼 사방에 SHADOW_PAD를 더 붙여 돌려준다(위치 계산에는 거의 영향이 없다).
// 미세 타이포 옵션(계획서 B2·B13). 모두 선택이며, 주지 않으면 예전과 같은 그림이 나온다.
//   letterSpacing : 자간(px, 음수면 좁힘). 큰 제목은 −size×.02 정도로 조이면 덩어리가 단단해 보인다. 영문 눈썹 글자는 +size×.2.
//   lineHeight    : 줄 높이 배수(Pango line_height). spacing(px)보다 글꼴마다 다른 기본 줄 높이에 덜 휘둘린다.
//   features      : OpenType 기능. "tnum"이면 숫자 폭이 같아져 장 번호(1 / 5, 10 / 10)가 흔들리지 않는다.
//   emphasis      : 제목 속 핵심어 1~2개만 다른 색으로(같은 레이어 안이라 줄바꿈·기준선이 그대로다).
export type TextEmphasis={words:string[];color:string};
type TextStyle={size:number;color:string;width:number;height:number;font?:Font;align?:"left"|"centre";spacing?:number;shadow?:boolean;letterSpacing?:number;lineHeight?:number;features?:string;emphasis?:TextEmphasis};
const SHADOW_PAD=10;
export type Layer={data:Buffer;info:{width:number;height:number}};

// Pango는 한글 음절 사이 어디서든 줄을 바꿔 "놀\n랄까요?"처럼 단어가 잘린다. 공백이 아닌 글자 사이에
// 단어 결합자(U+2060)를 넣어 띄어쓰기 자리에서만 줄이 바뀌게 한다. 너무 긴 단어만 글자 단위로 나뉜다.
const breakOnlyAtSpaces=(value:string)=>value.replace(/(\S)(?=\S)/g,"$1⁠");

// 글자를 Pango 마크업으로 바꾼다. 강조어가 있으면 그 부분만 <span foreground>로 감싼다.
// 강조 경계에서도 낱말이 끊기지 않도록 앞뒤가 모두 공백이 아니면 단어 결합자를 넣는다.
function textMarkup(value:string,emphasis?:TextEmphasis):string {
  const words=(emphasis?.words??[]).map(word=>word.trim()).filter(word=>word.length>=2&&value.includes(word)).slice(0,2);
  if(!words.length)return escapeXml(breakOnlyAtSpaces(value));
  // 긴 낱말부터 찾아 겹치지 않게 자른다("홍어회"와 "홍어"가 함께 오면 "홍어회"를 먼저).
  const pattern=new RegExp(`(${[...words].sort((a,b)=>b.length-a.length).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})`,"g");
  const parts=value.split(pattern).filter(part=>part.length>0);
  return parts.map((part,i)=>{
    const joined=escapeXml(breakOnlyAtSpaces(part));
    const glue=i<parts.length-1&&/\S$/.test(part)&&/^\S/.test(parts[i+1])?"⁠":"";
    return (words.includes(part)?`<span foreground="${emphasis!.color}">${joined}</span>`:joined)+glue;
  }).join("");
}

// 빠진 글자 대체: Pango 글꼴 이름을 "글꼴, Pretendard 굵기" 목록으로 만든다. 손글씨·디스플레이 글꼴에 없는 음절이나 기호가
// 시스템 중국어 글꼴(WenQuanYi)로 찍히던 것을 같은 굵기의 Pretendard로 메운다. 굵기 낱말은 family 끝에서 떼어 목록 전체에 건다.
const WEIGHT_WORDS=/\s+(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)$/;
export function fontDescription(family:string,size:number):string {
  const match=family.match(WEIGHT_WORDS);
  const base=match?family.slice(0,match.index):family;
  const weight=match?` ${match[1]}`:"";
  return base==="Pretendard"?`${family} ${size}`:`${base},Pretendard${weight} ${size}`;
}

// 대체 글꼴(Pretendard)이 fontconfig에 등록돼 있어야 위 목록이 동작한다. sharp는 fontfile로 그린 글꼴만 등록하므로
// 프로세스에서 처음 글자를 그릴 때 assets/fonts의 모든 글꼴로 한 글자씩 그려 한꺼번에 등록한다(약 80ms, 한 번만).
let fontsReady:Promise<void>|null=null;
export function preloadFonts():Promise<void> {
  fontsReady??=readdir(FONT_DIR).then(files=>Promise.all(files.filter(file=>/\.(ttf|otf)$/i.test(file)).map(file=>
    sharp({text:{text:"홍",font:"sans 8",fontfile:path.join(FONT_DIR,file)}}).png().toBuffer().catch(()=>undefined)))).then(()=>undefined);
  return fontsReady;
}

// 제목·요점·라벨이 모두 같은 경로로 그려지도록 하는 공용 텍스트 레이어. 결과의 info.height로 다음 요소 위치를 잡는다.
export async function textLayer(value:string,style:TextStyle):Promise<Layer> {
  const font=resolveFont(style.font??FONTS.bold);
  await access(font.file);
  await preloadFonts();
  // 바깥 span에 색과 미세 타이포 속성을 한꺼번에 건다(Pango 단위: letter_spacing은 1/1024pt, 기본 72dpi라 1pt=1px).
  const attrs=[`foreground="${style.color}"`,
    ...(style.letterSpacing?[`letter_spacing="${Math.round(style.letterSpacing*1024)}"`]:[]),
    ...(style.lineHeight?[`line_height="${style.lineHeight}"`]:[]),
    ...(style.features?[`font_features="${style.features}"`]:[])].join(" ");
  const rendered=await sharp({text:{text:`<span ${attrs}>${textMarkup(value,style.emphasis)}</span>`,font:fontDescription(font.family,style.size),fontfile:font.file,width:Math.round(style.width),wrap:"word-char",align:style.align??"left",spacing:style.spacing??12,rgba:true}})
    .png().toBuffer({resolveWithObject:true});
  // 주어진 상자(width×height)를 넘으면 그림째 줄인다. 글자가 작아져 읽기 힘들어지는 "몰래 축소"이므로 검수 메모를 남긴다.
  const W=Math.round(style.width),H=Math.round(style.height);
  const fits=rendered.info.width<=W&&rendered.info.height<=H;
  if(!fits)noteAudit({kind:"shrink",text:value.slice(0,24),from:rendered.info.height,to:H});
  const layer=fits?rendered:await sharp(rendered.data).resize({width:W,height:H,fit:"inside",withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
  const result=style.shadow?await withShadow(layer,value,style,font):layer;
  // 자동 검수(render/audit.ts)가 이 버퍼를 "글자"로 알아보도록 등록한다.
  registerText(result.data,{width:result.info.width,height:result.info.height,color:style.color,size:style.size,...(style.shadow?{mask:layer.data,maskOffset:SHADOW_PAD}:{})});
  return result;
}

async function withShadow(layer:Layer,value:string,style:TextStyle,font:Font):Promise<Layer> {
  const dark=await textLayer(value,{...style,color:"#000000",font,shadow:false,emphasis:undefined});
  const P=SHADOW_PAD;
  // 검은 글자를 살짝 번지게(blur) 한 뒤 알파를 세게 키워 획 둘레 3px 정도의 진한 테두리를 만들고,
  // 다시 부드럽게 풀어 92% 농도로 깐다. 자막처럼 흰 사진 위에서도 글자 둘레가 어두워져 읽힌다.
  const shadow=await sharp(dark.data).extend({top:P,bottom:P,left:P,right:P,background:{r:0,g:0,b:0,alpha:0}})
    .blur(2.5).ensureAlpha().linear([1,1,1,3.2],[0,0,0,0]).png().toBuffer()
    .then(buffer=>sharp(buffer).blur(1.4).linear([1,1,1,.92],[0,0,0,0]).png().toBuffer());
  return sharp({create:{width:layer.info.width+P*2,height:layer.info.height+P*2,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:shadow,left:0,top:1},{input:layer.data,left:P,top:P}])
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
    // 높이 제한을 두지 않는다: 예전 size×3 제한은 좁은 칸에서 4줄로 접히는 요점을 그림째 줄여(몰래 축소) 글자가 작아졌다.
    // 길어서 넘치면 자동 검수가 잡아 요점을 하나씩 빼고 다시 그린다(composeSlideCard).
    const text=await textLayer(line,{size,color:options.color,width:width-indent,height:4000,font:FONTS.regular,spacing:8,align:options.align});
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
// 사진을 카드에 들어갈 크기로 자르고, "그 크기에서" 선명하게 마무리한다(음식 결·윤기가 살아 보이게).
//
// 왜 여기서 하나: 보정(photoEnhance)은 1600px에서 끝나고 카드 칸은 300~1080px라, 큰 사진에서 건 선명화는 줄이면서 대부분
// 사라진다. 그래서 줄인 "뒤"에 두 번 건다.
//   1) 잔결 선명화 sigma .6: 홍어 결·깨·김 같은 가는 무늬. m1 .4(평평한 곳 약하게)·m2 1.2(경계 강하게)라 매끈한 접시는 거칠어지지 않는다.
//   2) 큰 반경 언샤프 sigma 8, m1 0·m2 .3: 국소 대비(입체감). clahe는 1080×1350에서 1.6초라 대신 쓴다(약 200ms).
// sharp는 한 파이프라인에 sharpen을 한 번만 기억하므로 raw 버퍼를 사이에 두고 두 번 돌린다(인코드 비용 없음).
// finish:"none"은 흑백·흐림처럼 계열이 사진을 일부러 뭉개는 경우용이다.
// zoom(1~1.3): 칸보다 zoom배 크게 자른 뒤 가운데(또는 focus)를 잘라 내 음식을 더 가깝게 보인다(접사 느낌).
//   원형·메달처럼 작은 창에 접시 전체가 들어가 음식이 손톱만 해지는 경우에 쓴다(원형 1.25, 표지 1.12 정도).
// focus({x,y}, 0~1): 음식 중심이 어디인지 알 때(나중에 AI 상자로 채운다) 그 점이 칸 가운데에 오도록 자른다.
//   없으면 sharp의 attention(눈에 띄는 곳) 위치를 쓴다.
// 보정 단계에서 "흔들림·작은 사진"으로 잰 사진은 선명화를 약하게 한다(softFinish).
// 계열 파일은 이 뒤에 색(채도·온기)만 손대고 sharpen을 또 걸지 않는다(이중 선명화는 헤일로·JPEG 블록을 키운다).
export type PhotoFinish="food"|"none";
export type PhotoCrop={finish?:PhotoFinish;position?:string;zoom?:number;focus?:{x:number;y:number}};
export async function finishPhoto(input:Buffer,rawWidth:number,rawHeight:number,options:PhotoCrop={}):Promise<Buffer> {
  // 레이아웃 계산에서 소수가 섞여 와도(긴 문안일 때 높이의 절반 등) sharp가 받을 수 있게 정수로 맞춘다.
  const width=Math.max(1,Math.round(rawWidth)),height=Math.max(1,Math.round(rawHeight));
  const resized=await cropTo(input,width,height,options);
  let photo:Buffer;
  if((options.finish??"food")==="none")photo=await resized.png().toBuffer();
  else if(softFinish(input)){
    // 흐리거나 작은 사진은 선명화가 노이즈·JPEG 계단을 키운다. 잔결은 약하게(m2 .8), 큰 반경 언샤프는 건너뛴다.
    photo=await resized.removeAlpha().sharpen({sigma:.6,m1:.3,m2:.8}).png().toBuffer();
  }else{
    const fine=await resized.removeAlpha().sharpen({sigma:.6,m1:.4,m2:1.2}).raw().toBuffer({resolveWithObject:true});
    photo=await sharp(fine.data,{raw:{width:fine.info.width,height:fine.info.height,channels:fine.info.channels}}).sharpen({sigma:8,m1:0,m2:.3}).png().toBuffer();
  }
  // 자동 검수가 사진 면적을 잴 수 있게 등록한다(render/audit.ts).
  registerPhoto(photo);
  return photo;
}

// 보정 단계(enhancePhoto)에서 잰 품질이 흔들림·작은 사진이면 true. 보정을 거치지 않은 버퍼(검수·테스트)는 기존대로.
const softFinish=(input:Buffer)=>{const flags=qualityOfEnhanced(input)?.flags;return !!flags&&(flags.includes("blurry")||flags.includes("lowres"));};

// 칸 크기로 자르기(확대·초점 반영). 결과는 아직 인코드하지 않은 sharp 파이프라인.
async function cropTo(input:Buffer,width:number,height:number,options:PhotoCrop):Promise<Sharp> {
  const zoom=Math.min(1.3,Math.max(1,options.zoom??1));
  if(!options.focus&&zoom===1)return sharp(input).rotate().resize(width,height,{fit:"cover",position:options.position??"attention"});
  if(!options.focus){
    // 칸보다 zoom배 크게 attention으로 자른 뒤 가운데를 다시 잘라 낸다.
    const W=Math.round(width*zoom),H=Math.round(height*zoom);
    const big=await sharp(input).rotate().resize(W,H,{fit:"cover",position:options.position??"attention"}).raw().toBuffer({resolveWithObject:true});
    return sharp(big.data,{raw:{width:W,height:H,channels:big.info.channels}}).extract({left:Math.round((W-width)/2),top:Math.round((H-height)/2),width,height});
  }
  // 초점이 있으면: 칸을 zoom배로 덮는 크기로 키운 뒤, 초점이 칸 가운데에 오도록(가장자리를 넘지 않게) 잘라 낸다.
  const upright=await sharp(input).rotate().toBuffer({resolveWithObject:true});
  const scale=Math.max(width*zoom/upright.info.width,height*zoom/upright.info.height);
  const RW=Math.max(width,Math.round(upright.info.width*scale)),RH=Math.max(height,Math.round(upright.info.height*scale));
  const left=Math.round(Math.min(RW-width,Math.max(0,options.focus.x*RW-width/2)));
  const top=Math.round(Math.min(RH-height,Math.max(0,options.focus.y*RH-height/2)));
  const big=await sharp(upright.data).resize(RW,RH,{fit:"fill"}).raw().toBuffer({resolveWithObject:true});
  return sharp(big.data,{raw:{width:RW,height:RH,channels:big.info.channels}}).extract({left,top,width,height});
}

// 모서리를 둥글게 자른 사진 레이어. radius는 테마에 맞게 바뀌고(잡지·포스터는 각지게), 포스터는 굵은 테두리를 두른다.
export async function croppedPhoto(input:Buffer,rawWidth:number,rawHeight:number,radius:number,options:{circle?:boolean}&PhotoCrop={}){
  const width=Math.max(1,Math.round(rawWidth)),height=Math.max(1,Math.round(rawHeight));
  const photo=await finishPhoto(input,width,height,options);
  const store=renderStore.getStore();
  const r=options.circle?Math.min(width,height)/2:kit().photoRadius(radius);
  const stroke=store?kit().photoStroke(store.palette):null;
  const layers:OverlayOptions[]=[];
  if(r)layers.push({input:svg(width,height,`<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/>`),blend:"dest-in"});
  if(stroke)layers.push({input:svg(width,height,`<rect x="${stroke.width/2}" y="${stroke.width/2}" width="${width-stroke.width}" height="${height-stroke.width}" rx="${Math.max(0,r-stroke.width/2)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"/>`)});
  if(!layers.length)return photo;
  const shaped=await sharp(photo).composite(layers).png().toBuffer();
  registerPhoto(shaped);
  return shaped;
}

// 단색 바탕 캔버스. 테마의 바탕 무늬(줄 노트·테두리 등)를 모든 레이어 아래에 먼저 깐다.
export function canvas(background:string,layers:OverlayOptions[]){
  const store=renderStore.getStore();
  const pattern=store?kit().background(store.palette,background):"";
  return sharp({create:{width:1080,height:1350,channels:3,background}}).composite(pattern?[svgLayer(pattern),...layers]:layers).jpeg({quality:92}).toBuffer();
}

// 카드 그리기 함수의 모양. 사진(0~3장), 장 내용, 장 번호, 전체 장 수, 색 조합을 받아 1080×1350 JPEG을 돌려준다.
export type CardRenderer=(inputs:Buffer[],slide:import("../carousel").CarouselSlidePlan,index:number,total:number,palette:Palette)=>Promise<Buffer>;
