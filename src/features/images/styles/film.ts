import sharp, { type OverlayOptions } from "sharp";
import { grainLayer, svgLayer, textLayer, type CardRenderer, brandName } from "../render/primitives";
import { STYLE_FONTS, contentOf, filmPhoto, fitText , snap } from "./shared";

// 감성 필름: 검은 필름 띠 양옆에 톱니 구멍과 주황 가장자리 글자("MUKDONG 400", 프레임 번호)를 넣고,
// 가운데 프레임에 따뜻하게 바랜 필름 사진(빛샘·비네트)을 놓는다. 글은 영화 자막처럼 사진 아래 가운데에 흰 명조로.
// 사진 오른쪽 아래에는 옛 필름 카메라의 주황 숫자 도장처럼 장 번호를 찍는다(실제 날짜는 넣지 않는다).
const BASE="#121110",EDGE_TEXT="#E8923A",SUB="#F4EFE4",DIM="#A7A097";

function filmStrip():string {
  let holes="";
  for(let y=24;y<1350;y+=62)holes+=`<rect x="18" y="${y}" width="34" height="38" rx="6" fill="#2A2724"/><rect x="${1080-52}" y="${y}" width="34" height="38" rx="6" fill="#2A2724"/>`;
  return holes+`<path d="M70 0V1350M${1080-70} 0V1350" stroke="#2A2724" stroke-width="2"/>`;
}

export const renderFilm:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const frame=String(index).padStart(2,"0");
  const FX=100,FW=1080-FX*2;
  const layers:OverlayOptions[]=[];
  let deco=filmStrip();
  // 필름 가장자리 글자(위·아래).
  const edgeTop=await textLayer(`▸ ${frame}A     MUKDONG 400     ▸ ${frame}`,{size:24,color:EDGE_TEXT,width:FW,height:36,font:STYLE_FONTS.sansBold,align:"centre"});
  layers.push({input:edgeTop.data,left:Math.round((1080-edgeTop.info.width)/2),top:28});
  let y=90;
  const shots=inputs.slice(0,2);
  const leak=(index+(slide.variant??0))%2?"left":"right";
  if(shots.length){
    // 사진 칸: 한 장이면 크게, 두 장이면 위아래 두 프레임(밀착 인화지처럼).
    const textRoom=content.cover?260:Math.min(420,170+content.points.length*70);
    const totalH=1350-90-y-textRoom;
    const FH=shots.length>1?Math.round((totalH-24)/2):Math.min(content.cover?860:760,totalH);
    for(const [i,shot] of shots.entries()){
      layers.push({input:await filmPhoto(shot,FW,FH,i?(leak==="left"?"right":"left"):leak),left:FX,top:y});
      deco+=`<rect x="${FX-6}" y="${y-6}" width="${FW+12}" height="${FH+12}" fill="none" stroke="#000" stroke-width="12"/>`;
      // 옛 카메라 날짜 도장 자리에 장 번호.
      const stamp=await textLayer(`'${frame}  ${i?"B":"A"}`,{size:40,color:"#FF9A3C",width:300,height:60,font:STYLE_FONTS.pixelBold});
      layers.push({input:await sharp(stamp.data).blur(.6).png().toBuffer(),left:FX+FW-stamp.info.width-30,top:y+FH-stamp.info.height-24});
      y+=FH+24;
    }
    y+=16;
  }else{
    // 사진 없는 장: 빈 검은 프레임 안 가운데에 큰 자막.
    const FH=1350-90-y-170;
    deco+=`<rect x="${FX}" y="${y}" width="${FW}" height="${FH}" fill="#1B1917" stroke="#000" stroke-width="12"/>`;
    const quote=await fitText(content.headline,{sizes:[72,64,56],width:FW-120,maxHeight:320,color:SUB,font:STYLE_FONTS.brushSerif,align:"centre",spacing:14});
    const lines=await Promise.all(content.points.slice(0,4).map(point=>textLayer(point,{size:38,color:DIM,width:FW-140,height:120,font:STYLE_FONTS.serif,align:"centre",spacing:8})));
    const blockH=quote.info.height+60+lines.reduce((sum,line)=>sum+line.info.height+26,0);
    let cy=y+Math.max(40,Math.round((FH-blockH)/2));
    layers.push({input:quote.data,left:Math.round((1080-quote.info.width)/2),top:cy});
    cy+=quote.info.height+30;
    deco+=`<path d="M510 ${cy}H570" stroke="${EDGE_TEXT}" stroke-width="2"/>`;
    cy+=30;
    for(const line of lines){layers.push({input:line.data,left:Math.round((1080-line.info.width)/2),top:cy});cy+=line.info.height+26;}
    y+=FH+30;
    const caption=await textLayer(`— ${content.keywords[0]??"홍어"}, 그날의 기록 —`,{size:30,color:DIM,width:FW,height:50,font:STYLE_FONTS.serif,align:"centre"});
    layers.push({input:caption.data,left:Math.round((1080-caption.info.width)/2),top:y+20});
  }
  if(shots.length){
    // 자막: 제목은 흰 명조, 요점은 흐린 회색. 자막답게 가운데 정렬.
    const subtitle=await fitText(content.headline,{sizes:content.cover?[60,54,48]:[46,42,38],width:FW-40,maxHeight:content.cover?200:130,color:SUB,font:STYLE_FONTS.brushSerif,align:"centre",spacing:10});
    layers.push({input:subtitle.data,left:Math.round((1080-subtitle.info.width)/2),top:y});
    y+=subtitle.info.height+22;
    for(const point of content.points.slice(0,shots.length>1?2:3)){
      const line=await textLayer(point,{size:32,color:DIM,width:FW-60,height:90,font:STYLE_FONTS.serif,align:"centre",spacing:6});
      if(y+line.info.height>1350-80)break;
      layers.push({input:line.data,left:Math.round((1080-line.info.width)/2),top:y});
      y+=line.info.height+14;
    }
  }
  const edgeBottom=await textLayer(`${brandName()}   ·   ${index} / ${total}   ·   KEEP THE MOMENT`,{size:22,color:EDGE_TEXT,width:FW,height:34,font:STYLE_FONTS.sansBold,align:"centre"});
  layers.push({input:edgeBottom.data,left:Math.round((1080-edgeBottom.info.width)/2),top:1350-50});
  layers.unshift(svgLayer(deco));
  layers.push(await grainLayer({opacity:.3}));
  return sharp({create:{width:1080,height:1350,channels:3,background:BASE}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
