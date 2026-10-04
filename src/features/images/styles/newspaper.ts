import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, grainLayer, type CardRenderer, brandName } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, grayscalePhoto, hashtags } from "./shared";

// 신문·매거진 기사: 누런 신문지 바탕, 맨 위 "묵동일보" 제호와 두 줄 괘선, 굵은 명조 제목, 흑백 보도사진과 사진 설명,
// 두 단으로 나눈 본문. 날짜·호수처럼 확인할 수 없는 사실은 지어내지 않고 "홍어 특집 · 3면"처럼 장 번호만 쓴다.
const PAPER="#F1ECDF",INK="#1C1A17",DIM="#5E584C",RED="#B3261E";

export const renderNewspaper:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const M=64,W=1080-M*2;
  const layers:OverlayOptions[]=[];
  // 제호와 괘선.
  const masthead=await textLayer("묵동일보",{size:content.cover?118:84,color:INK,width:W,height:160,font:STYLE_FONTS.serifHeavy,align:"centre",spacing:0});
  const dateline=await textLayer(`홍어 특집  ·  ${index}면  ·  ${hashtags(content)}`,{size:26,color:DIM,width:W,height:40,font:STYLE_FONTS.serif,align:"centre"});
  let y=M-6;
  layers.push({input:masthead.data,left:Math.round((1080-masthead.info.width)/2),top:y});
  y+=masthead.info.height+14;
  let rules=`<path d="M${M} ${y}H${1080-M}" stroke="${INK}" stroke-width="6"/><path d="M${M} ${y+10}H${1080-M}" stroke="${INK}" stroke-width="1.5"/>`;
  y+=24;
  layers.push({input:dateline.data,left:Math.round((1080-dateline.info.width)/2),top:y});
  y+=dateline.info.height+16;
  rules+=`<path d="M${M} ${y}H${1080-M}" stroke="${INK}" stroke-width="1.5"/>`;
  y+=34;
  // 표지는 "단독" 붉은 도장, 본문은 섹션 머리.
  if(content.cover){
    const stamp=await textLayer("단독",{size:34,color:"#fff",width:120,height:50,font:STYLE_FONTS.serifHeavy,align:"centre"});
    rules+=`<rect x="${M}" y="${y}" width="${stamp.info.width+36}" height="${stamp.info.height+18}" fill="${RED}"/>`;
    layers.push({input:stamp.data,left:M+18,top:y+9});
    y+=stamp.info.height+36;
  }
  const headline=await fitText(content.headline,{sizes:content.cover?[86,76,66]:[68,60,54],width:W,maxHeight:content.cover?320:240,color:INK,font:STYLE_FONTS.serifHeavy,spacing:6});
  layers.push({input:headline.data,left:M,top:y});
  y+=headline.info.height+28;
  // 흑백 보도사진과 사진 설명. 사진이 없으면 큰 인용 상자를 둔다.
  const columnsHeight=async(lines:string[],width:number)=>Promise.all(lines.map(line=>textLayer(line,{size:34,color:INK,width,height:200,font:STYLE_FONTS.serif,spacing:8})));
  const COL_GAP=44,COL_W=Math.round((W-COL_GAP)/2);
  const body=await columnsHeight(content.points,COL_W);
  const bodyHeight=(column:typeof body)=>column.reduce((sum,line)=>sum+line.info.height+20,0);
  const half=Math.ceil(body.length/2),left=body.slice(0,half),right=body.slice(half);
  const columns=Math.max(bodyHeight(left),bodyHeight(right));
  const footerTop=1350-78;
  if(inputs.length){
    const caption=await textLayer(`▲ ${content.keywords[0]??"홍어"} 한 점. 사진은 연출된 장면입니다.`,{size:24,color:DIM,width:W,height:40,font:STYLE_FONTS.serif});
    const photoH=Math.max(320,Math.min(620,footerTop-30-columns-30-caption.info.height-14-y));
    layers.push({input:await grayscalePhoto(inputs[0],W,photoH),left:M,top:y});
    rules+=`<rect x="${M}" y="${y}" width="${W}" height="${photoH}" fill="none" stroke="${INK}" stroke-width="2"/>`;
    y+=photoH+12;
    layers.push({input:caption.data,left:M,top:y});
    y+=caption.info.height+28;
  }else{
    // 사진 없는 기사: 첫 요점을 큰 인용으로, 나머지를 번호 매긴 큰 문단으로 써서 지면을 채운다.
    const quote=await fitText(`“${content.points[0]??content.headline}”`,{sizes:[64,56,48],width:W-80,maxHeight:300,color:INK,font:STYLE_FONTS.brushSerif,align:"centre"});
    rules+=`<path d="M${M} ${y}H${1080-M}M${M} ${y+quote.info.height+60}H${1080-M}" stroke="${INK}" stroke-width="3"/>`;
    layers.push({input:quote.data,left:Math.round((1080-quote.info.width)/2),top:y+30});
    y+=quote.info.height+100;
    const rest=content.points.slice(1);
    const paragraphs=await Promise.all(rest.map((line,i)=>textLayer(`${["①","②","③","④"][i]}  ${line}`,{size:46,color:INK,width:W,height:240,font:STYLE_FONTS.serif,spacing:12})));
    const used=paragraphs.reduce((sum,p)=>sum+p.info.height,0);
    const gap=paragraphs.length>1?Math.max(30,Math.min(180,Math.floor((footerTop-40-y-used)/(paragraphs.length-1)))):0;
    for(const paragraph of paragraphs){layers.push({input:paragraph.data,left:M,top:y});y+=paragraph.info.height+gap;}
    rules+=`<path d="M${M} ${footerTop}H${1080-M}" stroke="${INK}" stroke-width="1.5"/>`;
    const folio=await textLayer(`${brandName()}  ·  ${index} / ${total}`,{size:26,color:DIM,width:W,height:40,font:STYLE_FONTS.serif,align:"centre"});
    layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:footerTop+16});
    layers.unshift(svgLayer(rules));
    layers.push(await grainLayer({opacity:.22}));
    return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(layers).jpeg({quality:92}).toBuffer();
  }
  // 두 단 본문과 단 사이 세로 괘선. 첫 단의 첫 글자를 크게(드롭 캡) 쓰는 대신 붉은 네모로 기사 시작을 표시한다.
  const columnTop=Math.min(y,footerTop-30-columns);
  let cy=columnTop;
  for(const line of left){layers.push({input:line.data,left:M,top:cy});cy+=line.info.height+20;}
  cy=columnTop;
  for(const line of right){layers.push({input:line.data,left:M+COL_W+COL_GAP,top:cy});cy+=line.info.height+20;}
  // 본문이 없는 장(표지)에는 기사 시작 표시와 단 괘선을 그리지 않는다.
  if(body.length)rules+=`<rect x="${M}" y="${columnTop-26}" width="14" height="14" fill="${RED}"/><path d="M${M+COL_W+COL_GAP/2} ${columnTop}V${columnTop+columns-10}" stroke="${INK}" stroke-opacity=".5" stroke-width="1.5"/>`;
  // 아래 괘선과 쪽수.
  rules+=`<path d="M${M} ${footerTop}H${1080-M}" stroke="${INK}" stroke-width="1.5"/>`;
  const folio=await textLayer(`${brandName()}  ·  ${index} / ${total}`,{size:26,color:DIM,width:W,height:40,font:STYLE_FONTS.serif,align:"centre"});
  layers.push({input:folio.data,left:Math.round((1080-folio.info.width)/2),top:footerTop+16});
  layers.unshift(svgLayer(rules));
  layers.push(await grainLayer({opacity:.22}));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(layers).jpeg({quality:92}).toBuffer();
};
