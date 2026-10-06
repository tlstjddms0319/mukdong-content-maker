import sharp, { type OverlayOptions } from "sharp";
import { brandName, finishPhoto, grainLayer, svg, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STYLE_FONTS, contentOf, fitText, rotated, snap } from "./shared";
import { seeded } from "./handDrawn";

// 수채화(파스텔 물감 번짐): 흰 종이 위에 큰 파스텔 얼룩을 두세 개 깔고, 둥근 손글씨 제목 뒤에 거친 붓 띠를 긋는다.
// 사진은 모서리를 둥글리고 가장자리를 종이에 스며들 듯 부드럽게(페더) 자른 뒤, 뒤에 살짝 어긋난 파스텔 붓 사각형과
// 종이 테이프로 붙인다. 요점 앞에는 작은 물감 점, 글자만 있는 장은 아래에 튄 물감. 카페 엽서처럼 밝고 부드러운 안부 글용.
// 파스텔은 옅어서 글자 대비가 떨어지기 쉬우므로 글자는 모두 진회색(INK)이고, 얼룩·띠는 글자 뒤에 와도 4:1 넘게 옅게 깐다.
const PAPER="#FCFBF7",INK="#3B3A36";
type Pastel={fill:string;edge:string};
// fill은 물감이 번진 안쪽, edge는 마르면서 가장자리에 모인 조금 진한 색.
const PASTEL={
  pink:{fill:"#F6C9D0",edge:"#E9A4B1"},
  mint:{fill:"#CDE8D8",edge:"#9ED4BA"},
  sky:{fill:"#CFE0F2",edge:"#9EBFE6"},
  butter:{fill:"#F7E7B4",edge:"#E8CF7E"},
  lilac:{fill:"#E2D3F0",edge:"#C2A8E0"},
} as const satisfies Record<string,Pastel>;
// 장마다 돌려 쓰는 두 색 조합. 첫 색은 얼룩·붓 사각형, 둘째 색은 띠·테이프·점에 쓴다.
const COMBOS:Array<[Pastel,Pastel]>=[[PASTEL.pink,PASTEL.mint],[PASTEL.sky,PASTEL.butter],[PASTEL.lilac,PASTEL.pink],[PASTEL.mint,PASTEL.sky],[PASTEL.butter,PASTEL.lilac]];
const M=80,W=1080-M*2,FOOTER_TOP=1260;
const r1=(value:number)=>Math.round(value*10)/10;
type Box={x:number;y:number;w:number;h:number};

