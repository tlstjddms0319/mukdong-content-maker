import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svgLayer, textLayer, type CardRenderer, type Font, type Layer } from "../render/primitives";
import { registerPhoto, registerText } from "../render/audit";
import { HANDWRITING_MIN_SIZE, STYLE_FONTS, contentOf, fitText, rotated, snap } from "./shared";
import { handArrow, handStar, seeded, squiggle, wobblyLine } from "./handDrawn";

// 칠판 메뉴판: 나무 액자에 끼운 짙은 녹색 칠판, 분필 손글씨 제목과 색분필 밑줄·별·화살표.
// 사진은 자석으로 붙인 흰 테두리 사진처럼 살짝 기울여 붙인다. 요점은 색분필 체크 표시와 함께 메뉴판처럼.
// 먹는 법·오늘의 메뉴처럼 정보를 친근하게 전하는 카드에 쓴다.
const BOARD="#1F2B25",CHALK="#F3F0E6",DIM="#B9B8AE";
const COLORS=["#F6E27A","#F4A9BC","#9DD4EA","#B8E39A"];

// 칠판 면: 분필 가루(옅은 흰 얼룩)와 지우개 자국, 나무 액자(결 무늬)와 안쪽 그늘.
function board(seed:number):string {
  const rand=seeded(seed);
  let smudges="";
  for(let i=0;i<7;i++)smudges+=`<ellipse cx="${100+rand()*880}" cy="${120+rand()*1110}" rx="${120+rand()*200}" ry="${30+rand()*60}" fill="#FFFFFF" opacity="${.025+rand()*.03}" transform="rotate(${(rand()-.5)*30} 540 675)"/>`;
  let grain="";
  for(let i=0;i<10;i++){const off=6+i*3;grain+=`<path d="M0 ${off}H1080M0 ${1350-off}H1080M${off} 0V1350M${1080-off} 0V1350" stroke="#5C3E24" stroke-width="1" opacity="${.25+rand()*.3}"/>`;}
  return `<defs><filter id="dust"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .06 0"/></filter><filter id="sm"><feGaussianBlur stdDeviation="30"/></filter></defs>`
    +`<rect width="1080" height="1350" filter="url(#dust)"/><g filter="url(#sm)">${smudges}</g>`
    +`<rect x="0" y="0" width="1080" height="1350" fill="none" stroke="#7A5534" stroke-width="64"/>${grain}`
    +`<rect x="32" y="32" width="1016" height="1286" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="10"/>`;
}
// 분필 질감: 글자 레이어에 거친 알갱이 마스크를 곱해(dest-in) 획이 군데군데 긁힌 분필 글씨처럼 만든다.
// 새 버퍼는 자동 검수가 모르는 버퍼이므로 같은 크기·색·크기 정보로 다시 등록해 넘침·겹침·대비 검사가 이어지게 한다.
async function chalky(layer:Layer,seed:number,color:string,size:number):Promise<Layer> {
  const {width,height}=layer.info;
  const grit=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.9 -0.35"/></filter><rect width="100%" height="100%" fill="#fff" filter="url(#g)"/></svg>`);
  const data=await sharp(layer.data).composite([{input:grit,blend:"dest-in"}]).png().toBuffer();
  registerText(data,{width,height,color,size});
  return {data,info:layer.info};
}
// 분필로 그린 구석 장식(작은 소용돌이).
function curl(cx:number,cy:number,r:number,flipX:number,flipY:number):string {
  const p=(t:number)=>{const a=t*Math.PI*2.4,rr=r*(1-t*.7);return `${Math.round(cx+Math.cos(a)*rr*flipX)} ${Math.round(cy+Math.sin(a)*rr*flipY)}`;};
  return `M${p(0)} `+Array.from({length:14},(_,i)=>`L${p((i+1)/14)}`).join(" ");
}

