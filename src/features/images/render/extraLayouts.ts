import sharp, { type OverlayOptions } from "sharp";
import type { CarouselSlidePlan } from "../carousel";
import { STORE_NAME } from "../slideLayout";
import { inkOn, mutedOn, readableOn } from "../design";
import { BODY, CONTENT, DECOR_FONT, FONTS, MARGIN, META, brandName, canvas, cleanPoints, croppedPhoto, currentVariant, grainLayer, pointLayers, renderSlideHeadline, ring, softShadow, sparkles, svgLayer, textLayer, washiTape, wavyUnderline, type CardRenderer } from "./primitives";

// 추가 레이아웃 8종: 잡지 편집형, 반반 분할, 폴라로이드, 영수증, 체크리스트, 타임라인, 큰 글자 포스터, 원형 사진.
// 모두 같은 원칙을 따른다. ① 글자 레이어를 먼저 그려 높이를 잰다 ② 남는 높이에 맞춰 사진·간격을 정한다
// ③ 채널명과 장 번호는 다른 카드와 같은 자리(아래 왼쪽·오른쪽)에 둔다. 장식은 primitives의 테마 함수로 그려
// 게시물 테마(잡지·노트·포스터 등)에 따라 모양이 바뀐다.

const FOOTER_TOP=1286;
const keywordLine=(slide:CarouselSlidePlan)=>slide.keywords.length?slide.keywords.map(word=>`#${word}`).join("  "):STORE_NAME;

// 아래 채널명·장 번호 줄.
async function footer(index:number,total:number,ink:string,muted:string,options:{brandLeft?:number;width?:number}={}):Promise<OverlayOptions[]> {
  const brand=await textLayer(brandName(),{size:META,color:muted,width:500,height:36,font:FONTS.regular});
  const counter=await textLayer(`${index} / ${total}`,{size:META,color:ink,width:200,height:36,font:FONTS.semibold});
  const right=(options.brandLeft??MARGIN)+(options.width??CONTENT);
  return [{input:brand.data,left:options.brandLeft??MARGIN,top:FOOTER_TOP},{input:counter.data,left:right-counter.info.width,top:FOOTER_TOP}];
}

// 11. 잡지 편집형: 위쪽 가득 찬 사진, 아래 작은 머리글(키워드)·큰 제목·가는 선·본문 문단.
const composeMagazine:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.paper,palette),muted=mutedOn(palette.paper,palette);
  const cover=slide.role==="cover";
  const eyebrow=await textLayer(keywordLine(slide),{size:META,color:readableOn(palette.accent,palette.paper),width:CONTENT,height:40,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:cover?66:58,color:ink,align:"left",width:CONTENT,height:240,balance:cover});
  const lines=cleanPoints(slide.points);
  const body=lines.length?await textLayer(lines.join(" "),{size:BODY,color:ink,width:CONTENT,height:260,font:FONTS.regular,spacing:14}):null;
  const textHeight=eyebrow.info.height+18+headline.info.height+(body?30+2+30+body.info.height:0);
  // 글 아래 여백(본문 끝 ~ 채널명 줄)을 40px 남기고 나머지를 사진에 준다.
  const PHOTO_H=Math.max(480,Math.min(820,FOOTER_TOP-40-44-textHeight));
  let cursor=PHOTO_H+44;
  const layers:OverlayOptions[]=[{input:await croppedPhoto(inputs[0],1080,PHOTO_H,0),left:0,top:0},{input:eyebrow.data,left:MARGIN,top:cursor}];
  cursor+=eyebrow.info.height+18;
  layers.push({input:headline.data,left:MARGIN,top:cursor});
  cursor+=headline.info.height;
  if(body){
    // 제목과 본문 사이 가는 선. 짧은 강조색 선과 긴 옅은 선을 겹쳐 잡지 기사의 머리 줄처럼 보이게 한다.
    layers.push(svgLayer(`<path d="M${MARGIN} ${cursor+30}H${1080-MARGIN}" stroke="${ink}" stroke-opacity=".18" stroke-width="2"/><path d="M${MARGIN} ${cursor+30}H${MARGIN+120}" stroke="${palette.accent}" stroke-width="4"/>`));
    layers.push({input:body.data,left:MARGIN,top:cursor+62});
  }
  layers.push(svgLayer(sparkles([[1080-MARGIN-10,PHOTO_H+52,14]],palette.accent)));
  layers.push(...await footer(index,total,ink,muted),await grainLayer({opacity:.12}));
  return canvas(palette.paper,layers);
};