// ── 물감 ────────────────────────────────────────────────────────────────────────────
// 일그러뜨리기 필터: 낮은 주파수 난류(feTurbulence)로 도형을 크게 일그러뜨린다(feDisplacementMap).
// 필터 영역은 도형 상자에 "일그러지는 폭 + 흐림 폭"만 더해 꼭 맞게 잡는다. 난류·변위 계산은 영역 넓이에 비례해 느려서,
// 비율 영역(상자의 170% 등)을 쓰면 큰 얼룩 하나에 1초 가까이 걸린다.
function warp(id:string,seed:number,options:{scale:number;freq:number;blur:number;box:Box}):string {
  const pad=Math.ceil(options.scale*.55+options.blur*3+8),{x,y,w,h}=options.box;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${r1(x-pad)}" y="${r1(y-pad)}" width="${r1(w+pad*2)}" height="${r1(h+pad*2)}" color-interpolation-filters="sRGB">`
    +`<feTurbulence type="fractalNoise" baseFrequency="${options.freq}" numOctaves="1" seed="${seed}" result="warp"/>`
    +`<feDisplacementMap in="SourceGraphic" in2="warp" scale="${options.scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
}
// 번짐(흐림) 필터. 일그러뜨리기 전에 자식 도형마다 따로 걸어, 채움은 많이·가장자리 선은 조금만 번지게 한다.
function soften(id:string,blur:number,box:Box):string {
  const pad=Math.ceil(blur*3+6);
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${r1(box.x-pad)}" y="${r1(box.y-pad)}" width="${r1(box.w+pad*2)}" height="${r1(box.h+pad*2)}"><feGaussianBlur stdDeviation="${blur}"/></filter>`;
}
// 큰 수채 얼룩: 번지게 흐린 채움 타원 + 안쪽의 옅은 물 고임 + 같은 모양의 가는 진한 선(물감 가장자리가 마르며 진해지는 느낌)을
// 한 묶음으로 두고 묶음 전체를 한 번만 일그러뜨린다(변위가 가장 비싼 계산이라 얼룩마다 한 번). 세 도형이 똑같이 일그러져 겹친다.
function blot(cx:number,cy:number,rx:number,ry:number,p:Pastel,seed:number,rotate=0,opacity=.8):string {
  const id=`wcBlot${seed}`,box={x:cx-rx,y:cy-ry,w:rx*2,h:ry*2};
  return warp(id,seed,{scale:84,freq:.011,blur:7,box})+soften(`${id}f`,7,box)+soften(`${id}e`,2.4,box)
    +`<g transform="rotate(${rotate} ${r1(cx)} ${r1(cy)})" filter="url(#${id})">`
    +`<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${p.fill}" opacity="${opacity}" filter="url(#${id}f)"/>`
    +`<ellipse cx="${r1(cx+rx*.1)}" cy="${r1(cy-ry*.12)}" rx="${r1(rx*.55)}" ry="${r1(ry*.5)}" fill="#FFFFFF" opacity=".3" filter="url(#${id}f)"/>`
    +`<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="none" stroke="${p.edge}" stroke-width="10" opacity=".7" filter="url(#${id}e)"/></g>`;
}
// 제목 뒤 거친 붓 띠: 사각형 가장자리를 잘게 일그러뜨려 마른 붓 자국처럼. 아래쪽에 진한 선을 얹어 물감이 고인 느낌.
function brushBand(x:number,y:number,w:number,h:number,p:Pastel,seed:number,rotate=-1):string {
  const id=`wcBand${seed}`,cx=x+w/2,cy=y+h/2,box={x,y,w,h};
  return warp(id,seed,{scale:24,freq:.035,blur:1.1,box})+soften(`${id}f`,1.1,box)
    +`<g transform="rotate(${rotate} ${r1(cx)} ${r1(cy)})" filter="url(#${id})"><g filter="url(#${id}f)">`
    +`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="6" fill="${p.fill}" opacity=".82"/>`
    +`<path d="M${r1(x+10)} ${r1(y+h-4)}H${r1(x+w-14)}" stroke="${p.edge}" stroke-width="4" opacity=".5"/></g></g>`;
}
// 가장자리가 들쭉날쭉한 사각형 경로: 네 변을 step 간격의 점으로 잇고 점마다 amp만큼 흔든다(변위 필터 없이 거친 붓 자국).
function roughRect(x:number,y:number,w:number,h:number,rand:()=>number,amp:number,step:number):string {
  const points:string[]=[];
  const edge=(x1:number,y1:number,x2:number,y2:number)=>{
    const n=Math.max(2,Math.round(Math.hypot(x2-x1,y2-y1)/step));
    for(let i=0;i<n;i++){const t=i/n;points.push(`${r1(x1+(x2-x1)*t+(rand()-.5)*2*amp)} ${r1(y1+(y2-y1)*t+(rand()-.5)*2*amp)}`);}
  };
  edge(x,y,x+w,y);edge(x+w,y,x+w,y+h);edge(x+w,y+h,x,y+h);edge(x,y+h,x,y);
  return `M${points.join("L")}Z`;
}
// 사진 뒤 파스텔 붓 사각형: 가장자리가 거친 큰 색면. 사진보다 조금 크고 살짝 어긋나게 놓는다.
// 대부분 사진에 가려지므로 비싼 변위 필터 대신 흔든 다각형 + 약한 흐림으로 그린다.
function brushRect(x:number,y:number,w:number,h:number,p:Pastel,seed:number,rand:()=>number,rotate:number):string {
  const id=`wcRect${seed}`,cx=x+w/2,cy=y+h/2;
  return soften(id,1.4,{x:x-10,y:y-10,w:w+20,h:h+20})
    +`<g transform="rotate(${rotate} ${r1(cx)} ${r1(cy)})" filter="url(#${id})">`
    +`<path d="${roughRect(x,y,w,h,rand,5,14)}" fill="${p.fill}" opacity=".88"/>`
    +`<path d="${roughRect(x+9,y+9,w-18,h-18,rand,3,20)}" fill="none" stroke="${p.edge}" stroke-width="5" opacity=".35"/></g>`;
}
// 안료 얼룩(granulation) 판: 작은 난류 조각을 네 배로 키워 알파 .65~1 사이로 얼룩덜룩한 흰 판을 만든다.
// 물감 레이어 전체에 dest-in으로 한 번 곱해 마른 수채 특유의 농담을 낸다. 모든 카드가 같은 판을 쓰므로 한 번만 만든다.
let mottleCache:Promise<Buffer>|null=null;
function mottleTexture():Promise<Buffer> {
  if(!mottleCache){
    const tile=Buffer.from(`<svg width="270" height="338" xmlns="http://www.w3.org/2000/svg"><filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="21"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.1 .3"/></filter><rect width="270" height="338" filter="url(#m)"/></svg>`);
    mottleCache=sharp(tile).png().toBuffer().then(png=>sharp(png).resize(1080,1350).png().toBuffer());
  }
  return mottleCache;
}
// 물감 레이어 한 장: 얼룩(wet)은 절반 크기 캔버스에 그려 두 배로 키우고(변위 계산이 1/4로 줄고, 7px씩 번진 얼룩이라
// 키운 티가 나지 않는다), 띠·붓 사각형(strokes)은 원래 크기로 그린 뒤 둘을 합쳐 안료 얼룩 판을 곱한다.
// SVG를 바로 resize하면 sharp가 큰 해상도로 다시 그리므로, 먼저 PNG로 굳힌 뒤 키운다.
async function paintLayer(wet:string,strokes:string):Promise<OverlayOptions> {
  const half=Buffer.from(`<svg width="540" height="675" xmlns="http://www.w3.org/2000/svg"><g transform="scale(.5)">${wet}</g></svg>`);
  const [blots,bands,mottle]=await Promise.all([
    sharp(half).png().toBuffer().then(png=>sharp(png).resize(1080,1350).png().toBuffer()),
    sharp(svg(1080,1350,strokes)).png().toBuffer(),
    mottleTexture(),
  ]);
  const paint=await sharp({create:{width:1080,height:1350,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:blots,left:0,top:0},{input:bands,left:0,top:0},{input:mottle,blend:"dest-in"}]).png().toBuffer();
  return {input:paint,left:0,top:0};
}

