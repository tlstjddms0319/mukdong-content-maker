import sharp, { type OverlayOptions } from "sharp";
import type { Font, Layer } from "../render/primitives";
import { fitText } from "./shared";

// 손으로 그린 듯한 선·도형과 빛나는 글자. 네온·한지·칠판·낙서 계열이 함께 쓴다.
// 손그림 느낌은 "조금씩 흔들리는 선"에서 나온다. 매번 다르게 흔들리면 같은 카드가 다시 그릴 때마다 바뀌므로,
// 장 번호 같은 seed로 정해지는 의사 난수를 쓴다(같은 입력 → 같은 그림).

export function seeded(seed:number):()=>number {
  let a=(seed*2654435761)>>>0||1;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const jitter=(rand:()=>number,amount:number)=>(rand()-.5)*2*amount;
const round1=(value:number)=>Math.round(value*10)/10;

// 점들을 부드럽게 잇는 경로(이웃 점의 중간을 지나는 2차 곡선). 손그림 선의 기본.
function smoothPath(points:Array<[number,number]>):string {
  if(points.length<2)return "";
  let d=`M${round1(points[0][0])} ${round1(points[0][1])}`;
  for(let i=1;i<points.length-1;i++){
    const [x,y]=points[i],[nx,ny]=points[i+1];
    d+=` Q${round1(x)} ${round1(y)} ${round1((x+nx)/2)} ${round1((y+ny)/2)}`;
  }
  const last=points[points.length-1];
  return d+` L${round1(last[0])} ${round1(last[1])}`;
}

// 흔들리는 직선(밑줄·테두리). amount만큼 위아래로 떨린다.
export function wobblyLine(x1:number,y1:number,x2:number,y2:number,rand:()=>number,amount=3,steps=8):string {
  const points:Array<[number,number]>=Array.from({length:steps+1},(_,i)=>{const t=i/steps;return [x1+(x2-x1)*t+jitter(rand,amount*.4),y1+(y2-y1)*t+jitter(rand,amount)];});
  return smoothPath(points);
}

// 손으로 두른 동그라미: 한 바퀴 조금 넘게 돌고, 시작과 끝이 살짝 어긋난다.
export function handEllipse(cx:number,cy:number,rx:number,ry:number,rand:()=>number,amount=6):string {
  const start=rand()*Math.PI*2,turns=1.12,steps=28;
  const points:Array<[number,number]>=Array.from({length:steps+1},(_,i)=>{
    const a=start+(Math.PI*2*turns*i)/steps,grow=1+.05*(i/steps);
    return [cx+Math.cos(a)*rx*grow+jitter(rand,amount),cy+Math.sin(a)*ry*grow+jitter(rand,amount)];
  });
  return smoothPath(points);
}

// 손으로 그린 화살표(살짝 휘어진 몸통 + 두 갈래 머리). 머리는 끝점 방향을 따른다.
export function handArrow(x1:number,y1:number,x2:number,y2:number,rand:()=>number,bend=.18):string {
  const mx=(x1+x2)/2,my=(y1+y2)/2,dx=x2-x1,dy=y2-y1;
  const cx=mx-dy*bend+jitter(rand,8),cy=my+dx*bend+jitter(rand,8);
  const angle=Math.atan2(y2-cy,x2-cx),head=Math.max(22,Math.hypot(dx,dy)*.14);
  const wing=(side:number)=>`M${round1(x2)} ${round1(y2)} L${round1(x2-Math.cos(angle+side*.5)*head)} ${round1(y2-Math.sin(angle+side*.5)*head)}`;
  return `M${round1(x1)} ${round1(y1)} Q${round1(cx)} ${round1(cy)} ${round1(x2)} ${round1(y2)} ${wing(1)} ${wing(-1)}`;
}

// 꼬불꼬불한 밑줄.
export function squiggle(x:number,y:number,width:number,rand:()=>number,height=10):string {
  const waves=Math.max(3,Math.round(width/46));
  const points:Array<[number,number]>=Array.from({length:waves*2+1},(_,i)=>[x+(width*i)/(waves*2),y+(i%2?height:-height)*.5+jitter(rand,2)]);
  return smoothPath(points);
}

// 다섯 갈래 별(낙서·칠판 장식).
export function handStar(cx:number,cy:number,r:number,rand:()=>number):string {
  const points:Array<[number,number]>=Array.from({length:11},(_,i)=>{const a=-Math.PI/2+(Math.PI*i)/5,k=i%2?.45:1;return [cx+Math.cos(a)*r*k+jitter(rand,r*.06),cy+Math.sin(a)*r*k+jitter(rand,r*.06)];});
  return `M${points.map(([x,y])=>`${round1(x)} ${round1(y)}`).join(" L")} Z`;
}

// 빛나는 글자(네온관). 같은 글자를 색 번짐(크게 흐린 것 → 덜 흐린 것)으로 여러 겹 깔고 맨 위에 밝은 심지 색을 얹는다.
// 번짐이 잘리지 않게 사방으로 pad만큼 여백을 둔다. 돌려주는 레이어의 (pad, pad) 위치가 글자 시작점이다.
export async function glowText(value:string,options:{sizes:number[];width:number;maxHeight:number;font:Font;core:string;glow:string;align?:"left"|"centre";spacing?:number}):Promise<Layer&{pad:number}> {
  const core=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,color:options.core,font:options.font,align:options.align,spacing:options.spacing});
  const tinted=await fitText(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight,color:options.glow,font:options.font,align:options.align,spacing:options.spacing});
  const pad=Math.round(Math.max(18,core.info.height*.18));
  const W=core.info.width+pad*2,H=core.info.height+pad*2;
  const padded=await sharp(tinted.data).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const blur=async(sigma:number)=>sharp(padded).blur(sigma).png().toBuffer();
  const layers:OverlayOptions[]=[
    {input:await blur(pad*.9),left:0,top:0},
    {input:await blur(pad*.45),left:0,top:0},
    {input:await blur(Math.max(1,pad*.12)),left:0,top:0},
    {input:core.data,left:pad,top:pad},
  ];
  const result=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
  return {...result,pad};
}

// 빛나는 선(네온관 테두리·장식). SVG 안에서 흐림 필터로 번짐을 만든다.
export function neonStroke(d:string,color:string,width=6):string {
  const id=`g${Math.abs(hash(d+color))}`;
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${width*1.6}"/></filter>`
    +`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width*2.2}" stroke-linecap="round" stroke-linejoin="round" filter="url(#${id})" opacity=".9"/>`
    +`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
    +`<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${Math.max(1.5,width*.35)}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;
}
function hash(text:string){let h=0;for(let i=0;i<text.length;i++)h=(h*31+text.charCodeAt(i))|0;return h;}
