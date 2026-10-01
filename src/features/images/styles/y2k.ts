import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { STYLE_FONTS, contentOf, fitText, hashtags, pixelPhoto } from "./shared";

// Y2K·레트로 픽셀: 윈도우95 바탕화면 위에 회색 경고창을 띄운다. 파란 제목 표시줄, 도트(갈무리) 글꼴, 노란 경고 삼각형,
// 도트처럼 깨진 사진, [확인] 버튼, 아래 작업 표시줄. 마젠타·네온 그린을 반짝이로 섞는다.
const GRAY="#C0C0C0",DARK="#808080",NAVY="#000080",BLUE="#1084D0",MAGENTA="#FF2BD6",NEON="#39FF14";
const DESKTOPS=["#008080","#5B2A86","#101830"];
const TITLES=["경고.exe","중독주의.exe","홍어.exe","알림.exe","속보.exe"];

// 윈도우95식 입체 테두리: 왼쪽·위는 밝게, 오른쪽·아래는 어둡게(raised). 눌린 칸(sunken)은 반대.
const bevel=(x:number,y:number,w:number,h:number,sunken=false)=>{
  const light=sunken?DARK:"#FFFFFF",shade=sunken?"#FFFFFF":"#404040";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${sunken?"#FFFFFF":GRAY}"/><path d="M${x} ${y+h}V${y}H${x+w}" fill="none" stroke="${light}" stroke-width="4"/><path d="M${x+w} ${y}V${y+h}H${x}" fill="none" stroke="${shade}" stroke-width="4"/>`;
};
// 도트 별(네모 다섯 개로 만든 십자 반짝이).
const pixelStar=(x:number,y:number,s:number,color:string)=>[[0,-2],[0,-1],[0,0],[0,1],[0,2],[-2,0],[-1,0],[1,0],[2,0]].map(([dx,dy])=>`<rect x="${x+dx*s}" y="${y+dy*s}" width="${s}" height="${s}" fill="${color}"/>`).join("");

