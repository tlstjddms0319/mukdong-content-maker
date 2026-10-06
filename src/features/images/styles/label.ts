import sharp, { type OverlayOptions } from "sharp";
import { STORE_NAME } from "../slideLayout";
import { registerPhoto } from "../render/audit";
import { brandName, svg, svgLayer, textLayer, croppedPhoto, finishPhoto, type CardRenderer, type Layer } from "../render/primitives";
import { MIN_STROKE, STYLE_FONTS, closingBlock, contentOf, emphasisOf, fitText, nextCue, snap } from "./shared";
import { seeded } from "./handDrawn";

// 막걸리·전통주 병 라벨: 크림색 종이에 이중 테두리 액자와 모서리 꽃무늬, 맨 위 진홍 리본 속 가게 이름,
// 그 아래 자간 넓은 한글 눈썹 글자(묵동 · 홍어 · 막걸리). 사진은 황금 톱니 링을 두른 원형 메달(표지·비교 장) 또는 아치 창(본문 장)에 넣고,
// 제목은 현대 명조(함렛)를 조금 조여 가운데 정렬해 아래에 가는 두 줄과 마름모 장식선을 단다. 요점 앞에는 붉은 마름모.
// 황금색은 링·선·모서리 장식에만 쓰고 글자는 모두 진갈색으로 찍어 전통주 라벨답게 차분하게 읽히게 한다.
const PAPER="#F3EAD6",PAPER_LIGHT="#FBF5E6",FRAME="#6B4A2B",INK="#2B1D12",BODY="#3A2A1A";
const RIBBON="#9E2B25",RIBBON_DARK="#7A1F1A",RIBBON_FOLD="#4A120F",GOLD="#B08D3C",GOLD_DEEP="#8C6B2F";
// 눈썹 글자·키워드처럼 작은 보조 글자는 황갈색을 조금 더 어둡게 써서 크림색 종이와 4:1 이상 대비를 지킨다.
const EYEBROW="#775826";
// 눈썹 글자: 예전 영문 대문자 나열 대신 한글로(사장님 결정). 띄어 쓴 글자 대신 letterSpacing으로 자간을 넓힌다.
const EYEBROW_TEXT="묵동 · 홍어 · 막걸리";
// 제목 핵심어 강조색: 리본 진홍. 크림색 종이 위 6:1 이상이라 큰 글자 3:1 기준을 넉넉히 넘는다.
const EMPHASIS=RIBBON;
// 제목 글꼴: 함렛(현대 명조). 획이 굵어 조금 조이면(−2.5%) 라벨 글자처럼 단단한 덩어리가 된다.
const TITLE_FONT=STYLE_FONTS.modernSerif,titleTracking=(size:number)=>-size*.025;
// 액자: 바깥 굵은 선(34px)과 안쪽 가는 선(50px). 내용은 좌우 M 안쪽에 두고, 바닥 꼬리표 위(CONTENT_BOTTOM)까지만 쓴다.
const OUTER=34,INNER=50,M=84,W=1080-M*2,CONTENT_BOTTOM=1212,FOOTER_CY=1262;

const diamond=(x:number,y:number,r:number,fill:string)=>`<path d="M${x} ${y-r}L${x+r*.72} ${y}L${x} ${y+r}L${x-r*.72} ${y}Z" fill="${fill}"/>`;
// 네 갈래 별(메달 위 ✦ 장식).
const star=(x:number,y:number,r:number,fill:string)=>`<path d="M${x} ${y-r}Q${x} ${y} ${x+r} ${y}Q${x} ${y} ${x} ${y+r}Q${x} ${y} ${x-r} ${y}Q${x} ${y} ${x} ${y-r}Z" fill="${fill}"/>`;

