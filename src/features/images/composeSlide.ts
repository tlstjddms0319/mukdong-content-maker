import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { access } from "node:fs/promises";
import type { CarouselSlidePlan } from "./carousel";

function escapeXml(value:string):string {
  return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]!);
}

const fontfile=path.join(process.cwd(),"assets/fonts/NanumGothic-Bold.ttf");

export async function renderSlideHeadline(headline:string) {
  // Load the shipped font explicitly: Linux hosts need not have any Korean fonts.
  await access(fontfile);
  const title=headline.replace(/\s+/g," ").trim();
  const breaks=[...title.matchAll(/ /g)].map(match=>match.index!);
  const split=breaks.sort((a,b)=>Math.abs(a-title.length/2)-Math.abs(b-title.length/2))[0]??Math.ceil(title.length/2);
  const balanced=title.length>18?`${title.slice(0,split).trim()}\n${title.slice(split).trim()}`:title;
  return sharp({text:{text:`<span foreground="#ffffff">${escapeXml(balanced)}</span>`,font:"NanumGothic Bold 58",fontfile,spacing:12,rgba:true}})
    .resize({width:936,height:190,fit:"inside",withoutEnlargement:true})
    .png().toBuffer({resolveWithObject:true});
}

// 요점 2~4줄을 제목보다 작은 글자로 한 덩어리(불릿 목록)로 그린다. 긴 줄은 936px 폭 안에서 줄바꿈되고, 전체는 최대 320px 높이에 맞춘다.
export async function renderSlidePoints(points:string[]) {
  const lines=points.map(point=>point.replace(/\s+/g," ").trim()).filter(Boolean);
  if(!lines.length)return null;
  await access(fontfile);
  const markup=lines.map(line=>`<span foreground="#ffffff">•  ${escapeXml(line)}</span>`).join("\n");
  return sharp({text:{text:markup,font:"NanumGothic Bold 36",fontfile,width:936,wrap:"word-char",spacing:16,rgba:true}})
    .resize({width:936,height:320,fit:"inside",withoutEnlargement:true})
    .png().toBuffer({resolveWithObject:true});
}

const POINT_GAP=28;

export async function composeSlideImage(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const headline=await renderSlideHeadline(slide.headline);
  const points=await renderSlidePoints(slide.points??[]);
  // 요점이 있으면 글자 영역이 커지므로 어두운 그라데이션도 더 넓게 깐다.
  const shadeSpan=points?.info.height?Math.min(.62,.42+(points.info.height+POINT_GAP)/1350):.42;
  const gradient=slide.textPosition==="top"
    ? `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".74"/><stop offset="${shadeSpan.toFixed(2)}" stop-color="#000" stop-opacity="0"/></linearGradient>`
    : `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="${(1-shadeSpan-.03).toFixed(2)}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></linearGradient>`;
  const overlay=Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradient}</defs>
    <rect width="1080" height="1350" fill="url(#shade)"/>
  </svg>`);
  const counter=await sharp({text:{text:`<span foreground="#ffffff">${index} / ${total}</span>`,font:"NanumGothic Bold 30",fontfile,rgba:true}}).png().toBuffer({resolveWithObject:true});

  // 제목 아래에 요점이 붙는 한 블록으로 잡고, 위(top)면 72px에서 시작, 아래(bottom)면 카운터 위 1200px에서 끝나게 놓는다.
  const blockHeight=headline.info.height+(points?POINT_GAP+points.info.height:0);
  const blockTop=slide.textPosition==="top"?72:1200-blockHeight;
  const layers:OverlayOptions[]=[{input:overlay},{input:headline.data,left:72,top:blockTop}];
  if(points)layers.push({input:points.data,left:72,top:blockTop+headline.info.height+POINT_GAP});
  layers.push({input:counter.data,left:1008-counter.info.width,top:1250});

  return sharp(input)
    .rotate()
    .resize(1080,1350,{fit:"cover"})
    .composite(layers)
    .jpeg({quality:90})
    .toBuffer();
}
