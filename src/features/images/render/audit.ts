import { AsyncLocalStorage } from "node:async_hooks";
import sharp, { type OverlayOptions } from "sharp";
import { photoQuality, qualityOfEnhanced, type PhotoQualityFlag } from "./photoEnhance";

// 카드 자동 검수. 카드를 그리는 동안 "글자 레이어가 캔버스의 어디에 놓였는지"를 기록해 두었다가,
// 다 그린 뒤 세 가지를 잰다.
//   1) overflow  : 글자가 캔버스(1080×1350) 밖으로 나갔는가
//   2) overlap   : 서로 다른 글자 덩어리가 겹쳤는가(같은 글자를 여러 번 찍는 외곽선 효과는 제외)
//   3) contrast  : 글자 색과 그 뒤 배경의 밝기 대비가 너무 낮은가(WCAG 대비율 기준)
// 그리고 표지는 4) gridSafe: 인스타 프로필 격자(3:4로 좌우가 잘림)에서 글자가 잘리지 않는가를 본다.
//
// 기록 방법: textLayer가 만든 PNG 버퍼를 WeakMap에 등록하고(registerText), sharp의 composite 호출을
// 가로채(이 검수 컨텍스트 안에서만) 어떤 버퍼가 어느 좌표에 놓였는지 모은다. 검수 밖에서는 아무 일도 하지 않는다.
//
// 문제(issues)와 따로 "측정값(metrics)"도 모은다. 재시도 판단에는 쓰지 않고 검수 스크립트가 집계만 한다.
//   photoArea : 캔버스에 바로 놓인 사진(registerPhoto로 등록된 버퍼)이 차지하는 비율(0~1). 사진을 다른 부품
//               (폴라로이드·스티커) 안에 넣고 그 부품을 놓는 계열은 부품을 등록해야 잡힌다.
//   shrinks   : 글자가 주어진 높이에 안 들어가 그림째 줄어든("몰래 축소") 횟수. 0이 목표다.
//   orphans   : 여러 줄 제목의 마지막 줄이 폭의 35%도 안 되는(한 낱말만 덩그러니) 경우의 수. 0이 목표다.
//
// 경고(계획서 '검증과 측정'). 지금 카드가 다 통과하지 못하는 항목이라 issues(생성 재시도 대상)로 올리지 않고
// notes·metrics에만 남긴다. 재시도에 넣으면 요점을 하나씩 빼며 다시 그리는 일이 폭증한다. 대비 검사를 켠 검수 모드에서만 잰다.
//   decor-overlap : 마스코트·소품(registerDecor)이 글자 획을 가렸는가. 말풍선 꼬리처럼 닿기만 하는 건 DECOR_TOUCH px까지 봐준다.
//   dead-band     : 글자·사진·장식이 하나도 없는 가로 띠가 DEAD_BAND px 이상 이어지는가(바탕 무늬만 있는 빈 자리).
//                   맨 위·맨 아래 가장자리 여백(바닥글 아래 등)은 뺀다.
//   photo-area    : 표지의 사진 면적이 모양별 기준(PHOTO_AREA_LIMITS)보다 작은가.
//   photo-quality : 넣은 사진 자체가 어둡거나 흔들렸거나 색이 틀어졌거나 작은가(카드로는 못 고치므로 알려 주기만).

export const CANVAS={width:1080,height:1350} as const;
// 인스타그램 프로필 격자는 4:5 게시물을 가운데 3:4로 보여 준다 → 좌우 각 약 34px가 잘린다.
export const GRID_SAFE_X=Math.ceil((CANVAS.width-CANVAS.height*3/4)/2);

