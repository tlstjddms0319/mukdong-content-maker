import sharp from "sharp";
import type { CarouselSlidePlan } from "./carousel";

function escapeXml(value:string):string {
  return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[character]!);
}

function headlineLines(headline:string):string[] {
  const characters=Array.from(headline);
  return characters.length<=21 ? [headline] : [characters.slice(0,21).join(""),characters.slice(21).join("")];
}

export async function composeSlideImage(input:Buffer,slide:CarouselSlidePlan,index:number,total:number):Promise<Buffer> {
  const lines=headlineLines(slide.headline);
  const headlineY=slide.textPosition==="top" ? 92 : 1135-(lines.length-1)*72;
  const gradient=slide.textPosition==="top"
    ? '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".72"/><stop offset=".42" stop-color="#000" stop-opacity="0"/></linearGradient>'
    : '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".76"/></linearGradient>';
  const text=lines.map((line,lineIndex)=>`<tspan x="72" y="${headlineY+lineIndex*72}">${escapeXml(line)}</tspan>`).join("");
  const overlay=Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradient}</defs>
    <rect width="1080" height="1350" fill="url(#shade)"/>
    <text fill="#fff" font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="58" font-weight="700">${text}</text>
    <text x="1008" y="1270" text-anchor="end" fill="#fff" font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="32" font-weight="600">${index} / ${total}</text>
  </svg>`);

  return sharp(input)
    .rotate()
    .resize(1080,1350,{fit:"cover"})
    .composite([{input:overlay}])
    .jpeg({quality:90})
    .toBuffer();
}
