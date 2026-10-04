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
  // 가장자리 색이 들쭉날쭉하면(식탁 위 반찬 그릇, 어두운 나무결처럼) 배경이 단색이 아니므로 누끼를 포기한다.
  // 가장자리 픽셀이 평균색에서 평균적으로 얼마나 떨어졌는지 보고 기준(30)을 넘으면 null.
  let spread=0;
  for(let x=0;x<W;x++)for(const y of [0,H-1]){const i=at(x,y);spread+=Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);}
  for(let y=0;y<H;y++)for(const x of [0,W-1]){const i=at(x,y);spread+=Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);}
  if(spread/n>30)return null;
  // 배경이 고를수록 기준을 좁힌다. 밝은 회색 배경 위 흰 접시처럼 배경과 비슷한 물체를 함께 지우지 않도록.
  const limit=Math.max(18,Math.min(46,(spread/n)*2+12));
  const fromMean=(i:number)=>Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);
  const between=(i:number,j:number)=>Math.hypot(data[i]-data[j],data[i+1]-data[j+1],data[i+2]-data[j+2]);
  // 배경으로 볼 조건: 가장자리 평균색과 가깝거나(limit 미만), 이미 지운 이웃과 거의 같은 색이면서(3 미만) 평균에서 너무 멀지 않음(limit+20 미만).
  // 두 번째 조건 덕분에 스튜디오 사진처럼 위에서 아래로 밝기가 서서히 바뀌는 배경도 따라가며 지운다.
  const close=(i:number,parent:number)=>{const d=fromMean(i);return d<limit||(parent>=0&&d<limit+20&&between(i,parent)<3);};
  const removed=new Uint8Array(W*H);
  // [픽셀, 이 픽셀로 오게 한 이웃 픽셀] 쌍을 쌓는다. 가장자리에서 시작하는 픽셀은 이웃이 없다(-1).
  const stack:number[]=[];
  for(let x=0;x<W;x++){stack.push(x,-1,(H-1)*W+x,-1);}
  for(let y=0;y<H;y++){stack.push(y*W,-1,y*W+W-1,-1);}
  // 윤곽선 장벽: 밝기가 급하게 바뀌는 자리(접시 테두리, 음식 윤곽)를 찾아 두 픽셀 두껍게 만든다.
  // 지우기는 이 장벽을 넘지 못하므로, 배경과 비슷한 흰 접시라도 테두리의 작은 틈으로 새어 들어가 지워지지 않는다.
  const lum=new Float32Array(W*H);
  for(let p=0;p<W*H;p++)lum[p]=data[p*4]*.299+data[p*4+1]*.587+data[p*4+2]*.114;
  let barrier=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x;if(Math.abs(lum[p+1]-lum[p-1])+Math.abs(lum[p+W]-lum[p-W])>16)barrier[p]=1;}
  for(let pass=0;pass<2;pass++){
    const grown=barrier.slice();
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const p=y*W+x;if(barrier[p-1]||barrier[p+1]||barrier[p-W]||barrier[p+W])grown[p]=1;}
    barrier=grown;
  }
  while(stack.length){
    const parent=stack.pop()!,p=stack.pop()!;
    if(removed[p]||barrier[p]||!close(p*4,parent<0?-1:parent*4))continue;
    removed[p]=1;
    const x=p%W,y=(p-x)/W;
    if(x>0)stack.push(p-1,p);if(x<W-1)stack.push(p+1,p);if(y>0)stack.push(p-W,p);if(y<H-1)stack.push(p+W,p);
  }
  // 장벽 때문에 배경 쪽에 남은 2~3픽셀 띠: 지운 픽셀과 맞닿아 있고 배경색에 가까우면 몇 번에 걸쳐 마저 지운다.
  for(let pass=0;pass<3;pass++){
    const next=removed.slice();
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const p=y*W+x;
      if(!removed[p]&&barrier[p]&&(removed[p-1]||removed[p+1]||removed[p-W]||removed[p+W])&&fromMean(p*4)<limit+12)next[p]=1;
    }
    removed.set(next);
  }
  // 남은 부분(음식)의 볼록 껍질 안쪽은 모두 살린다. 배경과 색이 비슷한 흰 접시는 위에서 군데군데 지워지기 쉬운데,
  // 접시 조각이 테두리까지 남아 있으면 껍질이 접시 원 전체를 감싸 접시가 온전히 돌아온다.
  // 껍질을 잡기 전에 외톨이 점(배경에 남은 잡티)은 빼서 껍질이 엉뚱하게 커지지 않게 한다.
  const solid=(p:number)=>!removed[p]&&!removed[p-1]&&!removed[p+1]&&!removed[p-W]&&!removed[p+W];
  const points:Array<[number,number]>=[];
  for(let y=2;y<H-2;y++){
    let left=-1,right=-1;
    for(let x=2;x<W-2;x++)if(solid(y*W+x)){if(left<0)left=x;right=x;}
    if(left>=0)points.push([left,y],[right,y]);
  }
  if(points.length<6)return null;
  const hull=convexHull(points);
  const mask=await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><polygon points="${hull.map(([x,y])=>`${x},${y}`).join(" ")}" fill="#fff"/></svg>`)).extractChannel(0).raw().toBuffer();
  let kept=0;
  for(let p=0;p<W*H;p++){if(mask[p]>127){removed[p]=0;kept++;}else removed[p]=1;}
  const ratio=1-kept/(W*H);
  if(ratio<.12||ratio>.85)return null;
  for(let p=0;p<W*H;p++)if(removed[p])data[p*4+3]=0;
  // 가장자리를 살짝 부드럽게(알파만 흐리게) 해서 계단 모양을 줄인다.
  // 알파만 따로 꺼내 흐린 뒤 원래 RGBA에 다시 써 넣는다. (joinChannel로 PNG 알파를 붙이면 알파가 빠진 3채널이 될 수 있어
  // 픽셀 배열에서 직접 합친다.)
  const alpha=await sharp(Buffer.from(Array.from({length:W*H},(_,p)=>data[p*4+3])),{raw:{width:W,height:H,channels:1}}).blur(1.2).extractChannel(0).raw().toBuffer();
  for(let p=0;p<W*H;p++)data[p*4+3]=alpha[p];
  const smooth=await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
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
export const grayscalePhoto=(input:Buffer,width:number,height:number)=>sharp(input).rotate().resize(Math.round(width),Math.round(height),{fit:"cover",position:"attention"}).grayscale().linear(1.25,-24).png().toBuffer();
// 도트(픽셀) 사진: 작게 줄였다가 가장 가까운 픽셀로 다시 키운다.
export const pixelPhoto=(input:Buffer,width:number,height:number,cell=8)=>sharp(input).rotate().resize(Math.round(width/cell),Math.round(height/cell),{fit:"cover",position:"attention"}).resize(width,height,{kernel:"nearest"}).png().toBuffer();

// 들어가는 가장 큰 크기의 외곽선 글자. fitText와 같이 큰 크기부터 그려 보고 높이가 맞는 첫 크기를 쓴다.
export async function fitOutlined(value:string,options:Omit<Parameters<typeof outlinedText>[1],"size">&{sizes:number[];maxHeight:number}):Promise<Layer> {
  let last:Layer|null=null;
  for(const size of options.sizes){
    last=await outlinedText(value,{...options,size});
    if(last.info.height<=options.maxHeight)return last;
  }
  return last!;
}

// 입체(돌출) 글자. 같은 글자를 진한 색으로 오른쪽 아래로 1px씩 depth번 겹쳐 찍어 두께를 만들고, 맨 위에 본래 색을 얹는다.
// 팝업북·키치 제목처럼 화면에서 튀어나와 보이는 글자에 쓴다.
export async function extrudedText(value:string,options:{sizes:number[];maxHeight:number;width:number;font:Font;fill:string;side:string;depth:number;align?:"left"|"centre";spacing?:number}):Promise<Layer> {
  const face=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-options.depth,color:options.fill,font:options.font,align:options.align,spacing:options.spacing});
  const side=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-options.depth,color:options.side,font:options.font,align:options.align,spacing:options.spacing});
  const d=options.depth;
  const layers:OverlayOptions[]=Array.from({length:d},(_,i)=>({input:side.data,left:d-i,top:d-i}));
  layers.push({input:face.data,left:0,top:0});
  return sharp({create:{width:face.info.width+d,height:face.info.height+d,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}

// 레이어를 투명 배경으로 기울인다(폴라로이드·키치 사진·스티커).
export const rotated=async(input:Buffer,degrees:number):Promise<Layer>=>sharp(input).rotate(degrees,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});

// 필름 사진 느낌: 채도를 조금 낮추고 채널별 곱셈으로 따뜻하게 만든 뒤(tint는 단색 사진이 되므로 쓰지 않는다), 가장자리를 어둡게(비네트) 하고 한쪽에 주황빛 빛샘을 얹는다.
export async function filmPhoto(input:Buffer,width:number,height:number,leak:"left"|"right"="right"):Promise<Buffer> {
  width=Math.round(width);height=Math.round(height);
  const base=await sharp(input).rotate().resize(width,height,{fit:"cover",position:"attention"}).modulate({saturation:.88,brightness:1.03}).linear([1.06,1.0,.88],[8,4,-2]).png().toBuffer();
  const lx=leak==="right"?width:0;
  const overlay=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="v" cx="50%" cy="50%" r="72%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient><radialGradient id="l" cx="${lx}" cy="${height*.2}" r="${width*.6}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF7A1A" stop-opacity=".55"/><stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/><rect width="100%" height="100%" fill="url(#l)"/></svg>`);
  return sharp(base).composite([{input:overlay,left:0,top:0}]).png().toBuffer();
}

// sharp는 레이어 위치가 정수여야 한다. 계산 중 생긴 소수(높이의 절반 등)를 마지막에 한 번에 반올림한다.
export const snap=(layers:OverlayOptions[]):OverlayOptions[]=>layers.map(layer=>({...layer,...(layer.left!==undefined?{left:Math.round(layer.left)}:{}),...(layer.top!==undefined?{top:Math.round(layer.top)}:{})}));

// 점들의 볼록 껍질(가장 바깥 점들을 이은 다각형). 단조 사슬(Andrew) 방식: x로 정렬해 아래·위 사슬을 만든다.
function convexHull(points:Array<[number,number]>):Array<[number,number]> {
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o:[number,number],a:[number,number],b:[number,number])=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const chain=(list:Array<[number,number]>)=>{const out:Array<[number,number]>=[];for(const p of list){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}out.pop();return out;};
  return [...chain(sorted),...chain([...sorted].reverse())];
}
