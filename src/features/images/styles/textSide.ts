import sharp from "sharp";

// 꽉 찬 사진 위에 제목을 얹을 때 위·아래 중 어디에 둘지 사진을 보고 고른다(보고서 "사진 중심 한식 카드뉴스 재분석" 후보 ①·② 짝).
// 사진 위 35%와 아래 35% 띠의 '복잡함'(작게 줄인 흑백에서 이웃 칸 밝기 차이의 평균)을 견주어, 위쪽이 뚜렷이 단순하면(아래의 70% 미만)
// "top", 아니면 "bottom"(기존 자리). 음식이 아래에 있고 위가 벽·어두운 배경인 사진에서 제목이 음식을 가리지 않게 한다.
export type TextSide="top"|"bottom";
const BAND=.35,MARGIN_RATIO=.7,SW=72,SH=90;

export async function busyness(photo:Buffer):Promise<{top:number;bottom:number}> {
  const {data}=await sharp(photo).resize(SW,SH,{fit:"fill"}).grayscale().raw().toBuffer({resolveWithObject:true});
  const band=(from:number,to:number)=>{
    let sum=0,count=0;
    for(let y=from;y<to;y++)for(let x=0;x<SW;x++){
      const v=data[y*SW+x];
      if(x+1<SW){sum+=Math.abs(v-data[y*SW+x+1]);count++;}
      if(y+1<to){sum+=Math.abs(v-data[(y+1)*SW+x]);count++;}
    }
    return count?sum/count:0;
  };
  const rows=Math.round(SH*BAND);
  return {top:band(0,rows),bottom:band(SH-rows,SH)};
}

export async function quietSide(photo:Buffer):Promise<TextSide> {
  const {top,bottom}=await busyness(photo);
  return top<bottom*MARGIN_RATIO?"top":"bottom";
}
