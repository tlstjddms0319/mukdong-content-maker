import sharp from "sharp";
import type { AuditReport } from "./audit";
import type { SeasonMotif } from "../seasonMotif";

// 계절 소품(계획서 B11)을 다 그린 카드 위에 얹는다. 모든 계열·템플릿·홍보 카드에 공통으로 쓴다.
// 계열 파일마다 자리를 따로 잡지 않고, 검수(auditRender)가 이미 아는 "찬 자리"(글자 상자·사진·마스코트·소품)를
// 격자에 칠한 뒤 남은 빈 직사각형에만 그린다. 그래서 글자를 가리거나 대비를 깎지 않는다(검수 결과가 그대로 유효).
// 빈 자리가 없으면(풀스크린 사진처럼) 그리지 않는다. 색동 띠만 예외로 화면 맨 위·아래 가장자리에 얇게 두른다.
// 같은 카드(같은 seed)는 언제나 같은 자리에 같은 모양으로 그린다.

const W=1080,H=1350,CELL=18,COLS=W/CELL,ROWS=Math.ceil(H/CELL);
const TEXT_PAD=30,SHAPE_PAD=18,EDGE=24;
type Rect={left:number;top:number;width:number;height:number};

function rng(seed:number){
  let t=seed>>>0;
  return ()=>{t=(t+0x6D2B79F5)>>>0;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return ((r^(r>>>14))>>>0)/4294967296;};
}

// 찬 자리 격자: 1이면 그릴 수 없는 칸. 화면 가장자리 EDGE 안쪽도 비워 둔다(테두리·장 번호와 붙지 않게).
function occupancy(report:Pick<AuditReport,"boxes"|"occupied">):Uint8Array {
  const grid=new Uint8Array(COLS*ROWS);
  const fill=(rect:Rect,pad:number)=>{
    const x0=Math.max(0,Math.floor((rect.left-pad)/CELL)),x1=Math.min(COLS,Math.ceil((rect.left+rect.width+pad)/CELL));
    const y0=Math.max(0,Math.floor((rect.top-pad)/CELL)),y1=Math.min(ROWS,Math.ceil((rect.top+rect.height+pad)/CELL));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)grid[y*COLS+x]=1;
  };
  for(const box of report.boxes)fill(box,TEXT_PAD);
  for(const box of report.occupied)fill(box,SHAPE_PAD);
  const edge=Math.ceil(EDGE/CELL);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(x<edge||y<edge||x>=COLS-edge||y>=ROWS-edge)grid[y*COLS+x]=1;
  return grid;
}

// 격자에서 가장 큰 빈 직사각형(히스토그램 스택 방식). 찾은 자리는 칠해서 다음 번에 겹치지 않게 한다.
function largestFree(grid:Uint8Array):Rect|null {
  const heights=new Array<number>(COLS).fill(0);
  let best:{area:number;x:number;y:number;w:number;h:number}|null=null;
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++)heights[x]=grid[y*COLS+x]?0:heights[x]+1;
    const stack:number[]=[];
    for(let x=0;x<=COLS;x++){
      const h=x<COLS?heights[x]:0;
      while(stack.length&&heights[stack[stack.length-1]]>=h){
        const top=stack.pop()!,height=heights[top],left=stack.length?stack[stack.length-1]+1:0,width=x-left;
        // 너무 가늘고 긴 띠(가로·세로 한쪽이 4칸 미만)는 소품을 둘 수 없어 넓이 계산에서 뺀다.
        if(height>=4&&width>=4&&height*width>(best?.area??0))best={area:height*width,x:left,y:y-height+1,w:width,h:height};
      }
      stack.push(x);
    }
  }
  if(!best)return null;
  for(let y=best.y;y<best.y+best.h;y++)for(let x=best.x;x<best.x+best.w;x++)grid[y*COLS+x]=1;
  return {left:best.x*CELL,top:best.y*CELL,width:best.w*CELL,height:best.h*CELL};
}

// 실제 그림에서 "고르지 않은 칸"도 찬 자리로 친다. 검수가 모르는 종이 판 가장자리·스프링 고리·장식 선·테두리를
// 소품이 가로지르지 않게 하려는 것. 그림을 칸당 6×6 화소로 줄여(가는 줄도 남게) 칸 안 밝기 차(최대-최소)가 크면 막는다.
// 한지·리넨 같은 옅은 질감은 줄이면서 평균이 되어 고른 칸으로 남는다.
const SAMPLE=6,UNEVEN=14;
async function unevenCells(image:Buffer):Promise<Uint8Array> {
  const {data}=await sharp(image).resize(COLS*SAMPLE,ROWS*SAMPLE,{fit:"fill"}).greyscale().raw().toBuffer({resolveWithObject:true});
  const out=new Uint8Array(COLS*ROWS),stride=COLS*SAMPLE;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    let min=255,max=0;
    for(let dy=0;dy<SAMPLE;dy++)for(let dx=0;dx<SAMPLE;dx++){const v=data[(y*SAMPLE+dy)*stride+x*SAMPLE+dx];if(v<min)min=v;if(v>max)max=v;}
    out[y*COLS+x]=max-min>UNEVEN?1:0;
  }
  // 경계선 한 칸 옆도 막아 소품이 선에 바짝 붙지 않게 한다.
  const grown=out.slice();
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(out[y*COLS+x])for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<COLS&&ny<ROWS)grown[ny*COLS+nx]=1;}
  return grown;
}

