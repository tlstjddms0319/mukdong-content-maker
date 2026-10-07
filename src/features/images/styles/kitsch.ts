import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, currentTone, svgLayer, textLayer, type CardRenderer, brandHandle, brandName, type Font, type Layer, type TextEmphasis } from "../render/primitives";
import { contactShadow, mascotLayer } from "../decor";
import { registerPhoto } from "../render/audit";
import { seeded } from "./handDrawn";
import { STYLE_FONTS, chooseTitleLayout, closingBlock, contentOf, cutoutPhoto, emphasisOf, fitOutlined, fitText, nextCue, rotated , snap, stickerize } from "./shared";

// B급 감성·하이퍼 키치: 그림판 무지개 그라데이션 바탕, 빨강·노랑 외곽선 글자가 화면을 꽉 채우고,
// 톱니 별 딱지에 "이걸 아직도 안 먹어봤다고?!" 같은 외침을 넣는다. 사진은 두꺼운 색 테두리를 둘러 삐딱하게 붙인다.
// 단색 배경 사진(스튜디오 사진)은 배경을 지운 누끼 스티커로 크게 붙이고, 배경이 복잡하거나 음식이 사진 밖으로 잘려
// 누끼가 어색한 사진은 지금처럼 액자에 넣는다.
// 외침 문구는 가격·할인처럼 확인할 수 없는 사실을 담지 않도록 감탄만 쓴다.
const RAINBOW=["#FF1F1F","#FF8A00","#FFE600","#22D94A","#00B7FF","#7A2BFF","#FF2BC8"];
const SHOUTS=["강력 추천!!","실화냐?!","필수 코스!","이 맛 뭐야?!","찐 맛집 감성","안 먹으면 섭섭!"];
const COVER_SHOUT="이걸 아직도 안 먹어봤다고?!";