// mask/maskOffset: 그림자를 붙인 글자는 원래 글자(그림자 없는) 버퍼와 그 위치를 따로 넘겨, 대비를 잴 때 획만 "글자"로 본다.
type TextInfo={width:number;height:number;color:string;size:number;mask?:Buffer;maskOffset?:number};
type CompositeCall={canvas:{width?:number;height?:number;buffer?:Buffer};layers:OverlayOptions[]};
// 사진 모양. 모양마다 같은 면적이라도 눈에 보이는 음식 크기가 달라 기준이 다르다(원·메달은 모서리가 빈다).
// bleed: 사진이 캔버스 좌우 끝까지 닿는(또는 캔버스 바탕인) 표지.
// cutout: 배경을 지운 음식 스티커(컬러 블록·팝업북·키치). 테두리 없이 음식만 남아 같은 크기라도 상자 면적이 작게 잡히므로 기준을 낮춘다.
export type PhotoShape="rect"|"circle"|"medal"|"arch"|"bleed"|"cutout";
export const PHOTO_AREA_LIMITS:Record<PhotoShape,number>={rect:.4,circle:.3,medal:.3,arch:.35,bleed:.5,cutout:.2};
// ornament: 일부러 크게 깐 그림 장식(팝업북의 펼친 책, 타이포그래피의 유령 글자 등). 빈 띠 계산에서는 "찬 자리"로 치고,
// 글자 뒤에 깔리는 것이 의도이므로 장식 겹침 검사에서는 뺀다. 바탕 무늬·질감처럼 화면 전체에 고르게 깔린 것은 등록하지 않는다.
export type DecorKind="mascot"|"prop"|"ornament";
type Rect={left:number;top:number;width:number;height:number};
export type AuditNote=
  |{kind:"shrink";text:string;from:number;to:number}
  |{kind:"orphan";text:string;ratio:number}
  |{kind:"decor-overlap";decor:DecorKind;decorBox:Rect;textBox:Rect;pixels:number}
  |{kind:"dead-band";top:number;bottom:number}
  |{kind:"photo-area";area:number;shape:PhotoShape;limit:number}
  |{kind:"photo-quality";photo:number;flags:PhotoQualityFlag[]};
export type AuditWarningKind="decor-overlap"|"dead-band"|"photo-area"|"photo-quality";
export const AUDIT_WARNING_KINDS:readonly AuditWarningKind[]=["decor-overlap","dead-band","photo-area","photo-quality"];
type AuditStore={calls:CompositeCall[];notes:AuditNote[]};

// 장식이 글자에 이만큼(px)까지 파고드는 건 의도된 접촉으로 본다(말풍선 꼬리, 간판에 기댄 소품).
export const DECOR_TOUCH=6;
// 이 높이(px) 이상 아무것도 없는 가로 띠를 빈 띠로 본다.
export const DEAD_BAND=150;

const texts=new WeakMap<Buffer,TextInfo>();
const photos=new WeakMap<Buffer,PhotoShape>();
const decors=new WeakMap<Buffer,DecorKind>();
const auditStore=new AsyncLocalStorage<AuditStore>();

export function registerText(buffer:Buffer,info:TextInfo){texts.set(buffer,info);}
// 사진 레이어(finishPhoto·croppedPhoto 결과)를 등록한다. 사진 면적 측정에 쓴다. 모양을 모르면 사각 기준.
export function registerPhoto(buffer:Buffer,options:{shape?:PhotoShape}={}){photos.set(buffer,options.shape??"rect");}
// 마스코트·소품 레이어(decor.ts mascotLayer·propLayer 결과)를 등록한다. 글자를 가렸는지(decor-overlap)와 빈 띠 계산에 쓴다.
export function registerDecor(buffer:Buffer,kind:DecorKind){decors.set(buffer,kind);}
// 그리는 중에 생긴 측정 메모(몰래 축소·외톨이 줄). 검수 컨텍스트 밖이면 버린다.
export function noteAudit(note:AuditNote){auditStore.getStore()?.notes.push(note);}

