import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer, brandName } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STYLE_FONTS, blobCutout, contentOf, cutoutPhoto, extrudedText, stickerize , snap } from "./shared";

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
function openBook(cx:number,spineY:number,w:number):string {
  const h=110,lift=46;
  const left=`M${cx} ${spineY}L${cx-w} ${spineY-lift}L${cx-w-14} ${spineY+h-lift}L${cx} ${spineY+h}Z`;
  const right=`M${cx} ${spineY}L${cx+w} ${spineY-lift}L${cx+w+14} ${spineY+h-lift}L${cx} ${spineY+h}Z`;
  const edges=Array.from({length:4},(_,i)=>`M${cx-w-14+i*3} ${spineY+h-lift+8+i*5}L${cx} ${spineY+h+8+i*5}L${cx+w+14-i*3} ${spineY+h-lift+8+i*5}`).join("");
  // 펼친 쪽에 옅은 글줄을 그어 책처럼 보이게 한다.
  const text=Array.from({length:4},(_,i)=>`M${cx-w+40} ${spineY-lift+26+i*18}L${cx-40} ${spineY+26+i*18}M${cx+40} ${spineY+26+i*18}L${cx+w-40} ${spineY-lift+26+i*18}`).join("");
  return `<ellipse cx="${cx}" cy="${spineY+h+40}" rx="${w+60}" ry="40" fill="#000" opacity=".35"/>`
    +`<path d="${edges}" fill="none" stroke="${PAGE_EDGE}" stroke-width="4"/>`
    +`<path d="${left}" fill="${PAGE}" stroke="${PAGE_EDGE}" stroke-width="3"/><path d="${right}" fill="#F3EAD4" stroke="${PAGE_EDGE}" stroke-width="3"/>`
    +`<path d="${text}" stroke="${PAGE_EDGE}" stroke-width="2" opacity=".7"/>`
    +`<path d="M${cx} ${spineY}V${spineY+h}" stroke="${PAGE_EDGE}" stroke-width="4"/>`;
}
const star=(x:number,y:number,r:number,fill:string)=>{
  const pts=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+(Math.PI*i)/5,k=i%2?.45:1;return `${Math.round(x+Math.cos(a)*r*k)},${Math.round(y+Math.sin(a)*r*k)}`;}).join(" ");
  return `<polygon points="${pts}" fill="${fill}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
};
// 연기 뭉게(겹친 원 세 개).
const puff=(x:number,y:number,r:number)=>`<g fill="#fff" opacity=".85"><circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x+r*.9}" cy="${y-r*.3}" r="${r*.8}"/><circle cx="${x+r*1.7}" cy="${y+r*.1}" r="${r*.6}"/></g>`;
const spark=(x:number,y:number,r:number,color:string)=>`<path d="M${x} ${y-r}L${x+r*.18} ${y-r*.18}L${x+r} ${y}L${x+r*.18} ${y+r*.18}L${x} ${y+r}L${x-r*.18} ${y+r*.18}L${x-r} ${y}L${x-r*.18} ${y-r*.18}Z" fill="${color}"/>`;

