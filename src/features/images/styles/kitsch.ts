import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, svgLayer, textLayer, type CardRenderer, brandName } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitOutlined, fitText, rotated , snap } from "./shared";

// B급 감성·하이퍼 키치: 그림판 무지개 그라데이션 바탕, 빨강·노랑 외곽선 글자가 화면을 꽉 채우고,
// 톱니 별 딱지에 "이걸 아직도 안 먹어봤다고?!" 같은 외침을 넣는다. 사진은 두꺼운 색 테두리를 둘러 삐딱하게 붙인다.
// 외침 문구는 가격·할인처럼 확인할 수 없는 사실을 담지 않도록 감탄만 쓴다.
const RAINBOW=["#FF1F1F","#FF8A00","#FFE600","#22D94A","#00B7FF","#7A2BFF","#FF2BC8"];
const SHOUTS=["강력 추천!!","실화냐?!","필수 코스!","이 맛 뭐야?!","찐 맛집 감성","안 먹으면 섭섭!"];
const COVER_SHOUT="이걸 아직도 안 먹어봤다고?!";

// 무지개 대각선 그라데이션. variant마다 각도를 바꿔 장마다 다른 그림판 느낌을 낸다.
function rainbow(angle:number):string {
  const stops=RAINBOW.map((color,i)=>`<stop offset="${i/(RAINBOW.length-1)}" stop-color="${color}"/>`).join("");
  return `<defs><linearGradient id="rb" gradientTransform="rotate(${angle} .5 .5)">${stops}</linearGradient></defs><rect width="1080" height="1350" fill="url(#rb)"/>`;
}
// 톱니 별 딱지(가장자리가 뾰족한 폭발 모양).
function burst(cx:number,cy:number,rx:number,ry:number,fill:string,teeth=22):string {
  const points=Array.from({length:teeth*2},(_,i)=>{const a=(Math.PI*i)/teeth,k=i%2?.74:1;return `${Math.round(cx+Math.cos(a)*rx*k)},${Math.round(cy+Math.sin(a)*ry*k)}`;}).join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="#111" stroke-width="6" stroke-linejoin="round"/>`;
}
// 반짝이 별(네 갈래).
const twinkle=(x:number,y:number,r:number)=>`<path d="M${x} ${y-r}Q${x} ${y} ${x+r} ${y}Q${x} ${y} ${x} ${y+r}Q${x} ${y} ${x-r} ${y}Q${x} ${y} ${x} ${y-r}Z" fill="#fff"/>`;

export const renderKitsch:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const v=(index-1+(slide.variant??0));
  const M=50,W=1080-M*2;
  const layers:OverlayOptions[]=[];
  let deco=rainbow([20,110,160,65][v%4])+[[120,260,26],[960,200,34],[90,980,22],[1000,1080,30],[880,620,18]].map(([x,y,r])=>twinkle(x,y,r)).join("");
  // 맨 위 외침 딱지.
  const shout=content.cover?COVER_SHOUT:SHOUTS[(index-2+SHOUTS.length)%SHOUTS.length];
  const shoutText=await fitOutlined(shout,{sizes:[56,48,42],maxHeight:150,width:560,font:STYLE_FONTS.heavy,fill:"#FF1F1F",stroke:"#FFFFFF",strokeWidth:5,align:"centre"});
  const bx=content.cover?540:760,by=content.cover?150:140,brx=Math.max(220,shoutText.info.width/2+70),bry=Math.max(100,shoutText.info.height/2+50);
  deco+=burst(bx+8,by+10,brx,bry,"#111")+burst(bx,by,brx,bry,"#FFE600");
  const shoutTilt=await rotated(shoutText.data,content.cover?-4:8);
  // 제목: 노란 글자 + 빨간 외곽선 + 검은 그림자. 화면 폭을 꽉 채운다.
  const titleTop=Math.round(by+bry+30);
  const hasPhoto=inputs.length>0;
  const title=await fitOutlined(content.headline,{sizes:content.cover?[118,104,92,82]:[96,86,76,68,60],maxHeight:hasPhoto?(content.cover?360:300):420,width:W,font:STYLE_FONTS.heavy,fill:v%2?"#FFFFFF":"#FFE600",stroke:"#E8001C",strokeWidth:10,align:"centre",shadow:"#111111"});
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:titleTop});
  let y=titleTop+title.info.height+24;
  // 사진: 흰 테두리 + 빨간 바깥 테두리, 삐딱하게. 사진이 두 장이면 엇갈리게 두 장.
  const footerTop=1350-90;
  const pointsRoom=content.points.length?Math.min(3,content.points.length)*92+20:0;
  if(hasPhoto){
    const shots=inputs.slice(0,2);
    const PH=Math.round(Math.max(300,Math.min(560,footerTop-y-pointsRoom-40))),PW=shots.length>1?440:Math.round(PH*1.25);
    for(const [i,shot] of shots.entries()){
      const photo=await croppedPhoto(shot,PW,PH,0);
      const framed=await sharp({create:{width:PW+48,height:PH+48,channels:4,background:"#E8001C"}}).composite([{input:svgFrame(PW+48,PH+48),left:0,top:0},{input:photo,left:24,top:24}]).png().toBuffer();
      const tilt=await rotated(framed,shots.length>1?(i?5:-6):(v%2?4:-4));
      const left=shots.length>1?(i?1080-M-tilt.info.width+10:M-10):Math.round((1080-tilt.info.width)/2);
      layers.push({input:tilt.data,left,top:y+(i?30:0)});
    }
    y+=PH+70;
  }
  // 요점: 노랑·하늘 상자에 ★, 굵은 고딕.
  const fills=["#FFFF3A","#7CF6FF","#FFFFFF"];
  const maxPoints=hasPhoto?3:4;
  // 글자 장은 요점이 주인공이라 54px로 크게, 사진 장도 38px 아래로는 내려가지 않는다.
  const pointSize=hasPhoto?38:54;
  const boxes=await Promise.all(content.points.slice(0,maxPoints).map(point=>textLayer(`★ ${point}`,{size:pointSize,color:"#111111",width:W-100,height:pointSize*3.2,font:STYLE_FONTS.comic,spacing:6})));
  const boxesH=boxes.reduce((sum,box)=>sum+box.info.height+28+16,0);
  let py=hasPhoto?Math.max(y,footerTop-boxesH-10):Math.max(y+20,Math.round((y+footerTop-boxesH)/2));
  for(const [i,box] of boxes.entries()){
    // 상자는 번갈아 80px씩만 들여 써서 지그재그 느낌은 살리되 읽는 흐름은 왼쪽에서 오른쪽으로 이어지게 한다.
    const w=box.info.width+44,h=box.info.height+28,x=i%2?Math.min(1080-M-w,M+80):M;
    layers.push(svgLayer(`<rect x="${x+8}" y="${py+8}" width="${w}" height="${h}" fill="#111"/><rect x="${x}" y="${py}" width="${w}" height="${h}" fill="${fills[i%fills.length]}" stroke="#111" stroke-width="5"/>`),{input:box.data,left:x+22,top:py+14});
    py+=h+16;
  }
  // 아래 검은 띠에 노란 가게 이름(전광판 느낌).
  deco+=`<rect x="0" y="${footerTop+10}" width="1080" height="80" fill="#111"/>`;
  // 계정 이름이 길면 한 줄에 들어가는 크기로 줄인다(두 줄로 넘어가 작아지지 않게).
  const brand=await fitText(`☆ ${brandName()} ☆  ${index}/${total}`,{sizes:[34,30,26,22],width:1000,maxHeight:52,color:"#FFE600",font:STYLE_FONTS.heavy,align:"centre"});
  layers.push({input:brand.data,left:Math.round((1080-brand.info.width)/2),top:footerTop+10+Math.round((80-brand.info.height)/2)});
  layers.unshift(svgLayer(deco));
  layers.push({input:shoutTilt.data,left:Math.round(bx-shoutTilt.info.width/2),top:Math.round(by-shoutTilt.info.height/2)});
  return sharp({create:{width:1080,height:1350,channels:3,background:"#FFFFFF"}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};

// 사진 둘레의 흰 안쪽 테두리.
const svgFrame=(w:number,h:number)=>Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="${w-20}" height="${h-20}" fill="#fff"/></svg>`);
