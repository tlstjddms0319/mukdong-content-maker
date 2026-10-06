import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svg, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STYLE_FONTS, chooseTitleLayout, contentOf, fitText, snap } from "./shared";
import { seeded } from "./handDrawn";

// 블랙 & 골드(연말 모임·기념일·프리미엄 코스): 검은 벨벳 바탕 위에 금박 선으로만 그린 이중 액자와 꽃무늬 모서리 장식,
// 금박을 입힌 명조 제목, 아치(위가 둥근) 창 안의 사진. 호텔 연회 초대장처럼 격식 있고 반짝임은 절제한다.
// 금색은 선·글자·작은 장식에만 쓴다. 금색 면이 커지면 싸 보이므로 바탕은 끝까지 검게 둔다.
const BLACK="#0B0A08",GOLD="#C9A24A",GOLD_LIGHT="#EBD38A",GOLD_DARK="#8E6A22",CREAM="#EFE6D2";
const FRAME_OUT=28,FRAME_IN=46,CORNER=78;  // 액자: 바깥 2px 선 위치, 안쪽 1px 선 위치, 안쪽 선이 모서리에서 비워 두는 길이
const M=110,W=1080-M*2;                    // 본문 좌우 여백·폭. 표지 제목도 이 폭 안에 두어 인스타 격자(좌우 34px) 잘림을 피한다.
const FOOTER=1350-120;                     // 바닥글 금선 y. 선 가운데 틈에 장 번호, 그 아래에 가게 이름이 들어간다.
const r1=(value:number)=>Math.round(value*10)/10;

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
  return `<path d="${curls}" fill="none" stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round"/>`
    +`<path d="M16 16L33 24L42 42L24 33Z" fill="${GOLD}"/><circle cx="52" cy="52" r="2.2" fill="${GOLD_LIGHT}"/>`
    +`<path d="M42 42Q58 50 ${CORNER-R} ${R*2}M42 42Q50 58 ${R*2} ${CORNER-R}" fill="none" stroke="${GOLD}" stroke-width="1" stroke-opacity=".8"/>`;
}
// 액자: 바깥 2px 금선, 안쪽 1px 금선(모서리와 위 가운데에서 끊김), 네 모서리 꽃무늬, 위 가운데 플뢰롱.
function frame():string {
  const x0=FRAME_IN,y0=FRAME_IN,x1=1080-FRAME_IN,y1=1350-FRAME_IN,gap=46;
  const piece=cornerFlourish();
  return `<rect x="${FRAME_OUT}" y="${FRAME_OUT}" width="${1080-FRAME_OUT*2}" height="${1350-FRAME_OUT*2}" fill="none" stroke="${GOLD}" stroke-width="2"/>`
    +`<path d="M${x0+CORNER} ${y0}H${540-gap}M${540+gap} ${y0}H${x1-CORNER}M${x0+CORNER} ${y1}H${x1-CORNER}M${x0} ${y0+CORNER}V${y1-CORNER}M${x1} ${y0+CORNER}V${y1-CORNER}" fill="none" stroke="${GOLD}" stroke-width="1"/>`
    +`<g transform="translate(${x0} ${y0})">${piece}</g><g transform="translate(${x1} ${y0}) scale(-1 1)">${piece}</g>`
    +`<g transform="translate(${x0} ${y1}) scale(1 -1)">${piece}</g><g transform="translate(${x1} ${y1}) scale(-1 -1)">${piece}</g>`
    +fleuron(540,y0,15)+diamond(540-gap+4,y0,3.5)+diamond(540+gap-4,y0,3.5);
}
// 바탕: 가운데에 아주 옅은 따뜻한 빛(촛불 아래 검은 식탁보처럼). 금색 면이 아니라 빛이므로 아주 약하게.
const background=()=>`<defs><radialGradient id="goldVignette" cx="50%" cy="44%" r="62%"><stop offset="0" stop-color="#3A2A10" stop-opacity=".55"/><stop offset="1" stop-color="#3A2A10" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#goldVignette)"/>`;
// 양옆 가는 선 + 가운데 플뢰롱 구분선(제목 아래).
const ornamentRule=(y:number,half=290)=>`<path d="M${540-half} ${y}H${540-40}M${540+40} ${y}H${540+half}" stroke="${GOLD}" stroke-width="1" stroke-opacity=".85"/>`
  +fleuron(540,y,13)+diamond(540-half,y,4)+diamond(540+half,y,4);
