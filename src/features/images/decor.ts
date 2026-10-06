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
// 그림자는 두 겹이다(계획서 B5): 넓고 옅게 퍼지는 주변광 그림자(ambient)와, 물체 바로 밑에 짧고 진하게 붙는
// 주광 그림자(key). 한 겹만 있으면 종이가 공중에 뜬 것처럼 보이고, 두 겹이면 바닥에 놓인 두께가 생긴다.
// 호출하는 쪽은 예전처럼 "번짐 정도(blur)와 진하기(opacity)" 하나만 넘기고, 두 겹의 비율은 여기서 정한다.
export function softShadow(options:{x:number;y:number;width:number;height:number;rx?:number;blur?:number;opacity?:number;rotate?:number}):string {
  const id=uid("shadow"),blur=options.blur??18,rx=options.rx??16,opacity=options.opacity??.22;
  const cx=options.x+options.width/2,cy=options.y+options.height/2;
  // 호출부는 그림자를 물체보다 아래로(y+오프셋) 밀어 넘긴다. 주광 그림자는 그 오프셋을 절반쯤 되돌려 물체 밑에 붙인다.
  const lift=Math.round(blur*.45);
  const rect=(dy:number,filter:string,alpha:number)=>`<rect x="${options.x}" y="${options.y+dy}" width="${options.width}" height="${options.height}" rx="${rx}" fill="#000" fill-opacity="${round(alpha)}" filter="url(#${filter})"/>`;
  return `<defs><filter id="${id}a" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${round(blur*1.5)}"/></filter>`
    +`<filter id="${id}k" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="${round(Math.max(2,blur*.33))}"/></filter></defs>`
    +`<g transform="rotate(${options.rotate??0} ${round(cx)} ${round(cy)})">${rect(0,`${id}a`,opacity*.72)}${rect(-lift,`${id}k`,Math.min(.9,opacity*1.15))}</g>`;
}

// 접촉 그림자: 물체(접시·마스코트·스티커)가 바닥에 닿은 자리에 깔리는 납작한 타원 그림자.
// 물체 아래 가운데(cx, 바닥 y)에 두면 "떠 있는 오림"이 "놓인 물건"이 된다.
export function contactShadow(options:{cx:number;cy:number;rx:number;ry?:number;opacity?:number;blur?:number}):string {
  const id=uid("contact"),ry=options.ry??Math.max(6,Math.round(options.rx*.16)),blur=options.blur??Math.max(4,Math.round(ry*.6));
  return `<defs><filter id="${id}" x="-40%" y="-200%" width="180%" height="500%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>`
    +`<ellipse cx="${round(options.cx)}" cy="${round(options.cy)}" rx="${round(options.rx)}" ry="${round(ry)}" fill="#000" fill-opacity="${options.opacity??.32}" filter="url(#${id})"/>`;
}

// 안쪽 그림자: 창(아치·액자·폴라로이드) 안쪽 가장자리를 어둡게 해 사진이 틀 "안으로" 들어가 보이게 한다.
// 사진 위에 얹는 SVG 조각이다. 창 바깥을 덮는 큰 링(evenodd)을 번지게 한 뒤 창 모양으로 잘라(clipPath) 안쪽 번짐만 남긴다.
// feComposite를 쓰지 않는 이유: librsvg에서 큰 캔버스의 composite가 느리고 경계가 계단지는 일이 있었다.
export function innerShadow(options:{x:number;y:number;width:number;height:number;rx?:number;blur?:number;opacity?:number;color?:string;dy?:number;path?:string}):string {
  const id=uid("inner"),blur=options.blur??12,rx=options.rx??0,pad=blur*4,dy=options.dy??Math.round(blur*.4);
  const {x,y,width:w,height:h}=options;
  // 창 모양: 직접 넘긴 path(아치 등)가 있으면 그것, 없으면 둥근 사각.
  const shape=options.path??`M${x+rx} ${y}H${x+w-rx}${rx?`A${rx} ${rx} 0 0 1 ${x+w} ${y+rx}`:""}V${y+h-rx}${rx?`A${rx} ${rx} 0 0 1 ${x+w-rx} ${y+h}`:""}H${x+rx}${rx?`A${rx} ${rx} 0 0 1 ${x} ${y+h-rx}`:""}V${y+rx}${rx?`A${rx} ${rx} 0 0 1 ${x+rx} ${y}`:""}Z`;
  const outer=`M${x-pad} ${y-pad}H${x+w+pad}V${y+h+pad}H${x-pad}Z`;
  return `<defs><clipPath id="${id}c"><path d="${shape}"/></clipPath><filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>`
    +`<g clip-path="url(#${id}c)"><path d="${outer}${shape}" transform="translate(0 ${dy})" fill-rule="evenodd" fill="${options.color??"#000"}" fill-opacity="${options.opacity??.45}" filter="url(#${id}f)"/></g>`;
}

