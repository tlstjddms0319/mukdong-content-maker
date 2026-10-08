// 릴스 시간표(순수 함수). 캐러셀 카드들을 9:16 영상의 장면으로 늘어놓고, 어느 시각에 어떤 장면을 얼마나 보여 줄지 계산한다.
// 화면 그리기·녹화는 브라우저 쪽(ReelMaker)이 하고, 여기서는 시간 계산만 해서 테스트할 수 있게 한다.

export const REEL={width:1080,height:1920,fps:30} as const;
// 카드(1080×1350)를 세로 영상 가운데에 놓을 자리. 위아래 여백에는 흐리게 깐 같은 카드가 보인다.
export const CARD_RECT={x:40,y:335,width:1000,height:1250} as const;
const COVER_SECONDS=3,CARD_SECONDS=2.6,FADE_SECONDS=.5,INTRO_MAX=5,ZOOM=.06;
// 끝 화면: 로고보다 어두운 갈색 바탕 가운데에 가게 공용 원형 로고와 옅은 크림색 테두리(로고 원이 바탕에 묻히지 않게). 릴스 화면 위(약 250px)·아래(약 400px)는 Instagram 글자가 덮으므로
// 로고 가운데를 그 사이(세로 860px)에 둔다. 로고 파일은 public/brand/logo-512.png(같은 주소라 녹화 캔버스가 막히지 않는다).
export const OUTRO={seconds:2,background:"#1f1714",ring:"rgba(243,233,218,.75)",logoSize:560,centerY:860,logo:"/brand/logo-512.png"} as const;

export type Scene={kind:"intro"|"card"|"outro";index:number;start:number;duration:number};
export type Timeline={scenes:Scene[];total:number};

// intro: AI 표지 영상 길이(초). 있으면 맨 앞에 두고(최대 5초) 표지 카드로 이어진다.
// outro: true면 마지막 카드 뒤에 로고 끝 화면(2초)을 붙인다. 마지막 카드도 0.5초 동안 끝 화면으로 겹쳐 넘어간다.
export function buildTimeline(cardCount:number,intro?:number,outro=false):Timeline {
  const scenes:Scene[]=[];
  let start=0;
  if(intro&&intro>0){const duration=Math.min(INTRO_MAX,intro);scenes.push({kind:"intro",index:0,start,duration});start+=duration-FADE_SECONDS;}
  for(let index=0;index<cardCount;index++){
    const duration=index===0?COVER_SECONDS:CARD_SECONDS;
    scenes.push({kind:"card",index,start,duration});
    const hasNext=index<cardCount-1||outro;
    start+=duration-(hasNext?FADE_SECONDS:0);
  }
  if(outro&&cardCount>0)scenes.push({kind:"outro",index:0,start,duration:OUTRO.seconds});
  const last=scenes.at(-1);
  return {scenes,total:last?last.start+last.duration:0};
}

// t초에 보여 줄 장면들과 각각의 불투명도·확대 배율. 장면이 넘어가는 0.5초 동안은 두 장면이 겹쳐 서서히 바뀐다(크로스페이드).
// 확대 배율은 장면 동안 1.0 → 1.06으로 천천히 커진다(켄 번스 효과).
export function framesAt(timeline:Timeline,t:number):Array<{scene:Scene;alpha:number;zoom:number}> {
  return timeline.scenes.flatMap(scene=>{
    const local=t-scene.start;
    if(local<0||local>scene.duration)return [];
    const fadeIn=scene.start===0?1:Math.min(1,local/FADE_SECONDS);
    const isLast=scene===timeline.scenes.at(-1);
    const fadeOut=isLast?1:Math.min(1,(scene.duration-local)/FADE_SECONDS);
    return [{scene,alpha:Math.max(0,Math.min(fadeIn,fadeOut)),zoom:1+ZOOM*(local/scene.duration)}];
  });
}

// 브라우저가 녹화할 수 있는 형식 고르기. 인스타그램 릴스는 H.264(또는 HEVC) MP4만 확실히 받으므로 H.264를 먼저 고른다.
// 1080×1920은 H.264 레벨 4.0 이상이 필요해서(Baseline 3.0은 720p까지) High/Main 4.0을 앞에 둔다.
// 코덱 없이 "video/mp4"만 되는 브라우저(오픈소스 크로미움 등)는 VP9을 MP4에 담아 인스타가 거절할 수 있어 instagramReady=false.
const H264=["video/mp4;codecs=avc1.640028","video/mp4;codecs=avc1.4D0028","video/mp4;codecs=avc1.42E028","video/mp4;codecs=avc1"];
export type RecordingType={type:string;mp4:boolean;instagramReady:boolean};
export function pickRecordingType(isSupported:(type:string)=>boolean):RecordingType|null {
  for(const type of H264)if(isSupported(type))return {type,mp4:true,instagramReady:true};
  if(isSupported("video/mp4"))return {type:"video/mp4",mp4:true,instagramReady:false};
  for(const type of ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"])if(isSupported(type))return {type,mp4:false,instagramReady:false};
  return null;
}