// ── 작은 장식 ──────────────────────────────────────────────────────────────────────
// 물감 점·튄 점이 쓰는 작은 흐림 필터(사진 위 SVG에서 쓴다).
const DOT_FILTERS=`<filter id="wcDot" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2"/></filter>`
  +`<filter id="wcDotIn" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.1"/></filter>`;
// 종이 테이프: 반투명 파스텔 사각형을 기울여 붙인다. 사진 위에 얹으면 사진이 살짝 비친다.
const tape=(x:number,y:number,w:number,h:number,angle:number,p:Pastel)=>
  `<g transform="rotate(${angle} ${r1(x+w/2)} ${r1(y+h/2)})"><rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" fill="${p.fill}" opacity=".74"/>`
  +`<rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" fill="none" stroke="${p.edge}" stroke-width="1.5" opacity=".4"/>`
  +`<path d="M${r1(x+8)} ${r1(y+h*.35)}H${r1(x+w-8)}" stroke="#FFFFFF" stroke-width="3" opacity=".35"/></g>`;
// 요점 글머리: 흐린 큰 원 위에 조금 어긋난 진한 작은 원(물감 점 두 겹).
const dot=(cx:number,cy:number,p:Pastel,scale=1)=>
  `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(17*scale)}" fill="${p.fill}" opacity=".7" filter="url(#wcDot)"/>`
  +`<circle cx="${r1(cx+3*scale)}" cy="${r1(cy-2*scale)}" r="${r1(10*scale)}" fill="${p.edge}" opacity=".85" filter="url(#wcDotIn)"/>`;
