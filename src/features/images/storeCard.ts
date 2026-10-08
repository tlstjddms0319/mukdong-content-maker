import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { STORE_NAME } from "./slideLayout";
import { contrastRatio, isLight, paletteOf, readableOn, type DesignSpecInput, type Palette } from "./design";
import { normalizeStyleId, StyleIdSchema, type StyleId } from "./styleCatalog";
import { typographyOf } from "./typography";
import { auditRender, type AuditReport } from "./render/audit";
import { addSeasonMotif } from "./render/seasonLayer";
import { readCustomPoster } from "@/features/store/posterStore";
import { FONTS, blob, brandHandle, canvas, currentTone, sparkles, svgLayer, textLayer, withRenderContext, type Font, type Layer } from "./render/primitives";
import { contactShadow, doodleArrow, mascotLayer, propLayer, textureLayer, type PropName, type TextureName } from "./decor";
import { STYLE_FONTS, brandSeal, snap } from "./styles/shared";

// 가게 홍보 카드: 모든 캐러셀 맨 뒤에 자동으로 붙는 "묵동홍어마을" 한 장(사장님 결정: 내용 장은 그대로, 맨 뒤에 한 장 더).
// 이미지 AI를 부르지 않고 코드로만 그린다(비용 없음). 장 고치기에서 뺄 수 있게 생성 흐름이 따로 붙인다(이 파일은 그리기만).
//
// 구성(위에서 아래로): 낙관 → 가게 이름 워드마크(로고) → 계정(설정에 있을 때) → 한 줄 소개 → 큰 마스코트와 소품 스티커
//                     → "저장해 두고 다시 보세요" 칩 → 장 번호 n / n.
// 한 줄 소개는 사실을 단정하지 않는다(가격·영업시간·주소·"최고" 같은 말 없음).
//
// 색·글꼴·질감은 계열(design.style)마다 그 계열 파일(styles/*.ts)의 상수를 옮겨 온 STORE_TOKENS 표를 따른다.
// template은 색 조합(design.palette)과 게시물 테마(design.theme)를, 글꼴은 고른 제목·본문 글꼴을 따른다.
// 글자는 모두 textLayer로 그려 자동 검수(넘침·겹침·대비·격자 안전)를 받는다.

export const STORE_CARD_TAGLINE="묵동에서 홍어 한 점, 막걸리 한 잔";
export const STORE_CARD_CHIP="저장해 두고 다시 보세요";

// ── 계열별 토큰 ───────────────────────────────────────────────────────────────────────
// base    : 캔버스 바탕색        surface : 글자 바로 뒤 면(종이·패널·칠판 등). 글자색 대비는 이 색으로 맞춘다.
// ink     : 워드마크 색          sub     : 계정·한 줄 소개·장 번호     accent : 워드마크 속 "홍어"·장식 강조
// chip    : 저장 칩 바탕         title/body/label : 워드마크·한 줄 소개·계정/칩/장 번호 글꼴
// inset   : 글자가 들어갈 좌우 여백과 위·아래 끝(테두리·액자 안쪽)
// textures: 구운 질감(textureLayer 캐시). stage "base"는 장식 아래, "over"는 장식 위(분필 가루·필름 먼지처럼 표면에 앉는 것).
type Stage="base"|"over";
type TextureSpec={name:TextureName;opacity:number;blend?:OverlayOptions["blend"];stage?:Stage;region?:{left:number;top:number;width:number;height:number}};
export type StoreTokens={
  base:string;surface:string;ink:string;sub:string;accent:string;chip:string;
  title:Font;body:Font;label:Font;
  wordSizes:number[];tracking:number;emphasis:boolean;
  seal:"light"|"dark";
  inset:{x:number;top:number;bottom:number};
  textures:TextureSpec[];
};

const F=STYLE_FONTS;
const DEFAULT_SIZES=[136,124,112,100,90,80];
const HAND_SIZES=[168,156,144,132,120,108];
const token=(value:Partial<StoreTokens>&Pick<StoreTokens,"base"|"ink"|"sub"|"accent"|"chip"|"title"|"body"|"label">):StoreTokens=>({
  surface:value.base,wordSizes:DEFAULT_SIZES,tracking:.04,emphasis:true,seal:isLight(value.surface??value.base)?"light":"dark",
  inset:{x:80,top:72,bottom:64},textures:[],...value,
});

