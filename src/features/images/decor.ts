import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";

// 카드 장식 요소 모음. 종이 질감, 마스킹 테이프, 반짝이, 물결 밑줄, 스티커, 점 무늬, 낙서 화살표 등을
// SVG 조각(문자열)으로 만들어 돌려준다. 그리기 함수는 조각을 한 장의 SVG 레이어로 묶어 캔버스에 올린다.
// 색은 항상 호출하는 쪽에서 팔레트 값을 넘긴다. 여기서는 색을 정하지 않는다.

const round=(value:number)=>Math.round(value*10)/10;

// SVG 안에서 id가 겹치면 뒤의 패턴·필터가 앞의 것을 덮어쓴다. 호출마다 다른 id를 만든다.
let sequence=0;
const uid=(prefix:string)=>`${prefix}${(sequence=(sequence+1)%100000)}`;

// 네 갈래 반짝이. size는 중심에서 꼭짓점까지의 길이.
export function sparkles(points:ReadonlyArray<readonly [number,number,number]>,color:string,opacity=1):string {
  return points.map(([x,y,s])=>{
    const inner=s*.28;
    return `<path d="M${x} ${y-s}L${round(x+inner)} ${round(y-inner)}L${x+s} ${y}L${round(x+inner)} ${round(y+inner)}L${x} ${y+s}L${round(x-inner)} ${round(y+inner)}L${x-s} ${y}L${round(x-inner)} ${round(y-inner)}Z" fill="${color}" fill-opacity="${opacity}"/>`;
  }).join("");
}

// 마스킹(와시) 테이프. 양 끝을 톱니처럼 찢고, 반투명하게 칠해 아래 사진이 비친다. 가운데를 기준으로 기울인다.
export function washiTape(options:{x:number;y:number;width:number;height?:number;angle?:number;color:string;opacity?:number}):string {
  const {x,y,width,color}=options,height=options.height??46,angle=options.angle??-6,opacity=options.opacity??.78;
  const teeth=4,bite=6,step=height/teeth;
  const left:string[]=[],right:string[]=[];
  for(let i=0;i<=teeth;i++){
    const offset=i%2===0?0:bite;
    left.push(`${round(x+offset)},${round(y+i*step)}`);
    right.push(`${round(x+width-offset)},${round(y+height-i*step)}`);
  }
  const stripes=[.3,.55,.8].map(f=>`<path d="M${x+8} ${round(y+height*f)}H${x+width-8}" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>`).join("");
  return `<g transform="rotate(${angle} ${round(x+width/2)} ${round(y+height/2)})"><polygon points="${[...left,...right].join(" ")}" fill="${color}" fill-opacity="${opacity}"/>${stripes}</g>`;
}

