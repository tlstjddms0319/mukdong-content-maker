import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer, brandName, type Layer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { STYLE_FONTS, blobCutout, contentOf, cutoutPhoto, fitText, hashtags, snap, stickerize } from "./shared";

// 대담한 컬러 블록: 장마다 화면 전체를 진한 단색으로 칠하고, 화면을 꽉 채우는 굵은 글자와 배경을 지운 음식(누끼)을
// 스티커처럼 붙인다. 요점은 흰 알약 안에 넣는다. 광고 포스터처럼 한눈에 들어오는 것이 목표다.
// 누끼가 안 되는 사진(배경이 복잡한 사진)은 손으로 오린 듯한 블롭 모양 스티커로 대신 붙인다.
// 사진 두 장이면 스티커 둘을 아래에 나란히 붙이고, 글자만 있는 장은 제목·알약 덩어리를 세로 가운데에 두어 빈 띠가 생기지 않게 한다.

// 장마다 돌아가며 쓰는 바탕색과 그 위 글자색. 같은 게시물 안에서 장을 넘길 때마다 색이 바뀐다.
// cool: 차가운 바탕이라 사진 색을 조금 데워야 하는 블록(아래 photoTone).
type Block={bg:string;ink:string;pop:string;cool:boolean};
const BLOCKS:readonly Block[]=[
  {bg:"#FF5A36",ink:"#111111",pop:"#FFFFFF",cool:false},
  {bg:"#2E5BFF",ink:"#FFFFFF",pop:"#FFD23F",cool:true},
  {bg:"#FFD23F",ink:"#111111",pop:"#FF5A36",cool:false},
  {bg:"#0FA968",ink:"#FFFFFF",pop:"#FFD23F",cool:true},
  {bg:"#FF6FB5",ink:"#111111",pop:"#FFFFFF",cool:false},
  {bg:"#111111",ink:"#FFFFFF",pop:"#FF5A36",cool:false},
];
// 사진 장 안전색: 쨍한 파랑·핫핑크 바탕 옆에 놓이면 홍어의 분홍 살이 자주색·회색으로 보인다(동시 대비).
// 사진이 올라가는 장에서는 파랑을 가라앉은 네이비로, 핫핑크를 크림으로 바꾼다. 코럴로 바꾸면 주황 블록과 겹쳐
// 장을 넘길 때 색이 바뀌는 리듬이 죽으므로 크림을 쓴다. 글자만 있는 장은 원래 색을 그대로 써 다양함을 지킨다.
const PHOTO_SAFE:Record<string,Block>={
  "#2E5BFF":{bg:"#1C2B5A",ink:"#FFFFFF",pop:"#FFD23F",cool:true},
  "#FF6FB5":{bg:"#FFF1DC",ink:"#111111",pop:"#FF5A36",cool:false},
};
// 표지는 첫인상이라 음식이 가장 맛있게 보이는 따뜻한 블록(주황·노랑·크림)만 돌려 쓴다.
const COVER_BLOCKS:readonly Block[]=[BLOCKS[0],BLOCKS[2],PHOTO_SAFE["#FF6FB5"]];