export const STORE_TOKENS:Record<Exclude<StyleId,"template">,StoreTokens>={
  // 컬러 블록: 노랑 블록 + 검은 굵은 고딕, 강조 진홍. 팝아트식 딱딱한 그림자.
  colorblock:token({base:"#FFD23F",ink:"#111111",sub:"#111111",accent:"#C8102E",chip:"#111111",title:F.heavy,body:F.sansBold,label:F.sansBold,tracking:.02}),
  // 웹툰: 흰 만화 칸(굵은 검은 테두리), 노란 내레이션 상자, 빨간 칩, 집중선.
  webtoon:token({base:"#F7F5F0",surface:"#FFFFFF",ink:"#111111",sub:"#111111",accent:"#C4161C",chip:"#D0281C",title:F.heavy,body:F.comic,label:F.comic,inset:{x:92,top:84,bottom:78}}),
  // 정갈한 한 상: 백자 바탕, 가는 금빛 선, 명조, 넓은 여백.
  omakase:token({base:"#F2EDE2",ink:"#2E241C",sub:"#55483C",accent:"#97401F",chip:"#7C5A26",title:F.modernSerif,body:F.serif,label:F.serif,tracking:.14,wordSizes:[112,104,96,88,80],inset:{x:96,top:84,bottom:76}}),
  // 타이포그래피: 거의 검은 바탕, 아주 굵은 고딕, 노랑 강조 안개.
  typography:token({base:"#141414",ink:"#FFFFFF",sub:"#E2E2E2",accent:"#FFD23F",chip:"#C23A1C",title:F.gothicBlack,body:F.sansSemi,label:F.sansSemi,tracking:-.02,wordSizes:[150,136,124,112,100]}),
  // B급 키치: 검은 전광판, 노란 전구 테두리, 무지개 띠, 톱니 별.
  kitsch:token({base:"#111111",ink:"#FFE600",sub:"#FFFFFF",accent:"#7CF6FF",chip:"#E8001C",title:F.heavy,body:F.comic,label:F.comic,inset:{x:96,top:96,bottom:90}}),
  // 빈티지 다이어리: 크라프트지 위 줄 노트, 마스킹 테이프, 펜 손글씨, 빨간 펜.
  diary:token({base:"#D8B88A",surface:"#FBF7EC",ink:"#1F2A4A",sub:"#1F2A4A",accent:"#C0392B",chip:"#C0392B",title:F.hand,body:F.dodum,label:F.dodum,wordSizes:HAND_SIZES,tracking:0,inset:{x:110,top:96,bottom:96},
    textures:[{name:"kraft",opacity:.7}]}),
  // 인포그래픽·도감: 모눈종이, 둥근 점선 지시 고리, 도현체.
  infographic:token({base:"#F6F5EE",ink:"#22313F",sub:"#22313F",accent:"#C8401A",chip:"#C8401A",title:F.comic,body:F.sansSemi,label:F.sansSemi,tracking:.02}),
  // 3D 팝업북: 짙은 남보라 무대, 빛무리, 펼친 책 위로 선 마스코트, 노란 별.
  popup:token({base:"#1C1A4A",ink:"#FFFFFF",sub:"#FFF8E8",accent:"#FFD84D",chip:"#FF5A8A",title:F.heavy,body:F.comic,label:F.sansSemi}),
  // 감성 필름: 검은 필름 띠와 톱니 구멍, 주황 가장자리 글, 송명 제목, 필름 먼지.
  film:token({base:"#121110",ink:"#F4EFE4",sub:"#C9C2B6",accent:"#E8923A",chip:"#A24E17",title:F.brushSerif,body:F.serif,label:F.sansBold,tracking:.06,inset:{x:112,top:72,bottom:64},
    textures:[{name:"filmdust",opacity:.3,blend:"screen",stage:"over"}]}),
  // 네온 간판: 벽돌 벽, 분홍 네온관 테두리, 둥근 글자, 하늘색 강조.
  neon:token({base:"#17121F",surface:"#0E0B13",ink:"#FFE9F4",sub:"#F2EEF7",accent:"#38E8FF",chip:"#C2186F",title:F.round,body:F.sansSemi,label:F.sansSemi,
    textures:[{name:"brick",opacity:.55,blend:"multiply"}]}),
  // 한지·수묵: 한지 결, 붓글씨, 먹 고리(원상), 붉은 낙관.
  hanji:token({base:"#F1E7D3",ink:"#1D1A16",sub:"#2E2822",accent:"#B3261E",chip:"#B3261E",title:F.brush,body:F.serif,label:F.serif,wordSizes:HAND_SIZES,tracking:.02,
    textures:[{name:"hanji",opacity:.5}]}),
  // 칠판 메뉴판: 나무 액자 칠판, 분필 손글씨, 노랑 색분필, 벽돌색 칩.
  chalkboard:token({base:"#6B4A2B",surface:"#1F2B25",ink:"#F3F0E6",sub:"#E4E2D8",accent:"#F6E27A",chip:"#B5472F",title:F.chalk,body:F.dodum,label:F.dodum,wordSizes:[150,140,128,116,104],tracking:.02,inset:{x:96,top:88,bottom:84},seal:"dark",
    textures:[{name:"wood",opacity:1,blend:"over"},{name:"chalkdust",opacity:.22,blend:"screen",stage:"over",region:{left:38,top:38,width:1004,height:1274}}]}),
  // 사진 위 낙서: 흰 종이, 마커 손글씨, 형광 노랑 밑줄, 빨간 마커 동그라미·화살표.
  doodle:token({base:"#FAF7F0",ink:"#141414",sub:"#141414",accent:"#C8102E",chip:"#C8102E",title:F.marker,body:F.sansSemi,label:F.sansSemi,wordSizes:[176,164,152,140,128],tracking:0}),
  // 막걸리 라벨: 크림 종이, 갈색 두 줄 테두리, 금빛 둥근 배지, 리본 빨강, 양각 느낌 명조.
  label:token({base:"#F3EAD6",ink:"#2B1D12",sub:"#3A2A1A",accent:"#9E2B25",chip:"#9E2B25",title:F.modernSerif,body:F.serif,label:F.serifHeavy,tracking:.1,wordSizes:[112,104,96,88,80],inset:{x:96,top:88,bottom:86}}),
  // 모던 그리드: 흰 바탕, 굵은 검은 격자선, 빨간 포인트, 고딕 블랙과 고정폭 숫자.
  grid:token({base:"#FFFFFF",ink:"#111111",sub:"#111111",accent:"#E8321E",chip:"#C42416",title:F.gothicBlack,body:F.sansSemi,label:F.mono,tracking:-.02,inset:{x:88,top:80,bottom:76}}),
  // 블랙 & 골드: 검은 바탕, 금박 두 줄 액자, 현대 명조.
  gold:token({base:"#0B0A08",ink:"#EBD38A",sub:"#EFE6D2",accent:"#FFF4DA",chip:"#8E6A22",title:F.modernSerif,body:F.serif,label:F.serif,tracking:.12,wordSizes:[108,100,92,84,76],emphasis:false,inset:{x:110,top:90,bottom:84}}),
  // 수채화: 흰 종이에 파스텔 물감 번짐, 둥근 손글씨, 장밋빛 강조.
  watercolor:token({base:"#FCFBF7",ink:"#3B3A36",sub:"#3B3A36",accent:"#A8405A",chip:"#A8405A",title:F.soft,body:F.dodum,label:F.dodum,wordSizes:HAND_SIZES,tracking:0,
    textures:[{name:"linen",opacity:.28}]}),
  // 티켓·승차권: 청록 바탕 위 크림 입장권, 절취선과 스텁, 빨간 칩, 고정폭 번호.
  ticket:token({base:"#1F3A3D",surface:"#F7EFD9",ink:"#1E1C18",sub:"#2A2824",accent:"#C8321E",chip:"#C8321E",title:F.heavy,body:F.sansSemi,label:F.mono,tracking:.02,inset:{x:118,top:88,bottom:72},seal:"light"}),
  // 푸드 매거진: 흰 지면, 굵은 명조 제호, 머리·바닥 가는 선, 빨강 포인트.
  editorial:token({base:"#FFFFFF",ink:"#111111",sub:"#1A1A1A",accent:"#D22B2B",chip:"#D22B2B",title:F.serifHeavy,body:F.sansSemi,label:F.mono,tracking:.02,inset:{x:80,top:92,bottom:96},
    textures:[{name:"linen",opacity:.26}]}),
  // 사진 중심: 크림 종이, 가게 밤색 글자, 함렛 명조 워드마크(styles/photoFocus.ts·trackKit.ts의 색).
  "photo-focus":token({base:"#F5EFE5",ink:"#2F231E",sub:"#5E4E45",accent:"#A9472A",chip:"#4F3C39",title:F.modernSerif,body:F.sans,label:F.sansSemi,tracking:.1,wordSizes:[112,104,96,88,80],inset:{x:96,top:84,bottom:76},
    textures:[{name:"linen",opacity:.22}]}),
  // 글 중심: 가게 밤색 바탕, 크림 글자, 겨자 강조, 굵은 프리텐다드 워드마크(styles/textFocus.ts).
  "text-focus":token({base:"#4F3C39",ink:"#F8F1E6",sub:"#E3D5C2",accent:"#E9BC5C",chip:"#E9BC5C",title:F.sansBold,body:F.sans,label:F.sansSemi,tracking:.02}),
};

