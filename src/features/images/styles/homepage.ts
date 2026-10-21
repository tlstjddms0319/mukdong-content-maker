import sharp, { type OverlayOptions } from "sharp";
import { brandHandle, finishPhoto, svgLayer, textLayer } from "../render/primitives";
import { emphasisOf, nextCue, snap, type StyleContent, STYLE_FONTS } from "./shared";
import { MARGIN, SANS, SANS_SEMI, SAVE_CHIP, fitLines, logoMark, shortLines } from "./trackKit";

// 홈페이지 모양(사장님 요청 2026-10-21: "묵동홍어마을 홈페이지 느낌으로"). mukdong-hongeo 홈페이지의 디자인 토큰을 그대로 옮겼다:
//   먹색 바탕 #1C1714 · 크림 글자 #F7EDDD · 보조 글 #C9B491 · 핵심 낱말만 감빛 #E79463 · 제목은 고운바탕 명조 · 가는 크림 선(18%) ·
//   자간 넓은 작은 라벨("인기 메뉴 01" 같은 eyebrow) · 테두리만 있는 알약.
//   사진 장   : 위 56%(표지 62%) 사진을 가장자리까지, 아래는 먹색으로 녹아들고, 라벨 → 제목(핵심어 감빛) → 원인 한 줄 → 가는 선 → 로고.
//   글 중심   : 본문은 먹색 바탕에 홈페이지 카드의 옅은 큰 원 장식 + 같은 글 덩어리를 한가운데. 표지는 사진 장과 같다.
const W=1080,H=1350;
const CONTENT_W=W-MARGIN*2;
const CANVAS="#1C1714",INK="#F7EDDD",SOFT="#C9B491",ACCENT="#E79463",LINE="rgba(247,237,221,0.18)";
const BATANG=STYLE_FONTS.batang;

const titleOf=(content:StyleContent,sizes:number[],maxLines:number)=>fitLines(content.headline,{sizes,width:CONTENT_W,font:BATANG,color:INK,maxLines,prefer:sizes[0]>=96?"size":"lines",spacing:()=>0,letterSpacing:size=>-size*.01,emphasis:emphasisOf(content,ACCENT)});
const lineOf=(text:string,size:number)=>textLayer(text,{size,color:SOFT,width:CONTENT_W,height:4000,font:SANS,spacing:12});
// 라벨: 자간 넓은 작은 글(홈페이지의 "인기 메뉴 01", "A TASTE OF THE SEASON").
const eyebrowOf=(text:string)=>textLayer(text,{size:26,color:SOFT,width:CONTENT_W,height:60,font:SANS_SEMI,letterSpacing:4});

function progress(x:number,y:number,reason:{n:number;of:number}):string {
  const seg=56,gap=10,h=5;
  return Array.from({length:reason.of},(_,i)=>`<rect x="${x+i*(seg+gap)}" y="${y}" width="${seg}" height="${h}" rx="2.5" fill="${i<reason.n?ACCENT:INK}" fill-opacity="${i<reason.n?1:.22}"/>`).join("");
}
// 테두리만 있는 알약(홈페이지 "BEST"·"PAIRING").
function outlinedPill(x:number,y:number,width:number,height:number):string {
  return `<rect x="${x+1}" y="${y+1}" width="${width-2}" height="${height-2}" rx="${height/2}" fill="none" stroke="${INK}" stroke-opacity=".55" stroke-width="2"/>`;
}

