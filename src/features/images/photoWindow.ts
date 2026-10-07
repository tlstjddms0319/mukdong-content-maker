import "server-only";
import sharp from "sharp";
import type { CarouselSlidePlan } from "./carousel";
import { composeSlideCard, type CardOptions } from "./composeSlide";
import { normalizeCardLayout, photosNeeded, type DesignSpecInput } from "./design";
import type { SlideLayout } from "./slideLayout";

// 이 장의 사진 칸 비율(가로÷세로)을 미리 잰다. 빈 회색 사진으로 카드를 한 번 그려 보고, 사진을 칸에 맞출 때 적힌
// 칸 크기(검수 메모 photo-crop)를 읽는다. 이미지 AI가 그 비율로 그림을 만들면 카드에 넣을 때 거의 잘리지 않는다.
// 카드 한 장 그리는 데 0.3~1초라 이미지 생성(10초~2분)에 비해 짧고, 같은 조건은 기억해 둔다. 실패하면 undefined(예전처럼 세로).
const cache=new Map<string,number|undefined>();
let blank:Promise<Buffer>|null=null;
const placeholder=()=>blank??=sharp({create:{width:1200,height:1200,channels:3,background:"#8a8178"}}).jpeg().toBuffer();

export async function photoWindowRatio(slide:CarouselSlidePlan,index:number,total:number,layout:SlideLayout,design:DesignSpecInput|undefined,options:CardOptions={}):Promise<number|undefined> {
  const card=layout==="overlay"?"fullscreen":normalizeCardLayout(slide);
  const count=Math.max(1,photosNeeded(card));
  const key=JSON.stringify([layout,card,slide.role,slide.variant??0,slide.headline.length,(slide.points??[]).map(point=>point.length),design?.style,design?.theme,index===total,options.storeCard===true]);
  if(cache.has(key))return cache.get(key);
  let ratio:number|undefined;
  try{
    const image=await placeholder();
    const {report}=await composeSlideCard(Array.from({length:count},()=>image),slide,index,total,layout,design,{...options,photoKind:"none"});
    const crop=report.notes.find(note=>note.kind==="photo-crop");
    ratio=crop&&crop.kind==="photo-crop"&&crop.height>0?Math.round(crop.width/crop.height*100)/100:undefined;
  }catch{ratio=undefined;}
  cache.set(key,ratio);
  if(cache.size>200)cache.delete(cache.keys().next().value!);
  return ratio;
}