// sharp의 composite를 한 번만 감싼다. 검수 컨텍스트가 없으면 원래 동작 그대로다.
type SharpInternals={options:{input?:{buffer?:Buffer;createWidth?:number;createHeight?:number};width?:number;height?:number}};
const proto=sharp.prototype as unknown as {composite:(layers:OverlayOptions[])=>unknown;__audited?:boolean};
if(!proto.__audited){
  const original=proto.composite;
  proto.composite=function(this:SharpInternals,layers:OverlayOptions[]){
    const store=auditStore.getStore();
    if(store){
      const input=this.options.input??{};
      store.calls.push({canvas:{width:this.options.width&&this.options.width>0?this.options.width:input.createWidth,height:this.options.height&&this.options.height>0?this.options.height:input.createHeight,buffer:input.buffer},layers});
    }
    return original.call(this,layers);
  };
  proto.__audited=true;
}

export type TextBox={left:number;top:number;width:number;height:number;buffer:Buffer;color:string;size:number;mask?:Buffer;maskOffset?:number};
export type AuditIssue=
  |{kind:"overflow";box:TextBox}
  |{kind:"overlap";a:TextBox;b:TextBox;ratio:number}
  |{kind:"contrast";box:TextBox;ratio:number}
  |{kind:"gridSafe";box:TextBox};
// warnings: 경고 종류별 건수(검수 모드가 아니면 모두 0). photoShape: 면적을 잰 가장 큰 사진의 모양(사진이 없으면 null).
export type AuditMetrics={photoArea:number;photoShape:PhotoShape|null;shrinks:number;orphans:number;warnings:Record<AuditWarningKind,number>};
// occupied: 캔버스에 놓인 사진·장식(마스코트·소품·큰 장식) 상자. 글자 상자(boxes)와 함께 "이미 찬 자리"로,
// 계절 소품(render/seasonLayer.ts)이 빈 자리를 찾을 때 쓴다. 바탕 사진(풀스크린)이면 화면 전체 한 상자.
export type AuditReport={issues:AuditIssue[];boxes:TextBox[];metrics:AuditMetrics;notes:AuditNote[];occupied:Rect[]};
export type AuditOptions={cover?:boolean;contrast?:boolean;warnings?:boolean;photos?:Buffer[]};

// 그리기 함수를 검수 컨텍스트 안에서 실행하고 결과 이미지와 함께 검수 결과를 돌려준다.
// contrast:false면 대비 검사(가장 무거운 부분)를 건너뛴다. 실제 앱에서 카드를 그릴 때는 넘침·겹침만 빠르게 본다.
// warnings: 경고(장식 겹침·빈 띠·사진 면적·사진 품질)를 잴지. 기본은 대비 검사와 같이 켜진다(검수 스크립트·테스트).
// photos: 카드에 넣은 원본 사진. 주면 사진 품질 경고를 남긴다(보정 단계에서 이미 잰 값이 있으면 다시 재지 않는다).
export async function auditRender(render:()=>Promise<Buffer>,options:AuditOptions={}):Promise<{image:Buffer;report:AuditReport}> {
  const store:AuditStore={calls:[],notes:[]};
  const image=await auditStore.run(store,render);
  const {issues,boxes}=await analyze(image,store.calls,options);
  const area=await photoAreaOf(store.calls);
  if(options.warnings??options.contrast!==false)store.notes.push(...await warningsOf(store.calls,boxes,area,options));
  const count=(kind:AuditNote["kind"])=>store.notes.filter(note=>note.kind===kind).length;
  const metrics:AuditMetrics={
    photoArea:area.area,
    photoShape:area.shape,
    shrinks:count("shrink"),
    orphans:count("orphan"),
    warnings:Object.fromEntries(AUDIT_WARNING_KINDS.map(kind=>[kind,count(kind)])) as Record<AuditWarningKind,number>,
  };
  const decorBoxes=(await canvasLayers(store.calls,decors)).map(item=>item.box);
  return {image,report:{issues,boxes,metrics,notes:store.notes,occupied:[...area.boxes,...decorBoxes]}};
}

