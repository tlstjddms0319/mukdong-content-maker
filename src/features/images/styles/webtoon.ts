import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { croppedPhoto, mascotLayer, svgLayer, textLayer, type CardRenderer, type Layer, type TextEmphasis, brandName } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import type { MascotPose } from "../decor";
import { STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, outlinedText } from "./shared";

// 웹툰·만화 컷: 두꺼운 검은 테두리로 화면을 두 칸으로 나눈다. 위 칸은 음식 장면(또는 큰 제목)과 노란 해설 상자,
// 아래 칸은 집중선 앞에서 마스코트가 과장된 표정으로 반응하고, 말풍선 꼬리가 마스코트 입 쪽을 가리킨다.
// 장을 넘길 때마다 마스코트 표정과 효과음(톡!·두둥! 등)이 바뀌어 만화책을 넘기는 느낌을 준다.
const LINE="#111111",PAPER="#FFFFFF",NARRATION="#FFE14D";
const REACTIONS:MascotPose[]=["wow","love","tip","curious","hello"];
const SOUNDS=["톡!","두둥!","쫀득!","캬~","오잉?","짠!"];
// 제목 핵심어 강조색. 노란 해설 상자 위 진한 빨강(약 4.6:1), 외곽선 제목에선 검은 외곽선이 대비를 맡으므로
// 노란 글자 제목엔 빨강, 흰 글자 제목엔 노랑(만화 말풍선 강조의 관용).
const EMPHASIS_ON_YELLOW="#C4161C",EMPHASIS_IN_OUTLINE_YELLOW="#FF4A3A",EMPHASIS_IN_OUTLINE_WHITE=NARRATION;
// 마지막 장 "저장해 두고 다시 보세요" 알약: 효과음과 같은 빨강 계열을 흰 글자가 읽히게(약 5:1) 조금 어둡게.
const CHIP_RED="#D0281C";

