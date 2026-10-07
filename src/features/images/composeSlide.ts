import { enhancePhoto, foodLookOf, type PhotoKind } from "./render/photoEnhance";
import { registerDecor, registerPhoto, auditRender, describeIssue, type AuditReport } from "./render/audit";
import sharp, { type OverlayOptions } from "sharp";
import { access } from "node:fs/promises";
import type { CarouselSlidePlan } from "./carousel";
import { DEFAULT_SLIDE_LAYOUT, STORE_NAME, slideEyebrow, type SlideLayout } from "./slideLayout";
import { type CardLayout, type DesignSpecInput, type Palette, inkOn, mutedOn, normalizeCardLayout, paletteOf, photosNeeded, readableOn } from "./design";
import { resolveSlideFonts, typographyOf } from "./typography";
import { CONTENT, DECOR_FONT, FONTS, MARGIN, META, blob, brandName, cleanPoints, cornerMarks, croppedPhoto, currentVariant, finishPhoto, dotGrid, grainLayer, mascotLayer, photoOverlayLayer, pointLayers, ring, softShadow, sparkles, svg, svgLayer, textLayer, washiTape, wavyUnderline, withRenderContext } from "./render/primitives";
import { BODY_TITLE, COVER_TITLE, EXTRA_RENDERERS, POINT, closingPlan, fillerProp, fillerProps, counterLayer, cueAt, footerPlan, isCover, isLast, cardShadow, mascotContact, photoWell, slideTitle, sublineLayer, teaserLayer, texturedCanvas } from "./render/extraLayouts";
import { ROLE_POSES, type MascotPose } from "./decor";
import { STYLE_RENDERERS } from "./styles";
import { MIN_STROKE } from "./styles/shared";

// 공용 그리기 도구는 render/primitives.ts에 있다. 테스트와 다른 화면이 쓰던 이름은 여기서도 그대로 내보낸다.
export { FONTS, balanceHeadline, renderSlideHeadline, renderSlidePoints } from "./render/primitives";

// 장 역할에 맞는 마스코트 포즈(decor의 ROLE_POSES). 표에 없는 역할은 레이아웃이 원래 쓰던 포즈로 둔다.
// 포즈 파일이 아직 없으면 mascotLayer가 hello로 대신 그린다.
const poseFor=(slide:CarouselSlidePlan,fallback:MascotPose):MascotPose=>ROLE_POSES[slide.role]??fallback;

// 1. 감성 풀스크린: 사진이 화면을 채우고, 위 오른쪽에 작은 채널명, 아래 가운데에 작은 부제와 굵은 흰 제목.
// 장식: 네 귀퉁이 크롭 마크, 제목 옆 작은 반짝이, 필름 그레인.
// 표지: 제목 아래 부제(36px), 바닥 근처 예고 띠(26px). 본문 장: 오른쪽 아래 넘겨 보기. 마지막 장: 글 묶음 아래 가게 명함.
async function composeFullscreen(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const white="#ffffff";
  const cover=isCover(slide),last=isLast(slide,index,total);
  const brand=await textLayer(brandName(),{size:META,color:"#fffffff2",width:CONTENT,height:40,font:FONTS.semibold,shadow:true});
  const corner=cover
    ? await textLayer("음식 이야기",{size:META,color:"#fffffff2",width:400,height:40,font:FONTS.semibold,shadow:true})
    : await counterLayer(index,total,"#fffffff2",true);
  // 표지 제목은 의미 단위·균형 줄바꿈으로 나눈다. 본문 장도 균형 줄바꿈(fitText)으로 마지막 줄이 짧게 남지 않게 한다.
  // 변형 0: 아래 가운데 정렬(기존). 변형 1: 위 왼쪽 정렬, 위쪽을 어둡게 깔고 제목 아래 강조색 짧은 선.
  const topLeft=currentVariant()%2===1;
  const align=topLeft?"left" as const:"centre" as const;
  const headline=await slideTitle(slide,{sizes:cover?COVER_TITLE:BODY_TITLE,color:white,accent:palette.highlight,align,maxHeight:cover?460:280});
  const subline=await sublineLayer(slide,{color:"#fffffff0",align,shadow:true});
  const teaser=await teaserLayer(slide,total,"#fffffff2",true);
  const lines=cleanPoints(slide.points).slice(0,3);
  const sub=lines.length?await textLayer(lines.join("\n"),{size:POINT,color:"#ffffffe6",width:CONTENT,height:400,font:FONTS.regular,align,spacing:10,shadow:true}):null;
  const closing=last?await closingPlan({color:white,accent:palette.accent}):null;
  const cue=!cover&&!last?await cueAt(white,{backdrop:true}):null;
  const layers:OverlayOptions[]=[];
  let headlineTop:number,subTop:number,cueSvg="";
  // 넘겨 보기 글자는 알약 배경(SVG) 위에 얹어야 하므로 따로 모았다가 맨 뒤에 올린다.
  const cueLayers:OverlayOptions[]=[];
  // 아래 구석 줄(변형 1의 채널명·장 번호, 변형 0의 예고 띠·넘겨 보기)의 위치.
  const CORNER_Y=1350-100;
  if(topLeft){
    // 위쪽 제목용 그림자 + 아래 구석의 장 번호·가게 이름이 밝은 사진에서도 읽히도록 바닥에 옅은 그림자.
    headlineTop=150;
    const sublineTop=headlineTop+headline.info.height+44;
    subTop=sublineTop+(subline?subline.info.height+28:0);
    const shadeEnd=Math.min(.75,(subTop+(sub?sub.info.height:0)+200)/1350);
    // 마지막 장은 명함이 바닥 줄 위에 놓이므로 아래 그림자를 더 넓고 짙게 깐다.
    const footStart=closing?Math.max(.4,(CORNER_Y-36-closing.height-160)/1350):.8;
    layers.push(svgLayer(`<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset="${shadeEnd.toFixed(2)}" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset="${footStart.toFixed(2)}" stop-color="#000" stop-opacity="0"/>${closing?`<stop offset="${((CORNER_Y-36-closing.height)/1350).toFixed(2)}" stop-color="#000" stop-opacity=".72"/>`:""}<stop offset="1" stop-color="#000" stop-opacity="${closing?.8:.6}"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#shade)"/><rect width="1080" height="1350" fill="url(#foot)"/>`
      +`<path d="M${MARGIN} ${headlineTop+headline.info.height+18}H${MARGIN+140}" stroke="${palette.highlight}" stroke-width="6" stroke-linecap="round"/>`));
    if(subline)layers.push({input:subline.data,left:MARGIN,top:sublineTop});
    if(closing)layers.push(...closing.place(540,CORNER_Y-36-closing.height));
    // 채널명은 왼쪽 아래, 오른쪽 아래는 장 번호(본문 장은 장 번호 + 넘겨 보기, 표지는 예고 띠).
    layers.push({input:brand.data,left:MARGIN,top:CORNER_Y});
    if(teaser)layers.push({input:teaser.data,left:MARGIN,top:CORNER_Y-teaser.info.height-14});
    else if(cue&&brand.info.width+32+corner.info.width+24+cue.width<=CONTENT){
      const placed=cue.place(1080-MARGIN-cue.width,CORNER_Y+4);cueLayers.push(placed.layer);cueSvg+=placed.svg;
      layers.push({input:corner.data,left:1080-MARGIN-cue.width-24-corner.info.width,top:CORNER_Y});
    }else if(cue){
      const placed=cue.place(1080-MARGIN-cue.width,CORNER_Y-cue.height-14);cueLayers.push(placed.layer);cueSvg+=placed.svg;
      if(brand.info.width+32+corner.info.width<=CONTENT)layers.push({input:corner.data,left:1080-MARGIN-corner.info.width,top:CORNER_Y});
    }else if(brand.info.width+32+corner.info.width<=CONTENT)layers.push({input:corner.data,left:1080-MARGIN-corner.info.width,top:CORNER_Y});
  }else{
    // 아래에서 위로 쌓는다: (예고 띠·넘겨 보기 줄) → 명함 → 부제 → 제목 → 요점.
    const BOTTOM=(teaser||cue?CORNER_Y-28:1350-116)-(closing?closing.height+40:0);
    const sublineTop=subline?BOTTOM-subline.info.height:BOTTOM;
    headlineTop=(subline?sublineTop-24:BOTTOM)-headline.info.height;
    subTop=sub?headlineTop-22-sub.info.height:headlineTop;
    // 글자 블록이 차지하는 만큼 아래쪽 그라데이션을 넓힌다.
    const shadeStart=Math.max(.3,(subTop-160)/1350);
    // 제목 위쪽 끝부터는 충분히 어둡게(.7): 표지 제목이 예고 띠·부제만큼 올라가도 흰 사진에서 3:1을 지킨다.
    const solid=Math.min(.97,Math.max(shadeStart+.05,(headlineTop-10)/1350));
    layers.push(svgLayer(`<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="${shadeStart.toFixed(2)}" stop-color="#000" stop-opacity="0"/><stop offset="${solid.toFixed(2)}" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></linearGradient><linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".14" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#shade)"/><rect width="1080" height="1350" fill="url(#top)"/>`));
    if(subline)layers.push({input:subline.data,left:Math.round((1080-subline.info.width)/2),top:sublineTop});
    if(closing)layers.push(...closing.place(540,BOTTOM+40));
    if(teaser)layers.push({input:teaser.data,left:Math.round((1080-teaser.info.width)/2),top:CORNER_Y});
    if(cue){const placed=cue.place(1080-MARGIN-cue.width,CORNER_Y);cueLayers.push(placed.layer);cueSvg+=placed.svg;}
    layers.push({input:corner.data,left:MARGIN,top:64},{input:brand.data,left:1080-MARGIN-brand.info.width,top:64});
  }
  const left=(layer:{info:{width:number}})=>topLeft?MARGIN:Math.round((1080-layer.info.width)/2);
  layers.push(
    svgLayer(cornerMarks({inset:34,length:46,color:white,opacity:.55})+cueSvg),
    {input:headline.data,left:left(headline),top:headlineTop},
    ...cueLayers,
  );
  if(sub)layers.push({input:sub.data,left:left(sub),top:subTop});
  // 제목 블록 바깥에 반짝이를 하나씩. 글자와 겹치지 않게 둔다.
  const headlineLeft=left(headline);
  layers.push(svgLayer(topLeft
    ?sparkles([[Math.min(1040,headlineLeft+headline.info.width+34),headlineTop+20,16]],palette.highlight,.95)
    :sparkles([[Math.max(40,headlineLeft-38),subTop-30,16],[Math.min(1040,headlineLeft+headline.info.width+34),headlineTop+headline.info.height-10,11]],palette.highlight,.95)));
  // 사진이 화면을 채우는 장은 그레인을 옅게(.2→.1): soft-light 알갱이가 음식 결의 미세 대비를 깎는다.
  layers.push(photoOverlayLayer(),await grainLayer({opacity:.1}));
  return sharp(await finishPhoto(inputs[0],1080,1350)).composite(layers).jpeg({quality:90}).toBuffer();
}