// template: 색 조합과 고른 글꼴(FONTS 역할 객체 → 렌더 설정의 글꼴로 바뀐다)을 따른다.
function templateTokens(palette:Palette):StoreTokens {
  return token({base:palette.paper,ink:palette.ink,sub:palette.muted,accent:palette.accent,chip:palette.accent,title:FONTS.bold,body:FONTS.regular,label:FONTS.semibold,tracking:.02,inset:{x:88,top:84,bottom:80}});
}

const styleOf=(design?:DesignSpecInput):StyleId=>{
  const parsed=StyleIdSchema.safeParse(normalizeStyleId(design?.style));
  return parsed.success?parsed.data:"template";
};
export const storeTokensOf=(design?:DesignSpecInput):StoreTokens=>{
  const style=styleOf(design);
  return style==="template"?templateTokens(paletteOf(design)):STORE_TOKENS[style];
};

// ── 그리기 ──────────────────────────────────────────────────────────────────────────────
// 자리 정보. 장식 함수가 글자를 피해 선·도형을 놓을 때 쓴다.
type Box={x:number;y:number;w:number;h:number};
type Places={word:Box;tagTop:number;tagBottom:number;band:{top:number;bottom:number};mascot:Box|null;chip:Box;number:Box};
type Deco={under:string;over:string};
type Colors={ink:string;sub:string;accent:string;chip:string;chipText:string};

// 글자색을 바탕(surface)에 맞춘다. 작은 글자(40px 미만)는 4:1, 큰 글자는 3:1이 검수 기준이라 여유를 두고 4.8·3.6으로 맞춘다.
function colorsOf(t:StoreTokens):Colors {
  const chipText=contrastRatio("#FFFFFF",t.chip)>=contrastRatio("#141414",t.chip)?"#FFFFFF":"#141414";
  return {
    ink:readableOn(t.ink,t.surface,4.8),sub:readableOn(t.sub,t.surface,4.8),accent:readableOn(t.accent,t.surface,3.6),
    chip:readableOn(t.chip,chipText,4.8),chipText,
  };
}

// 한 줄에 들어가는 가장 큰 크기의 워드마크. 두 줄로 접히면 한 단계 작게.
async function wordmarkLayer(t:StoreTokens,c:Colors,width:number):Promise<Layer> {
  const emphasis=t.emphasis&&c.accent.toLowerCase()!==c.ink.toLowerCase()?{words:["홍어"],color:c.accent}:undefined;
  let layer:Layer|null=null;
  for(const size of t.wordSizes){
    const style={size,color:c.ink,width,height:4000,font:t.title,align:"centre" as const,letterSpacing:size*t.tracking,spacing:0};
    const single=await textLayer("묵",{...style,emphasis:undefined});
    layer=await textLayer(STORE_NAME,{...style,emphasis});
    if(layer.info.height<=single.info.height*1.35)return layer;
  }
  return layer!;
}

// 들어가는 가장 큰 크기로 한 줄(긴 계정 대비). 가장 작은 크기로도 넘치면 그 크기로 접는다(검수가 잡는다).
async function oneLine(value:string,options:{sizes:number[];width:number;color:string;font:Font;features?:string}):Promise<Layer> {
  let layer:Layer|null=null;
  for(const size of options.sizes){
    const style={size,color:options.color,width:options.width,height:4000,font:options.font,align:"centre" as const,spacing:4,features:options.features};
    const single=await textLayer("묵",style);
    layer=await textLayer(value,style);
    if(layer.info.height<=single.info.height*1.35)return layer;
  }
  return layer!;
}

// 마스코트는 "ok" 포즈(윙크·오케이 손). bye.webp는 머리·지느러미가 파일 가장자리에 닿게 잘려 있어(위 47px) 크게 쓰면
// 머리 윗선이 평평하게 잘려 보인다. ok.webp는 사방이 투명해 크게 써도 깔끔하다. 폭은 원본(674px)을 넘기지 않는다(확대하면 흐려짐).
const MASCOT_WIDTH=674;
// 계열마다 다른(그러나 늘 같은) 낙관 모양·소품 기울기를 고르는 번호.
const styleSeed=(style:StyleId)=>StyleIdSchema.options.indexOf(style);

