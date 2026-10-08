import sharp, { type OverlayOptions } from "sharp";
import { access } from "node:fs/promises";
import { STORE_NAME } from "../slideLayout";
import { croppedPhoto, mascotLayer, svgLayer, textLayer, type CardRenderer, type Layer, type TextEmphasis, brandName } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { ROLE_POSES, cachedLayer, contactShadow, mascotFile, type MascotPose } from "../decor";
import { STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, outlinedText } from "./shared";

// 웹툰·만화 컷: 두꺼운 검은 테두리로 화면을 칸으로 나눈다. 사진 칸에는 음식 장면(또는 큰 제목)과 노란 해설 상자,
// 반응 칸에는 집중선 앞에서 마스코트가 과장된 표정으로 반응하고, 말풍선 꼬리가 마스코트 입 쪽을 가리킨다.
// 장을 넘길 때마다 마스코트 표정·효과음(톡!·두둥! 등)·칸 배치(위아래 바꾸기, 세로 2단)가 바뀌어 만화책을 넘기는 느낌을 준다.
const LINE="#111111",PAPER="#FFFFFF",NARRATION="#FFE14D";
const REACTIONS:MascotPose[]=["wow","love","tip","curious","hello"];
const SOUNDS=["톡!","두둥!","쫀득!","캬~","오잉?","짠!"];
// 제목 핵심어 강조색. 노란 해설 상자 위 진한 빨강(약 4.6:1), 외곽선 제목에선 검은 외곽선이 대비를 맡으므로
// 노란 글자 제목엔 빨강, 흰 글자 제목엔 노랑(만화 말풍선 강조의 관용).
const EMPHASIS_ON_YELLOW="#C4161C",EMPHASIS_IN_OUTLINE_YELLOW="#FF4A3A",EMPHASIS_IN_OUTLINE_WHITE=NARRATION;
// 마지막 장 "저장해 두고 다시 보세요" 알약: 효과음과 같은 빨강 계열을 흰 글자가 읽히게(약 5:1) 조금 어둡게.
const CHIP_RED="#D0281C";
// 집중선 진하기. 사진 없는 노란 제목 칸(.85)과 반응 칸(.5)이 달라 한 장 안에서 두 가지 펜처럼 보였다. 한 값으로 맞춘다.
const SPEED_OPACITY=.6;

type Panel={x:number;y:number;w:number;h:number};

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
function speedLines(p:Panel,cx:number,cy:number,count=70,hollow=.26):string {
  const R=Math.hypot(p.w,p.h);
  let d="";
  for(let i=0;i<count;i++){
    const a=(Math.PI*2*i)/count+((i*37)%7)*.01;
    const inner=R*(hollow+((i*13)%5)*.03),spread=.012+((i*7)%3)*.004;
    const pt=(r:number,da:number)=>`${Math.round(cx+Math.cos(a+da)*r)} ${Math.round(cy+Math.sin(a+da)*r)}`;
    d+=`M${pt(inner,0)}L${pt(R,-spread)}L${pt(R,spread)}Z`;
  }
  const id=`panel${p.x}_${p.y}`;
  return `<clipPath id="${id}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/></clipPath><path d="${d}" fill="${LINE}" fill-opacity="${SPEED_OPACITY}" clip-path="url(#${id})"/>`;
}

