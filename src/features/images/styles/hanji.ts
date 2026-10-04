import sharp, { type OverlayOptions } from "sharp";
import { brandName, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, snap } from "./shared";
import { seeded, wobblyLine } from "./handDrawn";

// 한지·수묵(전통): 닥나무 섬유 결이 보이는 한지 바탕, 붓글씨 제목 뒤로 번진 먹, 붉은 낙관 도장.
// 사진은 가장자리가 한지에 스며들 듯 흐리게(표지) 또는 먹선 두 줄 테두리(본문). 요점 앞에는 붉은 一·二·三.
// 전라도 잔칫상·삼합 같은 전통 음식 이야기를 고급스럽게 전할 때 쓴다.
const PAPER="#F1E7D3",INK="#1D1A16",SOFT="#2E2822",DIM="#5C5244",SEAL="#B3261E";
const NUMERALS=["一","二","三","四"];

// 한지: 가로 섬유 결 + 큰 얼룩 + 가장자리 바램.
function paper():string {
  return `<defs><filter id="fiber"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .35  0 0 0 0 .24  0 0 0 .28 0"/></filter>`
    +`<filter id="blot"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .22 0"/></filter>`
    +`<radialGradient id="age" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="#7a5a2a" stop-opacity="0"/><stop offset="100%" stop-color="#7a5a2a" stop-opacity=".22"/></radialGradient></defs>`
    +`<rect width="1080" height="1350" filter="url(#blot)"/><rect width="1080" height="1350" filter="url(#fiber)"/><rect width="1080" height="1350" fill="url(#age)"/>`;
}
// 붓으로 크게 쓸어 번진 먹(제목 뒤 배경).
function inkWash(x:number,y:number,w:number,h:number,seed:number,opacity=.16):string {
  const rand=seeded(seed);
  const id=`wash${seed}`;
  return `<filter id="${id}" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="40"/><feGaussianBlur stdDeviation="10"/></filter>`
    +`<path d="${wobblyLine(x,y+h/2,x+w,y+h/2+((rand()-.5)*30),rand,h*.12,6)}" stroke="#2A241D" stroke-width="${h}" stroke-linecap="round" fill="none" opacity="${opacity}" filter="url(#${id})"/>`;
}
// 낙관(붉은 도장): 테두리가 살짝 거친 붉은 사각형 안에 흰 글자 두 줄.
async function seal(size:number,seed:number):Promise<{svg:(x:number,y:number)=>string;text:Awaited<ReturnType<typeof textLayer>>}> {
  const text=await textLayer("묵동\n홍어",{size:Math.round(size*.3),color:"#FBEFE6",width:size,height:size,font:STYLE_FONTS.serifHeavy,align:"centre",spacing:2});
  const id=`seal${seed}`;
  return {text,svg:(x,y)=>`<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="${SEAL}" filter="url(#${id})" transform="rotate(-3 ${x+size/2} ${y+size/2})"/>`};
}
// 가장자리가 한지에 스며드는 사진(흐린 사각 마스크를 알파로).
async function inkPhoto(input:Buffer,width:number,height:number):Promise<Buffer> {
  const W=Math.round(width),H=Math.round(height);
  const base=await sharp(input).rotate().resize(W,H,{fit:"cover",position:"attention"}).modulate({saturation:.86}).linear([1.03,1,.94],[4,2,-4]).removeAlpha().png().toBuffer();
  const feather=Math.round(Math.min(W,H)*.07);
  const mask=await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><rect x="${feather}" y="${feather}" width="${W-feather*2}" height="${H-feather*2}" rx="${feather}" fill="#fff"/></svg>`)).blur(feather*.8).extractChannel(0).toBuffer();
  return sharp(base).joinChannel(mask).png().toBuffer();
}

export const renderHanji:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const layers:OverlayOptions[]=[];
  let deco=paper();
  const M=96,W=1080-M*2,footerTop=1350-84;
  const shots=inputs.slice(0,2);
  let y=content.cover?120:100;
  // 표지: 왼쪽에 세로로 쓴 가게 이름. 본문: 위에 "第 二 張" 대신 작은 장 번호.
  if(content.cover||!shots.length){
    // 표지와 글자 장은 왼쪽 가장자리에 세로로 쓴 가게 이름으로 옆을 채운다.
    // 긴 제목의 먹 번짐이 왼쪽 가장자리까지 닿아도 읽히도록 옅은 색 대신 본문 글자색을 쓴다.
    const vertical=await textLayer([..."묵동홍어마을"].join("\n"),{size:30,color:SOFT,width:44,height:400,font:STYLE_FONTS.serif,align:"centre",spacing:6});
    layers.push({input:vertical.data,left:44,top:130});
  }
  if(!content.cover){
    const no=await textLayer(`${index} / ${total}`,{size:26,color:DIM,width:300,height:40,font:STYLE_FONTS.serif});
    layers.push({input:no.data,left:M,top:60});
  }
  // 제목: 붓글씨. 뒤에 번진 먹.
  const title=await fitText(content.headline,{sizes:content.cover?[124,108,96,84]:shots.length?[84,76,68,60]:[100,88,78,70],width:content.cover?W-40:W-130,maxHeight:content.cover?380:shots.length?230:330,color:INK,font:STYLE_FONTS.brush,align:content.cover?"centre":"left",spacing:4});
  const titleX=content.cover?Math.round((1080-title.info.width)/2):M;
  if(!shots.length&&!content.cover)y=Math.max(y,Math.round(1350/2-title.info.height-120));
  deco+=inkWash(titleX-30,y-10,title.info.width+60,title.info.height+20,index*7+3);
  layers.push({input:title.data,left:titleX,top:y});
  y+=title.info.height+30;
  // 낙관: 표지는 제목 오른쪽 아래, 본문은 제목 줄 끝.
  const stamp=await seal(content.cover?128:96,index*13+5);
  const stampX=content.cover?1080-M-128:1080-M-96,stampY=content.cover?y-20:58;
  deco+=stamp.svg(stampX,stampY);
  layers.push({input:stamp.text.data,left:stampX+Math.round(((content.cover?128:96)-stamp.text.info.width)/2),top:stampY+Math.round(((content.cover?128:96)-stamp.text.info.height)/2)});
  if(content.cover)y+=120;
  else{deco+=`<path d="${wobblyLine(M,y,M+220,y+2,seeded(index),2,5)}" stroke="${SEAL}" stroke-width="3" fill="none" opacity=".8"/>`;y+=34;}
  const points=content.points.slice(0,shots.length?3:4);
  const pointLayers=await Promise.all(points.map(point=>textLayer(point,{size:shots.length?40:46,color:SOFT,width:W-70,height:150,font:STYLE_FONTS.serif,spacing:10})));
  const numerals=await Promise.all(points.map((_,i)=>textLayer(NUMERALS[i],{size:44,color:SEAL,width:60,height:60,font:STYLE_FONTS.brush})));
  const pointsH=pointLayers.reduce((sum,layer)=>sum+Math.max(layer.info.height,48)+26,0);
  if(shots.length){
    const room=footerTop-y-(pointsH?pointsH+30:0)-20;
    const PH=Math.round(Math.max(300,Math.min(content.cover?680:740,room)));
    if(content.cover||shots.length===1){
      const PW=W;
      if(content.cover)layers.push({input:await inkPhoto(shots[0],PW,PH),left:M,top:y});
      else{
        layers.push({input:await sharp(shots[0]).rotate().resize(PW-24,PH-24,{fit:"cover",position:"attention"}).modulate({saturation:.88}).png().toBuffer(),left:M+12,top:y+12});
        deco+=`<rect x="${M}" y="${y}" width="${PW}" height="${PH}" fill="none" stroke="${INK}" stroke-width="3"/><rect x="${M+6}" y="${y+6}" width="${PW-12}" height="${PH-12}" fill="none" stroke="${INK}" stroke-width="1"/>`;
      }
    }else{
      const PW=Math.round((W-30)/2);
      for(const [i,shot] of shots.entries())layers.push({input:await inkPhoto(shot,PW,PH),left:M+i*(PW+30),top:y});
    }
    y+=PH+36;
  }
  // 사진 장은 사진 바로 아래에, 글자 장은 남은 칸 가운데보다 조금 위에.
  let py=shots.length?y:Math.max(y+40,Math.round((y+footerTop-pointsH)/2)-40);
  // 글자 장: 요점 뒤에 옅은 묵선 붓자국을 넓게 깔아 수묵 느낌을 더한다(글자보다 아래 레이어, 아주 옅게).
  if(!shots.length&&pointLayers.length)deco+=inkWash(M-30,py-10,W+60,pointsH+20,index*11+7,.07);
  for(const [i,layer] of pointLayers.entries()){
    layers.push({input:numerals[i].data,left:M,top:py-6},{input:layer.data,left:M+70,top:py});
    py+=Math.max(layer.info.height,48)+26;
  }
  deco+=`<path d="M${M} ${footerTop+6}H${1080-M}" stroke="${DIM}" stroke-width="1" opacity=".6"/>`;
  const footer=await fitText(brandName(),{sizes:[26,23,20],width:W,maxHeight:40,color:DIM,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:footer.data,left:Math.round((1080-footer.info.width)/2),top:footerTop+24});
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
