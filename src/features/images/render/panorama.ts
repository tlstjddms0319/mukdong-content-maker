import sharp,{ type OverlayOptions } from "sharp";
import type { CarouselSlidePlan } from "../carousel";
import type { Palette } from "../design";
import { registerPhoto } from "./audit";
import { BODY_TITLE, COVER_TITLE, POINT, counterLayer, cueAt, slideTitle, sublineLayer, teaserLayer } from "./extraLayouts";
import { CONTENT, FONTS, MARGIN, META, brandName, finishPhoto, grainLayer, svgLayer, textLayer } from "./primitives";

// 표지+2장 파노라마(계획서 "표지+2장 파노라마 옵션").
// 가로로 긴 사진 한 장을 2160×1350으로 맞춘 뒤 왼쪽 반은 표지, 오른쪽 반은 2번째 장으로 쓴다.
// 인스타그램에서 표지를 넘기면 사진이 끊기지 않고 옆으로 이어진다.
// 두 장은 서로 다른 요청으로 따로 그려지므로, 이음선을 넘는 것(사진·그늘·가로선)은 모두 같은 계산으로 그려야 맞물린다:
//  - 사진: 같은 원본을 같은 크기(2160×1350)로 자른 뒤 반씩 떼어 낸다.
//  - 그늘: 세로 방향 그라데이션만 쓴다(가로 위치와 무관해 두 장이 똑같다).
//  - 가로선: 같은 높이에, 표지는 왼쪽 여백부터 이음선까지, 2번째 장은 이음선부터 오른쪽 여백까지.
// 글자는 이음선에서 여백(MARGIN) 이상 떨어뜨려 넘기는 중에 잘려 보이지 않게 한다.

export const PANORAMA_SIDES=["left","right"] as const;
export type PanoramaSide=typeof PANORAMA_SIDES[number];
// 파노라마로 쓸 수 있는 사진: 가로가 세로의 1.45배 이상이고 가로 1200px 이상(2160으로 늘려도 크게 흐리지 않게).
export const PANORAMA_MIN_RATIO=1.45,PANORAMA_MIN_WIDTH=1200;
export async function panoramaReady(photo:Buffer):Promise<boolean> {
  const meta=await sharp(photo).rotate().metadata().catch(()=>null);
  if(!meta?.width||!meta.height)return false;
  // EXIF 회전(세로로 찍은 사진)은 가로·세로를 바꿔 본다.
  const turned=(meta.orientation??1)>=5;
  const width=turned?meta.height:meta.width,height=turned?meta.width:meta.height;
  return width/height>=PANORAMA_MIN_RATIO&&width>=PANORAMA_MIN_WIDTH;
}

const WHITE="#ffffff";
const CORNER_Y=1350-100,LINE_Y=CORNER_Y-34;
// 두 장이 똑같이 까는 그늘(세로 방향만): 위는 채널명용으로 살짝, 아래는 제목·요점용으로 넉넉히.
const SHADE=`<defs><linearGradient id="pshade" x1="0" y1="0" x2="0" y2="1"><stop offset=".38" stop-color="#000" stop-opacity="0"/><stop offset=".62" stop-color="#000" stop-opacity=".62"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient>`
  +`<linearGradient id="ptop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".14" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`
  +`<rect width="1080" height="1350" fill="url(#pshade)"/><rect width="1080" height="1350" fill="url(#ptop)"/>`;

// 원본을 2160×1350으로 맞춘 사진에서 한쪽 반(1080×1350). 같은 원본이면 두 요청이 같은 그림을 얻는다.
async function half(input:Buffer,side:PanoramaSide):Promise<Buffer> {
  const wide=await finishPhoto(input,2160,1350);
  const piece=await sharp(wide).extract({left:side==="left"?0:1080,top:0,width:1080,height:1350}).png().toBuffer();
  registerPhoto(piece,{shape:"bleed"});
  return piece;
}

