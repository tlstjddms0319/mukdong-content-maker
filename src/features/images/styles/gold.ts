import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svg, svgLayer, textLayer, type CardRenderer, type Layer, type TextEmphasis } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { MIN_STROKE, STYLE_FONTS, chooseTitleLayout, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { seeded } from "./handDrawn";
import { innerShadow } from "../decor";

// 블랙 & 골드(연말 모임·기념일·프리미엄 코스): 검은 벨벳 바탕 위에 금박 선으로만 그린 이중 액자와 꽃무늬 모서리 장식,
// 금박을 입힌 현대 명조(함렛) 제목, 아치(위가 둥근) 창 안의 사진. 호텔 연회 초대장처럼 격식 있고 반짝임은 절제한다.
// 금색은 선·글자·작은 장식에만 쓴다. 금색 면이 커지면 싸 보이므로 바탕은 끝까지 검게 둔다.
const BLACK="#0B0A08",GOLD="#C9A24A",GOLD_LIGHT="#EBD38A",GOLD_DARK="#8E6A22",CREAM="#EFE6D2";
const FRAME_OUT=28,FRAME_IN=46,CORNER=78;  // 액자: 바깥 굵은 선 위치, 안쪽 가는 선 위치, 안쪽 선이 모서리에서 비워 두는 길이
// 금박 제목 속 핵심어: 금박 대신 밝은 상아색 단색으로 찍어 금빛 줄 안에서 한 낱말만 떠오르게 한다(검은 바탕 위 15:1 이상).
const EMPHASIS="#FFF4DA";
const M=110,W=1080-M*2;                    // 본문 좌우 여백·폭. 표지 제목도 이 폭 안에 두어 인스타 격자(좌우 34px) 잘림을 피한다.
const FOOTER=1350-120;                     // 바닥글 금선 y. 선 가운데 틈에 장 번호, 그 아래에 가게 이름이 들어간다.
const r1=(value:number)=>Math.round(value*10)/10;
// 양각 금선: 같은 선을 밝은 금(왼쪽 위로 반 칸)과 어두운 금(오른쪽 아래로 반 칸) 두 줄로 나란히 그어,
// 빛이 왼쪽 위에서 올 때 솟은 금속 테처럼 보이게 한다. 두 줄 합친 굵기는 원래 굵기 이상(폰에서 사라지지 않게 MIN_STROKE 이상).
function embossed(d:string,width:number,opacity=1):string {
  const half=r1(Math.max(1.5,width/2)),shift=r1(half/2);
  return `<g fill="none" stroke-opacity="${opacity}"><path d="${d}" transform="translate(${shift} ${shift})" stroke="${GOLD_DARK}" stroke-width="${half}"/><path d="${d}" transform="translate(${-shift} ${-shift})" stroke="${GOLD_LIGHT}" stroke-width="${half}"/></g>`;
}
const rectPath=(x:number,y:number,w:number,h:number)=>`M${x} ${y}H${x+w}V${y+h}H${x}Z`;

// ── 금색 장식 조각 ───────────────────────────────────────────────────────────────────────
// 네 갈래 별 ✦. 밝은 금색으로 작게만 찍는다(표지 여백, 요점 글머리).
const star=(x:number,y:number,r:number,opacity=1)=>`<path d="M${r1(x)} ${r1(y-r)}Q${r1(x)} ${r1(y)} ${r1(x+r)} ${r1(y)}Q${r1(x)} ${r1(y)} ${r1(x)} ${r1(y+r)}Q${r1(x)} ${r1(y)} ${r1(x-r)} ${r1(y)}Q${r1(x)} ${r1(y)} ${r1(x)} ${r1(y-r)}Z" fill="${GOLD_LIGHT}" fill-opacity="${opacity}"/>`;
// 작은 마름모(선 끝·구분선 가운데 점).
const diamond=(x:number,y:number,r:number,fill=GOLD)=>`<path d="M${r1(x)} ${r1(y-r)}L${r1(x+r*.62)} ${r1(y)}L${r1(x)} ${r1(y+r)}L${r1(x-r*.62)} ${r1(y)}Z" fill="${fill}"/>`;
// 플뢰롱 ❖: 네 방향으로 뻗은 잎(마름모) 네 장. 가운데가 살짝 비어 ❖ 글자처럼 보인다.
function fleuron(cx:number,cy:number,s:number,fill=GOLD):string {
  const petal=(a:number)=>{
    const c=Math.cos(a),si=Math.sin(a);
    const p=(d:number,w:number)=>`${r1(cx+c*d-si*w)} ${r1(cy+si*d+c*w)}`;
    return `M${p(s,0)}L${p(s*.55,s*.3)}L${p(s*.2,0)}L${p(s*.55,-s*.3)}Z`;
  };
  return `<path d="${[0,Math.PI/2,Math.PI,Math.PI*1.5].map(petal).join("")}" fill="${fill}"/>`;
}
// 소용돌이: 중심 (cx,cy) 반지름 R의 원 위 start 각도에서 dir 방향으로 turns바퀴 돌며 반지름이 줄어드는 선.
function spiral(cx:number,cy:number,R:number,start:number,dir:1|-1,turns=1.35,steps=44):string {
  return Array.from({length:steps+1},(_,i)=>{
    const t=i/steps,a=start+dir*t*Math.PI*2*turns,r=R*(1-.74*t);
    return `${i?"L":"M"}${r1(cx+Math.cos(a)*r)} ${r1(cy+Math.sin(a)*r)}`;
  }).join("");
}
// 모서리 꽃무늬: 왼쪽 위 모서리 기준(원점이 모서리, 안쪽이 +x·+y). 끊어진 안쪽 선의 두 끝에서 안으로 말리는 소용돌이,
// 대각선 위에 잎(마름모) 하나와 작은 점. 나머지 모서리는 이 조각을 뒤집어(scale) 쓴다.
function cornerFlourish():string {
  const R=13;
  const curls=spiral(CORNER,R,R,-Math.PI/2,-1)+spiral(R,CORNER,R,Math.PI,1);
  return `<path d="${curls}" fill="none" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-linecap="round"/>`
    +`<path d="M16 16L33 24L42 42L24 33Z" fill="${GOLD}"/><circle cx="52" cy="52" r="2.2" fill="${GOLD_LIGHT}"/>`
    +`<path d="M42 42Q58 50 ${CORNER-R} ${R*2}M42 42Q50 58 ${R*2} ${CORNER-R}" fill="none" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".8"/>`;
}
// 액자: 바깥 3.5px 금선, 안쪽 가는 금선(MIN_STROKE, 1px은 폰에서 사라진다)(모서리와 위 가운데에서 끊김), 네 모서리 꽃무늬, 위 가운데 플뢰롱.
function frame():string {
  const x0=FRAME_IN,y0=FRAME_IN,x1=1080-FRAME_IN,y1=1350-FRAME_IN,gap=46;
  const piece=cornerFlourish();
  // 바깥 굵은 선만 양각(밝은+어두운 두 줄). 안쪽 가는 선까지 양각하면 선이 지저분하게 두 겹으로 보여 그대로 둔다.
  return embossed(rectPath(FRAME_OUT,FRAME_OUT,1080-FRAME_OUT*2,1350-FRAME_OUT*2),3.5)
    +`<path d="M${x0+CORNER} ${y0}H${540-gap}M${540+gap} ${y0}H${x1-CORNER}M${x0+CORNER} ${y1}H${x1-CORNER}M${x0} ${y0+CORNER}V${y1-CORNER}M${x1} ${y0+CORNER}V${y1-CORNER}" fill="none" stroke="${GOLD}" stroke-width="${MIN_STROKE}"/>`
    +`<g transform="translate(${x0} ${y0})">${piece}</g><g transform="translate(${x1} ${y0}) scale(-1 1)">${piece}</g>`
    +`<g transform="translate(${x0} ${y1}) scale(1 -1)">${piece}</g><g transform="translate(${x1} ${y1}) scale(-1 -1)">${piece}</g>`
    +fleuron(540,y0,15)+diamond(540-gap+4,y0,3.5)+diamond(540+gap-4,y0,3.5);
}
// 바탕: 가운데에 아주 옅은 따뜻한 빛(촛불 아래 검은 식탁보처럼). 금색 면이 아니라 빛이므로 아주 약하게.
const background=()=>`<defs><radialGradient id="goldVignette" cx="50%" cy="44%" r="62%"><stop offset="0" stop-color="#3A2A10" stop-opacity=".55"/><stop offset="1" stop-color="#3A2A10" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#goldVignette)"/>`;
// 벨벳 질감(soft-light)은 넣지 않는다: 검은 바탕 위 soft-light는 결이 아니라 바탕만 밝게 들뜨게 했고(평균 +10),
// JPEG 재압축 뒤 원본 크롭에서 결의 표준편차가 1 안팎이라 눈에 보이지 않았다. 바탕은 계속 검게 둔다.
// 양옆 가는 선 + 가운데 플뢰롱 구분선(제목 아래).
const ornamentRule=(y:number,half=290)=>`<path d="M${540-half} ${y}H${540-40}M${540+40} ${y}H${540+half}" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".85"/>`
  +fleuron(540,y,13)+diamond(540-half,y,4)+diamond(540+half,y,4);
// 요점 사이 가는 금선(가운데 작은 마름모).
const thinRule=(y:number,half=170)=>`<path d="M${540-half} ${y}H${540-14}M${540+14} ${y}H${540+half}" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".55"/>`+diamond(540,y,5);

// ── 사진 ────────────────────────────────────────────────────────────────────────────
// 아치 창 경로(위가 반원, 아래는 각진 사각). 사진 마스크와 둘레 금 링에 함께 쓴다.
const archPath=(x:number,y:number,w:number,h:number)=>{const r=w/2;return `M${r1(x)} ${r1(y+r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(x+w)} ${r1(y+r)}V${r1(y+h)}H${r1(x)}Z`;};
// 사진 보정: 촛불 아래처럼 채도를 조금 올리고(.92→1.04, 밝기는 그대로) 가장자리를 옅게 어둡게(비네트 .42→.3) 해
// 검은 바탕에 잠기면서도 음식은 또렷하게 보이게 한다.
async function photo(input:Buffer,width:number,height:number):Promise<Buffer> {
  const Wp=Math.round(width),Hp=Math.round(height);
  const base=await sharp(await finishPhoto(input,Wp,Hp)).modulate({saturation:1.04}).ensureAlpha().png().toBuffer();
  const shade=svg(Wp,Hp,`<defs><radialGradient id="goldShade" cx="50%" cy="50%" r="70%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".3"/></radialGradient></defs><rect width="${Wp}" height="${Hp}" fill="url(#goldShade)"/>`);
  const shaded=await sharp(base).composite([{input:shade,left:0,top:0}]).png().toBuffer();
  registerPhoto(shaded);
  return shaded;
}
// 아치 창 사진: 보정한 사진에 아치 마스크를 dest-in으로 얹어 창 모양만 남긴다.
async function archPhoto(input:Buffer,width:number,height:number):Promise<Buffer> {
  const Wp=Math.round(width),Hp=Math.round(height);
  const mask=svg(Wp,Hp,`<path d="${archPath(0,0,Wp,Hp)}" fill="#fff"/>`);
  const shaped=await sharp(await photo(input,Wp,Hp)).composite([{input:mask,blend:"dest-in"}]).png().toBuffer();
  // 보정·마스크를 거친 새 버퍼는 자동 등록되지 않으므로 직접 등록한다(검수의 사진 면적 측정).
  registerPhoto(shaped);
  return shaped;
}
// 아치 둘레 금 링 두 줄: 창 가장자리(마스크 가장자리의 계단을 덮는다)와 12px 바깥. 둘 다 MIN_STROKE 이상.
// 창 가장자리 링은 양각(밝은+어두운 두 줄)으로 금속 테 느낌을 낸다. 안쪽 그림자는 사진 바로 위에 따로 얹는다(fastInnerShadow).
const archRings=(x:number,y:number,w:number,h:number)=>embossed(archPath(x,y,w,h),3.5)
  +`<path d="${archPath(x-12,y-12,w+24,h+24)}" fill="none" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".8"/>`;
// 아치 창 뒤 따뜻한 후광: 촛불이 창 뒤에서 비치듯 아치 꼭대기 쪽에 옅은 호박색 빛. 금색 면이 아니라 빛이라 아주 약하게.
const archHalo=(x:number,y:number,w:number,h:number)=>{const id=`goldHalo${Math.round(x)}`,cx=x+w/2,cy=y+Math.min(h*.4,w*.5);
  // 그라데이션이 투명해지는 반지름 밖은 칠하지 않으므로 캔버스 전체 사각에 칠해도 경계선이 생기지 않는다.
  return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.max(w*.62,h*.55))}"><stop offset=".35" stop-color="#7A5420" stop-opacity=".34"/><stop offset=".7" stop-color="#7A5420" stop-opacity=".12"/><stop offset="1" stop-color="#7A5420" stop-opacity="0"/></radialGradient></defs>`
    +`<rect width="1080" height="1350" fill="url(#${id})"/>`;};