// 12. 반반 분할: 화면 반쪽은 세로 사진, 반쪽은 제목·요점. 변형 1은 사진이 오른쪽에 온다.
const composeSplit:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const photoRight=currentVariant()%2===1;
  const HALF=540,PAD=52,W=HALF-PAD*2;
  const panelX=photoRight?0:HALF,photoX=photoRight?HALF:0;
  const ink=inkOn(palette.paper,palette),muted=mutedOn(palette.paper,palette);
  const cover=slide.role==="cover";
  const eyebrow=await textLayer(keywordLine(slide),{size:META,color:readableOn(palette.accent,palette.paper),width:W,height:80,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:cover?58:50,color:ink,align:"left",width:W,height:420,balance:false});
  const lines=cleanPoints(slide.points);
  const measured=await pointLayers(lines,0,{left:panelX+PAD,width:W,color:ink,markerColor:palette.accent});
  const blockHeight=eyebrow.info.height+20+headline.info.height+(lines.length?40+measured.bottom:0);
  // 글 묶음을 패널 세로 가운데에 둔다(위아래 여백이 같게).
  let cursor=Math.max(96,Math.round((FOOTER_TOP-40-blockHeight)/2));
  const layers:OverlayOptions[]=[{input:await croppedPhoto(inputs[0],HALF,1350,0),left:photoX,top:0}];
  layers.push({input:eyebrow.data,left:panelX+PAD,top:cursor});cursor+=eyebrow.info.height+20;
  layers.push({input:headline.data,left:panelX+PAD,top:cursor});cursor+=headline.info.height;
  layers.push(svgLayer(wavyUnderline({x:panelX+PAD,y:cursor+16,width:Math.min(220,headline.info.width),color:palette.highlight,strokeWidth:6})));
  if(lines.length){const points=await pointLayers(lines,cursor+40,{left:panelX+PAD,width:W,color:ink,markerColor:palette.accent});layers.push(...points.layers);}
  // 사진과 글 사이 경계에 테이프 한 조각.
  layers.push(svgLayer(washiTape({x:HALF-90,y:120,width:180,color:palette.highlight,angle:photoRight?8:-8,opacity:.82})));
  layers.push(...await footer(index,total,ink,muted,{brandLeft:panelX+PAD,width:W}),await grainLayer());
  return canvas(palette.paper,layers);
};

// 13. 폴라로이드: 위에 제목, 가운데 기울어진 폴라로이드 두 장(아래 흰 여백에 손글씨 메모), 아래 요점.
const composePolaroid:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.soft,palette),muted=mutedOn(palette.soft,palette);
  const headline=await renderSlideHeadline(slide.headline,{size:52,color:ink,align:"left",width:CONTENT,height:200,balance:false});
  const lines=cleanPoints(slide.points);
  const measured=await pointLayers(lines,0,{color:ink,markerColor:palette.accent});
  const TOP=MARGIN+headline.info.height+40;
  const pointsHeight=lines.length?measured.bottom+30:0;
  // 폴라로이드 크기는 남는 높이에 맞춘다(사진 정사각형 + 아래 메모 여백).
  const SIDE=Math.max(300,Math.min(470,FOOTER_TOP-40-pointsHeight-TOP-150));
  const BORDER=18,CAPTION=78;
  const make=async(photo:Buffer,caption:string)=>{
    const W=SIDE+BORDER*2,H=SIDE+BORDER+CAPTION;
    const note=caption?await textLayer(caption,{size:34,color:"#2a2a2a",width:W-36,height:56,font:FONTS.bold,align:"centre"}):null;
    return sharp({create:{width:W,height:H,channels:4,background:"#fffdf8"}})
      .composite([{input:await croppedPhoto(photo,SIDE,SIDE,0),left:BORDER,top:BORDER},...(note?[{input:note.data,left:Math.round((W-note.info.width)/2),top:SIDE+BORDER+Math.round((CAPTION-note.info.height)/2)}]:[])])
      .png().toBuffer();
  };
  const cards=[
    {image:await make(inputs[0],slide.keywords[0]??""),angle:-6,x:MARGIN-6,y:TOP},
    {image:await make(inputs[1]??inputs[0],slide.keywords[1]??""),angle:5,x:1080-MARGIN-(SIDE+BORDER*2)+6,y:TOP+70},
  ];
  const layers:OverlayOptions[]=[{input:headline.data,left:MARGIN,top:MARGIN}];
  let bottom=TOP;
  for(const card of cards){
    const tilted=await sharp(card.image).rotate(card.angle,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
    const meta=await sharp(card.image).metadata();
    layers.push(svgLayer(softShadow({x:card.x+8,y:card.y+16,width:meta.width!,height:meta.height!,rx:4,blur:14,opacity:.22,rotate:card.angle})));
    layers.push({input:tilted.data,left:card.x,top:card.y});
    layers.push(svgLayer(washiTape({x:card.x+Math.round(tilted.info.width/2)-80,y:card.y-14,width:160,color:palette.highlight,angle:card.angle*-1.2,opacity:.8})));
    bottom=Math.max(bottom,card.y+tilted.info.height);
  }
  if(lines.length){const points=await pointLayers(lines,Math.max(bottom+30,FOOTER_TOP-40-measured.bottom),{color:ink,markerColor:palette.accent});layers.push(...points.layers);}
  layers.push(svgLayer(sparkles([[1080-MARGIN-20,MARGIN+20,16]],palette.accent)));
  layers.push(...await footer(index,total,ink,muted),await grainLayer());
  return canvas(palette.soft,layers);
};