export const renderY2k:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const desktop=DESKTOPS[(index-1+(slide.variant??0))%DESKTOPS.length];
  const WX=60,WW=960,BAR=58,TASK=64;
  let WY=110;
  const layers:OverlayOptions[]=[];
  // 바탕화면과 도트 반짝이.
  const desk=`<rect width="1080" height="1350" fill="${desktop}"/>`+pixelStar(980,60,8,NEON)+pixelStar(70,1180,7,MAGENTA)+pixelStar(1000,1150,6,"#FFFFFF");
  // 창 안 내용: 경고 삼각형 + 제목, 사진(눌린 칸), 요점(> 글머리), 버튼.
  const title=await fitText(content.headline,{sizes:content.cover?[56,50,44]:[46,42,38],width:WW-200,maxHeight:220,color:"#000000",font:STYLE_FONTS.pixelBold,spacing:10});
  // 사진 없는 창은 요점을 크게(40px) 써서 창을 키운다.
  const lineSize=inputs.length?34:40;
  const lines=await Promise.all(content.points.map(point=>textLayer(`> ${point}`,{size:lineSize,color:"#000000",width:WW-110,height:lineSize*4,font:STYLE_FONTS.pixel,spacing:inputs.length?8:22})));
  const linesH=lines.reduce((sum,line)=>sum+line.info.height+14,0);
  const BUTTON_H=72,PAD=36;
  const fixed=Math.max(title.info.height,110)+30+(lines.length?linesH+20:0)+BUTTON_H+PAD*2;
  const maxWinH=1350-TASK-40-110;
  const photoH=inputs.length?Math.max(260,Math.min(560,maxWinH-BAR-fixed)):0;
  const WH=Math.min(maxWinH,BAR+fixed+(photoH?photoH+30:0));
  // 창이 작으면(사진 없는 장) 바탕화면 세로 가운데로 내린다. 위쪽 네온 팝업 자리(60px)는 남긴다.
  WY=Math.max(110,Math.round((1350-TASK-WH)/2));
  let win=bevel(WX,WY,WW,WH)
    +`<defs><linearGradient id="bar" x1="0" x2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${BLUE}"/></linearGradient></defs><rect x="${WX+6}" y="${WY+6}" width="${WW-12}" height="${BAR-8}" fill="url(#bar)"/>`;
  // 제목 표시줄 오른쪽 버튼 세 개(_ □ X).
  for(let i=0;i<3;i++)win+=bevel(WX+WW-6-(3-i)*50,WY+12,42,BAR-20);
  const barTitle=await textLayer(`⚠ ${TITLES[(index-1)%TITLES.length]}`,{size:30,color:"#FFFFFF",width:600,height:44,font:STYLE_FONTS.pixelBold});
  const marks=await textLayer("_   □   X",{size:26,color:"#000000",width:150,height:36,font:STYLE_FONTS.pixelBold});
  // 노란 경고 삼각형(도트 느낌으로 계단 테두리).
  const contentTop=WY+BAR+PAD;
  const tx=WX+PAD+10,ty=contentTop;
  win+=`<path d="M${tx+50} ${ty}L${tx+100} ${ty+90}H${tx}Z" fill="#FFD400" stroke="#000" stroke-width="5" stroke-linejoin="miter"/><rect x="${tx+45}" y="${ty+30}" width="10" height="34" fill="#000"/><rect x="${tx+45}" y="${ty+70}" width="10" height="10" fill="#000"/>`;
  layers.push({input:title.data,left:WX+PAD+130,top:contentTop+Math.max(0,Math.round((100-title.info.height)/2))});
  let y=contentTop+Math.max(title.info.height,110)+30;
  if(photoH){
    win+=bevel(WX+PAD-4,y-4,WW-PAD*2+8,photoH+8,true);
    layers.push({input:await pixelPhoto(inputs[0],WW-PAD*2,photoH,6),left:WX+PAD,top:y});
    y+=photoH+30;
  }
  for(const line of lines){layers.push({input:line.data,left:WX+PAD+10,top:y});y+=line.info.height+14;}
  // 버튼 두 개.
  const by=WY+WH-PAD-BUTTON_H;
  const labels=[content.last?"[ 저장하기 ]":"[ 확인 ]",content.cover?"[ 열어보기 ]":"[ 다음 → ]"];
  for(const [i,label] of labels.entries()){
    const bw=300,bx=WX+WW/2-bw-16+i*(bw+32);
    win+=bevel(bx,by,bw,BUTTON_H)+(i===0?`<rect x="${bx+8}" y="${by+8}" width="${bw-16}" height="${BUTTON_H-16}" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="4 4"/>`:"");
    const text=await textLayer(label,{size:30,color:"#000000",width:bw,height:44,font:STYLE_FONTS.pixelBold,align:"centre"});
    layers.push({input:text.data,left:bx+Math.round((bw-text.info.width)/2),top:by+Math.round((BUTTON_H-text.info.height)/2)});
  }
  // 작업 표시줄: [시작] 버튼, 해시태그 창 버튼, 오른쪽 시계 자리에 장 번호.
  const TY=1350-TASK;
  let task=`<rect x="0" y="${TY}" width="1080" height="${TASK}" fill="${GRAY}"/><path d="M0 ${TY+2}H1080" stroke="#FFFFFF" stroke-width="4"/>`+bevel(10,TY+10,150,TASK-20)+bevel(176,TY+10,560,TASK-20,true)+bevel(1080-170,TY+10,160,TASK-20,true);
  const start=await textLayer("시작",{size:28,color:"#000000",width:130,height:40,font:STYLE_FONTS.pixelBold,align:"centre"});
  const tab=await textLayer(hashtags(content),{size:26,color:"#000000",width:520,height:40,font:STYLE_FONTS.pixel});
  const clock=await textLayer(`${index}/${total}`,{size:28,color:"#000000",width:140,height:40,font:STYLE_FONTS.pixelBold,align:"centre"});
  task+=`<rect x="22" y="${TY+22}" width="20" height="20" fill="${MAGENTA}"/><rect x="44" y="${TY+22}" width="20" height="20" fill="${NEON}"/>`;
  layers.unshift(svgLayer(desk+win+task));
  layers.push({input:barTitle.data,left:WX+22,top:WY+12+Math.round((BAR-20-barTitle.info.height)/2)},{input:marks.data,left:WX+WW-6-150+14,top:WY+18},
    {input:start.data,left:70,top:TY+Math.round((TASK-start.info.height)/2)},{input:tab.data,left:196,top:TY+Math.round((TASK-tab.info.height)/2)},
    {input:clock.data,left:1080-170+Math.round((160-clock.info.width)/2),top:TY+Math.round((TASK-clock.info.height)/2)});
  // 창 위쪽에 겹친 작은 네온 팝업(장식). 화면 위 여백에 "NEW!" 도트 글자.
  const pop=await textLayer(content.cover?"★ NEW ★":"♥ 홍어 ♥",{size:34,color:"#000000",width:300,height:50,font:STYLE_FONTS.pixelBold,align:"centre"});
  layers.push(svgLayer(`<rect x="${1080-WX-pop.info.width-46}" y="${WY-58}" width="${pop.info.width+40}" height="${pop.info.height+20}" fill="${NEON}" stroke="#000" stroke-width="4"/>`),{input:pop.data,left:1080-WX-pop.info.width-26,top:WY-48});
  return sharp({create:{width:1080,height:1350,channels:3,background:desktop}}).composite(layers).jpeg({quality:92}).toBuffer();
};