// 자석으로 붙인 사진: 흰 테두리 + 기울기 + 위쪽 둥근 자석. 틀이 더하는 높이(PIN_FRAME)는 테두리 2개 + 자석 자리 30.
const PIN_B=16,PIN_FRAME=PIN_B*2+30;
async function pinnedPhoto(input:Buffer,width:number,height:number,angle:number,magnet:string):Promise<Layer> {
  const W=Math.round(width),H=Math.round(height),B=PIN_B;
  const photo=await finishPhoto(input,W,H);
  const framed=await sharp({create:{width:W+B*2,height:H+PIN_FRAME,channels:4,background:"#FBFAF6"}})
    .composite([{input:photo,left:B,top:B},{input:Buffer.from(`<svg width="${W+B*2}" height="${H+PIN_FRAME}" xmlns="http://www.w3.org/2000/svg"><circle cx="${(W+B*2)/2}" cy="14" r="20" fill="${magnet}"/><circle cx="${(W+B*2)/2-6}" cy="8" r="6" fill="#fff" opacity=".6"/></svg>`),left:0,top:0}]).png().toBuffer();
  // 기울인 부품(대부분이 사진)을 캔버스에 놓으므로 자동 검수가 사진 면적으로 세도록 등록한다.
  const layer=await rotated(framed,angle);
  registerPhoto(layer.data);
  return layer;
}

// 분필 가루 헤일로를 깐 요점 한 줄. 같은 글자를 흰색으로 살짝 번지게(blur 2.5, 35%) 깔아 획 둘레가 밝아지면
// 짙은 칠판 위 가는 분필 획이 폰에서도 또렷해진다. 헤일로는 사방 HALO_PAD만큼 커서 (−HALO_PAD, −HALO_PAD)에 놓는다.
const HALO_PAD=8;
type ChalkPoint={size:number;text:Layer;halo:Buffer};
async function chalkPoint(value:string,options:{size:number;font:Font;width:number;seed:number}):Promise<ChalkPoint> {
  const style={size:options.size,width:options.width,height:2000,font:options.font,spacing:Math.round(options.size*.18)};
  const text=await chalky(await textLayer(value,{...style,color:CHALK}),options.seed,CHALK,options.size);
  const white=await textLayer(value,{...style,color:"#FFFFFF"});
  const halo=await sharp(white.data).extend({top:HALO_PAD,bottom:HALO_PAD,left:HALO_PAD,right:HALO_PAD,background:{r:0,g:0,b:0,alpha:0}})
    .blur(2.5).ensureAlpha().linear([1,1,1,.35],[0,0,0,0]).png().toBuffer();
  return {size:options.size,text,halo};
}