// 14. 영수증·메뉴판: 사진 없이 가운데 영수증 종이. 가게 이름, 점선, 제목, 번호 매긴 항목, 항목 수 합계, 바코드.
const composeReceipt:CardRenderer=async(_inputs,slide,index,total,palette)=>{
  const W=840,X=Math.round((1080-W)/2),PAD=60,TEXT_W=W-PAD*2;
  const paperInk="#2a2a2a",dim="#7a7a7a";
  const lines=cleanPoints(slide.points);
  const shop=await textLayer(STORE_NAME,{size:34,color:paperInk,width:TEXT_W,height:48,font:FONTS.semibold,align:"centre"});
  const title=await renderSlideHeadline(slide.headline,{size:52,color:paperInk,align:"centre",width:TEXT_W,height:200,balance:true});
  const items=await Promise.all(lines.map(line=>textLayer(line,{size:BODY+4,color:paperInk,width:TEXT_W-80,height:(BODY+4)*3,font:FONTS.regular,spacing:6})));
  const numbers=await Promise.all(lines.map((_,i)=>textLayer(String(i+1).padStart(2,"0"),{size:34,color:readableOn(palette.accent,palette.soft,3),width:70,height:44,font:FONTS.bold})));
  const totalLabel=await textLayer("TOTAL",{size:30,color:paperInk,width:200,height:40,font:DECOR_FONT});
  const totalValue=await textLayer(`${lines.length}가지`,{size:30,color:paperInk,width:200,height:40,font:FONTS.bold});
  const thanks=await textLayer(keywordLine(slide),{size:META,color:dim,width:TEXT_W,height:36,font:FONTS.regular,align:"centre"});
  const ITEM_GAP=36;
  const itemsHeight=items.reduce((sum,item)=>sum+item.info.height+ITEM_GAP,0);
  const H=PAD+shop.info.height+30+title.info.height+40+itemsHeight+30+40+40+70+20+thanks.info.height+PAD;
  const Y=Math.max(70,Math.round((FOOTER_TOP-30-H)/2));
  const dashed=(y:number)=>`<path d="M${X+PAD} ${y}H${X+W-PAD}" stroke="${dim}" stroke-width="2" stroke-dasharray="8 8"/>`;
  // 종이 아래 끝은 톱니 모양으로 찢는다.
  let zig=`M${X} ${Y}H${X+W}V${Y+H}`;
  for(let x=X+W;x>X;x-=26)zig+=`L${x-13} ${Y+H+14}L${Math.max(X,x-26)} ${Y+H}`;
  zig+="Z";
  let cursor=Y+PAD;
  const layers:OverlayOptions[]=[svgLayer(softShadow({x:X,y:Y+10,width:W,height:H,rx:4,blur:16,opacity:.18})+`<path d="${zig}" fill="#fffdf8"/>`)];
  layers.push({input:shop.data,left:X+Math.round((W-shop.info.width)/2),top:cursor});cursor+=shop.info.height+14;
  let svgBody=dashed(cursor);cursor+=16;
  layers.push({input:title.data,left:X+Math.round((W-title.info.width)/2),top:cursor});cursor+=title.info.height+20;
  svgBody+=dashed(cursor);cursor+=20;
  for(const [i,item] of items.entries()){
    layers.push({input:numbers[i].data,left:X+PAD,top:cursor+2},{input:item.data,left:X+PAD+80,top:cursor});
    cursor+=item.info.height+ITEM_GAP;
  }
  svgBody+=dashed(cursor+6);cursor+=30;
  layers.push({input:totalLabel.data,left:X+PAD,top:cursor},{input:totalValue.data,left:X+W-PAD-totalValue.info.width,top:cursor});
  cursor+=40+30;
  // 바코드: 굵기가 다른 세로줄. 장식이라 내용과 무관하게 장 번호로 무늬만 바꾼다.
  let bars="",bx=X+PAD+120;
  for(let i=0;bx<X+W-PAD-120;i++){const w=1+((i*7+index*3)%4);bars+=`<rect x="${bx}" y="${cursor}" width="${w}" height="60" fill="${paperInk}"/>`;bx+=w+3+((i*5)%3);}
  svgBody+=bars;cursor+=70+10;
  layers.push({input:thanks.data,left:X+Math.round((W-thanks.info.width)/2),top:cursor});
  layers.push(svgLayer(svgBody+sparkles([[X-30,Y+40,16],[X+W+28,Y+H-60,12]],palette.accent)));
  layers.push(...await footer(index,total,inkOn(palette.soft,palette),mutedOn(palette.soft,palette)),await grainLayer());
  return canvas(palette.soft,layers);
};