// 만화 칸 사진 덧씌움(하프톤 점 + 흰 안쪽 선). 칸 크기마다 한 번 굽고 다시 쓴다(전역 캐시).
// 하프톤: 대각선 두 모서리(왼쪽 위·오른쪽 아래)에서 칸 안쪽으로 갈수록 작아지는 검은 점. 만화 원고의 스크린톤처럼
// 사진 가장자리만 "인쇄된 그림"으로 바꾸고, 음식이 있는 가운데는 건드리지 않는다.
// 흰 안쪽 선: 검은 칸 테두리 안쪽에 한 줄 더 그어 사진이 칸 "안에" 끼워진 원고처럼 보이게 한다.
function comicOverlay(w:number,h:number):Promise<Buffer> {
  return cachedLayer(`webtoon:halftone:${w}x${h}`,async()=>{
    const R=Math.round(Math.min(w,h)*.36),step=13,maxR=4.6;
    let d="";
    for(const [ox,oy,sx,sy] of [[0,0,1,1],[w,h,-1,-1]] as const){
      for(let row=0;row*step<=R;row++){
        for(let gx=(row%2)*step/2;gx<=R;gx+=step){
          const gy=row*step*.87,dist=Math.hypot(gx,gy);
          if(dist>R)continue;
          const r=Math.round(maxR*(1-dist/R)**1.2*10)/10;
          if(r<.8)continue;
          const x=ox+sx*gx,y=oy+sy*gy;
          d+=`M${(x-r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`;
        }
      }
    }
    const svg=`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="${LINE}" fill-opacity=".32"/>`
      +`<rect x="12" y="12" width="${w-24}" height="${h-24}" fill="none" stroke="${PAPER}" stroke-opacity=".9" stroke-width="4"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  });
}
// 사진을 만화 칸처럼: 채도를 조금 올려 인쇄 색처럼 또렷하게 하고, 대비를 살짝(1.08) 올리되 −8로 내려 흰 접시가 하얗게 날지 않게.
// 덧씌움(하프톤·흰 선)까지 한 장으로 합쳐 사진으로 등록한다(검수의 사진 면적·글자 대비 계산이 이 버퍼를 사진으로 본다).
async function comicPhoto(shot:Buffer,w:number,h:number):Promise<Buffer> {
  const base=await croppedPhoto(shot,w,h,0);
  const photo=await sharp(base).modulate({saturation:1.12}).linear(1.08,-8).composite([{input:await comicOverlay(w,h),left:0,top:0}]).png({compressionLevel:2}).toBuffer();
  registerPhoto(photo);
  return photo;
}
async function isPortrait(shot:Buffer):Promise<boolean> {
  const meta=await sharp(shot).metadata();
  const swap=(meta.orientation??1)>=5;
  const w=(swap?meta.height:meta.width)??1,h=(swap?meta.width:meta.height)??1;
  return h>w;
}
// 역할에 맞는 포즈(ROLE_POSES). 그 포즈 그림 파일이 아직 없으면 mascotLayer는 hello로 대신 그리는데,
// 그러면 본문 장 대부분이 같은 손 인사가 되어 장마다 표정이 바뀌던 리듬이 죽는다. 파일이 있을 때만 쓰고 없으면 돌림 표정.
const poseReady=new Map<MascotPose,Promise<boolean>>();
function hasPose(pose:MascotPose):Promise<boolean> {
  if(!poseReady.has(pose))poseReady.set(pose,access(mascotFile(pose)).then(()=>true,()=>false));
  return poseReady.get(pose)!;
}
async function poseFor(role:string,index:number,cover:boolean,last:boolean):Promise<MascotPose> {
  if(last)return "bye";
  // 표지는 첫 칸의 "두둥!" 같은 놀람 표정(wow)이 만화 도입에 맞는다.
  if(cover)return "wow";
  const wanted=ROLE_POSES[role];
  if(wanted&&await hasPose(wanted))return wanted;
  return REACTIONS[(index-1)%REACTIONS.length];
}

// 반응 칸: 집중선, 마스코트, 말풍선, 아래 노란 해설 띠(셋째 요점부터) 또는 표지의 "다음 화 예고" 띠.
// vertical=false: 마스코트 왼쪽·말풍선 오른쪽(가로로 긴 칸). vertical=true: 말풍선 위·마스코트 아래(세로 2단의 좁은 칸).
// 세로 칸에서 글이 들어가지 않으면 null(부르는 쪽이 가로 배치로 되돌린다). 몰래 축소가 남지 않도록 먼저 가장 작은 크기로 재 본다.
// straddle: 마스코트가 칸 위 테두리 밖으로 넘어가도 되는 높이(표지·마지막 장에서 칸에 "걸쳐" 선 마스코트).
async function reactionPanel(p:Panel,o:{pose:MascotPose;said:string;rest:string[];teaser:string;vertical:boolean;straddle:number;mascotWidth:number;tilt:number}) {
  const {vertical}=o;
  const bandInset=vertical?20:30,textInset=vertical?40:50,noteW=p.w-textInset*2;
  const restText=o.rest.join("\n");
  if(vertical&&restText){
    const probe=await textLayer(restText,{size:40,color:LINE,width:noteW,height:4000,font:STYLE_FONTS.comic,spacing:6});
    if(probe.info.height>220)return null;
  }
  const note=restText?await fitText(restText,{sizes:[40],width:noteW,maxHeight:220,color:LINE,font:STYLE_FONTS.comic,spacing:6,balance:false}):null;
  const teaserTag=!note&&o.teaser?await textLayer("다음 화 예고",{size:28,color:PAPER,width:300,height:56,font:STYLE_FONTS.comic}):null;
  const teaser=teaserTag?await textLayer(o.teaser,{size:28,color:LINE,width:noteW-teaserTag.info.width-60,height:56,font:STYLE_FONTS.comic}):null;
  const bandH=note?note.info.height+28:teaser&&teaserTag?Math.max(teaser.info.height,teaserTag.info.height)+24:0;
  const noteTop=bandH?p.y+p.h-24-bandH:p.y+p.h;
  const stageTop=p.y+22,stageBottom=bandH?noteTop-12:p.y+p.h-10;
  const room=stageBottom-stageTop;
  let frames=`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${PAPER}"/>`;
  // 기울인 마스코트는 돌린 만큼 그림 상자가 커지므로 높이 상한을 조금 덜어 둔다.
  const mascot=vertical
    ?await mascotLayer({width:Math.min(o.mascotWidth,p.w-80),pose:o.pose,left:p.x,top:stageBottom,anchor:"bottom-left",maxHeight:Math.min(400,Math.round(room*.42))})
    :await mascotLayer({width:o.mascotWidth,pose:o.pose,...(o.tilt?{rotate:o.tilt}:{}),left:p.x+30,top:stageBottom,anchor:"bottom-left",maxHeight:Math.round((o.straddle?stageBottom-(p.y-o.straddle):room-20)*(o.tilt?.93:1))});
  if(mascot){
    if(vertical)mascot.left=p.x+Math.round((p.w-mascot.width)/2);
    // 칸 위로 넘치는 높이를 straddle까지만 허용한다(그 위는 사진 칸의 제목 자리).
    if(mascot.top<p.y-o.straddle)mascot.top=p.y-o.straddle;
  }
  const focusX=mascot?mascot.left+mascot.width/2:p.x+(vertical?p.w/2:200),focusY=mascot?mascot.top+mascot.height*.35:(stageTop+stageBottom)/2;
  frames+=speedLines(p,focusX,focusY,70,.36);
  // 발밑 접촉 그림자: 집중선 위·마스코트 아래. 기울인 그림은 상자 아래 귀퉁이가 투명해 발이 조금 위에 있다.
  if(mascot){
    const feet=mascot.top+mascot.height-(o.tilt?Math.round(mascot.width*.06):4);
    frames+=contactShadow({cx:focusX,cy:feet,rx:Math.round(mascot.width*.3),opacity:.3});
  }
  let speech:Layer,bx:number,by:number,bw:number,bh:number,tail:string;
  if(vertical){
    const mascotTop=mascot?mascot.top:stageBottom;
    const bubbleRoom=mascotTop-30-stageTop,bubbleX=p.x+20,bubbleW=p.w-40;
    const textW=Math.round(bubbleW*.76)-20,maxH=Math.floor((bubbleRoom-30)/1.45);
    const probe=await textLayer(o.said,{size:40,color:LINE,width:textW,height:4000,font:STYLE_FONTS.comic,align:"centre",spacing:8});
    if(probe.info.height>maxH)return null;
    speech=await fitText(o.said,{sizes:[50,46,42,40],width:textW,maxHeight:maxH,color:LINE,font:STYLE_FONTS.comic,align:"centre",spacing:8});
    bw=Math.max(300,Math.min(bubbleW,Math.round(speech.info.width*1.32+60)));
    const across=(speech.info.width/bw)**2;
    bh=Math.min(bubbleRoom,Math.round(speech.info.height/Math.sqrt(Math.max(.3,1.05-across))+30));
    bx=bubbleX+Math.round((bubbleW-bw)/2);by=stageTop+Math.round((bubbleRoom-bh)*.7);
    // 꼬리: 풍선 아래 왼쪽 둘레의 두 점에서 마스코트 머리 쪽으로.
    const on=(a:number)=>[Math.round(bx+bw/2+Math.cos(a)*bw/2*.96),Math.round(by+bh/2+Math.sin(a)*bh/2*.96)] as const;
    const [ax,ay]=on(1.85),[cx2,cy2]=on(2.3);
    const tip=`${Math.round(focusX+20)} ${Math.round(mascot?mascot.top+mascot.height*.12:by+bh+60)}`;
    tail=`<path d="M${cx2} ${cy2}L${tip}L${ax} ${ay}Z" fill="${PAPER}" stroke="${LINE}" stroke-width="6" stroke-linejoin="round"/>`;
    frames+=tail+`<ellipse cx="${bx+bw/2}" cy="${by+bh/2}" rx="${bw/2}" ry="${bh/2}" fill="${PAPER}" stroke="${LINE}" stroke-width="6"/>`
      +`<path d="M${cx2+6} ${cy2-6}L${ax-4} ${ay-8}" stroke="${PAPER}" stroke-width="10"/>`;
  }else{
    const bubbleX=mascot?mascot.left+mascot.width+10:p.x+80,bubbleW=p.x+p.w-30-bubbleX;
    // 네모난 글자 덩어리의 모서리가 타원 밖으로 삐져나오지 않게: 글자 폭은 풍선 폭의 약 3/4,
    // 글자 높이 상한은 무대 높이에서 타원 여유(1.45배)를 빼고 역산한다.
    speech=await fitText(o.said,{sizes:[50,46,42,40],width:Math.round(bubbleW*.76)-20,maxHeight:Math.floor((room-30)/1.45),color:LINE,font:STYLE_FONTS.comic,align:"centre",spacing:8});
    bw=Math.max(300,Math.min(bubbleW,Math.round(speech.info.width*1.32+60)));
    const across=(speech.info.width/bw)**2;
    bh=Math.min(room,Math.round(speech.info.height/Math.sqrt(Math.max(.3,1.05-across))+30));
    bx=bubbleX+Math.round((bubbleW-bw)/2);by=stageTop+Math.round((room-bh)/2);
    const tailTip=`${Math.round(focusX+60)} ${Math.round(focusY)}`;
    tail=`<path d="M${bx+bw*.22} ${by+bh*.78}L${tailTip}L${bx+bw*.36} ${by+bh*.88}Z" fill="${PAPER}" stroke="${LINE}" stroke-width="6" stroke-linejoin="round"/>`;
    frames+=tail+`<ellipse cx="${bx+bw/2}" cy="${by+bh/2}" rx="${bw/2}" ry="${bh/2}" fill="${PAPER}" stroke="${LINE}" stroke-width="6"/>`
      +`<path d="M${bx+bw*.22+8} ${by+bh*.78-4}L${bx+bw*.36-4} ${by+bh*.88-6}" stroke="${PAPER}" stroke-width="10"/>`;
  }
  if(bandH)frames+=`<rect x="${p.x+bandInset}" y="${noteTop}" width="${p.w-bandInset*2}" height="${bandH}" fill="${NARRATION}" stroke="${LINE}" stroke-width="5"/>`;
  const texts:OverlayOptions[]=[{input:speech.data,left:bx+Math.round((bw-speech.info.width)/2),top:by+Math.round((bh-speech.info.height)/2)}];
  if(note)texts.push({input:note.data,left:p.x+textInset,top:noteTop+14});
  if(teaser&&teaserTag){
    // "다음 화 예고" 검은 꼬리표 + 예고 글. 띠 안에서 세로 가운데.
    const tagX=p.x+textInset,tagY=noteTop+Math.round((bandH-teaserTag.info.height)/2);
    texts.push(svgLayer(`<rect x="${tagX-12}" y="${noteTop+8}" width="${teaserTag.info.width+24}" height="${bandH-16}" fill="${LINE}"/>`));
    texts.push({input:teaserTag.data,left:tagX,top:tagY});
    texts.push({input:teaser.data,left:tagX+teaserTag.info.width+36,top:noteTop+Math.round((bandH-teaser.info.height)/2)});
  }
  return {frames,mascot,texts};
}

export const renderWebtoon:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const M=40,GUTTER=26,B=8,FOOT=60;
  const W=1080-M*2;
  // 마지막 장은 맨 아래에 "명함 칸"(가게 이름·계정·저장 알약)을 한 칸 더 둔다. 만화의 마지막 칸처럼 칸 문법을 그대로 쓴다.
  // 명함 칸 높이를 먼저 예약하고 사진 칸을 먼저 줄인다(위 44 / 아래 56). 반응 칸은 말풍선·마스코트가 들어갈 높이가 필요하다.
  const card=content.last?await closingBlock({width:W-360,color:LINE,accent:CHIP_RED,font:STYLE_FONTS.heavy}):null;
  const CARD_PAD=26,cardH=card?card.height+CARD_PAD*2:0,cardSpace=card?cardH+GUTTER:0;
  const shots=inputs.slice(0,2);
  const body=!content.cover&&!content.last;
  // 칸 배치 변주(본문 장만): 장 번호를 셋으로 돌려 기본(사진 위) · 세로 2단(세로 사진 한 장일 때만) · 위아래 바꾸기.
  // 세로 2단은 세로로 긴 사진을 덜 잘라 보여 주려는 배치라 가로 사진이면 위아래 바꾸기로 대신한다. 사진 없는 장은 기본 배치.
  // 사선 칸(3칸 대각선)은 시험해 보니 글자 자리가 비뚤어져 읽기 어려워 쓰지 않는다.
  const turn=(index+(slide.variant??0))%3;
  let mode:"stack"|"flip"|"columns"="stack";
  if(body&&shots.length){
    if(turn===1)mode="flip";
    else if(turn===2)mode=shots.length===1&&await isPortrait(shots[0])?"columns":"flip";
  }
  // 칸 비율: 표지는 음식 장면을 크게(사진 70 / 반응 30), 본문은 55/45.
  // 본문을 58까지 키우면 반응 칸이 좁아져 말풍선과 해설 상자가 겹치고 요점이 잘린다.
  const avail=1350-M*2-GUTTER-FOOT-cardSpace;
  const photoH=Math.round(avail*(content.cover&&inputs.length?.7:card?.44:.55)),reactH=avail-photoH;
  const geometry=(m:typeof mode):{photo:Panel;react:Panel}=>{
    if(m==="flip")return {react:{x:M,y:M,w:W,h:reactH},photo:{x:M,y:M+reactH+GUTTER,w:W,h:photoH}};
    if(m==="columns"){
      // 세로 2단: 왼쪽 넓은 사진 칸(56%), 오른쪽 좁은 반응 칸(말풍선 위·마스코트 아래). 둘 다 바닥글 위까지.
      const colH=1350-M*2-FOOT,PW=Math.round((W-GUTTER)*.56);
      return {photo:{x:M,y:M,w:PW,h:colH},react:{x:M+PW+GUTTER,y:M,w:W-PW-GUTTER,h:colH}};
    }
    return {photo:{x:M,y:M,w:W,h:photoH},react:{x:M,y:M+photoH+GUTTER,w:W,h:reactH}};
  };
  // 반응 칸 먼저: 세로 2단에서 글이 안 들어가면 기본 배치로 되돌려야 하므로 사진을 그리기 전에 정한다.
  // 말풍선에는 요점 앞쪽 두 줄. 표지는 요점이 없으니 제목을 되풀이하지 않고 다음 장으로 이끄는 짧은 대사를 쓴다.
  // 셋째 요점부터는 반응 칸 바닥의 가로 해설 띠(노란 상자)에 한 줄씩. 표지는 같은 자리 띠에 "다음 화 예고".
  // 표지·마지막 장 마스코트는 칸 위 테두리에 걸쳐 선다(표지는 −6° 기울여 튀어나온 느낌, 마지막 장은 크게 손 인사).
  const said=content.points.slice(0,2).join("\n")||(content.cover?"오늘 이야기,\n같이 볼래요?":content.headline);
  const reactOptions={pose:await poseFor(slide.role,index,content.cover,content.last),said,rest:content.points.slice(2),teaser:content.teaser,
    straddle:content.cover||content.last?40:0,mascotWidth:content.last?400:340,tilt:content.cover?-6:0};
  let geo=geometry(mode);
  let react=await reactionPanel(geo.react,{...reactOptions,vertical:mode==="columns"});
  if(!react){mode="stack";geo=geometry(mode);react=await reactionPanel(geo.react,{...reactOptions,vertical:false});}
  if(!react)throw new Error("webtoon: reaction panel");
  const P=geo.photo,Rp=geo.react,straddling=reactOptions.straddle>0;
  const layers:OverlayOptions[]=[];
  let frames="";
  let coverTitle:OverlayOptions|null=null;
  // 사진 칸: 사진이 있으면 만화 칸 사진, 없으면 집중선 위 큰 외곽선 제목.
  const half=Math.round((P.w-GUTTER)/2);
  if(shots.length>1){
    // 사진 두 장: 사진 칸을 좌우 두 컷으로 나눠 비교 장면처럼 보여 준다.
    for(const [i,shot] of shots.entries())layers.push({input:await comicPhoto(shot,half,P.h),left:P.x+i*(half+GUTTER),top:P.y});
  }else if(shots.length){
    layers.push({input:await comicPhoto(shots[0],P.w,P.h),left:P.x,top:P.y});
  }else{
    frames+=`<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="${NARRATION}"/>`+speedLines(P,P.x+P.w/2,P.y+P.h/2,90);
  }
  // 표지 제목 띠: 사진 아래쪽에만 세로 그라데이션(투명 → 검정 .45)을 깔아 외곽선 제목이 사진 무늬에 묻히지 않게.
  // 음식 가운데(칸 위·가운데)는 덮지 않도록 칸 높이의 아래 45%에서만 시작한다.
  if(content.cover&&shots.length){
    const bandTop=P.y+Math.round(P.h*.55);
    frames+=`<defs><linearGradient id="wtband" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs><rect x="${P.x}" y="${bandTop}" width="${P.w}" height="${P.y+P.h-bandTop}" fill="url(#wtband)"/>`;
  }
  // 해설 상자(노란 네모)에 제목. 표지는 큰 외곽선 글자로 칸 가운데에.
  if(content.cover||!shots.length){
    const fill=content.cover?NARRATION:PAPER;
    const title=await comicTitle(content.headline,{size:content.cover?92:78,width:P.w-120,fill,emphasis:emphasisOf(content,content.cover?EMPHASIS_IN_OUTLINE_YELLOW:EMPHASIS_IN_OUTLINE_WHITE)});
    const top=shots.length?P.y+P.h-title.info.height-30:P.y+Math.round((P.h-title.info.height)/2);
    // 사진 두 장 표지는 가운데 칸 틈(맨 위에 다시 그리는 칸 틀)이 제목을 가르므로, 제목을 칸 틀 위에 얹는다(아래 coverTitle).
    if(content.cover&&shots.length>1)coverTitle={input:title.data,left:Math.round(P.x+(P.w-title.info.width)/2),top};
    else layers.push({input:title.data,left:Math.round(P.x+(P.w-title.info.width)/2),top});
    // 표지 부제: 사진 칸 왼쪽 위 흰 해설 상자(만화 첫 칸의 "그날, 묵동에서…" 같은 내레이션 자리). 오른쪽 위 효과음 자리(약 330px)는 비운다.
    // 두 줄을 넘거나 제목과 닿으면 뺀다(넘침 금지).
    if(content.subline){
      const sub=await textLayer(content.subline,{size:34,color:LINE,width:P.w-430-44,height:4000,font:STYLE_FONTS.comic,spacing:6});
      const boxH=sub.info.height+28;
      if(sub.info.height<=100&&P.y+24+boxH+20<=top){
        frames+=`<rect x="${P.x+24}" y="${P.y+24}" width="${sub.info.width+44}" height="${boxH}" fill="${PAPER}" stroke="${LINE}" stroke-width="5"/>`;
        layers.push({input:sub.data,left:P.x+46,top:P.y+38});
      }
    }
  }else{
    // 오른쪽 위 효과음(약 330px)과 겹치지 않도록 해설 상자는 왼쪽에 좁게 둔다. 두 컷이면 왼쪽 컷 안에만,
    // 세로 2단이면 효과음이 사진 칸 아래로 내려가므로 칸 폭을 거의 다 쓴다.
    const boxW=shots.length>1?half-80:mode==="columns"?P.w-80:P.w-430;
    const box=await fitText(content.headline,{sizes:[44,40,36],width:boxW,maxHeight:170,color:LINE,font:STYLE_FONTS.comic,spacing:6,emphasis:emphasisOf(content,EMPHASIS_ON_YELLOW)});
    frames+=`<rect x="${P.x+24}" y="${P.y+24}" width="${box.info.width+44}" height="${box.info.height+32}" fill="${NARRATION}" stroke="${LINE}" stroke-width="5"/>`;
    layers.push({input:box.data,left:P.x+46,top:P.y+40});
  }
  frames+=react.frames;
  // 명함 칸: 흰 칸 왼쪽에 기울어진 "끝!" 효과음, 가운데에 가게 이름(굵은 제목 글꼴)·계정·저장 알약.
  const cardY=Rp.y+Rp.h+GUTTER;
  if(card)frames+=`<rect x="${M}" y="${cardY}" width="${W}" height="${cardH}" fill="${PAPER}"/>`;
  // 칸 틀·집중선·말풍선·해설 띠(frames)는 사진 바로 위, 제목·해설 글자보다 아래에 깔아야 글자가 가려지지 않는다.
  layers.splice(shots.length,0,svgLayer(frames));
  // 칸에 걸쳐 선 마스코트는 칸 테두리보다 위에 그려야 테두리를 "넘어선" 것처럼 보이므로 뒤에서 얹는다.
  if(react.mascot&&!straddling)layers.push(react.mascot);
  layers.push(...react.texts);
  // 효과음: 사진 칸 오른쪽 위에 기울어진 외곽선 글자. 세로 2단은 해설 상자가 칸 폭을 쓰므로 사진 칸 오른쪽 아래로.
  const sound=await outlinedText(SOUNDS[(index-1)%SOUNDS.length],{size:96,width:400,font:STYLE_FONTS.heavy,fill:"#FF3B30",stroke:PAPER,strokeWidth:8,shadow:LINE});
  const tilted=await sharp(sound.data).rotate(-12,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  layers.push({input:tilted.data,left:P.x+P.w-tilted.info.width+10,top:mode==="columns"?P.y+P.h-tilted.info.height-24:P.y+10});
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
  const box=(p:Panel)=>`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="${LINE}" stroke-width="${B}"/>`;
  const photoFrame=shots.length>1
    ?`<rect x="${P.x+half}" y="${P.y-B}" width="${GUTTER}" height="${P.h+B*2}" fill="#F7F5F0"/>`+box({...P,w:half})+box({x:P.x+half+GUTTER,y:P.y,w:half,h:P.h})
    :box(P);
  layers.push(svgLayer(photoFrame+box(Rp)+(card?box({x:M,y:cardY,w:W,h:cardH}):"")));
  if(react.mascot&&straddling)layers.push(react.mascot);
  if(coverTitle)layers.push(coverTitle);
  // 칸 밖 아래: 가운데 "가게 이름 · N화 / 전체"(tnum), 표지·마지막 장이 아니면 오른쪽 끝에 "다음 화 ›".
  // 마지막 장은 명함 칸에 계정이 있으니 바닥글엔 가게 이름만(같은 계정 두 번 금지).
  const page=await textLayer(`${content.last?STORE_NAME:brandName()}  ·  ${index}화`,{size:26,color:LINE,width:900,height:40,font:STYLE_FONTS.comic,align:"centre",features:"tnum"});
  const pageTop=1350-M-page.info.height+4;
  layers.push({input:page.data,left:Math.round((1080-page.info.width)/2),top:pageTop});
  if(body){
    const cue=await textLayer("다음 화",{size:28,color:LINE,width:200,height:50,font:STYLE_FONTS.comic});
    const arrowW=15,cueX=1080-M-cue.info.width-12-arrowW,cueY=pageTop+Math.round((page.info.height-cue.info.height)/2);
    const mid=cueY+cue.info.height/2,ax=cueX+cue.info.width+12;
    layers.push({input:cue.data,left:cueX,top:cueY});
    layers.push(svgLayer(`<path d="M${ax} ${mid-arrowW*.7}L${ax+arrowW} ${mid}L${ax} ${mid+arrowW*.7}" fill="none" stroke="${LINE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`));
  }
  return sharp({create:{width:1080,height:1350,channels:3,background:"#F7F5F0"}}).composite(layers).jpeg({quality:92}).toBuffer();
};