// 손으로 그은 듯한 물결 밑줄. 반 파장마다 위아래로 번갈아 휜다.
export function wavyUnderline(options:{x:number;y:number;width:number;color:string;amplitude?:number;wavelength?:number;strokeWidth?:number;opacity?:number}):string {
  const {x,y,width,color}=options,a=options.amplitude??5,wl=options.wavelength??26,sw=options.strokeWidth??5;
  let d=`M${x} ${y}`;
  for(let cursor=x,up=true;cursor<x+width;cursor+=wl,up=!up){
    const end=Math.min(cursor+wl,x+width);
    d+=`Q${round(cursor+wl/2)} ${round(y+(up?-a:a))} ${round(end)} ${y}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${options.opacity??1}" stroke-width="${sw}" stroke-linecap="round"/>`;
}

// 가장자리가 톱니인 스티커(가격표·배지 모양). 흰 테두리를 둘러 종이 위에 붙인 느낌을 낸다.
export function stickerBadge(options:{cx:number;cy:number;r:number;fill:string;stroke?:string;teeth?:number;rotate?:number}):string {
  const {cx,cy,r,fill}=options,teeth=options.teeth??18,inner=r*.86;
  const points:string[]=[];
  for(let i=0;i<teeth*2;i++){
    const radius=i%2===0?r:inner,angle=(Math.PI*2*i)/(teeth*2);
    points.push(`${round(cx+Math.cos(angle)*radius)},${round(cy+Math.sin(angle)*radius)}`);
  }
  return `<polygon points="${points.join(" ")}" fill="${fill}" stroke="${options.stroke??"#ffffff"}" stroke-width="5" stroke-linejoin="round" transform="rotate(${options.rotate??0} ${cx} ${cy})"/>`;
}

// 점 무늬(폴카 도트) 영역. 패턴 id는 호출마다 새로 만든다.
export function dotGrid(options:{x:number;y:number;width:number;height:number;color:string;gap?:number;r?:number;opacity?:number}):string {
  const id=uid("dots"),gap=options.gap??22,r=options.r??3;
  return `<defs><pattern id="${id}" x="${options.x}" y="${options.y}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><circle cx="${gap/2}" cy="${gap/2}" r="${r}" fill="${options.color}"/></pattern></defs><rect x="${options.x}" y="${options.y}" width="${options.width}" height="${options.height}" fill="url(#${id})" fill-opacity="${options.opacity??.35}"/>`;
}

// 둥글둥글한 유기적 덩어리(블롭). seed로 모양을 고정해 같은 입력이면 같은 그림이 나온다.
export function blob(options:{cx:number;cy:number;r:number;color:string;opacity?:number;seed?:number;rotate?:number}):string {
  const {cx,cy,r,color}=options,seed=options.seed??1;
  // 8개 꼭짓점의 반지름을 seed에 따라 0.78~1.0 사이로 흔들고 부드러운 곡선으로 잇는다.
  const wobble=(i:number)=>.78+((Math.sin(seed*7.3+i*2.1)+1)/2)*.22;
  const pts=Array.from({length:8},(_,i)=>{const angle=(Math.PI*2*i)/8,rad=r*wobble(i);return [cx+Math.cos(angle)*rad,cy+Math.sin(angle)*rad] as const;});
  let d=`M${round((pts[0][0]+pts[7][0])/2)} ${round((pts[0][1]+pts[7][1])/2)}`;
  for(let i=0;i<8;i++){const p=pts[i],n=pts[(i+1)%8];d+=`Q${round(p[0])} ${round(p[1])} ${round((p[0]+n[0])/2)} ${round((p[1]+n[1])/2)}`;}
  return `<path d="${d}Z" fill="${color}" fill-opacity="${options.opacity??.5}" transform="rotate(${options.rotate??0} ${cx} ${cy})"/>`;
}

// 낙서풍 곡선 화살표. 시작점에서 끝점으로 살짝 휘어 가고 끝에 열린 화살촉을 단다.
export function doodleArrow(options:{x1:number;y1:number;x2:number;y2:number;color:string;strokeWidth?:number;bend?:number}):string {
  const {x1,y1,x2,y2,color}=options,sw=options.strokeWidth??5,bend=options.bend??.25;
  const mx=(x1+x2)/2,my=(y1+y2)/2,dx=x2-x1,dy=y2-y1;
  const cx=mx-dy*bend,cy=my+dx*bend; // 진행 방향에 수직으로 제어점을 밀어 곡선을 만든다.
  const angle=Math.atan2(y2-cy,x2-cx),head=sw*3.2;
  const tip=(offset:number)=>`${round(x2-Math.cos(angle+offset)*head)} ${round(y2-Math.sin(angle+offset)*head)}`;
  return `<path d="M${x1} ${y1}Q${round(cx)} ${round(cy)} ${x2} ${y2}M${tip(.5)}L${x2} ${y2}L${tip(-.5)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// 점선 또는 실선 고리.
export function ring(options:{cx:number;cy:number;r:number;color:string;strokeWidth?:number;dashed?:boolean;opacity?:number}):string {
  return `<circle cx="${options.cx}" cy="${options.cy}" r="${options.r}" fill="none" stroke="${options.color}" stroke-opacity="${options.opacity??1}" stroke-width="${options.strokeWidth??3}"${options.dashed?` stroke-dasharray="${(options.strokeWidth??3)*2.2} ${(options.strokeWidth??3)*3}" stroke-linecap="round"`:""}/>`;
}

// 사진 네 귀퉁이의 ㄱ자 표시(크롭 마크). 풀스크린·인용구처럼 사진 위 레이아웃의 테두리를 잡아 준다.
export function cornerMarks(options:{inset:number;length:number;color:string;strokeWidth?:number;opacity?:number;width?:number;height?:number}):string {
  const {inset,length,color}=options,W=options.width??1080,H=options.height??1350,sw=options.strokeWidth??3;
  const corners=[[inset,inset,1,1],[W-inset,inset,-1,1],[inset,H-inset,1,-1],[W-inset,H-inset,-1,-1]] as const;
  return corners.map(([x,y,sx,sy])=>`<path d="M${x} ${y+sy*length}V${y}H${x+sx*length}" fill="none" stroke="${color}" stroke-opacity="${options.opacity??.7}" stroke-width="${sw}" stroke-linecap="round"/>`).join("");
}

// 가장자리가 번진 부드러운 그림자. 카드·사진 뒤에 깐다. 필터 영역을 넉넉히 잡아야 번진 부분이 잘리지 않는다.
export function softShadow(options:{x:number;y:number;width:number;height:number;rx?:number;blur?:number;opacity?:number;rotate?:number}):string {
  const id=uid("shadow"),blur=options.blur??18,rx=options.rx??16;
  const cx=options.x+options.width/2,cy=options.y+options.height/2;
  return `<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect x="${options.x}" y="${options.y}" width="${options.width}" height="${options.height}" rx="${rx}" fill="#000" fill-opacity="${options.opacity??.22}" filter="url(#${id})" transform="rotate(${options.rotate??0} ${round(cx)} ${round(cy)})"/>`;
}

// 종이 질감(필름 그레인). feTurbulence 잡음을 회색으로 바꿔 soft-light로 겹치면 밝기는 거의 그대로이고 결만 생긴다.
// 1080×1350 한 장을 만들어 두고 모든 카드에 다시 쓴다.
const grainCache=new Map<string,Promise<Buffer>>();
export function grainLayer(options:{opacity?:number;width?:number;height?:number;scale?:number}={}):Promise<OverlayOptions> {
  const width=options.width??1080,height=options.height??1350,opacity=options.opacity??.16,scale=options.scale??.8;
  const key=`${width}x${height}:${opacity}:${scale}`;
  if(!grainCache.has(key)){
    const svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${scale}" numOctaves="2" stitchTiles="stitch" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.3" intercept="-0.45"/><feFuncG type="linear" slope="1.3" intercept="-0.45"/><feFuncB type="linear" slope="1.3" intercept="-0.45"/><feFuncA type="linear" slope="0" intercept="${opacity}"/></feComponentTransfer></filter><rect width="${width}" height="${height}" filter="url(#g)"/></svg>`;
    grainCache.set(key,sharp(Buffer.from(svg)).png().toBuffer());
  }
  return grainCache.get(key)!.then(input=>({input,left:0,top:0,blend:"soft-light"}));
}