// 무지개 대각선 그라데이션. variant마다 각도를 바꿔 장마다 다른 그림판 느낌을 낸다.
function rainbow(angle:number):string {
  const stops=RAINBOW.map((color,i)=>`<stop offset="${i/(RAINBOW.length-1)}" stop-color="${color}"/>`).join("");
  return `<defs><linearGradient id="rb" gradientTransform="rotate(${angle} .5 .5)">${stops}</linearGradient></defs><rect width="1080" height="1350" fill="url(#rb)"/>`;
}
// 톱니 별 딱지(가장자리가 뾰족한 폭발 모양).
// angle: 안의 외침 글자와 같은 각도로 돌린다(예전엔 글자만 기울고 톱니는 똑바로 서 있어 따로 노는 스티커처럼 보였다).
function burst(cx:number,cy:number,rx:number,ry:number,fill:string,angle=0,teeth=22):string {
  const points=Array.from({length:teeth*2},(_,i)=>{const a=(Math.PI*i)/teeth,k=i%2?.74:1;return `${Math.round(cx+Math.cos(a)*rx*k)},${Math.round(cy+Math.sin(a)*ry*k)}`;}).join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="#111" stroke-width="6" stroke-linejoin="round" transform="rotate(${angle} ${cx} ${cy})"/>`;
}
// 사진 뒤 햇살: 따뜻한 세 색(노랑·주황·다홍) 부채꼴을 번갈아 돌리고, 바깥은 원형 그라데이션 마스크로 녹여 무지개 바탕과 섞이게 한다.
// "짜잔!" 하고 음식을 내미는 B급 광고 문법. 사진 뒤에만 깔리므로 글자 대비에는 닿지 않는다.
function sunburst(cx:number,cy:number,r:number):string {
  const colors=["#FFE600","#FF8A00","#FF3D2E"],N=24;
  let rays="";
  for(let i=0;i<N;i++){
    const a0=(Math.PI*2*i)/N,a1=(Math.PI*2*(i+1))/N;
    rays+=`<path d="M${cx} ${cy}L${Math.round(cx+Math.cos(a0)*r)} ${Math.round(cy+Math.sin(a0)*r)}L${Math.round(cx+Math.cos(a1)*r)} ${Math.round(cy+Math.sin(a1)*r)}Z" fill="${colors[i%3]}"/>`;
  }
  return `<defs><radialGradient id="sunFade" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="sunMask"><rect width="1080" height="1350" fill="url(#sunFade)"/></mask></defs>`
    +`<g mask="url(#sunMask)" opacity=".9">${rays}</g>`;
}
// 키치 전용 사진 톤: 무지개 바탕에 지지 않게 채도 1.12, 대비를 살짝(1.05배, −6) 올린다.
// 선명화는 finishPhoto가 이미 했으므로 다시 걸지 않는다. 알파(누끼 가장자리)는 원본 값을 그대로 다시 써 넣는다.
async function kitschTone(input:Buffer):Promise<Buffer> {
  const source=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=source.info;
  const toned=await sharp(source.data,{raw:{width,height,channels:4}}).removeAlpha().modulate({saturation:1.12}).linear(1.05,-6).raw().toBuffer();
  const out=Buffer.alloc(width*height*4);
  for(let p=0;p<width*height;p++){out[p*4]=toned[p*3];out[p*4+1]=toned[p*3+1];out[p*4+2]=toned[p*3+2];out[p*4+3]=source.data[p*4+3];}
  return sharp(out,{raw:{width,height,channels:4}}).png().toBuffer();
}
// 누끼가 자기 테두리(=원본 사진 가장자리 쪽)에 얼마나 붙어 있는지: 테두리 픽셀 중 불투명한 비율.
// 접시가 통째로 보이는 사진은 위아래·좌우 몇 점만 닿지만, 음식이 사진 밖으로 잘린 사진은 한 변이 통째로 닿는다.
// 15%를 넘으면 잘린 단면이 스티커 가장자리에 일자로 드러나 어색하므로 액자로 보낸다.
async function edgeTouch(cut:{data:Buffer;width:number;height:number}):Promise<number> {
  const {data,info}=await sharp(cut.data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height;
  let solid=0,n=0;
  const at=(x:number,y:number)=>{n++;if(data[(y*W+x)*4+3]>128)solid++;};
  for(let x=0;x<W;x++){at(x,0);at(x,H-1);}
  for(let y=1;y<H-1;y++){at(0,y);at(W-1,y);}
  return n?solid/n:1;
}
// 반짝이 별(네 갈래).
const twinkle=(x:number,y:number,r:number)=>`<path d="M${x} ${y-r}Q${x} ${y} ${x+r} ${y}Q${x} ${y} ${x} ${y+r}Q${x} ${y} ${x-r} ${y}Q${x} ${y} ${x} ${y-r}Z" fill="#fff"/>`;
// 반짝이 흩뿌리기: 장마다 자리가 달라지게 seed로 뽑되, 글자가 몰리는 가운데 띠를 피해 좌우 가장자리 띠(폭 150)에만 둔다.
// 같은 장은 늘 같은 자리(같은 입력 → 같은 그림).
function twinkles(seed:number,count:number):string {
  const rand=seeded(seed);
  return Array.from({length:count},(_,i)=>{
    const x=Math.round(i%2?930+rand()*110:40+rand()*110),y=Math.round(220+rand()*940),r=Math.round(14+rand()*22);
    return twinkle(x,y,r);
  }).join("");
}

// 외곽선 제목 + 핵심어 강조. 공용 fitOutlined는 강조를 받지 않아 같은 방식(16방향 외곽선 + 그림자)으로 여기서 그린다.
// 맨 위 채움 글자에만 강조색을 넣는다(외곽선·그림자는 한 색이라 강조어도 같은 빨간 테두리를 두른다).
const KITSCH_EMPH="#7CF6FF"; // 하늘색: 빨간 외곽선(#E8001C) 대비 3.8:1, 노랑·흰 채움과도 색이 확 갈린다.
// 돌출 그림자(extrude): 외곽선까지 합친 글자 실루엣을 검은색으로 오른쪽 아래 1px씩 EXTRUDE번 겹쳐 찍어 두께를 만든다.
// 예전 "한 번 밀어 찍은 그림자"보다 글자가 화면에서 튀어나온 블록처럼 보인다. 실루엣은 외곽선 버퍼를 한 번 합친 것이라
// 겹쳐 찍어도 합성은 8번뿐이다. 맨 위 채움 글자는 textLayer(Pango) 버퍼 그대로 얹어 검수가 글자를 본다.
const EXTRUDE=8;
async function shoutTitle(value:string,options:{sizes:number[];maxHeight:number;width:number;font:Font;fill:string;stroke:string;strokeWidth:number;shadow:string;emphasis?:TextEmphasis}):Promise<Layer> {
  const s=options.strokeWidth,shadowOffset=EXTRUDE;
  const layout=await chooseTitleLayout(value,{sizes:options.sizes,width:options.width,maxHeight:options.maxHeight-s*2-shadowOffset,font:options.font,align:"centre",spacing:size=>Math.round(size*.1)});
  const style={size:layout.size,width:layout.width,height:4000,font:options.font,align:"centre" as const,spacing:Math.round(layout.size*.1)};
  const fill=await textLayer(layout.text,{...style,color:options.fill,emphasis:options.emphasis});
  const stroke=await textLayer(layout.text,{...style,color:options.stroke});
  const ring=Array.from({length:16},(_,i)=>{const a=(Math.PI*2*i)/16;return [Math.round(Math.cos(a)*s),Math.round(Math.sin(a)*s)];});
  const W=fill.info.width+s*2,H=fill.info.height+s*2;
  // 외곽선 실루엣(16방향으로 찍은 테두리)을 한 버퍼로 합친다.
  const outline=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(ring.map(([dx,dy])=>({input:stroke.data,left:s+dx,top:s+dy}))).png().toBuffer();
  const alpha=await sharp(outline).extractChannel(3).toBuffer();
  const shade=await sharp({create:{width:W,height:H,channels:3,background:options.shadow}}).joinChannel(alpha).png().toBuffer();
  const layers:OverlayOptions[]=[
    ...Array.from({length:shadowOffset},(_,i)=>({input:shade,left:shadowOffset-i,top:shadowOffset-i})),
    {input:outline,left:0,top:0},
    {input:fill.data,left:s,top:s},
  ];
  return sharp({create:{width:W+shadowOffset,height:H+shadowOffset,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toBuffer({resolveWithObject:true});
}
// 전광판(LED) 판: 검은 둥근 판 둘레에 노란 전구 점을 일정 간격으로 찍는다. 부제·예고 띠·가게 명함이 같은 판을 쓴다.
function ledBoard(x:number,y:number,w:number,h:number,bulbs:boolean):string {
  // 판 면에 옅은 도트 격자(꺼진 LED 알): 검은 판이 그냥 검은 상자가 아니라 전광판으로 읽힌다.
  // 도트는 아주 옅게(.1) 두어 위에 얹는 도트 글자 대비를 떨어뜨리지 않는다.
  const id=`led${x}x${y}`;
  let svg=`<defs><pattern id="${id}" x="${x}" y="${y}" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="2" fill="#FFE600" fill-opacity=".1"/></pattern></defs>`
    +`<rect x="${x+6}" y="${y+6}" width="${w}" height="${h}" rx="14" fill="#000" fill-opacity=".55"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#111111" stroke="#FFE600" stroke-width="4"/>`
    +`<rect x="${x+4}" y="${y+4}" width="${w-8}" height="${h-8}" rx="11" fill="url(#${id})"/>`;
  if(!bulbs)return svg;
  const step=28,inset=11;
  const nx=Math.max(2,Math.round((w-inset*2)/step)),ny=Math.max(1,Math.round((h-inset*2)/step));
  for(let i=0;i<=nx;i++){const bx=x+inset+((w-inset*2)*i)/nx;svg+=`<circle cx="${bx}" cy="${y+inset}" r="4.5" fill="#FFE600"/><circle cx="${bx}" cy="${y+h-inset}" r="4.5" fill="#FFE600"/>`;}
  for(let j=1;j<ny;j++){const by=y+inset+((h-inset*2)*j)/ny;svg+=`<circle cx="${x+inset}" cy="${by}" r="4.5" fill="#FFE600"/><circle cx="${x+w-inset}" cy="${by}" r="4.5" fill="#FFE600"/>`;}
  return svg;
}

