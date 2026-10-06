import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, svgLayer, textLayer, type CardRenderer, brandName, type Layer } from "../render/primitives";
import { STYLE_FONTS, contentOf, cutoutPhoto, fitText, hashtags, snap, stickerize } from "./shared";

// 대담한 컬러 블록: 장마다 화면 전체를 진한 단색으로 칠하고, 화면을 꽉 채우는 굵은 글자와 배경을 지운 음식(누끼)을
// 스티커처럼 붙인다. 요점은 흰 알약 안에 넣는다. 광고 포스터처럼 한눈에 들어오는 것이 목표다.
// 누끼가 안 되는 사진(배경이 복잡한 사진)은 흰 테두리를 두른 원형 사진으로 대신 붙인다.
// 사진 두 장이면 스티커 둘을 아래에 나란히 붙이고, 글자만 있는 장은 제목·알약 덩어리를 세로 가운데에 두어 빈 띠가 생기지 않게 한다.

// 장마다 돌아가며 쓰는 바탕색과 그 위 글자색. 같은 게시물 안에서 장을 넘길 때마다 색이 바뀐다.
const BLOCKS=[
  {bg:"#FF5A36",ink:"#111111",pop:"#FFFFFF"},
  {bg:"#2E5BFF",ink:"#FFFFFF",pop:"#FFD23F"},
  {bg:"#FFD23F",ink:"#111111",pop:"#FF5A36"},
  {bg:"#0FA968",ink:"#FFFFFF",pop:"#FFD23F"},
  {bg:"#FF6FB5",ink:"#111111",pop:"#FFFFFF"},
  {bg:"#111111",ink:"#FFFFFF",pop:"#FF5A36"},
] as const;

// 사진 한 장을 스티커 한 장으로: 누끼가 되면 흰 테두리 누끼 스티커, 안 되면 검은 그림자가 있는 흰 테두리 원형 사진.
// 둘 다 한 레이어로 만들어 두면 나란히 놓기와 크기 재기가 간단하다.
async function stickerTile(input:Buffer,size:number):Promise<Layer> {
  const cut=await cutoutPhoto(input,size);
  if(cut)return stickerize(cut,{border:16,shadow:"#111111",shadowOffset:16});
  const D=size-60,ring=14,shadow=14,S=D+ring*2+shadow;
  const photo=await croppedPhoto(input,D,D,0,{circle:true});
  const svg=Buffer.from(`<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg"><circle cx="${D/2+ring+shadow}" cy="${D/2+ring+shadow}" r="${D/2+ring}" fill="#111"/><circle cx="${D/2+ring}" cy="${D/2+ring}" r="${D/2+ring}" fill="#fff"/></svg>`);
  return sharp({create:{width:S,height:S,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:svg,left:0,top:0},{input:photo,left:ring,top:ring}]).png().toBuffer({resolveWithObject:true});
}