// 2. 대조 프레임: 같은 사진을 흐리고 어둡게 깔고, 가운데 얇은 흰 테두리 프레임 안에 선명한 장면. 아래에 흰 제목과 설명.
// 장식: 프레임 뒤 부드러운 그림자, 양쪽 모서리에 마스킹 테이프, 필름 그레인.
// 표지는 제목 아래 부제와 바닥 예고 띠, 마지막 장은 설명 아래 가게 명함. 자리가 모자라면 사진 창 높이를 먼저 줄인다.
async function composeFrame(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const white="#ffffff";
  const cover=isCover(slide),last=isLast(slide,index,total);
  const headline=await slideTitle(slide,{sizes:cover?COVER_TITLE:BODY_TITLE,color:white,accent:palette.highlight,align:"centre",maxHeight:cover?340:240});
  const subline=await sublineLayer(slide,{color:"#fffffff0",align:"centre",shadow:true});
  const lines=cleanPoints(slide.points).slice(0,3);
  const sub=lines.length?await textLayer(lines.join("\n"),{size:POINT,color:"#ffffffe0",width:CONTENT,height:400,font:FONTS.regular,align:"centre",spacing:10,shadow:true}):null;
  const closing=last?await closingPlan({color:white,accent:palette.accent}):null;
  // 흐린 배경도 음식 색이 보이게 탈채도(.85)는 뺐다. 밝기(.62)는 그대로 둔다: 밝은 사진에서 아래 흰 글자 대비가 이 값에 걸려 있다.
  const foot=await footerPlan(slide,index,total,{ink:"#fffffff2",muted:"#fffffff2",accent:"#fffffff2",top:1296,shadow:true});
  const textHeight=headline.info.height+(subline?20+subline.info.height:0)+(sub?18+sub.info.height:0)+(closing?36+closing.height:0);
  // 사진 창 폭 760→900: 표지가 아닌 장에서도 사진이 화면의 절반 가까이를 차지하게(음식이 주인공).
  const FRAME_TOP=150,FRAME_WIDTH=900;
  const frameHeight=Math.max(closing?380:520,Math.min(860,1290-foot.extra-48-textHeight-44-FRAME_TOP));
  const frameLeft=Math.round((1080-FRAME_WIDTH)/2);
  const textTop=FRAME_TOP+frameHeight+44;
  const background=await sharp(inputs[0]).rotate().resize(1080,1350,{fit:"cover",position:"attention"}).blur(26).modulate({brightness:.62}).png().toBuffer();
  // 변형 0: 사진 바깥에 얇은 흰 선(기존). 변형 1: 사진 둘레에 두꺼운 흰 매트를 두른 액자, 위 가운데 테이프 한 장.
  const matted=currentVariant()%2===1;
  const MAT=26;
  const layers:OverlayOptions[]=matted?[
    await cardShadow({x:frameLeft-MAT,y:FRAME_TOP-MAT+14,width:FRAME_WIDTH+MAT*2,height:frameHeight+MAT*2,rx:4,blur:22,opacity:.45}),
    svgLayer(`<rect x="${frameLeft-MAT}" y="${FRAME_TOP-MAT}" width="${FRAME_WIDTH+MAT*2}" height="${frameHeight+MAT*2}" rx="4" fill="#fffdf8"/>`),
    {input:await croppedPhoto(inputs[0],FRAME_WIDTH,frameHeight,0),left:frameLeft,top:FRAME_TOP},
    // 매트 안쪽 창 가장자리에 얕은 안쪽 그림자: 사진이 매트 "뒤로" 들어가 액자처럼 보인다.
    svgLayer(photoWell(frameLeft,FRAME_TOP,FRAME_WIDTH,frameHeight,{opacity:.3})),
    svgLayer(washiTape({x:540-110,y:FRAME_TOP-MAT-22,width:220,color:palette.highlight,angle:-3,opacity:.85})),
  ]:[
    await cardShadow({x:frameLeft-10,y:FRAME_TOP-2,width:FRAME_WIDTH+20,height:frameHeight+20,rx:2,blur:22,opacity:.45}),
    {input:await croppedPhoto(inputs[0],FRAME_WIDTH,frameHeight,0),left:frameLeft,top:FRAME_TOP},
    // 흰 선 액자 안쪽에도 얕은 안쪽 그림자(흐린 배경 위에 뜬 창이 아니라 틀에 끼운 사진이 되게). 선·테이프는 그 위에.
    svgLayer(photoWell(frameLeft,FRAME_TOP,FRAME_WIDTH,frameHeight)
      +`<rect x="${frameLeft-10}" y="${FRAME_TOP-10}" width="${FRAME_WIDTH+20}" height="${frameHeight+20}" fill="none" stroke="${white}" stroke-width="4"/>`
      +washiTape({x:frameLeft-70,y:FRAME_TOP-14,width:200,color:palette.highlight,angle:-14,opacity:.82})
      +washiTape({x:frameLeft+FRAME_WIDTH-130,y:FRAME_TOP+frameHeight-30,width:200,color:palette.highlight,angle:10,opacity:.82})),
  ];
  let cursor=textTop+(matted?MAT-10:0);
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:cursor});
  cursor+=headline.info.height;
  if(subline){layers.push({input:subline.data,left:Math.round((1080-subline.info.width)/2),top:cursor+20});cursor+=20+subline.info.height;}
  if(sub){layers.push({input:sub.data,left:Math.round((1080-sub.info.width)/2),top:cursor+18});cursor+=18+sub.info.height;}
  // 흐린 배경이 밝은 사진이면 28px 계정 글자가 3:1에 못 미쳐, 명함 뒤에 반투명 어두운 판을 깐다.
  if(closing)layers.push(svgLayer(`<rect x="${MARGIN}" y="${cursor+12}" width="${CONTENT}" height="${closing.height+40}" rx="24" fill="#000" fill-opacity=".42"/>`),...closing.place(540,cursor+36));
  layers.push(...foot.layers);
  layers.push(photoOverlayLayer(),await grainLayer({opacity:.12}));
  return sharp(background).composite(layers).jpeg({quality:90}).toBuffer();
}