export const renderKitsch:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const v=(index-1+(slide.variant??0));
  const M=50,W=1080-M*2;
  const layers:OverlayOptions[]=[];
  const calm=currentTone()==="calm";
  // 절제 변형: 반짝이를 둘만, 사진 뒤 햇살은 생략(무지개 바탕·외침 딱지·외곽선 제목은 계열 정체성이라 그대로).
  let deco=rainbow([20,110,160,65][v%4])+twinkles(index*13+(slide.variant??0),calm?2:6);
  // 맨 위 외침 딱지.
  const shout=content.cover?COVER_SHOUT:SHOUTS[(index-2+SHOUTS.length)%SHOUTS.length];
  const shoutText=await fitOutlined(shout,{sizes:[56,48,42],maxHeight:150,width:560,font:STYLE_FONTS.heavy,fill:"#FF1F1F",stroke:"#FFFFFF",strokeWidth:5,align:"centre"});
  const bx=content.cover?540:760,by=content.cover?150:140,brx=Math.max(220,shoutText.info.width/2+70),bry=Math.max(100,shoutText.info.height/2+50);
  const shoutAngle=content.cover?-4:8;
  deco+=burst(bx+8,by+10,brx,bry,"#111",shoutAngle)+burst(bx,by,brx,bry,"#FFE600",shoutAngle);
  const shoutTilt=await rotated(shoutText.data,shoutAngle);
  const footerTop=1350-90;
  // 아래 경계(floor): 표지는 예고 띠(전광판 한 줄), 마지막 장은 가게 명함 전광판 몫을 바닥 띠 위에 예약한다.
  // 사진·요점은 이 경계 위에서 끝난다.
  const teaser=content.teaser?await textLayer(content.teaser,{size:27,color:"#7CF6FF",width:W-60,height:60,font:STYLE_FONTS.pixelBold}):null;
  const teaserH=teaser?teaser.info.height+24:0;
  const closing=content.last?await closingBlock({width:W-120,color:"#FFE600",accent:"#E8001C",font:STYLE_FONTS.heavy}):null;
  const CARD_PAD=30,cardH=closing?closing.height+CARD_PAD*2:0;
  const floor=closing?footerTop-14-cardH-18:teaser?footerTop-14-teaserH-14:footerTop;
  // 제목: 노란 글자 + 빨간 외곽선 + 검은 그림자. 화면 폭을 꽉 채운다. 핵심어는 하늘색.
  const titleTop=Math.round(by+bry+30);
  const hasPhoto=inputs.length>0;
  const titleSizes=content.cover?[118,104,92,82]:[96,86,76,68,60];
  let titleRoom=hasPhoto?(content.cover?360:closing?260:300):(closing?340:420);
  // 표지 부제: 제목 아래 전광판 한 줄(검은 판·노란 도트 글자). 가장 작은 제목으로도 자리가 안 나면 뺀다.
  let sub:Layer|null=null;
  if(content.subline){
    const layer=await textLayer(content.subline,{size:34,color:"#FFE600",width:W-80,height:120,font:STYLE_FONTS.pixelBold});
    const need=layer.info.height+24+18;
    const probe=await textLayer(content.headline,{size:titleSizes[titleSizes.length-1],color:"#000",width:W,height:4000,font:STYLE_FONTS.heavy,align:"centre",spacing:Math.round(titleSizes[titleSizes.length-1]*.1)});
    if(probe.info.height+26<=titleRoom-need){sub=layer;titleRoom-=need;}
  }
  const title=await shoutTitle(content.headline,{sizes:titleSizes,maxHeight:titleRoom,width:W,font:STYLE_FONTS.heavy,fill:v%2?"#FFFFFF":"#FFE600",stroke:"#E8001C",strokeWidth:10,shadow:"#111111",emphasis:emphasisOf(content,KITSCH_EMPH)});
  layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top:titleTop});
  let y=titleTop+title.info.height+24;
  if(sub){
    const w=sub.info.width+48,h=sub.info.height+24,x=Math.round((1080-w)/2);
    deco+=ledBoard(x,y-6,w,h,false);
    layers.push({input:sub.data,left:x+24,top:y-6+12});
    y+=h+18;
  }
  // 요점: 노랑·하늘 상자에 ★, 굵은 고딕. 스티커 칸을 실제 요점 높이로 계산하려고 사진보다 먼저 만든다.
  // 마지막 장에서 명함 때문에 자리가 모자라면 요점 수는 그대로 두고 글자를 한 단계씩 줄인다(사진 장 30px, 글자 장 36px까지).
  const fills=["#FFFF3A","#7CF6FF","#FFFFFF"];
  const maxPoints=hasPhoto?3:4;
  const makeBoxes=(size:number)=>Promise.all(content.points.slice(0,maxPoints).map(point=>textLayer(`★ ${point}`,{size,color:"#111111",width:W-100,height:size*3.2,font:STYLE_FONTS.comic,spacing:6})));
  const heightOf=(made:Layer[])=>made.reduce((sum,box)=>sum+box.info.height+28+16,0);
  const minPhoto=closing?290:370;
  let boxes:Layer[]=[];
  // 글자 장은 요점이 주인공이라 54px로 크게, 사진 장도 38px 아래로는 (마지막 장 말고는) 내려가지 않는다.
  for(const size of hasPhoto?(closing?[38,35,32,30]:[38]):[54,48,44,40,36]){
    boxes=await makeBoxes(size);
    if(heightOf(boxes)<=floor-y-(hasPhoto?minPhoto:20))break;
  }
  const boxesH=heightOf(boxes);
  // 사진: 흰 테두리 + 빨간 바깥 테두리, 삐딱하게. 사진이 두 장이면 엇갈리게 두 장.
  if(hasPhoto){
    const shots=inputs.slice(0,2);
    // 남는 높이(요점 자리를 뺀)에서 사진 칸 높이를 역산한다. 제목 maxHeight는 건드리지 않는다.
    // 액자는 사진보다 테두리·그림자 60px, 기울인 만큼(한 장 4° ≈ 폭의 7%, 두 장 6°+엇갈림 30px) 더 높아지므로 그 몫을 뺀다.
    // 예전에는 40px만 빼서 액자 아래가 경계를 넘었다(표지 예고 띠를 덮었다).
    const room=floor-y-(content.points.length?boxesH+10:0);
    const avail=shots.length>1?room-60-53-30:Math.floor((room-60-4)/1.0875);
    // 한 장이고 누끼가 깨끗하면 스티커로 크게. 누끼는 접시만 남기고 잘라 내 원본보다 작아지므로,
    // 넉넉한 크기(900)로 오린 뒤 남는 칸(스티커 테두리·그림자 몫 약 92px을 뺀)에 꽉 차게 다시 맞춘다.
    const cut=shots.length===1?await cutoutPhoto(shots[0],900):null;
    if(cut&&await edgeTouch(cut)<=.15){
      // 칸: 제목 아래부터 실제 요점 상자 위까지. 스티커 몫(테두리·그림자 92px)과 3° 회전으로 늘어나는 몫(약 35px)을 뺀다.
      const slotTop=y-10,slotBottom=floor-boxesH-26;
      // 스티커 몫(테두리·그림자)과 기울임으로 늘어나는 몫은 사진 비율마다 달라 한 번 그려 재고, 칸보다 많이 작으면
      // 남는 만큼 키워 한 번 더 그린다(고정값 127px을 빼던 때는 마지막 장처럼 칸이 좁으면 접시가 우표만 해졌다).
      const slotH=slotBottom-slotTop,boxW=W-92;
      const draw=async(boxH:number)=>{
        const scale=Math.min(boxW/cut.width,boxH/cut.height);
        const fitted=await sharp(cut.data).resize(Math.round(cut.width*scale),Math.round(cut.height*scale)).png().toBuffer({resolveWithObject:true});
        const sticker=await stickerize({data:await kitschTone(fitted.data),width:fitted.info.width,height:fitted.info.height},{border:14,shadow:"#111111",shadowOffset:12});
        return {tilt:await rotated(sticker.data,v%2?3:-3),photoH:fitted.info.height};
      };
      const boxH=Math.max(closing?200:300,slotH-127);
      const first=await draw(boxH);
      // 높이에 막힌 경우(사진 높이가 칸 높이와 같음)에만 키운다. 폭에 막혔으면 더 키워도 그대로다.
      const grow=first.photoH>=boxH-2&&first.tilt.info.height<slotH-24;
      const tilt=grow?(await draw(first.photoH+(slotH-first.tilt.info.height)-4)).tilt:first.tilt;
      registerPhoto(tilt.data);
      // 칸 가운데에 둔다(스티커가 칸보다 작을 때 위아래 빈 띠가 한쪽에 몰리지 않게).
      const top=Math.round(slotTop+Math.max(0,(slotBottom-slotTop-tilt.info.height)/2));
      if(!calm)deco+=sunburst(540,top+tilt.info.height/2,Math.max(tilt.info.width,tilt.info.height)*.68);
      layers.push({input:tilt.data,left:Math.round((1080-tilt.info.width)/2),top});
      y=top+tilt.info.height;
    }else{
      let photoBottom=y,rowWidth=0;
      const PH=Math.round(Math.max(closing?220:300,Math.min(560,avail))),PW=shots.length>1?440:Math.round(PH*1.25);
      for(const [i,shot] of shots.entries()){
        const photo=await kitschTone(await croppedPhoto(shot,PW,PH,0));
        // 액자(흰 안쪽·빨간 바깥 테두리) 오른쪽 아래로 12px 검은 그림자를 깔아 바탕에서 떠 보이게 한다.
        const FW=PW+48,FH=PH+48,SH=12;
        const framed=await sharp({create:{width:FW+SH,height:FH+SH,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
          {input:{create:{width:FW,height:FH,channels:4,background:"#111111"}},left:SH,top:SH},
          {input:{create:{width:FW,height:FH,channels:4,background:"#E8001C"}},left:0,top:0},
          {input:svgFrame(FW,FH),left:0,top:0},
          {input:photo,left:24,top:24},
        ]).png().toBuffer();
        const tilt=await rotated(framed,shots.length>1?(i?5:-6):(v%2?4:-4));
        // 부품 대부분이 사진이므로 회전한 액자를 사진으로 등록한다(자동 검수의 사진 면적).
        registerPhoto(tilt.data);
        const left=shots.length>1?(i?1080-M-tilt.info.width+10:M-10):Math.round((1080-tilt.info.width)/2);
        layers.push({input:tilt.data,left,top:y+(i?30:0)});
        photoBottom=Math.max(photoBottom,y+(i?30:0)+tilt.info.height);
        rowWidth=shots.length>1?1080-M*2:tilt.info.width;
      }
      // 햇살은 액자(한 장이면 그 가운데, 두 장이면 두 장 사이) 뒤에 깐다.
      if(!calm)deco+=sunburst(540,(y+photoBottom)/2,Math.max(rowWidth,photoBottom-y)*.62);
      y=photoBottom;
    }
  }
  // 글자 장에 요점을 다 놓고도 260px 넘게 비면 홍어 마스코트(가리키는 포즈, 없으면 인사 포즈)를 요점 아래 오른쪽에 세운다.
  // 요점 덩어리와 마스코트를 한 묶음으로 보고 세로 가운데에 둔다. 마스코트는 남는 높이에 맞춰 줄고, 200px도 안 되면 뺀다.
  const free=hasPhoto?0:floor-y-20-boxesH;
  const mascot=free>260?await mascotLayer({width:300,pose:"point",left:1080-M-20,top:0,anchor:"top-right",maxHeight:free-24,minHeight:200}):null;
  const blockH=boxesH+(mascot?mascot.height+8:0);
  let py=hasPhoto?Math.max(y,floor-boxesH-10):Math.max(y+20,Math.round((y+floor-blockH)/2));
  if(mascot){
    const top=py+boxesH+8;
    // 발밑 접촉 그림자로 마스코트가 바탕 위에 "서 있게" 한다(바탕이라 deco에 깔린다).
    deco+=contactShadow({cx:mascot.left+mascot.width/2,cy:top+mascot.height-10,rx:mascot.width*.36,opacity:.35});
    layers.push({...mascot,top});
  }
  for(const [i,box] of boxes.entries()){
    // 상자는 번갈아 80px씩만 들여 써서 지그재그 느낌은 살리되 읽는 흐름은 왼쪽에서 오른쪽으로 이어지게 한다.
    const w=box.info.width+44,h=box.info.height+28,x=i%2?Math.min(1080-M-w,M+80):M;
    layers.push(svgLayer(`<rect x="${x+8}" y="${py+8}" width="${w}" height="${h}" fill="#111"/><rect x="${x}" y="${py}" width="${w}" height="${h}" fill="${fills[i%fills.length]}" stroke="#111" stroke-width="5"/>`),{input:box.data,left:x+22,top:py+14});
    py+=h+16;
  }
  // 표지 예고 띠: 바닥 전광판 바로 위에 한 줄 더(하늘색 도트 글자) — 흐르는 안내판처럼.
  if(teaser){
    const w=teaser.info.width+60,x=Math.round((1080-w)/2),ty=footerTop-14-teaserH;
    // 판은 사진 위에 와야 하므로 바탕(deco)이 아니라 레이어로 얹는다.
    layers.push(svgLayer(ledBoard(x,ty,w,teaserH,false)));
    layers.push({input:teaser.data,left:x+30,top:ty+12});
  }
  // 가게 명함: 전구 둘레 전광판에 노란 가게 이름·흰 계정·빨간 저장 칩.
  if(closing){
    const cardW=Math.min(W,Math.max(560,closing.wordmark.info.width,closing.handle?.info.width??0,closing.chip.info.width+52)+120),cardX=Math.round(540-cardW/2),cardTop=footerTop-14-cardH;
    layers.push(svgLayer(ledBoard(cardX,cardTop,cardW,cardH,true)));
    let cy=cardTop+CARD_PAD;
    layers.push({input:closing.wordmark.data,left:540-Math.round(closing.wordmark.info.width/2),top:cy});
    cy+=closing.wordmark.info.height;
    // 계정은 노란 가게 이름과 구분되게 흰 글자로 다시 그린다(같은 크기·글꼴이라 높이는 명함 계산과 같다).
    if(closing.handle){
      const handle=await textLayer(brandHandle(),{size:28,color:"#FFFFFF",width:W-120,height:60,font:STYLE_FONTS.sansSemi,align:"centre"});
      layers.push({input:handle.data,left:540-Math.round(handle.info.width/2),top:cy+8});cy+=8+handle.info.height;
    }
    const chipX=540-Math.round(closing.chip.info.width/2),chipY=cy+18+12;
    layers.push(svgLayer(closing.chipSvg(chipX,chipY)),{input:closing.chip.data,left:chipX,top:chipY});
  }
  // 아래 검은 띠에 노란 가게 이름(전광판 느낌). 오른쪽에 장 번호(숫자 폭 고정), 본문 장이면 그 옆에 하늘색 "넘겨 보기 ›".
  deco+=`<rect x="0" y="${footerTop+10}" width="1080" height="80" fill="#111"/>`;
  const number=await textLayer(`${index}/${total}`,{size:30,color:"#FFE600",width:120,height:48,font:STYLE_FONTS.heavy,features:"tnum"});
  const cue=!content.cover&&!content.last?await nextCue("#7CF6FF",26):null;
  const rightW=number.info.width+(cue?cue.width+24:0);
  // 계정 이름이 길면 한 줄에 들어가는 크기로 줄인다(두 줄로 넘어가 작아지지 않게). 26px 아래로는 줄이지 않는다.
  const brand=await fitText(`☆ ${brandName()} ☆`,{sizes:[34,30,28,26],width:W-rightW-30,maxHeight:52,color:"#FFE600",font:STYLE_FONTS.heavy});
  const mid=footerTop+10+40;
  layers.push({input:brand.data,left:M,top:mid-Math.round(brand.info.height/2)});
  let rx=1080-M-rightW;
  layers.push({input:number.data,left:rx,top:mid-Math.round(number.info.height/2)});
  rx+=number.info.width+24;
  if(cue){
    const cy=mid-Math.round(cue.height/2);
    deco+=cue.arrow(rx,cy);
    layers.push({input:cue.label.data,left:rx,top:cy});
  }
  layers.unshift(svgLayer(deco));
  layers.push({input:shoutTilt.data,left:Math.round(bx-shoutTilt.info.width/2),top:Math.round(by-shoutTilt.info.height/2)});
  return sharp({create:{width:1080,height:1350,channels:3,background:"#FFFFFF"}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};

// 사진 둘레의 흰 안쪽 테두리.
const svgFrame=(w:number,h:number)=>Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="${w-20}" height="${h-20}" fill="#fff"/></svg>`);