// 바탕색에 맞춘 사진 색 보정(한 번만). 차가운 바탕 위에서는 살색이 식어 보이므로 채도 1.08에 빨강을 3% 올리고,
// 따뜻한 바탕 위에서는 채도만 1.04. 선명화는 finishPhoto가 이미 했으므로 여기서 다시 걸지 않는다.
// 알파는 원본 픽셀 배열에서 그대로 다시 써 넣는다(색 보정이 알파를 건드리면 누끼 가장자리가 두꺼워지거나 옅어진다).
async function photoTone(cut:{data:Buffer;width:number;height:number},cool:boolean){
  const source=await sharp(cut.data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=source.info;
  const rgb=sharp(source.data,{raw:{width,height,channels:4}}).removeAlpha().modulate({saturation:cool?1.08:1.04});
  const toned=await (cool?rgb.linear([1.03,1,1],[0,0,0]):rgb).raw().toBuffer();
  const out=Buffer.alloc(width*height*4);
  for(let p=0;p<width*height;p++){out[p*4]=toned[p*3];out[p*4+1]=toned[p*3+1];out[p*4+2]=toned[p*3+2];out[p*4+3]=source.data[p*4+3];}
  return {data:await sharp(out,{raw:{width,height,channels:4}}).png().toBuffer(),width,height};
}

// 사진 한 장을 스티커 한 장으로: 누끼가 되면 흰 테두리 누끼 스티커, 안 되면 손으로 오린 듯한 블롭 스티커.
// 둘 다 팝아트식 검은 오프셋 그림자(컬러 블록의 문법)에 바닥 접촉 그림자를 더해 화면에 붙어 있는 느낌을 준다.
// 블롭은 테두리가 둥글어 그림자가 무거워 보이기 쉬워 오프셋을 10으로 줄인다.
// 스티커 높이는 대략 size+100(테두리 16×2·그림자·접촉 그림자 몫)이라 놓는 쪽에서 그만큼 빼고 size를 정한다.
// 부품 대부분이 사진이므로 완성된 스티커 버퍼를 사진으로 등록한다(자동 검수의 사진 면적).
async function stickerTile(input:Buffer,size:number,block:Block,seed:number):Promise<Layer&{cut:boolean}> {
  const cut=await cutoutPhoto(input,size);
  const shape=cut??await blobCutout(input,size,seed);
  const sticker=await stickerize(await photoTone(shape,block.cool),{border:16,shadow:"#111111",shadowOffset:cut?16:10,contact:true});
  registerPhoto(sticker.data);
  return {...sticker,cut:Boolean(cut)};
}

export const renderColorBlock:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const turn=index-1+(slide.variant??0);
  const hasPhoto=inputs.length>0;
  const rolled=BLOCKS[turn%BLOCKS.length];
  const block=content.cover&&hasPhoto?COVER_BLOCKS[(slide.variant??0)%COVER_BLOCKS.length]:hasPhoto?PHOTO_SAFE[rolled.bg]??rolled:rolled;
  const M=64,W=1080-M*2,footerTop=1350-90;
  const layers:OverlayOptions[]=[];
  // 위쪽: 해시태그 띠와 아주 큰 제목. 사진이 있으면 제목 영역을 위 절반으로 줄인다.
  const tag=await textLayer(hashtags(content),{size:30,color:block.bg,width:900,height:50,font:STYLE_FONTS.sansBold});
  const tagW=tag.info.width+44;
  layers.push(svgLayer(`<rect x="${M}" y="${M}" width="${tagW}" height="${tag.info.height+20}" rx="${(tag.info.height+20)/2}" fill="${block.ink}"/>`),{input:tag.data,left:M+22,top:M+10});
  const shots=inputs.slice(0,2);
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
    // 스티커 둘이 가로 1080 안에 나란히 들어가는 최대(약 466)와 남는 높이(스티커 몫 100을 뺀) 중 작은 쪽.
    const size=Math.max(300,Math.min(460,room-100));
    const tiles=await Promise.all(shots.map((shot,i)=>stickerTile(shot,size,block,index*7+i*13+(slide.variant??0))));
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
    // 스티커 아래 끝은 채널명 줄 위 20px까지 허용하고, 스티커 몫(약 100)을 뺀 높이를 사진 크기로 쓴다.
    const room=footerTop+20-(titleBottom+30)-100;
    const size=Math.max(380,Math.min(pills.length?640:820,room));
    const sticker=await stickerTile(shots[0],size,block,index*7+(slide.variant??0));
    // 누끼는 오른쪽 가장자리에 붙여 화면 밖으로 이어지는 느낌을, 블롭은 둥근 모양이라 여백을 조금 두고 띄운다.
    const left=sticker.cut?1080-sticker.info.width:1080-M+24-sticker.info.width;
    const photoTop=Math.max(titleBottom+30,footerTop+(sticker.cut?0:20)-sticker.info.height);
    const photoRight=left+sticker.info.width;
    layers.push({input:sticker.data,left,top:photoTop});
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