// 종이 바탕: 가는 종이 결(고주파 잡음) + 큰 얼룩(저주파) + 가장자리 바램. 그 위에 이중 테두리 액자와 모서리 장식.
function paper(seed:number):string {
  return `<defs>`
    +`<filter id="lbl-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .30  0 0 0 0 .14  0 0 0 .11 0"/></filter>`
    +`<filter id="lbl-mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="2" seed="${seed+3}"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .40  0 0 0 0 .20  0 0 0 .14 0"/></filter>`
    +`<filter id="lbl-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>`
    +`<radialGradient id="lbl-age" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="${FRAME}" stop-opacity="0"/><stop offset="100%" stop-color="${FRAME}" stop-opacity=".15"/></radialGradient>`
    +`</defs>`
    +`<rect width="1080" height="1350" filter="url(#lbl-mottle)"/><rect width="1080" height="1350" filter="url(#lbl-grain)"/><rect width="1080" height="1350" fill="url(#lbl-age)"/>`
    +`<rect x="${OUTER}" y="${OUTER}" width="${1080-OUTER*2}" height="${1350-OUTER*2}" fill="none" stroke="${FRAME}" stroke-width="6"/>`
    +`<rect x="${INNER}" y="${INNER}" width="${1080-INNER*2}" height="${1350-INNER*2}" fill="none" stroke="${FRAME}" stroke-width="${MIN_STROKE}" opacity=".85"/>`
    +corners();
}
// 네 모서리: 바깥 선 교차점의 마름모(속이 빈 듯 종이색 작은 마름모를 겹침)와 안쪽 모서리의 네 잎 꽃무늬 + 짧은 줄기.
function corners():string {
  let out="";
  for(const [x,sx] of [[OUTER,1],[1080-OUTER,-1]] as const)for(const [y,sy] of [[OUTER,1],[1350-OUTER,-1]] as const){
    out+=diamond(x,y,14,FRAME)+diamond(x,y,5,PAPER);
    const fx=x+sx*42,fy=y+sy*42;
    out+=[[0,-8],[8,0],[0,8],[-8,0]].map(([dx,dy])=>`<circle cx="${fx+dx}" cy="${fy+dy}" r="5.5" fill="${GOLD}"/>`).join("")+`<circle cx="${fx}" cy="${fy}" r="3" fill="${RIBBON}"/>`;
    out+=`<path d="M${fx+sx*15} ${fy}H${fx+sx*34}M${fx} ${fy+sy*15}V${fy+sy*34}" stroke="${GOLD_DEEP}" stroke-width="${MIN_STROKE}" stroke-linecap="round"/>`;
  }
  return out;
}
// 진홍 리본: 띠 뒤로 양 끝이 조금 아래로 처진 꼬리(끝은 제비꼬리 모양), 띠 아래 모서리에 접힌 자리의 어두운 삼각형, 띠 안쪽에 가는 금선.
function ribbon(cx:number,cy:number,w:number,h:number):string {
  const x0=cx-w/2,x1=cx+w/2,tail=48,drop=10,yb=cy+h/2;
  const tails=([-1,1] as const).map(dir=>{
    const near=dir<0?x0+16:x1-16,far=dir<0?x0-tail:x1+tail,notch=far-dir*18,y0=cy-h/2+drop,y1=yb+drop;
    return `<polygon points="${near},${y0} ${far},${y0} ${notch},${cy+drop} ${far},${y1} ${near},${y1}" fill="${RIBBON_DARK}"/>`;
  }).join("");
  return tails
    +`<polygon points="${x0},${yb} ${x0+16},${yb} ${x0+16},${yb+drop}" fill="${RIBBON_FOLD}"/><polygon points="${x1},${yb} ${x1-16},${yb} ${x1-16},${yb+drop}" fill="${RIBBON_FOLD}"/>`
    +`<rect x="${x0}" y="${cy-h/2}" width="${w}" height="${h}" fill="${RIBBON}"/>`
    +`<rect x="${x0+5}" y="${cy-h/2+5}" width="${w-10}" height="${h-10}" fill="none" stroke="${GOLD}" stroke-width="${MIN_STROKE}" opacity=".8"/>`;
}
// 제목 아래 장식선: 가는 두 줄(아래 줄은 짧고 옅게) 사이를 비우고 가운데 붉은 마름모.
function titleRule(cx:number,y:number,w:number):string {
  return `<path d="M${cx-w/2} ${y}H${cx-26}M${cx+26} ${y}H${cx+w/2}" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`
    +`<path d="M${cx-w/2+30} ${y+8}H${cx-34}M${cx+34} ${y+8}H${cx+w/2-30}" stroke="${FRAME}" stroke-width="${MIN_STROKE}" opacity=".55"/>`
    +diamond(cx,y+3,10,RIBBON)+diamond(cx,y+3,3.5,PAPER);
}
// 요점 사이 장식선(⸺ ◆ ⸺): 메뉴판처럼 항목을 나눈다.
const separator=(cx:number,y:number)=>`<path d="M${cx-110} ${y}H${cx-26}M${cx+26} ${y}H${cx+110}" stroke="${GOLD_DEEP}" stroke-width="${MIN_STROKE}" stroke-linecap="round" opacity=".9"/>`+diamond(cx,y,7,RIBBON);

