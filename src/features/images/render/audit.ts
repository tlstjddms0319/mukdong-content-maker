import { AsyncLocalStorage } from "node:async_hooks";
import sharp, { type OverlayOptions } from "sharp";

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

export const CANVAS={width:1080,height:1350} as const;
// 인스타그램 프로필 격자는 4:5 게시물을 가운데 3:4로 보여 준다 → 좌우 각 약 34px가 잘린다.
export const GRID_SAFE_X=Math.ceil((CANVAS.width-CANVAS.height*3/4)/2);

// mask/maskOffset: 그림자를 붙인 글자는 원래 글자(그림자 없는) 버퍼와 그 위치를 따로 넘겨, 대비를 잴 때 획만 "글자"로 본다.
type TextInfo={width:number;height:number;color:string;size:number;mask?:Buffer;maskOffset?:number};
type CompositeCall={canvas:{width?:number;height?:number;buffer?:Buffer};layers:OverlayOptions[]};
export type AuditNote={kind:"shrink";text:string;from:number;to:number}|{kind:"orphan";text:string;ratio:number};
type AuditStore={calls:CompositeCall[];notes:AuditNote[]};

const texts=new WeakMap<Buffer,TextInfo>();
const photos=new WeakSet<Buffer>();
const auditStore=new AsyncLocalStorage<AuditStore>();

export function registerText(buffer:Buffer,info:TextInfo){texts.set(buffer,info);}
// 사진 레이어(finishPhoto·croppedPhoto 결과)를 등록한다. 사진 면적 측정에만 쓴다.
export function registerPhoto(buffer:Buffer){photos.add(buffer);}
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
export type AuditMetrics={photoArea:number;shrinks:number;orphans:number};
export type AuditReport={issues:AuditIssue[];boxes:TextBox[];metrics:AuditMetrics;notes:AuditNote[]};

// 그리기 함수를 검수 컨텍스트 안에서 실행하고 결과 이미지와 함께 검수 결과를 돌려준다.
// contrast:false면 대비 검사(가장 무거운 부분)를 건너뛴다. 실제 앱에서 카드를 그릴 때는 넘침·겹침만 빠르게 본다.
export async function auditRender(render:()=>Promise<Buffer>,options:{cover?:boolean;contrast?:boolean}={}):Promise<{image:Buffer;report:AuditReport}> {
  const store:AuditStore={calls:[],notes:[]};
  const image=await auditStore.run(store,render);
  const {issues,boxes}=await analyze(image,store.calls,options);
  const metrics:AuditMetrics={
    photoArea:await photoAreaOf(store.calls),
    shrinks:store.notes.filter(note=>note.kind==="shrink").length,
    orphans:store.notes.filter(note=>note.kind==="orphan").length,
  };
  return {image,report:{issues,boxes,metrics,notes:store.notes}};
}

async function canvasSize(call:CompositeCall){
  if(call.canvas.width&&call.canvas.height)return {width:call.canvas.width,height:call.canvas.height};
  if(call.canvas.buffer){const meta=await sharp(call.canvas.buffer).metadata();return {width:meta.width??0,height:meta.height??0};}
  return {width:0,height:0};
}

// 캔버스(1080×1350)에 바로 놓인 사진 상자의 합집합 넓이 비율. 사진 자체가 캔버스 밑바탕이면(풀스크린) 1.
// 합집합은 24px 격자로 근사한다(겹친 사진을 두 번 세지 않게).
async function photoAreaOf(calls:CompositeCall[]):Promise<number> {
  const CELL=24,COLS=Math.ceil(CANVAS.width/CELL),ROWS=Math.ceil(CANVAS.height/CELL);
  const covered=new Uint8Array(COLS*ROWS);
  for(const call of calls){
    const size=await canvasSize(call);
    if(size.width!==CANVAS.width||size.height!==CANVAS.height)continue;
    if(call.canvas.buffer&&photos.has(call.canvas.buffer))return 1;
    for(const layer of call.layers){
      if(!Buffer.isBuffer(layer.input)||!photos.has(layer.input))continue;
      const meta=await sharp(layer.input).metadata();
      const x0=Math.max(0,Math.round(layer.left??0)),y0=Math.max(0,Math.round(layer.top??0));
      const x1=Math.min(CANVAS.width,x0+(meta.width??0)),y1=Math.min(CANVAS.height,y0+(meta.height??0));
      for(let cy=Math.floor(y0/CELL);cy<Math.ceil(y1/CELL);cy++)for(let cx=Math.floor(x0/CELL);cx<Math.ceil(x1/CELL);cx++)covered[cy*COLS+cx]=1;
    }
  }
  return Math.round(covered.reduce((sum,v)=>sum+v,0)/(COLS*ROWS)*100)/100;
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

async function alphaOf(box:TextBox){return (await sharp(box.buffer).ensureAlpha().extractChannel(3).raw().toBuffer({resolveWithObject:true}));}

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