// 요점 사이 가는 금선(가운데 작은 마름모).
const thinRule=(y:number,half=170)=>`<path d="M${540-half} ${y}H${540-14}M${540+14} ${y}H${540+half}" stroke="${GOLD}" stroke-width="1" stroke-opacity=".55"/>`+diamond(540,y,5);

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
// 아치 둘레 금 링 두 줄: 창 가장자리에 1.5px(마스크 가장자리의 계단을 덮는다), 12px 바깥에 1px.
const archRings=(x:number,y:number,w:number,h:number)=>`<path d="${archPath(x,y,w,h)}" fill="none" stroke="${GOLD}" stroke-width="1.5"/>`
  +`<path d="${archPath(x-12,y-12,w+24,h+24)}" fill="none" stroke="${GOLD}" stroke-width="1" stroke-opacity=".8"/>`;

// ── 금박 글자 ───────────────────────────────────────────────────────────────────────────
// 제목 글자를 금박처럼: 글자 레이어와 같은 크기의 세로 금색 그라데이션(밝음→금→어두움→밝음)을 만들고
// 글자 알파를 dest-in 마스크로 써서 글자 모양만 남긴다. 그라데이션은 줄 높이마다 반복해 모든 줄이 같은 빛을 받게 한다.
// 이렇게 만든 레이어는 textLayer 결과가 아니라 자동 검수가 글자로 추적하지 않으므로, 쓰는 쪽에서
// 같은 자리에 base(원래 textLayer, 금색)를 먼저 그리고 그 위에 foil을 정확히 겹쳐 검수 추적을 유지한다.
async function foilText(value:string,options:{sizes:number[];width:number;maxHeight:number;align?:"left"|"centre"}):Promise<{base:Layer;foil:Buffer;lines:number}> {
  // 크기와 균형 줄바꿈 폭은 모든 계열 공용 규칙(chooseTitleLayout)으로 정한다. 줄 높이를 알아야 하므로 고른 크기를 쓴다.
  const font=STYLE_FONTS.serifHeavy,align=options.align??"centre";
  const layout=await chooseTitleLayout(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,font,align,spacing:size=>Math.round(size*.16)});
  const size=layout.size;
  const base:Layer=await textLayer(layout.text,{size,color:GOLD,width:layout.width,height:layout.fits?4000:options.maxHeight,font,align,spacing:Math.round(size*.16)});
  // 한 줄 높이: 같은 글꼴·크기로 한 글자를 그려 잰다(여러 줄 레이어 높이 = 줄 수×줄 높이 + (줄 수-1)×spacing).
  const probe=await textLayer("홍",{size,color:GOLD,width:300,height:400,font});
  const period=probe.info.height+Math.round(size*.16);
  const {width:Wt,height:Ht}=base.info;
  const gradient=Buffer.from(`<svg width="${Wt}" height="${Ht}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="goldFoil" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${period}" spreadMethod="repeat">`
    +`<stop offset="0" stop-color="${GOLD_LIGHT}"/><stop offset=".38" stop-color="${GOLD}"/><stop offset=".64" stop-color="${GOLD_DARK}"/><stop offset=".86" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_LIGHT}"/>`
    +`</linearGradient></defs><rect width="${Wt}" height="${Ht}" fill="url(#goldFoil)"/></svg>`);
  const foil=await sharp(gradient).ensureAlpha().composite([{input:base.data,blend:"dest-in"}]).png().toBuffer();
  return {base,foil,lines:Math.max(1,Math.round((Ht+Math.round(size*.16))/period))};
}
// base와 foil을 같은 자리에 겹쳐 올린다(검수는 base를 추적, 눈에는 foil이 보인다).
const foilLayers=(text:{base:Layer;foil:Buffer},left:number,top:number):OverlayOptions[]=>[{input:text.base.data,left,top},{input:text.foil,left,top}];

