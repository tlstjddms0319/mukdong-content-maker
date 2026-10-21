import sharp, { type OverlayOptions } from "sharp";
import { brandHandle, finishPhoto, svgLayer, textLayer } from "../render/primitives";
import { registerPhoto } from "../render/audit";
import { textureLayer } from "../decor";
import { nextCue, snap, type StyleContent } from "./shared";
import { MARGIN, ON_PHOTO, SANS, SANS_SEMI, SAVE_CHIP, SHADE, TITLE_SERIF, fitLines, logoMark, shortLines } from "./trackKit";

// 풀블리드 모양(사장님 지적 2026-10-21: "캐러셀 디자인이 못생겼다" — 액자·폴라로이드·메뉴판 같은 틀이 사진을 가리고, 갈색·겨자색 판과
// "1/3" 점선·매 장 바닥글이 앱 화면처럼 보였다). 잘 되는 음식 계정처럼 사진을 화면 가득 깔고 글자만 얹는다. 새 게시물의 기본 모양.
//   모든 장   : 사진 100% + 아래 1/3만 짙어지는 그늘 + 흰 명조 제목 한 줄(최대 두 줄) + 작은 원인 한 줄. 강조색 없음(흰 글자만).
//   장 번호   : 왼쪽 위에 얇은 "02"만. 이유 장은 제목 위에 가는 진행 막대(이유 수만큼). 큰 숫자·점선 없음.
//   바닥글    : 작은 로고 하나. "넘겨 보기"는 표지에만. 마지막 장만 "저장해 두고 다시 보세요" 알약 + 계정.
//   글 중심   : 본문 장은 표지 그림(글자 없는 원본)을 흐리고 어둡게 깔고(backdrop, 화면이 보내 준다) 글 덩어리를 한가운데 크게.
//               표지 그림이 없으면 먹색 바탕에 옅은 빛. 색 판(겨자·크림)은 쓰지 않는다.
// 색은 흰 글자·크림 보조 글·먹색 그늘 셋뿐이라 어느 게시물이든 한 계정의 피드로 모인다.
const W=1080,H=1350;
const CONTENT_W=W-MARGIN*2;
const INK=ON_PHOTO.ink,DIM=ON_PHOTO.dim;

// 차가운 사진만 살짝 데운다(photoFocus.ts와 같은 기준).
async function warmed(photo:Buffer):Promise<Buffer> {
  const stats=await sharp(photo).stats();
  if(stats.channels[0].mean-stats.channels[2].mean>45)return photo;
  const out=await sharp(photo).linear([1.03,1,.95],[4,1,-2]).png().toBuffer();
  registerPhoto(out);
  return out;
}

// 글 중심 본문의 배경: 표지 그림을 가득 채워 크게 흐리고 어둡게(글이 주인공, 그림은 분위기만).
async function blurredBackdrop(photo:Buffer):Promise<Buffer> {
  const out=await sharp(await finishPhoto(photo,W,H,{zoom:1.15})).blur(38).modulate({brightness:.5,saturation:.75}).png().toBuffer();
  registerPhoto(out);
  return out;
}

// 아래로 짙어지는 그늘(from부터 바닥까지)과 위쪽 얇은 그늘(장 번호·로고가 밝은 사진 위에서도 읽히게), 가장자리 비네트.
function shade(from:number):string {
  const span=H-from;
  return `<defs><linearGradient id="fbB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity="0"/><stop offset=".45" stop-color="${SHADE}" stop-opacity=".58"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".9"/></linearGradient>`
    +`<linearGradient id="fbT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SHADE}" stop-opacity=".42"/><stop offset="1" stop-color="${SHADE}" stop-opacity="0"/></linearGradient>`
    +`<radialGradient id="fbV" cx="50%" cy="42%" r="78%"><stop offset=".6" stop-color="${SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".22"/></radialGradient></defs>`
    +`<rect width="${W}" height="${H}" fill="url(#fbV)"/><rect width="${W}" height="200" fill="url(#fbT)"/><rect x="0" y="${from}" width="${W}" height="${span}" fill="url(#fbB)"/>`;
}

// 사진 없는 장: 먹색 바탕(또는 흐린 표지 위)에 왼쪽 위에서 비치는 옅은 빛과 비네트(평면 판처럼 보이지 않게).
function plainShade():string {
  return `<defs><radialGradient id="fbL" cx="18%" cy="12%" r="90%"><stop offset="0" stop-color="#6A5248" stop-opacity=".45"/><stop offset=".55" stop-color="#3A2B26" stop-opacity=".2"/><stop offset="1" stop-color="${SHADE}" stop-opacity="0"/></radialGradient>`
    +`<radialGradient id="fbV2" cx="50%" cy="50%" r="80%"><stop offset=".55" stop-color="${SHADE}" stop-opacity="0"/><stop offset="1" stop-color="${SHADE}" stop-opacity=".5"/></radialGradient></defs>`
    +`<rect width="${W}" height="${H}" fill="url(#fbL)"/><rect width="${W}" height="${H}" fill="url(#fbV2)"/>`;
}

// 이유 진행 막대: 이유 수만큼 가는 막대, 지금까지는 흰색, 나머지는 반투명.
function progress(x:number,y:number,reason:{n:number;of:number}):string {
  const seg=56,gap=10,h=6;
  return Array.from({length:reason.of},(_,i)=>`<rect x="${x+i*(seg+gap)}" y="${y}" width="${seg}" height="${h}" rx="3" fill="${INK}" fill-opacity="${i<reason.n?1:.32}"/>`).join("");
}

