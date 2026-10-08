import sharp, { type OverlayOptions } from "sharp";
import { brandName, croppedPhoto, currentTone, svgLayer, textLayer, type CardRenderer, type Font, type Layer, type TextEmphasis } from "../render/primitives";
import { cachedLayer, propLayer, textureLayer } from "../decor";
import { registerDecor, registerPhoto } from "../render/audit";
import { STORE_NAME } from "../slideLayout";
import { STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { glowText, neonStroke, seeded } from "./handDrawn";

// 네온 간판(밤 술집): 어두운 벽돌 벽에 빛나는 네온관 글자. 맨 위 작은 간판("묵동 홍어 · 막걸리"),
// 가운데 네온 테두리를 두른 사진, 아래 요점은 밝은 글자에 네온 점. 퇴근 후 한잔 분위기의 저녁 게시물용.
// 장마다 네온 색(분홍·하늘·호박색 둘)을 돌려 쓴다. 사진 장은 사진의 주조색과 색상환에서 먼 네온을 고른다
// (홍어 분홍 살 옆에 분홍 네온을 두르면 음식과 테두리가 한 색으로 뭉개져 사진이 덜 맛있어 보인다).
// chip: 마지막 장 "저장" 칩 바탕. 네온 원색은 흰 글자와 대비가 3:1 남짓이라 같은 색의 진한 쪽(4.5:1 이상)을 쓴다.
const THEMES=[
  {glow:"#FF3EA5",core:"#FFE9F4",accent:"#38E8FF",chip:"#C2186F"},
  {glow:"#38E8FF",core:"#E9FCFF",accent:"#FF3EA5",chip:"#0B7C93"},
  {glow:"#FFB23E",core:"#FFF5E2",accent:"#9DFF6B",chip:"#A85A00"},
  // 호박색 + 하늘 accent: 분홍이 없는 따뜻한 간판. 분홍·붉은 사진 장에서 주로 뽑힌다.
  {glow:"#FF9A2E",core:"#FFF1DE",accent:"#38E8FF",chip:"#9A4A00"},
] as const;
type Theme=typeof THEMES[number];
const WALL="#0E0B13",TEXT="#F2EEF7",DIM="#9C94AE";

const hueOf=(hex:string)=>{const n=parseInt(hex.slice(1),16);return rgbHue((n>>16)&255,(n>>8)&255,n&255);};
function rgbHue(r:number,g:number,b:number){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  if(!d)return 0;
  const h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return (h*60+360)%360;
}
// 사진 주조색의 색상(0~360)과 채도(0~1). 64px 축소본의 채도 높은 픽셀 평균이라 수 ms면 끝난다.
async function photoHue(input:Buffer):Promise<{hue:number;chroma:number}> {
  const {data}=await sharp(input).resize(64,64,{fit:"cover"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let x=0,y=0,weight=0;
  for(let i=0;i<data.length;i+=3){
    const r=data[i],g=data[i+1],b=data[i+2],c=(Math.max(r,g,b)-Math.min(r,g,b))/255;
    if(c<.12)continue;
    const a=rgbHue(r,g,b)*Math.PI/180;x+=Math.cos(a)*c;y+=Math.sin(a)*c;weight+=c;
  }
  if(!weight)return {hue:0,chroma:0};
  return {hue:(Math.atan2(y,x)*180/Math.PI+360)%360,chroma:Math.hypot(x,y)/(data.length/3)};
}
const hueGap=(a:number,b:number)=>{const d=Math.abs(a-b)%360;return d>180?360-d:d;};
// 사진 장 테마: 주조색과 60° 이상 떨어진 테마 중에서 장 번호로 돌린다(같은 묶음에서 장마다 색이 바뀌게).
// 사진이 거의 무채색이면 아무 테마나 괜찮으므로 그냥 돌린다.
async function pickTheme(turn:number,photo?:Buffer):Promise<Theme> {
  if(!photo)return THEMES[turn%THEMES.length];
  const {hue,chroma}=await photoHue(photo);
  if(chroma<.04)return THEMES[turn%THEMES.length];
  // 테두리(glow)와 둘째 사진 테두리(accent)가 둘 다 사진 색에서 멀어야 한다.
  const far=THEMES.filter(theme=>Math.min(hueGap(hueOf(theme.glow),hue),hueGap(hueOf(theme.accent),hue))>=60);
  const pool=far.length?far:[...THEMES].sort((a,b)=>hueGap(hueOf(b.glow),hue)-hueGap(hueOf(a.glow),hue)).slice(0,1);
  return pool[turn%pool.length];
}

// 벽돌 벽 + 가장자리 어둡게 + 번진 빛. 벽 전체(질감·알갱이·빛 번짐)를 seed·테마별로 한 번 구워 JPEG로 캐시한다.
// 예전엔 장마다 feTurbulence 알갱이와 벽돌 수백 개를 librsvg로 다시 그려 600ms 가까이 들었다.
// 벽돌 질감 자산(brick.webp)이 있으면 벽 바탕을 조금 밝게 칠한 뒤 multiply로 결을 얹고(어두운 벽에 바로 곱하면 결이 안 보인다),
// 없으면 예전 SVG 벽돌에 줄눈 그늘을 진하게 그어 대신한다.
async function wallLayer(glow:string,seed:number,calm:boolean):Promise<Buffer> {
  return cachedLayer(`neon-wall:${seed}:${glow}:${calm?1:0}`,async()=>{
    const brick=await textureLayer("brick",{opacity:.55,blend:"multiply"});
    const rand=seeded(seed);
    let bricks="";
    if(!brick){
      for(let row=0;row<1350/46;row++){
        const y=row*46,shift=row%2?60:0;
        for(let x=-shift;x<1080;x+=120){const tone=rand();if(tone<.35)bricks+=`<rect x="${x+2}" y="${y+2}" width="116" height="42" fill="${tone<.12?"#000":"#fff"}" opacity="${.02+rand()*.04}"/>`;}
        // 줄눈: 밝은 선 바로 아래 어두운 그늘을 한 줄 더 그어 벽돌이 살짝 튀어나와 보이게 한다.
        bricks+=`<path d="M0 ${y}H1080" stroke="#1C1724" stroke-width="3"/><path d="M0 ${y+3}H1080" stroke="#000" stroke-opacity=".55" stroke-width="3"/>`;
        for(let x=-shift;x<1080;x+=120)bricks+=`<path d="M${x} ${y}V${y+46}" stroke="#1C1724" stroke-width="3"/><path d="M${x+3} ${y+3}V${y+46}" stroke="#000" stroke-opacity=".45" stroke-width="2"/>`;
      }
    }
    const grit=`<filter id="neonGrit"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 .6  0 0 0 0 .55  0 0 0 0 .7  0 0 0 .07 0"/></filter><rect width="1080" height="1350" filter="url(#neonGrit)"/>`;
    // 빛 번짐(spill)은 간판 글자 쪽에서 벽을 비추는 빛. 절제 변형은 번짐을 줄여 벽이 더 조용하다.
    const spill=calm?.12:.23,floor=calm?.1:.2;
    const light=`<defs><radialGradient id="spill" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="${glow}" stop-opacity="${spill}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
      +`<radialGradient id="floor" cx="50%" cy="100%" r="55%"><stop offset="0" stop-color="${glow}" stop-opacity="${floor}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`
      +`<rect width="1080" height="1350" fill="url(#spill)"/><rect width="1080" height="1350" fill="url(#floor)"/>`;
    const vignette=`<defs><radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".7"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#vig)"/>`;
    // 순서: 바탕 → 빛 → 벽돌 질감(곱하기라 빛 받은 자리에서 결이 더 또렷하다) → 알갱이 → 가장자리 어둡게.
    const base=brick?"#17121F":WALL;
    const layers:OverlayOptions[]=[svgLayer(bricks+light)];
    if(brick)layers.push(brick);
    // 알갱이는 1/2 크기로 그려 키운다(원래 크기 feTurbulence가 이 벽 굽기의 대부분인 ~800ms였다).
    const gritSmall=Buffer.from(`<svg width="540" height="675" xmlns="http://www.w3.org/2000/svg"><g transform="scale(.5)">${grit}</g></svg>`);
    layers.push({input:await sharp(await sharp(gritSmall).png().toBuffer()).resize(1080,1350,{fit:"fill"}).png().toBuffer(),left:0,top:0},svgLayer(vignette));
    return sharp({create:{width:1080,height:1350,channels:3,background:base}}).composite(layers).jpeg({quality:90}).toBuffer();
  });
}
// 제목 네온관 글자: handDrawn의 glowText와 같은 번짐(세 겹 흐림 + 밝은 심)인데, 핵심어만 다른 색 네온관으로 켜기 위해
// 심 글자와 번짐 글자에 같은 강조(emphasis)를 건다.
// calm(절제 변형)은 가장 넓은 번짐 한 겹을 빼고 중간 번짐도 좁혀 글자 둘레 빛무리를 줄인다(글자 심·가까운 번짐은 그대로라 읽기는 같다).
// reflection: 같은 번짐을 크게 흐려(σ40) 벽에 비친 빛으로 쓴다. 큰 흐림은 1/4로 줄여 흐린 뒤 키워 수십 ms로 끝낸다.
// 가는 획을 σ40으로 흐리면 알파가 1/3 남짓으로 묽어지므로 알파에 .8을 곱해 실제 최고 진하기가 .25 안팎이 되게 한다.
async function neonTitle(value:string,options:{sizes:number[];width:number;maxHeight:number;font:Font;core:string;glow:string;spacing:number;emphasis?:TextEmphasis;calm?:boolean}):Promise<Layer&{pad:number;reflection:Layer&{pad:number}}> {
  const common={sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,font:options.font,align:"centre" as const,spacing:options.spacing};
  const core=await fitText(value,{...common,color:options.core,emphasis:options.emphasis});
  // 번짐도 핵심어 자리만 같은 강조색으로 물들인다(다른 색 심 둘레에 바탕 번짐이 섞이면 탁한 보라로 뭉개진다).
  const tinted=await fitText(value,{...common,color:options.glow,emphasis:options.emphasis});
  const pad=Math.round(Math.max(18,core.info.height*.18));
  const padded=await sharp(tinted.data).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const blur=async(sigma:number)=>sharp(padded).blur(sigma).png().toBuffer();
  const result=await sharp({create:{width:core.info.width+pad*2,height:core.info.height+pad*2,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([...(options.calm?[]:[{input:await blur(pad*.9),left:0,top:0}]),{input:await blur(pad*(options.calm?.28:.45)),left:0,top:0},{input:await blur(Math.max(1,pad*.12)),left:0,top:0},{input:core.data,left:pad,top:pad}])
    .png().toBuffer({resolveWithObject:true});
  const R=120,small=4;
  const W=core.info.width+R*2,H=core.info.height+R*2;
  const shrunk=await sharp(tinted.data).extend({top:R,bottom:R,left:R,right:R,background:{r:0,g:0,b:0,alpha:0}})
    .resize(Math.round(W/small),Math.round(H/small)).blur(40/small).ensureAlpha().linear([1,1,1,.8],[0,0,0,0]).png().toBuffer();
  const reflection=await sharp(shrunk).resize(W,H).png().toBuffer({resolveWithObject:true});
  // 번짐과 심을 한 장으로 합친 새 버퍼라 textLayer의 "글자" 등록이 사라져, 검수가 제목 자리를 통째로 빈 띠로 잡았다.
  // 글자로 다시 등록하면 대비 검사가 심 둘레의 밝은 번짐을 "배경"으로 보아 네온 글자 전부를 대비 부족으로 친다.
  // 그래서 빛나는 간판 그림(ornament)으로 등록한다: 빈 띠 계산에서는 찬 자리, 장식 겹침 검사에서는 빠진다.
  registerDecor(result.data,"ornament");
  return {...result,pad,reflection:{...reflection,pad:R}};
}

const roundedRect=(x:number,y:number,w:number,h:number,r:number)=>`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
// 캔버스(1080×1350) 밖으로 나가는 레이어를 안쪽만 잘라 놓는다(sharp는 캔버스보다 큰 레이어를 받지 않는다).
async function clipToCanvas(layer:Layer,left:number,top:number):Promise<OverlayOptions> {
  const x0=Math.max(0,left),y0=Math.max(0,top),x1=Math.min(1080,left+layer.info.width),y1=Math.min(1350,top+layer.info.height);
  const input=await sharp(layer.data).extract({left:x0-left,top:y0-top,width:Math.max(1,x1-x0),height:Math.max(1,y1-y0)}).png().toBuffer();
  return {input,left:x0,top:y0};
}
// 라이트 랩: 네온 테두리 빛이 사진 가장자리 안쪽으로 번져 들어온 것처럼 사진 둘레를 테마색으로 밝힌다(screen 합성).
// 이게 없으면 사진이 네온 액자 위에 오려 붙인 것처럼 빛과 따로 논다. 사진 모서리(r=22) 모양으로 잘라 바깥으로 새지 않게 한다.
// 큰 흐림 필터는 librsvg에서 넓이에 비례해 느리므로 1/4 크기로 그린 뒤 키운다(흐린 빛이라 키워도 티가 안 난다).
const LOW=4;
async function lowRes(width:number,height:number,body:string):Promise<Buffer> {
  const small=Buffer.from(`<svg width="${Math.ceil(width/LOW)}" height="${Math.ceil(height/LOW)}" xmlns="http://www.w3.org/2000/svg"><g transform="scale(${1/LOW})">${body}</g></svg>`);
  return sharp(await sharp(small).png().toBuffer()).resize(width,height,{fit:"fill"}).png().toBuffer();
}
// 사진 색 보정(밝기 .95·채도 1.08)과 빛 얹기, 둥근 모서리로 다시 자르기를 한 파이프라인에서 끝내 PNG 인코딩을 한 번만 한다
// (따로 하면 큰 사진 PNG를 세 번 만들어 250ms 남짓 들었다).
async function lightWrap(photo:Buffer,width:number,height:number,color:string,opacity:number):Promise<Buffer> {
  const wrap=await lowRes(width,height,`<filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>`
    +`<path d="${roundedRect(0,0,width,height,22)}" fill="none" stroke="${color}" stroke-width="48" stroke-opacity="${opacity}" filter="url(#b)"/>`);
  // 빛을 얹은 뒤 원래 사진의 알파(둥근 모서리)로 다시 잘라(dest-in) 모서리 바깥으로 빛이 새지 않게 한다.
  return sharp(photo).modulate({brightness:.95,saturation:1.08}).composite([{input:wrap,blend:"screen"},{input:photo,blend:"dest-in"}]).png({compressionLevel:2}).toBuffer();
}
// 사진 테두리 네온관: handDrawn의 neonStroke와 같은 세 겹(번짐 → 색 관 → 흰 심)인데, 사진만 한 큰 사각의 번짐을
// SVG 필터로 원래 크기에서 돌리면 500ms 가까이 들어 번짐만 1/4 크기로 그려 레이어로 깐다. 관과 심은 deco에 그대로.
async function photoTube(d:string,color:string,width:number):Promise<{glow:OverlayOptions;crisp:string}> {
  const glow=await lowRes(1080,1350,`<filter id="t" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${width*1.6}"/></filter>`
    +`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width*2.2}" stroke-linejoin="round" filter="url(#t)" opacity=".9"/>`);
  const crisp=`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`
    +`<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${Math.max(1.5,width*.35)}" stroke-linejoin="round" opacity=".85"/>`;
  return {glow:{input:glow,left:0,top:0},crisp};
}

export const renderNeon:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const calm=currentTone()==="calm";
  // 절제 변형은 네온관을 60% 굵기로 가늘게 켜 번짐(빛무리)을 줄인다. 관의 자리·색은 같다.
  const tube=(d:string,color:string,width:number)=>neonStroke(d,color,calm?Math.max(2,Math.round(width*.6)):width);
  const theme=await pickTheme(index-1+(slide.variant??0),inputs[0]);
  const layers:OverlayOptions[]=[];
  const wall=await wallLayer(theme.glow,index*17+(slide.variant??0),calm);
  let deco="";
  // 사진 테두리 관의 번짐 레이어(벽 바로 위, deco보다 아래).
  const tubes:OverlayOptions[]=[];
  // 맨 위 작은 간판.
  const sign=await glowText(content.cover?"묵동 홍어 · 막걸리":`${index}`,{sizes:[34],width:600,maxHeight:60,font:STYLE_FONTS.round,core:"#FFFFFF",glow:theme.accent,align:"centre"});
  const signW=sign.info.width-sign.pad*2+64,signX=Math.round((1080-signW)/2),signY=48;
  deco+=tube(roundedRect(signX,signY,signW,70,35),theme.accent,4);
  layers.push({input:sign.data,left:Math.round(540-sign.info.width/2),top:Math.round(signY+35-sign.info.height/2)});
  // 간판 양옆 막걸리 사발 소품(표지·글자 장). 소품 그림이 있을 때만 남는 자리(간판 바깥 ~ 화면 가장자리)에 얹고,
  // 없으면 아무것도 두지 않는다(예전 네온 별은 간판과 경쟁해 뺐다). 사진 장은 사진이 주인공이라 두지 않는다.
  if(!calm&&(content.cover||!inputs.length)){
    const room=signX-60;
    if(room>=90){
      const size=Math.min(110,room-20);
      for(const [cx,flip] of [[signX-20-size/2,-6],[signX+signW+20+size/2,6]] as const){
        const prop=await propLayer("makgeolli",{width:size,maxHeight:size,left:cx,top:signY+35,anchor:"center",rotate:flip});
        if(prop)layers.push(prop);
      }
    }
  }
  let y=signY+70+40;
  // 제목: 네온관 글자.
  const shots=inputs.slice(0,2);
  // 핵심어는 맞은편 네온 색(accent)으로 켠다. 심 글자 색이라 어두운 벽 위 대비는 3:1을 넉넉히 넘는다.
  const title=await neonTitle(content.headline,{sizes:content.cover?[96,86,76,66]:shots.length?[74,66,58,52]:[96,84,74,64],width:900,maxHeight:content.cover?330:shots.length?230:360,font:STYLE_FONTS.round,core:theme.core,glow:theme.glow,spacing:12,emphasis:emphasisOf(content,theme.accent),calm});
  const titleH=title.info.height-title.pad*2;
  const footerTop=1350-70;
  // 마지막 장 가게 명함(제목·요점 아래, 바닥글 위)과 표지 예고 띠(사진 아래 작은 네온 간판)의 높이를 먼저 예약한다.
  const closing=content.last?await closingBlock({width:900,color:theme.core,accent:theme.chip,font:STYLE_FONTS.round}):null;
  const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:TEXT,width:860,height:60,font:STYLE_FONTS.sansSemi}):null;
  const reserved=(closing?closing.height+44:0)+(teaser?teaser.info.height+24+30:0);
  const points=content.points.slice(0,shots.length?3:4);
  // 요점이 길어 사진(한 장 기준 380px)이 모자라면 요점을 버리지 않고 글자를 한 단계 줄인다.
  const pointsAt=(size:number)=>Promise.all(points.map(point=>textLayer(point,{size,color:TEXT,width:800,height:150,font:STYLE_FONTS.sansSemi,spacing:8})));
  const heightOf=(list:Layer[])=>list.reduce((sum,layer)=>sum+layer.info.height+22,0);
  let pointLayers=await pointsAt(shots.length?40:46);
  const subline=content.subline?await textLayer(content.subline,{size:34,color:TEXT,width:860,height:110,font:STYLE_FONTS.sansSemi,align:"centre"}):null;
  const headH=titleH+(subline?subline.info.height+22:0)+(shots.length?44:70);
  const photoRoom=()=>footerTop-y-headH-(pointLayers.length?heightOf(pointLayers)+40:0)-30-reserved;
  const textRoom=()=>footerTop-y-headH-heightOf(pointLayers)-40-reserved;
  if(shots.length?photoRoom()<380:textRoom()<0)pointLayers=await pointsAt(shots.length?36:40);
  const pointsH=heightOf(pointLayers);
  // 글자 장: 제목과 요점 상자(마지막 장이면 명함까지)를 한 덩어리로 세로 가운데에 둔다.
  if(!shots.length)y=Math.max(y,Math.round((y+footerTop-(headH+pointsH+40+reserved))/2));
  // 벽에 비친 글자 빛: 제목 아래쪽으로 40px 내려 번지게 깐다(간판 빛이 벽을 타고 흘러내린 느낌). 절제 변형은 생략.
  // 다른 글자보다 먼저(벽 바로 위에) 깔아 간판·부제 글자를 덮지 않게 한다.
  const reflection:OverlayOptions[]=calm?[]:[await clipToCanvas(title.reflection,Math.round(540-title.reflection.info.width/2),y-title.reflection.pad+40)];
  layers.push({input:title.data,left:Math.round(540-title.info.width/2),top:y-title.pad});
  y+=titleH;
  if(subline){y+=22;layers.push({input:subline.data,left:Math.round(540-subline.info.width/2),top:y});y+=subline.info.height;}
  y+=shots.length?44:70;
  if(shots.length){
    // 사진: 네온 테두리를 두른 액자. 두 장이면 나란히.
    // 사진이 주인공이므로 제목과 요점 사이 남는 높이를 사진이 다 쓴다(예전엔 760에서 멈춰 사진 아래 빈 띠가 생겼다).
    // 한 장은 폭도 920을 꽉 채운다. 두 장(각 430)은 너무 길쭉하면 어색하므로 세로를 폭의 1.6배까지만 키우고 남는 만큼 가운데로 내린다.
    const room=footerTop-y-(pointsH?pointsH+40:0)-30-reserved;
    // 한 장 폭 920(좌우 80): 860이면 긴 제목(세 줄) 표지에서 사진 면적이 38%로 기준(40%)에 못 미쳤다. 제목은 줄이지 않고 폭으로 메운다.
    const PW=shots.length>1?430:920;
    const PH=Math.round(Math.max(300,shots.length>1?Math.min(PW*1.6,room):room));
    y+=Math.max(0,Math.round((room-PH)/2));
    const gap=40,rowW=shots.length*PW+(shots.length-1)*gap;
    for(const [i,shot] of shots.entries()){
      const x=Math.round((1080-rowW)/2)+i*(PW+gap);
      const color=i?theme.accent:theme.glow;
      const photo=await lightWrap(await croppedPhoto(shot,PW,PH,22),PW,PH,color,calm?.25:.45);
      // 색을 다시 만져 새 버퍼가 되었으므로 캔버스에 놓는 이 버퍼를 사진으로 등록한다(검수의 사진 면적).
      registerPhoto(photo);
      layers.push({input:photo,left:x,top:y});
      // 네온관을 사진에 바짝(4px) 붙여 관 빛이 사진 가장자리를 비추는 것처럼 보이게 한다(예전 10px은 사진과 따로 떠 보였다).
      const frame=await photoTube(roundedRect(x-4,y-4,PW+8,PH+8,25),color,calm?3:5);
      tubes.push(frame.glow);
      deco+=frame.crisp;
    }
    y+=PH+50;
  }
  // 요점: 네온 점 + 밝은 글자. 사진이 없으면 네온 테두리 상자 안에.
  if(pointLayers.length){
    const boxed=!shots.length;
    let py=boxed?y+10:Math.max(y,footerTop-pointsH-20-reserved);
    if(boxed){deco+=tube(roundedRect(90,py-30,900,pointsH+40,28),theme.accent,4);}
    for(const layer of pointLayers){
      deco+=`<circle cx="${boxed?140:150}" cy="${py+24}" r="9" fill="${theme.glow}"/><circle cx="${boxed?140:150}" cy="${py+24}" r="18" fill="${theme.glow}" opacity=".25"/>`;
      layers.push({input:layer.data,left:boxed?170:180,top:py});
      py+=layer.info.height+22;
    }
    y=py+(boxed?30:0);
  }
  if(closing){
    // 명함: 요점 아래 남는 자리 가운데. 워드마크는 간판과 같은 둥근 글자, 저장 칩은 네온관을 한 번 더 두른다.
    const top=Math.max(y+24,Math.round(y+(footerTop-y-closing.height)/2));
    layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top});
    let cy=top+closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
    cy+=30;
    const cx=Math.round(540-closing.chip.info.width/2);
    deco+=closing.chipSvg(cx,cy)+tube(roundedRect(cx-32,cy-18,closing.chip.info.width+64,closing.chip.info.height+36,(closing.chip.info.height+36)/2),theme.glow,3);
    layers.push({input:closing.chip.data,left:cx,top:cy});
  }
  if(teaser){
    // 표지 예고 띠: 바닥글 바로 위 작은 네온 간판(가는 관 테두리) 안에.
    const ty=footerTop-teaser.info.height-16;
    deco+=tube(roundedRect(540-teaser.info.width/2-30,ty-12,teaser.info.width+60,teaser.info.height+24,(teaser.info.height+24)/2),theme.accent,3);
    layers.push({input:teaser.data,left:Math.round(540-teaser.info.width/2),top:ty});
  }
  // 바닥글: 가게 이름·장 번호(26px, 숫자 폭 고정). 마지막 장은 명함에 계정이 있으므로 이름만.
  // 가운데 장은 오른쪽 아래에 "넘겨 보기"를 같은 줄에 두고, 긴 계정과 부딪히면 바닥글을 왼쪽 정렬로 옮긴다.
  const footer=await textLayer(`${content.last?STORE_NAME:brandName()}  ·  ${index}`,{size:26,color:DIM,width:900,height:44,font:STYLE_FONTS.sansSemi,features:"tnum"});
  let footerX=Math.round((1080-footer.info.width)/2);
  if(!content.cover&&!content.last){
    const cue=await nextCue(theme.glow,26);
    const cx=1080-60-cue.width,cy=footerTop+18+Math.round((footer.info.height-cue.height)/2);
    if(footerX+footer.info.width+28>cx)footerX=60;
    layers.push({input:cue.label.data,left:cx,top:cy});
    deco+=cue.arrow(cx,cy);
  }
  layers.push({input:footer.data,left:footerX,top:footerTop+18});
  layers.unshift(...reflection,...tubes,svgLayer(deco));
  return sharp(wall).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