// 15. 체크리스트: 스프링 수첩 위에 제목과 체크 상자 목록, 오른쪽 아래에 키워드 포스트잇.
const composeChecklist:CardRenderer=async(_inputs,slide,index,total,palette)=>{
  const X=MARGIN,W=CONTENT,PAD=56,ink="#2a2a2a";
  const lines=cleanPoints(slide.points);
  const headline=await renderSlideHeadline(slide.headline,{size:50,color:ink,align:"left",width:W-PAD*2,height:200,balance:false});
  const items=await Promise.all(lines.map(line=>textLayer(line,{size:BODY+2,color:ink,width:W-PAD*2-80,height:(BODY+2)*3,font:FONTS.regular,spacing:6})));
  const contentHeight=headline.info.height+40+items.reduce((sum,item)=>sum+Math.max(item.info.height,52)+34,0);
  const Y=110,H=Math.max(700,Math.min(FOOTER_TOP-40-Y,contentHeight+PAD*2+60));
  // 남는 높이를 항목 사이에 나눠 수첩 아래쪽이 비지 않게 한다.
  const extra=Math.max(0,Math.min(60,Math.floor((H-PAD*2-60-contentHeight)/Math.max(1,items.length))));
  let rings="";
  for(let x=X+70;x<X+W-40;x+=74)rings+=`<rect x="${x}" y="${Y-26}" width="16" height="52" rx="8" fill="${palette.ink}" fill-opacity=".7"/>`;
  const layers:OverlayOptions[]=[svgLayer(softShadow({x:X,y:Y+10,width:W,height:H,rx:18,blur:16,opacity:.18})+`<rect x="${X}" y="${Y}" width="${W}" height="${H}" rx="18" fill="#fffdf8"/>`+rings)];
  let cursor=Y+PAD+20;
  layers.push({input:headline.data,left:X+PAD,top:cursor});cursor+=headline.info.height+40;
  let boxes="";
  for(const item of items){
    const rowH=Math.max(item.info.height,52);
    // 체크 상자와 강조색 체크 표시. 줄 아래에 옅은 노트 선.
    boxes+=`<rect x="${X+PAD}" y="${cursor+4}" width="40" height="40" rx="8" fill="none" stroke="${ink}" stroke-width="3"/><path d="M${X+PAD+8} ${cursor+24}l10 11 22-26" fill="none" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
      +`<path d="M${X+PAD} ${cursor+rowH+16}H${X+W-PAD}" stroke="${ink}" stroke-opacity=".12" stroke-width="2"/>`;
    layers.push({input:item.data,left:X+PAD+72,top:cursor+Math.max(0,Math.round((48-Math.min(item.info.height,48))/2))});
    cursor+=rowH+34+extra;
  }
  layers.push(svgLayer(boxes));
  if(slide.keywords[0]){
    const note=await textLayer(`#${slide.keywords[0]}`,{size:30,color:"#2a2a2a",width:200,height:90,font:FONTS.bold,align:"centre"});
    const nx=X+W-230,ny=Y+H-190;
    layers.push(svgLayer(`<g transform="rotate(6 ${nx+100} ${ny+80})"><rect x="${nx+6}" y="${ny+8}" width="200" height="160" fill="#000" fill-opacity=".12"/><rect x="${nx}" y="${ny}" width="200" height="160" fill="${palette.highlight}"/></g>`));
    layers.push({input:note.data,left:nx+Math.round((200-note.info.width)/2),top:ny+Math.round((160-note.info.height)/2)});
  }
  layers.push(...await footer(index,total,inkOn(palette.paper,palette),mutedOn(palette.paper,palette)),await grainLayer());
  return canvas(palette.paper,layers);
};