const titleOf=(content:StyleContent,sizes:number[],maxLines:number)=>fitLines(content.headline,{sizes,width:CONTENT_W,font:TITLE_SERIF,color:INK,maxLines,prefer:sizes[0]>=100?"size":"lines",spacing:size=>Math.round(size*.05),letterSpacing:size=>-size*.015});
const lineOf=(text:string,size:number)=>textLayer(text,{size,color:DIM,width:CONTENT_W,height:4000,font:SANS,spacing:10,shadow:true});

// photo: 이 장의 사진(사진 중심) 또는 표지 그림(글 중심 본문, backdrop=true면 흐려서 깐다).
async function card(photo:Buffer|undefined,content:StyleContent,index:number,backdrop=false):Promise<Buffer> {
  const plain=!photo||backdrop;
  const base=photo?backdrop?await blurredBackdrop(photo):await warmed(await finishPhoto(photo,W,H,{zoom:1.04})):null;
  // 사진 없는 장(글 중심 본문)은 글이 주인공이라 제목을 더 크게, 세 줄까지.
  const title=await titleOf(content,content.cover?[104,96,88,82,76]:plain?[100,92,84,78,72]:[84,78,72,66,60],plain?3:2);
  const line=content.cover?content.subline:shortLines(content,1)[0];
  const sub=line?await lineOf(line,content.cover||plain?46:40):null;
  const chip=content.last?await textLayer(SAVE_CHIP,{size:34,color:SHADE,width:900,height:80,font:SANS_SEMI}):null;
  const padX=26,padY=10,chipH=chip?chip.info.height+padY*2:0;
  const bars=!content.cover&&!content.last&&content.reason?content.reason:null;
  // 바닥: 작은 로고(마지막 장은 로고 + 계정), 표지는 오른쪽에 "넘겨 보기".
  const LOGO=content.last?56:48;
  const logo=await logoMark(LOGO,"#F5EFE5");
  const handle=content.last&&brandHandle()?await textLayer(brandHandle(),{size:32,color:DIM,width:700,height:60,font:SANS_SEMI,shadow:true}):null;
  const cue=content.cover?await nextCue(INK,36):null;
  const footH=Math.max(LOGO,handle?.info.height??0,cue?.height??0);
  const footTop=H-MARGIN-footH;
  const markH=chip?chipH:bars?6:0,markGap=chip?28:bars?30:0;
  const blockH=(markH?markH+markGap:0)+title.layer.info.height+(sub?20+sub.info.height:0);
  // 사진 장은 바닥글 위에, 사진 없는 장은 화면 한가운데(빈 판 아래에 글만 깔리면 허전하다).
  const blockTop=plain?Math.round(MARGIN+60+(footTop-MARGIN-60-blockH)/2):footTop-52-blockH;
  const markTop=blockTop,titleTop=blockTop+(markH?markH+markGap:0),subTop=titleTop+title.layer.info.height+20;
  let svg=plain?plainShade():shade(Math.max(360,markTop-260));
  const layers:OverlayOptions[]=[];
  if(base)layers.push({input:base,left:0,top:0});
  else{const linen=await textureLayer("linen",{opacity:.14});if(linen)layers.push(linen);}
  // 왼쪽 위: 표지는 로고(96), 본문은 얇은 장 번호.
  const marks:OverlayOptions[]=[];
  if(content.cover){marks.push({input:await logoMark(96,"#F5EFE5"),left:MARGIN,top:MARGIN});}
  else{const folio=await textLayer(String(index).padStart(2,"0"),{size:30,color:DIM,width:120,height:60,font:SANS_SEMI,features:"tnum",letterSpacing:2,shadow:true});marks.push({input:folio.data,left:MARGIN,top:MARGIN});}
  if(chip){svg+=`<rect x="${MARGIN}" y="${markTop}" width="${chip.info.width+padX*2}" height="${chipH}" rx="${chipH/2}" fill="${INK}" fill-opacity=".94"/>`;marks.push({input:chip.data,left:MARGIN+padX,top:markTop+padY});}
  else if(bars)svg+=progress(MARGIN,markTop,bars);
  const footMid=footTop+footH/2;
  marks.push({input:logo,left:MARGIN,top:Math.round(footMid-LOGO/2)});
  if(handle)marks.push({input:handle.data,left:MARGIN+LOGO+16,top:Math.round(footMid-handle.info.height/2)});
  if(cue){const x=W-MARGIN-cue.width,y=Math.round(footMid-cue.height/2);svg+=cue.arrow(x,y);marks.push({input:cue.label.data,left:x,top:y});}
  layers.push(svgLayer(svg),...marks,{input:title.layer.data,left:MARGIN,top:titleTop});
  if(sub)layers.push({input:sub.data,left:MARGIN,top:subTop});
  return sharp({create:{width:W,height:H,channels:3,background:"#221A17"}}).composite(snap(layers)).jpeg({quality:93}).toBuffer();
}

export const renderFullBleedPhoto=(photo:Buffer,content:StyleContent,index:number)=>card(photo,content,index);
// 글 중심: 표지는 사진 그대로, 본문은 표지 그림을 흐린 배경으로(없으면 먹색).
export const renderFullBleedText=(photo:Buffer|undefined,content:StyleContent,index:number)=>card(photo,content,index,!content.cover&&Boolean(photo));