// 튄 물감: 크기가 다른 원 여섯~여덟 개를 seed로 흩뿌린다. 몇 개는 진한 가장자리 색.
function splatter(cx:number,cy:number,spreadX:number,spreadY:number,colors:Pastel[],rand:()=>number,count=8):string {
  let out="";
  for(let i=0;i<count;i++){
    const x=cx+(rand()-.5)*2*spreadX,y=cy+(rand()-.5)*2*spreadY,r=3+rand()*rand()*13,p=colors[i%colors.length];
    out+=`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${rand()>.45?p.fill:p.edge}" opacity="${r1(.6+rand()*.3)}" filter="url(#wcDotIn)"/>`;
  }
  return out;
}
// 잎사귀·꽃·하트(표지 아래와 바닥글 옆 작은 장식). 모두 파스텔 채움에 진한 색 잎맥.
const leaf=(x:number,y:number,length:number,angle:number,p:Pastel)=>
  `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${angle}) scale(${r1(length/80)})"><path d="M0 0C22 -34 58 -34 80 0C58 34 22 34 0 0Z" fill="${p.fill}" opacity=".95"/>`
  +`<path d="M6 0H74" stroke="${p.edge}" stroke-width="3" opacity=".8" stroke-linecap="round"/><path d="M26 0C32 -10 40 -14 46 -16M44 0C50 8 58 12 64 13" stroke="${p.edge}" stroke-width="2" fill="none" opacity=".6"/></g>`;
const flower=(x:number,y:number,size:number,p:Pastel,center:Pastel)=>{
  const petal=(angle:number)=>`<path d="M0 0C-15 -20 -13 -50 0 -62C13 -50 15 -20 0 0Z" fill="${p.fill}" opacity=".95" transform="rotate(${angle})"/><path d="M0 -8V-50" stroke="${p.edge}" stroke-width="2" opacity=".55" transform="rotate(${angle})"/>`;
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(size/62)})">${[0,72,144,216,288].map(petal).join("")}<circle r="9" fill="${center.edge}" opacity=".9"/></g>`;
};
const heart=(x:number,y:number,size:number,p:Pastel)=>
  `<path d="M8 14C2 9 0 6 0 4C0 1 2.5 0 4.5 0C6.2 0 7.4 1 8 2.2C8.6 1 9.8 0 11.5 0C13.5 0 16 1 16 4C16 6 14 9 8 14Z" fill="${p.edge}" opacity=".9" transform="translate(${r1(x-size/2)} ${r1(y-size/2)}) scale(${r1(size/16)})"/>`;

// 가장자리가 종이에 스며드는 사진: 둥근 모서리 사각형 마스크를 흐려서 알파로 쓴다(페더).
// 자르기·선명화는 공용 finishPhoto로 하고(모든 계열 같은 사진 손질), 여기서는 채도를 아주 조금 낮추고 밝게 해 파스텔 바탕과
// 어울리게 한 뒤 페더 마스크만 씌운다. 그렇게 새로 생긴 버퍼가 캔버스에 놓이므로 사진으로 등록한다(검수의 사진 면적).
async function softPhoto(input:Buffer,width:number,height:number,radius:number,feather:number):Promise<Buffer> {
  const PW=Math.round(width),PH=Math.round(height);
  const base=await sharp(await finishPhoto(input,PW,PH)).modulate({saturation:.94,brightness:1.03}).removeAlpha().png().toBuffer();
  const mask=await sharp(Buffer.from(`<svg width="${PW}" height="${PH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><rect x="${feather}" y="${feather}" width="${PW-feather*2}" height="${PH-feather*2}" rx="${radius}" fill="#fff"/></svg>`)).blur(feather*.6).extractChannel(0).toBuffer();
  const photo=await sharp(base).joinChannel(mask).png().toBuffer();
  registerPhoto(photo);
  return photo;
}