async function drawStoreCard(style:StyleId,t:StoreTokens,index:number,total:number,palette:Palette):Promise<Buffer> {
  const c=colorsOf(t),calm=currentTone()==="calm",seed=styleSeed(style);
  const X=t.inset.x,W=1080-X*2;
  const layers:OverlayOptions[]=[];
  // 1) 낙관
  const sealSize=100;
  const seal=await brandSeal(sealSize,40+seed,{on:t.seal,rotate:seed%2?-4:3});
  let y=t.inset.top;
  const sealX=540-sealSize/2;
  let sealY=y;
  y+=sealSize+22;
  // 2) 워드마크
  const word=await wordmarkLayer(t,c,W);
  const wordBox={x:540-word.info.width/2,y,w:word.info.width,h:word.info.height};
  // 워드마크 밑 장식 선(금박·분필 물결·강조 막대)이 들어갈 틈.
  y+=word.info.height+40;
  // 3) 계정(있을 때) 4) 한 줄 소개
  const account=brandHandle();
  const handle=account?await oneLine(account,{sizes:[34,30,28,26],width:W,color:c.sub,font:t.label}):null;
  let handleY=y;
  if(handle)y+=handle.info.height+12;
  const tagline=await oneLine(STORE_CARD_TAGLINE,{sizes:[42,40],width:W,color:c.sub,font:t.body});
  let tagY=y;
  y+=tagline.info.height;
  let tagBottom=y;
  // 6) 장 번호(맨 아래) 5) 저장 칩(그 위)
  const number=await textLayer(`${index}`,{size:30,color:c.sub,width:300,height:60,font:t.label,align:"centre",features:"tnum"});
  const numberY=1350-t.inset.bottom-number.info.height;
  const chipText=await textLayer(STORE_CARD_CHIP,{size:32,color:c.chipText,width:W-60,height:80,font:t.label,align:"centre"});
  const padX=34,padY=16;
  const chipW=chipText.info.width+padX*2,chipH=chipText.info.height+padY*2;
  const chipY=numberY-26-chipH;
  const chip={x:540-chipW/2,y:chipY,w:chipW,h:chipH};
  // 마스코트 띠: 한 줄 소개 아래부터 칩 위까지. 발은 띠 바닥에 닿게 둔다.
  const band={top:tagBottom+34,bottom:chipY-42};
  const mascot=await mascotLayer({width:MASCOT_WIDTH,left:0,top:0,pose:"ok",maxHeight:band.bottom-band.top,minHeight:180});
  // 마스코트가 띠보다 작으면(계정이 없어 띠가 길 때) 남는 높이의 절반만큼 윗부분(낙관~한 줄 소개)을 내려 빈 띠를 없앤다.
  const shift=mascot?Math.floor((band.bottom-band.top-mascot.height)/2):0;
  if(shift>0){sealY+=shift;wordBox.y+=shift;handleY+=shift;tagY+=shift;tagBottom+=shift;band.top+=shift;}
  let mascotBox:Box|null=null;
  if(mascot){
    mascot.left=Math.round(540-mascot.width/2);
    mascot.top=Math.round(band.bottom-mascot.height);
    mascotBox={x:mascot.left,y:mascot.top,w:mascot.width,h:mascot.height};
  }
  const places:Places={word:wordBox,tagTop:tagY,tagBottom,band,mascot:mascotBox,chip,number:{x:540-number.info.width/2,y:numberY,w:number.info.width,h:number.info.height}};
  const deco=DECOR[style]({t,c,places,calm,seed,palette});

  // 질감(장식 아래)
  for(const spec of t.textures.filter(spec=>(spec.stage??"base")==="base")){const layer=await textureLayer(spec.name,{opacity:spec.opacity,blend:spec.blend,...spec.region});if(layer)layers.push(layer);}
  if(deco.under)layers.push(svgLayer(deco.under));
  for(const spec of t.textures.filter(spec=>spec.stage==="over")){const layer=await textureLayer(spec.name,{opacity:spec.opacity,blend:spec.blend,...spec.region});if(layer)layers.push(layer);}

  // 마스코트·소품: 발 밑 접촉 그림자 → 소품 → 마스코트(앞)
  const ground:string[]=[];
  const props:OverlayOptions[]=[];
  if(mascotBox){
    const feet=mascotBox.y+mascotBox.h;
    ground.push(contactShadow({cx:540,cy:feet-6,rx:mascotBox.w*.34,opacity:isLight(t.surface)?.3:.55}));
    const scale=Math.min(1,mascotBox.h/480);
    const sideW=Math.round(190*scale),topW=Math.round(132*scale);
    const tilt=(i:number)=>((seed*7+i*11)%17)-8;
    const plan:Array<{name:PropName;width:number;left:number;top:number;anchor:"bottom-right"|"bottom-left"|"center";ground:boolean}>=[
      {name:"skate",width:sideW,left:mascotBox.x+36,top:feet+2,anchor:"bottom-right",ground:true},
      {name:"makgeolli",width:Math.round(sideW*.86),left:mascotBox.x+mascotBox.w-36,top:feet+2,anchor:"bottom-left",ground:true},
      ...(calm?[]:[
        // 마스코트의 흔드는 손(오른쪽 위)을 가리지 않게: 하나는 왼쪽 위 빈 모서리, 하나는 오른쪽 지느러미 바깥 아래쪽.
        {name:"kimchi" as const,width:topW,left:mascotBox.x+mascotBox.w*.06,top:mascotBox.y+mascotBox.h*.14,anchor:"center" as const,ground:false},
        {name:"gim" as const,width:topW,left:mascotBox.x+mascotBox.w+64,top:mascotBox.y+mascotBox.h*.6,anchor:"center" as const,ground:false},
      ]),
    ];
    for(const [i,item] of plan.entries()){
      const prop=await propLayer(item.name,{width:item.width,left:item.left,top:item.top,anchor:item.anchor,rotate:item.ground?0:tilt(i)});
      if(!prop)continue;
      // 캔버스·글자 가장자리 안으로 밀어 넣는다(좁은 계열).
      prop.left=Math.max(40,Math.min(1040-prop.width,prop.left));
      prop.top=Math.max(band.top,Math.min(band.bottom+4-prop.height,prop.top));
      if(item.ground)ground.push(contactShadow({cx:prop.left+prop.width/2,cy:prop.top+prop.height-4,rx:prop.width*.36,opacity:isLight(t.surface)?.24:.45}));
      props.push(prop);
    }
  }
  if(ground.length)layers.push(svgLayer(ground.join("")));
  layers.push(...props);
  if(mascot)layers.push(mascot);
  if(deco.over)layers.push(svgLayer(deco.over));

  // 글자와 칩
  layers.push(svgLayer(seal.svg(sealX,sealY)+`<rect x="${chip.x}" y="${chip.y}" width="${chip.w}" height="${chip.h}" rx="${chip.h/2}" fill="${c.chip}"/>`));
  layers.push({input:seal.text.data,left:sealX+(sealSize-seal.text.info.width)/2,top:sealY+(sealSize-seal.text.info.height)/2});
  layers.push({input:word.data,left:wordBox.x,top:wordBox.y});
  if(handle)layers.push({input:handle.data,left:540-handle.info.width/2,top:handleY});
  layers.push({input:tagline.data,left:540-tagline.info.width/2,top:tagY});
  layers.push({input:chipText.data,left:540-chipText.info.width/2,top:chip.y+padY});
  layers.push({input:number.data,left:540-number.info.width/2,top:numberY});

  const placed=snap(layers);
  if(style==="template")return canvas(t.base,placed);
  return sharp({create:{width:1080,height:1350,channels:3,background:t.base}}).composite(placed).jpeg({quality:92}).toBuffer();
}

