import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { STORE_NAME } from "../slideLayout";
import type { CarouselSlidePlan } from "../carousel";
import { cleanPoints, textLayer, type Font, type Layer } from "../render/primitives";

// 스타일 계열(styles/*.ts)이 함께 쓰는 도구. 계열마다 고유한 글꼴·색을 쓰므로 여기의 글꼴은 사용자가 고른 제목·본문 글꼴로
// 바뀌지 않는다(render/primitives의 FONTS 역할 객체가 아니라서 resolveFont가 그대로 둔다).

const FONT_DIR=path.join(process.cwd(),"assets/fonts");
const face=(fileName:string,family:string):Font=>({file:path.join(FONT_DIR,fileName),family});
export const STYLE_FONTS={
  pixel:face("Galmuri11.ttf","Galmuri11"),
  pixelBold:face("Galmuri11-Bold.ttf","Galmuri11 Bold"),
  serif:face("NanumMyeongjo-Regular.ttf","NanumMyeongjo"),
  serifHeavy:face("NanumMyeongjo-ExtraBold.ttf","NanumMyeongjo ExtraBold"),
  brushSerif:face("SongMyung-Regular.ttf","Song Myung"),
  hand:face("NanumPenScript-Regular.ttf","Nanum Pen"),
  heavy:face("BlackHanSans-Regular.ttf","Black Han Sans"),
  comic:face("DoHyeon-Regular.ttf","Do Hyeon"),
  gothicBlack:face("GothicA1-Black.ttf","Gothic A1 Black"),
  gothicLight:face("GothicA1-Light.ttf","Gothic A1 Light"),
  sans:face("Pretendard-Regular.otf","Pretendard"),
  sansBold:face("Pretendard-Bold.otf","Pretendard Bold"),
  sansSemi:face("Pretendard-SemiBold.otf","Pretendard SemiBold"),
} as const;

// 장 하나를 스타일이 그리기 쉬운 모양으로 정리한다. 표지·사진 장·글자 장 가운데 어느 쪽인지 kind로 알려 준다.
export type StyleContent={
  headline:string;points:string[];keywords:string[];index:number;total:number;cover:boolean;last:boolean;
  kind:"cover"|"photo"|"photos"|"text";
};
export function contentOf(slide:CarouselSlidePlan,inputs:Buffer[],index:number,total:number):StyleContent {
  const cover=slide.role==="cover";
  return {
    headline:slide.headline.replace(/\s+/g," ").trim(),points:cleanPoints(slide.points),keywords:slide.keywords,index,total,cover,last:index===total,
    kind:cover?"cover":inputs.length>=2?"photos":inputs.length===1?"photo":"text",
  };
}
export const hashtags=(content:StyleContent)=>content.keywords.length?content.keywords.map(word=>`#${word}`).join(" "):STORE_NAME;

// 들어가는 가장 큰 글자 크기를 고른다. sizes를 큰 것부터 그려 보고 maxHeight 안에 들어가는 첫 크기를 쓴다.
export async function fitText(value:string,options:{sizes:number[];width:number;maxHeight:number;color:string;font:Font;align?:"left"|"centre";spacing?:number}):Promise<Layer> {
  let last:Layer|null=null;
  for(const size of options.sizes){
    last=await textLayer(value,{size,color:options.color,width:options.width,height:4000,font:options.font,align:options.align,spacing:options.spacing??Math.round(size*.12)});
    if(last.info.height<=options.maxHeight)return last;
  }
  // 가장 작은 크기로도 넘치면 높이에 맞춰 줄인다.
  return textLayer(value,{size:options.sizes[options.sizes.length-1],color:options.color,width:options.width,height:options.maxHeight,font:options.font,align:options.align,spacing:options.spacing});
}

// 외곽선 글자(만화 제목·키치 글자). 같은 글자를 외곽선 색으로 8방향으로 밀어 찍고 그 위에 본래 색을 얹는다.
// Pango는 글자 외곽선을 직접 그리지 못해서 이렇게 흉내 낸다. shadow를 주면 오른쪽 아래로 진한 그림자를 한 번 더 깐다.
export async function outlinedText(value:string,options:{size:number;width:number;height?:number;font:Font;fill:string;stroke:string;strokeWidth:number;align?:"left"|"centre";shadow?:string;spacing?:number}):Promise<Layer> {
  const style={size:options.size,width:options.width,height:options.height??4000,font:options.font,align:options.align,spacing:options.spacing??Math.round(options.size*.1)};
  const fill=await textLayer(value,{...style,color:options.fill});
  const stroke=await textLayer(value,{...style,color:options.stroke});
  const s=options.strokeWidth,shadowOffset=options.shadow?Math.round(s*1.6):0;
  const W=fill.info.width+s*2+shadowOffset,H=fill.info.height+s*2+shadowOffset;
  const layers:OverlayOptions[]=[];
  if(options.shadow){
    const shade=await textLayer(value,{...style,color:options.shadow});
    for(const [dx,dy] of ring8(s))layers.push({input:shade.data,left:s+dx+shadowOffset,top:s+dy+shadowOffset});
  }
  for(const [dx,dy] of ring8(s))layers.push({input:stroke.data,left:s+dx,top:s+dy});
  layers.push({input:fill.data,left:s,top:s});
  return sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}
