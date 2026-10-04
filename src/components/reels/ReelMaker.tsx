"use client";
import { useEffect, useRef, useState } from "react";
import { CARD_RECT, REEL, buildTimeline, framesAt, pickRecordingType, type RecordingType, type Timeline } from "@/features/reels/timeline";
import { readJsonResponse } from "@/lib/http/readJson";

// 캐러셀 카드로 9:16 릴스 영상을 만든다. 영상 합성은 서버가 아니라 이 브라우저에서 한다.
// 1) 카드 이미지를 불러와 1080×1920 캔버스에 장면마다 그리고(천천히 확대 + 장 사이 크로스페이드),
// 2) 캔버스를 MediaRecorder로 실시간 녹화해 MP4(브라우저가 지원하면)로 받는다.
// 선택하면 표지 원본 사진으로 만든 AI 영상(Higgsfield)을 첫 장면에 넣는다(크레딧 사용).
// 녹화는 실제 시간만큼 걸리고, 다른 탭으로 가면 브라우저가 그리기를 멈추므로 화면을 켜 두어야 한다.

type Props={cards:string[];coverSource?:string;topic:string};
type Phase="idle"|"intro"|"recording"|"done"|"error";

const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("카드 이미지를 불러오지 못했어요."));image.src=src;});
const loadVideo=(src:string)=>new Promise<HTMLVideoElement>((resolve,reject)=>{const video=document.createElement("video");video.muted=true;video.playsInline=true;video.preload="auto";video.onloadeddata=()=>resolve(video);video.onerror=()=>reject(new Error("AI 영상을 불러오지 못했어요."));video.src=src;});

// 한 장면 그리기: 배경은 같은 카드를 화면 가득 키워 어둡게(흐림 대신 어둡게 해 모든 브라우저에서 같게), 가운데에 카드.
function drawScene(ctx:CanvasRenderingContext2D,source:CanvasImageSource,alpha:number,zoom:number){
  ctx.save();
  ctx.globalAlpha=alpha;
  const backgroundScale=REEL.height/CARD_RECT.height*1.05;
  const bw=CARD_RECT.width*backgroundScale,bh=CARD_RECT.height*backgroundScale;
  ctx.drawImage(source,(REEL.width-bw)/2,(REEL.height-bh)/2,bw,bh);
  ctx.fillStyle="rgba(0,0,0,.62)";
  ctx.fillRect(0,0,REEL.width,REEL.height);
  const w=CARD_RECT.width*zoom,h=CARD_RECT.height*zoom;
  ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=40;ctx.shadowOffsetY=16;
  ctx.drawImage(source,CARD_RECT.x+(CARD_RECT.width-w)/2,CARD_RECT.y+(CARD_RECT.height-h)/2,w,h);
  ctx.restore();
}