async function canvasSize(call:CompositeCall){
  if(call.canvas.width&&call.canvas.height)return {width:call.canvas.width,height:call.canvas.height};
  if(call.canvas.buffer){const meta=await sharp(call.canvas.buffer).metadata();return {width:meta.width??0,height:meta.height??0};}
  return {width:0,height:0};
}

// 최종 캔버스(1080×1350)에 바로 놓인 레이어 중 표에 등록된 것만 상자와 함께 모은다.
async function canvasLayers<T>(calls:CompositeCall[],table:WeakMap<Buffer,T>):Promise<{value:T;box:Rect;buffer:Buffer}[]> {
  const out:{value:T;box:Rect;buffer:Buffer}[]=[];
  for(const call of calls){
    const size=await canvasSize(call);
    if(size.width!==CANVAS.width||size.height!==CANVAS.height)continue;
    for(const layer of call.layers){
      if(!Buffer.isBuffer(layer.input))continue;
      const value=table.get(layer.input);
      if(value===undefined)continue;
      const meta=await sharp(layer.input).metadata();
      out.push({value,buffer:layer.input,box:{left:Math.round(layer.left??0),top:Math.round(layer.top??0),width:meta.width??0,height:meta.height??0}});
    }
  }
  return out;
}

// 캔버스(1080×1350)에 바로 놓인 사진 상자의 합집합 넓이 비율. 사진 자체가 캔버스 밑바탕이면(풀스크린) 1.
// 합집합은 24px 격자로 근사한다(겹친 사진을 두 번 세지 않게). 모양은 가장 큰 사진의 것을 쓴다.
type PhotoArea={area:number;shape:PhotoShape|null;boxes:Rect[]};
async function photoAreaOf(calls:CompositeCall[]):Promise<PhotoArea> {
  for(const call of calls){
    const size=await canvasSize(call);
    if(size.width===CANVAS.width&&size.height===CANVAS.height&&call.canvas.buffer&&photos.has(call.canvas.buffer))return {area:1,shape:"bleed",boxes:[{left:0,top:0,...CANVAS}]};
  }
  const CELL=24,COLS=Math.ceil(CANVAS.width/CELL),ROWS=Math.ceil(CANVAS.height/CELL);
  const covered=new Uint8Array(COLS*ROWS);
  const placed=await canvasLayers(calls,photos);
  let largest:{shape:PhotoShape;size:number;box:Rect}|null=null;
  for(const {value:shape,box} of placed){
    const x0=Math.max(0,box.left),y0=Math.max(0,box.top);
    const x1=Math.min(CANVAS.width,box.left+box.width),y1=Math.min(CANVAS.height,box.top+box.height);
    if(x1<=x0||y1<=y0)continue;
    for(let cy=Math.floor(y0/CELL);cy<Math.ceil(y1/CELL);cy++)for(let cx=Math.floor(x0/CELL);cx<Math.ceil(x1/CELL);cx++)covered[cy*COLS+cx]=1;
    const size=(x1-x0)*(y1-y0);
    if(!largest||size>largest.size)largest={shape,size,box};
  }
  // 좌우 끝까지 닿는 사각 사진은 블리드로 본다(계열 파일이 모양을 따로 알려 주지 않아도).
  const shape=largest?(largest.shape==="rect"&&largest.box.left<=20&&largest.box.left+largest.box.width>=CANVAS.width-20?"bleed":largest.shape):null;
  return {area:Math.round(covered.reduce((sum,v)=>sum+v,0)/(COLS*ROWS)*100)/100,shape,boxes:placed.map(item=>item.box)};
}

