"use client";
import { GenerationProgress } from "@/components/states/GenerationState";
import { PhotoPicker } from "./PhotoPicker";
import { AUTO_FAILED, autoProgress, type GenerationState } from "@/features/images/generationStore";
import type { CarouselTrack } from "@/features/images/track";

// 2단계 "어떻게 만들까요?": 큰 카드 두 개 중 하나 + 사진 올리기(선택) + "만들기" 한 번.
// 누른 뒤에는 자동으로 끝까지 간다(generationStore.createAutomatically). 이 화면은 진행 한 줄과 막대만 보여 준다.
const TRACKS:Array<{id:CarouselTrack;icon:string;title:string;help:string}>=[
  {id:"photo",icon:"📷",title:"사진 중심",help:"사진이 크게, 글은 한 줄"},
  {id:"text",icon:"✏️",title:"글 중심",help:"큰 글씨 3줄, 사진은 표지만"},
];

// 사진 유무·갈래에 따라 걸리는 시간을 쉬운 말로 한 줄.
function timeNote(track:CarouselTrack,photos:number):string {
  if(photos&&track==="text")return "올린 첫 사진이 표지가 되고, 나머지 장은 큰 글씨로 만들어요. 1분 안쪽이면 돼요.";
  // 사진이 5장보다 적으면 모자란 장은 AI가 올린 사진(같은 음식)을 참고해 그 장 글에 맞는 새 장면을 그린다.
  if(photos)return photos>=5?"올린 사진으로 5장을 만들어요. 1~2분이면 돼요.":"사진이 모자란 장은 AI가 올린 사진을 참고해 글에 맞는 장면으로 새로 그려요. 3~5분쯤 걸려요.";
  return track==="text"?"사진이 없으면 AI가 표지 한 장만 그려요. 3분쯤 걸려요.":"사진이 없으면 AI가 5장을 모두 그려요. 10분쯤 걸려요.";
}

export function MakeStep({topic,track,onTrack,state,onMake,onBack}:{topic:string;track:CarouselTrack;onTrack:(track:CarouselTrack)=>void;state:GenerationState;onMake:()=>void;onBack:()=>void}) {
  const {auto}=state;
  const running=auto.stage==="working"||auto.stage==="saving"||auto.stage==="writing";
  if(running){
    const {message,progress}=autoProgress(state);
    return <section className="make-progress" aria-labelledby="make-title">
      <h1 id="make-title">만들고 있어요</h1>
      <p className="lead">다 되면 저절로 다음 화면으로 넘어가요. 다른 메뉴에 다녀와도 계속 만들어요. 다만 이 창을 닫거나 새로고침하지는 마세요.</p>
      <GenerationProgress stage={`${auto.stage}-${state.phase}-${state.slides.length}`} message={message||"만들고 있어요"} progress={progress} hint={state.photos.length>=5||(state.photos.length&&track==="text")?"조금만 기다려 주세요.":"AI가 사진을 그리는 데 시간이 걸려요. 조금만 기다려 주세요."}/>
      {state.slides.length>0&&<div className="make-thumbs" aria-label="지금까지 만든 장">{state.slides.map((slide,index)=><span key={slide.id} className="feed-thumb" role="img" aria-label={`${index+1}번째 장`} style={slide.preview?{backgroundImage:`url(${slide.preview})`}:undefined}/>)}</div>}
    </section>;
  }
  const busy=state.phase!=="idle";
  return <section aria-labelledby="make-title">
    <h1 id="make-title">어떻게 만들까요?</h1>
    <p className="lead">주제: {topic}</p>
    <div className="track-grid" role="group" aria-label="만드는 모양">
      {TRACKS.map(item=><button key={item.id} type="button" className={`track-card${track===item.id?" selected":""}`} aria-pressed={track===item.id} disabled={busy} onClick={()=>onTrack(item.id)}>
        <span className="track-icon" aria-hidden="true">{item.icon}</span>
        <strong>{item.title}</strong>
        <span>{item.help}</span>
        <TrackSketch track={item.id}/>
      </button>)}
    </div>
    <PhotoPicker state={state}/>
    {auto.stage==="error"&&<div className="make-error" role="alert">
      <p>{auto.error}</p>
      {/* AI 그림이 계속 멈추면(그림 AI 한도·연결 문제) 사장님이 할 수 있는 다른 길: 가게 사진으로 만들면 그림 AI가 필요 없다. */}
      {auto.error===AUTO_FAILED&&!state.photos.length&&<p className="field-help">계속 멈추면 위 &apos;사진 고르기&apos;로 가게 사진을 올린 뒤 눌러 보세요. 사진으로 만들면 AI 그림을 기다리지 않아요.</p>}
      {auto.detail&&<details><summary>자세한 이유</summary><p>{auto.detail}</p></details>}
    </div>}
    {state.error&&auto.stage!=="error"&&<p role="alert">{state.error}</p>}
    <p className="make-note">{timeNote(track,state.photos.length)}</p>
    <div className="bottom-action">
      <button type="button" className="button secondary" onClick={onBack}>이전</button>
      <button type="button" className="button primary big" disabled={busy||!topic.trim()} onClick={onMake}>{auto.stage==="error"?"다시 해 보기":"만들기"}</button>
    </div>
  </section>;
}

// 카드 안의 작은 그림: 어떤 모양인지 글을 읽지 않아도 보이게(사진 칸 크기·글 줄 수).
function TrackSketch({track}:{track:CarouselTrack}) {
  return <span className={`track-sketch ${track}`} aria-hidden="true">
    {track==="photo"?<><i className="sketch-photo"/><i className="sketch-line"/></>:<><i className="sketch-line thick"/><i className="sketch-line"/><i className="sketch-line"/></>}
  </span>;
}
