import sharp from "sharp";
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

export async function composeSlideImage(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const headline=await renderSlideHeadline(slide.headline);
  const gradient=slide.textPosition==="top"
    ? '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".72"/><stop offset=".42" stop-color="#000" stop-opacity="0"/></linearGradient>'
    : '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".76"/></linearGradient>';
  const overlay=Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradient}</defs>
    <rect width="1080" height="1350" fill="url(#shade)"/>
  </svg>`);
  const counter=await sharp({text:{text:`<span foreground="#ffffff">${index} / ${total}</span>`,font:"NanumGothic Bold 30",fontfile,rgba:true}}).png().toBuffer({resolveWithObject:true});

  return sharp(input)
    .rotate()
    .resize(1080,1350,{fit:"cover"})
    .composite([{input:overlay},{input:headline.data,left:72,top:slide.textPosition==="top"?72:1200-headline.info.height},{input:counter.data,left:1008-counter.info.width,top:1250}])
    .jpeg({quality:90})
    .toBuffer();
}