// 16. 타임라인: 위에 머리글·제목, 왼쪽 세로 선 위에 번호 점, 오른쪽에 각 단계. 남는 높이는 단계 사이로 나눈다.
const composeTimeline:CardRenderer=async(_inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.soft,palette),muted=mutedOn(palette.soft,palette);
  const eyebrow=await textLayer(keywordLine(slide),{size:META,color:readableOn(palette.accent,palette.paper),width:CONTENT,height:40,font:FONTS.semibold});
  const headline=await renderSlideHeadline(slide.headline,{size:54,color:ink,align:"left",width:CONTENT,height:220,balance:false});
  const lines=cleanPoints(slide.points);
  const LINE_X=MARGIN+36,TEXT_X=MARGIN+110,TEXT_W=1080-MARGIN-TEXT_X;
  const steps=await Promise.all(lines.map(line=>textLayer(line,{size:BODY+4,color:ink,width:TEXT_W,height:(BODY+4)*3,font:FONTS.regular,spacing:8})));
  const top=MARGIN+eyebrow.info.height+16+headline.info.height+70;
  const used=steps.reduce((sum,step)=>sum+Math.max(step.info.height,72),0);
  const gap=steps.length>1?Math.max(40,Math.min(150,Math.floor((FOOTER_TOP-60-top-used)/(steps.length-1)))):0;
  const layers:OverlayOptions[]=[{input:eyebrow.data,left:MARGIN,top:MARGIN},{input:headline.data,left:MARGIN,top:MARGIN+eyebrow.info.height+16}];
  let cursor=top,dots="";
  const centers:number[]=[];
  for(const [i,step] of steps.entries()){
    const cy=cursor+36;centers.push(cy);
    const number=await textLayer(String(i+1),{size:34,color:palette.onAccent,width:72,height:46,font:FONTS.bold,align:"centre"});
    dots+=`<circle cx="${LINE_X}" cy="${cy}" r="34" fill="${palette.accent}"/>`;
    layers.push({input:number.data,left:LINE_X-Math.round(number.info.width/2),top:cy-Math.round(number.info.height/2)});
    layers.push({input:step.data,left:TEXT_X,top:cursor+Math.max(0,Math.round((72-step.info.height)/2))});
    cursor+=Math.max(step.info.height,72)+gap;
  }
  const line=centers.length>1?`<path d="M${LINE_X} ${centers[0]}V${centers[centers.length-1]}" stroke="${palette.accent}" stroke-opacity=".45" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round"/>`:"";
  layers.splice(0,0,svgLayer(line+dots+sparkles([[1080-MARGIN-20,MARGIN+16,16]],palette.accent)));
  // 번호 점(svg)은 숫자 레이어보다 먼저 깔려야 하므로 맨 앞에 넣었다.
  layers.push(...await footer(index,total,ink,muted),await grainLayer());
  return canvas(palette.soft,layers);
};