// 반지름 r 둘레의 16방향 오프셋(외곽선이 둥글게 보이도록).
function ring8(r:number):Array<[number,number]> {
  return Array.from({length:16},(_,i)=>{const a=(Math.PI*2*i)/16;return [Math.round(Math.cos(a)*r),Math.round(Math.sin(a)*r)] as [number,number];});
}

// 사진의 배경을 지워 음식만 남긴다(누끼). 가장자리 픽셀의 평균색과 비슷한 영역을 바깥에서부터 지워 나간다.
// 단색에 가까운 배경(스튜디오 사진, 흰 접시 뒤 단색 테이블)에서 잘 되고, 복잡한 배경이면 지운 비율이 이상해
// null을 돌려준다. 그러면 스타일은 원형 스티커 사진으로 대신 그린다.
export async function cutoutPhoto(input:Buffer,maxSide:number):Promise<{data:Buffer;width:number;height:number}|null> {
  const {data,info}=await sharp(input).rotate().resize(maxSide,maxSide,{fit:"inside"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:W,height:H}=info;
  const at=(x:number,y:number)=>(y*W+x)*4;
  let r=0,g=0,b=0,n=0;
  for(let x=0;x<W;x++)for(const y of [0,H-1]){const i=at(x,y);r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
  for(let y=0;y<H;y++)for(const x of [0,W-1]){const i=at(x,y);r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
  r/=n;g/=n;b/=n;
  const close=(i:number)=>Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b)<46;
  const removed=new Uint8Array(W*H);
  const stack:number[]=[];
  for(let x=0;x<W;x++){stack.push(x,(H-1)*W+x);}
  for(let y=0;y<H;y++){stack.push(y*W,y*W+W-1);}
  let count=0;
  while(stack.length){
    const p=stack.pop()!;
    if(removed[p]||!close(p*4))continue;
    removed[p]=1;count++;
    const x=p%W,y=(p-x)/W;
    if(x>0)stack.push(p-1);if(x<W-1)stack.push(p+1);if(y>0)stack.push(p-W);if(y<H-1)stack.push(p+W);
  }
  const ratio=count/(W*H);
  if(ratio<.12||ratio>.85)return null;
  for(let p=0;p<W*H;p++)if(removed[p])data[p*4+3]=0;
  // 가장자리를 살짝 부드럽게(알파만 흐리게) 해서 계단 모양을 줄인다.
  const rgba=await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
  const alpha=await sharp(rgba).extractChannel(3).blur(1.2).toBuffer();
  const smooth=await sharp(rgba).removeAlpha().joinChannel(alpha).png().toBuffer();
  const trimmed=await sharp(smooth).trim({threshold:1}).png().toBuffer({resolveWithObject:true});
  return {data:trimmed.data,width:trimmed.info.width,height:trimmed.info.height};
}

// 누끼 둘레에 흰 스티커 테두리를 두르고(알파를 번지게 해 키운 흰 실루엣), 아래에 진한 그림자를 깐다.
export async function stickerize(cutout:{data:Buffer;width:number;height:number},options:{border?:number;shadow?:string;shadowOffset?:number}={}):Promise<Layer> {
  const border=options.border??14,offset=options.shadowOffset??14;
  const pad=border*2+offset;
  const W=cutout.width+pad*2,H=cutout.height+pad*2;
  const padded=await sharp(cutout.data).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const alpha=await sharp(padded).extractChannel(3).blur(border*.6).threshold(8).toBuffer();
  const silhouette=(color:string)=>sharp({create:{width:W,height:H,channels:3,background:color}}).joinChannel(alpha).png().toBuffer();
  const layers:OverlayOptions[]=[];
  if(options.shadow)layers.push({input:await silhouette(options.shadow),left:offset,top:offset});
  layers.push({input:await silhouette("#ffffff"),left:0,top:0},{input:padded,left:0,top:0});
  return sharp({create:{width:W+offset,height:H+offset,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}

// 흑백·대비 강화(신문), 강한 흐림·어둡게(타이포그래피) 같은 사진 보정.
export const grayscalePhoto=(input:Buffer,width:number,height:number)=>sharp(input).rotate().resize(width,height,{fit:"cover"}).grayscale().linear(1.25,-24).png().toBuffer();
// 도트(픽셀) 사진: 작게 줄였다가 가장 가까운 픽셀로 다시 키운다.
export const pixelPhoto=(input:Buffer,width:number,height:number,cell=8)=>sharp(input).rotate().resize(Math.round(width/cell),Math.round(height/cell),{fit:"cover"}).resize(width,height,{kernel:"nearest"}).png().toBuffer();