// ── 레이어 캐시(계획서 '캐시 전역 상한') ─────────────────────────────────────────────────────
// 계열마다 따로 두던 Map 캐시(벽·칠판·종이·질감·그림자)는 합치면 상한이 없어 Render 무료 플랜(512MB)에서 위험하다.
// 이 함수 하나로 모아 전체 크기 48MB·24항목을 넘으면 가장 오래 안 쓴 항목부터 버린다(LRU).
// Map은 넣은 순서를 기억하므로, 꺼낼 때 지웠다가 다시 넣으면 "가장 최근에 쓴 것"이 맨 뒤로 간다.
const LAYER_CACHE_BYTES=48*1024*1024,LAYER_CACHE_ITEMS=24;
const layerCache=new Map<string,{value:Promise<Buffer>;bytes:number}>();
let layerCacheBytes=0;
export async function cachedLayer(key:string,build:()=>Promise<Buffer>):Promise<Buffer> {
  const hit=layerCache.get(key);
  if(hit){layerCache.delete(key);layerCache.set(key,hit);return hit.value;}
  const value=build();
  const entry={value,bytes:0};
  layerCache.set(key,entry);
  try{
    const buffer=await value;
    entry.bytes=buffer.length;layerCacheBytes+=buffer.length;
    // 상한을 넘으면 앞(가장 오래된 것)부터 버린다. 방금 넣은 항목은 남긴다.
    for(const [oldKey,old] of layerCache){
      if(layerCacheBytes<=LAYER_CACHE_BYTES&&layerCache.size<=LAYER_CACHE_ITEMS)break;
      if(oldKey===key)continue;
      layerCache.delete(oldKey);layerCacheBytes-=old.bytes;
    }
    return buffer;
  }catch(error){layerCache.delete(key);throw error;}
}
// 테스트용: 지금 캐시 상태.
export const layerCacheStats=()=>({items:layerCache.size,bytes:layerCacheBytes});