export function ReelMaker({cards,coverSource,topic}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [phase,setPhase]=useState<Phase>("idle");
  const [message,setMessage]=useState("");
  const [progress,setProgress]=useState(0);
  const [withIntro,setWithIntro]=useState(false);
  const [result,setResult]=useState<{url:string;mp4:boolean}|null>(null);
  // 브라우저가 녹화를 지원하는지는 화면이 뜬 뒤에만 알 수 있다(서버 렌더링에는 MediaRecorder가 없다).
  const [support,setSupport]=useState<RecordingType|null|undefined>(undefined);
  useEffect(()=>{
    const recorder=typeof window!=="undefined"?window.MediaRecorder:undefined;
    const canvasStream=typeof HTMLCanvasElement!=="undefined"&&"captureStream" in HTMLCanvasElement.prototype;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 기능 확인은 마운트 뒤에 한 번만 한다.
    setSupport(recorder&&canvasStream?pickRecordingType(type=>recorder.isTypeSupported(type)):null);
  },[]);
  useEffect(()=>()=>{if(result)URL.revokeObjectURL(result.url);},[result]);

  const record=async()=>{
    if(!support||!canvasRef.current)return;
    setResult(null);setMessage("");setProgress(0);
    try{
      const images=await Promise.all(cards.map(loadImage));
      // AI 표지 영상(선택): 서버가 Higgsfield로 만들어 data URL로 돌려준다.
      let intro:HTMLVideoElement|null=null;
      if(withIntro&&coverSource){
        setPhase("intro");
        const response=await fetch("/api/reels/intro",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:coverSource})});
        const data=await readJsonResponse(response);
        if(!response.ok)throw new Error(data.message||"AI 표지 영상을 만들지 못했어요.");
        intro=await loadVideo(data.video);
      }
      const timeline:Timeline=buildTimeline(images.length,intro?intro.duration:undefined);
      const canvas=canvasRef.current;
      canvas.width=REEL.width;canvas.height=REEL.height;
      const ctx=canvas.getContext("2d");
      if(!ctx)throw new Error("이 브라우저는 영상 그리기를 지원하지 않아요.");
      const stream=canvas.captureStream(REEL.fps);
      const recorder=new MediaRecorder(stream,{mimeType:support.type,videoBitsPerSecond:8_000_000});
      const chunks:Blob[]=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      const stopped=new Promise<void>(resolve=>{recorder.onstop=()=>resolve();});
      setPhase("recording");
      recorder.start(250);
      if(intro){intro.currentTime=0;await intro.play().catch(()=>undefined);}
      const startedAt=performance.now();
      await new Promise<void>(resolve=>{
        const frame=()=>{
          const t=(performance.now()-startedAt)/1000;
          ctx.fillStyle="#000";ctx.fillRect(0,0,REEL.width,REEL.height);
          for(const {scene,alpha,zoom} of framesAt(timeline,Math.min(t,timeline.total))){
            drawScene(ctx,scene.kind==="intro"&&intro?intro:images[scene.index],alpha,scene.kind==="intro"?1:zoom);
          }
          setProgress(Math.min(1,t/timeline.total));
          if(t>=timeline.total){resolve();return;}
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      recorder.stop();
      await stopped;
      intro?.pause();
      const blob=new Blob(chunks,{type:support.type.split(";")[0]});
      setResult({url:URL.createObjectURL(blob),mp4:support.mp4});
      setPhase("done");
    }catch(error){
      setPhase("error");
      setMessage(error instanceof Error?error.message:"릴스를 만들지 못했어요.");
    }
  };

  const busy=phase==="intro"||phase==="recording";
  const fileName=`묵동홍어마을-릴스-${topic.replace(/[^\p{L}\p{N}]+/gu,"-").slice(0,30)}.${result?.mp4?"mp4":"webm"}`;
  return <section className="reel-maker" aria-label="릴스 만들기">
    <div><h2>릴스(세로 영상)로도 올리기</h2><p>카드를 천천히 넘기는 9:16 영상을 이 브라우저에서 바로 만들어요. 음악은 Instagram에 올릴 때 앱에서 고르세요.</p></div>
    {support===null&&<p role="alert">이 브라우저는 영상 녹화를 지원하지 않아요. 최신 크롬·엣지 또는 아이폰 사파리에서 만들어 주세요.</p>}
    {support&&!support.instagramReady&&<p className="field-help">이 브라우저는 Instagram용 H.264 영상을 녹화하지 못해요({support.mp4?"VP9 MP4":"WebM"}로 만들어져 업로드가 거절될 수 있어요). 구글 크롬 최신 버전이나 아이폰 사파리에서 만들어 주세요.</p>}
    {coverSource&&<label className="reel-option"><input type="checkbox" checked={withIntro} disabled={busy} onChange={event=>setWithIntro(event.target.checked)}/> 첫 장면에 AI 움직이는 표지 넣기 <small>(Higgsfield 크레딧 사용 · 1~3분 더 걸려요)</small></label>}
    <div className="reel-actions">
      <button type="button" className="button primary" disabled={!support||busy||!cards.length} onClick={()=>void record()}>{phase==="intro"?"AI 표지 영상 만드는 중…":phase==="recording"?`녹화 중… ${Math.round(progress*100)}%`:result?"다시 만들기":"릴스 영상 만들기"}</button>
      {result&&<a className="button secondary" href={result.url} download={fileName}>영상 받기 ({result.mp4?"MP4":"WebM"})</a>}
    </div>
    {busy&&<p role="status" className="field-help">{phase==="intro"?"AI가 표지 사진을 움직이는 영상으로 만들고 있어요.":"녹화하는 동안 이 화면을 켜 두세요. 다른 탭으로 가면 녹화가 멈춰요."}</p>}
    {message&&<p role="alert">{message}</p>}
    <div className="reel-preview">
      <canvas ref={canvasRef} hidden={phase!=="recording"} aria-label="릴스 녹화 화면"/>
      {result&&phase==="done"&&<video src={result.url} controls playsInline aria-label="만든 릴스 미리보기"/>}
    </div>
  </section>;
}