function freeRegions(report:Pick<AuditReport,"boxes"|"occupied">,count:number,minWidth:number,minHeight:number,uneven?:Uint8Array):Rect[] {
  const grid=occupancy(report),out:Rect[]=[];
  if(uneven)for(let i=0;i<grid.length;i++)grid[i]|=uneven[i];
  for(let i=0;i<count*3&&out.length<count;i++){
    const rect=largestFree(grid);
    if(!rect)break;
    if(rect.width>=minWidth&&rect.height>=minHeight)out.push(rect);
  }
  return out;
}

// 자리의 바탕 밝기(0~1). 밝은 바탕엔 진한 색, 어두운 바탕엔 밝은 색으로 소품을 그린다.
async function brightness(image:Buffer,rect:Rect):Promise<number> {
  const stats=await sharp(image).extract({left:rect.left,top:rect.top,width:Math.min(rect.width,W-rect.left),height:Math.min(rect.height,H-rect.top)}).stats();
  const [r,g,b]=stats.channels.map(channel=>channel.mean/255);
  return .2126*r+.7152*g+.0722*b;
}

const f=(n:number)=>n.toFixed(1);
const SAEKDONG=["#D94B3D","#F2C14E","#4E9A5B","#3B6FB6","#E58FB0"];

// 빗줄기: 오른쪽 위에서 왼쪽 아래로 비스듬한 가는 선. 자리 넓이에 맞춰 개수를 정한다.
function rain(rect:Rect,light:boolean,random:()=>number):string {
  const color=light?"#4F7590":"#D7E8F5",opacity=light?.34:.4;
  const count=Math.max(6,Math.min(36,Math.round(rect.width*rect.height/9000)));
  let out="";
  for(let i=0;i<count;i++){
    const length=40+random()*55,x=rect.left+18+random()*(rect.width-36),y=rect.top+12+random()*Math.max(1,rect.height-length-24);
    out+=`<path d="M${f(x)} ${f(y)}L${f(x-length*.28)} ${f(y+length)}" stroke="${color}" stroke-opacity="${(opacity*(.6+random()*.4)).toFixed(2)}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  return out;
}

// 눈송이: 작은 점과 여섯 갈래 별을 섞는다.
function snow(rect:Rect,light:boolean,random:()=>number):string {
  const color=light?"#6F95B3":"#FFFFFF",opacity=light?.72:.8;
  const count=Math.max(6,Math.min(30,Math.round(rect.width*rect.height/8000)));
  let out="";
  for(let i=0;i<count;i++){
    const r=4+random()*8,x=rect.left+r+10+random()*(rect.width-2*r-20),y=rect.top+r+10+random()*(rect.height-2*r-20);
    if(r<7){out+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r*.6)}" fill="${color}" fill-opacity="${opacity}"/>`;continue;}
    const arms=[0,60,120].map(a=>{const rad=a*Math.PI/180,dx=Math.cos(rad)*r*1.5,dy=Math.sin(rad)*r*1.5;return `M${f(x-dx)} ${f(y-dy)}L${f(x+dx)} ${f(y+dy)}`;}).join("");
    out+=`<path d="${arms}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return out;
}

// 꽃잎: 끝이 살짝 갈라진 벚꽃 잎 모양을 흩뿌린다.
function blossom(rect:Rect,_light:boolean,random:()=>number):string {
  const colors=["#F2A7B8","#F7C6D1","#EE93A8"];
  const count=Math.max(4,Math.min(12,Math.round(rect.width*rect.height/16000)));
  let out="";
  for(let i=0;i<count;i++){
    const s=12+random()*12,x=rect.left+s+12+random()*(rect.width-2*s-24),y=rect.top+s+12+random()*(rect.height-2*s-24),rot=Math.round(random()*360);
    const petal=`M0 ${f(s)}C${f(-s*.9)} ${f(s*.2)} ${f(-s*.6)} ${f(-s*.9)} ${f(-s*.12)} ${f(-s)}L0 ${f(-s*.72)}L${f(s*.12)} ${f(-s)}C${f(s*.6)} ${f(-s*.9)} ${f(s*.9)} ${f(s*.2)} 0 ${f(s)}Z`;
    out+=`<path d="${petal}" fill="${colors[i%colors.length]}" fill-opacity=".88" transform="translate(${f(x)} ${f(y)}) rotate(${rot})"/>`;
  }
  return out;
}

// 가을 잎: 끝이 뾰족한 잎에 가운데 잎맥과 잎자루. 붉은색·주황·밤색을 섞는다.
function leaves(rect:Rect,_light:boolean,random:()=>number):string {
  const colors=["#C8522B","#D98C2B","#A63D2A"];
  const count=Math.max(3,Math.min(9,Math.round(rect.width*rect.height/22000)));
  let out="";
  for(let i=0;i<count;i++){
    const s=16+random()*12,x=rect.left+s*1.4+10+random()*(rect.width-2.8*s-20),y=rect.top+s*1.4+10+random()*(rect.height-2.8*s-20),rot=Math.round(random()*360),color=colors[i%colors.length];
    const leaf=`M0 ${f(-s)}C${f(s*.75)} ${f(-s*.55)} ${f(s*.7)} ${f(s*.45)} 0 ${f(s*.8)}C${f(-s*.7)} ${f(s*.45)} ${f(-s*.75)} ${f(-s*.55)} 0 ${f(-s)}Z`;
    out+=`<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})"><path d="${leaf}" fill="${color}" fill-opacity=".88"/>`
      +`<path d="M0 ${f(-s*.8)}L0 ${f(s*1.25)}" stroke="#5A2A17" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/></g>`;
  }
  return out;
}

