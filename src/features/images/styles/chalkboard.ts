import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, svgLayer, textLayer, type CardRenderer, type Font, type Layer } from "../render/primitives";
import { registerPhoto, registerText } from "../render/audit";
import { HANDWRITING_MIN_SIZE, MIN_STROKE, STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, rotated, snap } from "./shared";
import { handArrow, handStar, seeded, squiggle, wobblyLine } from "./handDrawn";

// 칠판 메뉴판: 나무 액자에 끼운 짙은 녹색 칠판, 분필 손글씨 제목과 색분필 밑줄·별·화살표.
// 사진은 자석으로 붙인 흰 테두리 사진처럼 살짝 기울여 붙인다. 요점은 색분필 체크 표시와 함께 메뉴판처럼.
// 먹는 법·오늘의 메뉴처럼 정보를 친근하게 전하는 카드에 쓴다.
const BOARD="#1F2B25",CHALK="#F3F0E6",DIM="#B9B8AE";
// 명함 칩 바탕: 흰 글자가 4.5:1 이상 나오는 붉은 벽돌색 분필(파스텔 색분필 위 흰 글자는 대비가 모자라다).
const BRICK="#B5472F";
const COLORS=["#F6E27A","#F4A9BC","#9DD4EA","#B8E39A"];

// 칠판 면: 분필 가루(옅은 흰 얼룩)와 지우개 자국, 나무 액자(결 무늬)와 안쪽 그늘.
function board(seed:number):string {
  const rand=seeded(seed);
  let smudges="";
  for(let i=0;i<7;i++)smudges+=`<ellipse cx="${100+rand()*880}" cy="${120+rand()*1110}" rx="${120+rand()*200}" ry="${30+rand()*60}" fill="#FFFFFF" opacity="${.025+rand()*.03}" transform="rotate(${(rand()-.5)*30} 540 675)"/>`;
  let grain="";
  // 나무결: 1px 선은 폰에서 사라지므로 MIN_STROKE 두께로 5줄만 긋는다.
  for(let i=0;i<5;i++){const off=6+i*6;grain+=`<path d="M0 ${off}H1080M0 ${1350-off}H1080M${off} 0V1350M${1080-off} 0V1350" stroke="#5C3E24" stroke-width="${MIN_STROKE}" opacity="${.2+rand()*.25}"/>`;}
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
  // 마지막 장: 아래에 분필 점선으로 두른 가게 명함. 표지: 바닥글 위 예고 줄. 둘 다 높이를 먼저 예약하고(bottom) 사진·요점을 그 위에 맞춘다.
  const closing=content.last?await closingBlock({width:W-80,color:CHALK,accent:BRICK,font:STYLE_FONTS.comic}):null;
  // 명함은 자리를 아끼려고 "가게 이름·계정 | 저장 칩" 가로 한 줄로 놓고, 긴 계정이라 폭이 모자랄 때만 세로로 쌓는다.
  const CARD_PAD=26,CARD_GAP=48,CARD_MAX_W=880;
  const nameW=closing?Math.max(closing.wordmark.info.width,closing.handle?.info.width??0):0,chipW=closing?closing.chip.info.width+52:0;
  const cardWide=!!closing&&nameW+CARD_GAP+chipW+80<=CARD_MAX_W;
  const nameH=closing?closing.wordmark.info.height+(closing.handle?8+closing.handle.info.height:0):0;
  const cardH=!closing?0:cardWide?Math.max(nameH,closing.chip.info.height+24)+CARD_PAD*2:closing.height+CARD_PAD*2;
  // 글자 장은 아래 점선 틀(1278) 안쪽, 사진 장은 틀이 없어 바닥글 자리(1290)까지 쓴다.
  const cardTop=(inputs.length?1290:1252)-cardH;
  const teaser=content.teaser?await textLayer(content.teaser,{size:28,color:DIM,width:W-120,height:50,font:STYLE_FONTS.dodum}):null;
  const bottom=closing?cardTop-24:teaser?footerTop-teaser.info.height-26:footerTop;
  const shots=inputs.slice(0,2);
  // 머리말: "오늘의 이야기" + 장 번호, 색분필 물결 밑줄.
  const head=await textLayer(content.cover?"오늘의 칠판":`오늘의 칠판 · ${index}/${total}`,{size:HANDWRITING_MIN_SIZE,color:accent,width:W,height:70,font:STYLE_FONTS.chalk,align:"centre",features:"tnum"});
  layers.push({input:head.data,left:Math.round((1080-head.info.width)/2),top:84});
  deco+=`<path d="${squiggle(540-head.info.width/2,84+head.info.height+8,head.info.width,rand,10)}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>`;
  let y=84+head.info.height+46;
  // 제목: 분필 글씨. 양옆에 색분필 별.
  // 분필 손글씨 제목은 64px 이상(손글씨 제목 최소). 긴 제목은 줄 수로 받는다.
  // 마지막 사진 장은 명함 자리만큼 제목을 한 단계 작게(손글씨 최소 46 이상 유지).
  const titleSizes=content.cover?[100,90,80,72]:shots.length?(closing?[64,58,52]:[72,68,64]):[88,78,70,64];
  const title=await chalky(await fitText(content.headline,{sizes:titleSizes,width:W,maxHeight:content.cover?340:shots.length?240:300,color:CHALK,font:STYLE_FONTS.chalk,align:"centre",spacing:10,emphasis:emphasisOf(content,accent)}),index*5+1,CHALK,titleSizes[titleSizes.length-1]);
  const points=content.points.slice(0,shots.length?3:4);
  // 요점 크기: 사진 장 48 / 글자 장 58(분필 손글씨). 자리가 모자라면 46까지 줄이고, 그보다 작아져야 하면
  // 손글씨 대신 고운돋움에 분필 질감을 입힌다(손글씨는 46px 미만이면 폰에서 읽히지 않는다).
  const ladder:Array<[number,Font]>=shots.length
    ?[[48,STYLE_FONTS.chalk],[HANDWRITING_MIN_SIZE,STYLE_FONTS.chalk],[44,STYLE_FONTS.dodum],[42,STYLE_FONTS.dodum]]
    :[[58,STYLE_FONTS.chalk],[52,STYLE_FONTS.chalk],[HANDWRITING_MIN_SIZE,STYLE_FONTS.chalk],[44,STYLE_FONTS.dodum]];
  // 마지막 장은 명함 자리만큼 줄어드므로 고운돋움 40·36까지 한 단계 더 내려간다(요점 수는 그대로).
  if(closing)ladder.push([40,STYLE_FONTS.dodum],[36,STYLE_FONTS.dodum]);
  // 글자 장은 요점이 넷뿐이라 사이를 넉넉히 벌려 메뉴판처럼 읽히게 한다.
  const POINT_GAP=shots.length?20:34,PW_MAX=860,MIN_PH=closing?200:280,TITLE_RULE=60;
  // 사진 장은 "사진 최소 높이"가 남는 가장 큰 크기, 글자 장은 바닥글 위까지 들어가는 가장 큰 크기.
  const afterTitle=y+title.info.height+TITLE_RULE;
  // 부제(표지)는 제목 밑줄 아래 한 줄.
  const subline=content.subline?await textLayer(content.subline,{size:34,color:CHALK,width:W-40,height:60,font:STYLE_FONTS.dodum,align:"centre"}):null;
  const SUB_H=subline?subline.info.height+26:0;
  const pointsRoom=shots.length?bottom-afterTitle-SUB_H-MIN_PH-40-30:bottom-afterTitle-30;
  let pointLayers:ChalkPoint[]=[];
  for(const [size,font] of ladder){
    pointLayers=await Promise.all(points.map((point,i)=>chalkPoint(point,{size,font,width:W-80,seed:index*7+i})));
    if(pointLayers.reduce((sum,layer)=>sum+layer.text.info.height+POINT_GAP,0)<=pointsRoom)break;
  }
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.text.info.height+POINT_GAP,0);
  // 글자 장: 제목+요점 덩어리를 머리말 아래 ~ 바닥글 위 사이 세로 가운데에 둔다(위아래 빈 띠 방지).
  if(!shots.length)y=Math.max(y,Math.round(y+(bottom-y-(title.info.height+TITLE_RULE+10+pointsH))/2));
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
  if(subline){layers.push({input:subline.data,left:Math.round((1080-subline.info.width)/2),top:y-14});y+=SUB_H-14;}
  // 글자 장: 액자 안쪽에 분필로 그은 점선 틀과 네 구석 소용돌이로 메뉴판처럼 꾸민다.
  if(!shots.length)deco+=`<path d="${wobblyLine(72,72,1008,72,rand,2,10)} ${wobblyLine(1008,72,1008,1278,rand,2,12)} ${wobblyLine(1008,1278,72,1278,rand,2,10)} ${wobblyLine(72,1278,72,72,rand,2,12)}" stroke="${CHALK}" stroke-width="3" fill="none" stroke-dasharray="14 10" opacity=".55"/>`
    // 아래 구석 소용돌이는 바닥글·넘겨 보기 줄과 겹치므로 명함이 있는 마지막 장에만 둔다.
    +[[110,110,1,1],[970,110,-1,1],...(closing?[[110,1240,1,-1],[970,1240,-1,-1]]:[])].map(([x,y,fx,fy])=>`<path d="${curl(x,y,26,fx,fy)}" stroke="${COLORS[(index+x)%COLORS.length]}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>`).join("");
  if(shots.length){
    // 사진 높이는 "머리말·제목 아래 ~ 요점 위" 남는 높이에서 역산한다. 기울인 자석 사진의 틀(테두리·자석 자리·회전 여유)을 뺀다.
    const room=bottom-y-(pointsH?pointsH+40:0)-30;
    if(shots.length>1){
      // 비교 장: 두 장을 엇갈리게(오른쪽을 60px 내리고 가운데서 48px 겹치게) 붙이고, 그 위에 vs 배지를 따로 얹는다.
      // 마지막 장은 엇갈림 없이 나란히 두고 사진 높이 하한을 100까지 내린다(명함·요점 자리 우선, 넘침 금지).
      const PW=400,DROP=closing?0:60,OVERLAP=48;
      const PH=Math.round(Math.max(closing?100:MIN_PH-60,Math.min(Math.round(PW*1.15),room-DROP-PIN_FRAME-36)));
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
      const fitRoom=bottom-y-(pointsH?pointsH+24:0)-10;
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
  let py=shots.length?Math.max(y,bottom-pointsH-10):y+10;
  for(const [i,point] of pointLayers.entries()){
    const color=COLORS[(i+index)%COLORS.length],cx=M+18,cy=py+Math.round(point.size*.55);
    deco+=`<path d="M${cx-14} ${cy} L${cx-3} ${cy+12} L${cx+18} ${cy-14}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    layers.push({input:point.halo,left:M+56-HALO_PAD,top:py-HALO_PAD},{input:point.text.data,left:M+56,top:py});
    py+=point.text.info.height+POINT_GAP;
  }
  if(teaser){
    // 표지 예고 줄: 메뉴판 아래 "오늘 순서" 한 줄처럼, 양옆에 색분필 짧은 줄을 긋는다.
    const ty=footerTop-teaser.info.height-6,tl=Math.round((1080-teaser.info.width)/2),mid=ty+teaser.info.height/2;
    layers.push({input:teaser.data,left:tl,top:ty});
    deco+=`<path d="${wobblyLine(tl-70,mid,tl-20,mid,rand,1.5,3)}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="${wobblyLine(tl+teaser.info.width+20,mid,tl+teaser.info.width+70,mid,rand,1.5,3)}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  if(closing){
    // 가게 명함: 분필로 그은 점선 상자 안에 가게 이름·계정·저장 칩. 바닥글(가게 이름)은 명함과 겹치므로 생략한다.
    const cw=cardWide?nameW+CARD_GAP+chipW+80:Math.max(nameW,chipW)+120,cx=Math.round(540-cw/2);
    deco+=`<path d="${wobblyLine(cx,cardTop,cx+cw,cardTop,rand,2,8)} ${wobblyLine(cx+cw,cardTop,cx+cw,cardTop+cardH,rand,2,8)} ${wobblyLine(cx+cw,cardTop+cardH,cx,cardTop+cardH,rand,2,8)} ${wobblyLine(cx,cardTop+cardH,cx,cardTop,rand,2,8)}" stroke="${accent}" stroke-width="4" fill="none" stroke-dasharray="16 9" stroke-linecap="round"/>`;
    if(cardWide){
      // 가로 명함: 왼쪽 가게 이름·계정(가운데 맞춤 열), 오른쪽 저장 칩을 세로 가운데에.
      const nameX=cx+40,nameMid=nameX+nameW/2;
      let ny=cardTop+Math.round((cardH-nameH)/2);
      layers.push({input:closing.wordmark.data,left:Math.round(nameMid-closing.wordmark.info.width/2),top:ny});
      ny+=closing.wordmark.info.height+8;
      if(closing.handle)layers.push({input:closing.handle.data,left:Math.round(nameMid-closing.handle.info.width/2),top:ny});
      const chipLeft=cx+cw-40-chipW+26,chipTop=cardTop+Math.round((cardH-closing.chip.info.height)/2);
      deco+=closing.chipSvg(chipLeft,chipTop);
      layers.push({input:closing.chip.data,left:chipLeft,top:chipTop});
    }else{
      let cy=cardTop+CARD_PAD;
      layers.push({input:closing.wordmark.data,left:Math.round(540-closing.wordmark.info.width/2),top:cy});
      cy+=closing.wordmark.info.height;
      if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:Math.round(540-closing.handle.info.width/2),top:cy});cy+=closing.handle.info.height;}
      cy+=18+12;
      const chipLeft=Math.round(540-closing.chip.info.width/2);
      deco+=closing.chipSvg(chipLeft,cy);
      layers.push({input:closing.chip.data,left:chipLeft,top:cy});
    }
  }else{
    // 바닥글은 작은 글자라 손글씨 대신 고운돋움(26px 이상). 글자 장은 아래 점선 틀(y 1278)에 걸리지 않게 틀 바로 위에 둔다.
    // 본문 장은 바닥글을 왼쪽에, 오른쪽에 "넘겨 보기"를 같은 줄로(긴 계정이어도 겹치지 않게).
    const cue=content.cover?null:await nextCue(accent,26);
    const footer=await textLayer(brandName(),{size:28,color:DIM,width:W-(cue?cue.width+40:0),height:44,font:STYLE_FONTS.dodum});
    const fy=shots.length?footerTop+30:1278-12-footer.info.height;
    layers.push({input:footer.data,left:cue?M:Math.round((1080-footer.info.width)/2),top:fy});
    if(cue){
      const qx=1080-M-cue.width,qy=fy+Math.round((footer.info.height-cue.height)/2);
      deco+=cue.arrow(qx,qy);
      layers.push({input:cue.label.data,left:qx,top:qy});
    }
  }
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:BOARD}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