// 마스코트(홍어 캐릭터) 레이어. 자산 파일이 없으면 null을 돌려주고 카드는 마스코트 없이 그려진다.
// 포즈별 투명 webp는 scripts/extract-mascot.mjs가 캐릭터 스티커 시트에서 오려 만든다.
export const MASCOT_POSES=["hello","curious","tip","wow","love","bye"] as const;
export type MascotPose=typeof MASCOT_POSES[number];
const MASCOT_DIR=path.join(process.cwd(),"assets/design/mascot");
export const mascotFile=(pose:MascotPose)=>path.join(MASCOT_DIR,`${pose}.webp`);
export const MASCOT_FILE=mascotFile("hello");
const mascotCache=new Map<string,Promise<{data:Buffer;info:{width:number;height:number}}|null>>();
// maxHeight를 주면 그림이 그 높이를 넘지 않게 비율대로 줄인다. 글자와 겹치지 않는 빈 공간 높이를 넘겨 쓰고,
// minHeight보다 작아질 만큼 공간이 좁으면 null을 돌려 마스코트를 생략한다(작게 뭉개진 캐릭터보다 없는 편이 낫다).
export async function mascotLayer(options:{width:number;left:number;top:number;pose?:MascotPose;flip?:boolean;rotate?:number;anchor?:"top-left"|"bottom-left"|"bottom-right"|"top-right";maxHeight?:number;minHeight?:number}):Promise<(OverlayOptions&{left:number;top:number;width:number;height:number})|null> {
  if(options.maxHeight!==undefined&&options.maxHeight<(options.minHeight??100))return null;
  const pose=options.pose??"hello";
  const key=`${pose}:${options.width}:${options.maxHeight??0}:${options.flip?1:0}:${options.rotate??0}`;
  if(!mascotCache.has(key)){
    mascotCache.set(key,(async()=>{
      // 요청한 포즈 파일이 없으면 기본 포즈(hello)로, 그것도 없으면 마스코트를 생략한다.
      let file=mascotFile(pose);
      try{await access(file);}catch{
        file=MASCOT_FILE;
        try{await access(file);}catch{return null;}
      }
      let image=sharp(file).resize({width:options.width,...(options.maxHeight?{height:Math.floor(options.maxHeight),fit:"inside" as const}:{})});
      if(options.flip)image=image.flop();
      if(options.rotate)image=sharp(await image.png().toBuffer()).rotate(options.rotate,{background:{r:0,g:0,b:0,alpha:0}});
      return image.png().toBuffer({resolveWithObject:true});
    })());
  }
  const mascot=await mascotCache.get(key)!;
  if(!mascot)return null;
  // anchor는 left/top이 가리키는 모서리. 아래쪽 기준이면 그림 높이만큼 위로 올린다.
  const anchor=options.anchor??"top-left";
  const left=anchor.endsWith("right")?options.left-mascot.info.width:options.left;
  const top=anchor.startsWith("bottom")?options.top-mascot.info.height:options.top;
  // 말풍선이 캐릭터 옆에 붙고 꼬리가 캐릭터를 가리키도록, 그려진 크기와 위치를 함께 돌려준다.
  return {input:mascot.data,left:Math.round(left),top:Math.round(top),width:mascot.info.width,height:mascot.info.height};
}