// 17. 큰 글자 포스터: 화면을 채우는 큰 제목, 오른쪽 아래 둥근 사진, 왼쪽 아래 요점.
const composePoster:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.paper,palette),muted=mutedOn(palette.paper,palette);
  const tag=await textLayer(keywordLine(slide),{size:META+2,color:readableOn(palette.accent,palette.paper),width:CONTENT,height:40,font:FONTS.semibold});
  const D=360,CX=1080-MARGIN-D/2,CY=FOOTER_TOP-60-D/2;
  const lines=cleanPoints(slide.points).slice(0,3);
  const points=lines.length?await pointLayers(lines,0,{width:CONTENT-D-40,color:ink,markerColor:palette.accent}):null;
  // 제목은 들어가는 가장 큰 크기를 고른다(위쪽 영역 높이 안에서 128px부터 줄여 본다).
  const room=CY-D/2-40-(MARGIN+tag.info.height+24);
  let headline=await renderSlideHeadline(slide.headline,{size:72,color:ink,align:"left",width:CONTENT,height:room,balance:true});
  for(const size of [128,112,98,86]){
    const candidate=await renderSlideHeadline(slide.headline,{size,color:ink,align:"left",width:CONTENT,height:2000,balance:true});
    if(candidate.info.height<=room){headline=candidate;break;}
  }
  const layers:OverlayOptions[]=[
    {input:tag.data,left:MARGIN,top:MARGIN},
    {input:headline.data,left:MARGIN,top:MARGIN+tag.info.height+24},
    svgLayer(`<path d="M${MARGIN} ${MARGIN+tag.info.height+24+headline.info.height+24}H${MARGIN+180}" stroke="${palette.accent}" stroke-width="10"/>`
      +ring({cx:CX,cy:CY,r:D/2+18,color:palette.accent,strokeWidth:4,dashed:true,opacity:.6})+sparkles([[CX-D/2-20,CY-D/2+10,20]],palette.highlight)),
    {input:await croppedPhoto(inputs[0],D,D,0,{circle:true}),left:CX-D/2,top:CY-D/2},
  ];
  if(points){const placed=await pointLayers(lines,FOOTER_TOP-50-points.bottom,{width:CONTENT-D-40,color:ink,markerColor:palette.accent});layers.push(...placed.layers);}
  layers.push(...await footer(index,total,ink,muted),await grainLayer());
  return canvas(palette.paper,layers);
};

// 18. 원형 사진: 가운데 큰 원형 사진(점선 고리), 아래 가운데 정렬 제목과 요점.
const composeCircle:CardRenderer=async(inputs,slide,index,total,palette)=>{
  const ink=inkOn(palette.soft,palette),muted=mutedOn(palette.soft,palette);
  const headline=await renderSlideHeadline(slide.headline,{size:slide.role==="cover"?60:52,color:ink,align:"centre",width:CONTENT,height:220,balance:true});
  const lines=cleanPoints(slide.points).slice(0,3);
  const measured=await pointLayers(lines,0,{align:"centre",color:ink,markerColor:palette.accent});
  const textHeight=headline.info.height+(lines.length?30+measured.bottom:0);
  const TOP=100;
  const D=Math.max(440,Math.min(660,FOOTER_TOP-40-TOP-50-textHeight));
  const cx=540,cy=TOP+D/2;
  const layers:OverlayOptions[]=[
    svgLayer(ring({cx,cy,r:D/2+22,color:palette.accent,strokeWidth:4,dashed:true,opacity:.5})+sparkles([[cx+D/2+10,cy-D/2+30,20],[cx-D/2-14,cy+D/2-40,13]],palette.accent)
      +softShadow({x:cx-D/2,y:cy-D/2+14,width:D,height:D,rx:D/2,blur:18,opacity:.2})),
    {input:await croppedPhoto(inputs[0],D,D,0,{circle:true}),left:cx-D/2,top:TOP},
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:TOP+D+50},
  ];
  if(lines.length){const points=await pointLayers(lines,TOP+D+50+headline.info.height+30,{align:"centre",color:ink,markerColor:palette.accent});layers.push(...points.layers);}
  layers.push(...await footer(index,total,ink,muted),await grainLayer());
  return canvas(palette.soft,layers);
};

export const EXTRA_RENDERERS={
  magazine:composeMagazine,
  split:composeSplit,
  polaroid:composePolaroid,
  receipt:composeReceipt,
  checklist:composeChecklist,
  timeline:composeTimeline,
  poster:composePoster,
  circle:composeCircle,
} satisfies Record<string,CardRenderer>;
