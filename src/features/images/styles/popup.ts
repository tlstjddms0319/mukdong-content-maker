import sharp, { type OverlayOptions } from "sharp";
import { currentTone, svgLayer, textLayer, type CardRenderer, brandName, type Layer, type TextEmphasis, type Font } from "../render/primitives";
import { contactShadow, mascotLayer, textureLayer } from "../decor";
import { registerPhoto } from "../render/audit";
import { MIN_STROKE, STYLE_FONTS, blobCutout, closingBlock, contentOf, cutoutPhoto, emphasisOf, fitText, nextCue, stickerize , snap } from "./shared";

// 3D 모션·팝업북: 진한 바탕 한가운데 스포트라이트, 아래쪽에 펼친 책을 놓고 그 위로 음식(누끼)이 튀어나오게 한다.
// 제목은 옆면이 두꺼운 입체 글자, 요점은 두께가 있는 종이 탭에 적는다. 주변에 별·반짝이·연기 뭉게를 흩뿌려 움직임을 준다.
const SCENES=[
  {bg:"#1C1A4A",glow:"#5B54D6",side:"#FF5A8A",tab:"#FFD84D",tabSide:"#C99A00"},
  {bg:"#3B0F2E",glow:"#C2367A",side:"#FFB300",tab:"#7CF0D0",tabSide:"#2E9C80"},
  {bg:"#0E3438",glow:"#21A39A",side:"#FF6B3D",tab:"#FFE7A3",tabSide:"#C9A24A"},
] as const;
// 사진이 있는 장의 장면. 남색·청록 바탕은 홍어의 분홍 살을 차갑게(자주·회색으로) 보이게 하므로
// 흑자주·흑록처럼 붉은 기가 도는 아주 어두운 바탕에 호박색·살구색 글로우를 쓴다. 글자만 있는 장은 위 SCENES 그대로.
const PHOTO_SCENES=[
  {bg:"#2A1620",glow:"#B4543A",side:"#FF5A8A",tab:"#FFD84D",tabSide:"#C99A00"},
  {bg:"#1F2A24",glow:"#A8743A",side:"#FFB300",tab:"#7CF0D0",tabSide:"#2E9C80"},
  {bg:"#2A1620",glow:"#C27A3A",side:"#FF6B3D",tab:"#FFE7A3",tabSide:"#C9A24A"},
] as const;
const PAGE="#FFF8E8",PAGE_EDGE="#D9CBB0";