export const renderGold:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const rand=seeded(index*31+(slide.variant??0));
  const layers:OverlayOptions[]=[];
  let under=background()+frame(),over="";
  const shots=inputs.slice(0,2);
  // 눈썹 글자: 좁은 영문 대문자를 자간 넓게, 양옆에 가는 금선과 작은 마름모.
  const eyebrow=await textLayer("M U K D O N G   H O N G E O",{size:30,color:GOLD,width:700,height:50,font:STYLE_FONTS.condensed,align:"centre"});
  const eyebrowTop=FRAME_IN+42,ex=Math.round(540-eyebrow.info.width/2),ecy=eyebrowTop+eyebrow.info.height/2;
  under+=`<path d="M${M+50} ${ecy}H${ex-30}M${ex+eyebrow.info.width+30} ${ecy}H${1080-M-50}" stroke="${GOLD}" stroke-width="1" stroke-opacity=".7"/>`+diamond(M+50,ecy,4)+diamond(1080-M-50,ecy,4);
  layers.push({input:eyebrow.data,left:ex,top:eyebrowTop});
  // 본문 범위: 눈썹 아래부터 바닥글 금선 위까지. 각 장은 덩어리 높이를 재서 이 범위의 세로 가운데에 둔다.
  const top=eyebrowTop+eyebrow.info.height+40,bottom=FOOTER-44,avail=bottom-top;
  // 요점 레이어(✦ 글머리 왼쪽 정렬 또는 가운데 정렬). size를 바꿔 다시 잴 수 있게 함수로.
  const pointLayers=(size:number,width:number,align:"left"|"centre")=>Promise.all(content.points.slice(0,4).map(point=>textLayer(point,{size,color:CREAM,width,height:size*4,font:STYLE_FONTS.serif,align,spacing:Math.round(size*.22)})));
  const sumH=(items:Layer[],gap:number)=>items.reduce((sum,item)=>sum+item.info.height,0)+Math.max(0,items.length-1)*gap;

  if(content.kind==="cover"&&shots.length){
    // 표지: 아치 창 안에 사진을 크게, 아래 금박 제목 가운데 정렬. 창 둘레 금 링 두 줄, 여백에 작은 별 몇 개.
    const title=await foilText(content.headline,{sizes:[92,84,76,68],width:W,maxHeight:340});
    // 창 폭 860(본문 폭 W 전체): 금 링(12px 바깥)까지 액자 안쪽 선 안에 들어간다.
    const archW=W,gap=64;
    // 창 높이는 "남는 높이"(제목·간격을 뺀 나머지)에서 정한다. 상한 760, 제목이 한 줄이면 남는 80px까지 창에 줘 840.
    // 제목이 길면(4줄) 창을 줄여 자리를 만든다. 남는 높이는 덩어리를 가운데에 두어 위아래로 나눈다.
    const cap=title.lines===1?840:760;
    const PH=Math.round(Math.max(420,Math.min(cap,avail-title.base.info.height-gap)));
    let y=top+Math.max(0,Math.round((avail-(PH+gap+title.base.info.height))/2));
    const ax=540-archW/2;
    layers.push({input:await archPhoto(shots[0],archW,PH),left:ax,top:y});
    over+=archRings(ax,y,archW,PH);
    // 별: 창 양옆 여백이 좁아져, 아치 꼭대기 반원 바깥의 빈 두 모서리(창 위 왼쪽·오른쪽)에 둔다. 장마다 조금씩 다른 자리(seeded).
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
  }else if(content.kind==="photo"){
    // 사진 한 장: 위 금박 제목, 각진 사각 창(사진 안쪽 10px에 1px 금선), 아래 ✦ 글머리 요점.
    const title=await foilText(content.headline,{sizes:[68,62,56],width:W,maxHeight:230});
    const indent=46,gapA=40,gapB=44;
    let points=await pointLayers(42,W-indent,"left"),pointsH=sumH(points,18);
    let PH=Math.round(Math.min(600,avail-title.base.info.height-gapA-(pointsH?pointsH+gapB:0)));
    // 요점이 길면(4개×2줄) 글자를 40px로 줄이고 사진을 더 작게 해 자리를 만든다.
    if(PH<300){points=await pointLayers(40,W-indent,"left");pointsH=sumH(points,16);PH=Math.round(Math.max(260,Math.min(600,avail-title.base.info.height-gapA-pointsH-gapB)));}
    const pointGap=points.length&&points[0].info.height<60?18:16;
    const blockH=title.base.info.height+gapA+PH+(pointsH?gapB+pointsH:0);
    let y=top+Math.max(0,Math.round((avail-blockH)/2));
    layers.push(...foilLayers(title,Math.round(540-title.base.info.width/2),y));
    y+=title.base.info.height+gapA;
    layers.push({input:await photo(shots[0],W,PH),left:M,top:y});
    over+=`<rect x="${M+10}" y="${y+10}" width="${W-20}" height="${PH-20}" fill="none" stroke="${GOLD}" stroke-width="1" stroke-opacity=".9"/>`;
    y+=PH+gapB;
    for(const point of points){
      under+=star(M+12,y+Math.round(point.info.height>60?26:point.info.height/2),10);
      layers.push({input:point.data,left:M+indent,top:y});
      y+=point.info.height+pointGap;
    }
  }else if(content.kind==="photos"){
    // 사진 두 장(비교·짝): 아치 창 두 개 나란히, 가운데 작은 마름모, 아래 요점.
    const title=await foilText(content.headline,{sizes:[68,62,56],width:W,maxHeight:200});
    const archW=430,gap=40,rowW=archW*2+gap,x0=Math.round((1080-rowW)/2),indent=46,gapA=40,gapB=44;
    let points=await pointLayers(42,W-indent,"left"),pointsH=sumH(points,18);
    let PH=Math.round(Math.min(620,avail-title.base.info.height-gapA-(pointsH?pointsH+gapB:0)));
    if(PH<360){points=await pointLayers(40,W-indent,"left");pointsH=sumH(points,16);PH=Math.round(Math.max(320,Math.min(620,avail-title.base.info.height-gapA-pointsH-gapB)));}
    const pointGap=points.length&&points[0].info.height<60?18:16;
    const blockH=title.base.info.height+gapA+PH+(pointsH?gapB+pointsH:0);
    let y=top+Math.max(0,Math.round((avail-blockH)/2));
    layers.push(...foilLayers(title,Math.round(540-title.base.info.width/2),y));
    y+=title.base.info.height+gapA;
    for(const [i,shot] of shots.entries()){
      const x=x0+i*(archW+gap);
      layers.push({input:await archPhoto(shot,archW,PH),left:x,top:y});
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
    // 글자만 있는 장: 제목을 크게 가운데 금박, 그 아래 큰 장식 구분선, 요점은 가운데 정렬 46px 이상.
    // 요점 사이에 가는 금선(가운데 마름모). 덩어리 전체를 세로 가운데에.
    const title=await foilText(content.headline,{sizes:content.cover?[92,84,76,68]:[84,76,68,60],width:W,maxHeight:340});
    let ruleGap=44,sepGap=56;
    let points:Layer[]=[];
    // 요점은 52px부터 시도하고 넘치면 48 → 46px(글자 장 최소)로 줄인다.
    for(const size of [52,48,46]){
      points=await pointLayers(size,W-40,"centre");
      if(title.base.info.height+ruleGap*2+sumH(points,sepGap)<=avail)break;
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
  // 바닥글: 금선 가운데 틈에 장 번호(금색 좁은 대문자), 그 아래 가게 이름(크림색 명조) 가운데 정렬.
  // 모서리 꽃무늬와 부딪히지 않도록 글자는 모두 가운데에 모은다. 계정이 길면 한 줄에 들어가게 줄인다.
  const folio=await textLayer(`${index} / ${total}`,{size:30,color:GOLD,width:200,height:44,font:STYLE_FONTS.condensed,align:"centre"});
  const fx=Math.round(540-folio.info.width/2);
  under+=`<path d="M${M} ${FOOTER}H${fx-26}M${fx+folio.info.width+26} ${FOOTER}H${1080-M}" stroke="${GOLD}" stroke-width="1" stroke-opacity=".8"/>`+diamond(M,FOOTER,4)+diamond(1080-M,FOOTER,4);
  layers.push({input:folio.data,left:fx,top:Math.round(FOOTER-folio.info.height/2)});
  const brand=await fitText(brandName(),{sizes:[26,24,22],width:640,maxHeight:40,color:CREAM,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:brand.data,left:Math.round(540-brand.info.width/2),top:FOOTER+26});
  layers.unshift(svgLayer(under));
  if(over)layers.push(svgLayer(over));
  return sharp({create:{width:1080,height:1350,channels:3,background:BLACK}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