// 흐린 그림자 SVG 조각을 1/4 해상도로 그려 제자리 크기로 키운 레이어. 큰 흐림 필터는 librsvg에서 400ms 가까이 들지만
// 흐린 그림은 저해상도로 그려 키워도 똑같이 부드럽다(1/16 픽셀). clip을 주면 키운 뒤 원래 해상도로 창 모양을 또렷하게 자른다.
// SVG를 먼저 작은 PNG로 굳힌 뒤 키운다: SVG 입력에 바로 resize를 걸면 sharp가 SVG를 목표 크기로 다시 그려 이득이 사라진다.
async function lowResLayer(body:string,x:number,y:number,w:number,h:number,clip?:string):Promise<OverlayOptions> {
  const X=Math.floor(x),Y=Math.floor(y),Wd=Math.ceil(w),Hd=Math.ceil(h);
  const small=await sharp(Buffer.from(`<svg width="${Math.ceil(Wd/4)}" height="${Math.ceil(Hd/4)}" viewBox="${X} ${Y} ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`)).png({compressionLevel:1}).toBuffer();
  let image=sharp(small).resize(Wd,Hd,{fit:"fill"});
  if(clip)image=image.composite([{input:Buffer.from(`<svg width="${Wd}" height="${Hd}" viewBox="${X} ${Y} ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg"><path d="${clip}" fill="#fff"/></svg>`),blend:"dest-in"}]);
  return {input:await image.png({compressionLevel:1}).toBuffer(),left:X,top:Y};
}
// 창 안쪽 그림자(공용 innerShadow)를 저해상도로: 공용 조각의 clip-path는 떼고, 자르기는 lowResLayer가 원래 해상도로 한다.
const fastInnerShadow=(x:number,y:number,w:number,h:number,blur:number,opacity:number,path?:string)=>{
  const shape=path??`M${x} ${y}H${x+w}V${y+h}H${x}Z`;
  return lowResLayer(innerShadow({x,y,width:w,height:h,path:shape,blur,opacity}).replace(/ clip-path="url\(#[^)]*\)"/,""),x,y,w,h,shape);
};