// 3. 일러스트 설명: 파스텔 배경 위에 살짝 기울어진 흰 카드. 카드 안에 강조색 제목, 그림, 본문. 아래에 노란 말풍선.
// 장식: 배경 블롭과 점 무늬, 카드 뒤 번진 그림자, 카드 모서리 마스킹 테이프, 제목 밑 물결 밑줄, 말풍선 옆 반짝이,
// 카드 왼쪽 아래에서 고개를 내미는 마스코트, 종이 질감.
async function composeIllustration(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  // 변형 1은 카드가 반대쪽(오른쪽 아래)으로 기운다.
  const CARD_W=900,PAD=56,TILT=currentVariant()%2===1?3:-3,CARD_MAX=1060;
  const lines=cleanPoints(slide.points);
  const bubbleText=lines.length>1?lines[lines.length-1]:slide.keywords[0]?`#${slide.keywords.join(" #")}`:"";
  const bodyLines=lines.length>1?lines.slice(0,-1):lines;
  // 흰 카드 위 강조색 제목. 핵심어는 진한 글자색으로 뒤집어 강조한다(강조색 제목 안에서 강조색을 또 쓰면 안 보인다).
  const headline=await slideTitle(slide,{sizes:[68,64,60,56],color:readableOn(palette.accent,"#fffdf8",3),accent:"#2a2a2a",width:CARD_W-PAD*2,maxHeight:230});
  const photoTop=PAD+headline.info.height+28;
  // 마지막 장은 카드 아래쪽(요점 아래)에 가게 명함을 넣는다. 카드 안 자리는 사진 높이에서 먼저 뺀다.
  const last=isLast(slide,index,total);
  const closing=last?await closingPlan({color:"#2a2a2a",accent:palette.accent,width:CARD_W-PAD*2}):null;
  const closingH=closing?closing.height+36:0;
  // 본문을 34px로 키운 만큼 사진 높이를 줄여 카드 안에 맞춘다. 본문이 짧으면 사진이 커져 빈 곳을 채운다.
  const pointOptions={left:PAD,width:CARD_W-PAD*2,color:"#2a2a2a",markerColor:palette.accent,size:POINT};
  const measured=await pointLayers(bodyLines,0,pointOptions);
  const PHOTO_H=Math.max(closing?240:320,Math.min(520,CARD_MAX-PAD-8-closingH-(bodyLines.length?measured.bottom+32:0)-photoTop));
  const points=await pointLayers(bodyLines,photoTop+PHOTO_H+32,pointOptions);
  // 카드 높이는 내용에 맞춘다. 비어 있는 카드 아래쪽이 남지 않는다.
  const contentBottom=(bodyLines.length?points.bottom:photoTop+PHOTO_H)+closingH;
  const CARD_H=Math.max(820,Math.min(CARD_MAX,contentBottom+PAD+8));
  const card=await sharp({create:{width:CARD_W,height:CARD_H,channels:4,background:"#fffdf8"}})
    .composite([
      {input:svg(CARD_W,CARD_H,`<rect width="${CARD_W}" height="${CARD_H}" rx="14" fill="#fffdf8"/>`),left:0,top:0},
      {input:headline.data,left:PAD,top:PAD},
      // 제목 마지막 줄 아래에 짧은 물결 밑줄. 제목과 사진 사이 여백 안에 들어간다.
      {input:svg(CARD_W,CARD_H,wavyUnderline({x:PAD,y:PAD+headline.info.height+12,width:Math.min(300,headline.info.width),color:palette.highlight,strokeWidth:6})),left:0,top:0},
      {input:await croppedPhoto(inputs[0],CARD_W-PAD*2,PHOTO_H,18),left:PAD,top:photoTop},
      ...points.layers,
      ...(closing?closing.place(CARD_W/2,contentBottom-closing.height,{width:CARD_W,height:CARD_H}):[]),
    ]).png().toBuffer();
  // 카드를 살짝 기울이고(투명 배경), 그 뒤에 같은 각도의 번진 그림자를 깐다.
  const tilted=await sharp(card).rotate(TILT,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  const cardLeft=Math.round((1080-tilted.info.width)/2),cardTop=Math.max(72,Math.round((1350-tilted.info.height)/2)-30);
  const cx=cardLeft+tilted.info.width/2,cy=cardTop+tilted.info.height/2;
  const layers:OverlayOptions[]=[
    // 배경 장식은 카드 뒤에. 오른쪽 위 밝은 덩어리, 왼쪽 아래 옅은 강조색 덩어리, 오른쪽 아래 점 무늬.
    svgLayer(blob({cx:940,cy:150,r:230,color:palette.highlight,opacity:.42,seed:3})+blob({cx:120,cy:1180,r:190,color:palette.accent,opacity:.12,seed:9})+dotGrid({x:760,y:1010,width:280,height:250,color:palette.ink,opacity:.22})),
    await cardShadow({x:Math.round(cx-CARD_W/2)+6,y:Math.round(cy-CARD_H/2)+22,width:CARD_W,height:CARD_H,rx:14,blur:20,opacity:.2,rotate:TILT}),
    {input:tilted.data,left:cardLeft,top:cardTop},
    svgLayer(washiTape({x:cardLeft+2,y:cardTop+6,width:210,color:palette.highlight,angle:-12,opacity:.8})),
  ];
  // 마스코트는 카드 왼쪽 아래 바깥의 빈 공간에 세운다. 머리는 카드의 아래 여백(글이 없는 띠)까지만 올라오게
  // 높이를 제한해, 본문 글줄을 가리지 않는다. 카드가 길어 공간이 모자라면 줄이고, 너무 좁으면 생략한다.
  const cardBottom=cardTop+tilted.info.height;
  const MASCOT_FOOT=1284,TEXT_SAFE_TOP=cardBottom-Math.round(PAD*.6);
  const mascot=await mascotLayer({width:200,pose:poseFor(slide,"hello"),left:MARGIN-26,top:MASCOT_FOOT,anchor:"bottom-left",maxHeight:MASCOT_FOOT-TEXT_SAFE_TOP});
  // 발 밑 접촉 그림자를 먼저 깔고 마스코트를 올린다(바닥에 선 캐릭터).
  if(mascot)layers.push(svgLayer(mascotContact(mascot)),mascot);
  if(bubbleText){
    // 노란 말풍선은 마스코트 바로 오른쪽에 붙여, 마스코트가 하는 말처럼 보이게 한다. 꼬리는 왼쪽(마스코트 쪽)으로 뻗고
    // 마스코트 얼굴 높이를 가리킨다. 마스코트가 생략된 카드에서는 꼬리 없는 알약 모양으로 오른쪽 아래에 둔다.
    const TAIL=28;
    const bx=mascot?mascot.left+mascot.width+TAIL:0;
    const text=await textLayer(bubbleText,{size:32,color:"#2a2a2a",width:Math.min(720,1080-MARGIN-(mascot?bx:MARGIN)-72),height:90,font:FONTS.bold,spacing:6});
    const bw=text.info.width+72,bh=text.info.height+40;
    let x=1080-MARGIN-bw,y=Math.min(cardTop+tilted.info.height-Math.round(bh/2)-20,1350-110-bh),tail="";
    if(mascot){
      const face=mascot.top+Math.round(mascot.height*.35);
      x=bx;
      // 본문 글줄(카드 아래 여백 위쪽)을 가리지 않고, 채널명 줄(1290) 위에서 끝나게 세로 위치를 제한한다.
      y=Math.max(TEXT_SAFE_TOP,Math.min(1282-bh,face-Math.round(bh/2)));
      const tipY=Math.max(y+14,Math.min(y+bh-14,face));
      tail=`<path d="M${x+2} ${tipY-16}L${x-TAIL} ${tipY}L${x+2} ${tipY+16}z" fill="${palette.highlight}"/>`;
    }
    layers.push(svgLayer(`<rect x="${x+8}" y="${y+10}" width="${bw}" height="${bh}" rx="28" fill="#000" fill-opacity=".12"/><rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="28" fill="${palette.highlight}"/>${tail}`
      +sparkles([[Math.min(1056,x+bw+22),y-6,13],[Math.min(1056,x+bw+12),y+bh+4,9]],palette.accent)));
    layers.push({input:text.data,left:x+36,top:y+20});
  }
  // 다른 카드와 같게 채널명은 왼쪽, 장 번호는 오른쪽 아래. 마스코트가 있으면 채널명은 그 오른쪽으로 비킨다.
  const foot=await footerPlan(slide,index,total,{ink:palette.ink,muted:palette.ink,left:MARGIN+(mascot?180:0),width:CONTENT-(mascot?180:0),top:1290});
  layers.push(...foot.layers);
  layers.push(await grainLayer());
  return texturedCanvas(palette.soft,layers);
}

// 4. 사진 콜라주: 밝은 바탕에 큰 제목과 설명, 사진 격자, 남은 요점, 태그 알약.
async function composeCollage(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:palette.ink,accent:readableOn(palette.accent,palette.paper,3),maxHeight:240});
  const lines=cleanPoints(slide.points);
  const last=isLast(slide,index,total);
  // 바닥글(구분선 아래)과 마지막 장 명함 자리를 먼저 잡고, 남는 높이를 사진 격자에 준다.
  const foot=await footerPlan(slide,index,total,{ink:palette.ink,muted:palette.muted,accent:readableOn(palette.accent,palette.paper),top:1284});
  const closing=last?await closingPlan({color:palette.ink,accent:palette.accent}):null;
  const RULE_Y=1266-foot.extra;
  const sub=lines[0]?await textLayer(lines[0],{size:POINT,color:palette.muted,width:CONTENT,height:100,font:FONTS.regular,spacing:8}):null;
  const gridTop=MARGIN+headline.info.height+(sub?16+sub.info.height:0)+36;
  const photos=inputs.slice(0,3);
  const rest=lines.slice(1,3);
  const tags=slide.keywords.slice(0,3);
  // 아래 요점·태그에 필요한 높이를 실제로 재서 빼고, 남는 만큼 격자를 키운다(위 한도 760). 글이 짧아도 아래가 비지 않는다.
  const measured=rest.length?(await pointLayers(rest,0,{color:palette.ink,markerColor:palette.accent,size:POINT})).bottom+32:0;
  const reserved=measured+(tags.length?52+24:0)+32+(closing?closing.height+30:0);
  const gridHeight=Math.max(closing?300:400,Math.min(760,RULE_Y-16-reserved-gridTop));
  const GAP=20;
  // 오른쪽 아래 점 무늬는 사진·태그 뒤에 깔린다. 왼쪽 위 모서리는 종이색 그대로 둔다.
  const layers:OverlayOptions[]=[svgLayer(dotGrid({x:800,y:1060,width:280,height:200,color:palette.accent,opacity:.25})),{input:headline.data,left:MARGIN,top:MARGIN}];
  if(sub)layers.push({input:sub.data,left:MARGIN,top:MARGIN+headline.info.height+16});
  // 격자의 각 칸을 (x, y, w, h)로 먼저 정한 뒤, 칸마다 번진 그림자와 사진을 올린다.
  const cells:Array<[number,number,number,number]>=[];
  const grid=currentVariant()%3;
  if(photos.length>=3&&grid===1){
    // 위에 넓은 칸 하나, 아래에 같은 크기 두 칸.
    const topH=Math.round((gridHeight-GAP)*.58),halfW=Math.round((CONTENT-GAP)/2);
    cells.push([MARGIN,gridTop,CONTENT,topH],[MARGIN,gridTop+topH+GAP,halfW,gridHeight-topH-GAP],[MARGIN+halfW+GAP,gridTop+topH+GAP,CONTENT-halfW-GAP,gridHeight-topH-GAP]);
  }else if(photos.length>=3&&grid===2){
    // 같은 너비의 세로 줄 세 칸. 가운데 칸만 살짝 내려 리듬을 준다.
    const w=Math.round((CONTENT-GAP*2)/3);
    cells.push([MARGIN,gridTop,w,gridHeight-40],[MARGIN+w+GAP,gridTop+40,w,gridHeight-40],[MARGIN+(w+GAP)*2,gridTop,CONTENT-(w+GAP)*2,gridHeight-40]);
  }else if(photos.length>=3){
    const leftW=Math.round(CONTENT*.58),rightW=CONTENT-leftW-GAP,halfH=Math.round((gridHeight-GAP)/2);
    cells.push([MARGIN,gridTop,leftW,gridHeight],[MARGIN+leftW+GAP,gridTop,rightW,halfH],[MARGIN+leftW+GAP,gridTop+halfH+GAP,rightW,gridHeight-halfH-GAP]);
  }else if(photos.length===2){
    const w=Math.round((CONTENT-GAP)/2);
    cells.push([MARGIN,gridTop,w,gridHeight],[MARGIN+w+GAP,gridTop,CONTENT-w-GAP,gridHeight]);
  }else{
    cells.push([MARGIN,gridTop,CONTENT,gridHeight]);
  }
  layers.push(...await Promise.all(cells.map(([x,y,w,h])=>cardShadow({x,y:y+10,width:w,height:h,rx:18,blur:14,opacity:.2}))));
  for(const [i,[x,y,w,h]] of cells.entries())layers.push({input:await croppedPhoto(photos[i],w,h,18),left:x,top:y});
  // 첫 사진의 왼쪽 위 모서리에 마스킹 테이프, 마지막 사진 근처에 작은 반짝이.
  const lastCell=cells[cells.length-1];
  layers.push(svgLayer(washiTape({x:MARGIN-40,y:gridTop-18,width:190,color:palette.highlight,angle:-9,opacity:.8})+sparkles([[lastCell[0]+lastCell[2]+6,lastCell[1]+lastCell[3]+4,14]],palette.accent)));
  let cursor=gridTop+gridHeight+32;
  if(rest.length){
    const points=await pointLayers(rest,cursor,{color:palette.ink,markerColor:palette.accent,size:POINT});
    layers.push(...points.layers);cursor=points.bottom+8;
  }
  if(tags.length){
    let x=MARGIN;
    for(const tag of tags){
      const text=await textLayer(`#${tag}`,{size:META,color:palette.ink,width:400,height:36,font:FONTS.semibold});
      const w=text.info.width+44;
      layers.push(svgLayer(`<rect x="${x}" y="${cursor}" width="${w}" height="52" rx="26" fill="${palette.soft}"/>`));
      layers.push({input:text.data,left:x+22,top:cursor+Math.round((52-text.info.height)/2)});
      x+=w+12;
    }
  }
  if(closing)layers.push(...closing.place(540,RULE_Y-24-closing.height));
  // 채널명과 장 번호는 다른 카드와 같은 모양(왼쪽 채널명, 오른쪽 "4 / 10")으로 맞춘다.
  layers.push(svgLayer(`<path d="M${MARGIN} ${RULE_Y}H${1080-MARGIN}" stroke="${palette.ink}" stroke-opacity=".2" stroke-width="${MIN_STROKE}"/>`),...foot.layers);
  layers.push(await grainLayer());
  return texturedCanvas(palette.paper,layers);
}