// 펼친 책(왼쪽·오른쪽 쪽이 V자로 벌어진 모습)과 바닥 그림자.
function openBook(cx:number,spineY:number,w:number,linen=false):string {
  const h=110,lift=46;
  const left=`M${cx} ${spineY}L${cx-w} ${spineY-lift}L${cx-w-14} ${spineY+h-lift}L${cx} ${spineY+h}Z`;
  const right=`M${cx} ${spineY}L${cx+w} ${spineY-lift}L${cx+w+14} ${spineY+h-lift}L${cx} ${spineY+h}Z`;
  const edges=Array.from({length:4},(_,i)=>`M${cx-w-14+i*3} ${spineY+h-lift+8+i*5}L${cx} ${spineY+h+8+i*5}L${cx+w+14-i*3} ${spineY+h-lift+8+i*5}`).join("");
  // 펼친 쪽에 옅은 글줄을 그어 책처럼 보이게 한다.
  const text=Array.from({length:4},(_,i)=>`M${cx-w+40} ${spineY-lift+26+i*18}L${cx-40} ${spineY+26+i*18}M${cx+40} ${spineY+26+i*18}L${cx+w-40} ${spineY-lift+26+i*18}`).join("");
  // linen=false(질감 자산 없음)이면 쪽 위에 아주 옅은 가로·세로 실 무늬(SVG 패턴)를 깔아 종이 결을 대신한다.
  const weave=linen?"":`<defs><pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1.5H6M1.5 0V6" stroke="#8C7350" stroke-width="1" stroke-opacity=".12"/></pattern></defs><path d="${left}" fill="url(#weave)"/><path d="${right}" fill="url(#weave)"/>`;
  return `<ellipse cx="${cx}" cy="${spineY+h+40}" rx="${w+60}" ry="40" fill="#000" opacity=".35"/>`
    +`<path d="${edges}" fill="none" stroke="${PAGE_EDGE}" stroke-width="4"/>`
    +`<path d="${left}" fill="${PAGE}" stroke="${PAGE_EDGE}" stroke-width="3"/><path d="${right}" fill="#F3EAD4" stroke="${PAGE_EDGE}" stroke-width="3"/>`+weave
    +`<path d="${text}" stroke="${PAGE_EDGE}" stroke-width="${MIN_STROKE}" opacity=".7"/>`
    +`<path d="M${cx} ${spineY}V${spineY+h}" stroke="${PAGE_EDGE}" stroke-width="4"/>`;
}
// 펼친 두 쪽의 모양(리넨 질감을 쪽 모양으로 잘라 얹을 때 쓴다). openBook과 같은 좌표.
const bookPages=(cx:number,spineY:number,w:number)=>{const h=110,lift=46;return `M${cx} ${spineY}L${cx-w} ${spineY-lift}L${cx-w-14} ${spineY+h-lift}L${cx} ${spineY+h}ZM${cx} ${spineY}L${cx+w} ${spineY-lift}L${cx+w+14} ${spineY+h-lift}L${cx} ${spineY+h}Z`;};
const star=(x:number,y:number,r:number,fill:string)=>{
  const pts=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+(Math.PI*i)/5,k=i%2?.45:1;return `${Math.round(x+Math.cos(a)*r*k)},${Math.round(y+Math.sin(a)*r*k)}`;}).join(" ");
  return `<polygon points="${pts}" fill="${fill}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
};
// 연기 뭉게(겹친 원 세 개).
const puff=(x:number,y:number,r:number)=>`<g fill="#fff" opacity=".85"><circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x+r*.9}" cy="${y-r*.3}" r="${r*.8}"/><circle cx="${x+r*1.7}" cy="${y+r*.1}" r="${r*.6}"/></g>`;
const spark=(x:number,y:number,r:number,color:string)=>`<path d="M${x} ${y-r}L${x+r*.18} ${y-r*.18}L${x+r} ${y}L${x+r*.18} ${y+r*.18}L${x} ${y+r}L${x-r*.18} ${y+r*.18}L${x-r} ${y}L${x-r*.18} ${y-r*.18}Z" fill="${color}"/>`;

