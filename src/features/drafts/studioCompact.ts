import sharp from "sharp";
import type { StudioSnapshot } from "./studio";

// 게시물과 함께 저장하는 밑바탕 그림(사장님 사진·AI 원본)을 작게 줄인다. 카드는 1080×1350이라 긴 변 1350px이면 다시 그려도
// 화질이 그대로다(AI 원본은 1440px·품질 88로 오고, 사장님 사진은 2160px까지 와서 그대로 두면 게시물 하나가 수 MB 늘었다).
const MAX_SIDE=1350;
async function compact(dataUrl:string):Promise<string> {
  const comma=dataUrl.indexOf(",");
  try{
    const out=await sharp(Buffer.from(dataUrl.slice(comma+1),"base64")).rotate().resize(MAX_SIDE,MAX_SIDE,{fit:"inside",withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toBuffer();
    const next=`data:image/jpeg;base64,${out.toString("base64")}`;
    return next.length<dataUrl.length?next:dataUrl;
  }catch{return dataUrl;}
}
export async function compactStudio(studio:StudioSnapshot):Promise<StudioSnapshot> {
  return {
    ...studio,
    photos:await Promise.all(studio.photos.map(async photo=>({...photo,preview:await compact(photo.preview)}))),
    slides:await Promise.all(studio.slides.map(async slide=>slide.bases?{...slide,bases:await Promise.all(slide.bases.map(compact))}:slide)),
  };
}