// 5. 브라우저 프레임: 파스텔 배경 위 검은 테두리 브라우저 창. 안에 굵은 제목, 번호 목록, 아래 돋보기 검색창 캡슐. 사진은 쓰지 않는다.
async function composeBrowser(slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const WIN_LEFT=MARGIN,WIN_W=CONTENT,BAR=66,PAD=52,capH=72;
  // 변형 1은 다크 모드 창: 짙은 창 안에 밝은 글자, 창 버튼은 신호등 색.
  const dark=currentVariant()%2===1;
  const ink=dark?"#f5f3ee":"#141414",windowFill=dark?"#1f2023":"#ffffff";
  const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:ink,accent:readableOn(palette.accent,windowFill,3),width:WIN_W-PAD*2,maxHeight:240});
  // 마지막 장은 창 안 검색창 바로 위에 가게 명함을 넣고, 그만큼 목록 자리를 줄인다.
  const closing=isLast(slide,index,total)?await closingPlan({color:ink,accent:palette.accent,width:WIN_W-PAD*2}):null;
  const closingH=closing?closing.height+36:0;
  const lines=cleanPoints(slide.points);
  // 창은 항상 화면 대부분을 차지한다(위 104 ~ 아래 1214). 글이 짧으면 남는 높이를 요점 사이 여백(최대 56)으로 나누고,
  // 그래도 남으면 제목·목록 묶음을 창 안 세로 가운데로 내린다. 창 아래쪽이 텅 비지 않는다.
  const WIN_TOP=104,WIN_H=1110;
  const capY=WIN_TOP+WIN_H-PAD-capH;
  // 요점이 짧으면 글자를 키운다(44 → 36px). 줄 사이 여백을 최소 24px 남기고 들어가는 가장 큰 크기를 쓴다.
  const available=capY-40-closingH-(WIN_TOP+BAR+PAD)-(headline.info.height+56);
  let pointOptions={left:WIN_LEFT+PAD,width:WIN_W-PAD*2,numbered:true,color:ink,markerColor:readableOn(palette.accent,windowFill),size:POINT};
  let measured=await pointLayers(lines,0,pointOptions);
  // 50·46은 아주 짧은 목록(창 아래가 크게 남는 경우)용: 줄 사이 여백을 다 벌리고도 창의 절반이 남을 때만 쓴다.
  for(const size of [50,46,44,40,38]){
    const candidate={...pointOptions,size};
    const tried=await pointLayers(lines,0,candidate);
    const need=size>44?available/2:0;
    if(tried.bottom+24*Math.max(0,lines.length-1)+need<=available){pointOptions=candidate;measured=tried;break;}
  }
  const room=available-measured.bottom
  // 제목은 창 위쪽에 고정하고, 남는 높이는 요점 사이(최대 110)로 나눠 목록이 검색창 바로 위까지 고르게 퍼지게 한다.
  const gap=lines.length>1?Math.max(0,Math.min(110,Math.floor(room/(lines.length-1)))):0;
  // 요점 사이를 다 벌리고도 남는 높이(짧은 문안 3줄이면 350px 남짓)는 제목→목록 사이(최대 +90)와 목록 아래로 반씩 나눈다.
  // 예전에는 전부 목록 아래(검색창 위)에 남아 창 안 아래쪽이 텅 비었다.
  const leftover=Math.max(0,room-gap*Math.max(0,lines.length-1));
  const titleGap=56+Math.min(90,Math.floor(leftover/2));
  const contentTop=WIN_TOP+BAR+PAD;
  const points=await pointLayers(lines,contentTop+headline.info.height+titleGap,{...pointOptions,gap});
  const query=slide.keywords.length?slide.keywords.join(" "):slideEyebrow(slide.role,index).split(" · ").pop()??"";
  // 검색창 캡슐은 밝은 강조색이라 글자는 늘 짙게 쓴다.
  const search=await textLayer(query,{size:30,color:"#141414",width:WIN_W-PAD*2-160,height:42,font:FONTS.bold});
  const capW=Math.min(WIN_W-PAD*2,search.info.width+150),capX=WIN_LEFT+PAD;
  // 짧은 목록이면 요점을 다 벌려도 목록과 검색창 사이가 250px 넘게 빈다(창 높이는 고정). 그 자리 오른쪽에 메뉴 소품을 하나 붙인다.
  // 검색창 캡슐 오른쪽 옆까지 내려 쓰고, 캡슐이 길어 옆자리가 좁으면 캡슐 위 칸만 쓴다. 명함이 있는 마지막 장은 넣지 않는다.
  const besideCap=WIN_LEFT+WIN_W-PAD-(capX+capW+32)>=160;
  const propBottom=besideCap?capY+capH:capY-16;
  const prop=closing?null:await fillerProp(fillerProps(slide)[0],{left:WIN_LEFT+WIN_W/2,top:points.bottom+24,width:WIN_W/2-PAD,height:propBottom-(points.bottom+24)},{align:"right",maxSize:260});
  // 마스코트가 창의 왼쪽 아래 모서리에 걸터앉는다. 채널명은 마스코트 오른쪽으로 비킨다.
  // 검색창 캡슐 아래로만 올라오게 높이를 제한한다(캡슐 글자를 가리지 않게).
  const mascot=await mascotLayer({width:150,pose:poseFor(slide,"curious"),left:MARGIN-12,top:WIN_TOP+WIN_H+88,anchor:"bottom-left",maxHeight:WIN_TOP+WIN_H+88-(capY+capH+12)});
  const foot=await footerPlan(slide,index,total,{ink:palette.ink,muted:palette.ink,left:MARGIN+(mascot?150:0),width:CONTENT-(mascot?150:0),top:WIN_TOP+WIN_H+44});
  return texturedCanvas(palette.soft,[
    // 창 뒤 배경 장식: 오른쪽 위 밝은 덩어리, 왼쪽 아래 옅은 강조색 덩어리, 창 모서리 밖 반짝이.
    svgLayer(blob({cx:960,cy:130,r:210,color:palette.highlight,opacity:.5,seed:5})+blob({cx:110,cy:1230,r:170,color:palette.accent,opacity:.12,seed:11})
      +sparkles([[WIN_LEFT+WIN_W+16,WIN_TOP-14,20],[WIN_LEFT+WIN_W+40,WIN_TOP+34,11],[WIN_LEFT-22,WIN_TOP+WIN_H-60,14]],palette.accent)),
    svgLayer(`<rect x="${WIN_LEFT+12}" y="${WIN_TOP+14}" width="${WIN_W}" height="${WIN_H}" rx="20" fill="#000" fill-opacity=".9"/>
      <rect x="${WIN_LEFT}" y="${WIN_TOP}" width="${WIN_W}" height="${WIN_H}" rx="20" fill="${windowFill}" stroke="#000" stroke-width="5"/>
      <path d="M${WIN_LEFT} ${WIN_TOP+BAR}H${WIN_LEFT+WIN_W}" stroke="#000" stroke-width="5"/>
      ${(dark?["#ff5f57","#febc2e","#28c840"]:["#000","#000","#000"]).map((fill,i)=>`<circle cx="${WIN_LEFT+38+i*36}" cy="${WIN_TOP+BAR/2}" r="11" fill="${fill}"/>`).join("")}
      <rect x="${capX}" y="${capY}" width="${capW}" height="${capH}" rx="36" fill="${palette.highlight}" stroke="#000" stroke-width="4"/>
      <circle cx="${capX+40}" cy="${capY+34}" r="12" fill="none" stroke="#000" stroke-width="4"/><path d="M${capX+49} ${capY+43}l12 12" stroke="#000" stroke-width="4" stroke-linecap="round"/>`),
    {input:headline.data,left:WIN_LEFT+PAD,top:contentTop},
    ...points.layers,
    {input:search.data,left:capX+78,top:capY+Math.round((capH-search.info.height)/2)},
    ...(closing?closing.place(WIN_LEFT+WIN_W/2,capY-24-closing.height):[]),
    ...(prop?[prop]:[]),
    ...(mascot?[svgLayer(mascotContact(mascot,.2)),mascot]:[]),
    ...foot.layers,
    await grainLayer(),
  ]);
}