// 경고 네 가지를 잰다(파일 맨 위 설명). 모두 notes로만 돌려준다.
async function warningsOf(calls:CompositeCall[],boxes:TextBox[],area:PhotoArea,options:AuditOptions):Promise<AuditNote[]> {
  const notes:AuditNote[]=[];
  const placedDecor=await canvasLayers(calls,decors);
  // 1) 장식 겹침: 상자 교집합을 DECOR_TOUCH만큼 안으로 줄인 범위에서 글자 획과 장식 그림이 함께 진한 점을 센다.
  for(const decor of placedDecor.filter(item=>item.value!=="ornament"))for(const text of boxes){
    const x0=Math.max(decor.box.left,text.left)+DECOR_TOUCH,x1=Math.min(decor.box.left+decor.box.width,text.left+text.width)-DECOR_TOUCH;
    const y0=Math.max(decor.box.top,text.top)+DECOR_TOUCH,y1=Math.min(decor.box.top+decor.box.height,text.top+text.height)-DECOR_TOUCH;
    if(x1<=x0||y1<=y0)continue;
    const pixels=await inkBoth({...decor.box,buffer:decor.buffer},text,{left:x0,top:y0,width:x1-x0,height:y1-y0});
    if(pixels>=12)notes.push({kind:"decor-overlap",decor:decor.value,decorBox:decor.box,textBox:{left:text.left,top:text.top,width:text.width,height:text.height},pixels});
  }
  // 2) 빈 띠: 글자·장식은 실제 그림이 있는 줄만, 사진은 상자 전체를 "채워진 줄"로 친다.
  const filled=new Uint8Array(CANVAS.height);
  const mark=(top:number,bottom:number)=>{for(let y=Math.max(0,top);y<Math.min(CANVAS.height,bottom);y++)filled[y]=1;};
  for(const box of area.boxes)mark(box.top,box.top+box.height);
  for(const item of [...boxes.map(box=>({...box})),...placedDecor.map(decor=>({...decor.box,buffer:decor.buffer}))]){
    const rows=await inkRows(item.buffer);
    if(rows)mark(item.top+rows[0],item.top+rows[1]+1);
  }
  const first=filled.indexOf(1),last=filled.lastIndexOf(1);
  if(first>=0)for(let y=first,start=-1;y<=last;y++){
    if(!filled[y]){if(start<0)start=y;continue;}
    if(start>=0&&y-start>=DEAD_BAND)notes.push({kind:"dead-band",top:start,bottom:y});
    start=-1;
  }
  // 3) 표지 사진 면적: 모양별 기준보다 작으면. 사진이 아예 없는 표지(바탕 질감만)도 기록한다.
  if(options.cover){
    const shape=area.shape??"rect",limit=PHOTO_AREA_LIMITS[shape];
    if(area.area<limit)notes.push({kind:"photo-area",area:area.area,shape,limit});
  }
  // 4) 사진 품질: 넣은 사진마다 한 번. 실패하면 조용히 건너뛴다(검수가 카드를 막지 않게).
  for(const [i,photo] of (options.photos??[]).entries()){
    const quality=qualityOfEnhanced(photo)??await photoQuality(photo).catch(()=>null);
    if(quality?.flags.length)notes.push({kind:"photo-quality",photo:i,flags:[...quality.flags]});
  }
  return notes;
}