export function panoramaRenderer(side:PanoramaSide){
  return async function composePanorama(inputs:Buffer[],slide:CarouselSlidePlan,index:number,total:number,palette:Palette):Promise<Buffer> {
    const photo=await half(inputs[0],side);
    const layers:OverlayOptions[]=[];
    // 이음선을 넘어 이어지는 강조색 가로선.
    const line=side==="left"?`<path d="M${MARGIN} ${LINE_Y}H1080" stroke="${palette.highlight}" stroke-width="5"/>`:`<path d="M0 ${LINE_Y}H${1080-MARGIN}" stroke="${palette.highlight}" stroke-width="5"/>`;
    layers.push(svgLayer(SHADE+line));
    const brand=await textLayer(brandName(),{size:META,color:"#fffffff2",width:CONTENT,height:40,font:FONTS.semibold,shadow:true});
    if(side==="left"){
      // 표지: 위 왼쪽 채널명, 아래로 제목·부제, 바닥 줄에 예고 띠(왼쪽)와 "옆으로 이어져요"(오른쪽).
      const headline=await slideTitle(slide,{sizes:COVER_TITLE,color:WHITE,accent:palette.highlight,align:"left",maxHeight:420});
      const subline=await sublineLayer(slide,{color:"#fffffff0",align:"left",shadow:true});
      const teaser=await teaserLayer(slide,total,"#fffffff2",true);
      const next=await textLayer("옆으로 이어져요 ▸",{size:META,color:"#fffffff2",width:400,height:40,font:FONTS.semibold,shadow:true});
      const bottom=LINE_Y-30;
      const sublineTop=subline?bottom-subline.info.height:bottom;
      const headlineTop=(subline?sublineTop-20:bottom)-headline.info.height;
      layers.push({input:brand.data,left:MARGIN,top:64},{input:headline.data,left:MARGIN,top:headlineTop});
      if(subline)layers.push({input:subline.data,left:MARGIN,top:sublineTop});
      if(teaser&&teaser.info.width+32+next.info.width<=CONTENT)layers.push({input:teaser.data,left:MARGIN,top:CORNER_Y});
      layers.push({input:next.data,left:1080-MARGIN-next.info.width,top:CORNER_Y});
    }else{
      // 2번째 장: 아래로 제목·요점, 바닥 줄에 채널명(왼쪽)과 장 번호·넘겨 보기(오른쪽).
      const headline=await slideTitle(slide,{sizes:BODY_TITLE,color:WHITE,accent:palette.highlight,align:"left",maxHeight:260});
      const lines=slide.points.map(point=>point.trim()).filter(Boolean).slice(0,3);
      const points=lines.length?await textLayer(lines.join("\n"),{size:POINT,color:"#ffffffe6",width:CONTENT,height:400,font:FONTS.regular,spacing:10,shadow:true}):null;
      const counter=await counterLayer(index,total,"#fffffff2",true);
      const cue=index<total?await cueAt(WHITE,{backdrop:true}):null;
      const bottom=LINE_Y-30;
      const pointsTop=points?bottom-points.info.height:bottom;
      const headlineTop=(points?pointsTop-24:bottom)-headline.info.height;
      layers.push({input:headline.data,left:MARGIN,top:headlineTop});
      if(points)layers.push({input:points.data,left:MARGIN,top:pointsTop});
      layers.push({input:brand.data,left:MARGIN,top:CORNER_Y});
      const right=1080-MARGIN;
      if(cue&&brand.info.width+32+counter.info.width+24+cue.width<=CONTENT){
        const placed=cue.place(right-cue.width,CORNER_Y+4);
        layers.push(svgLayer(placed.svg),placed.layer,{input:counter.data,left:right-cue.width-24-counter.info.width,top:CORNER_Y});
      }else if(brand.info.width+32+counter.info.width<=CONTENT)layers.push({input:counter.data,left:right-counter.info.width,top:CORNER_Y});
    }
    layers.push(await grainLayer({opacity:.1}));
    return sharp(photo).composite(layers).jpeg({quality:90}).toBuffer();
  };
}