// 6. 대형 숫자: 짙은 배경 가운데 아주 큰 숫자, 그 아래 굵은 흰 설명. 위에 얇은 캡슐 제목, 아래 작은 회색 부연.
async function composeStat(slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  // 변형 0: 짙은 남색 바탕(기존). 변형 1: 팔레트 바탕색 위에 강조색 숫자(밤 팔레트면 자연히 어두운 바탕).
  const onPalette=currentVariant()%2===1;
  const bg=onPalette?palette.paper:"#182533",white=onPalette?inkOn(palette.paper,palette):"#ffffff",gray=onPalette?mutedOn(palette.paper,palette):"#9aa6b2";
  const title=await textLayer(slideEyebrow(slide.role,index),{size:META,color:white,width:700,height:34,font:FONTS.semibold});
  const capW=title.info.width+64,capX=Math.round((1080-capW)/2),capY=88;
  // 마지막 장은 명함 자리만큼 큰 숫자를 줄인다(300 → 240).
  const closing=isLast(slide,index,total)?await closingPlan({color:white,accent:palette.accent}):null;
  const figureText=slide.figure||slide.keywords[0]||"";
  const figureStyle={color:onPalette?palette.accent:palette.highlight,width:CONTENT,font:FONTS.bold,align:"centre" as const,spacing:0};
  const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:white,accent:onPalette?readableOn(palette.accent,bg,3):palette.highlight,align:"centre",maxHeight:240});
  const lines=cleanPoints(slide.points);
  // 명함이 없는 장은 설명 줄 사이를 조금 더 띄운다(8 → 16). 짧은 문안에서 설명 묶음이 숫자 아래에 납작하게 붙지 않게.
  const note=lines.length?await textLayer(lines.join("\n"),{size:POINT,color:gray,width:CONTENT,height:600,font:FONTS.regular,align:"centre",spacing:isLast(slide,index,total)?8:16}):null;
  const foot=await footerPlan(slide,index,total,{ink:white,muted:gray,top:1284});
  // 글 묶음이 놓일 세로 범위: 위 캡슐 아래 ~ 바닥글 위 40.
  const AREA_TOP=170,AREA_BOTTOM=1284-foot.extra-40;
  const restHeight=28+headline.info.height+(note?36+note.info.height:0)+(closing?40+closing.height:0);
  // 문안이 짧으면 숫자·설명이 화면 가운데에 작게 몰려 위아래가 휑했다(빈 띠 250~360px). 남는 높이가 크면 숫자를
  // 한 줄에 들어가는 한에서 키운다(300 → 최대 440). 높이 제한을 넉넉히 두고 그려 보고 한 줄일 때만 쓴다(몰래 축소 없음).
  let figure=await textLayer(figureText,{...figureStyle,size:closing?240:300,height:420});
  for(const size of closing?[280,260]:[440,400,380,340]){
    const tried=await textLayer(figureText,{...figureStyle,size,height:2000});
    if(tried.info.height<=size*1.5&&tried.info.height+restHeight<=AREA_BOTTOM-AREA_TOP-120){figure=tried;break;}
  }
  // 그래도 남는 높이는 숫자→제목, 제목→설명, 설명→명함 사이 여백으로 조금씩(각 최대 100) 나눈 뒤 나머지를 위아래로 가른다.
  const gapCount=1+(note?1:0)+(closing?1:0);
  const grow=Math.max(0,Math.min(100,Math.floor((AREA_BOTTOM-AREA_TOP-figure.info.height-restHeight)/(gapCount+2))));
  const GAP_HEAD=28+grow,GAP_NOTE=36+grow,GAP_CLOSING=40+grow;
  const blockHeight=figure.info.height+restHeight+grow*gapCount;
  // 위 캡슐(아래 끝 144)과 바닥글(1284) 사이 한가운데에 둔다. 숫자 글자 상자는 위쪽에 아래쪽보다 조금 더 큰 빈 여백을
  // 품고 있어 그만큼 위로 올려 눈에 보이는 위아래 여백이 같게 한다.
  const blockTop=Math.max(AREA_TOP-40,Math.min(Math.round((144+1284-blockHeight)/2-figure.info.height/30),AREA_BOTTOM-blockHeight));
  // 숫자 뒤에 강조색 빛무리와 점선 고리, 주변에 반짝이. 네 귀퉁이에는 옅은 크롭 마크.
  const figureCy=blockTop+Math.round(figure.info.height/2);
  // 숫자를 키우면 고리도 숫자 폭에 맞춰 넓힌다(숫자가 고리 선을 뚫고 나가지 않게, 최대 400).
  const ringR=Math.min(400,Math.max(330,Math.round(figure.info.width/2+70)));
  const layers:OverlayOptions[]=[
    svgLayer(`<defs><radialGradient id="glow"><stop offset="0" stop-color="${palette.highlight}" stop-opacity=".28"/><stop offset="1" stop-color="${palette.highlight}" stop-opacity="0"/></radialGradient></defs><circle cx="540" cy="${figureCy}" r="${ringR+70}" fill="url(#glow)"/>`
      +ring({cx:540,cy:figureCy,r:ringR,color:white,strokeWidth:3,dashed:true,opacity:.22})
      +sparkles([[214,figureCy-150,22],[870,figureCy-190,15],[900,figureCy+120,26],[180,figureCy+170,12]],palette.highlight,.9)
      +cornerMarks({inset:34,length:46,color:white,opacity:.3})),
    svgLayer(`<rect x="${capX}" y="${capY}" width="${capW}" height="56" rx="28" fill="none" stroke="${white}" stroke-opacity=".6" stroke-width="${MIN_STROKE}"/>`),
    {input:title.data,left:capX+32,top:capY+Math.round((56-title.info.height)/2)},
    {input:figure.data,left:Math.round((1080-figure.info.width)/2),top:blockTop},
    {input:headline.data,left:Math.round((1080-headline.info.width)/2),top:blockTop+figure.info.height+GAP_HEAD},
    ...foot.layers,
  ];
  let cursor=blockTop+figure.info.height+GAP_HEAD+headline.info.height;
  if(note){layers.push({input:note.data,left:Math.round((1080-note.info.width)/2),top:cursor+GAP_NOTE});cursor+=GAP_NOTE+note.info.height;}
  if(closing)layers.push(...closing.place(540,cursor+GAP_CLOSING));
  layers.push(await grainLayer({opacity:.22}));
  return texturedCanvas(bg,layers);
}