export const renderWatercolor:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const v=index-1+(slide.variant??0);
  const rand=seeded(index*37+(slide.variant??0)*11+3);
  const seed=index*53+(slide.variant??0)*7;
  const [A,B]=COMBOS[v%COMBOS.length];
  // 겹치는 순서: 얼룩(wet)·띠와 붓 사각형(under) → 종이 알갱이 → 사진(photos) → 테이프·점·잎(over) → 글자(texts).
  const photos:OverlayOptions[]=[],texts:OverlayOptions[]=[];
  let wet="",under="",over="";
  const shots=inputs.slice(0,2);
  const soft=STYLE_FONTS.soft,dodum=STYLE_FONTS.dodum;

  if(content.cover&&shots.length){
    // ── 표지: 큰 손글씨 제목 → 큰 페더 사진 → 잎사귀·꽃 장식 → 가게 이름 ──
    // 글자는 인스타 격자에서 잘리는 좌우 34px 안쪽에 두지 않는다(폭 900, 가운데).
    const title=await fitText(content.headline,{sizes:[100,90,80,72],width:900,maxHeight:330,color:INK,font:soft,align:"centre",spacing:8});
    const tx=Math.round((1080-title.info.width)/2),ty=110;
    // 얼룩 둘: 제목 뒤 왼쪽 위로 치우친 큰 얼룩, 오른쪽 아래 구석.
    wet+=blot(tx+title.info.width*.3,ty+title.info.height*.55,Math.max(300,title.info.width*.42),Math.max(150,title.info.height*.75),A,seed+1,-9);
    wet+=blot(1010,1150,300,210,B,seed+2,14,.7);
    under+=brushBand(tx-22,ty-6,title.info.width+44,title.info.height+14,B,seed+3,-1.2);
    texts.push({input:title.data,left:tx,top:ty});
    const y=ty+title.info.height+46;
    // 사진: 폭 880, 높이 최대 760. 아래 장식 자리(84)를 빼고 남으면 사진을 남는 공간 가운데로 내린다.
    const PW=880,room=FOOTER_TOP-y-84;
    const PH=Math.round(Math.max(420,Math.min(760,room)));
    const extra=Math.max(0,room-PH);
    const px=(1080-PW)/2,py=y+Math.round(extra*.45);
    under+=brushRect(px-20,py+18,PW+18,PH-6,A,seed+4,rand,-1.6);
    photos.push({input:await softPhoto(shots[0],PW,PH,36,16),left:px,top:py});
    over+=tape(px-26,py-12,150,42,-26,B)+tape(px+PW-120,py+PH-28,150,42,-26,B);
    // 사진 아래 잎·꽃·잎 장식, 그 사이 작은 물감 점.
    const ly=py+PH+Math.round((FOOTER_TOP+10-(py+PH))/2);
    over+=leaf(540-150,ly+4,74,-22,A)+flower(540,ly,56,B,A)+leaf(540+70,ly-10,74,18,A)+dot(540-210,ly+8,B,.6)+dot(540+176,ly-2,B,.6);
  }else{
    // ── 본문: 장 번호 → 제목(붓 띠) → 사진(1장·2장) → 요점 ──
    const text=!shots.length;
    const tag=await textLayer(`${index} / ${total}`,{size:28,color:INK,width:220,height:44,font:soft});
    texts.push({input:tag.data,left:M+2,top:50});
    const title=await fitText(content.headline,{sizes:text?[92,84,76,68,60]:[68,62,56],width:W,maxHeight:text?360:220,color:INK,font:soft,spacing:6});
    // 요점: 사진 장 42px, 글자 장 48px. 글머리 자리(56px)를 비운다.
    const points=content.points.slice(0,4);
    const pointSize=text?48:42,indent=56;
    let gap=text?28:16;
    const pointLayers=await Promise.all(points.map(point=>textLayer(point,{size:pointSize,color:INK,width:W-indent,height:600,font:dodum,spacing:Math.round(pointSize*.2)})));
    const sumPoints=()=>pointLayers.reduce((sum,layer)=>sum+layer.info.height+gap,0);
    // 글자 장은 제목·요점·튄 물감 덩어리를 세로 가운데에(장 번호 아래부터 바닥글 위까지).
    // 요점이 짧아 많이 남으면 남는 높이의 절반까지 요점 사이 간격을 키워(최대 +44) 덩어리가 작게 뭉치지 않게 한다.
    let ty=112;
    const titleGap=text?52:34;
    if(text){
      const spare=FOOTER_TOP-112-(title.info.height+titleGap+sumPoints()+70);
      if(pointLayers.length>1&&spare>0)gap+=Math.min(44,Math.floor(spare*.5/(pointLayers.length-1)));
      ty=Math.max(112,Math.round((112+FOOTER_TOP-(title.info.height+titleGap+sumPoints()+70))/2));
    }
    const pointsH=sumPoints();
    // 얼룩: 제목 뒤(글자 장은 더 크게), 그리고 장마다 다른 구석에 하나.
    const tw=Math.min(title.info.width,W);
    wet+=text
      ?blot(M+tw*.42,ty+title.info.height*.5,Math.max(320,tw*.5),Math.max(170,title.info.height*.8+40),A,seed+1,-7)
      :blot(M+tw*.78,ty+title.info.height*.35,300,170,A,seed+1,-12,.72);
    wet+=v%2?blot(70,1210,260,180,B,seed+2,12,.66):blot(1010,text?980:1190,250,180,B,seed+2,-10,.66);
    under+=brushBand(M-18,ty-6,tw+36,title.info.height+12,B,seed+3,-.8);
    texts.push({input:title.data,left:M,top:ty});
    let y=ty+title.info.height+titleGap;
    if(shots.length){
      // 남는 높이에서 요점 자리를 뺀 만큼 사진 높이로. 요점이 길면(4개×2줄) 사진이 300까지 줄어든다.
      const room=FOOTER_TOP-y-(pointsH?pointsH+36:0)-12;
      const PH=Math.round(Math.max(300,Math.min(shots.length>1?560:700,room)));
      const extra=Math.max(0,room-PH);
      const py=y+Math.round(extra/2);
      if(shots.length===1){
        // 사진 1장: 뒤에 어긋난 붓 사각형, 모서리 두 곳에 종이 테이프.
        under+=brushRect(M-16,py+18,W+14,PH-8,A,seed+4,rand,-1.5);
        photos.push({input:await softPhoto(shots[0],W,PH,30,12),left:M,top:py});
        over+=tape(M-24,py-10,140,38,-26,B)+tape(M+W-114,py+PH-26,140,38,-26,B);
      }else{
        // 사진 2장(비교·짝): 좌우로 ±3도 기울여 붙이고 각각 뒤에 붓 사각형, 사이에 물감 점 세 개.
        const gapX=44,PW=Math.round((W-gapX)/2);
        for(const [i,shot] of shots.entries()){
          const cx=M+PW/2+i*(PW+gapX),cy=py+PH/2,angle=i?3:-3;
          under+=brushRect(cx-PW/2+(i?10:-12),cy-PH/2+14,PW+10,PH-4,i?B:A,seed+4+i,rand,angle-1);
          const photo=await rotated(await softPhoto(shot,PW,PH,26,10),angle);
          // 기울이면 버퍼가 새로 생기므로 놓는 버퍼를 다시 등록한다(네 귀퉁이 빈 삼각형 몇 칸만 더 잡힌다).
          registerPhoto(photo.data);
          photos.push({input:photo.data,left:cx-photo.info.width/2,top:cy-photo.info.height/2});
          over+=tape(cx-70,cy-PH/2-14,140,36,i?6:-6,i?A:B);
        }
        for(let k=0;k<3;k++)over+=dot(540+(k-1)*4,py+PH/2+(k-1)*54,k%2?B:A,.8);
      }
      y=py+PH+36;
    }
    // 요점: 물감 점 글머리 + 고운돋움.
    let py=y;
    for(const [i,layer] of pointLayers.entries()){
      over+=dot(M+18,py+pointSize*.6,i%2?B:A);
      texts.push({input:layer.data,left:M+indent,top:py});
      py+=layer.info.height+gap;
    }
    // 글자 장: 요점 아래에 튄 물감(오른쪽으로 치우쳐).
    if(text&&pointLayers.length)over+=splatter(M+W*.62,py+30,230,26,[A,B],rand,8);
  }
  // 바닥글: 가게 이름(둥근 손글씨) 양옆에 작은 하트·잎.
  const footer=await fitText(brandName(),{sizes:content.cover?[34,30,26]:[28,26],width:760,maxHeight:52,color:INK,font:soft,align:"centre"});
  const fx=Math.round((1080-footer.info.width)/2),fy=FOOTER_TOP+(content.cover?12:16);
  texts.push({input:footer.data,left:fx,top:fy});
  over+=heart(fx-34,fy+footer.info.height/2,22,A)+leaf(fx+footer.info.width+16,fy+footer.info.height/2+2,34,-18,B);
  // 종이 알갱이는 물감 위·사진 아래에 soft-light로 아주 옅게(글자·사진은 깨끗하게 둔다).
  const layers:OverlayOptions[]=[await paintLayer(wet,under),await grainLayer({opacity:.12}),...photos,svgLayer(DOT_FILTERS+over),...texts];
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