async function card(photo:Buffer|undefined,content:StyleContent,index:number):Promise<Buffer> {
  const plain=!photo;
  const title=await titleOf(content,content.cover?[96,88,82,76,70]:plain?[100,92,84,78,72]:[86,80,74,68,62],plain?3:2);
  const line=content.cover?content.subline:shortLines(content,1)[0];
  const sub=line?await lineOf(line,content.cover||plain?42:38):null;
  const reason=!content.cover&&!content.last?content.reason:null;
  const eyebrow=await eyebrowOf(content.cover?"묵동홍어마을 · 중랑구 묵동":content.last?"다시 보기":reason?`이유 ${String(reason.n).padStart(2,"0")}`:`${String(index).padStart(2,"0")} / ${String(content.total).padStart(2,"0")}`);
  const chip=content.last?await textLayer(SAVE_CHIP,{size:28,color:INK,width:900,height:70,font:SANS_SEMI,letterSpacing:1}):null;
  const padX=26,padY=12,chipH=chip?chip.info.height+padY*2:0;
  const LOGO=48;
  const logo=await logoMark(LOGO,"#F5EFE5");
  const handle=content.last&&brandHandle()?await textLayer(brandHandle(),{size:30,color:SOFT,width:700,height:60,font:SANS_SEMI}):null;
  const cue=content.cover?await nextCue(INK,34):null;
  const footH=Math.max(LOGO,handle?.info.height??0,cue?.height??0);
  const footTop=H-MARGIN-footH;
  const RULE_GAP=36;
  // 글 덩어리: 라벨 → (진행 막대) → 제목 → 원인 → 가는 선.
  const barsH=reason?5+26:0;
  const blockH=eyebrow.info.height+22+barsH+title.layer.info.height+(sub?18+sub.info.height:0)+(chip?26+chipH:0);
  // 사진 높이는 글 양에 맞춘다: 기본 56%(표지 62%)이되, 글 덩어리가 가는 선과 겹치면 그만큼 줄인다(사장님 지적 2026-10-21: 표지 부제가 선과 겹침).
  const wanted=photo?Math.round(H*(content.cover?.62:.56)):0;
  const photoH=photo?Math.min(wanted,footTop-RULE_GAP-24-blockH-44):0;
  const shot=photo?await finishPhoto(photo,W,photoH,{zoom:1.03}):null;
  const area=plain?{top:MARGIN+80,bottom:footTop-RULE_GAP-40}:{top:photoH+44,bottom:footTop-RULE_GAP-24};
  const blockTop=Math.round(area.top+Math.max(0,area.bottom-area.top-blockH)/2);
  const eyebrowTop=blockTop,barsTop=eyebrowTop+eyebrow.info.height+22,titleTop=barsTop+barsH,subTop=titleTop+title.layer.info.height+18;
  const chipTop=(sub?subTop+sub.info.height:titleTop+title.layer.info.height)+26;
  let svg="";
  const layers:OverlayOptions[]=[];
  if(shot){
    layers.push({input:shot,left:0,top:0});
    // 사진 아래 160px은 먹색으로 녹아든다(경계선 없이), 위에는 얇은 그늘(장 번호·로고 자리).
    svg+=`<defs><linearGradient id="hpF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CANVAS}" stop-opacity="0"/><stop offset="1" stop-color="${CANVAS}" stop-opacity="1"/></linearGradient></defs><rect x="0" y="${photoH-160}" width="${W}" height="161" fill="url(#hpF)"/>`;
  }else{
    // 홈페이지 카드의 옅은 큰 원 장식 + 오른쪽 위 따뜻한 빛.
    svg+=`<defs><radialGradient id="hpL" cx="85%" cy="8%" r="70%"><stop offset="0" stop-color="#5A3F2E" stop-opacity=".55"/><stop offset="1" stop-color="${CANVAS}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#hpL)"/>`
      +`<circle cx="${W-120}" cy="${Math.round(H*.36)}" r="330" fill="none" stroke="${INK}" stroke-opacity=".07" stroke-width="2"/>`;
  }
  const marks:OverlayOptions[]=[];
  if(content.cover)marks.push({input:await logoMark(96,"#F5EFE5"),left:MARGIN,top:MARGIN});
  marks.push({input:eyebrow.data,left:MARGIN,top:eyebrowTop});
  if(reason)svg+=progress(MARGIN,barsTop,reason);
  if(chip){svg+=outlinedPill(MARGIN,chipTop,chip.info.width+padX*2,chipH);marks.push({input:chip.data,left:MARGIN+padX,top:chipTop+padY});}
  // 바닥글 위 가는 선.
  svg+=`<rect x="${MARGIN}" y="${footTop-RULE_GAP}" width="${CONTENT_W}" height="2" fill="${LINE}"/>`;
  const footMid=footTop+footH/2;
  marks.push({input:logo,left:MARGIN,top:Math.round(footMid-LOGO/2)});
  if(handle)marks.push({input:handle.data,left:MARGIN+LOGO+16,top:Math.round(footMid-handle.info.height/2)});
  if(cue){const x=W-MARGIN-cue.width,y=Math.round(footMid-cue.height/2);svg+=cue.arrow(x,y);marks.push({input:cue.label.data,left:x,top:y});}
  layers.push(svgLayer(svg),...marks,{input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  return sharp({create:{width:W,height:H,channels:3,background:CANVAS}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

export const renderHomepagePhoto=(photo:Buffer,content:StyleContent,index:number)=>card(photo,content,index);
export const renderHomepageText=(photo:Buffer|undefined,content:StyleContent,index:number)=>card(content.cover?photo:undefined,content,index);