// ── 금박 글자 ───────────────────────────────────────────────────────────────────────────
// 제목 글자를 금박처럼: 글자 레이어와 같은 크기의 세로 금색 그라데이션(밝음→금→어두움→밝음)을 만들고
// 글자 알파를 dest-in 마스크로 써서 글자 모양만 남긴다. 그라데이션은 줄 높이마다 반복해 모든 줄이 같은 빛을 받게 한다.
// 이렇게 만든 레이어는 textLayer 결과가 아니라 자동 검수가 글자로 추적하지 않으므로, 쓰는 쪽에서
// 같은 자리에 base(원래 textLayer, 금색)를 먼저 그리고 그 위에 foil을 정확히 겹쳐 검수 추적을 유지한다.
// 핵심어 강조(emphasis)가 있으면 base는 그 낱말만 강조색으로 그리고, 금박은 그 낱말 자리를 비워 두어 강조색이 그대로 보이게 한다.
async function foilText(value:string,options:{sizes:number[];width:number;maxHeight:number;align?:"left"|"centre";emphasis?:TextEmphasis}):Promise<{base:Layer;foil:Buffer;depth:Buffer;lines:number}> {
  // 크기와 균형 줄바꿈 폭은 모든 계열 공용 규칙(chooseTitleLayout)으로 정한다. 줄 높이를 알아야 하므로 고른 크기를 쓴다.
  const font=STYLE_FONTS.modernSerif,align=options.align??"centre";
  const layout=await chooseTitleLayout(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,font,align,spacing:size=>Math.round(size*.16)});
  const size=layout.size;
  const style={size,color:GOLD,width:layout.width,height:layout.fits?4000:options.maxHeight,font,align,spacing:Math.round(size*.16)} as const;
  const base:Layer=await textLayer(layout.text,{...style,emphasis:options.emphasis});
  // 금박 마스크: 강조가 없으면 base의 알파 그대로. 강조가 있으면 강조 없이 한 번 더 그려(같은 줄바꿈) 색이 다른 픽셀(=강조어)을 지운다.
  // 이 비교용 그림은 화면에 올리지 않으므로 검수 글자로 세지 않는다.
  let mask=base.data;
  if(options.emphasis){
    const plain=await textLayer(layout.text,style);
    if(plain.info.width===base.info.width&&plain.info.height===base.info.height){
      const [a,b]=await Promise.all([sharp(base.data).ensureAlpha().raw().toBuffer(),sharp(plain.data).ensureAlpha().raw().toBuffer()]);
      for(let i=0;i<b.length;i+=4)if(a[i+3]>0&&Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>60)b[i+3]=0;
      mask=await sharp(b,{raw:{width:plain.info.width,height:plain.info.height,channels:4}}).png().toBuffer();
    }
  }
  // 한 줄 높이: 같은 글꼴·크기로 한 글자를 그려 잰다(여러 줄 레이어 높이 = 줄 수×줄 높이 + (줄 수-1)×spacing).
  const probe=await textLayer("홍",{size,color:GOLD,width:300,height:400,font});
  const period=probe.info.height+Math.round(size*.16);
  const {width:Wt,height:Ht}=base.info;
  // 금박 그라데이션은 대각선(왼쪽 위 → 오른쪽 아래)으로 흐르게 해, 줄마다 반복되는 빛이 글자를 비스듬히 훑고 지나가게 한다.
  const gradient=Buffer.from(`<svg width="${Wt}" height="${Ht}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="goldFoil" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Math.round(period*.55)}" y2="${period}" spreadMethod="repeat">`
    +`<stop offset="0" stop-color="${GOLD_LIGHT}"/><stop offset=".38" stop-color="${GOLD}"/><stop offset=".64" stop-color="${GOLD_DARK}"/><stop offset=".86" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_LIGHT}"/>`
    +`</linearGradient></defs><rect width="${Wt}" height="${Ht}" fill="url(#goldFoil)"/></svg>`);
  const flat=await sharp(gradient).ensureAlpha().composite([{input:mask,blend:"dest-in"}]).png({compressionLevel:1}).toBuffer();
  // 베벨 조명: 글자 알파를 흐려(2.5) 높이 지도로 삼고 왼쪽 위에서 비추는 반사광(feSpecularLighting)을 만든다.
  // 반사광은 검은 바탕에 펼친 불투명 그림으로 만들어 screen으로 얹는다(반투명 그림의 blend는 libvips에서 어긋난다).
  // 약한 값(specularConstant 1 이하·surfaceScale 3 이하)은 폰 크기에서 전혀 안 보여 일부러 세게 둔다.
  const light=Buffer.from(`<svg width="${Wt}" height="${Ht}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><filter id="bevel" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`
    +`<feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="h"/><feSpecularLighting in="h" surfaceScale="6" specularConstant="1.8" specularExponent="10" lighting-color="#FFF4D2" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>`
    +`<feComposite in="s" in2="SourceAlpha" operator="in"/></filter></defs><rect width="${Wt}" height="${Ht}" fill="#000"/>`
    +`<image width="${Wt}" height="${Ht}" xlink:href="data:image/png;base64,${mask.toString("base64")}" filter="url(#bevel)"/></svg>`);
  const foil=await sharp(flat).composite([{input:await sharp(light).removeAlpha().png({compressionLevel:1}).toBuffer(),blend:"screen"},{input:mask,blend:"dest-in"}]).png({compressionLevel:1}).toBuffer();
  // 금박 두께: 같은 글자 모양(마스크)을 어두운 금으로 칠해 오른쪽 아래로 1~2px 밀어 금박 밑에 깐다.
  // 글자를 다시 찍지 않고 base에서 파생한 그림이라 검수 글자로 세지 않는다(같은 글자 두 번 → 겹침 오탐 방지).
  const depth=await sharp({create:{width:Wt,height:Ht,channels:4,background:GOLD_DARK}}).composite([{input:mask,blend:"dest-in"}]).png({compressionLevel:1}).toBuffer();
  return {base,foil,depth,lines:Math.max(1,Math.round((Ht+Math.round(size*.16))/period))};
}
// base와 foil을 같은 자리에 겹쳐 올린다(검수는 base를 추적, 눈에는 foil이 보인다). 두께(depth)는 그 사이에 1·2px 어긋나게.
const foilLayers=(text:{base:Layer;foil:Buffer;depth:Buffer},left:number,top:number):OverlayOptions[]=>[{input:text.base.data,left,top},{input:text.depth,left:left+1,top:top+2},{input:text.foil,left,top}];