export const renderPopup:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const turn=index-1+(slide.variant??0);
  const scene=inputs.length?PHOTO_SCENES[turn%PHOTO_SCENES.length]:SCENES[turn%SCENES.length];
  const M=64,W=1080-M*2;
  const layers:OverlayOptions[]=[];
  let deco=`<defs><radialGradient id="spot" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="${scene.glow}" stop-opacity=".9"/><stop offset="1" stop-color="${scene.bg}" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#spot)"/>`;
  // 바깥으로 퍼지는 빛줄기.
  for(let i=0;i<16;i++){const a=(Math.PI*2*i)/16;deco+=`<path d="M540 760L${Math.round(540+Math.cos(a-.06)*1100)} ${Math.round(760+Math.sin(a-.06)*1100)}L${Math.round(540+Math.cos(a+.06)*1100)} ${Math.round(760+Math.sin(a+.06)*1100)}Z" fill="#fff" opacity=".05"/>`;}
  // 입체 제목.
  const title=await extrudedText(content.headline,{sizes:content.cover?[104,92,82,72]:[80,72,64,58],maxHeight:content.cover?340:250,width:W,font:STYLE_FONTS.heavy,fill:"#FFFFFF",side:scene.side,depth:content.cover?16:12,align:"centre",spacing:4});
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:M+10});
  let y=M+10+title.info.height+30;
  const spineY=1350-230;
  const hasPhoto=inputs.length>0;
  // 요점은 두께 있는 종이 탭에. 사진 장은 제목 아래 작게, 글자 장은 화면 가운데 계단처럼 크게.
  const tabs=await Promise.all(content.points.slice(0,hasPhoto?3:4).map(point=>textLayer(point,{size:hasPhoto?36:50,color:"#1A1A1A",width:hasPhoto?W-80:W-140,height:hasPhoto?120:170,font:STYLE_FONTS.comic,spacing:6})));
  const tabsH=tabs.reduce((sum,tab)=>sum+tab.info.height+30+(hasPhoto?14:26),0);
  if(!hasPhoto&&tabs.length)y=Math.max(y,Math.round((y+spineY-60-tabsH)/2));
  const tabLayers:OverlayOptions[]=[];
  for(const [i,tab] of tabs.entries()){
    const w=tab.info.width+60,h=tab.info.height+30;
    // 글자 장은 탭을 계단처럼 오른쪽으로 조금씩 밀어 책에서 튀어나온 종이처럼 보이게 한다.
    const x=hasPhoto?Math.round((1080-w)/2):Math.min(1080-M-w-12,M+i*44);
    const d=hasPhoto?8:12;
    deco+=`<path d="M${x} ${y+h}L${x+d} ${y+h+d}H${x+w+d}V${y+d}L${x+w} ${y}V${y+h}Z" fill="${scene.tabSide}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${i%2?"#FFFFFF":scene.tab}" stroke="#111" stroke-width="3"/>`;
    tabLayers.push({input:tab.data,left:x+30,top:y+15});
    y+=h+(hasPhoto?14:26);
  }
  deco+=openBook(540,spineY,hasPhoto?420:380);
  // 책 위로 튀어나오는 음식: 누끼가 되면 흰 테두리 스티커, 안 되면 손으로 오린 듯한 블롭 스티커. 두 장이면 좌우로 하나씩.
  // 스티커 바닥은 책 접힘선(spineY~spineY+110) 위에 닿게 두고 접촉 그림자를 깔아 책에서 솟아 나온 것처럼 보이게 한다.
  // 스티커 뒤에는 노란 후광(screen 합성 .3)을 깔아 음식이 어두운 바탕에서 앞으로 튀어나와 보이게 한다.
  const popped:OverlayOptions[]=[];
  const halos:OverlayOptions[]=[];
  if(hasPhoto){
    const shots=inputs.slice(0,2);
    // 스티커 몫(테두리·그림자·접촉 그림자 약 100px)을 뺀 남는 높이가 사진 크기다.
    const room=spineY+70-(y+10)-100;
    const size=Math.max(280,Math.min(shots.length>1?400:780,room));
    for(const [i,shot] of shots.entries()){
      const cx=shots.length>1?(i?770:310):540;
      const cut=await cutoutPhoto(shot,size);
      const shape=cut??await blobCutout(shot,size,index*11+i*17+(slide.variant??0));
      const sticker=await stickerize(shape,{border:12,shadow:"#000000",shadowOffset:cut?22:14,contact:true});
      registerPhoto(sticker.data);
      const left=Math.round(cx-sticker.info.width/2),top=Math.max(y+10,spineY+70-sticker.info.height);
      popped.push({input:sticker.data,left,top});
      // 후광 반경은 스티커의 긴 변 이상으로 잡아 가장자리까지 은은하게 퍼지게 한다.
      const R=Math.max(sticker.info.width,sticker.info.height),hx=left+sticker.info.width/2,hy=top+sticker.info.height/2;
      halos.push({...svgLayer(`<defs><radialGradient id="halo${i}" cx="${hx}" cy="${hy}" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD84D" stop-opacity=".3"/><stop offset=".55" stop-color="#FFD84D" stop-opacity=".14"/><stop offset="1" stop-color="#FFD84D" stop-opacity="0"/></radialGradient></defs><circle cx="${hx}" cy="${hy}" r="${R}" fill="url(#halo${i})"/>`),blend:"screen"});
    }
  }
  // 반짝이·별·연기.
  const sparkles=[[110,y-40,26],[980,y+40,34],[150,spineY-120,20],[950,spineY-200,24]] as const;
  let front=sparkles.map(([x,yy,r],i)=>i%2?star(x,yy,r,scene.tab):spark(x,yy,r,"#FFFFFF")).join("");
  front+=puff(70,spineY+40,34)+puff(890,spineY+60,30);
  const brand=await textLayer(`${brandName()}  ·  ${index} / ${total}`,{size:28,color:"#FFFFFF",width:800,height:44,font:STYLE_FONTS.sansSemi,align:"centre"});
  return sharp({create:{width:1080,height:1350,channels:3,background:scene.bg}})
    .composite(snap([svgLayer(deco),...halos,...tabLayers,...popped,...layers,svgLayer(front),{input:brand.data,left:Math.round((1080-brand.info.width)/2),top:1350-70}]))
    .jpeg({quality:92}).toBuffer();
};