async function analyze(image:Buffer,calls:CompositeCall[],options:{cover?:boolean;contrast?:boolean}):Promise<{issues:AuditIssue[];boxes:TextBox[]}> {
  // 최종 캔버스(1080×1350) 위에 바로 놓인 글자만 본다. 외곽선 글자·폴라로이드 같은 작은 부품 안쪽은 제외.
  const boxes:TextBox[]=[];
  for(const call of calls){
    const size=await canvasSize(call);
    if(size.width!==CANVAS.width||size.height!==CANVAS.height)continue;
    for(const layer of call.layers){
      if(!Buffer.isBuffer(layer.input))continue;
      const info=texts.get(layer.input);
      if(!info)continue;
      boxes.push({left:Math.round(layer.left??0),top:Math.round(layer.top??0),width:info.width,height:info.height,buffer:layer.input,color:info.color,size:info.size,mask:info.mask,maskOffset:info.maskOffset});
    }
  }
  const issues:AuditIssue[]=[];
  const T=2;
  for(const box of boxes){
    if(box.left<-T||box.top<-T||box.left+box.width>CANVAS.width+T||box.top+box.height>CANVAS.height+T)issues.push({kind:"overflow",box});
    if(options.cover&&(box.left<GRID_SAFE_X-T||box.left+box.width>CANVAS.width-GRID_SAFE_X+T))issues.push({kind:"gridSafe",box});
  }
  // 겹침: 두 글자 상자가 겹친 넓이가 작은 쪽 넓이의 12%를 넘고, 실제 글자 픽셀끼리도 겹칠 때만 문제로 본다.
  // (상자는 여백을 포함하므로 상자만 겹치는 경우는 흔하고 괜찮다.)
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    if(a.buffer===b.buffer)continue;
    const w=Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left);
    const h=Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top);
    if(w<=4||h<=4)continue;
    const ratio=(w*h)/Math.min(a.width*a.height,b.width*b.height);
    if(ratio<.12)continue;
    if(await inkOverlap(a,b))issues.push({kind:"overlap",a,b,ratio});
  }
  // 대비: 최종 이미지에서 글자 픽셀(알파 높음)과 그 상자 안 나머지 픽셀(알파 0)의 평균 밝기를 비교한다.
  if(boxes.length&&options.contrast!==false){
    const {data:pixels,info}=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
    for(const box of boxes){
      const ratio=await contrastOf(box,pixels,info.width,info.height);
      // 큰 글자(40px 이상)는 3:1, 작은 글자는 4:1을 기준으로 둔다(WCAG 큰 글자 3:1·본문 4.5:1을 카드뉴스에 맞게 조정).
      const limit=box.size>=40?3:4;
      if(ratio!==null&&ratio<limit)issues.push({kind:"contrast",box,ratio});
    }
  }
  return {issues,boxes};
}

const toLinear=(c:number)=>{const v=c/255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};
const luminance=(r:number,g:number,b:number)=>.2126*toLinear(r)+.7152*toLinear(g)+.0722*toLinear(b);

// 알파 채널은 같은 버퍼(캐시된 마스코트·글자)마다 한 번만 뽑는다.
type Alpha={data:Buffer;info:{width:number;height:number}};
const alphas=new WeakMap<Buffer,Promise<Alpha>>();
function alphaOf(box:{buffer:Buffer}):Promise<Alpha> {
  let hit=alphas.get(box.buffer);
  if(!hit){hit=sharp(box.buffer).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true});alphas.set(box.buffer,hit);}
  return hit;
}

// 그림이 있는(알파 40 초과) 첫 줄과 마지막 줄. 전부 투명하면 null.
async function inkRows(buffer:Buffer):Promise<[number,number]|null> {
  const {data,info}=await alphaOf({buffer});
  let first=-1,last=-1;
  for(let y=0;y<info.height;y++){
    const row=y*info.width;
    for(let x=0;x<info.width;x++)if(data[row+x]>40){if(first<0)first=y;last=y;break;}
  }
  return first<0?null:[first,last];
}

// 두 레이어가 rect 안에서 함께 진한(알파 120 초과) 점의 수(2px 간격 표본).
async function inkBoth(a:Rect&{buffer:Buffer},b:Rect&{buffer:Buffer},rect:Rect):Promise<number> {
  const [ma,mb]=await Promise.all([alphaOf(a),alphaOf(b)]);
  let both=0;
  for(let y=rect.top;y<rect.top+rect.height;y+=2)for(let x=rect.left;x<rect.left+rect.width;x+=2){
    const ay=y-a.top,ax=x-a.left,by=y-b.top,bx=x-b.left;
    if(ay<0||ax<0||by<0||bx<0||ay>=ma.info.height||ax>=ma.info.width||by>=mb.info.height||bx>=mb.info.width)continue;
    if(ma.data[ay*ma.info.width+ax]>120&&mb.data[by*mb.info.width+bx]>120)both++;
  }
  return both;
}