// 보름달: 자리 안 오른쪽 위에 하나. 은은한 달무리와 옅은 무늬.
function moon(rect:Rect,light:boolean):string {
  const r=Math.min(92,Math.floor(Math.min(rect.width,rect.height)/2-26));
  if(r<46)return "";
  const cx=rect.left+rect.width-r-26,cy=rect.top+r+26;
  const halo=light?"#F0C75E":"#F7DE8F";
  return `<defs><radialGradient id="moonhalo"><stop offset=".55" stop-color="${halo}" stop-opacity="${light?.28:.35}"/><stop offset="1" stop-color="${halo}" stop-opacity="0"/></radialGradient></defs>`
    +`<circle cx="${cx}" cy="${cy}" r="${Math.round(r*1.45)}" fill="url(#moonhalo)"/>`
    +`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#F4D77E"${light?` stroke="#D8A93A" stroke-opacity=".55" stroke-width="2"`:""}/>`
    +`<circle cx="${f(cx-r*.3)}" cy="${f(cy-r*.15)}" r="${f(r*.2)}" fill="#E2BE62" fill-opacity=".35"/><circle cx="${f(cx+r*.25)}" cy="${f(cy+r*.3)}" r="${f(r*.14)}" fill="#E2BE62" fill-opacity=".3"/>`;
}

// 색동 띠: 다섯 색 줄을 쌓은 얇은 띠. 화면 맨 위나 맨 아래 가장자리(글자가 닿지 않는 쪽)에 두르고, 둘 다 막혔으면 빈 자리 가운데에 짧게.
function saekdongBand(x:number,y:number,width:number,stripe=4):string {
  return SAEKDONG.map((color,i)=>`<rect x="${x}" y="${y+i*stripe}" width="${width}" height="${stripe}" fill="${color}"/>`).join("");
}
function saekdong(report:Pick<AuditReport,"boxes"|"occupied">,uneven:Uint8Array):string {
  const band=SAEKDONG.length*5;
  const clear=(top:number,bottom:number)=>report.boxes.every(box=>box.top+box.height<=top||box.top>=bottom);
  if(clear(0,band+8))return saekdongBand(0,0,W,5);
  if(clear(H-band-8,H))return saekdongBand(0,H-band,W,5);
  const [rect]=freeRegions(report,1,240,90,uneven);
  if(!rect)return "";
  const width=Math.min(rect.width-40,360);
  return saekdongBand(Math.round(rect.left+(rect.width-width)/2),Math.round(rect.top+(rect.height-band)/2),width,6);
}

// 카드(JPEG) 위에 계절 소품을 얹은 새 JPEG. none이거나 둘 자리가 없으면 받은 그림을 그대로 돌려준다.
export async function addSeasonMotif(image:Buffer,report:Pick<AuditReport,"boxes"|"occupied">,motif:SeasonMotif|undefined,seed:number):Promise<Buffer> {
  if(!motif||motif==="none")return image;
  const random=rng(seed*7919+motif.length);
  const uneven=await unevenCells(image);
  let body="";
  if(motif==="saekdong")body=saekdong(report,uneven);
  else if(motif==="moon"){
    const [rect]=freeRegions(report,1,200,200,uneven);
    if(rect)body=moon(rect,await brightness(image,rect)>.5);
  }else{
    const draw={rain,snow,blossom,leaves}[motif];
    const [minW,minH]=motif==="rain"||motif==="snow"?[180,160]:[150,140];
    for(const rect of freeRegions(report,2,minW,minH,uneven))body+=draw(rect,await brightness(image,rect)>.5,random);
  }
  if(!body)return image;
  return sharp(image).composite([{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`),left:0,top:0}]).jpeg({quality:92}).toBuffer();
}