// ── 계열별 장식(SVG) ─────────────────────────────────────────────────────────────────────
// 무거운 필터(큰 영역 흐림·잡음)는 쓰지 않는다. 번짐은 방사형 그라데이션으로 흉내 낸다.
type DecoInput={t:StoreTokens;c:Colors;places:Places;calm:boolean;seed:number;palette:Palette};
const radial=(id:string,cx:number,cy:number,r:number,color:string,opacity:number)=>
  `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset=".6" stop-color="${color}" stop-opacity="${opacity*.55}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
const mascotCenter=(p:Places)=>p.mascot?{cx:p.mascot.x+p.mascot.w/2,cy:p.mascot.y+p.mascot.h/2,r:Math.max(p.mascot.w,p.mascot.h)/2}:{cx:540,cy:(p.band.top+p.band.bottom)/2,r:(p.band.bottom-p.band.top)/2};
const star=(x:number,y:number,r:number,color:string)=>{
  const pts=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r;return `${(x+Math.cos(a)*rr).toFixed(1)},${(y+Math.sin(a)*rr).toFixed(1)}`;});
  return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
};
const burst=(cx:number,cy:number,r:number,color:string,teeth=22)=>{
  const pts=Array.from({length:teeth*2},(_,i)=>{const a=i*Math.PI/teeth,rr=i%2?r*.82:r;return `${(cx+Math.cos(a)*rr).toFixed(1)},${(cy+Math.sin(a)*rr).toFixed(1)}`;});
  return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
};

const DECOR:Record<StyleId,(input:DecoInput)=>Deco>={
  template:({palette,places,calm})=>{
    const m=mascotCenter(places);
    const word=places.word;
    const under=blob({cx:m.cx,cy:m.cy+20,r:m.r*.9,color:palette.soft,opacity:isLight(palette.paper)?.9:.6,seed:3})
      +(calm?"":sparkles([[word.x-34,word.y+24,18],[word.x+word.w+30,word.y+word.h-28,14]],palette.highlight,.95));
    return {under,over:""};
  },
  colorblock:({places,calm})=>{
    const m=mascotCenter(places),r=Math.min(m.r*.92,340);
    const under=`<circle cx="0" cy="0" r="170" fill="#FF5A36"/><rect x="900" y="1240" width="260" height="200" rx="28" fill="#2E5BFF" transform="rotate(-12 1030 1340)"/>`
      +`<circle cx="${m.cx+14}" cy="${m.cy+14}" r="${r}" fill="#111111"/><circle cx="${m.cx}" cy="${m.cy}" r="${r}" fill="#FFFFFF" stroke="#111111" stroke-width="6"/>`
      +(calm?"":`<circle cx="1000" cy="${places.band.top+30}" r="26" fill="#FF6FB5" stroke="#111" stroke-width="4"/><circle cx="84" cy="${places.band.bottom-40}" r="18" fill="#2E5BFF" stroke="#111" stroke-width="4"/>`);
    return {under,over:""};
  },
  webtoon:({places,calm})=>{
    const m=mascotCenter(places);
    let lines="";
    if(!calm)for(let i=0;i<36;i++){
      const a=i*Math.PI*2/36,r0=m.r*.95,r1=m.r*1.9,w=i%3?3:6;
      lines+=`<path d="M${(m.cx+Math.cos(a)*r0).toFixed(1)} ${(m.cy+Math.sin(a)*r0).toFixed(1)}L${(m.cx+Math.cos(a)*r1).toFixed(1)} ${(m.cy+Math.sin(a)*r1).toFixed(1)}" stroke="#111111" stroke-opacity=".22" stroke-width="${w}"/>`;
    }
    const tagTop=places.tagTop-10,tagH=places.tagBottom-places.tagTop+20;
    return {under:`<defs><clipPath id="wtBand"><rect x="44" y="${places.band.top-10}" width="992" height="${places.band.bottom-places.band.top+20}"/></clipPath></defs>`
      +`<rect x="44" y="44" width="992" height="1262" fill="#FFFFFF" stroke="#111111" stroke-width="8"/>`
      +`<g clip-path="url(#wtBand)">${lines}</g>`
      +`<rect x="150" y="${tagTop}" width="780" height="${tagH}" fill="#FFE14D" stroke="#111111" stroke-width="4" transform="rotate(-1 540 ${tagTop+tagH/2})"/>`,over:""};
  },
  omakase:({places})=>{
    const w=places.word,line="#B08D55";
    return {under:`<rect x="40" y="40" width="1000" height="1270" fill="none" stroke="${line}" stroke-width="2.5"/>`
      +`<path d="M${540-90} ${w.y+w.h+22}H${540+90}" stroke="${line}" stroke-width="2.5"/>`
      +`<circle cx="540" cy="${(places.band.top+places.band.bottom)/2+30}" r="${Math.min(300,(places.band.bottom-places.band.top)/2)}" fill="#FBF8F1"/>`,over:""};
  },
  typography:({places})=>{
    const w=places.word;
    return {under:radial("tyA",930,220,420,"#FFD23F",.16)+radial("tyB",140,1150,460,"#FF5A36",.14)
      +`<rect x="${540-70}" y="${w.y+w.h+22}" width="140" height="8" fill="#FFD23F"/>`,over:""};
  },
  kitsch:({places,calm})=>{
    const RAINBOW=["#FF1F1F","#FF8A00","#FFE600","#22D94A","#00B7FF","#7A2BFF","#FF2BC8"];
    let stripes="";
    for(let i=0;i<RAINBOW.length;i++)stripes+=`<rect x="0" y="${i*6}" width="1080" height="6" fill="${RAINBOW[i]}"/><rect x="0" y="${1350-(i+1)*6}" width="1080" height="6" fill="${RAINBOW[i]}"/>`;
    const x=52,y=58,w=976,h=1234,inset=16;
    let bulbs="";
    const nx=24,ny=30;
    for(let i=0;i<=nx;i++){const bx=x+inset+((w-inset*2)*i)/nx;bulbs+=`<circle cx="${bx.toFixed(1)}" cy="${y+inset}" r="5" fill="#FFE600"/><circle cx="${bx.toFixed(1)}" cy="${y+h-inset}" r="5" fill="#FFE600"/>`;}
    for(let j=1;j<ny;j++){const by=y+inset+((h-inset*2)*j)/ny;bulbs+=`<circle cx="${x+inset}" cy="${by.toFixed(1)}" r="5" fill="#FFE600"/><circle cx="${x+w-inset}" cy="${by.toFixed(1)}" r="5" fill="#FFE600"/>`;}
    const m=mascotCenter(places);
    return {under:stripes+`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#111111" stroke="#FFE600" stroke-width="4"/>`+bulbs
      +(calm?"":burst(m.cx+10,m.cy+10,Math.min(m.r*1.05,330),"#000000")+burst(m.cx,m.cy,Math.min(m.r*1.05,330),"#FF8A00")+burst(m.cx,m.cy,Math.min(m.r*.84,270),"#FFE600")),over:""};
  },
  diary:({places,seed})=>{
    const SX=70,SY=58,SW=940,SH=1234;
    let rules="";
    for(let ry=SY+120;ry<SY+SH-20;ry+=56)rules+=`<path d="M${SX} ${ry}H${SX+SW}" stroke="#9DB8D6" stroke-opacity=".55" stroke-width="2"/>`;
    const tapes=["#F4B6C2","#B9E3C6","#FCE38A","#AEC8F2"];
    const tape=(x:number,y:number,a:number,color:string)=>`<rect x="${x-80}" y="${y-22}" width="160" height="44" fill="${color}" fill-opacity=".85" transform="rotate(${a} ${x} ${y})"/>`;
    const w=places.word;
    return {under:`<rect x="${SX+8}" y="${SY+10}" width="${SW}" height="${SH}" fill="#000" fill-opacity=".14"/><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" fill="#FBF7EC"/>`
      +rules+`<path d="M${SX+64} ${SY}V${SY+SH}" stroke="#E58C8C" stroke-width="2.5"/>`
      +`<path d="M${w.x+10} ${w.y+w.h-14}H${w.x+w.w-10}" stroke="#FCE38A" stroke-width="26" stroke-linecap="round" stroke-opacity=".8"/>`,
    over:tape(SX+30,SY+6,-28,tapes[seed%4])+tape(SX+SW-30,SY+6,26,tapes[(seed+1)%4])};
  },
  infographic:({places})=>{
    let grid="";
    for(let x=0;x<=1080;x+=30)grid+=`<path d="M${x} 0V1350" stroke="${x%150?"#CFE0D8":"#A9C9BC"}" stroke-width="${x%150?1.5:2.5}"/>`;
    for(let y=0;y<=1350;y+=30)grid+=`<path d="M0 ${y}H1080" stroke="${y%150?"#CFE0D8":"#A9C9BC"}" stroke-width="${y%150?1.5:2.5}"/>`;
    const m=mascotCenter(places),r=Math.min(m.r*.98,330);
    return {under:grid+`<circle cx="${m.cx}" cy="${m.cy}" r="${r}" fill="#FFF3C4"/><circle cx="${m.cx}" cy="${m.cy}" r="${r}" fill="none" stroke="#C8401A" stroke-width="4" stroke-dasharray="10 12" stroke-linecap="round"/>`
      +`<path d="M${m.cx+r*.7} ${m.cy-r*.7}L${m.cx+r+60} ${m.cy-r-30}H1010" fill="none" stroke="#22313F" stroke-width="3" stroke-dasharray="6 8"/><circle cx="1010" cy="${m.cy-r-30}" r="8" fill="#C8401A"/>`,over:""};
  },
  popup:({places,calm})=>{
    const m=mascotCenter(places),feet=places.mascot?places.mascot.y+places.mascot.h:places.band.bottom;
    const top=feet-30,bottom=Math.min(feet+38,places.chip.y-14);
    const book=`<path d="M120 ${bottom}L190 ${top}L540 ${top+16}L540 ${bottom+10}Z" fill="#FFF8E8" stroke="#D9CBB0" stroke-width="3"/><path d="M960 ${bottom}L890 ${top}L540 ${top+16}L540 ${bottom+10}Z" fill="#F3EAD4" stroke="#D9CBB0" stroke-width="3"/>`;
    const sparks=calm?"":[[150,places.band.top+40,22],[930,places.band.top+90,26],[200,places.band.top+260,14],[880,places.band.top+330,16]].map(([x,y,r],i)=>star(x,y,r,i%2?"#FFFFFF":"#FFD84D")).join("");
    return {under:radial("puGlow",m.cx,m.cy,Math.min(m.r*1.5,520),"#5B54D6",calm?.45:.7)+book+sparks,over:""};
  },
  film:({places})=>{
    let holes="";
    for(let y=30;y<1350;y+=72)holes+=`<rect x="18" y="${y}" width="34" height="38" rx="6" fill="#2A2724"/><rect x="${1080-52}" y="${y}" width="34" height="38" rx="6" fill="#2A2724"/>`;
    const m=mascotCenter(places);
    return {under:holes+`<path d="M70 0V1350M1010 0V1350" stroke="#2A2724" stroke-width="3"/>`+radial("fiHalo",m.cx,m.cy,Math.min(m.r*1.35,460),"#FFB46A",.2),over:""};
  },
  neon:({places,calm})=>{
    const w=places.word,top=w.y-30,bottom=places.tagBottom+26,x=96,width=888;
    const tube=(color:string,sw:number,opacity:number)=>`<rect x="${x}" y="${top}" width="${width}" height="${bottom-top}" rx="40" fill="none" stroke="${color}" stroke-width="${sw}" stroke-opacity="${opacity}"/>`;
    const m=mascotCenter(places);
    return {under:`<rect x="${x}" y="${top}" width="${width}" height="${bottom-top}" rx="40" fill="#0E0B13" fill-opacity=".82"/>`
      +tube("#FF3EA5",calm?14:22,calm?.18:.28)+tube("#FF3EA5",8,.9)+tube("#FFE9F4",2.5,.9)
      +radial("neGlow",m.cx,m.cy,Math.min(m.r*1.3,460),"#38E8FF",calm?.12:.2),over:""};
  },
  hanji:({places})=>{
    const m=mascotCenter(places),r=Math.min(m.r*.95,320);
    return {under:radial("hjWash",m.cx,m.cy,r*1.2,"#1D1A16",.1)
      +`<path d="M${m.cx-r*.2} ${m.cy-r}A${r} ${r} 0 1 1 ${m.cx-r*.62} ${m.cy-r*.78}" fill="none" stroke="#1D1A16" stroke-opacity=".22" stroke-width="16" stroke-linecap="round"/>`
      +`<path d="M300 ${places.tagBottom+14}H780" stroke="#1D1A16" stroke-opacity=".35" stroke-width="2.5"/>`,over:""};
  },
  chalkboard:({places,calm})=>{
    const w=places.word,y=w.y+w.h+22;
    let wave=`M${540-200} ${y}`;
    for(let x=540-200,up=true;x<540+200;x+=25,up=!up)wave+=`Q${x+12.5} ${y+(up?-7:7)} ${x+25} ${y}`;
    const stars=calm?"":star(150,places.band.top+60,20,"#F6E27A")+star(930,places.band.top+120,16,"#F4A9BC")+star(910,places.band.bottom-260,12,"#9DD4EA");
    return {under:`<rect x="38" y="38" width="1004" height="1274" rx="6" fill="#1F2B25"/><rect x="38" y="38" width="1004" height="1274" rx="6" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6"/>`
      +`<path d="${wave}" fill="none" stroke="#F6E27A" stroke-width="5" stroke-linecap="round" stroke-opacity=".9"/>`+stars,over:""};
  },
  doodle:({places,calm})=>{
    const w=places.word,m=mascotCenter(places),rx=Math.min(m.r*1.02,360),ry=Math.min(m.r*.95,320);
    const arrow=calm?"":doodleArrow({x1:150,y1:places.chip.y-90,x2:places.chip.x-18,y2:places.chip.y+places.chip.h/2,color:"#C8102E",strokeWidth:6,bend:.3});
    return {under:`<path d="M${w.x+6} ${w.y+w.h*.7}H${w.x+w.w-6}" stroke="#FFE14D" stroke-width="${Math.round(w.h*.32)}" stroke-linecap="round" stroke-opacity=".9"/>`
      +`<ellipse cx="${m.cx}" cy="${m.cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#C8102E" stroke-width="7" stroke-linecap="round" transform="rotate(-6 ${m.cx} ${m.cy})" stroke-dasharray="${(Math.PI*(rx+ry)*.93).toFixed(0)} 4000"/>`
      +(calm?"":`<ellipse cx="${m.cx}" cy="${m.cy}" rx="${rx*.97}" ry="${ry*1.02}" fill="none" stroke="#C8102E" stroke-width="4" transform="rotate(3 ${m.cx} ${m.cy})" stroke-opacity=".7" stroke-dasharray="${(Math.PI*(rx+ry)*.6).toFixed(0)} 4000"/>`)+arrow,over:""};
  },
  label:({places})=>{
    const m=mascotCenter(places),r=Math.min(m.r*.98,320);
    const diamond=(x:number,y:number,s:number)=>`<path d="M${x} ${y-s}L${x+s*.7} ${y}L${x} ${y+s}L${x-s*.7} ${y}Z" fill="#B08D3C"/>`;
    return {under:`<rect x="34" y="34" width="1012" height="1282" fill="none" stroke="#6B4A2B" stroke-width="5"/><rect x="50" y="50" width="980" height="1250" fill="none" stroke="#6B4A2B" stroke-width="2"/>`
      +diamond(34,34,14)+diamond(1046,34,14)+diamond(34,1316,14)+diamond(1046,1316,14)
      +`<circle cx="${m.cx}" cy="${m.cy}" r="${r}" fill="#FBF5E6" stroke="#B08D3C" stroke-width="6"/><circle cx="${m.cx}" cy="${m.cy}" r="${r-14}" fill="none" stroke="#B08D3C" stroke-width="2"/>`
      +`<path d="M150 ${places.tagBottom+16}H930" stroke="#B08D3C" stroke-width="2.5"/>`,over:""};
  },
  grid:({places})=>{
    const T=6,lineA=Math.round((places.tagBottom+places.band.top)/2),lineB=Math.round((places.band.bottom+places.chip.y)/2+6);
    return {under:`<rect x="40" y="40" width="1000" height="1270" fill="none" stroke="#111111" stroke-width="${T}"/>`
      +`<path d="M40 ${lineA}H1040M40 ${lineB}H1040" stroke="#111111" stroke-width="${T}"/>`
      +`<rect x="43" y="${lineA+3}" width="70" height="70" fill="#E8321E"/><path d="M${1040-120} ${lineA}V${lineA+120}H1040" fill="none" stroke="#111111" stroke-width="${T}"/>`,over:""};
  },
  gold:({places})=>{
    const G="#C9A24A",corner=78;
    const w=places.word,dy=w.y+w.h+22;
    const inner=`M${46+corner} 46H${1034-corner}M${46+corner} 1304H${1034-corner}M46 ${46+corner}V${1304-corner}M1034 ${46+corner}V${1304-corner}`;
    const fancy=(x:number,y:number,sx:number,sy:number)=>`<path d="M${x} ${y+sy*corner}Q${x} ${y} ${x+sx*corner} ${y}" fill="none" stroke="${G}" stroke-width="2"/><circle cx="${x+sx*16}" cy="${y+sy*16}" r="5" fill="${G}"/>`;
    return {under:`<rect x="28" y="28" width="1024" height="1294" fill="none" stroke="${G}" stroke-width="4"/><path d="${inner}" stroke="${G}" stroke-width="1.8"/>`
      +fancy(46,46,1,1)+fancy(1034,46,-1,1)+fancy(46,1304,1,-1)+fancy(1034,1304,-1,-1)
      +`<path d="M${540-160} ${dy}H${540-16}M${540+16} ${dy}H${540+160}" stroke="${G}" stroke-width="2"/><path d="M540 ${dy-9}L547 ${dy}L540 ${dy+9}L533 ${dy}Z" fill="${G}"/>`
      +radial("goGlow",540,(places.band.top+places.band.bottom)/2,360,"#C9A24A",.12),over:""};
  },
  watercolor:({places,seed})=>{
    const m=mascotCenter(places);
    const combos=[["#F6C9D0","#CDE8D8"],["#CFE0F2","#F7E7B4"],["#E2D3F0","#F6C9D0"]][seed%3];
    return {under:radial("wcA",m.cx,m.cy,Math.min(m.r*1.15,400),combos[0],.95)+radial("wcB",120,140,300,combos[1],.9)+radial("wcC",980,1240,320,combos[1],.8)
      +`<path d="M240 ${places.tagBottom-22}Q540 ${places.tagBottom-34} 840 ${places.tagBottom-18}" stroke="#F7E7B4" stroke-width="30" stroke-linecap="round" stroke-opacity=".7" fill="none"/>`,over:""};
  },
  ticket:({places})=>{
    const TX=70,TY=44,TW=940,TH=1262,perf=Math.round(places.chip.y-22);
    let dots="";
    for(let x=TX+30;x<TX+TW-20;x+=26)dots+=`<circle cx="${x}" cy="${perf}" r="3.5" fill="#2B2A26" fill-opacity=".55"/>`;
    return {under:`<defs><pattern id="tkDots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="2.2" fill="#fff" fill-opacity=".09"/></pattern></defs><rect width="1080" height="1350" fill="url(#tkDots)"/>`
      +`<rect x="${TX+10}" y="${TY+12}" width="${TW}" height="${TH}" rx="24" fill="#000" fill-opacity=".3"/>`
      +`<rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="24" fill="#F7EFD9"/><path d="M${TX} ${perf}H${TX+TW}V${TY+TH-24}Q${TX+TW} ${TY+TH} ${TX+TW-24} ${TY+TH}H${TX+24}Q${TX} ${TY+TH} ${TX} ${TY+TH-24}Z" fill="#EFE4C8"/>`
      +dots+`<circle cx="${TX}" cy="${perf}" r="24" fill="#1F3A3D"/><circle cx="${TX+TW}" cy="${perf}" r="24" fill="#1F3A3D"/>`
      +`<rect x="${TX+18}" y="${TY+18}" width="${TW-36}" height="${perf-TY-36}" rx="14" fill="none" stroke="#2B2A26" stroke-opacity=".5" stroke-width="2.5"/>`,over:""};
  },
  editorial:({places})=>{
    const w=places.word;
    return {under:`<path d="M64 56H1016M64 1272H1016" stroke="#111111" stroke-width="3"/><path d="M64 64H1016" stroke="#D9D9D9" stroke-width="1.5"/>`
      +`<rect x="${540-60}" y="${w.y+w.h+22}" width="120" height="7" fill="#D22B2B"/>`
      +`<circle cx="${mascotCenter(places).cx}" cy="${mascotCenter(places).cy}" r="${Math.min(mascotCenter(places).r*.95,320)}" fill="#EDEDED"/>`,over:""};
  },
  // 사진 중심: 크림 종이에 한 톤 짙은 큰 원(접시 자리)과 워드마크 아래 짧은 적갈 선.
  "photo-focus":({places})=>{
    const w=places.word,m=mascotCenter(places);
    return {under:`<rect x="${540-36}" y="${w.y+w.h+22}" width="72" height="6" rx="3" fill="#A9472A"/><circle cx="${m.cx}" cy="${m.cy}" r="${Math.min(m.r*.95,320)}" fill="#EAE0D0"/>`,over:""};
  },
  // 글 중심: 밤색 바탕에 한 톤 밝은 큰 원과 겨자 막대.
  "text-focus":({places})=>{
    const w=places.word,m=mascotCenter(places);
    return {under:`<rect x="${540-36}" y="${w.y+w.h+22}" width="72" height="8" rx="4" fill="#E9BC5C"/><circle cx="${m.cx}" cy="${m.cy}" r="${Math.min(m.r*.95,320)}" fill="#5C4844"/>`,over:""};
  },
};