async function inkOverlap(a:TextBox,b:TextBox):Promise<boolean> {
  const [ma,mb]=await Promise.all([alphaOf(a),alphaOf(b)]);
  const x0=Math.max(a.left,b.left),x1=Math.min(a.left+a.width,b.left+b.width);
  const y0=Math.max(a.top,b.top),y1=Math.min(a.top+a.height,b.top+b.height);
  let both=0;
  for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
    const va=ma.data[(y-a.top)*ma.info.width+(x-a.left)],vb=mb.data[(y-b.top)*mb.info.width+(x-b.left)];
    if(va>120&&vb>120&&++both>=12)return true;
  }
  return false;
}

// 글자 픽셀(알파 200 초과)과 "글자 바로 둘레"(글자에서 몇 픽셀 안쪽, 알파 40 이하) 배경의 평균 밝기를 비교한다.
// 둘레만 보는 이유: 사람이 글자를 읽을 때 대비를 느끼는 곳은 획 바로 옆이고, 그림자·띠를 깔면 그 자리가 어두워진다.
async function contrastOf(box:TextBox,pixels:Buffer,width:number,height:number):Promise<number|null> {
  // 그림자 글자면 원래 획 버퍼(mask)를 쓰고 그만큼 위치를 옮긴다. 그림자 자리는 "둘레 배경"으로 잡힌다.
  const source=box.mask??box.buffer,offset=box.mask?box.maskOffset??0:0;
  const mask=await sharp(source).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true});
  const near=await sharp(mask.data,{raw:{width:mask.info.width,height:mask.info.height,channels:1}}).blur(3).extractChannel(0).raw().toBuffer();
  let ink=0,inkN=0,back=0,backN=0;
  for(let y=0;y<mask.info.height;y+=2)for(let x=0;x<mask.info.width;x+=2){
    const cx=box.left+offset+x,cy=box.top+offset+y;
    if(cx<0||cy<0||cx>=width||cy>=height)continue;
    const k=y*mask.info.width+x,alpha=mask.data[k];
    const i=(cy*width+cx)*3;
    const l=luminance(pixels[i],pixels[i+1],pixels[i+2]);
    if(alpha>200){ink+=l;inkN++;}else if(alpha<=40&&near[k]>10){back+=l;backN++;}
  }
  if(inkN<20||backN<20)return null;
  const a=ink/inkN,b=back/backN;
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

// 사람이 읽을 수 있게 한 줄로 요약(로그·테스트 메시지용).
export function describeIssue(issue:AuditIssue):string {
  const at=(box:TextBox)=>`(${box.left},${box.top} ${box.width}×${box.height})`;
  switch(issue.kind){
    case "overflow":return `글자가 캔버스 밖으로 나감 ${at(issue.box)}`;
    case "overlap":return `글자끼리 겹침 ${at(issue.a)} ↔ ${at(issue.b)}`;
    case "contrast":return `글자 대비 부족 ${issue.ratio.toFixed(2)}:1 ${at(issue.box)}`;
    case "gridSafe":return `프로필 격자에서 잘림 ${at(issue.box)}`;
  }
}

// 측정 메모(축소·외톨이·경고)를 한 줄로.
export function describeNote(note:AuditNote):string {
  const at=(box:Rect)=>`(${box.left},${box.top} ${box.width}×${box.height})`;
  switch(note.kind){
    case "shrink":return `축소 "${note.text}" ${note.from}→${note.to}px`;
    case "orphan":return `외톨이 줄 "${note.text}" ${note.ratio}`;
    case "decor-overlap":return `${note.decor==="mascot"?"마스코트":"소품"}가 글자를 가림 ${at(note.decorBox)} ↔ ${at(note.textBox)} ${note.pixels}점`;
    case "dead-band":return `빈 띠 ${note.top}~${note.bottom}px(${note.bottom-note.top}px)`;
    case "photo-area":return `표지 사진 면적 ${Math.round(note.area*100)}% < ${note.shape} 기준 ${Math.round(note.limit*100)}%`;
    case "photo-quality":return `사진 ${note.photo+1} 품질: ${note.flags.join(",")}`;
  }
}