// 원형 메달. R은 사진 반지름, s는 작은 메달(비교 장)에서 링 두께를 줄이는 비율.
// 바깥쪽부터: 구슬처럼 점점이 찍힌 링 → 황금 톱니 → 종이색 원판 → (사진) → 황금 굵은 링과 가는 갈색 링.
// 사진 가장자리를 덮어야 하는 링은 over(사진 위)에, 나머지는 under(사진 아래)에 그린다.
const medalExtent=(R:number,s:number)=>Math.round(R+42*s);
function medalUnder(cx:number,cy:number,R:number,s:number):string {
  const teeth=Math.round(44+R/8);
  const points=Array.from({length:teeth*2},(_,i)=>{const a=(Math.PI*i)/teeth,k=i%2?R+16*s:R+26*s;return `${(cx+Math.cos(a)*k).toFixed(1)},${(cy+Math.sin(a)*k).toFixed(1)}`;}).join(" ");
  return `<circle cx="${cx}" cy="${cy+10}" r="${R+26*s}" fill="${BODY}" opacity=".16" filter="url(#lbl-soft)"/>`
    +`<circle cx="${cx}" cy="${cy}" r="${R+40*s}" fill="none" stroke="${GOLD_DEEP}" stroke-width="${3*s}" stroke-dasharray="1 ${9*s}" stroke-linecap="round" opacity=".9"/>`
    +`<polygon points="${points}" fill="${GOLD}"/>`
    +`<circle cx="${cx}" cy="${cy}" r="${R+14*s}" fill="${PAPER_LIGHT}" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`;
}
function medalOver(cx:number,cy:number,R:number,s:number):string {
  return `<circle cx="${cx}" cy="${cy}" r="${R+1.25}" fill="none" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`
    +`<circle cx="${cx}" cy="${cy}" r="${R+6.5*s}" fill="none" stroke="${GOLD}" stroke-width="${9*s}"/>`
    +`<circle cx="${cx}" cy="${cy}" r="${R+12*s}" fill="none" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`;
}
// 메달 속 사진: 원형으로 자른다. 예전의 탈채도(.92)는 홍어 살을 탁하게 만들어 뺐다(종이 느낌은 테두리·질감이 맡는다).
// 큰 원 안에 접시 전체가 들어가면 음식이 작아 보이므로 zoom으로 조금 당겨(접사) 자른다. croppedPhoto 결과는 자동으로 검수에 등록된다.
const medalPhoto=(input:Buffer,R:number,zoom=1)=>croppedPhoto(input,R*2,R*2,0,{circle:true,zoom});