// 7. A vs B: 화면을 좌우로 나눠 각각 사진, 이름, 체크 목록을 두고 가운데 VS 원. 아래에 제목.
async function composeVersus(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const HALF=540,ITEM_W=HALF-80-40;
  // 왼쪽은 팔레트 바탕(paper), 오른쪽은 파스텔(soft). 밤 팔레트에서는 두 면 모두 어두운 색이 되고 글자는 밝아진다.
  const left=palette.paper,right=palette.soft;
  const lines=cleanPoints(slide.points);
  const splitAt=Math.ceil(lines.length/2);
  const sides=[
    {left:0,bg:left,ink:inkOn(left,palette),label:slide.keywords[0]??"A",items:lines.slice(0,splitAt),photo:inputs[0]},
    {left:HALF,bg:right,ink:inkOn(right,palette),label:slide.keywords[1]??"B",items:lines.slice(splitAt),photo:inputs[1]??inputs[0]},
  ];
  // 글을 먼저 그려 높이를 잰 뒤, 남는 높이만큼 사진을 키운다(460~640). 본문을 34px로 키워도 아래가 넘치거나 비지 않는다.
  const rendered=await Promise.all(sides.map(async side=>({
    side,
    label:await textLayer(side.label,{size:40,color:side.ink,width:HALF-80,height:56,font:FONTS.bold,align:"centre"}),
    items:await Promise.all(side.items.map(item=>textLayer(item,{size:POINT,color:side.ink,width:ITEM_W,height:POINT*6,font:FONTS.regular,spacing:6}))),
  })));
  const listHeight=Math.max(...rendered.map(({label,items})=>label.info.height+28+items.reduce((sum,item)=>sum+item.info.height+18,0)));
  // 제목은 흰 알약 위라 글자·강조색을 흰 바탕 기준으로 맞춘다. 두 목록 아래 남는 자리가 작아 본문 장 사다리의 아래쪽(60~56)부터.
  const headline=await slideTitle(slide,{sizes:[60,56],color:inkOn("#ffffff",palette),accent:readableOn(palette.accent,"#ffffff",3),align:"centre",width:CONTENT-80,maxHeight:160});
  const closing=isLast(slide,index,total)?await closingPlan({color:inkOn(left,palette),accent:palette.accent}):null;
  const foot=await footerPlan(slide,index,total,{ink:inkOn(left,palette),muted:mutedOn(left,palette),top:1290});
  const FOOT_LIMIT=1262-foot.extra-(closing?closing.height+30:0);
  const titleBlock=headline.info.height+40+60;
  const PHOTO_H=Math.max(closing?300:440,Math.min(800,FOOT_LIMIT-44-listHeight-titleBlock));
  const layers:OverlayOptions[]=[svgLayer(`<rect x="${HALF}" y="0" width="${HALF}" height="1350" fill="${right}"/>`)];
  let listsBottom=PHOTO_H;
  for(const {side,label,items} of rendered){
    layers.push({input:await croppedPhoto(side.photo,HALF,PHOTO_H,0),left:side.left,top:0});
    const labelLeft=side.left+Math.round((HALF-label.info.width)/2);
    layers.push({input:label.data,left:labelLeft,top:PHOTO_H+44});
    // 이름 밑에 강조색 물결 밑줄. 사진 아래 모서리에는 반투명 테이프를 붙여 두 장이 스크랩처럼 보이게 한다.
    layers.push(svgLayer(wavyUnderline({x:labelLeft-6,y:PHOTO_H+44+label.info.height+6,width:label.info.width+12,color:palette.accent,strokeWidth:5})
      +washiTape({x:side.left+(side.left?HALF-200:30),y:PHOTO_H-26,width:170,color:palette.highlight,angle:side.left?8:-8,opacity:.78})));
    let cursor=PHOTO_H+44+label.info.height+28;
    for(const text of items){
      layers.push({input:svg(30,30,`<path d="M4 15l7 7 15-16" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),left:side.left+40,top:cursor+6});
      layers.push({input:text.data,left:side.left+40+40,top:cursor});
      cursor+=text.info.height+18;
    }
    listsBottom=Math.max(listsBottom,cursor);
  }
  // VS 원은 강조색으로 채워 어느 팔레트에서도 두 면 위에서 눈에 띄게 한다. 둘레에 점선 고리와 반짝이.
  const vs=await textLayer("VS",{size:36,color:palette.onAccent,width:120,height:48,font:FONTS.bold,align:"centre"});
  const ringInk=inkOn(left,palette);
  layers.push(svgLayer(ring({cx:HALF,cy:PHOTO_H,r:86,color:ringInk,strokeWidth:3,dashed:true,opacity:.45})+sparkles([[HALF-108,PHOTO_H-74,16],[HALF+112,PHOTO_H+70,12]],palette.highlight)
    +`<circle cx="${HALF}" cy="${PHOTO_H}" r="62" fill="${palette.accent}" stroke="#ffffff" stroke-width="6"/>`));
  layers.push({input:vs.data,left:HALF-Math.round(vs.info.width/2),top:PHOTO_H-Math.round(vs.info.height/2)});
  // 제목은 두 목록 아래 남는 공간의 가운데, 양쪽 면에 걸치는 흰 알약 위에 둔다. 어두운 팔레트에서도 끝까지 읽힌다.
  const titleTop=listsBottom+Math.max(40,Math.round((FOOT_LIMIT-listsBottom-headline.info.height)/2));
  const pillW=headline.info.width+80,pillH=headline.info.height+40,pillX=Math.round((1080-pillW)/2),pillY=titleTop-20;
  layers.push(svgLayer(`<path d="M${MARGIN} ${pillY+pillH/2}H${1080-MARGIN}" stroke="${ringInk}" stroke-opacity=".2" stroke-width="${MIN_STROKE}"/>`
    +softShadow({x:pillX,y:pillY+8,width:pillW,height:pillH,rx:pillH/2,blur:12,opacity:.14})
    +`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH/2}" fill="#ffffff" fill-opacity=".94"/>`));
  layers.push({input:headline.data,left:Math.round((1080-headline.info.width)/2),top:titleTop});
  if(closing)layers.push(svgLayer(`<rect x="0" y="${FOOT_LIMIT}" width="1080" height="${1350-FOOT_LIMIT}" fill="${left}"/>`),...closing.place(540,FOOT_LIMIT+10));
  layers.push(...foot.layers);
  layers.push(await grainLayer());
  return texturedCanvas(left,layers);
}

// 8. 단계 가이드: 왼쪽 위 "먹는 법" 원형 스티커, 큰 제목, 가운데 사진, 아래 흰 둥근 상자 안 설명.
async function composeStep(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const R=66,stickerX=MARGIN+R,stickerY=84+R;
  // 카드 한 장만 보고는 이 장이 몇 번째 단계인지 알 수 없어, 스티커에는 번호 대신 "먹는 법"을 쓰고
  // 실제 단계는 아래 상자의 요점에 01·02·03 번호로 매긴다(장 번호를 STEP 번호로 쓰면 "왜 STEP 3이지?"가 된다).
  // 예전 영문 "HOW TO"는 한글로 바꿨다(사장님 결정: 영문 장식 문구 한글화). 흰 원 위라 강조색은 흰 바탕 기준 3:1로.
  const howTo=await textLayer("먹는\n법",{size:32,color:readableOn(palette.accent,"#ffffff",3),width:110,height:96,font:DECOR_FONT,align:"centre",spacing:2});
  // 제목은 스티커 오른쪽 좁은 칸(768px)이라 본문 사다리 아래쪽(64~56)을 쓴다.
  const headline=await slideTitle(slide,{sizes:[64,60,56],color:palette.ink,accent:readableOn(palette.accent,palette.soft,3),width:CONTENT-R*2-36,maxHeight:220});
  const closing=isLast(slide,index,total)?await closingPlan({color:inkOn(palette.soft,palette),accent:palette.accent}):null;
  const foot=await footerPlan(slide,index,total,{ink:palette.ink,muted:palette.ink,top:1284});
  const bottom=1250-foot.extra-(closing?closing.height+30:0);
  const lines=cleanPoints(slide.points);
  // 설명 상자는 흰색이라 글자는 항상 짙은 색(밤 팔레트의 밝은 ink는 여기서 사라진다).
  const boxInk=inkOn("#ffffff",palette);
  const measured=await pointLayers(lines,0,{left:MARGIN+40,width:CONTENT-80,numbered:true,color:boxInk,markerColor:readableOn(palette.accent,"#ffffff",3),size:POINT});
  const boxH=lines.length?measured.bottom+72:0;
  // 변형 0: 사진 → 설명 상자(기존). 변형 1: 설명 상자를 먼저 두고 사진을 아래에 크게.
  const textFirst=currentVariant()%2===1&&boxH>0;
  const contentTop=Math.max(84+R*2+40,84+headline.info.height+48);
  const PHOTO_H=Math.max(closing?240:340,Math.min(700,bottom-(boxH?boxH+32:0)-contentTop));
  const boxTop=textFirst?contentTop:contentTop+PHOTO_H+32;
  const photoTop=textFirst?boxTop+boxH+32:contentTop;
  const points=await pointLayers(lines,boxTop+40,{left:MARGIN+40,width:CONTENT-80,numbered:true,color:boxInk,markerColor:readableOn(palette.accent,"#ffffff",3),size:POINT});
  const layers:OverlayOptions[]=[
    // STEP 스티커는 점선 고리로 한 번 더 두르고, 옆에 반짝이. 사진과 설명 상자 뒤에는 번진 그림자.
    svgLayer(ring({cx:stickerX,cy:stickerY,r:R+14,color:palette.accent,strokeWidth:3,dashed:true,opacity:.5})+sparkles([[stickerX+R+30,stickerY-R-4,14],[stickerX-R-18,stickerY+R+10,10]],palette.accent)
      +`<circle cx="${stickerX+4}" cy="${stickerY+6}" r="${R}" fill="#000" fill-opacity=".12"/><circle cx="${stickerX}" cy="${stickerY}" r="${R}" fill="#ffffff" stroke="${palette.accent}" stroke-width="6"/>`
),
    await cardShadow({x:MARGIN,y:photoTop+12,width:CONTENT,height:PHOTO_H,rx:24,blur:16,opacity:.18}),
    {input:howTo.data,left:stickerX-Math.round(howTo.info.width/2),top:stickerY-Math.round(howTo.info.height/2)},
    {input:headline.data,left:MARGIN+R*2+36,top:84+Math.max(0,Math.round((R*2-headline.info.height)/2))},
    {input:await croppedPhoto(inputs[0],CONTENT,PHOTO_H,24),left:MARGIN,top:photoTop},
    svgLayer(washiTape({x:1080-MARGIN-150,y:photoTop-20,width:200,color:palette.highlight,angle:9,opacity:.8})),
  ];
  if(boxH){
    layers.push(svgLayer(softShadow({x:MARGIN,y:boxTop+8,width:CONTENT,height:boxH,rx:28,blur:14,opacity:.12})+`<rect x="${MARGIN}" y="${boxTop}" width="${CONTENT}" height="${boxH}" rx="28" fill="#ffffff"/>`));
    layers.push(...points.layers);
  }
  if(closing)layers.push(...closing.place(540,bottom+18));
  layers.push(...foot.layers);
  layers.push(await grainLayer());
  return texturedCanvas(palette.soft,layers);
}

// 9. Q&A 말풍선: 연회색 바탕에 위 왼쪽 어두운 질문 말풍선, 아래 오른쪽 강조색 답변 말풍선, 그 아래 형광펜 팁.
async function composeQa(slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  // 바탕은 팔레트 바탕색, 질문 말풍선은 팔레트 글자색(ink)으로 칠하고 그 위 글자는 바탕색으로 쓴다.
  // 밝은 팔레트는 "밝은 바탕·짙은 질문", 밤 팔레트는 "어두운 바탕·밝은 질문"으로 자연스럽게 뒤집힌다.
  const bg=palette.paper,dark=palette.ink,onDark=palette.paper;
  const bgInk=inkOn(bg,palette),bgMuted=mutedOn(bg,palette);
  const lines=cleanPoints(slide.points);
  const answer=lines.length>=2?lines.slice(0,-1).join(" "):lines[0]??"";
  const tip=lines.length>=2?lines[lines.length-1]:"";
  const BUBBLE_W=800,PAD=40;
  // 마스코트가 오른쪽 아래에서 답변을 거든다. 마스코트가 있으면 팁 글은 그만큼 좁게 접는다.
  const MASCOT_W=230;
  // 마지막 장은 오른쪽 아래가 가게 명함 자리라 마스코트를 쉬게 한다.
  const closing=isLast(slide,index,total)?await closingPlan({color:bgInk,accent:palette.accent}):null;
  const foot=await footerPlan(slide,index,total,{ink:bgInk,muted:bgMuted,top:1284});
  const mascot=closing?null:await mascotLayer({width:MASCOT_W,pose:poseFor(slide,"tip"),left:1080-MARGIN+18,top:1266,anchor:"bottom-right"});
  const LIMIT=1262-foot.extra-(closing?closing.height+40:0);
  // 질문·답변이 짧으면 화면 위아래가 비므로, 큰 글자부터 그려 보고 블록이 1000px 안에 들어가는 가장 큰 배율을 쓴다.
  // 변형 0: 질문·답변 말풍선(기존). 변형 1: 큰 "Q." 머리글과 질문 글, 왼쪽에 강조색 막대가 있는 흰 답변 카드.
  const cardStyle=currentVariant()%2===1;
  const answerInk=cardStyle?inkOn("#ffffff",palette):palette.onAccent;
  const draw=async(scale:number)=>{
    // 질문(제목)은 말풍선 안 본문 장 제목: 56px부터. 답변은 요점보다 한 단계 큰 굵은 글. 핵심어는 질문 바탕 위 강조색으로.
    const q=await slideTitle(slide,{sizes:[Math.round(64*scale),Math.round(60*scale),Math.round(56*scale)],color:cardStyle?bgInk:onDark,accent:cardStyle?readableOn(palette.accent,bg,3):readableOn(palette.highlight,dark,3),width:BUBBLE_W-PAD*2,maxHeight:Math.round(320*scale),balance:true});
    const a=await textLayer(answer||"—",{size:Math.round(38*scale),color:answerInk,width:BUBBLE_W-PAD*2,height:Math.round(360*scale),font:FONTS.bold,spacing:8});
    const tipLayer=tip?await textLayer(tip,{size:Math.round(POINT*scale),color:bgInk,width:CONTENT-120-(mascot?MASCOT_W-20:0),height:Math.round(160*scale),font:FONTS.semibold,spacing:6}):null;
    return {q,a,tipLayer,height:q.info.height+a.info.height+PAD*4+90+(tipLayer?70+tipLayer.info.height:0)};
  };
  let fitted=await draw(1);
  for(const scale of [1.15,1.08]){
    const candidate=await draw(scale);
    if(candidate.height<=LIMIT-120){fitted=candidate;break;}
  }
  const {q,a,tipLayer}=fitted;
  const qH=q.info.height+PAD*2,aH=a.info.height+PAD*2;
  // 남는 높이가 크면(마지막 장처럼 블록이 작아진 경우) 질문→답변, 답변→팁 사이를 조금씩(각 최대 60) 벌린 뒤 가운데에 둔다.
  // 예전에는 블록을 그대로 가운데에 두어 팁과 명함 사이가 250px 넘게 비었다.
  const gaps=tipLayer?2:1;
  const grow=Math.max(0,Math.min(60,Math.floor((LIMIT-100-fitted.height)/(gaps+2))));
  // 두 말풍선 사이는 130을 넘기지 않는다(말풍선 사이 맨바닥이 150을 넘으면 그 자체가 빈 띠다).
  const QA_GAP=90+Math.min(40,grow),TIP_GAP=70+grow;
  // 질문·답변·팁 블록을 화면 세로 가운데에 둔다.
  const blockHeight=fitted.height+(QA_GAP-90)+(tipLayer?grow:0);
  // 마지막 장은 블록 바로 아래(LIMIT+10)에 명함이 오므로 위쪽 160을 뺀 범위의 가운데에 두어 명함 쪽으로 붙인다.
  // 단 팁과 명함 사이는 최소 40(LIMIT-30 + 명함 10)을 남긴다.
  const qX=MARGIN+70,qY=Math.max(100,Math.min(Math.round(((closing?160:0)+LIMIT-blockHeight)/2),LIMIT-(closing?30:0)-blockHeight));
  const aX=1080-MARGIN-70-BUBBLE_W,aY=qY+qH+QA_GAP;
  // 말풍선·답변 카드는 속이 꽉 찬 도형이라 자동 검수의 빈 띠 계산에서 "찬 자리"로 치도록 장식(ornament)으로 등록한다.
  // 말풍선 안쪽 여백(위아래 40)이 글자 사이 빈 줄로 잘못 잡히지 않게. 점 무늬·덩어리·그림자는 따로 두고 등록하지 않는다.
  const filledShape=(body:string)=>{const layer=svgLayer(body);registerDecor(layer.input as Buffer,"ornament");return layer;};
  const badge=(x:number,y:number,letter:string,fill:string)=>`<circle cx="${x}" cy="${y}" r="34" fill="${fill}"/>`;
  const qLetter=await textLayer("Q",{size:34,color:onDark,width:60,height:44,font:FONTS.bold,align:"centre"});
  const aLetter=await textLayer("A",{size:34,color:palette.onAccent,width:60,height:44,font:FONTS.bold,align:"centre"});
  const bigQ=cardStyle?await textLayer("Q.",{size:110,color:palette.accent,width:200,height:130,font:DECOR_FONT,spacing:0}):null;
  const layers:OverlayOptions[]=cardStyle&&bigQ?[
    svgLayer(dotGrid({x:820,y:48,width:230,height:Math.max(60,qY-70),color:bgInk,opacity:.18})
      +softShadow({x:aX,y:aY+12,width:BUBBLE_W,height:aH,rx:24,blur:16,opacity:.16})),
    filledShape(`<rect x="${aX}" y="${aY}" width="${BUBBLE_W}" height="${aH}" rx="24" fill="#ffffff"/><rect x="${aX}" y="${aY}" width="12" height="${aH}" rx="6" fill="${palette.accent}"/>`
      +`<path d="M${qX} ${qY+qH+30}H${qX+160}" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round"/>`),
    {input:bigQ.data,left:MARGIN-6,top:qY-bigQ.info.height+36},
    {input:q.data,left:qX+PAD,top:qY+PAD},
    {input:a.data,left:aX+PAD,top:aY+PAD},
  ]:[
    // 배경 장식: 오른쪽 위 점 무늬, 왼쪽 아래 옅은 강조색 덩어리. 말풍선 뒤에 번진 그림자.
    // 말풍선 꼬리는 말하는 쪽을 가리킨다: 질문은 왼쪽 Q 동그라미, 답변은 오른쪽 A 동그라미 쪽으로 뻗는다.
    svgLayer(dotGrid({x:820,y:48,width:230,height:Math.max(60,qY-70),color:bgInk,opacity:.18})+blob({cx:90,cy:1230,r:160,color:palette.accent,opacity:.12,seed:4})
      +softShadow({x:qX,y:qY+12,width:BUBBLE_W,height:qH,rx:30,blur:16,opacity:.16})+softShadow({x:aX,y:aY+12,width:BUBBLE_W,height:aH,rx:30,blur:16,opacity:.16})),
    filledShape(`<rect x="${qX}" y="${qY}" width="${BUBBLE_W}" height="${qH}" rx="30" fill="${dark}"/><path d="M${qX+4} ${qY+18}L${qX-26} ${qY+34}L${qX+4} ${qY+50}z" fill="${dark}"/>${badge(MARGIN+34,qY+34,"Q",dark)}`),
    {input:qLetter.data,left:MARGIN+34-Math.round(qLetter.info.width/2),top:qY+34-Math.round(qLetter.info.height/2)},
    {input:q.data,left:qX+PAD,top:qY+PAD},
    filledShape(`<rect x="${aX}" y="${aY}" width="${BUBBLE_W}" height="${aH}" rx="30" fill="${palette.accent}"/><path d="M${aX+BUBBLE_W-4} ${aY+18}L${aX+BUBBLE_W+26} ${aY+34}L${aX+BUBBLE_W-4} ${aY+50}z" fill="${palette.accent}"/>${badge(1080-MARGIN-34,aY+34,"A",palette.accent)}`),
    {input:aLetter.data,left:1080-MARGIN-34-Math.round(aLetter.info.width/2),top:aY+34-Math.round(aLetter.info.height/2)},
    {input:a.data,left:aX+PAD,top:aY+PAD},
  ];
  if(tipLayer){
    // 팁 머리표: 영문 TIP 대신 한글 "팁"(영문 장식 문구 한글화).
    const label=await textLayer("팁",{size:28,color:bgInk,width:80,height:40,font:FONTS.bold});
    const text=tipLayer;
    const tipY=aY+aH+TIP_GAP;
    // 형광펜 자국은 글 바로 뒤의 평행사변형. skewX를 그대로 쓰면 원점 기준으로 밀려 글과 어긋난다.
    const hx=MARGIN+92,hy=tipY+8,hw=text.info.width+36,hh=text.info.height,slant=Math.round(hh*.12);
    layers.push(svgLayer(`<polygon points="${hx+slant},${hy} ${hx+hw+slant},${hy} ${hx+hw},${hy+hh} ${hx},${hy+hh}" fill="${palette.highlight}" fill-opacity=".7"/>`
      +sparkles([[MARGIN+52,tipY-12,13],[MARGIN+140+text.info.width,tipY+text.info.height+10,10]],palette.accent)));
    layers.push({input:label.data,left:MARGIN+20,top:tipY+8},{input:text.data,left:MARGIN+100,top:tipY});
  }
  // 마스코트는 답변 말풍선과 겹치지 않을 때만 올린다.
  // 그려진 실제 높이(mascot.top)로 판단한다: 포즈마다 그림 비율이 달라 고정 비율로 재면 머리가 말풍선을 덮을 수 있다.
  if(mascot&&aY+aH+16<=mascot.top)layers.push(svgLayer(mascotContact(mascot,.2)),mascot);
  if(closing)layers.push(...closing.place(540,LIMIT+10));
  layers.push(...foot.layers);
  layers.push(await grainLayer());
  return texturedCanvas(bg,layers);
}

// 10. 인용구: 톤을 낮춘 사진 위에 큰 따옴표, 흰 인용구, 아래 구분선과 출처 줄.
async function composeQuote(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
  const white="#ffffff";
  // 예전에는 채도 .3·밝기 .55로 사진 전체를 회색에 가깝게 눌렀다. 글자 뒤 띠(아래 qband·qfoot)가 읽힘을 맡으므로
  // 사진은 채도 .6·밝기 .72까지만 낮춰 음식 색이 남게 한다.
  const background=await sharp(await finishPhoto(inputs[0],1080,1350)).modulate({saturation:.6,brightness:.72}).png().toBuffer();
  // 채도·밝기를 낮춰 새 버퍼가 되므로 사진으로 다시 등록한다(검수의 사진 면적).
  registerPhoto(background);
  const mark=await textLayer("“",{size:220,color:palette.highlight,width:300,height:240,font:DECOR_FONT,spacing:0});
  // 인용구는 표지로도 쓰이므로 쉼표 같은 의미 단위에서 두 줄로 나눠 "…막걸리 한 / 잔"처럼 한 글자만 남는 줄을 막는다.
  // 변형 0: 왼쪽 정렬(기존). 변형 1: 가운데 정렬, 따옴표와 강조선도 가운데.
  const centred=currentVariant()%2===1;
  const cover=isCover(slide),last=isLast(slide,index,total);
  const quote=await slideTitle(slide,{sizes:cover?COVER_TITLE:BODY_TITLE,color:white,accent:palette.highlight,align:centred?"centre":"left",width:centred?CONTENT:860,maxHeight:cover?460:420});
  const subline=await sublineLayer(slide,{color:"#fffffff0",align:centred?"centre":"left",width:centred?CONTENT:860});
  const lines=cleanPoints(slide.points);
  // 마지막 장이면 오른쪽 아래에서 마스코트가 손을 흔든다(bye). 출처·부연 글과 가게 명함은 마스코트 폭만큼 왼쪽 칸에 둔다.
  const MASCOT_W=230;
  const mascot=index===total?await mascotLayer({width:MASCOT_W,pose:"bye",left:1080-MARGIN+24,top:1310,anchor:"bottom-right"}):null;
  // 본문 장은 오른쪽 아래에 넘겨 보기를 두므로 부연 글을 그만큼 좁게 접는다.
  const cue=!cover&&!last?await cueAt(white,{backdrop:true}):null;
  const textW=CONTENT-(mascot?MASCOT_W-10:0);
  const source=await textLayer(slide.keywords.length?`${STORE_NAME} · ${slide.keywords.join(" · ")}`:STORE_NAME,{size:META,color:white,width:textW,height:80,font:FONTS.semibold});
  const sub=lines[0]?await textLayer(lines[0],{size:POINT,color:"#ffffffcc",width:textW-(cue?cue.width+48:0),height:140,font:FONTS.regular,spacing:6}):null;
  // 표지는 부연 글 대신 예고 띠를 출처 줄 아래에.
  const teaser=await teaserLayer(slide,total,"#fffffff2");
  const tail=sub??teaser;
  const closing=last?await closingPlan({color:white,accent:palette.accent,width:textW}):null;
  // 아래 묶음(강조선 → 출처 → 부연/예고 → 명함)을 바닥에서 위로 쌓아 위치를 정한다. 보통 장은 예전 자리(선 1150, 출처 1176).
  const closingTop=closing?1300-closing.height:1350;
  const SRC_Y=closing?closingTop-30-(tail?tail.info.height+12:0)-source.info.height:1176;
  const RULE_Y=SRC_Y-26;
  const quoteBottom=RULE_Y-60-(subline?28+subline.info.height:0);
  const quoteTop=Math.max(170,Math.min(Math.max(320,Math.round((1350-quote.info.height)/2)-80),quoteBottom-quote.info.height));
  const counter=await counterLayer(index,total,"#fffffff2",true);
  const footTop=RULE_Y-60;
  const layers:OverlayOptions[]=[
    // 사진 전체를 덮던 검은 막(.18)은 .10으로 옅게 남기고, 글자가 실제로 놓이는 두 곳에만 띠를 깐다.
    // ① 따옴표(quoteTop−150)부터 인용구 끝까지: 위아래로 흐려지는 세로 그라데이션. ② 출처·부연 줄 뒤: 아래로 짙어지는 띠.
    // 그 사이(대개 음식이 있는 가운데 아래쪽)는 어둡게 누르지 않는다. 흰 사진에서도 따옴표·부연 줄이 3:1을 넘는 선에서 잡은 값.
    svgLayer(`<defs><linearGradient id="qband" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".22" stop-color="#000" stop-opacity=".6"/><stop offset=".85" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="qfoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="${(60/(1350-footTop)).toFixed(2)}" stop-color="#000" stop-opacity=".62"/><stop offset="1" stop-color="#000" stop-opacity=".72"/></linearGradient></defs>`
      +`<rect width="1080" height="1350" fill="#000" fill-opacity=".10"/><rect x="0" y="${quoteTop-230}" width="1080" height="${quote.info.height+(subline?28+subline.info.height:0)+330}" fill="url(#qband)"/><rect x="0" y="${footTop}" width="1080" height="${1350-footTop}" fill="url(#qfoot)"/>`+cornerMarks({inset:40,length:54,color:palette.highlight,opacity:.65})),
    {input:mark.data,left:centred?540-Math.round(mark.info.width/2):MARGIN-8,top:quoteTop-150},
    {input:quote.data,left:centred?Math.round((1080-quote.info.width)/2):MARGIN,top:quoteTop},
    // 따옴표 옆과 인용구 끝에 작은 반짝이. 출처 줄 위의 짧은 강조선은 그대로 둔다.
    svgLayer(`<path d="M${centred?480:MARGIN} ${RULE_Y}H${centred?600:MARGIN+120}" stroke="${palette.highlight}" stroke-width="3"/>`
      +sparkles(centred?[[540+Math.round(mark.info.width/2)+20,quoteTop-96,18]]:[[MARGIN+150,quoteTop-96,18],[Math.min(1030,MARGIN+quote.info.width+30),quoteTop+quote.info.height+6,12]],palette.highlight,.9)),
    {input:source.data,left:centred?Math.round((1080-source.info.width)/2):MARGIN,top:SRC_Y},
    {input:counter.data,left:1080-MARGIN-counter.info.width,top:64},
  ];
  if(subline)layers.push({input:subline.data,left:centred?Math.round((1080-subline.info.width)/2):MARGIN,top:quoteTop+quote.info.height+28});
  if(tail)layers.push({input:tail.data,left:centred&&!cue?Math.round((1080-tail.info.width)/2):MARGIN,top:SRC_Y+source.info.height+12});
  if(cue){const placed=cue.place(1080-MARGIN-cue.width,1350-64);layers.push(svgLayer(placed.svg),placed.layer);}
  if(closing)layers.push(...closing.place(MARGIN+textW/2,closingTop));
  if(mascot)layers.push(svgLayer(mascotContact(mascot,.3)),mascot);
  layers.push(photoOverlayLayer(),await grainLayer({opacity:.12}));
  return sharp(background).composite(layers).jpeg({quality:90}).toBuffer();
}

const CARD_RENDERERS:Record<CardLayout,(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette)=>Promise<Buffer>>={
  fullscreen:composeFullscreen,
  frame:composeFrame,
  illustration:composeIllustration,
  collage:composeCollage,
  browser:(_inputs,slide,index,total,palette)=>composeBrowser(slide,index,total,palette),
  stat:(_inputs,slide,index,total,palette)=>composeStat(slide,index,total,palette),
  versus:composeVersus,
  step:composeStep,
  qa:(_inputs,slide,index,total,palette)=>composeQa(slide,index,total,palette),
  quote:(inputs,slide,index,total,palette)=>composeQuote(inputs,slide,index,total,palette),
  // 잡지·분할·폴라로이드·영수증·체크리스트·타임라인·포스터·원형 사진(render/extraLayouts.ts).
  ...EXTRA_RENDERERS,
};

// 사진 한 장 또는 여러 장(콜라주)을 받아 한 장의 카드로 만든다. 브라우저형은 사진 없이 그린다.
// options.photoKind: 사진 보정 방식(render/photoEnhance.ts).
//   "real" 사장님이 찍은 사진 → 온기 보존 색균형·대비·밝기·따뜻한 색 vibrance 전부
//   "ai"   이미지 AI가 만든 사진 → 따뜻한 색 vibrance만 약하게(색·밝기는 이미 정돈돼 있음)
//   "none" 보정 없음(기본값. 검수 스크립트·테스트가 같은 입력으로 같은 그림을 보게)
// options.enhance는 예전 호출과의 호환용이다(true → "real").
// remoteCutout: 설정의 "원격 누끼"가 켜졌을 때만 true. 누끼 계열(colorblock·popup·kitsch)이 Higgsfield 배경 제거를 먼저 시도한다.
export type CardOptions={photoKind?:PhotoKind;enhance?:boolean;brandHandle?:string;remoteCutout?:boolean};
const photoKindOf=(options:CardOptions):PhotoKind=>options.photoKind??(options.enhance?"real":"none");
export async function composeSlideImage(input:Buffer|Buffer[],slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT,design?:DesignSpecInput,options:CardOptions={}):Promise<Buffer> {
  return (await composeSlideCard(input,slide,index,total,layout,design,options)).image;
}

// 카드와 자동 검수 결과를 함께 돌려준다. options.contrast를 켜면 글자 대비까지 잰다(검수 스크립트·테스트용).
export async function composeSlideCard(input:Buffer|Buffer[],slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout=DEFAULT_SLIDE_LAYOUT,design?:DesignSpecInput,options:CardOptions&{contrast?:boolean}={}):Promise<{image:Buffer;report:AuditReport}> {
  await access(FONTS.bold.file);
  const raw=Array.isArray(input)?input:[input];
  const kind=photoKindOf(options);
  // 메뉴별 보정(홍어·삼합·막걸리·전): 장 제목과 키워드에서 메뉴를 찾는다. 못 찾으면 기본 보정.
  const food=kind==="none"?null:foodLookOf([slide.headline,...(slide.keywords??[])].join(" "));
  const inputs=kind==="none"?raw:await Promise.all(raw.map(photo=>enhancePhoto(photo,{kind,food})));
  const card:CardLayout=layout==="overlay"?"fullscreen":normalizeCardLayout(slide);
  if(photosNeeded(card)>0&&!inputs.length)throw new Error("slide image required");
  const fonts=resolveSlideFonts(design,slide);
  const palette=paletteOf(design);
  // 글꼴·게시물 테마·레이아웃 변형 번호를 이 카드를 그리는 동안에만 쓰도록 묶어 둔다(render/primitives.ts).
  // 스타일 계열이 정해져 있으면(template이 아님) 레이아웃 대신 그 계열의 그리기 함수가 장 전체를 그린다.
  // 단 "사진 위 글자"(overlay)로 고른 경우는 계열과 무관하게 풀스크린으로 그린다.
  const style=design?.style??"template";
  const render=style!=="template"&&layout!=="overlay"?STYLE_RENDERERS[style]:CARD_RENDERERS[card];
  const draw=(current:CarouselSlidePlan)=>withRenderContext({typography:typographyOf(fonts.titleFont,fonts.bodyFont),theme:design?.theme??"classic",variant:current.variant??0,palette,brandHandle:options.brandHandle,tone:design?.tone,remoteCutout:options.remoteCutout},()=>render(inputs,current,index,total,palette));
  // 그린 카드를 바로 검수해서(render/audit.ts) 글자가 넘치거나 겹치면 요점을 뒤에서부터 하나씩 빼고 다시 그린다(최대 2번).
  // 그래도 남으면 문제가 가장 적은 결과를 쓰고 서버 로그에 남긴다. 대비 검사는 무거워서 자동 검수 테스트에서만 한다.
  let current=slide,best:{image:Buffer;report:AuditReport;count:number}|null=null;
  for(let attempt=0;attempt<3;attempt++){
    const {image,report}=await auditRender(()=>draw(current),{contrast:options.contrast??false,cover:index===1,...(options.contrast?{photos:raw}:{})});
    const count=report.issues.filter(issue=>issue.kind==="overflow"||issue.kind==="overlap").length;
    if(!best||count<best.count)best={image,report,count};
    if(count===0)break;
    const points=cleanPoints(current.points);
    if(attempt===2||points.length<=1){console.warn(`[cards] ${index}번 장 자동 검수 문제가 남았어요:`,report.issues.map(describeIssue).join(" / "));break;}
    current={...current,points:points.slice(0,-1)};
  }
  return {image:best!.image,report:best!.report};
}
