import sharp, { type OverlayOptions } from "sharp";
import { access } from "node:fs/promises";
import { STORE_NAME } from "../slideLayout";
import { croppedPhoto, mascotLayer, svgLayer, textLayer, type CardRenderer, type Layer, brandName } from "../render/primitives";
import { mascotFile, propLayer, softShadow, type MascotPose, type PropName } from "../decor";
import { MIN_STROKE, STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, rotated, snap } from "./shared";

// 인포그래픽·도감: 모눈종이 바탕에 "홍어 도감 · 03" 표제, 둥근 사진에서 점선 지시선을 뽑아 부위·특징 설명을 단다.
// 사진이 없는 장은 요점을 단계(1단계 → 2단계 …)로 이어 붙인 점선 흐름도로, 두 장이면 A·B 비교 도감으로 그린다.
// 구석에 마스코트를 작게 넣어 도감 속 귀여운 일러스트 역할을 맡긴다.
const PAPER="#F6F5EE",GRID="#CFE0D8",GRID_MAJOR="#A9C9BC",INK="#22313F",ACCENT="#C8401A",SOFT="#FFF3C4";

// 모눈: 30px 잔선 + 5칸(150px)마다 굵은 선. 잔선이 굵은 선과 거의 같은 농도면 바탕이 촘촘한 철망처럼 보여 글자·사진이 묻힌다.
// 잔선은 옅게(.6) 깔아 "종이 결" 정도로만, 굵은 선이 칸 구획을 맡게 한다.
function graphPaper():string {
  let d="",D="";
  for(let x=0;x<=1080;x+=30){if(x%150===0)D+=`M${x} 0V1350`;else d+=`M${x} 0V1350`;}
  for(let y=0;y<=1350;y+=30){if(y%150===0)D+=`M0 ${y}H1080`;else d+=`M0 ${y}H1080`;}
  return `<path d="${d}" stroke="${GRID}" stroke-opacity=".6" stroke-width="1"/><path d="${D}" stroke="${GRID_MAJOR}" stroke-opacity=".85" stroke-width="1.8"/>`;
}
// 포즈 그림 파일이 있을 때만 그 포즈를 쓴다(없으면 mascotLayer가 hello로 바꾸는데, 본문 장의 "설명하는" 느낌이 사라진다).
const poseReady=new Map<MascotPose,Promise<boolean>>();
async function poseOr(wanted:MascotPose,fallback:MascotPose):Promise<MascotPose> {
  if(!poseReady.has(wanted))poseReady.set(wanted,access(mascotFile(wanted)).then(()=>true,()=>false));
  return await poseReady.get(wanted)!?wanted:fallback;
}
// 지시선 설명마다 붙일 수 있는 소품 아이콘(자산이 있을 때만). 순서대로 1·2·3번 설명.
const LABEL_PROPS:PropName[]=["chopsticks","makgeolli","kimchi"];
// 첫 크기부터 그려 보고 높이 합이 room 안에 드는 첫 크기의 레이어들. 다 넘치면 가장 작은 크기.
// 명함이 자리를 차지하는 마지막 장에서 요점 수를 줄이지 않고 글자를 한 단계 줄이는 데 쓴다.
async function stackAt(values:string[],sizes:number[],room:number,gap:number,draw:(value:string,size:number)=>Promise<Layer>):Promise<Layer[]> {
  let layers:Layer[]=[];
  for(const size of sizes){
    layers=await Promise.all(values.map(value=>draw(value,size)));
    if(layers.reduce((sum,layer)=>sum+layer.info.height+gap,0)<=room)break;
  }
  return layers;
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
  // 사진 위에 와야 하는 표시(지시선 시작점의 빨간 점·지시선·원 둘레 배지·도장). deco는 사진 아래에 깔리므로 따로 모아 사진 다음에 얹는다.
  let over="";
  const texts:Array<{value:string;cx:number;cy:number;size:number;color?:string;rotate?:number}>=[];
  // 표제: 왼쪽 위 도감 번호 꼬리표("홍어 도감 · 03", 장 번호만), 그 아래 제목.
  const tag=await textLayer(`홍어 도감  ·  ${String(index).padStart(2,"0")}`,{size:30,color:"#FFFFFF",width:600,height:50,font:STYLE_FONTS.comic,features:"tnum"});
  deco+=`<rect x="${M}" y="${M}" width="${tag.info.width+40}" height="${tag.info.height+20}" rx="6" fill="${INK}"/>`;
  layers.push({input:tag.data,left:M+20,top:M+10});
  const kw=await textLayer(content.keywords.map(word=>`#${word}`).join("  ")||STORE_NAME,{size:26,color:INK,width:420,height:44,font:STYLE_FONTS.sansSemi,align:"centre"});
  layers.push({input:kw.data,left:1080-M-kw.info.width,top:M+16});
  let y=M+tag.info.height+50;
  // 제목 핵심어는 밑줄과 같은 주홍(모눈 바탕 위 약 4.6:1).
  const title=await fitText(content.headline,{sizes:content.cover?[84,74,66]:[64,58,52],width:W,maxHeight:content.cover?260:190,color:INK,font:STYLE_FONTS.comic,spacing:6,emphasis:emphasisOf(content,ACCENT)});
  layers.push({input:title.data,left:M,top:y});
  y+=title.info.height+12;
  deco+=`<path d="M${M} ${y}H${M+Math.min(W,title.info.width)}" stroke="${ACCENT}" stroke-width="6"/>`;
  y+=40;
  // 표지 부제: 밑줄 아래 도감 "설명 줄" — 왼쪽 주홍 세로 막대 + 한 줄(34px). 두 줄을 넘으면 뺀다.
  if(content.subline){
    const sub=await textLayer(content.subline,{size:34,color:INK,width:W-24,height:4000,font:STYLE_FONTS.sansSemi,spacing:6});
    if(sub.info.height<=100){
      const top=y-16;
      deco+=`<rect x="${M}" y="${top+4}" width="7" height="${sub.info.height-8}" fill="${ACCENT}"/>`;
      layers.push({input:sub.data,left:M+24,top});
      y=top+sub.info.height+34;
    }
  }
  const footerTop=1350-90;
  const pairCover=content.cover&&inputs.length>=2;
  // 아래쪽 예약: 표지는 "수록" 표본 라벨(예고 띠), 마지막 장은 "채집처" 명함 카드. 사진·요점은 그 위(bottom)까지만 쓴다.
  const teaserTag=content.teaser?await textLayer("수록",{size:26,color:"#FFFFFF",width:120,height:44,font:STYLE_FONTS.comic}):null;
  const teaser=teaserTag?await textLayer(content.teaser,{size:26,color:INK,width:W-260,height:44,font:STYLE_FONTS.sansSemi}):null;
  const LABEL_PAD=12,labelH=teaser?teaser.info.height+LABEL_PAD*2:0;
  const card=content.last?await closingBlock({width:W-240,color:INK,accent:ACCENT,font:STYLE_FONTS.comic}):null;
  const CARD_PAD=26,cardH=card?card.height+CARD_PAD*2:0;
  const cardTop=footerTop-18-cardH,labelTop=footerTop-16-labelH;
  const bottom=card?cardTop-30:teaser?labelTop-24:footerTop;
  const points=content.points.slice(0,inputs.length===1?3:4);
  if(inputs.length===1){
    // 둥근 사진 + 오른쪽 지시선 설명(최대 3개). 표지는 사진을 가운데 크게, 설명 대신 "관찰 기록" 도장.
    // 원과 설명 묶음을 남은 공간의 세로 가운데에 둔다(아래가 휑하게 비지 않도록).
    // 표지 원 지름은 제목 아래 남는 높이에서 역산한다(위 20 + 테두리 12×2 + 아래 30). 상한 760(R 380):
    // 820이면 바닥글 위 여백이 0이 된다. 긴 제목이면 원이 저절로 작아지고 제목은 줄이지 않는다.
    const R=content.cover?Math.max(240,Math.min(380,Math.floor((bottom-30-(y+20)-24)/2))):Math.min(240,Math.round((bottom-y-60)/2));
    const cx=content.cover?540:M+R,cy=content.cover?Math.min(y+20+12+R,bottom-R-12-30):Math.round((y+bottom-20)/2);
    deco+=`<circle cx="${cx+10}" cy="${cy+12}" r="${R+12}" fill="${INK}" opacity=".15"/><circle cx="${cx}" cy="${cy}" r="${R+12}" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
    // 원에 접시 전체가 들어가면 음식이 손톱만 해져서 1.2배 접사로 음식 결이 보이게 자른다.
    layers.push({input:await croppedPhoto(inputs[0],R*2,R*2,0,{circle:true,zoom:1.2}),left:cx-R,top:cy-R});
    if(content.cover){
      // "관찰 기록" 도장은 원 밖, 원을 감싼 네모의 왼쪽 위 빈 모서리에 둔다(-12° 기울이면 오른쪽 아래 모서리가 원에서 멀어진다).
      const sw=210,sh=64,sx=M+sw/2,sy=cy-R-12+sh/2+4;
      over+=`<g transform="rotate(-12 ${sx} ${sy})"><rect x="${sx-sw/2}" y="${sy-sh/2}" width="${sw}" height="${sh}" rx="8" fill="${PAPER}" fill-opacity=".85" stroke="${ACCENT}" stroke-width="5"/></g>`;
      texts.push({value:"관찰 기록",cx:sx,cy:sy,size:32,color:ACCENT,rotate:-12});
    }else{
      const LX=cx+R+60,LW=1080-M-LX+20;
      // 설명 글자는 40px(폰에서 읽히는 본문 하한). 명함이 있는 마지막 장에서 쌓은 높이가 남는 높이를 넘으면 36px로 한 단계 줄인다.
      // 설명 묶음이 원 높이 안에 들어가면 고르게 나눠 놓고, 넘치면 위에서부터 차례로 쌓는다.
      const labels=await stackAt(points,card?[40,36]:[40],bottom-y,36,(point,size)=>textLayer(point,{size,color:INK,width:LW-40,height:200,font:STYLE_FONTS.sansSemi,spacing:6}));
      const span=R*2+20,step=labels.length>1?span/(labels.length):span;
      const stackH=labels.reduce((sum,label)=>sum+label.info.height+36,0);
      const sequential=stackH>span;
      let stackY=Math.max(y,Math.min(Math.round(cy-stackH/2),bottom-stackH+36));
      for(const [i,label] of labels.entries()){
        const ly=sequential?stackY:Math.round(cy-R+step*i+step/2-label.info.height/2);
        stackY+=label.info.height+36;
        const a=-Math.PI/3+(i*(Math.PI*2/3))/Math.max(1,labels.length-1||1);
        const ex=Math.round(cx+Math.cos(labels.length>1?a:0)*R*.75),ey=Math.round(cy+Math.sin(labels.length>1?a:0)*R*.75);
        // 지시선은 원 안 음식 위의 한 점에서 시작해 번호 배지 테두리(반지름 20)에서 멈춘다(배지 위로 지나가면 번호가 묻힌다).
        // 흰 바탕선을 먼저 깔아 어두운 사진 위에서도 점선이 보이게.
        const leader=`M${ex} ${ey}L${LX-50} ${ly+label.info.height/2}H${LX-34}`;
        over+=`<path d="${leader}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="6" stroke-linecap="round"/><path d="${leader}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-dasharray="6 6"/><circle cx="${ex}" cy="${ey}" r="9" fill="${ACCENT}" stroke="#fff" stroke-width="3"/>`;
        const b=badge(LX-14,ly+label.info.height/2,20,String(i+1));
        deco+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy,size:24,color:"#fff"});
        deco+=`<rect x="${LX+14}" y="${ly-10}" width="${label.info.width+28}" height="${label.info.height+20}" rx="10" fill="${SOFT}" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
        layers.push({input:label.data,left:LX+28,top:ly});
        // 소품 아이콘은 설명 상자 오른쪽에 남는 자리가 있을 때만(자리를 만들려고 설명 폭을 줄이지 않는다).
        const propX=LX+14+label.info.width+28+12,propW=Math.min(72,1080-M+20-propX);
        if(propW>=56){
          const prop=await propLayer(LABEL_PROPS[i%LABEL_PROPS.length],{width:propW,maxHeight:label.info.height+20,left:propX,top:ly-10});
          if(prop)layers.push(prop);
        }
      }
    }
  }else if(inputs.length>=2){
    if(content.cover){
      // 표지 비교: 아래 목록이 없으니 원 두 개를 대각선으로 크게 겹쳐(A 왼쪽 위, B 오른쪽 아래) 남는 높이를 채운다.
      // 반지름은 남는 높이에서 역산하고, 두 원이 세로로 어긋나도록 높이의 약 70%만 지름에 쓴다.
      const H=bottom-30-(y+20);
      const R=Math.max(200,Math.min(300,Math.floor((H-24)/2*.7)));
      for(const [i,shot] of inputs.slice(0,2).entries()){
        const cx=i?1080-M-R-12:M+R+12,cy=i?bottom-30-R-12:y+20+R+12;
        deco+=`<circle cx="${cx+10}" cy="${cy+12}" r="${R+12}" fill="${INK}" opacity=".15"/><circle cx="${cx}" cy="${cy}" r="${R+12}" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
        layers.push({input:await croppedPhoto(shot,R*2,R*2,0,{circle:true,zoom:1.2}),left:cx-R,top:cy-R});
        // 배지는 원 둘레의 비어 있는 위쪽 모서리(A는 왼쪽 위, B는 오른쪽 위)에 둬 겹친 부분을 가리지 않게.
        const bx=cx+(i?1:-1)*Math.round(R*.72),by=cy-Math.round(R*.72);
        const b=badge(bx,by,40,i?"B":"A",i?"#3A86FF":ACCENT);
        over+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy,size:42,color:"#fff"});
      }
    }else{
      // A·B 비교 도감: 두 원형 사진과 아래 특징 목록. 목록 높이를 먼저 재고 원 반지름을 남는 높이에서 역산한다(215 → 최소 150).
      // 명함이 있는 마지막 장은 원을 먼저 줄이고, 그래도 넘치면 목록 글자를 36px로.
      const lines=await stackAt(points,card?[40,36]:[40],bottom-20-y-70-300,34,(point,size)=>textLayer(point,{size,color:INK,width:W-110,height:130,font:STYLE_FONTS.sansSemi,spacing:6}));
      const listH=lines.reduce((sum,line)=>sum+line.info.height+34,0);
      const R=Math.max(150,Math.min(215,Math.floor((bottom-20-y-70-listH)/2)-10));
      for(const [i,shot] of inputs.slice(0,2).entries()){
        const cx=i?1080-M-R-30:M+R+30,cy=y+R+10;
        deco+=`<circle cx="${cx}" cy="${cy}" r="${R+10}" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
        layers.push({input:await croppedPhoto(shot,R*2,R*2,0,{circle:true,zoom:1.2}),left:cx-R,top:cy-R});
        const b=badge(cx-R+20,cy-R+20,34,i?"B":"A",i?"#3A86FF":ACCENT);
        over+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy,size:36,color:"#fff"});
      }
      deco+=dashedArrow(540-60,y+R+10,540+60,y+R+10);
      y+=R*2+70;
      for(const [i,line] of lines.entries()){
        if(y+line.info.height>bottom-20)break;
        const b=badge(M+26,y+line.info.height/2,22,String(i+1));
        deco+=b.svg+`<path d="M${M+70} ${y+line.info.height+14}H${1080-M}" stroke="${GRID_MAJOR}" stroke-width="${MIN_STROKE}" stroke-dasharray="4 6"/>`;
        texts.push({value:b.label,cx:b.cx,cy:b.cy,size:24,color:"#fff"});
        layers.push({input:line.data,left:M+70,top:y});
        y+=line.info.height+34;
      }
    }
  }else{
    // 단계 흐름도: 왼쪽 세로 점선 위에 단계 번호, 오른쪽에 설명 카드. 단계 사이는 화살표.
    // 명함이 있는 마지막 장은 카드 글자를 44 → 40 → 36으로 줄여 단계 수를 지킨다.
    const room=(card?bottom:footerTop-160)-y-40*Math.max(0,points.length-1);
    const cards=await stackAt(points,card?[44,40,36]:[44],room,44,(point,size)=>textLayer(point,{size,color:INK,width:W-260,height:160,font:STYLE_FONTS.sansSemi,spacing:8}));
    const cardsH=cards.reduce((sum,item)=>sum+item.info.height+44,0);
    const gap=cards.length>1?Math.max(40,Math.min(170,Math.floor(((card?bottom:footerTop-160)-y-cardsH)/(cards.length-1)))):0;
    for(const [i,item] of cards.entries()){
      const h=item.info.height+44,cy=y+h/2;
      const b=badge(M+60,cy,46,`${i+1}`);
      deco+=b.svg;texts.push({value:b.label,cx:b.cx,cy:b.cy-6,size:40,color:"#fff"});
      texts.push({value:"단계",cx:b.cx,cy:b.cy+24,size:18,color:"#fff"});
      deco+=`<rect x="${M+140}" y="${y}" width="${W-140}" height="${h}" rx="16" fill="${i%2?"#fff":SOFT}" stroke="${INK}" stroke-width="3"/>`;
      layers.push({input:item.data,left:M+170,top:y+22});
      if(i<cards.length-1)deco+=dashedArrow(M+60,cy+50,M+60,cy+h/2+gap+h/2-50);
      y+=h+gap;
    }
  }
  // 표지 예고 띠: 표본에 매다는 꼬리표 모양 라벨(왼쪽 끈 구멍 + 점선 안쪽 테두리). 검은 "수록" 칸 + 뒤에 나올 장 이름.
  // 사진 두 장 표지는 마스코트가 왼쪽 아래에 서므로 라벨을 오른쪽에 붙인다.
  if(teaser&&teaserTag){
    const labelW=34+teaserTag.info.width+24+20+teaser.info.width+24;
    const lx=pairCover?1080-M-labelW:M;
    // 얇은 그림자: 종이 위에 놓인 표본 라벨 한 장(그림자가 진하면 모눈 위에서 떠 보인다).
    deco+=softShadow({x:lx,y:labelTop+4,width:labelW,height:labelH,rx:8,blur:4,opacity:.24})
      +`<rect x="${lx}" y="${labelTop}" width="${labelW}" height="${labelH}" rx="8" fill="#fff" stroke="${INK}" stroke-width="3"/>`
      +`<circle cx="${lx+17}" cy="${labelTop+labelH/2}" r="6" fill="${PAPER}" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`
      +`<rect x="${lx+34}" y="${labelTop+6}" width="${teaserTag.info.width+24}" height="${labelH-12}" rx="4" fill="${INK}"/>`;
    layers.push({input:teaserTag.data,left:lx+46,top:labelTop+Math.round((labelH-teaserTag.info.height)/2)});
    layers.push({input:teaser.data,left:lx+34+teaserTag.info.width+24+20,top:labelTop+Math.round((labelH-teaser.info.height)/2)});
  }
  // 마지막 장 명함: 도감 끝장의 "채집처" 표본 카드. 흰 카드 + 점선 안쪽 테두리, 왼쪽 위에 걸친 "채집처" 꼬리표,
  // 오른쪽 안에 손 흔드는 마스코트(도감 삽화), 남은 폭 가운데에 가게 이름·계정·저장 알약.
  let mascotOnCard=false;
  if(card){
    deco+=`<rect x="${M+8}" y="${cardTop+10}" width="${W}" height="${cardH}" rx="12" fill="${INK}" opacity=".15"/>`
      +`<rect x="${M}" y="${cardTop}" width="${W}" height="${cardH}" rx="12" fill="#fff" stroke="${INK}" stroke-width="3"/>`
      +`<rect x="${M+10}" y="${cardTop+10}" width="${W-20}" height="${cardH-20}" rx="8" fill="none" stroke="${GRID_MAJOR}" stroke-width="${MIN_STROKE}" stroke-dasharray="8 6"/>`;
    const site=await textLayer("채집처",{size:26,color:"#FFFFFF",width:200,height:44,font:STYLE_FONTS.comic});
    deco+=`<rect x="${M+24}" y="${cardTop-site.info.height/2-8}" width="${site.info.width+28}" height="${site.info.height+16}" rx="6" fill="${ACCENT}" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
    layers.push({input:site.data,left:M+38,top:Math.round(cardTop-site.info.height/2)});
    const bye=await mascotLayer({width:150,pose:"bye",left:1080-M-24,top:cardTop+cardH-14,anchor:"bottom-right",maxHeight:cardH-28});
    if(bye){layers.push(bye);mascotOnCard=true;}
    const centreX=M+(W-(mascotOnCard?170:0))/2;
    let cy=cardTop+CARD_PAD;
    layers.push({input:card.wordmark.data,left:Math.round(centreX-card.wordmark.info.width/2),top:cy});
    cy+=card.wordmark.info.height;
    if(card.handle){
      cy+=8;
      layers.push({input:card.handle.data,left:Math.round(centreX-card.handle.info.width/2),top:cy});
      cy+=card.handle.info.height;
    }
    cy+=18+12;
    const chipX=Math.round(centreX-card.chip.info.width/2);
    deco+=card.chipSvg(chipX,cy);
    layers.push({input:card.chip.data,left:chipX,top:cy});
  }
  // 오른쪽 아래 작은 마스코트(도감 삽화). 마지막 장은 명함 카드 안의 마스코트가 대신한다.
  // 표지 비교(원 두 개)는 B 원이 오른쪽 아래를 차지하므로 비어 있는 왼쪽 아래로 옮긴다(바닥글 글자 위, 구분선 위에 세운다).
  const mascot=card?null:await mascotLayer({width:150,pose:content.cover?"hello":await poseOr("point","tip"),left:pairCover?M-10:1080-M+10,top:pairCover?footerTop+6:footerTop+40,anchor:pairCover?"bottom-left":"bottom-right",maxHeight:200});
  const showMascot=!!mascot&&(inputs.length!==1||content.cover);
  if(mascot&&showMascot)layers.push(mascot);
  deco+=`<path d="M${M} ${footerTop+14}H${1080-M}" stroke="${INK}" stroke-width="${MIN_STROKE}"/>`;
  // 바닥글: 가게 이름(+계정) · 장 번호(tnum). 마지막 장은 명함에 계정이 있으니 가게 이름만.
  const folio=await textLayer(`${content.last?STORE_NAME:brandName()}  ·  ${index} / ${total}`,{size:26,color:INK,width:700,height:40,font:STYLE_FONTS.sansSemi,features:"tnum"});
  layers.push({input:folio.data,left:M,top:footerTop+30});
  // 넘겨 보기: 바닥글 줄 오른쪽. 마스코트가 오른쪽 아래에 서 있으면 그 왼쪽으로 비켜 둔다.
  if(!content.cover&&!content.last){
    const cue=await nextCue(INK,26);
    const right=mascot&&showMascot&&!pairCover?mascot.left-16:1080-M;
    const cueX=Math.round(right-cue.width),cueY=footerTop+30+Math.round((folio.info.height-cue.height)/2);
    layers.push({input:cue.label.data,left:cueX,top:cueY});
    deco+=cue.arrow(cueX,cueY);
  }
  if(over)layers.push(svgLayer(over));
  // 원 안·배지 위 글자는 가운데 정렬해서 마지막에 얹는다.
  for(const text of texts){
    let layer=await textLayer(text.value,{size:text.size,color:text.color??INK,width:300,height:text.size*2,font:STYLE_FONTS.heavy,align:"centre"});
    // 도장 글자는 도장 테두리와 같은 각도로 기울인다.
    if(text.rotate)layer=await rotated(layer.data,text.rotate);
    layers.push({input:layer.data,left:Math.round(text.cx-layer.info.width/2),top:Math.round(text.cy-layer.info.height/2)});
  }
  layers.unshift(svgLayer(deco));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
