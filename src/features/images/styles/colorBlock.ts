import sharp, { type OverlayOptions } from "sharp";
import { svgLayer, textLayer, type CardRenderer, brandName, type Layer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { contactShadow, softShadow } from "../decor";
import { STYLE_FONTS, blobCutout, closingBlock, contentOf, cutoutPhoto, emphasisOf, fitText, hashtags, nextCue, snap } from "./shared";

// 대담한 컬러 블록: 장마다 화면 전체를 진한 단색으로 칠하고, 화면을 꽉 채우는 굵은 글자와 배경을 지운 음식(누끼)을
// 스티커처럼 붙인다. 요점은 흰 알약 안에 넣는다. 광고 포스터처럼 한눈에 들어오는 것이 목표다.
// 누끼가 안 되는 사진(배경이 복잡한 사진)은 손으로 오린 듯한 블롭 모양 스티커로 대신 붙인다.
// 사진 두 장이면 스티커 둘을 아래에 나란히 붙이고, 글자만 있는 장은 제목·알약 덩어리를 세로 가운데에 두어 빈 띠가 생기지 않게 한다.

// 장마다 돌아가며 쓰는 바탕색과 그 위 글자색. 같은 게시물 안에서 장을 넘길 때마다 색이 바뀐다.
// cool: 차가운 바탕이라 사진 색을 조금 데워야 하는 블록(아래 photoTone).
// emph: 제목 핵심어 강조색. 바탕 대비 3:1 이상이면서 글자색(ink)과 밝기 쪽이 같은 색을 고른다 — 검은 글자 속 흰 강조처럼
// 밝기가 반대면 제목 획 전체의 평균 대비가 무너진다(주황 위 검정+흰색 1.3:1). 그래서 검은 글자 블록은 진한 색(주황 위 코발트 3.3,
// 노랑 위 진홍 4.1, 분홍 위 보라 4.5), 흰 글자 블록은 밝은 색(파랑·남색 위 노랑, 초록 위 노랑 3.3, 검정 위 주황 6.1).
// 초록은 원래 #0FA968이었는데 흰 글자가 3.05:1로 겨우 넘어 강조 노랑(2.4:1)이 안 들어가 한 단계 진하게(#0A8F57, 흰 글자 4.1:1).
type Block={bg:string;ink:string;pop:string;emph:string;cool:boolean};
const BLOCKS:readonly Block[]=[
  {bg:"#FF5A36",ink:"#111111",pop:"#FFFFFF",emph:"#0B2FB0",cool:false},
  {bg:"#2E5BFF",ink:"#FFFFFF",pop:"#FFD23F",emph:"#FFD23F",cool:true},
  {bg:"#FFD23F",ink:"#111111",pop:"#FF5A36",emph:"#C8102E",cool:false},
  {bg:"#0A8F57",ink:"#FFFFFF",pop:"#FFD23F",emph:"#FFE600",cool:true},
  {bg:"#FF6FB5",ink:"#111111",pop:"#FFFFFF",emph:"#3A1A9E",cool:false},
  {bg:"#111111",ink:"#FFFFFF",pop:"#FF5A36",emph:"#FF5A36",cool:false},
];
// 사진 장 안전색: 쨍한 파랑·핫핑크 바탕 옆에 놓이면 홍어의 분홍 살이 자주색·회색으로 보인다(동시 대비).
// 사진이 올라가는 장에서는 파랑을 가라앉은 네이비로, 핫핑크를 크림으로 바꾼다. 코럴로 바꾸면 주황 블록과 겹쳐
// 장을 넘길 때 색이 바뀌는 리듬이 죽으므로 크림을 쓴다. 글자만 있는 장은 원래 색을 그대로 써 다양함을 지킨다.
const PHOTO_SAFE:Record<string,Block>={
  "#2E5BFF":{bg:"#1C2B5A",ink:"#FFFFFF",pop:"#FFD23F",emph:"#FFD23F",cool:true},
  // 크림 위 주황(#FF5A36)은 2.8:1이라 강조색만 한 단계 진한 주홍(4.1:1)으로.
  "#FF6FB5":{bg:"#FFF1DC",ink:"#111111",pop:"#FF5A36",emph:"#D93A1A",cool:false},
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

// 키라인 스티커: 흰 테두리(16) 바깥에 검은 키라인(3px)을 한 줄 더 두른다. 진한 단색 바탕(특히 노랑·크림) 위에서
// 흰 테두리만 있으면 윤곽이 바탕에 녹아 스티커가 아니라 "구멍"처럼 보였다. 팝아트 인쇄물의 검은 외곽선 문법.
// 그림자는 두 겹: 컬러 블록 문법의 검은 오프셋 그림자 + 바닥에 닿는 자리의 납작한 타원 접촉 그림자(contactShadow).
// 접촉 그림자는 실루엣을 눌러 만든 모양이 아니라 타원이다 — 접시 바깥 바닥에 떨어지는 그림자는 접시 모양을 따르지 않는다.
// 실루엣 만들기는 shared의 stickerize와 같다(흐림 → 버퍼로 끊고 → threshold). 키라인은 흰 실루엣을 한 번 더 살짝 흐려 3px쯤 부풀린다.
async function keylineSticker(cutout:{data:Buffer;width:number;height:number},offset:number):Promise<Layer> {
  const border=16,KEY=3,CONTACT=24,pad=border*2+offset+KEY;
  const W=cutout.width+pad*2,H=cutout.height+pad*2;
  const padded=await sharp(cutout.data).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const white=await sharp(await sharp(padded).extractChannel(3).blur(border*.6).toBuffer()).threshold(8).toBuffer();
  // 흐림 σ 2.1 뒤 문턱 20이면 흰 테두리 바깥으로 약 3px 부푼다(σ .45배였을 때는 1px 남짓이라 키라인이 안 보였다).
  const key=await sharp(await sharp(white).blur(KEY*.7).toBuffer()).threshold(20).extractChannel(0).raw().toBuffer({resolveWithObject:true});
  const keyAlpha=await sharp(key.data,{raw:{width:key.info.width,height:key.info.height,channels:1}}).png().toBuffer();
  const silhouette=(color:string,alpha:Buffer)=>sharp({create:{width:W,height:H,channels:3,background:color}}).joinChannel(alpha).png().toBuffer();
  // 접촉 그림자 자리: 키라인 실루엣의 맨 아랫줄과, 아래 12% 높이에서 잉크가 있는 가로 범위.
  let bottom=0;
  for(let y=H-1;y>=0&&!bottom;y--)for(let x=0;x<W;x+=2)if(key.data[y*W+x]>0){bottom=y;break;}
  let minX=W,maxX=0;
  const from=Math.max(0,Math.round(bottom-cutout.height*.12));
  for(let y=from;y<=bottom;y++)for(let x=0;x<W;x+=2)if(key.data[y*W+x]>0){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
  const layers:OverlayOptions[]=[];
  if(maxX>minX){
    const rx=Math.round((maxX-minX)/2*1.04),ry=Math.max(8,Math.round(rx*.1));
    layers.push({input:Buffer.from(`<svg width="${W+offset}" height="${H+offset+CONTACT}" xmlns="http://www.w3.org/2000/svg">${contactShadow({cx:(minX+maxX)/2,cy:bottom+Math.round(ry*.4),rx,ry,opacity:.38})}</svg>`),left:0,top:0});
  }
  layers.push(
    {input:await silhouette("#111111",keyAlpha),left:offset,top:offset},
    {input:await silhouette("#111111",keyAlpha),left:0,top:0},
    {input:await silhouette("#ffffff",white),left:0,top:0},
    {input:padded,left:0,top:0},
  );
  return sharp({create:{width:W+offset,height:H+offset+CONTACT,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}

// 사진 한 장을 스티커 한 장으로: 누끼가 되면 키라인 누끼 스티커, 안 되면 손으로 오린 듯한 블롭 스티커(seed로 모양 고정).
// 블롭은 테두리가 둥글어 그림자가 무거워 보이기 쉬워 오프셋을 10으로 줄인다.
// 스티커 높이는 대략 size+100(테두리 16×2·키라인·그림자·접촉 그림자 몫)이라 놓는 쪽에서 그만큼 빼고 size를 정한다.
// 부품 대부분이 사진이므로 완성된 스티커 버퍼를 사진으로 등록한다(자동 검수의 사진 면적). 누끼는 음식 모양만 남아 상자 면적이
// 작게 잡히므로 cutout, 블롭은 둥근 원에 가까워 circle 기준으로 잰다.
// fitBlob: 블롭은 지름이 오린 크기의 83~92%라 같은 크기로 오리면 자리가 남는다. 한 장짜리처럼 높이로 크기가 정해지는 자리에서는
// 92%로 나눈 크기로 오려 가장 큰 블롭도 자리에 꼭 맞게 한다(두 장 나란히는 폭이 빠듯해 그대로 둔다).
async function stickerTile(input:Buffer,size:number,block:Block,seed:number,fitBlob=false):Promise<Layer&{cut:boolean}> {
  const cut=await cutoutPhoto(input,size);
  const shape=cut??await blobCutout(input,fitBlob?Math.round(size/.92):size,seed);
  const sticker=await keylineSticker(await photoTone(shape,block.cool),cut?16:10);
  registerPhoto(sticker.data,{shape:cut?"cutout":"circle"});
  return {...sticker,cut:Boolean(cut)};
}
// 알약·카드 그림자 두 겹: 아래에 넓고 옅게 번지는 주변광(softShadow), 위에 컬러 블록 문법의 딱딱한 검은 오프셋.
// 오프셋만 있으면 종이 오림이 바탕에 "인쇄된" 것처럼 납작하고, 옅은 번짐이 한 겹 더 있으면 바탕 위에 얹힌 두께가 생긴다.
const popShadow=(x:number,y:number,w:number,h:number,rx:number,offset:number)=>
  softShadow({x:x+offset,y:y+offset+6,width:w,height:h,rx,blur:10,opacity:.18})
  +`<rect x="${x+offset}" y="${y+offset}" width="${w}" height="${h}" rx="${rx}" fill="#000" fill-opacity=".85"/>`;

export const renderColorBlock:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const turn=index-1+(slide.variant??0);
  const hasPhoto=inputs.length>0;
  const rolled=BLOCKS[turn%BLOCKS.length];
  const block=content.cover&&hasPhoto?COVER_BLOCKS[(slide.variant??0)%COVER_BLOCKS.length]:hasPhoto?PHOTO_SAFE[rolled.bg]??rolled:rolled;
  const M=64,W=1080-M*2,footerTop=1350-90;
  const layers:OverlayOptions[]=[];
  // 블록 바탕 결(리넨·종이 그레인)은 넣지 않는다: 리넨 multiply .14를 시험해 보니 JPEG 재압축 뒤 결의 흔들림은 표준편차 0.2 수준으로
  // 눈에 안 보이고, 바탕색만 12% 어두워져(주황 #FF5A36 → 약 #DF4E2F) 블록 색의 쨍함이 죽었다.
  // 마지막 장: 바닥글 위에 흰 "가게 명함 스티커"(검은 테두리·오프셋 그림자)를 붙인다. 그 높이만큼 아래 경계(bottom)를 올려
  // 사진·알약이 명함 위에서 끝나게 한다. 칩(흰 글자)은 검은 알약 — 검은 블록이면 파랑 알약.
  const closing=content.last?await closingBlock({width:W-80,color:"#111111",accent:block.bg==="#111111"?"#2E5BFF":"#111111",font:STYLE_FONTS.heavy}):null;
  const CARD_PAD=22;
  const cardH=closing?closing.height+CARD_PAD*2:0,cardTop=footerTop-12-cardH;
  const bottom=closing?cardTop-24:footerTop;
  // 위쪽: 해시태그 띠와 아주 큰 제목. 사진이 있으면 제목 영역을 위 절반으로 줄인다.
  const tag=await textLayer(hashtags(content),{size:30,color:block.bg,width:900,height:50,font:STYLE_FONTS.sansBold});
  const tagW=tag.info.width+44;
  layers.push(svgLayer(`<rect x="${M}" y="${M}" width="${tagW}" height="${tag.info.height+20}" rx="${(tag.info.height+20)/2}" fill="${block.ink}"/>`),{input:tag.data,left:M+22,top:M+10});
  const shots=inputs.slice(0,2);
  const titleTop=M+tag.info.height+50;
  // 사진 장은 제목을 위 3분의 1쯤으로 줄여 사진과 겹치지 않게 하고, 글자 장은 제목을 화면 절반까지 키운다.
  // 마지막 장은 명함 몫만큼 제목 자리도 조금 줄인다(사진·알약만 줄이면 사진이 우표만 해진다).
  let titleRoom=(hasPhoto?(shots.length>1?340:400):560)-(closing?100:0);
  const TITLE_SIZES=[150,130,112,96,84,72,64];
  // 표지 부제: 해시태그 띠와 같은 "검은(글자색) 알약"에 바탕색 글자로, 제목 바로 아래. 가장 작은 제목 크기로도
  // 부제 몫을 뺀 자리에 제목이 안 들어가면 부제를 뺀다(제목을 몰래 줄이지 않는다).
  let subline:{layer:Layer;h:number}|null=null;
  if(content.subline){
    const layer=await textLayer(content.subline,{size:34,color:block.bg,width:W-48,height:120,font:STYLE_FONTS.sansBold});
    const h=layer.info.height+22+20;
    const probe=await textLayer(content.headline,{size:TITLE_SIZES[TITLE_SIZES.length-1],color:block.ink,width:W,height:4000,font:STYLE_FONTS.heavy,spacing:0});
    if(probe.info.height<=titleRoom-h){subline={layer,h};titleRoom-=h;}
  }
  const title=await fitText(content.headline,{sizes:TITLE_SIZES,width:W,maxHeight:titleRoom,color:block.ink,font:STYLE_FONTS.heavy,spacing:0,emphasis:emphasisOf(content,block.emph)});
  const headH=title.info.height+(subline?.h??0);
  const placeHead=(y:number)=>{
    layers.push({input:title.data,left:M,top:y});
    if(!subline)return;
    const sy=y+title.info.height+20,{layer}=subline;
    layers.push(svgLayer(`<rect x="${M}" y="${sy}" width="${layer.info.width+48}" height="${layer.info.height+22}" rx="${(layer.info.height+22)/2}" fill="${block.ink}"/>`),{input:layer.data,left:M+24,top:sy+11});
  };
  // 요점은 흰(또는 강조색) 알약에 한 줄씩. 사진 한 장이면 왼쪽 아래 좁게, 아니면 제목 아래로 넓게.
  const pillW=shots.length===1?560:W;
  // 글자 장은 요점이 주인공이라 알약 글자를 크게(48px) 쓴다. 마지막 장에서 명함 때문에 자리가 모자라면
  // 요점 수를 줄이지 않고 글자 크기를 한 단계씩 줄인다(사진 장 30px, 글자 장 34px까지).
  const pillSizes=hasPhoto?[34,32,30]:[48,44,40,36,34];
  const makePills=async(size:number)=>{
    const made:Layer[]=[];
    for(const point of content.points.slice(0,hasPhoto?3:4))made.push(await textLayer(point,{size,color:"#111111",width:pillW-56,height:size*3.4,font:STYLE_FONTS.sansBold,spacing:6}));
    return {made,height:made.reduce((sum,pill)=>sum+pill.info.height+36+16,0)};
  };
  // 알약 덩어리가 들어갈 높이: 글자 장은 제목 아래 전부, 사진 장은 제목 아래~아래 경계(사진 위에 겹쳐 얹는다).
  const pillsRoom=hasPhoto?bottom-20-(titleTop+headH+30):bottom-(titleTop+headH+60);
  let pillSet=await makePills(pillSizes[0]);
  for(const size of pillSizes.slice(1)){if(pillSet.height<=pillsRoom)break;pillSet=await makePills(size);}
  const pills=pillSet.made,pillsHeight=pillSet.height;
  // 알약은 사진(스티커) 위에 와야 글자가 가려지지 않으므로 따로 모았다가 사진 다음에 얹는다.
  const pillLayers:OverlayOptions[]=[];
  const placePills=(start:number,gap:number)=>{
    let cursor=start;
    for(const [i,pill] of pills.entries()){
      const h=pill.info.height+36,w=pill.info.width+56;
      const fill=i%2===0?"#FFFFFF":block.pop;
      pillLayers.push(svgLayer(`${popShadow(M,cursor,w,h,h/2,6)}<rect x="${M}" y="${cursor}" width="${w}" height="${h}" rx="${h/2}" fill="${fill}" stroke="#111" stroke-width="4"/>`),{input:pill.data,left:M+28,top:cursor+18});
      cursor+=h+16+gap;
    }
  };
  // 별 스티커 속 장 번호. 숫자 폭을 고정(tnum)해 1/5와 10/10의 자리가 흔들리지 않게 한다.
  const counterAt=async(cx:number,cy:number,r:number)=>{
    layers.push(svgLayer(burst(cx,cy,r,block.pop)));
    const counter=await textLayer(`${index}/${total}`,{size:30,color:"#111111",width:120,height:44,font:STYLE_FONTS.heavy,align:"centre",features:"tnum"});
    layers.push({input:counter.data,left:cx-Math.round(counter.info.width/2),top:cy-Math.round(counter.info.height/2)});
  };
  let titleY=titleTop;
  if(shots.length>1){
    // 사진 두 장: 스티커 둘을 맨 아래에 나란히, 알약은 그 위에 넓게.
    placeHead(titleY);
    const titleBottom=titleY+headH;
    const room=bottom-(titleBottom+40)-(pillsHeight?pillsHeight+30:0);
    // 스티커 둘이 가로 1080 안에 나란히 들어가는 최대(약 466)와 남는 높이(스티커 몫 100을 뺀) 중 작은 쪽.
    // 마지막 장은 명함 자리 때문에 240까지 줄인다.
    const size=Math.max(closing?240:300,Math.min(460,room-100));
    const tiles=await Promise.all(shots.map((shot,i)=>stickerTile(shot,size,block,index*7+i*13+(slide.variant??0))));
    const gap=24,rowW=tiles.reduce((sum,tile)=>sum+tile.info.width,0)+gap,rowH=Math.max(...tiles.map(tile=>tile.info.height));
    const rowTop=bottom-rowH;
    let x=Math.round((1080-rowW)/2);
    for(const tile of tiles){layers.push({input:tile.data,left:x,top:rowTop+rowH-tile.info.height});x+=tile.info.width+gap;}
    placePills(Math.max(titleBottom+30,rowTop-pillsHeight-24),0);
    // 별 모양 스티커와 장 번호는 두 사진 사이 위쪽에.
    await counterAt(540,rowTop+40,58);
  }else if(hasPhoto){
    placeHead(titleY);
    const titleBottom=titleY+headH;
    // 사진은 오른쪽 아래에 크게. 제목 아래 남는 공간(아래 경계 위까지)에 맞춰 크기를 정해 제목과 겹치지 않게 한다.
    // 스티커 아래 끝은 아래 경계 위 20px까지 허용하고, 스티커 몫(약 100)을 뺀 높이를 사진 크기로 쓴다.
    const room=bottom+20-(titleBottom+30)-100;
    // 요점 알약이 있는 장은 700px까지(예전 640px에서는 제목과 사진 사이가 200px 넘게 비었다). 알약은 사진 왼쪽 아래에 얹힌다.
    const size=Math.max(closing?260:380,Math.min(pills.length?700:820,room));
    const sticker=await stickerTile(shots[0],size,block,index*7+(slide.variant??0),true);
    // 누끼는 오른쪽 가장자리에 붙여 화면 밖으로 이어지는 느낌을, 블롭은 둥근 모양이라 여백을 조금 두고 띄운다.
    const left=sticker.cut?1080-sticker.info.width:1080-M+24-sticker.info.width;
    const photoTop=Math.max(titleBottom+30,bottom+(sticker.cut?0:20)-sticker.info.height);
    const photoRight=left+sticker.info.width;
    layers.push({input:sticker.data,left,top:photoTop});
    placePills(bottom-20-pillsHeight,0);
    // 사진 오른쪽 위 모서리에 별 모양 스티커와 장 번호(제목 아래라 제목을 가리지 않는다).
    await counterAt(Math.min(1080-M-30,photoRight-40),photoTop+30,58);
  }else{
    // 글자 장: 제목과 알약 사이가 비지 않도록 남는 높이를 알약 사이 간격(최대 36px)과 위아래 여백으로 나눈다.
    const slack=Math.max(0,bottom-(titleTop+headH+60+pillsHeight));
    const gap=pills.length>1?Math.min(36,Math.floor(slack/(pills.length+1))):0;
    titleY=titleTop+Math.round((slack-gap*(pills.length-1))/2);
    placeHead(titleY);
    placePills(titleY+headH+60,gap);
    // 사진이 없는 장도 별 모양 스티커에 장 번호를 단다(해시태그 띠 오른쪽).
    await counterAt(1080-M-58,M+Math.round((tag.info.height+20)/2),56);
  }
  layers.push(...pillLayers);
  // 표지 예고 띠: 요점 알약과 같은 흰 알약(검은 테두리·오프셋 그림자)에 "이 뒤에 나오는 것"을. 바닥글 바로 위 왼쪽.
  if(content.teaser){
    const teaser=await textLayer(content.teaser,{size:27,color:"#111111",width:W-56,height:60,font:STYLE_FONTS.sansBold});
    const h=teaser.info.height+24,w=teaser.info.width+48,y=footerTop-14-h;
    layers.push(svgLayer(`${popShadow(M,y,w,h,h/2,5)}<rect x="${M}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="#FFFFFF" stroke="#111" stroke-width="4"/>`),{input:teaser.data,left:M+24,top:y+12});
  }
  // 가게 명함 스티커: 흰 카드 가운데에 가게 이름(굵은 제목 글꼴)·계정·저장 칩.
  if(closing){
    // 카드 폭은 내용(가게 이름·계정·칩 중 가장 넓은 것)+좌우 60px — 화면 폭 그대로면 가운데만 차고 양옆이 텅 빈다.
    const cardW=Math.min(W,Math.max(560,closing.wordmark.info.width,closing.handle?.info.width??0,closing.chip.info.width+52)+120),cardX=540-cardW/2;
    layers.push(svgLayer(`${popShadow(cardX,cardTop,cardW,cardH,28,8)}<rect x="${cardX}" y="${cardTop}" width="${cardW}" height="${cardH}" rx="28" fill="#FFFFFF" stroke="#111" stroke-width="4"/>`));
    let y=cardTop+CARD_PAD;
    layers.push({input:closing.wordmark.data,left:540-Math.round(closing.wordmark.info.width/2),top:y});
    y+=closing.wordmark.info.height;
    if(closing.handle){layers.push({input:closing.handle.data,left:540-Math.round(closing.handle.info.width/2),top:y+8});y+=8+closing.handle.info.height;}
    const chipX=540-Math.round(closing.chip.info.width/2),chipY=y+18+12;
    layers.push(svgLayer(closing.chipSvg(chipX,chipY)),{input:closing.chip.data,left:chipX,top:chipY});
  }
  // 바닥글: 왼쪽 가게 이름, 본문 장이면 오른쪽에 "넘겨 보기 ›"를 해시태그 띠와 같은 글자색 알약에.
  const cue=!content.cover&&!content.last?await nextCue(block.bg,26):null;
  const brand=await fitText(brandName(),{sizes:[28,26],width:W-(cue?cue.width+70:0),maxHeight:44,color:block.ink,font:STYLE_FONTS.sansSemi});
  layers.push({input:brand.data,left:M,top:1350-70});
  if(cue){
    const x=1080-M-18-cue.width,y=1350-70+Math.round((brand.info.height-cue.height)/2);
    layers.push(svgLayer(`<rect x="${x-18}" y="${y-8}" width="${cue.width+36}" height="${cue.height+16}" rx="${(cue.height+16)/2}" fill="${block.ink}"/>${cue.arrow(x,y)}`),{input:cue.label.data,left:x,top:y});
  }
  return sharp({create:{width:1080,height:1350,channels:3,background:block.bg}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};

// 톱니 별(폭발) 모양 스티커.
function burst(cx:number,cy:number,r:number,fill:string):string {
  const points=Array.from({length:28},(_,i)=>{const a=(Math.PI*2*i)/28,rad=i%2?r*.78:r;return `${Math.round(cx+Math.cos(a)*rad)},${Math.round(cy+Math.sin(a)*rad)}`;}).join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="#111" stroke-width="4"/>`;
}