export const renderGold:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const rand=seeded(index*31+(slide.variant??0));
  const layers:OverlayOptions[]=[];
  let under=background()+frame(),over="";
  const shots=inputs.slice(0,2);
  const emphasis=emphasisOf(content,EMPHASIS);
  // 눈썹 글자: 예전 영문 대문자(MUKDONG HONGEO) 대신 한글 가게 이름(사장님 결정). 띄어 쓴 글자가 아니라 letterSpacing으로 자간을 넓혀
  // 초대장 머리글처럼 보이게 하고, 양옆에 가는 금선과 작은 마름모.
  const eyebrow=await textLayer("묵동홍어마을",{size:30,color:GOLD,width:700,height:56,font:STYLE_FONTS.modernSerif,align:"centre",letterSpacing:30*.42});
  const eyebrowTop=FRAME_IN+42,ex=Math.round(540-eyebrow.info.width/2),ecy=eyebrowTop+eyebrow.info.height/2;
  under+=`<path d="M${M+50} ${ecy}H${ex-30}M${ex+eyebrow.info.width+30} ${ecy}H${1080-M-50}" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".7"/>`+diamond(M+50,ecy,4)+diamond(1080-M-50,ecy,4);
  layers.push({input:eyebrow.data,left:ex,top:eyebrowTop});
  // 마지막 장 명함: 바닥글 금선 위에 두고 그 높이만큼 본문 범위를 미리 줄인다.
  const closing=content.last?await closingBlock({width:W,color:GOLD_LIGHT,accent:GOLD_DARK,font:STYLE_FONTS.modernSerif}):null;
  const CLOSING_GAP=56;
  // 본문 범위: 눈썹 아래부터 바닥글 금선 위(마지막 장은 명함 위)까지. 각 장은 덩어리 높이를 재서 이 범위의 세로 가운데에 둔다.
  const top=eyebrowTop+eyebrow.info.height+40,bottom=FOOTER-44-(closing?closing.height+CLOSING_GAP:0),avail=bottom-top;
  // 마지막 장은 명함 자리 때문에 좁다: 요점 수를 줄이기 전에 사진·요점 글자를 먼저 줄인다.
  const tight=!!closing;
  // 요점 레이어(✦ 글머리 왼쪽 정렬 또는 가운데 정렬). size를 바꿔 다시 잴 수 있게 함수로.
  const pointLayers=(size:number,width:number,align:"left"|"centre",count=4)=>Promise.all(content.points.slice(0,count).map(point=>textLayer(point,{size,color:CREAM,width,height:size*4,font:STYLE_FONTS.serif,align,spacing:Math.round(size*.22)})));
  const sumH=(items:Layer[],gap:number)=>items.reduce((sum,item)=>sum+item.info.height,0)+Math.max(0,items.length-1)*gap;

  if(content.kind==="cover"&&shots.length){
    // 표지: 아치 창 안에 사진을 크게, 아래 금박 제목 가운데 정렬 → 크림색 부제 한 줄. 바닥글 금선 바로 위에 예고 띠(금색 작은 글자).
    const title=await foilText(content.headline,{sizes:[92,84,76,68],width:W,maxHeight:340,emphasis});
    const sub=content.subline?await textLayer(content.subline,{size:34,color:CREAM,width:W,height:56,font:STYLE_FONTS.serif,align:"centre"}):null;
    const teaser=content.teaser?await textLayer(content.teaser,{size:26,color:GOLD,width:W-80,height:44,font:STYLE_FONTS.serif,align:"centre",letterSpacing:26*.04}):null;
    const teaserH=teaser?teaser.info.height+28:0;
    // 창 폭 860(본문 폭 W 전체): 금 링(12px 바깥)까지 액자 안쪽 선 안에 들어간다.
    const archW=W,gap=64,subGap=18;
    const room=avail-teaserH;
    // 부제는 창이 520 아래로 줄어야 할 만큼 자리가 없으면 뺀다(사진이 주인공, 넘침 금지).
    const useSub=!!sub&&room-title.base.info.height-gap-sub.info.height-subGap>=520;
    const textH=title.base.info.height+(useSub&&sub?subGap+sub.info.height:0);
    // 창 높이는 "남는 높이"(제목·부제·예고·간격을 뺀 나머지)에서 정한다. 상한 760, 제목이 한 줄이면 840.
    // 제목이 길면(4줄) 창을 줄여 자리를 만든다. 남는 높이는 덩어리를 가운데에 두어 위아래로 나눈다.
    const cap=title.lines===1?840:760;
    const PH=Math.round(Math.max(420,Math.min(cap,room-textH-gap)));
    let y=top+Math.max(0,Math.round((room-(PH+gap+textH))/2));
    const ax=540-archW/2;
    under+=archHalo(ax,y,archW,PH);
    layers.push({input:await archPhoto(shots[0],archW,PH),left:ax,top:y});
    // 아치 모양 안쪽 그림자: 사진이 창 "안으로" 들어가 보이게(사진 위에만 그려져 글자와 겹치지 않는다).
    layers.push(await fastInnerShadow(ax,y,archW,PH,18,.65,archPath(ax,y,archW,PH)));
    over+=archRings(ax,y,archW,PH);
    // 별: 아치 꼭대기 반원 바깥의 빈 두 모서리(창 위 왼쪽·오른쪽)에 둔다. 장마다 조금씩 다른 자리(seeded).
    const r=archW/2;
    for(const [dx,dy,size] of [[.1,.16,12],[.2,.05,8],[.04,.38,9],[.9,.1,13],[.8,.03,7],[.96,.32,9]] as const){
      // 반원 바깥(중심에서 반지름+40 밖)에만 찍는다.
      const sx=ax+archW*dx+(rand()-.5)*16,sy=y+r*dy+(rand()-.5)*16;
      if(Math.hypot(sx-540,sy-(y+r))>r+40&&sy>top-20)under+=star(sx,sy,size,.55+rand()*.45);
    }
    // 창과 제목 사이 작은 플뢰롱.
    under+=fleuron(540,y+PH+gap/2,9);
    y+=PH+gap;
    layers.push(...foilLayers(title,Math.round(540-title.base.info.width/2),y));
    y+=title.base.info.height;
    if(useSub&&sub)layers.push({input:sub.data,left:Math.round(540-sub.info.width/2),top:y+subGap});
    if(teaser){
      // 예고 띠: 바닥글 금선 위, 양옆 작은 마름모로 초대장의 "순서" 줄처럼.
      const ty=bottom-teaser.info.height+16,tx=Math.round(540-teaser.info.width/2);
      layers.push({input:teaser.data,left:tx,top:ty});
      under+=diamond(tx-20,ty+teaser.info.height/2,4.5)+diamond(tx+teaser.info.width+20,ty+teaser.info.height/2,4.5);
    }
  }else if(content.kind==="photo"){
    // 사진 한 장: 위 금박 제목, 각진 사각 창(사진 안쪽 10px에 금선), 아래 ✦ 글머리 요점.
    const title=await foilText(content.headline,{sizes:tight?[62,56,52]:[68,62,56],width:W,maxHeight:230,emphasis});
    const indent=46,gapA=40,gapB=44,minPH=tight?220:260;
    let points=await pointLayers(42,W-indent,"left"),pointsH=sumH(points,18);
    const roomFor=()=>avail-title.base.info.height-gapA-(pointsH?pointsH+gapB:0);
    // 요점이 길면(4개×2줄) 글자를 40px(마지막 장은 36px)로 줄이고 사진을 더 작게 해 자리를 만든다. 그래도 모자라면 마지막 장만 요점 수를 줄인다.
    if(roomFor()<300){points=await pointLayers(tight?36:40,W-indent,"left");pointsH=sumH(points,16);}
    while(tight&&roomFor()<minPH&&points.length>2){points=points.slice(0,-1);pointsH=sumH(points,16);}
    const PH=Math.round(Math.max(minPH,Math.min(600,roomFor())));
    const pointGap=points.length&&points[0].info.height<60?18:16;
    const blockH=title.base.info.height+gapA+PH+(pointsH?gapB+pointsH:0);
    let y=top+Math.max(0,Math.round((avail-blockH)/2));
    layers.push(...foilLayers(title,Math.round(540-title.base.info.width/2),y));
    y+=title.base.info.height+gapA;
    layers.push({input:await photo(shots[0],W,PH),left:M,top:y});
    over+=`<rect x="${M+10}" y="${y+10}" width="${W-20}" height="${PH-20}" fill="none" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".9"/>`;
    y+=PH+gapB;
    for(const point of points){
      under+=star(M+12,y+Math.round(point.info.height>60?26:point.info.height/2),10);
      layers.push({input:point.data,left:M+indent,top:y});
      y+=point.info.height+pointGap;
    }
  }else if(content.kind==="photos"){
    // 사진 두 장(비교·짝): 아치 창 두 개 나란히, 가운데 작은 마름모, 아래 요점.
    const title=await foilText(content.headline,{sizes:tight?[62,56,52]:[68,62,56],width:W,maxHeight:200,emphasis});
    const archW=430,gap=40,rowW=archW*2+gap,x0=Math.round((1080-rowW)/2),indent=46,gapA=40,gapB=44,minPH=tight?280:320;
    let points=await pointLayers(42,W-indent,"left"),pointsH=sumH(points,18);
    const roomFor=()=>avail-title.base.info.height-gapA-(pointsH?pointsH+gapB:0);
    if(roomFor()<360){points=await pointLayers(tight?36:40,W-indent,"left");pointsH=sumH(points,16);}
    while(tight&&roomFor()<minPH&&points.length>1){points=points.slice(0,-1);pointsH=sumH(points,16);}
    const PH=Math.round(Math.max(minPH,Math.min(620,roomFor())));
    const pointGap=points.length&&points[0].info.height<60?18:16;
    const blockH=title.base.info.height+gapA+PH+(pointsH?gapB+pointsH:0);
    let y=top+Math.max(0,Math.round((avail-blockH)/2));
    layers.push(...foilLayers(title,Math.round(540-title.base.info.width/2),y));
    y+=title.base.info.height+gapA;
    for(const [i,shot] of shots.entries()){
      const x=x0+i*(archW+gap);
      under+=archHalo(x,y,archW,PH);
      layers.push({input:await archPhoto(shot,archW,PH),left:x,top:y},await fastInnerShadow(x,y,archW,PH,18,.65,archPath(x,y,archW,PH)));
      over+=archRings(x,y,archW,PH);
    }
    under+=diamond(540,y+PH/2,6);
    y+=PH+gapB;
    for(const point of points){
      under+=star(M+12,y+Math.round(point.info.height>60?26:point.info.height/2),10);
      layers.push({input:point.data,left:M+indent,top:y});
      y+=point.info.height+pointGap;
    }
  }else{
    // 글자만 있는 장: 제목을 크게 가운데 금박, 그 아래 큰 장식 구분선, 요점은 가운데 정렬 46px 이상(마지막 장은 40px까지).
    // 요점 사이에 가는 금선(가운데 마름모). 덩어리 전체를 세로 가운데에.
    const title=await foilText(content.headline,{sizes:content.cover?[92,84,76,68]:tight?[76,68,60]:[84,76,68,60],width:W,maxHeight:tight?240:340,emphasis});
    let ruleGap=tight?36:44,sepGap=tight?40:56;
    let points:Layer[]=[];
    const fits=()=>title.base.info.height+ruleGap*2+sumH(points,sepGap)<=avail;
    // 요점은 52px부터 시도하고 넘치면 48 → 46px(글자 장 최소)로 줄인다. 마지막 장은 42·40px까지 내려 보고 그래도 안 되면 요점을 뺀다.
    for(let count=4;count>=1;count--){
      for(const size of tight?[52,48,46,42,40]:[52,48,46]){
        points=await pointLayers(size,W-40,"centre",count);
        if(fits())break;
      }
      if(fits()||!tight)break;
    }
    // 남는 높이가 크면(짧은 요점 서너 줄) 구분선 간격과 제목 아래 여백을 늘려 덩어리를 키운다. 그래도 남는 건 위아래로 나눈다.
    if(points.length){
      const spare=avail-(title.base.info.height+ruleGap*2+sumH(points,sepGap));
      const stretch=Math.max(0,Math.min(34,Math.floor(spare/(points.length+3))));
      ruleGap+=stretch;sepGap+=stretch;
    }
    const pointsH=sumH(points,sepGap);
    const blockH=title.base.info.height+(points.length?ruleGap*2+pointsH:0);
    let y=top+Math.max(0,Math.round((avail-blockH)/2));
    layers.push(...foilLayers(title,Math.round(540-title.base.info.width/2),y));
    y+=title.base.info.height;
    if(points.length){
      under+=ornamentRule(y+ruleGap);
      y+=ruleGap*2;
      for(const [i,point] of points.entries()){
        layers.push({input:point.data,left:Math.round(540-point.info.width/2),top:y});
        y+=point.info.height;
        if(i<points.length-1){under+=thinRule(y+sepGap/2);y+=sepGap;}
      }
    }else{
      under+=ornamentRule(y+ruleGap);
    }
  }
  // 마지막 장 명함: 가는 금선 아래 금빛 가게 이름·계정·"저장해 두고 다시 보세요" 칩(짙은 금색 알약).
  if(closing){
    let cy=FOOTER-44-closing.height;
    under+=thinRule(cy-CLOSING_GAP/2,120);
    layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
    cy+=18+12;
    const chipX=Math.round(540-closing.chip.info.width/2);
    under+=closing.chipSvg(chipX,cy);
    layers.push({input:closing.chip.data,left:chipX,top:cy});
  }
  // 바닥글: 금선 가운데 틈에 장 번호(금색 좁은 글자, 고정폭 숫자), 그 아래 가게 이름(크림색 명조) 가운데 정렬.
  // 모서리 꽃무늬와 부딪히지 않도록 글자는 모두 가운데에 모은다.
  const folio=await textLayer(`${index} / ${total}`,{size:30,color:GOLD,width:200,height:44,font:STYLE_FONTS.condensed,align:"centre",features:"tnum"});
  const fx=Math.round(540-folio.info.width/2);
  // 넘겨 보기: 표지·마지막 장이 아니면 바닥글 금선 오른쪽 끝을 끊고 그 자리에 금색 "넘겨 보기 ›"를 넣는다(가게 이름 줄과 겹치지 않는다).
  const cue=!content.cover&&!content.last?await nextCue(GOLD,26):null;
  const lineEnd=cue?1080-M-cue.width-18:1080-M;
  under+=`<path d="M${M} ${FOOTER}H${fx-26}M${fx+folio.info.width+26} ${FOOTER}H${lineEnd}" stroke="${GOLD}" stroke-width="${MIN_STROKE}" stroke-opacity=".8"/>`+diamond(M,FOOTER,4)+diamond(lineEnd,FOOTER,4);
  if(cue){
    const cx=1080-M-cue.width,cy=Math.round(FOOTER-cue.height/2);
    layers.push({input:cue.label.data,left:cx,top:cy});
    over+=cue.arrow(cx,cy);
  }
  layers.push({input:folio.data,left:fx,top:Math.round(FOOTER-folio.info.height/2)});
  const brand=await fitText(brandName(),{sizes:[28,26],width:W,maxHeight:44,color:CREAM,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:brand.data,left:Math.round(540-brand.info.width/2),top:FOOTER+26});
  layers.unshift(svgLayer(under));
  if(over)layers.push(svgLayer(over));
  return sharp({create:{width:1080,height:1350,channels:3,background:BLACK}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
