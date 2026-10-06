import sharp, { type OverlayOptions } from "sharp";
import { brandName, svgLayer, textLayer, type CardRenderer, type Layer } from "../render/primitives";
import { registerText } from "../render/audit";
import { STYLE_FONTS, contentOf, fitText, rotated, snap } from "./shared";
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

// 자석으로 붙인 사진: 흰 테두리 + 기울기 + 위쪽 둥근 자석.
async function pinnedPhoto(input:Buffer,width:number,height:number,angle:number,magnet:string):Promise<{data:Buffer;info:{width:number;height:number}}> {
  const W=Math.round(width),H=Math.round(height),B=16;
  const photo=await sharp(input).rotate().resize(W,H,{fit:"cover",position:"attention"}).png().toBuffer();
  const framed=await sharp({create:{width:W+B*2,height:H+B*2+30,channels:4,background:"#FBFAF6"}})
    .composite([{input:photo,left:B,top:B},{input:Buffer.from(`<svg width="${W+B*2}" height="${H+B*2+30}" xmlns="http://www.w3.org/2000/svg"><circle cx="${(W+B*2)/2}" cy="14" r="20" fill="${magnet}"/><circle cx="${(W+B*2)/2-6}" cy="8" r="6" fill="#fff" opacity=".6"/></svg>`),left:0,top:0}]).png().toBuffer();
  return rotated(framed,angle);
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
  const head=await textLayer(content.cover?"오늘의 칠판":`오늘의 칠판 · ${index}/${total}`,{size:38,color:accent,width:W,height:64,font:STYLE_FONTS.chalk,align:"centre"});
  layers.push({input:head.data,left:Math.round((1080-head.info.width)/2),top:84});
  deco+=`<path d="${squiggle(540-head.info.width/2,84+head.info.height+8,head.info.width,rand,10)}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>`;
  let y=84+head.info.height+46;
  // 제목: 분필 글씨. 양옆에 색분필 별.
  if(!shots.length)y=Math.max(y,Math.round(1350/2-260));
  const titleSizes=content.cover?[100,90,80,72]:shots.length?[72,64,58,52]:[88,78,70,62];
  const title=await chalky(await fitText(content.headline,{sizes:titleSizes,width:W,maxHeight:content.cover?340:shots.length?210:300,color:CHALK,font:STYLE_FONTS.chalk,align:"centre",spacing:10}),index*5+1,CHALK,titleSizes[titleSizes.length-1]);
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:y});
  // 색분필 별은 제목 바로 바깥(액자 안쪽 범위 안)에 둔다. 제목이 넓으면 위·아래 모서리로 비켜 앉힌다.
  const titleLeft=540-title.info.width/2,titleRight=540+title.info.width/2;
  const leftX=Math.max(88,titleLeft-34),rightX=Math.min(992,titleRight+34);
  const leftY=titleLeft-34<88?y-26:y+30,rightY=titleRight+34>992?y+title.info.height+18:y+title.info.height-20;
  deco+=`<path d="${handStar(leftX,leftY,20,rand)}" fill="none" stroke="${COLORS[(index)%COLORS.length]}" stroke-width="4" stroke-linejoin="round"/>`
    +`<path d="${handStar(rightX,rightY,17,rand)}" fill="none" stroke="${COLORS[(index+1)%COLORS.length]}" stroke-width="4" stroke-linejoin="round"/>`;
  y+=title.info.height+16;
  deco+=`<path d="${wobblyLine(540-Math.min(title.info.width,700)/2,y,540+Math.min(title.info.width,700)/2,y+3,rand,3,7)}" stroke="${CHALK}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".75"/>`;
  y+=44;
  const points=content.points.slice(0,shots.length?3:4);
  const pointSize=shots.length?44:54;
  const pointLayers=await Promise.all(points.map(async(point,i)=>chalky(await textLayer(point,{size:pointSize,color:CHALK,width:W-80,height:170,font:STYLE_FONTS.chalk,spacing:6}),index*7+i,CHALK,pointSize)));
  // 글자 장: 액자 안쪽에 분필로 그은 점선 틀과 네 구석 소용돌이로 메뉴판처럼 꾸민다.
  if(!shots.length)deco+=`<path d="${wobblyLine(72,72,1008,72,rand,2,10)} ${wobblyLine(1008,72,1008,1278,rand,2,12)} ${wobblyLine(1008,1278,72,1278,rand,2,10)} ${wobblyLine(72,1278,72,72,rand,2,12)}" stroke="${CHALK}" stroke-width="3" fill="none" stroke-dasharray="14 10" opacity=".55"/>`
    +[[110,110,1,1],[970,110,-1,1],[110,1240,1,-1],[970,1240,-1,-1]].map(([x,y,fx,fy])=>`<path d="${curl(x,y,26,fx,fy)}" stroke="${COLORS[(index+x)%COLORS.length]}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>`).join("");
  const pointsH=pointLayers.reduce((sum,layer)=>sum+layer.info.height+20,0);
  if(shots.length){
    const room=footerTop-y-(pointsH?pointsH+40:0)-30;
    const PH=Math.round(Math.max(280,Math.min(content.cover?700:640,room)));
    if(shots.length>1){
      const PW=360;
      for(const [i,shot] of shots.entries()){
        const pinned=await pinnedPhoto(shot,PW,PH-40,i?3:-3,COLORS[(index+i)%COLORS.length]);
        layers.push({input:pinned.data,left:i?1080-M-pinned.info.width+10:M-10,top:y});
      }
      deco+=`<path d="${handArrow(540-30,y+PH*.5,540+30,y+PH*.5+10,rand)}" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    }else{
      const PW=Math.min(W-80,Math.round(PH*1.25));
      const pinned=await pinnedPhoto(shots[0],PW,PH-40,(rand()-.5)*5,COLORS[(index+2)%COLORS.length]);
      layers.push({input:pinned.data,left:Math.round((1080-pinned.info.width)/2),top:y});
    }
    y+=PH+40;
  }
  // 요점: 색분필 체크 표시 + 분필 글씨. 사진이 없는 장은 가운데로 모은다.
  let py=shots.length?Math.max(y,footerTop-pointsH-10):y+10;
  for(const [i,layer] of pointLayers.entries()){
    const color=COLORS[(i+index)%COLORS.length],cx=M+18,cy=py+26;
    deco+=`<path d="M${cx-14} ${cy} L${cx-3} ${cy+12} L${cx+18} ${cy-14}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    layers.push({input:layer.data,left:M+56,top:py});
    py+=layer.info.height+20;
  }
  const footer=await fitText(`${brandName()}`,{sizes:[30,26,22],width:W,maxHeight:44,color:DIM,font:STYLE_FONTS.chalk,align:"centre"});
  layers.push({input:footer.data,left:Math.round((1080-footer.info.width)/2),top:footerTop+30});
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:BOARD}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