// 입체(돌출) 제목 + 핵심어 강조. 공용 extrudedText는 강조를 받지 않아 여기서 같은 방식으로 그린다:
// 옆면(한 색)을 1px씩 depth번 겹쳐 찍고 맨 위 앞면만 강조색을 넣는다. 두 레이어 모두 같은 fitText 설정이라 줄바꿈이 같다.
async function popTitle(value:string,options:{sizes:number[];maxHeight:number;width:number;font:Font;fill:string;side:string;depth:number;emphasis?:TextEmphasis}):Promise<Layer> {
  const common={sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-options.depth,font:options.font,align:"centre" as const,spacing:4};
  const face=await fitText(value,{...common,color:options.fill,emphasis:options.emphasis});
  const side=await fitText(value,{...common,color:options.side});
  const d=options.depth;
  const layers:OverlayOptions[]=Array.from({length:d},(_,i)=>({input:side.data,left:d-i,top:d-i}));
  layers.push({input:face.data,left:0,top:0},...await faceBevel(face,options.side));
  return sharp({create:{width:face.info.width+d,height:face.info.height+d,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}
// 앞면 베벨: 획 윗가장자리에 밝은 띠(흰 .5), 아랫가장자리에 옆면색 그늘(.3)을 3px 두께로 얹어 앞면 모서리가 깎여 보이게 한다.
// 띠는 "획 실루엣 − 3px 밀린 실루엣"(dest-out)이라 획 안쪽에만 생긴다. 앞면이 흰색이면 밝은 띠는 안 보이고 그늘만,
// 핵심어(노랑·민트)는 둘 다 보인다. 아래 깔린 앞면 글자(Pango 버퍼)는 그대로라 검수는 글자를 그대로 잰다.
async function faceBevel(face:Layer,side:string):Promise<OverlayOptions[]> {
  const {width,height}=face.info,B=3;
  const alpha=await sharp(face.data).extractChannel(3).toBuffer();
  const solid=(color:string,opacity:number)=>sharp({create:{width,height,channels:3,background:color}}).joinChannel(alpha).linear([1,1,1,opacity],[0,0,0,0]).png().toBuffer();
  // sharp는 한 파이프라인 안에서 extract를 extend보다 먼저 해 버리므로 두 번에 나눈다.
  const shifted=async(dy:number)=>sharp(await sharp(face.data).extend({top:Math.max(0,dy),bottom:Math.max(0,-dy),left:0,right:0,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer())
    .extract({left:0,top:Math.max(0,-dy),width,height}).png().toBuffer();
  const band=async(color:string,opacity:number,dy:number)=>sharp(await solid(color,opacity)).composite([{input:await shifted(dy),blend:"dest-out"}]).png().toBuffer();
  return [{input:await band("#FFFFFF",.5,B),left:0,top:0},{input:await band(side,.3,-B),left:0,top:0}];
}
// 레이어 알파로 만든 번진 검은 그림자. 번짐이 잘리지 않게 사방 pad(=blur×3)만큼 키운다. (−pad, −pad)에 놓는다.
async function softSilhouette(input:Buffer,blur:number,opacity:number):Promise<Layer&{pad:number}> {
  const pad=blur*3;
  // 알파만 raw로 뽑아 검은 RGBA를 직접 만든다(PNG 회색 버퍼를 extend·joinChannel로 이으면 채널 수가 꼬여 사각형 그림자가 된다).
  const {data:alpha,info}=await sharp(input).extractChannel(3).raw().toBuffer({resolveWithObject:true});
  const W=info.width+pad*2,H=info.height+pad*2;
  const rgba=Buffer.alloc(W*H*4);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)rgba[((y+pad)*W+x+pad)*4+3]=Math.round(alpha[y*info.width+x]*opacity);
  const data=await sharp(rgba,{raw:{width:W,height:H,channels:4}}).blur(blur).png().toBuffer();
  return {data,info:{width:W,height:H},pad};
}
// 캔버스(1080×1350) 밖으로 나가는 레이어를 안쪽만 잘라 놓는다(sharp는 캔버스보다 큰 레이어를 받지 않는다).
async function clipToCanvas(layer:Layer,left:number,top:number):Promise<OverlayOptions> {
  const x0=Math.max(0,left),y0=Math.max(0,top),x1=Math.min(1080,left+layer.info.width),y1=Math.min(1350,top+layer.info.height);
  const input=await sharp(layer.data).extract({left:x0-left,top:y0-top,width:Math.max(1,x1-x0),height:Math.max(1,y1-y0)}).png().toBuffer();
  return {input,left:x0,top:y0};
}
// 두께 있는 종이 탭(요점·부제·넘겨 보기가 같은 모양): 앞면 사각 + 오른쪽 아래로 d만큼 접힌 옆면.
const paperTab=(x:number,y:number,w:number,h:number,d:number,face:string,side:string)=>
  `<path d="M${x} ${y+h}L${x+d} ${y+h+d}H${x+w+d}V${y+d}L${x+w} ${y}V${y+h}Z" fill="${side}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${face}" stroke="#111" stroke-width="3"/>`;

export const renderPopup:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const turn=index-1+(slide.variant??0);
  const scene=inputs.length?PHOTO_SCENES[turn%PHOTO_SCENES.length]:SCENES[turn%SCENES.length];
  const M=64,W=1080-M*2;
  const layers:OverlayOptions[]=[];
  const hasPhoto=inputs.length>0;
  const calm=currentTone()==="calm";
  // 마지막 장: 책 앞에 세운 "가게 명함 카드"(종이색 카드·두께). 카드 자리만큼 책을 위로 올리고(spineY),
  // 책 앞모서리가 카드 윗부분에 살짝 가려져 카드가 책 앞에 서 있는 것처럼 보이게 한다. 칩은 장면 바탕색(흰 글자 11:1 이상).
  const closing=content.last?await closingBlock({width:W-120,color:"#1A1A1A",accent:scene.bg,font:STYLE_FONTS.heavy}):null;
  const CARD_PAD=24,cardH=closing?closing.height+CARD_PAD*2:0,cardTop=1252-cardH;
  const spineY=closing?cardTop-60:1350-230;
  let deco=`<defs><radialGradient id="spot" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="${scene.glow}" stop-opacity=".9"/><stop offset="1" stop-color="${scene.bg}" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#spot)"/>`;
  // 바깥으로 퍼지는 빛줄기.
  // 절제 변형은 빛줄기를 그리지 않는다(스포트라이트만 남긴다).
  if(!calm)for(let i=0;i<16;i++){const a=(Math.PI*2*i)/16;deco+=`<path d="M540 760L${Math.round(540+Math.cos(a-.06)*1100)} ${Math.round(760+Math.sin(a-.06)*1100)}L${Math.round(540+Math.cos(a+.06)*1100)} ${Math.round(760+Math.sin(a+.06)*1100)}Z" fill="#fff" opacity=".05"/>`;}
  // 입체 제목. 핵심어는 탭 색(노랑·민트·크림: 어두운 바탕 위 9:1 이상)으로.
  const titleSizes=content.cover?[104,92,82,72]:[80,72,64,58];
  let titleRoom=content.cover?340:closing?210:250;
  const depth=content.cover?16:12;
  // 표지 부제: 제목 아래 흰 종이 탭 하나. 가장 작은 제목 크기로도 부제 몫을 뺀 자리에 안 들어가면 부제를 뺀다.
  let sub:Layer|null=null;
  if(content.subline){
    const layer=await textLayer(content.subline,{size:36,color:"#1A1A1A",width:W-120,height:120,font:STYLE_FONTS.comic});
    const need=layer.info.height+30+8+24;
    const probe=await textLayer(content.headline,{size:titleSizes[titleSizes.length-1],color:"#FFFFFF",width:W,height:4000,font:STYLE_FONTS.heavy,align:"centre",spacing:4});
    if(probe.info.height+depth<=titleRoom-need){sub=layer;titleRoom-=need;}
  }
  const title=await popTitle(content.headline,{sizes:titleSizes,maxHeight:titleRoom,width:W,font:STYLE_FONTS.heavy,fill:"#FFFFFF",side:scene.side,depth,emphasis:emphasisOf(content,scene.tab)});
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:M+10});
  let y=M+10+title.info.height+30;
  const tabLayers:OverlayOptions[]=[];
  if(sub){
    const w=sub.info.width+60,h=sub.info.height+30,x=Math.round((1080-w)/2),ty=y-6;
    deco+=paperTab(x,ty,w,h,8,"#FFFFFF",scene.tabSide);
    tabLayers.push({input:sub.data,left:x+30,top:ty+15});
    y=ty+h+8+24;
  }
  // 요점은 두께 있는 종이 탭에. 사진 장은 제목 아래 작게, 글자 장은 화면 가운데 계단처럼 크게.
  // 마지막 장은 명함 카드 때문에 책이 올라가 자리가 줄므로, 요점 수를 줄이지 않고 탭 글자를 한 단계씩 줄인다.
  const minSticker=closing?200:280;
  const tabsRoom=hasPhoto?spineY+70-100-minSticker-(y+10):spineY-60-y;
  const makeTabs=(size:number)=>Promise.all(content.points.slice(0,hasPhoto?3:4).map(point=>textLayer(point,{size,color:"#1A1A1A",width:hasPhoto?W-80:W-140,height:size*3.4,font:STYLE_FONTS.comic,spacing:6})));
  const heightOf=(made:Layer[])=>made.reduce((sum,tab)=>sum+tab.info.height+30+(hasPhoto?14:26),0);
  let tabs:Layer[]=[];
  for(const size of hasPhoto?[36,33,30]:[50,44,40,36]){tabs=await makeTabs(size);if(heightOf(tabs)<=tabsRoom)break;}
  const tabsH=heightOf(tabs);
  // 글자 장: 제목과 탭 계단 사이에 홍어 마스코트(가리키는 포즈, 없으면 인사)를 오른쪽에 세워 계단을 가리키게 한다.
  // 남는 높이가 200px 넘을 때만, 마스코트+탭을 한 덩어리로 세로 가운데에 둔다. 마스코트 때문에 탭 글자를 줄이지 않는다.
  const spare=hasPhoto?0:spineY-60-y-tabsH;
  const mascot=spare>=200&&tabs.length?await mascotLayer({width:260,pose:"point",left:1080-M-20,top:0,anchor:"top-right",maxHeight:Math.min(240,spare-30),minHeight:150}):null;
  if(!hasPhoto&&tabs.length)y=Math.max(y,Math.round((y+spineY-60-tabsH-(mascot?mascot.height+10:0))/2));
  if(mascot){layers.push({...mascot,top:y});y+=mascot.height+10;}
  for(const [i,tab] of tabs.entries()){
    const w=tab.info.width+60,h=tab.info.height+30;
    // 글자 장은 탭을 계단처럼 오른쪽으로 조금씩 밀어 책에서 튀어나온 종이처럼 보이게 한다.
    const x=hasPhoto?Math.round((1080-w)/2):Math.min(1080-M-w-12,M+i*44);
    deco+=paperTab(x,y,w,h,hasPhoto?8:12,i%2?"#FFFFFF":scene.tab,scene.tabSide);
    tabLayers.push({input:tab.data,left:x+30,top:y+15});
    y+=h+(hasPhoto?14:26);
  }
  const bookW=hasPhoto?420:380;
  // 책 종이 결: 리넨 질감 자산이 있으면 쪽 모양으로 잘라 multiply로 옅게, 없으면 openBook이 SVG 실 무늬를 그린다.
  const linen=await textureLayer("linen",{opacity:.35,blend:"multiply"});
  deco+=openBook(540,spineY,bookW,!!linen);
  const linenLayer:OverlayOptions[]=[];
  if(linen){
    const mask=Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><path d="${bookPages(540,spineY,bookW)}" fill="#fff"/></svg>`);
    linenLayer.push({input:await sharp(linen.input as Buffer).composite([{input:mask,blend:"dest-in"}]).png().toBuffer(),left:0,top:0,blend:"multiply"});
  }
  // 책 위로 튀어나오는 음식: 누끼가 되면 흰 테두리 스티커, 안 되면 손으로 오린 듯한 블롭 스티커. 두 장이면 좌우로 하나씩.
  // 스티커 바닥은 책 접힘선(spineY~spineY+110) 위에 닿게 두고 접촉 그림자를 깔아 책에서 솟아 나온 것처럼 보이게 한다.
  // 스티커 뒤에는 노란 후광(screen 합성 .3)을 깔아 음식이 어두운 바탕에서 앞으로 튀어나와 보이게 한다.
  const popped:OverlayOptions[]=[];
  const halos:OverlayOptions[]=[];
  if(hasPhoto){
    const shots=inputs.slice(0,2);
    // 스티커 몫(테두리·그림자·접촉 그림자 약 100px)을 뺀 남는 높이가 사진 크기다.
    const room=spineY+70-(y+10)-100;
    const size=Math.max(minSticker,Math.min(shots.length>1?400:780,room));
    for(const [i,shot] of shots.entries()){
      const cx=shots.length>1?(i?770:310):540;
      const cut=await cutoutPhoto(shot,size);
      const shape=cut??await blobCutout(shot,size,index*11+i*17+(slide.variant??0));
      // 그림자는 딱딱한 오프셋 대신 blur 10으로 번진 실루엣 그림자(어두운 바탕에서 스티커가 떠오른 거리감)를 직접 깐다.
      const sticker=await stickerize(shape,{border:12,contact:true});
      registerPhoto(sticker.data);
      const left=Math.round(cx-sticker.info.width/2),top=Math.max(y+10,spineY+70-sticker.info.height);
      const shadow=await softSilhouette(sticker.data,10,.55);
      popped.push(await clipToCanvas(shadow,left-shadow.pad+(cut?16:12),top-shadow.pad+(cut?18:14)),{input:sticker.data,left,top});
      // 접힘선 위 접촉 그림자: 스티커 바닥(접촉 그림자 몫 24px 위)이 책에 닿는 자리에 납작한 타원.
      deco+=contactShadow({cx:left+sticker.info.width/2,cy:top+sticker.info.height-28,rx:sticker.info.width*.36,opacity:.45});
      // 후광 반경은 스티커의 긴 변 이상으로 잡아 가장자리까지 은은하게 퍼지게 한다.
      const R=Math.max(sticker.info.width,sticker.info.height),hx=left+sticker.info.width/2,hy=top+sticker.info.height/2;
      halos.push({...svgLayer(`<defs><radialGradient id="halo${i}" cx="${hx}" cy="${hy}" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD84D" stop-opacity="${calm?.15:.3}"/><stop offset=".55" stop-color="#FFD84D" stop-opacity="${calm?.07:.14}"/><stop offset="1" stop-color="#FFD84D" stop-opacity="0"/></radialGradient></defs><circle cx="${hx}" cy="${hy}" r="${R}" fill="url(#halo${i})"/>`),blend:"screen"});
    }
  }
  // 반짝이·별·연기. 위쪽 두 개는 마지막 탭 "아래"에 둔다(탭 위에 얹히면 글자를 가린다).
  const sparkles=[[110,y+34,26],[980,y+60,34],[150,Math.max(spineY-120,y+40),20],[950,Math.max(spineY-200,y+20),24]] as const;
  // 절제 변형: 반짝이·별·연기 뭉게를 모두 뺀다.
  let front=calm?"":sparkles.map(([x,yy,r],i)=>i%2?star(x,yy,r,scene.tab):spark(x,yy,r,"#FFFFFF")).join("");
  if(!calm)front+=puff(70,spineY+40,34)+puff(890,spineY+60,30);
  const frontText:OverlayOptions[]=[];
  // 표지 예고 띠: 책에 두른 "띠지". 책 앞모서리를 가로지르는 색 띠에 이 뒤에 나오는 장 이름을 적는다.
  if(content.teaser){
    const teaser=await textLayer(content.teaser,{size:28,color:"#1A1A1A",width:W-80,height:64,font:STYLE_FONTS.comic});
    const w=teaser.info.width+70,h=teaser.info.height+20,x=Math.round((1080-w)/2),ty=spineY+64;
    front+=paperTab(x,ty,w,h,6,scene.side,"#111111");
    frontText.push({input:teaser.data,left:x+35,top:ty+10});
  }
  // 가게 명함 카드: 종이색 카드(두께는 장면 옆면색) 가운데에 가게 이름·계정·저장 칩.
  if(closing){
    const cardW=Math.min(W,Math.max(560,closing.wordmark.info.width,closing.handle?.info.width??0,closing.chip.info.width+52)+120),cardX=Math.round(540-cardW/2);
    front+=paperTab(cardX,cardTop,cardW,cardH,12,PAGE,scene.side);
    let cy=cardTop+CARD_PAD;
    frontText.push({input:closing.wordmark.data,left:540-Math.round(closing.wordmark.info.width/2),top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){frontText.push({input:closing.handle.data,left:540-Math.round(closing.handle.info.width/2),top:cy+8});cy+=8+closing.handle.info.height;}
    const chipX=540-Math.round(closing.chip.info.width/2),chipY=cy+18+12;
    front+=closing.chipSvg(chipX,chipY);
    frontText.push({input:closing.chip.data,left:chipX,top:chipY});
  }
  // 바닥글: 왼쪽 가게 이름, 오른쪽 장 번호(숫자 폭 고정). 본문 장은 장 번호 바로 위에 "넘겨 보기 ›" 종이 탭.
  const number=await textLayer(`${index} / ${total}`,{size:28,color:"#FFFFFF",width:160,height:44,font:STYLE_FONTS.sansSemi,features:"tnum"});
  const brand=await fitText(brandName(),{sizes:[28,26],width:W-number.info.width-40,maxHeight:44,color:"#FFFFFF",font:STYLE_FONTS.sansSemi});
  frontText.push({input:brand.data,left:M,top:1350-70},{input:number.data,left:1080-M-number.info.width,top:1350-70});
  if(!content.cover&&!content.last){
    const cue=await nextCue("#1A1A1A",26);
    const w=cue.width+36,h=cue.height+14,x=1080-M-w-6,cy=1350-70-h-18;
    front+=paperTab(x,cy,w,h,6,scene.tab,scene.tabSide)+cue.arrow(x+18,cy+7);
    frontText.push({input:cue.label.data,left:x+18,top:cy+7});
  }
  return sharp({create:{width:1080,height:1350,channels:3,background:scene.bg}})
    .composite(snap([svgLayer(deco),...linenLayer,...halos,...tabLayers,...popped,...layers,svgLayer(front),...frontText]))
    .jpeg({quality:92}).toBuffer();
};