export const renderChalkboard:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const rand=seeded(index*31+(slide.variant??0));
  const accent=COLORS[(index-1)%COLORS.length];
  const layers:OverlayOptions[]=[];
  let deco=board(index*17+3);
  const M=110,W=1080-M*2,footerTop=1350-110;
  const shots=inputs.slice(0,2);
  // 머리말: "오늘의 이야기" + 장 번호, 색분필 물결 밑줄.
  const head=await textLayer(content.cover?"오늘의 칠판":`오늘의 칠판 · ${index}/${total}`,{size:HANDWRITING_MIN_SIZE,color:accent,width:W,height:70,font:STYLE_FONTS.chalk,align:"centre"});
  layers.push({input:head.data,left:Math.round((1080-head.info.width)/2),top:84});
  deco+=`<path d="${squiggle(540-head.info.width/2,84+head.info.height+8,head.info.width,rand,10)}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>`;
  let y=84+head.info.height+46;
  // 제목: 분필 글씨. 양옆에 색분필 별.
  // 분필 손글씨 제목은 64px 이상(손글씨 제목 최소). 긴 제목은 줄 수로 받는다.
  const titleSizes=content.cover?[100,90,80,72]:shots.length?[72,68,64]:[88,78,70,64];
  const title=await chalky(await fitText(content.headline,{sizes:titleSizes,width:W,maxHeight:content.cover?340:shots.length?240:300,color:CHALK,font:STYLE_FONTS.chalk,align:"centre",spacing:10}),index*5+1,CHALK,titleSizes[titleSizes.length-1]);
  const points=content.points.slice(0,shots.length?3:4);
  // 요점 크기: 사진 장 48 / 글자 장 58(분필 손글씨). 자리가 모자라면 46까지 줄이고, 그보다 작아져야 하면
  // 손글씨 대신 고운돋움에 분필 질감을 입힌다(손글씨는 46px 미만이면 폰에서 읽히지 않는다).
  const ladder:Array<[number,Font]>=shots.length
    ?[[48,STYLE_FONTS.chalk],[HANDWRITING_MIN_SIZE,STYLE_FONTS.chalk],[44,STYLE_FONTS.dodum],[42,STYLE_FONTS.dodum]]
    :[[58,STYLE_FONTS.chalk],[52,STYLE_FONTS.chalk],[HANDWRITING_MIN_SIZE,STYLE_FONTS.chalk],[44,STYLE_FONTS.dodum]];
  // 글자 장은 요점이 넷뿐이라 사이를 넉넉히 벌려 메뉴판처럼 읽히게 한다.
  const POINT_GAP=shots.length?20:34,PW_MAX=860,MIN_PH=280,TITLE_RULE=60;
  // 사진 장은 "사진 최소 높이"가 남는 가장 큰 크기, 글자 장은 바닥글 위까지 들어가는 가장 큰 크기.
  const afterTitle=y+title.info.height+TITLE_RULE;
  const pointsRoom=shots.length?footerTop-afterTitle-MIN_PH-40-30:footerTop-afterTitle-30;
  let pointLayers:ChalkPoint[]=[];
  for(const [size,font] of ladder){
    pointLayers=await Promise.all(points.map((point,i)=>chalkPoint(point,{size,font,width:W-80,seed:index*7+i})));
    if(pointLayers.reduce((sum,layer)=>sum+layer.text.info.height+POINT_GAP,0)<=pointsRoom)break;
  }
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.text.info.height+POINT_GAP,0);
  // 글자 장: 제목+요점 덩어리를 머리말 아래 ~ 바닥글 위 사이 세로 가운데에 둔다(위아래 빈 띠 방지).
  if(!shots.length)y=Math.max(y,Math.round(y+(footerTop-y-(title.info.height+TITLE_RULE+10+pointsH))/2));
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:y});
  // 색분필 별은 제목 바로 바깥(액자 안쪽 범위 안)에 둔다. 제목이 넓으면 위·아래 모서리로 비켜 앉힌다.
  const titleLeft=540-title.info.width/2,titleRight=540+title.info.width/2;
  const leftX=Math.max(88,titleLeft-34),rightX=Math.min(992,titleRight+34);
  const leftY=titleLeft-34<88?y-26:y+30,rightY=titleRight+34>992?y+title.info.height+18:y+title.info.height-20;
  deco+=`<path d="${handStar(leftX,leftY,20,rand)}" fill="none" stroke="${COLORS[(index)%COLORS.length]}" stroke-width="4" stroke-linejoin="round"/>`
    +`<path d="${handStar(rightX,rightY,17,rand)}" fill="none" stroke="${COLORS[(index+1)%COLORS.length]}" stroke-width="4" stroke-linejoin="round"/>`;
  y+=title.info.height+16;
  deco+=`<path d="${wobblyLine(540-Math.min(title.info.width,700)/2,y,540+Math.min(title.info.width,700)/2,y+3,rand,3,7)}" stroke="${CHALK}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".75"/>`;
  y+=TITLE_RULE-16;
  // 글자 장: 액자 안쪽에 분필로 그은 점선 틀과 네 구석 소용돌이로 메뉴판처럼 꾸민다.
  if(!shots.length)deco+=`<path d="${wobblyLine(72,72,1008,72,rand,2,10)} ${wobblyLine(1008,72,1008,1278,rand,2,12)} ${wobblyLine(1008,1278,72,1278,rand,2,10)} ${wobblyLine(72,1278,72,72,rand,2,12)}" stroke="${CHALK}" stroke-width="3" fill="none" stroke-dasharray="14 10" opacity=".55"/>`
    +[[110,110,1,1],[970,110,-1,1],[110,1240,1,-1],[970,1240,-1,-1]].map(([x,y,fx,fy])=>`<path d="${curl(x,y,26,fx,fy)}" stroke="${COLORS[(index+x)%COLORS.length]}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>`).join("");
  if(shots.length){
    // 사진 높이는 "머리말·제목 아래 ~ 요점 위" 남는 높이에서 역산한다. 기울인 자석 사진의 틀(테두리·자석 자리·회전 여유)을 뺀다.
    const room=footerTop-y-(pointsH?pointsH+40:0)-30;
    if(shots.length>1){
      // 비교 장: 두 장을 엇갈리게(오른쪽을 60px 내리고 가운데서 48px 겹치게) 붙이고, 그 위에 vs 배지를 따로 얹는다.
      const PW=400,DROP=60,OVERLAP=48;
      const PH=Math.round(Math.max(MIN_PH-60,Math.min(Math.round(PW*1.15),room-DROP-PIN_FRAME-36)));
      const placed:{left:number;top:number;width:number;height:number}[]=[];
      for(const [i,shot] of shots.entries()){
        const pinned=await pinnedPhoto(shot,PW,PH,i?3:-3,COLORS[(index+i)%COLORS.length]);
        const left=i?540-OVERLAP/2:540+OVERLAP/2-pinned.info.width,top=y+(i?DROP:0);
        layers.push({input:pinned.data,left,top});
        placed.push({left,top,width:pinned.info.width,height:pinned.info.height});
      }
      // vs 배지와 화살표는 사진 위 별도 레이어(사진에 가려지지 않게). 칠판색 원 + 색분필 테두리.
      const vx=540,vy=Math.round(y+DROP+PH*.45);
      const vs=await textLayer("vs",{size:54,color:accent,width:120,height:90,font:STYLE_FONTS.chalk,align:"centre"});
      layers.push(svgLayer(`<circle cx="${vx}" cy="${vy}" r="52" fill="${BOARD}" stroke="${accent}" stroke-width="5"/><path d="${handArrow(vx-150,vy+120,vx-40,vy+70,rand)}" stroke="${accent}" stroke-width="6" fill="none" stroke-linecap="round"/>`));
      layers.push({input:vs.data,left:vx-Math.round(vs.info.width/2),top:vy-Math.round(vs.info.height/2)-4});
      y=Math.max(...placed.map(box=>box.top+box.height))+20;
    }else{
      // 표지 상한 760(860 폭을 기울여도 액자 안), 본문 700. 회전으로 늘어나는 높이까지 넣어 남는 높이에 꼭 맞춘다.
      // 사진이 낮아져도 폭은 700 이상 유지해(가로로 긴 사진) 면적을 지킨다.
      const capH=content.cover?760:700,angle=(rand()-.5)*(content.cover?5:4);
      const fitRoom=footerTop-y-(pointsH?pointsH+24:0)-10;
      const widthOf=(h:number)=>Math.min(PW_MAX,Math.max(700,Math.round(h*1.3)));
      const tiltedH=(h:number)=>{const r=Math.abs(angle)*Math.PI/180;return Math.ceil((h+PIN_FRAME)*Math.cos(r)+(widthOf(h)+PIN_B*2)*Math.sin(r))+4;};
      let PH=capH;
      while(PH>MIN_PH-60&&tiltedH(PH)>fitRoom)PH-=4;
      const PW=widthOf(PH);
      const pinned=await pinnedPhoto(shots[0],PW,PH,angle,COLORS[(index+2)%COLORS.length]);
      layers.push({input:pinned.data,left:Math.round((1080-pinned.info.width)/2),top:y});
      y+=pinned.info.height+20;
    }
  }
  // 요점: 분필 가루 헤일로 → 분필 글자 순으로 깔고, 앞에 색분필 체크 표시. 사진이 없는 장은 가운데로 모은다.
  let py=shots.length?Math.max(y,footerTop-pointsH-10):y+10;
  for(const [i,point] of pointLayers.entries()){
    const color=COLORS[(i+index)%COLORS.length],cx=M+18,cy=py+Math.round(point.size*.55);
    deco+=`<path d="M${cx-14} ${cy} L${cx-3} ${cy+12} L${cx+18} ${cy-14}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    layers.push({input:point.halo,left:M+56-HALO_PAD,top:py-HALO_PAD},{input:point.text.data,left:M+56,top:py});
    py+=point.text.info.height+POINT_GAP;
  }
  // 바닥글은 작은 글자라 손글씨 대신 고운돋움(26px 이상).
  const footer=await fitText(`${brandName()}`,{sizes:[28,26],width:W,maxHeight:44,color:DIM,font:STYLE_FONTS.dodum,align:"centre"});
  // 글자 장은 아래 점선 틀(y 1278)에 걸리지 않게 틀 바로 위에 둔다.
  layers.push({input:footer.data,left:Math.round((1080-footer.info.width)/2),top:shots.length?footerTop+30:1278-12-footer.info.height});
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:BOARD}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
