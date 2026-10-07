import sharp from "sharp";
import type { PhotoView } from "../photoCarousel";

// 사진이 적을 때 같은 사진을 다른 장에 "다른 거리"로 다시 쓰기(사진 1~2장으로도 꽉 찬 캐러셀).
// full: 사진 그대로. close: 가운데를 가로세로 72%만 잘라 조금 다가간 장면. detail: 50%만 잘라 결·윤기가 보이는 접사 장면.
// 자른 사진은 평소처럼 보정·카드에 들어간다. 어느 장에 어떤 거리로 쓸지는 photoCarousel.ts(fillWithPhotoViews)가 정한다.
const FRACTION:Record<Exclude<PhotoView,"full">,number>={close:.72,detail:.5};

// 가운데를 자른다. 음식 사진은 주인공 접시를 가운데 두고 찍는 일이 많다. sharp의 attention(눈에 띄는 곳)은
// 연분홍 홍어보다 빨간 김치·수육 쪽을 골라 "결 확대" 장에 김치가 나오곤 해서(샘플 5장 중 4장) 쓰지 않는다.
export async function viewOf(input:Buffer,view:PhotoView|undefined):Promise<Buffer> {
  if(!view||view==="full")return input;
  const upright=await sharp(input).rotate().toBuffer({resolveWithObject:true});
  const {width,height}=upright.info;
  const f=FRACTION[view];
  const w=Math.max(1,Math.round(width*f)),h=Math.max(1,Math.round(height*f));
  return sharp(upright.data).extract({left:Math.round((width-w)/2),top:Math.round((height-h)/2),width:w,height:h}).jpeg({quality:94}).toBuffer();
}