// 외곽선 글자(만화 제목). shared의 outlinedText와 같은 방식(외곽선 색을 16방향으로 밀어 찍고 위에 본래 색)이지만,
// 핵심어 강조를 채움 글자에만 걸어야 해서 이 파일에 둔다. 외곽선·그림자 글자는 강조 없이 한 색이다.
async function comicTitle(value:string,options:{size:number;width:number;fill:string;emphasis?:TextEmphasis}):Promise<Layer> {
  const style={size:options.size,width:options.width,height:4000,font:STYLE_FONTS.heavy,align:"centre" as const,spacing:Math.round(options.size*.1)};
  const fill=await textLayer(value,{...style,color:options.fill,emphasis:options.emphasis});
  const stroke=await textLayer(value,{...style,color:LINE});
  const s=9,shadowOffset=Math.round(s*1.6);
  const ring=Array.from({length:16},(_,i)=>{const a=(Math.PI*2*i)/16;return [Math.round(Math.cos(a)*s),Math.round(Math.sin(a)*s)] as const;});
  const layers:OverlayOptions[]=[];
  for(const [dx,dy] of ring)layers.push({input:stroke.data,left:s+dx+shadowOffset,top:s+dy+shadowOffset});
  for(const [dx,dy] of ring)layers.push({input:stroke.data,left:s+dx,top:s+dy});
  layers.push({input:fill.data,left:s,top:s});
  return sharp({create:{width:fill.info.width+s*2+shadowOffset,height:fill.info.height+s*2+shadowOffset,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}
// 한 점을 향해 모이는 집중선. 가운데는 비워 두고 바깥쪽에만 가는 삼각형을 촘촘히 그린다.
function speedLines(x:number,y:number,w:number,h:number,cx:number,cy:number,count=70,opacity=.85,hollow=.26):string {
  const R=Math.hypot(w,h);
  let d="";
  for(let i=0;i<count;i++){
    const a=(Math.PI*2*i)/count+((i*37)%7)*.01;
    const inner=R*(hollow+((i*13)%5)*.03),spread=.012+((i*7)%3)*.004;
    const p=(r:number,da:number)=>`${Math.round(cx+Math.cos(a+da)*r)} ${Math.round(cy+Math.sin(a+da)*r)}`;
    d+=`M${p(inner,0)}L${p(R,-spread)}L${p(R,spread)}Z`;
  }
  return `<clipPath id="panel${x}${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><path d="${d}" fill="${LINE}" fill-opacity="${opacity}" clip-path="url(#panel${x}${y})"/>`;
}

export const renderWebtoon:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const M=40,GUTTER=26,B=8;
  const W=1080-M*2;
  // 마지막 장은 맨 아래에 "명함 칸"(가게 이름·계정·저장 알약)을 한 칸 더 둔다. 만화의 마지막 칸처럼 칸 문법을 그대로 쓴다.
  // 명함 칸 높이를 먼저 예약하고 위 칸(사진)을 먼저 줄인다(위 44 / 아래 56). 아래 칸은 말풍선·마스코트가 들어갈 높이가 필요하다.
  const card=content.last?await closingBlock({width:W-360,color:LINE,accent:CHIP_RED,font:STYLE_FONTS.heavy}):null;
  const CARD_PAD=26,cardH=card?card.height+CARD_PAD*2:0,cardSpace=card?cardH+GUTTER:0;
  // 칸 비율: 표지는 음식 장면을 크게(위 70 / 아래 30), 본문은 55/45.
  // 본문을 58까지 키우면 아래 칸이 좁아져 말풍선과 해설 상자가 겹치고 요점이 잘린다.
  const TOP_H=Math.round((1350-M*2-GUTTER-60-cardSpace)*(content.cover&&inputs.length?.7:card?.44:.55)),BOTTOM_Y=M+TOP_H+GUTTER,BOTTOM_H=1350-M-60-cardSpace-BOTTOM_Y;
  const layers:OverlayOptions[]=[];
  let frames="";
  let coverTitle:OverlayOptions|null=null;
  // 위 칸: 사진이 있으면 사진, 없으면 집중선 위 큰 외곽선 제목.
  const shots=inputs.slice(0,2);
  const half=Math.round((W-GUTTER)/2);
  if(shots.length>1){
    // 사진 두 장: 위 칸을 좌우 두 컷으로 나눠 비교 장면처럼 보여 준다.
    for(const [i,shot] of shots.entries()){
      const photo=await croppedPhoto(shot,half,TOP_H,0);
      registerPhoto(photo);
      layers.push({input:photo,left:M+i*(half+GUTTER),top:M});
    }
  }else if(shots.length){
    const photo=await croppedPhoto(shots[0],W,TOP_H,0);
    registerPhoto(photo);
    layers.push({input:photo,left:M,top:M});
  }else{
    frames+=`<rect x="${M}" y="${M}" width="${W}" height="${TOP_H}" fill="${NARRATION}"/>`+speedLines(M,M,W,TOP_H,M+W/2,M+TOP_H/2,90);
  }
  // 표지 제목 띠: 사진 아래쪽에만 세로 그라데이션(투명 → 검정 .45)을 깔아 외곽선 제목이 사진 무늬에 묻히지 않게.
  // 음식 가운데(칸 위·가운데)는 덮지 않도록 칸 높이의 아래 45%에서만 시작한다.
  if(content.cover&&shots.length){
    const bandTop=M+Math.round(TOP_H*.55);
    frames+=`<defs><linearGradient id="wtband" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs><rect x="${M}" y="${bandTop}" width="${W}" height="${M+TOP_H-bandTop}" fill="url(#wtband)"/>`;
  }
  // 해설 상자(노란 네모)에 제목. 표지는 큰 외곽선 글자로 칸 가운데에.
  if(content.cover||!shots.length){
    const fill=content.cover?NARRATION:PAPER;
    const title=await comicTitle(content.headline,{size:content.cover?92:78,width:W-120,fill,emphasis:emphasisOf(content,content.cover?EMPHASIS_IN_OUTLINE_YELLOW:EMPHASIS_IN_OUTLINE_WHITE)});
    const top=shots.length?M+TOP_H-title.info.height-30:M+Math.round((TOP_H-title.info.height)/2);
    // 사진 두 장 표지는 가운데 칸 틈(맨 위에 다시 그리는 칸 틀)이 제목을 가르므로, 제목을 칸 틀 위에 얹는다(아래 coverTitle).
    if(content.cover&&shots.length>1)coverTitle={input:title.data,left:Math.round((1080-title.info.width)/2),top};
    else layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top});
    // 표지 부제: 위 칸 왼쪽 위 흰 해설 상자(만화 첫 칸의 "그날, 묵동에서…" 같은 내레이션 자리). 오른쪽 위 효과음 자리(약 330px)는 비운다.
    // 두 줄을 넘거나 제목과 닿으면 뺀다(넘침 금지).
    if(content.subline){
      const sub=await textLayer(content.subline,{size:34,color:LINE,width:W-430-44,height:4000,font:STYLE_FONTS.comic,spacing:6});
      const boxH=sub.info.height+28;
      if(sub.info.height<=100&&M+24+boxH+20<=top){
        frames+=`<rect x="${M+24}" y="${M+24}" width="${sub.info.width+44}" height="${boxH}" fill="${PAPER}" stroke="${LINE}" stroke-width="5"/>`;
        layers.push({input:sub.data,left:M+46,top:M+38});
      }
    }
  }else{
    // 오른쪽 위 효과음(약 330px)과 겹치지 않도록 해설 상자는 왼쪽에 좁게 둔다.
    // 두 컷이면 해설 상자를 왼쪽 컷 안에만 둔다.
    const box=await fitText(content.headline,{sizes:[44,40,36],width:shots.length>1?half-80:W-430,maxHeight:170,color:LINE,font:STYLE_FONTS.comic,spacing:6,emphasis:emphasisOf(content,EMPHASIS_ON_YELLOW)});
    frames+=`<rect x="${M+24}" y="${M+24}" width="${box.info.width+44}" height="${box.info.height+32}" fill="${NARRATION}" stroke="${LINE}" stroke-width="5"/>`;
    layers.push({input:box.data,left:M+46,top:M+40});
  }
  // 아래 칸: 집중선, 마스코트 반응, 말풍선, 효과음.
  frames+=`<rect x="${M}" y="${BOTTOM_Y}" width="${W}" height="${BOTTOM_H}" fill="${PAPER}"/>`;
  const pose:MascotPose=content.last?"bye":REACTIONS[(index-1)%REACTIONS.length];
  // 셋째 요점부터는 아래 칸 바닥의 가로 해설 띠(노란 상자)에 한 줄씩. 띠가 칸 폭을 다 쓰니 긴 요점도 한두 줄에 들어간다.
  // 마스코트와 말풍선은 그 띠 위에 남는 높이(무대)에 세운다. 띠를 먼저 재야 말풍선이 띠와 겹치지 않는다.
  // 표지는 요점이 없으니 같은 자리 띠에 "예고" 꼬리표 + 다음 화 예고(content.teaser)를 싣는다.
  const rest=content.points.slice(2);
  const note=rest.length?await fitText(rest.join("\n"),{sizes:[40],width:W-100,maxHeight:220,color:LINE,font:STYLE_FONTS.comic,spacing:6,balance:false}):null;
  const teaserTag=!note&&content.teaser?await textLayer("다음 화 예고",{size:28,color:PAPER,width:300,height:56,font:STYLE_FONTS.comic}):null;
  const teaser=teaserTag?await textLayer(content.teaser,{size:28,color:LINE,width:W-100-teaserTag.info.width-60,height:56,font:STYLE_FONTS.comic}):null;
  const bandH=note?note.info.height+28:teaser&&teaserTag?Math.max(teaser.info.height,teaserTag.info.height)+24:0;
  const noteTop=bandH?BOTTOM_Y+BOTTOM_H-24-bandH:BOTTOM_Y+BOTTOM_H;
  const stageTop=BOTTOM_Y+22,stageBottom=bandH?noteTop-12:BOTTOM_Y+BOTTOM_H-10;
  const mascot=await mascotLayer({width:340,pose,left:M+30,top:stageBottom,anchor:"bottom-left",maxHeight:stageBottom-stageTop-20});
  const focusX=mascot?mascot.left+mascot.width/2:M+200,focusY=mascot?mascot.top+mascot.height*.35:(stageTop+stageBottom)/2;
  frames+=speedLines(M,BOTTOM_Y,W,BOTTOM_H,focusX,focusY,70,.5,.36);
  // 말풍선에는 요점 앞쪽 두 줄. 꼬리는 마스코트 얼굴을 향한다.
  // 표지는 요점이 없으니 제목을 되풀이하지 않고 다음 장으로 이끄는 짧은 대사를 쓴다.
  const said=content.points.slice(0,2).join("\n")||(content.cover?"오늘 이야기,\n같이 볼래요?":content.headline);
  const bubbleX=mascot?mascot.left+mascot.width+10:M+80,bubbleW=1080-M-30-bubbleX;
  // 네모난 글자 덩어리의 모서리가 타원 밖으로 삐져나오지 않게: 글자 폭은 풍선 폭의 약 3/4,
  // 글자 높이 상한은 무대 높이에서 타원 여유(1.45배)를 빼고 역산한다.
  const room=stageBottom-stageTop;
  const speech=await fitText(said,{sizes:[50,46,42,40],width:Math.round(bubbleW*.76)-20,maxHeight:Math.floor((room-30)/1.45),color:LINE,font:STYLE_FONTS.comic,align:"centre",spacing:8});
  const bw=Math.max(300,Math.min(bubbleW,Math.round(speech.info.width*1.32+60)));
  const across=(speech.info.width/bw)**2;
  const bh=Math.min(room,Math.round(speech.info.height/Math.sqrt(Math.max(.3,1.05-across))+30));
  const bx=bubbleX+Math.round((bubbleW-bw)/2),by=stageTop+Math.round((room-bh)/2);
  const tailTip=`${Math.round(focusX+60)} ${Math.round(focusY)}`;
  frames+=`<path d="M${bx+bw*.22} ${by+bh*.78}L${tailTip}L${bx+bw*.36} ${by+bh*.88}Z" fill="${PAPER}" stroke="${LINE}" stroke-width="6" stroke-linejoin="round"/>`
    +`<ellipse cx="${bx+bw/2}" cy="${by+bh/2}" rx="${bw/2}" ry="${bh/2}" fill="${PAPER}" stroke="${LINE}" stroke-width="6"/>`
    +`<path d="M${bx+bw*.22+8} ${by+bh*.78-4}L${bx+bw*.36-4} ${by+bh*.88-6}" stroke="${PAPER}" stroke-width="10"/>`;
  if(bandH)frames+=`<rect x="${M+30}" y="${noteTop}" width="${W-60}" height="${bandH}" fill="${NARRATION}" stroke="${LINE}" stroke-width="5"/>`;
  // 명함 칸: 흰 칸 왼쪽에 기울어진 "끝!" 효과음, 가운데에 가게 이름(굵은 제목 글꼴)·계정·저장 알약.
  const cardY=BOTTOM_Y+BOTTOM_H+GUTTER;
  if(card)frames+=`<rect x="${M}" y="${cardY}" width="${W}" height="${cardH}" fill="${PAPER}"/>`;
  // 칸 틀·집중선·말풍선·해설 띠(frames)는 사진 바로 위, 제목·해설 글자보다 아래에 깔아야 글자가 가려지지 않는다.
  layers.splice(shots.length,0,svgLayer(frames));
  if(mascot)layers.push(mascot);
  layers.push({input:speech.data,left:bx+Math.round((bw-speech.info.width)/2),top:by+Math.round((bh-speech.info.height)/2)});
  if(note)layers.push({input:note.data,left:M+50,top:noteTop+14});
  if(teaser&&teaserTag){
    // "다음 화 예고" 검은 꼬리표 + 예고 글. 띠 안에서 세로 가운데.
    const tagX=M+50,tagY=noteTop+Math.round((bandH-teaserTag.info.height)/2);
    layers.push(svgLayer(`<rect x="${tagX-12}" y="${noteTop+8}" width="${teaserTag.info.width+24}" height="${bandH-16}" fill="${LINE}"/>`));
    layers.push({input:teaserTag.data,left:tagX,top:tagY});
    layers.push({input:teaser.data,left:tagX+teaserTag.info.width+36,top:noteTop+Math.round((bandH-teaser.info.height)/2)});
  }
  // 효과음: 위 칸 오른쪽 위에 기울어진 외곽선 글자.
  const sound=await outlinedText(SOUNDS[(index-1)%SOUNDS.length],{size:96,width:400,font:STYLE_FONTS.heavy,fill:"#FF3B30",stroke:PAPER,strokeWidth:8,shadow:LINE});
  const tilted=await sharp(sound.data).rotate(-12,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  layers.push({input:tilted.data,left:1080-M-tilted.info.width+10,top:M+10});
  if(card){
    const end=await outlinedText("끝!",{size:80,width:300,font:STYLE_FONTS.heavy,fill:"#FF3B30",stroke:PAPER,strokeWidth:7,shadow:LINE});
    const endTilted=await sharp(end.data).rotate(-10,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
    layers.push({input:endTilted.data,left:M+40,top:cardY+Math.round((cardH-endTilted.info.height)/2)});
    // 글 덩어리는 "끝!" 오른쪽 남는 폭의 가운데(끝! 자리 약 180px를 빼고).
    const centreX=M+180+(W-180)/2;
    let y=cardY+CARD_PAD;
    layers.push({input:card.wordmark.data,left:Math.round(centreX-card.wordmark.info.width/2),top:y});
    y+=card.wordmark.info.height;
    if(card.handle){
      y+=8;
      layers.push({input:card.handle.data,left:Math.round(centreX-card.handle.info.width/2),top:y});
      y+=card.handle.info.height;
    }
    y+=18+12;
    const chipX=Math.round(centreX-card.chip.info.width/2);
    layers.push(svgLayer(card.chipSvg(chipX,y)));
    layers.push({input:card.chip.data,left:chipX,top:y});
  }
  // 칸 테두리는 맨 위에 다시 그려 사진·글자가 칸 밖으로 넘치지 않은 것처럼 보이게 한다.
  const topFrame=shots.length>1
    ?`<rect x="${M+half}" y="${M-B}" width="${GUTTER}" height="${TOP_H+B*2}" fill="#F7F5F0"/><rect x="${M}" y="${M}" width="${half}" height="${TOP_H}" fill="none" stroke="${LINE}" stroke-width="${B}"/><rect x="${M+half+GUTTER}" y="${M}" width="${half}" height="${TOP_H}" fill="none" stroke="${LINE}" stroke-width="${B}"/>`
    :`<rect x="${M}" y="${M}" width="${W}" height="${TOP_H}" fill="none" stroke="${LINE}" stroke-width="${B}"/>`;
  const cardFrame=card?`<rect x="${M}" y="${cardY}" width="${W}" height="${cardH}" fill="none" stroke="${LINE}" stroke-width="${B}"/>`:"";
  layers.push(svgLayer(topFrame+`<rect x="${M}" y="${BOTTOM_Y}" width="${W}" height="${BOTTOM_H}" fill="none" stroke="${LINE}" stroke-width="${B}"/>`+cardFrame));
  if(coverTitle)layers.push(coverTitle);
  // 칸 밖 아래: 가운데 "가게 이름 · N화 / 전체"(tnum), 표지·마지막 장이 아니면 오른쪽 끝에 "다음 화 ›".
  // 마지막 장은 명함 칸에 계정이 있으니 바닥글엔 가게 이름만(같은 계정 두 번 금지).
  const page=await textLayer(`${content.last?STORE_NAME:brandName()}  ·  ${index}화 / ${total}`,{size:26,color:LINE,width:900,height:40,font:STYLE_FONTS.comic,align:"centre",features:"tnum"});
  const pageTop=1350-M-page.info.height+4;
  layers.push({input:page.data,left:Math.round((1080-page.info.width)/2),top:pageTop});
  if(!content.cover&&!content.last){
    const cue=await textLayer("다음 화",{size:28,color:LINE,width:200,height:50,font:STYLE_FONTS.comic});
    const arrowW=15,cueX=1080-M-cue.info.width-12-arrowW,cueY=pageTop+Math.round((page.info.height-cue.info.height)/2);
    const mid=cueY+cue.info.height/2,ax=cueX+cue.info.width+12;
    layers.push({input:cue.data,left:cueX,top:cueY});
    layers.push(svgLayer(`<path d="M${ax} ${mid-arrowW*.7}L${ax+arrowW} ${mid}L${ax} ${mid+arrowW*.7}" fill="none" stroke="${LINE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`));
  }
  return sharp({create:{width:1080,height:1350,channels:3,background:"#F7F5F0"}}).composite(layers).jpeg({quality:92}).toBuffer();
};