// ── 질감 자산(계획서 B6) ──────────────────────────────────────────────────────────────────
// scripts/bake-textures.mjs가 미리 구워 둔 1080×1350 webp(한지·벽돌·나무·크라프트·분필 가루·리넨·필름 먼지·벨벳)를
// 카드 위에 blend로 얹는다. 매번 feTurbulence를 돌리던 것(0.4~3.5초)이 파일 읽기 한 번(수십 ms)으로 줄어든다.
// 파일이 없으면 null을 돌려주고, 호출하는 쪽은 지금까지의 SVG 질감을 그대로 그린다(폴백).
export const TEXTURES=["hanji","brick","wood","kraft","chalkdust","linen","filmdust","velvet"] as const;
export type TextureName=typeof TEXTURES[number];
const TEXTURE_DIR=path.join(process.cwd(),"assets/design/textures");
export const textureFile=(name:TextureName)=>path.join(TEXTURE_DIR,`${name}.webp`);
export async function textureLayer(name:TextureName,options:{opacity?:number;blend?:OverlayOptions["blend"];left?:number;top?:number;width?:number;height?:number;tint?:string}={}):Promise<OverlayOptions|null> {
  const width=Math.round(options.width??1080),height=Math.round(options.height??1350),opacity=options.opacity??.3;
  const left=Math.round(options.left??0),top=Math.round(options.top??0);
  try{await access(textureFile(name));}catch{return null;}
  const key=`texture:${name}:${width}x${height}:${opacity}:${options.tint??""}`;
  const input=await cachedLayer(key,async()=>{
    // 원본(1080×1350)을 자리 크기로 덮어 자르고, 알파를 opacity로 낮춘다. tint를 주면 회색 질감을 그 색으로 물들인다.
    let image=sharp(textureFile(name)).resize(width,height,{fit:"cover"});
    if(options.tint)image=image.tint(options.tint);
    const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let i=3;i<data.length;i+=4)data[i]=Math.round(data[i]*opacity);
    return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
  });
  return {input,left,top,blend:options.blend??"multiply"};
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
// 4단계(B10)에 hello를 참고해 다시 그린 같은 캐릭터의 포즈(scripts/extract-stickers.mjs로 시트에서 오림).
// 자산 파일이 없으면 mascotLayer가 hello로 대신 그리므로, 이 포즈를 불러도 카드가 깨지지 않는다.
export const EXTRA_POSES=["eating","cheers","point","think","rain","ok"] as const;
export type MascotPose=typeof MASCOT_POSES[number]|typeof EXTRA_POSES[number];
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

// 장 역할에 어울리는 마스코트 포즈(계획서 B10). 계열은 이 표를 따르되, 자리가 좁거나 계열 성격상 다른 포즈가 낫다면 직접 고른다.
export const ROLE_POSES:Record<string,MascotPose>={
  cover:"hello",overview:"curious",detail:"eating","how-to":"tip",pairing:"cheers",process:"point",
  occasion:"cheers",mood:"rain",visit:"ok",cta:"bye",
};

// 소품 스티커(홍어 한 점·막걸리 사발·묵은지·수육·젓가락·빗방울·김). 마스코트와 같은 그림체의 투명 webp다.
// 파일이 없으면 null(소품 없이 그린다). 지시선 끝 아이콘, 간판 양옆 장식, 글자 장 빈자리 채우기에 쓴다.
export const PROPS=["skate","makgeolli","kimchi","suyuk","chopsticks","raindrop","gim"] as const;
export type PropName=typeof PROPS[number];
const PROP_DIR=path.join(process.cwd(),"assets/design/props");
export const propFile=(name:PropName)=>path.join(PROP_DIR,`${name}.webp`);
export async function propLayer(name:PropName,options:{width:number;left:number;top:number;rotate?:number;maxHeight?:number;anchor?:"top-left"|"center"|"bottom-left"|"bottom-right"|"top-right"}):Promise<(OverlayOptions&{left:number;top:number;width:number;height:number})|null> {
  try{await access(propFile(name));}catch{return null;}
  const key=`prop:${name}:${options.width}:${options.maxHeight??0}:${options.rotate??0}`;
  const buffer=await cachedLayer(key,async()=>{
    let image=sharp(propFile(name)).resize({width:Math.round(options.width),...(options.maxHeight?{height:Math.floor(options.maxHeight),fit:"inside" as const}:{})});
    if(options.rotate)image=sharp(await image.png().toBuffer()).rotate(options.rotate,{background:{r:0,g:0,b:0,alpha:0}});
    return image.png().toBuffer();
  });
  const meta=await sharp(buffer).metadata();
  const width=meta.width??options.width,height=meta.height??options.width;
  const anchor=options.anchor??"top-left";
  const left=anchor==="center"?options.left-width/2:anchor.endsWith("right")?options.left-width:options.left;
  const top=anchor==="center"?options.top-height/2:anchor.startsWith("bottom")?options.top-height:options.top;
  return {input:buffer,left:Math.round(left),top:Math.round(top),width,height};
}