// ── 내보내는 함수 ─────────────────────────────────────────────────────────────────────────
// design: 캐러셀 디자인(계열·색 조합·테마·글꼴·장식 세기). index/total: 이 카드의 장 번호와 전체 장 수(홍보 카드 포함).
// options.brandHandle: 설정의 Instagram 계정(있으면 워드마크 아래에 찍는다).
// options.contrast: 대비 검사까지 할지(무거움, 테스트·검수용). options.gridSafe: 프로필 격자(좌우 34px) 검사도 할지.
// 돌려주는 image는 1080×1350 JPEG, report는 자동 검수 결과(render/audit.ts).
export type StoreCardOptions={brandHandle?:string;contrast?:boolean;gridSafe?:boolean};
export async function renderStoreCard(design:DesignSpecInput|undefined,index:number,total:number,options:StoreCardOptions={}):Promise<{image:Buffer;report:AuditReport}> {
  const style=styleOf(design),palette=paletteOf(design),tokens=storeTokensOf(design);
  const safeTotal=Math.max(1,Math.round(total)),safeIndex=Math.min(safeTotal,Math.max(1,Math.round(index)));
  const context={typography:typographyOf(design?.titleFont,design?.bodyFont),theme:design?.theme??"classic",variant:0,palette,brandHandle:options.brandHandle,tone:design?.tone};
  const {image,report}=await auditRender(()=>withRenderContext(context,()=>drawStoreCard(style,tokens,safeIndex,safeTotal,palette)),{contrast:options.contrast??false,cover:options.gridSafe??false});
  // 내용 장과 같은 계절 소품을 홍보 카드에도 얹는다(빈 자리에만).
  return {image:await addSeasonMotif(image,report,design?.season,safeIndex),report};
}