export const renderColorBlock:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const block=BLOCKS[(index-1+(slide.variant??0))%BLOCKS.length];
  const M=64,W=1080-M*2,footerTop=1350-90;
  const layers:OverlayOptions[]=[];
  // 위쪽: 해시태그 띠와 아주 큰 제목. 사진이 있으면 제목 영역을 위 절반으로 줄인다.
  const tag=await textLayer(hashtags(content),{size:30,color:block.bg,width:900,height:50,font:STYLE_FONTS.sansBold});
  const tagW=tag.info.width+44;
  layers.push(svgLayer(`<rect x="${M}" y="${M}" width="${tagW}" height="${tag.info.height+20}" rx="${(tag.info.height+20)/2}" fill="${block.ink}"/>`),{input:tag.data,left:M+22,top:M+10});
  const shots=inputs.slice(0,2);
  const hasPhoto=shots.length>0;
  const titleTop=M+tag.info.height+50;
  // 사진 장은 제목을 위 3분의 1쯤으로 줄여 사진과 겹치지 않게 하고, 글자 장은 제목을 화면 절반까지 키운다.
  const titleRoom=hasPhoto?(shots.length>1?340:400):560;
  const title=await fitText(content.headline,{sizes:[150,130,112,96,84,72,64],width:W,maxHeight:titleRoom,color:block.ink,font:STYLE_FONTS.heavy,spacing:0});
  // 요점은 흰(또는 강조색) 알약에 한 줄씩. 사진 한 장이면 왼쪽 아래 좁게, 아니면 제목 아래로 넓게.
  const pillW=shots.length===1?560:W;
  // 글자 장은 요점이 주인공이라 알약 글자를 크게(48px) 쓴다.
  const pillSize=hasPhoto?34:48;
  const pills:Layer[]=[];
  for(const point of content.points.slice(0,hasPhoto?3:4))pills.push(await textLayer(point,{size:pillSize,color:"#111111",width:pillW-56,height:pillSize*3.4,font:STYLE_FONTS.sansBold,spacing:6}));
  const pillsHeight=pills.reduce((sum,pill)=>sum+pill.info.height+36+16,0);
  // 알약은 사진(스티커) 위에 와야 글자가 가려지지 않으므로 따로 모았다가 사진 다음에 얹는다.
  const pillLayers:OverlayOptions[]=[];
  const placePills=(start:number,gap:number)=>{
    let cursor=start;
    for(const [i,pill] of pills.entries()){
      const h=pill.info.height+36,w=pill.info.width+56;
      const fill=i%2===0?"#FFFFFF":block.pop;
      pillLayers.push(svgLayer(`<rect x="${M+6}" y="${cursor+6}" width="${w}" height="${h}" rx="${h/2}" fill="#000" fill-opacity=".85"/><rect x="${M}" y="${cursor}" width="${w}" height="${h}" rx="${h/2}" fill="${fill}" stroke="#111" stroke-width="4"/>`),{input:pill.data,left:M+28,top:cursor+18});
      cursor+=h+16+gap;
    }
  };
  let titleY=titleTop;
  if(shots.length>1){
    // 사진 두 장: 스티커 둘을 맨 아래에 나란히, 알약은 그 위에 넓게.
    layers.push({input:title.data,left:M,top:titleY});
    const titleBottom=titleY+title.info.height;
    const room=footerTop-(titleBottom+40)-(pillsHeight?pillsHeight+30:0);
    const size=Math.max(340,Math.min(470,room));
    const tiles=await Promise.all(shots.map(shot=>stickerTile(shot,size)));
    const gap=24,rowW=tiles.reduce((sum,tile)=>sum+tile.info.width,0)+gap,rowH=Math.max(...tiles.map(tile=>tile.info.height));
    const rowTop=footerTop-rowH;
    let x=Math.round((1080-rowW)/2);
    for(const tile of tiles){layers.push({input:tile.data,left:x,top:rowTop+rowH-tile.info.height});x+=tile.info.width+gap;}
    placePills(Math.max(titleBottom+30,rowTop-pillsHeight-24),0);
    // 별 모양 스티커와 장 번호는 두 사진 사이 위쪽에.
    layers.push(svgLayer(burst(540,rowTop+40,58,block.pop)));
    const counter=await textLayer(`${index}/${total}`,{size:30,color:"#111111",width:120,height:44,font:STYLE_FONTS.heavy,align:"centre"});
    layers.push({input:counter.data,left:540-Math.round(counter.info.width/2),top:rowTop+40-Math.round(counter.info.height/2)});
  }else if(hasPhoto){
    layers.push({input:title.data,left:M,top:titleY});
    const titleBottom=titleY+title.info.height;
    // 사진은 오른쪽 아래에 크게. 제목 아래 남는 공간(채널명 줄 위까지)에 맞춰 크기를 정해 제목과 겹치지 않게 한다.
    const room=footerTop-(titleBottom+40);
    const size=Math.max(380,Math.min(pills.length?640:760,room));
    const cut=await cutoutPhoto(shots[0],size);
    let photoTop:number,photoRight:number;
    if(cut){
      const sticker=await stickerize(cut,{border:16,shadow:"#111111",shadowOffset:16});
      photoTop=Math.max(titleBottom+30,footerTop-sticker.info.height);
      const left=Math.min(1080-sticker.info.width,Math.max(0,1080-sticker.info.width+30));
      photoRight=left+sticker.info.width;
      layers.push({input:sticker.data,left,top:photoTop});
    }else{
      const D=size-60,cx=1080-M-D/2-10,cy=Math.max(titleBottom+40+D/2,1350-110-D/2);
      photoTop=cy-D/2;photoRight=cx+D/2;
      layers.push(svgLayer(`<circle cx="${cx+14}" cy="${cy+14}" r="${D/2+14}" fill="#111"/><circle cx="${cx}" cy="${cy}" r="${D/2+14}" fill="#fff"/>`),
        {input:await croppedPhoto(shots[0],D,D,0,{circle:true}),left:Math.round(cx-D/2),top:Math.round(cy-D/2)});
    }
    placePills(1350-110-pillsHeight,0);
    // 사진 오른쪽 위 모서리에 별 모양 스티커와 장 번호(제목 아래라 제목을 가리지 않는다).
    const bx=Math.min(1080-M-30,photoRight-40),byy=photoTop+30;
    layers.push(svgLayer(burst(bx,byy,58,block.pop)));
    const counter=await textLayer(`${index}/${total}`,{size:30,color:"#111111",width:120,height:44,font:STYLE_FONTS.heavy,align:"centre"});
    layers.push({input:counter.data,left:bx-Math.round(counter.info.width/2),top:byy-Math.round(counter.info.height/2)});
  }else{
    // 글자 장: 제목과 알약 사이가 비지 않도록 남는 높이를 알약 사이 간격(최대 36px)과 위아래 여백으로 나눈다.
    const slack=Math.max(0,footerTop-(titleTop+title.info.height+60+pillsHeight));
    const gap=pills.length>1?Math.min(36,Math.floor(slack/(pills.length+1))):0;
    titleY=titleTop+Math.round((slack-gap*(pills.length-1))/2);
    layers.push({input:title.data,left:M,top:titleY});
    placePills(titleY+title.info.height+60,gap);
    // 사진이 없는 장도 별 모양 스티커에 장 번호를 단다(해시태그 띠 오른쪽).
    const bx=1080-M-58,byy=M+Math.round((tag.info.height+20)/2);
    layers.push(svgLayer(burst(bx,byy,56,block.pop)));
    const counter=await textLayer(`${index}/${total}`,{size:30,color:"#111111",width:120,height:44,font:STYLE_FONTS.heavy,align:"centre"});
    layers.push({input:counter.data,left:bx-Math.round(counter.info.width/2),top:byy-Math.round(counter.info.height/2)});
  }
  layers.push(...pillLayers);
  const brand=await fitText(brandName(),{sizes:[26,23,20],width:700,maxHeight:40,color:block.ink,font:STYLE_FONTS.sansSemi});
  layers.push({input:brand.data,left:M,top:1350-70});
  return sharp({create:{width:1080,height:1350,channels:3,background:block.bg}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};

// 톱니 별(폭발) 모양 스티커.
function burst(cx:number,cy:number,r:number,fill:string):string {
  const points=Array.from({length:28},(_,i)=>{const a=(Math.PI*2*i)/28,rad=i%2?r*.78:r;return `${Math.round(cx+Math.cos(a)*rad)},${Math.round(cy+Math.sin(a)*rad)}`;}).join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="#111" stroke-width="4"/>`;
}