// 아치 창(위가 둥근 창) 사진: 직사각형 위에 반원을 얹은 마스크로 자른다.
const archPath=(x:number,y:number,w:number,h:number)=>{const r=w/2;return `M${x} ${y+r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h}H${x}Z`;};
async function archPhoto(input:Buffer,width:number,height:number):Promise<Buffer> {
  const w=Math.round(width),h=Math.round(height);
  // 탈채도 없이 온기만 살짝(파랑 −4%).
  const photo=await sharp(await finishPhoto(input,w,h)).linear([1.02,1,.96],[3,1,-3]).png().toBuffer();
  const shaped=await sharp(photo).composite([{input:svg(w,h,`<path d="${archPath(0,0,w,h)}" fill="#fff"/>`),blend:"dest-in"}]).png().toBuffer();
  // 마스크를 씌운 새 버퍼는 자동 등록되지 않으므로 직접 등록한다(검수의 사진 면적 측정).
  registerPhoto(shaped);
  return shaped;
}
// 아치 창 테두리: 황금 굵은 선 + 바깥 가는 갈색 선(이중 테두리). 꼭대기 장식은 바로 위 제목 장식선의 마름모와 겹쳐 보여 두지 않는다.
function archFrame(x:number,y:number,w:number,h:number):{under:string;over:string} {
  return {
    under:`<path d="${archPath(x,y+8,w,h)}" fill="${BODY}" opacity=".16" filter="url(#lbl-soft)"/>`,
    over:`<path d="${archPath(x,y,w,h)}" fill="none" stroke="${GOLD}" stroke-width="6"/><path d="${archPath(x-9,y-9,w+18,h+18)}" fill="none" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`,
  };
}

// 요점 글자(40px 명조). 사진 장에서 앞에 붙는 붉은 마름모 자리를 비워 둔다.
const pointText=(value:string,size:number,width:number,align:"left"|"centre")=>textLayer(value,{size,color:BODY,width,height:size*5,font:STYLE_FONTS.serif,align,spacing:6});
const stackHeight=(layers:Layer[],gap:number)=>layers.reduce((sum,layer)=>sum+layer.info.height,0)+Math.max(0,layers.length-1)*gap;