// ── 사장님이 만든 홍보 포스터 ────────────────────────────────────────────────────────────
// assets/store/promo-card.webp가 있으면 맨 뒤 홍보 카드는 그 포스터를 그대로 쓴다(가게 이름·메뉴·주소·전화가 다 들어 있다).
// 포스터를 바꾸려면 같은 이름으로 파일만 바꿔 넣으면 된다. 없으면 위의 코드 디자인(계열별)으로 그린다.
// 4:5(1080×1350)와 비율이 다를 수 있어 잘라 내지 않고 통째로 넣는다: 높이(또는 폭)에 맞추고, 남는 가장자리는
// 같은 포스터를 크게 흐려 깐다(위아래를 자르면 아래쪽 상차림·오른쪽 접시가 잘린다).
export const STORE_POSTER_FILE=path.join(process.cwd(),"assets/store/promo-card.webp");
// 포스터를 4:5 카드로 맞춘다(같은 원본이면 다시 굽지 않게 key로 기억. 기본 포스터·올린 포스터 두 개면 충분).
const fitted=new Map<string,Promise<Buffer>>();
export function fitPoster(source:Buffer,key:string):Promise<Buffer> {
  const cached=fitted.get(key);
  if(cached)return cached;
  const job=(async()=>{
    const back=await sharp(source).resize(1080,1350,{fit:"cover"}).blur(40).modulate({brightness:.9}).toBuffer();
    const front=await sharp(source).resize(1080,1350,{fit:"inside"}).sharpen({sigma:.6,m1:.3,m2:.8}).toBuffer({resolveWithObject:true});
    return sharp(back).composite([{input:front.data,left:Math.round((1080-front.info.width)/2),top:Math.round((1350-front.info.height)/2)}]).jpeg({quality:92}).toBuffer();
  })();
  fitted.set(key,job);
  job.catch(()=>fitted.delete(key));
  if(fitted.size>4)fitted.delete(fitted.keys().next().value!);
  return job;
}
// 저장소에 들어 있는 기본 포스터(파일이 바뀌면 다시 굽는다).
export async function storePoster(file=STORE_POSTER_FILE):Promise<Buffer|null> {
  const info=await stat(file).catch(()=>null);
  if(!info?.isFile())return null;
  return fitPoster(await readFile(file),`${file}|${info.mtimeMs}`);
}
// 맨 뒤 홍보 카드: 설정에서 올린 포스터 → 기본 포스터 → 코드 디자인 순서.
export async function renderStorePromoImage(design:DesignSpecInput|undefined,index:number,total:number,options:StoreCardOptions={}):Promise<Buffer> {
  const custom=await readCustomPoster().catch(error=>{console.warn("[store-card] 올린 포스터를 읽지 못해 기본 포스터를 씁니다:",error instanceof Error?error.message:String(error));return null;});
  if(custom)return fitPoster(custom.image,`custom|${custom.updatedAt}`);
  return await storePoster().catch(()=>null)??renderStoreCardImage(design,index,total,options);
}

// 이미지만 필요할 때.
export async function renderStoreCardImage(design:DesignSpecInput|undefined,index:number,total:number,options:StoreCardOptions={}):Promise<Buffer> {
  return (await renderStoreCard(design,index,total,options)).image;
}
