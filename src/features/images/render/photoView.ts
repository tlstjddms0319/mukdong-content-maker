import sharp from "sharp";
import type { PhotoView } from "../photoCarousel";
import type { FoodBox } from "../photoAnalysis";

// 사진이 적을 때 같은 사진을 다른 장에 "다른 거리"로 다시 쓰기(사진 1~2장으로도 꽉 찬 캐러셀).
// full: 사진 그대로. close: 가운데를 가로세로 72%만 잘라 조금 다가간 장면. detail: 50%만 잘라 결·윤기가 보이는 접사 장면.
// 자른 사진은 평소처럼 보정·카드에 들어간다. 어느 장에 어떤 거리로 쓸지는 photoCarousel.ts(fillWithPhotoViews)가 정한다.
const FRACTION:Record<Exclude<PhotoView,"full">,number>={close:.72,detail:.5};

// 음식이 작게 찍힌 사진을 그대로 쓸 때: 음식(상자의 긴 변)이 화면의 약 70%를 채우도록 다가간다.
// 미리보기는 긴 변 1400px이라 너무 많이 자르면 흐려지므로 가로세로 55%보다 더 자르지 않는다.
const FILL=.7,MIN_FULL=.55;

// 자를 곳: 사진 분석 AI가 음식 자리(box)를 알려 주면 그 가운데에 맞춰 자르고(사진 밖으로는 나가지 않게),
// 모르면 가운데를 자른다. 음식 사진은 주인공 접시를 가운데 두고 찍는 일이 많다. sharp의 attention(눈에 띄는 곳)은
// 연분홍 홍어보다 빨간 김치·수육 쪽을 골라 "결 확대" 장에 김치가 나오곤 해서(샘플 5장 중 4장) 쓰지 않는다.
export async function viewOf(input:Buffer,view:PhotoView|undefined,box?:FoodBox|null):Promise<Buffer> {
  const want=!view||view==="full"
    ?(box?Math.min(1,Math.max(MIN_FULL,Math.max(box.w,box.h)/FILL)):1)
    :FRACTION[view];
  // 거의 다 쓰는 자르기는 하지 않는다(사진 그대로가 더 선명하다).
  if(want>.95)return input;
  const upright=await sharp(input).rotate().toBuffer({resolveWithObject:true});
  const {width,height}=upright.info;
  const w=Math.max(1,Math.round(width*want)),h=Math.max(1,Math.round(height*want));
  const centre=(start:number,size:number,crop:number,whole:number)=>Math.round(Math.min(Math.max((start+size/2)*whole-crop/2,0),whole-crop));
  const left=box?centre(box.x,box.w,w,width):Math.round((width-w)/2);
  const top=box?centre(box.y,box.h,h,height):Math.round((height-h)/2);
  return sharp(upright.data).extract({left,top,width:w,height:h}).jpeg({quality:94}).toBuffer();
}