export const renderLabel:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const rand=seeded(index*31+(slide.variant??0));
  const layers:OverlayOptions[]=[];
  let deco=paper(Math.floor(rand()*90)+1),over="";
  const shots=inputs.slice(0,2);
  const emphasis=emphasisOf(content,EMPHASIS);

  // ── 맨 위: 리본 속 가게 이름, 그 아래 한글 눈썹 글자 ──
  const ribbonH=content.cover?66:58;
  const ribbonText=await textLayer(STORE_NAME,{size:content.cover?36:32,color:"#FFFFFF",width:500,height:80,font:STYLE_FONTS.serifHeavy});
  const ribbonCy=INNER+36+ribbonH/2;
  deco+=ribbon(540,ribbonCy,ribbonText.info.width+104,ribbonH);
  layers.push({input:ribbonText.data,left:540-ribbonText.info.width/2,top:ribbonCy-ribbonText.info.height/2});
  const eyebrowSize=26;
  const eyebrow=await textLayer(EYEBROW_TEXT,{size:eyebrowSize,color:EYEBROW,width:960,height:60,font:STYLE_FONTS.serifHeavy,align:"centre",letterSpacing:eyebrowSize*.32});
  const eyebrowTop=ribbonCy+ribbonH/2+10+20;
  layers.push({input:eyebrow.data,left:540-eyebrow.info.width/2,top:eyebrowTop});
  // 눈썹 글자 양옆 짧은 금선: 영문 나열보다 짧아진 한글 눈썹이 허전하지 않게 라벨의 띠 문양처럼 잡아 준다.
  const eyebrowCy=eyebrowTop+eyebrow.info.height/2,ex0=540-eyebrow.info.width/2-22,ex1=540+eyebrow.info.width/2+22;
  deco+=`<path d="M${ex0-70} ${eyebrowCy}H${ex0}M${ex1} ${eyebrowCy}H${ex1+70}" stroke="${GOLD_DEEP}" stroke-width="${MIN_STROKE}" stroke-linecap="round"/>`+diamond(ex0-78,eyebrowCy,5,RIBBON)+diamond(ex1+78,eyebrowCy,5,RIBBON);

  // ── 바닥글을 먼저 재서(꼬리표 폭) 넘겨 보기 자리를 정한다 ──
  const brand=await fitText(brandName(),{sizes:[28,26],width:640,maxHeight:44,color:BODY,font:STYLE_FONTS.serif});
  const folio=await textLayer(`No. ${index}/${total}`,{size:32,color:FRAME,width:220,height:48,font:STYLE_FONTS.condensed,features:"tnum"});
  const padL=48,mid=30,padR=30;
  const tagW=padL+brand.info.width+mid+folio.info.width+padR,tagH=54,tagX=Math.round(540-tagW/2);
  // 넘겨 보기: 표지·마지막 장이 아닐 때만. 꼬리표 오른쪽에 자리가 있으면 같은 줄에, 계정이 길어 꼬리표가 넓으면 꼬리표 위 오른쪽에.
  const cue=!content.cover&&!content.last?await nextCue(FRAME,26):null;
  // 오른쪽 끝은 모서리 꽃무늬(안쪽 42px)에 닿지 않게 본문 여백보다 30px 더 안쪽에서 끝낸다.
  const cueX=1080-M-30-(cue?.width??0),cueInline=!!cue&&tagX+tagW+24<=cueX;
  const cueY=cue?(cueInline?Math.round(FOOTER_CY-cue.height/2):FOOTER_CY-tagH/2-14-cue.height):0;
  // 마지막 장 명함: 꼬리표 바로 위에 두고, 그 높이만큼 본문 덩어리 자리를 미리 뺀다.
  const closing=content.last?await closingBlock({width:W,color:INK,accent:RIBBON,font:TITLE_FONT}):null;
  const CLOSING_GAP=44;
  const contentBottom=closing?CONTENT_BOTTOM-closing.height-CLOSING_GAP:cue&&!cueInline?cueY-12:CONTENT_BOTTOM;
  // 제목·사진·요점 덩어리가 들어갈 자리. 남는 공간은 덩어리를 세로 가운데에 두어 위아래가 비지 않게 한다.
  const y0=eyebrowTop+eyebrow.info.height+30;
  const avail=contentBottom-y0;
  // 마지막 장은 명함 자리를 빼고도 들어가도록 요점·사진을 먼저 작게 한다(요점 수를 줄이는 건 그 다음).
  const tight=!!closing;

  if(content.kind==="cover"){
    // ── 표지: 큰 원형 메달 사진 → 큰 제목 → 부제 → 장식선 → ✦ 예고 띠 ✦ 줄 ──
    // 사진을 주인공으로: 메달 위 별 장식은 예고 줄 양옆으로 옮기고, 메달 링은 조금 얇게(s=.75) 해 지름을 키운다.
    // 제목 상한은 84px(96이면 두 줄 제목이 메달 자리를 먹는다). 제목 maxHeight는 그대로 둬 긴 제목이 몰래 줄지 않게 한다.
    const title=await fitText(content.headline,{sizes:[84,76,68],width:888,maxHeight:320,color:INK,font:TITLE_FONT,align:"centre",spacing:10,emphasis,letterSpacing:titleTracking});
    // 키워드 줄 자리에 예고 띠(이 뒤에 무엇이 나오는지)를 쓴다. 예고가 없으면 예전처럼 키워드.
    const line=content.teaser||(content.keywords.length?content.keywords.join("  ·  "):"묵동  ·  홍어  ·  막걸리");
    const kw=await textLayer(line,{size:content.teaser?28:30,color:EYEBROW,width:760,height:50,font:STYLE_FONTS.serif,align:"centre"});
    const sub=content.subline?await textLayer(content.subline,{size:34,color:BODY,width:840,height:56,font:STYLE_FONTS.serif,align:"centre"}):null;
    // 표지는 눈썹 글자 바로 아래(10px)부터 쓴다: 메달 꼭대기는 가운데 한 점만 닿으므로 좁아도 답답하지 않다.
    const top=y0-20,room=CONTENT_BOTTOM-top;
    const s=.75,ring=Math.round(42*s);
    const afterMedal=16,ruleGap=16,afterRule=24,subGap=10;
    const fixedWithout=ring*2+afterMedal+title.info.height+ruleGap+14+afterRule+kw.info.height;
    // 부제는 메달 지름이 360 아래로 내려가야 할 만큼 자리가 없으면 뺀다(사진이 주인공).
    const useSub=!!sub&&room-fixedWithout-sub.info.height-subGap>=360;
    const fixed=fixedWithout+(useSub&&sub?sub.info.height+subGap:0);
    // 메달 반지름은 "남는 높이"에서 역산한다: 링 두께·제목·부제·장식선·예고 줄을 뺀 나머지가 지름. 상한 330(지름 660).
    const R=Math.max(170,Math.min(330,Math.floor((room-fixed)/2)));
    let y=top+Math.max(0,Math.floor((room-fixed-R*2)/2));
    const cy=y+ring+R;
    deco+=medalUnder(540,cy,R,s);
    layers.push({input:await medalPhoto(shots[0],R,1.2),left:540-R,top:cy-R});
    over+=medalOver(540,cy,R,s);
    y=cy+R+ring+afterMedal;
    layers.push({input:title.data,left:540-title.info.width/2,top:y});
    y+=title.info.height;
    if(useSub&&sub){y+=subGap;layers.push({input:sub.data,left:540-sub.info.width/2,top:y});y+=sub.info.height;}
    y+=ruleGap;
    deco+=titleRule(540,y+4,Math.min(720,Math.max(title.info.width,useSub&&sub?sub.info.width:0)+80));
    y+=14+afterRule;
    layers.push({input:kw.data,left:540-kw.info.width/2,top:y});
    // ✦ 예고 ✦: 예전에 메달 위에 있던 별을 예고 줄 양옆에 단다.
    const ky=y+kw.info.height/2;
    for(const sx of [540-kw.info.width/2-30,540+kw.info.width/2+30])deco+=star(sx,ky,13,GOLD)+star(sx,ky,4.5,RIBBON);
  }else{
    // ── 본문 장 공통: 제목 + 장식선 ──
    const textOnly=content.kind==="text";
    const title=await fitText(content.headline,{sizes:textOnly?(tight?[76,68,60]:[92,84,76,68,60]):[64,60,56],width:W,maxHeight:textOnly?(tight?200:260):180,color:INK,font:TITLE_FONT,align:"centre",spacing:8,emphasis,letterSpacing:titleTracking});
    const ruleGap=18,ruleH=14,afterRule=textOnly?40:36;
    const placeTitle=(top:number)=>{
      layers.push({input:title.data,left:540-title.info.width/2,top});
      deco+=titleRule(540,top+title.info.height+ruleGap+4,Math.min(640,title.info.width+60));
      return top+title.info.height+ruleGap+ruleH+afterRule;
    };
    const titleBlock=title.info.height+ruleGap+ruleH+afterRule;

    if(content.kind==="photo"){
      // ── 사진 1장: 아치 창 사진, 아래 붉은 마름모 요점(최대 4개). 요점이 길면 사진을 줄이고, 그래도 모자라면 요점을 3개로 ──
      const gap=14,indent=44,minPH=tight?240:300;
      let points=await Promise.all(content.points.slice(0,4).map(point=>pointText(point,40,W-indent,"left")));
      const roomFor=(list:Layer[])=>avail-titleBlock-(list.length?stackHeight(list,gap)+34:0);
      // 마지막 장: 요점 수를 줄이기 전에 글자를 36px로 줄여 본다.
      if(tight&&roomFor(points)<minPH)points=await Promise.all(content.points.slice(0,4).map(point=>pointText(point,36,W-indent,"left")));
      while(roomFor(points)<minPH&&points.length>(tight?2:3))points=points.slice(0,-1);
      // 아치 창은 4:5 세로형(폭=높이×.8)에 가깝게: 창이 화면을 위아래로 채운다. 요점이 길어 창이 낮아지면 폭 480은 지켜 음식이 작아지지 않게.
      const PH=Math.max(minPH,Math.min(760,roomFor(points)));
      const PW=Math.max(480,Math.min(640,Math.round(PH*.8)));
      const block=titleBlock+PH+(points.length?stackHeight(points,gap)+34:0);
      let y=placeTitle(y0+Math.max(0,Math.floor((avail-block)/2)));
      const x=540-PW/2;
      const frame=archFrame(x,y,PW,PH);
      deco+=frame.under;over+=frame.over;
      layers.push({input:await archPhoto(shots[0],PW,PH),left:x,top:y});
      y+=PH+34;
      for(const point of points){
        deco+=diamond(M+14,y+24,9,RIBBON);
        layers.push({input:point.data,left:M+indent,top:y});
        y+=point.info.height+gap;
      }
    }else if(content.kind==="photos"){
      // ── 사진 2장: 작은 원형 메달 두 개를 나란히, 각 메달 아래 꼬리표 글자(키워드 또는 하나·둘), 그 아래 요점(최대 3개) ──
      const gap=14,indent=44;
      const tags=await Promise.all(shots.map((_,i)=>textLayer(content.keywords[i]??["하나","둘"][i],{size:30,color:INK,width:380,height:44,font:STYLE_FONTS.serifHeavy,align:"centre"})));
      const tagH=Math.max(...tags.map(tag=>tag.info.height));
      const s=.72,minR=tight?110:140;
      const radiusFor=(pointsH:number)=>Math.floor((avail-titleBlock-pointsH-16-tagH)/2)-42*s;
      let points=await Promise.all(content.points.slice(0,3).map(point=>pointText(point,40,W-indent,"left")));
      const pointsHOf=(list:Layer[])=>list.length?stackHeight(list,gap)+30:0;
      // 마지막 장: 메달을 줄이고, 그래도 모자라면 요점 글자 → 요점 수 순서로 줄인다.
      if(tight&&radiusFor(pointsHOf(points))<minR)points=await Promise.all(content.points.slice(0,3).map(point=>pointText(point,36,W-indent,"left")));
      while(tight&&radiusFor(pointsHOf(points))<minR&&points.length>1)points=points.slice(0,-1);
      const pointsH=pointsHOf(points);
      // 메달 둘레(톱니·구슬 링)까지 합쳐 가로 912 안에 둘이 들어가도록 반지름 상한을 180으로 두고, 세로는 남는 자리에 맞춘다.
      const R=Math.max(minR,Math.min(180,radiusFor(pointsH)));
      const ext=medalExtent(R,s);
      const block=titleBlock+ext*2+16+tagH+pointsH;
      let y=placeTitle(y0+Math.max(0,Math.floor((avail-block)/2)));
      const cy=y+ext,centers=[540-ext-18,540+ext+18];
      for(const [i,shot] of shots.entries()){
        deco+=medalUnder(centers[i],cy,R,s);
        layers.push({input:await medalPhoto(shot,R),left:centers[i]-R,top:cy-R});
        over+=medalOver(centers[i],cy,R,s);
        layers.push({input:tags[i].data,left:centers[i]-tags[i].info.width/2,top:cy+ext+16});
      }
      // 두 메달 사이 작은 마름모: "둘을 견주어 본다"는 표시.
      deco+=diamond(540,cy,9,GOLD)+diamond(540,cy,3.5,PAPER);
      y=cy+ext+16+tagH+30;
      for(const point of points){
        deco+=diamond(M+14,y+24,9,RIBBON);
        layers.push({input:point.data,left:M+indent,top:y});
        y+=point.info.height+gap;
      }
    }else{
      // ── 글자만: 큰 제목 아래 요점을 메뉴판처럼 가운데 정렬하고 사이사이에 ⸺ ◆ ⸺ 장식선. 덩어리를 세로 가운데에 ──
      const sepH=tight?36:44;
      let list=content.points.slice(0,4);
      // 들어가는 가장 큰 요점 크기(56→52→48→46)를 고른다. 모든 요점을 같은 크기로 써야 메뉴판처럼 가지런하다.
      // 마지막 장은 명함 자리를 뺀 만큼 42·40px까지 내려 보고, 그래도 안 되면 요점을 하나씩 뺀다.
      let points:Layer[]=[];
      const fits=()=>titleBlock+stackHeight(points,sepH)+sepH<=avail;
      for(;;){
        for(const size of tight?[52,48,46,42,40]:[56,52,48,46]){
          points=await Promise.all(list.map(point=>pointText(point,size,W-60,"centre")));
          if(fits())break;
        }
        if(fits()||list.length<=1)break;
        list=list.slice(0,-1);
      }
      const block=titleBlock+stackHeight(points,sepH)+(points.length?sepH:0);
      // 남는 공간은 요점 사이 간격으로 조금 나눠 주고(최대 +56), 나머지는 위아래로 반씩.
      const extra=Math.max(0,avail-block);
      const spread=points.length?Math.min(56,Math.floor(extra/(points.length+1))):0;
      let y=placeTitle(y0+Math.max(0,Math.floor((avail-block-spread*points.length)/2)));
      for(const [i,point] of points.entries()){
        layers.push({input:point.data,left:540-point.info.width/2,top:y});
        y+=point.info.height+Math.round((sepH+spread)/2);
        // 마지막 요점 아래 장식선은 명함 위 장식선과 겹쳐 보이므로 마지막 장에서는 뺀다.
        if(!(closing&&i===points.length-1))deco+=separator(540,y);
        y+=sepH+spread-Math.round((sepH+spread)/2);
      }
    }
  }

  // ── 마지막 장 명함: 장식선 아래 가게 이름(워드마크)·계정·"저장해 두고 다시 보세요" 칩 ──
  if(closing){
    let cy=CONTENT_BOTTOM-closing.height;
    deco+=separator(540,cy-CLOSING_GAP/2);
    layers.push({input:closing.wordmark.data,left:540-closing.wordmark.info.width/2,top:cy});
    cy+=closing.wordmark.info.height;
    if(closing.handle){cy+=8;layers.push({input:closing.handle.data,left:540-closing.handle.info.width/2,top:cy});cy+=closing.handle.info.height;}
    cy+=18+12;
    const chipX=Math.round(540-closing.chip.info.width/2);
    deco+=closing.chipSvg(chipX,cy);
    layers.push({input:closing.chip.data,left:chipX,top:cy});
  }

  // ── 바닥글: 둥근 꼬리표(왼쪽에 끈 구멍) 안에 가게 이름·계정과 "No. 장/전체" ──
  deco+=`<rect x="${tagX}" y="${FOOTER_CY-tagH/2}" width="${tagW}" height="${tagH}" rx="27" fill="${PAPER_LIGHT}" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`
    +`<circle cx="${tagX+23}" cy="${FOOTER_CY}" r="5" fill="none" stroke="${FRAME}" stroke-width="${MIN_STROKE}"/>`
    +diamond(tagX+padL+brand.info.width+mid/2,FOOTER_CY,5,GOLD);
  layers.push({input:brand.data,left:tagX+padL,top:FOOTER_CY-brand.info.height/2});
  layers.push({input:folio.data,left:tagX+padL+brand.info.width+mid,top:FOOTER_CY-folio.info.height/2+1});
  if(cue){
    layers.push({input:cue.label.data,left:cueX,top:cueY});
    over+=cue.arrow(cueX,cueY);
  }

  layers.unshift(svgLayer(deco));
  layers.push(svgLayer(over));
  return sharp({create:{width:1080,height:1350,channels:3,background:PAPER}}).composite(snap(layers)).jpeg({quality:92}).toBuffer();
};
