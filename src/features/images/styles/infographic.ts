import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { croppedPhoto, mascotLayer, svgLayer, textLayer, type CardRenderer, brandName } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText , snap } from "./shared";

// 인포그래픽·도감: 모눈종이 바탕에 "홍어 도감 No.03" 표제, 둥근 사진에서 점선 지시선을 뽑아 부위·특징 설명을 단다.
// 사진이 없는 장은 요점을 단계(1단계 → 2단계 …)로 이어 붙인 점선 흐름도로, 두 장이면 A·B 비교 도감으로 그린다.
// 구석에 마스코트를 작게 넣어 도감 속 귀여운 일러스트 역할을 맡긴다.
const PAPER="#F6F5EE",GRID="#CFE0D8",GRID_MAJOR="#A9C9BC",INK="#22313F",ACCENT="#C8401A",SOFT="#FFF3C4";

function graphPaper():string {
  let d="",D="";
  for(let x=0;x<=1080;x+=30){if(x%150===0)D+=`M${x} 0V1350`;else d+=`M${x} 0V1350`;}
  for(let y=0;y<=1350;y+=30){if(y%150===0)D+=`M0 ${y}H1080`;else d+=`M0 ${y}H1080`;}
  return `<path d="${d}" stroke="${GRID}" stroke-width="1"/><path d="${D}" stroke="${GRID_MAJOR}" stroke-width="1.6"/>`;
}
// 화살촉이 달린 점선.
const dashedArrow=(x1:number,y1:number,x2:number,y2:number)=>{
  const a=Math.atan2(y2-y1,x2-x1),h=16;
  const p=(da:number)=>`${Math.round(x2-Math.cos(a+da)*h)} ${Math.round(y2-Math.sin(a+da)*h)}`;
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${INK}" stroke-width="3" stroke-dasharray="8 8"/><path d="M${p(.45)}L${x2} ${y2}L${p(-.45)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
};
const badge=(cx:number,cy:number,r:number,label:string,fill=ACCENT)=>({svg:`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="3"/>`,label,cx,cy});

export const renderInfographic:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const M=64,W=1080-M*2;
  const layers:OverlayOptions[]=[];
  let deco=graphPaper();
  const texts:Array<{value:string;cx:number;cy:number;size:number;color?:string}>=[];
  // 표제: 왼쪽 위 도감 번호 꼬리표, 그 아래 제목.
  const tag=await textLayer(`홍어 도감  No.${String(index).padStart(2,"0")}`,{size:30,color:"#FFFFFF",width:600,height:50,font:STYLE_FONTS.comic});
  deco+=`<rect x="${M}" y="${M}" width="${tag.info.width+40}" height="${tag.info.height+20}" rx="6" fill="${INK}"/>`;
  layers.push({input:tag.data,left:M+20,top:M+10});
  const kw=await textLayer(content.keywords.map(word=>`#${word}`).join("  ")||STORE_NAME,{size:26,color:INK,width:420,height:44,font:STYLE_FONTS.sansSemi,align:"centre"});
  layers.push({input:kw.data,left:1080-M-kw.info.width,top:M+16});
  let y=M+tag.info.height+50;
  const title=await fitText(content.headline,{sizes:content.cover?[84,74,66]:[64,58,52],width:W,maxHeight:content.cover?260:190,color:INK,font:STYLE_FONTS.comic,spacing:6});
  layers.push({input:title.data,left:M,top:y});
  y+=title.info.height+12;
  deco+=`<path d="M${M} ${y}H${M+Math.min(W,title.info.width)}" stroke="${ACCENT}" stroke-width="6"/>`;
  y+=40;
  const footerTop=1350-90;
  const points=content.points.slice(0,inputs.length===1?3:4);
  if(inputs.length===1){
    // 둥근 사진 + 오른쪽 지시선 설명(최대 3개). 표지는 사진을 가운데 크게, 설명 대신 "FIELD GUIDE" 도장.
    // 원과 설명 묶음을 남은 공간의 세로 가운데에 둔다(아래가 휑하게 비지 않도록).
    const R=content.cover?300:Math.min(270,Math.round((footerTop-y-60)/2));
    const cx=content.cover?540:M+R,cy=content.cover?Math.min(y+R+20,footerTop-R-30):Math.round((y+footerTop-20)/2);
    deco+=`<circle cx="${cx+10}" cy="${cy+12}" r="${R+12}" fill="${INK}" opacity=".15"/><circle cx="${cx}" cy="${cy}" r="${R+12}" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
    layers.push({input:await croppedPhoto(inputs[0],R*2,R*2,0,{circle:true}),left:cx-R,top:cy-R});
    if(content.cover){
      deco+=`<g transform="rotate(-12 ${cx+R+20} ${cy-R+40})"><rect x="${cx+R-110}" y="${cy-R}" width="260" height="80" rx="8" fill="none" stroke="${ACCENT}" stroke-width="5"/></g>`;
      texts.push({value:"FIELD GUIDE",cx:cx+R+20,cy:cy-R+40,size:34,color:ACCENT});
    }else{
      const LX=cx+R+80,LW=1080-M-LX+20;
      const labels=await Promise.all(points.map(point=>textLayer(point,{size:31,color:INK,width:LW-40,height:180,font:STYLE_FONTS.sansSemi,spacing:6})));
      const span=R*2+20,step=labels.length>1?span/(labels.length):span;
      for(const [i,label] of labels.entries()){
        const ly=Math.round(cy-R+step*i+step/2-label.info.height/2);
        const a=-Math.PI/3+(i*(Math.PI*2/3))/Math.max(1,labels.length-1||1);
        const ex=Math.round(cx+Math.cos(labels.length>1?a:0)*R*.75),ey=Math.round(cy+Math.sin(labels.length>1?a:0)*R*.75);
        deco+=`<circle cx="${ex}" cy="${ey}" r="9" fill="${ACCENT}" stroke="#fff" stroke-width="3"/><path d="M${ex} ${ey}L${LX-50} ${ly+label.info.height/2}H${LX-14}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-dasharray="6 6"/>`;
        const b=badge(LX-14,ly+label.info.height/2,20,String(i+1));
        deco+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy,size:24,color:"#fff"});
        deco+=`<rect x="${LX+14}" y="${ly-10}" width="${label.info.width+28}" height="${label.info.height+20}" rx="10" fill="${SOFT}" stroke="${INK}" stroke-width="2"/>`;
        layers.push({input:label.data,left:LX+28,top:ly});
      }
    }
  }else if(inputs.length>=2){
    // A·B 비교 도감: 두 원형 사진과 아래 특징 목록.
    const R=180;
    for(const [i,shot] of inputs.slice(0,2).entries()){
      const cx=i?1080-M-R-30:M+R+30,cy=y+R+10;
      deco+=`<circle cx="${cx}" cy="${cy}" r="${R+10}" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
      layers.push({input:await croppedPhoto(shot,R*2,R*2,0,{circle:true}),left:cx-R,top:cy-R});
      const b=badge(cx-R+20,cy-R+20,34,i?"B":"A",i?"#3A86FF":ACCENT);
      deco+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy,size:36,color:"#fff"});
    }
    deco+=dashedArrow(540-60,y+R+10,540+60,y+R+10);
    y+=R*2+70;
    for(const [i,point] of points.entries()){
      const line=await textLayer(point,{size:34,color:INK,width:W-110,height:110,font:STYLE_FONTS.sansSemi,spacing:6});
      if(y+line.info.height>footerTop-20)break;
      const b=badge(M+26,y+line.info.height/2,22,String(i+1));
      deco+=b.svg+`<path d="M${M+70} ${y+line.info.height+14}H${1080-M}" stroke="${GRID_MAJOR}" stroke-width="2" stroke-dasharray="4 6"/>`;
      texts.push({value:b.label,cx:b.cx,cy:b.cy,size:24,color:"#fff"});
      layers.push({input:line.data,left:M+70,top:y});
      y+=line.info.height+34;
    }
  }else{
    // 단계 흐름도: 왼쪽 세로 점선 위에 단계 번호, 오른쪽에 설명 카드. 단계 사이는 화살표.
    const cards=await Promise.all(points.map(point=>textLayer(point,{size:44,color:INK,width:W-260,height:160,font:STYLE_FONTS.sansSemi,spacing:8})));
    const cardsH=cards.reduce((sum,card)=>sum+card.info.height+44,0);
    const gap=cards.length>1?Math.max(40,Math.min(170,Math.floor((footerTop-160-y-cardsH)/(cards.length-1)))):0;
    for(const [i,card] of cards.entries()){
      const h=card.info.height+44,cy=y+h/2;
      const b=badge(M+60,cy,46,`${i+1}`);
      deco+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy-6,size:40,color:"#fff"});
      texts.push({value:"단계",cx:b.cx,cy:b.cy+24,size:18,color:"#fff"});
      deco+=`<rect x="${M+140}" y="${y}" width="${W-140}" height="${h}" rx="16" fill="${i%2?"#fff":SOFT}" stroke="${INK}" stroke-width="3"/>`;
      layers.push({input:card.data,left:M+170,top:y+22});
      if(i<cards.length-1)deco+=dashedArrow(M+60,cy+50,M+60,cy+h/2+gap+h/2-50);
      y+=h+gap;
    }
  }
  // 오른쪽 아래 작은 마스코트(도감 삽화).
  const mascot=await mascotLayer({width:150,pose:content.cover?"hello":"tip",left:1080-M+10,top:footerTop+40,anchor:"bottom-right",maxHeight:200});
  if(mascot&&(inputs.length!==1||content.cover))layers.push(mascot);
  deco+=`<path d="M${M} ${footerTop+14}H${1080-M}" stroke="${INK}" stroke-width="2"/>`;
  const folio=await textLayer(`${brandName()}  ·  홍어 도감 ${index} / ${total}`,{size:26,color:INK,width:700,height:40,font:STYLE_FONTS.sansSemi});
  layers.push({input:folio.data,left:M,top:footerTop+30});
  // 원 안·배지 위 글자는 가운데 정렬해서 마지막에 얹는다.
  for(const text of texts){
    const layer=await textLayer(text.value,{size:text.size,color:text.color??INK,width:300,height:text.size*2,font:STYLE_FONTS.heavy,align:"centre"});
    layers.push({input:layer.data,left:Math.round(text.cx-layer.info.width/2),top:Math.round(text.cy-layer.info.height/2)});
  }
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
