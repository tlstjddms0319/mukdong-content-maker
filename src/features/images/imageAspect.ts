// 이미지 AI에 요청할 비율. 카드의 사진 칸 비율(windowRatio = 가로÷세로)에 맞춰 만들어야 카드에 넣을 때 접시가 잘리지 않는다.
// 예전에는 모든 장을 세로(2:3·4:5)로 만들어서, 칠판 계열의 가로 사진 칸(약 3:2)에 넣으면 원본의 40%만 남고 접시 가장자리가 잘렸다.
// 비율을 모르면(예전 요청) 예전처럼 세로로 만든다. sharp 같은 서버 모듈을 쓰지 않는다.
export const POST_RATIO=4/5;

// 로그 비율 거리로 가장 가까운 선택지를 고른다(2:1과 1:2가 1:1에서 같은 거리).
function nearest<T>(ratio:number,options:ReadonlyArray<readonly [T,number]>):T {
  return options.reduce((best,option)=>Math.abs(Math.log(option[1]/ratio))<Math.abs(Math.log(best[1]/ratio))?option:best)[0];
}

// OpenAI gpt-image가 받는 크기 세 가지.
export function openaiSize(ratio=POST_RATIO):"1024x1536"|"1024x1024"|"1536x1024" {
  return nearest(ratio,[["1024x1536",2/3],["1024x1024",1],["1536x1024",3/2]] as const);
}

// Cloudflare(FLUX)는 가로·세로를 직접 준다. 약 130만 화소, 16의 배수, 비율은 1:2~2:1 안에서.
export function cloudflareSize(ratio=1024/1280):{width:number;height:number} {
  const r=Math.min(2,Math.max(.5,ratio));
  const area=1024*1280;
  const round16=(value:number)=>Math.max(512,Math.round(value/16)*16);
  return {width:round16(Math.sqrt(area*r)),height:round16(Math.sqrt(area/r))};
}

// Higgsfield(Grok Image 2.0)가 받는 비율(models_explore 기준). 4:5는 없어 3:4가 가장 가깝다.
export const HIGGSFIELD_ASPECTS=[["9:16",9/16],["1:2",1/2],["2:3",2/3],["3:4",3/4],["1:1",1],["4:3",4/3],["3:2",3/2],["2:1",2],["16:9",16/9]] as const;
export function higgsfieldAspect(ratio=3/4):typeof HIGGSFIELD_ASPECTS[number][0] {
  return nearest(ratio,HIGGSFIELD_ASPECTS);
}

// 프롬프트에 붙일 구도 지시. 가로·정사각 칸이면 접시 전체가 여유 있게 들어오게 한다(가장자리에서 잘리지 않게).
export function framingDirection(ratio:number|undefined,detail=false):string {
  if(ratio===undefined)return "";
  const shape=ratio>1.15?"wide landscape":ratio>.87?"square":"vertical portrait";
  if(detail)return `Compose for a ${shape} frame.`;
  return `Compose for a ${shape} frame: keep the whole plate and every piece of food fully inside the picture with a clear margin on all sides; nothing touches or runs off the edges.`;
}
