"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WizardShell, type WizardStep } from "./WizardShell";
import { ImageStudio } from "@/components/images/ImageStudio";
import { CopyEditor } from "@/components/copy/CopyEditor";
import { PostPreview } from "@/components/review/PostPreview";
import { ExportActions } from "@/components/review/ExportActions";
import type { ApprovedImage } from "@/components/images/ImageStudio";
import type { TopicSuggestion } from "@/features/topics/schema";
import { GenerationProgress } from "@/components/states/GenerationState";
import { selectedDraftMedia } from "@/features/drafts/selection";
import type { CarouselSlideCount } from "@/features/images/carousel";

const DEFAULT_TOPICS:TopicSuggestion[] = [
  { id:"default-a", title:"처음 먹는 홍어, 삼합부터", summary:"", reason:"처음 방문하는 손님의 선택 부담을 낮춰요.", audience:"A", imageBrief:"" },
  { id:"default-b", title:"한 점을 더 맛있게 먹는 순서", summary:"", reason:"저장해서 다시 보기 좋은 내용이에요.", audience:"B", imageBrief:"" },
  { id:"default-c", title:"오늘 모임 메뉴로 홍어 삼합", summary:"", reason:"모임 장소를 찾는 손님에게 잘 맞아요.", audience:"C", imageBrief:"" },
];

export function DraftWizard({slideCount=5}:{slideCount?:CarouselSlideCount}) {
  const [step,setStep]=useState<WizardStep>("topic");
  const [topic,setTopic]=useState("처음 먹는 홍어, 삼합부터");
  const [audience,setAudience]=useState<"A"|"B"|"C">("A");
  const [imageBrief,setImageBrief]=useState("");
  const [topics,setTopics]=useState(DEFAULT_TOPICS);
  const [topicsLoading,setTopicsLoading]=useState(false);
  const [recommendationRound,setRecommendationRound]=useState(0);
  const topicSelectionRef=useRef({topic,audience,imageBrief});
  const topicRequestRef=useRef(0);
  const [images,setImages]=useState<ApprovedImage[]>([]);
  const [caption,setCaption]=useState("");
  const [savedCaption,setSavedCaption]=useState("");
  const [draftId,setDraftId]=useState(()=>crypto.randomUUID());
  const draftIdRef=useRef(draftId);
  const createdAtRef=useRef(new Date().toISOString());
  const [saveState,setSaveState]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const [copySaveState,setCopySaveState]=useState<"idle"|"saving"|"error">("idle");
  const [loadError,setLoadError]=useState("");
  const changeTopic=useCallback((nextTopic:string,nextAudience:"A"|"B"|"C",nextImageBrief="",preserveDraft=false)=>{
    const next={topic:nextTopic,audience:nextAudience,imageBrief:nextImageBrief};
    const current=topicSelectionRef.current;
    const changed=current.topic!==next.topic||current.audience!==next.audience||current.imageBrief!==next.imageBrief;
    topicSelectionRef.current=next;setTopic(next.topic);setAudience(next.audience);setImageBrief(next.imageBrief);
    if(changed&&!preserveDraft){const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopySaveState("idle");setDraftId(nextDraftId);localStorage.removeItem("mukdong-current-draft");if(window.location.search)window.history.replaceState({},"","/");}
  },[]);
  const loadTopics=useCallback(async(round=0,excludeTitles:string[]=[])=>{
    const requestId=++topicRequestRef.current;
    const topicAtRequest=topicSelectionRef.current.topic;
    setTopicsLoading(true);
    try{
      const response=await fetch("/api/topics", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({storeProfile:{name:"묵동홍어마을"},recommendationRound:round,excludeTitles}) });
      if(!response.ok) throw new Error();
      const data=await response.json();
      if(requestId===topicRequestRef.current&&Array.isArray(data.topics)&&data.topics.length===3){
        setTopics(data.topics);
        if(topicSelectionRef.current.topic===topicAtRequest)changeTopic(data.topics[0].title,data.topics[0].audience,data.topics[0].imageBrief ?? "");
        setRecommendationRound(round);
      }
    }catch{}finally{if(requestId===topicRequestRef.current)setTopicsLoading(false);}
  },[changeTopic]);
  const approveImage=async (approved:ApprovedImage[]) => {
    const savingDraftId=draftIdRef.current;
    setImages(approved); setSaveState("saving");
    const now=new Date().toISOString();
    try {
      const response=await fetch("/api/drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:savingDraftId,status:"ready",topic,audience,media_candidates:approved.map((item,index)=>({id:item.id,source:item.source,file_id:item.preview ?? item.id,purpose:approved.length===1?"instagram-primary":`instagram-${item.role ?? (index===0?"cover":"slide")}`})),selected_media_id:approved[0]?.id ?? null,...(approved.length?{selected_media_ids:approved.map(item=>item.id)}:{}),copy:null,...(caption.trim()?{caption}:{}),facts_to_verify:[],store_profile_version:"2026-09-10",created_at:createdAtRef.current,updated_at:now})});
      if(!response.ok) throw new Error();
      if(draftIdRef.current!==savingDraftId)return;
      localStorage.setItem("mukdong-current-draft",savingDraftId);
      setSaveState("saved");
    } catch { if(draftIdRef.current===savingDraftId)setSaveState("error"); }
  };
  const saveCaption=async(text:string)=>{
    const savingDraftId=draftIdRef.current;
    setCopySaveState("saving");
    try{
      const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:savingDraftId,caption:text})});
      if(!response.ok)throw new Error();
      if(draftIdRef.current!==savingDraftId)return;
      setCaption(text);setSavedCaption(text);setCopySaveState("idle");setStep("review");
    }catch{if(draftIdRef.current===savingDraftId)setCopySaveState("error");}
  };
  useEffect(() => {
    let active=true;
    const load=async()=>{
      const requestedId=new URLSearchParams(window.location.search).get("draft");
      const savedId=requestedId??localStorage.getItem("mukdong-current-draft");
      if(savedId){
        try{
          const response=await fetch(`/api/drafts?id=${encodeURIComponent(savedId)}`);
          if(response.ok){
            const draft=await response.json();
            const selected=selectedDraftMedia(draft);
            if(active&&selected.length){changeTopic(draft.topic,draft.audience,"",true);draftIdRef.current=draft.id;createdAtRef.current=draft.created_at??new Date().toISOString();setDraftId(draft.id);setImages(selected.map(item=>({id:item.id,preview:item.file_id,source:item.source})));setCaption(draft.caption??"");setSavedCaption(draft.caption??"");setSaveState("saved");localStorage.setItem("mukdong-current-draft",draft.id);if(requestedId)setStep(draft.caption?.trim()?"review":"image");return;}
          }
        }catch{}
        if(requestedId)setLoadError("선택한 초안을 찾지 못했어요. 내 초안에서 다시 골라 주세요.");
        else localStorage.removeItem("mukdong-current-draft");
      }
      if(active) void loadTopics();
    };
    void load();
    return () => { active=false; };
  }, [changeTopic,loadTopics]);
  const canVisit:WizardStep[]=["topic",...(topic.trim()?["image" as const]:[]),...(images.length&&saveState==="saved"?["copy" as const]:[]),...(caption.trim()&&caption===savedCaption&&copySaveState!=="saving"?["review" as const]:[])];
  const shell={canVisit,onStepChange:setStep};
  if(loadError)return <WizardShell step="topic" {...shell}><div className="state-card"><p role="alert">{loadError}</p><Link className="button secondary" href="/drafts">내 초안으로 돌아가기</Link></div></WizardShell>;
  if(step==="image") return <WizardShell step={step} {...shell}><ImageStudio topic={topic} imageBrief={imageBrief.trim()||undefined} slideCount={slideCount} approvedImages={images} onApprove={approveImage}/><div className="bottom-action"><button type="button" className="button secondary" onClick={()=>setStep("topic")}>이전: 주제</button>{saveState!=="idle"&&<span role="status">{saveState==="saving"?"이미지 선택을 저장하는 중…":saveState==="saved"?`이미지 ${images.length}장을 저장했어요.`:"저장하지 못했어요. 다시 선택해 주세요."}</span>}{saveState==="error"&&<button type="button" className="button secondary" onClick={()=>void approveImage(images)}>저장 다시 시도</button>}<button className="button primary" disabled={!images.length||saveState!=="saved"} onClick={()=>setStep("copy")}>문안 만들기</button></div></WizardShell>;
  if(step==="copy") return <WizardShell step={step} {...shell}><CopyEditor topic={topic} audience={audience} initialText={caption} onTextChange={setCaption} saving={copySaveState==="saving"} onContinue={text=>void saveCaption(text)}/>{copySaveState==="error"&&<p role="alert">문안을 저장하지 못했어요. 다시 시도해 주세요.</p>}<div className="bottom-action"><button type="button" className="button secondary" onClick={()=>setStep("image")}>이전: 이미지</button></div></WizardShell>;
  if(step==="review") {const reviewImages=images.flatMap(image=>image.preview?[{url:image.preview,source:image.source}]:[]);return <WizardShell step={step} {...shell}><p className="eyebrow">4 최종 확인</p><h1>게시하기 전에 한 번만 확인해요</h1><div className="review-status"><span>이미지 출처 표시 ✓</span><span>금지 표현 없음 ✓</span><span>원본 사진 보존 ✓</span></div><PostPreview caption={caption} imageUrls={reviewImages.map(image=>image.url)}/><ExportActions caption={caption} images={reviewImages} draftId={draftId}/><div className="bottom-action"><button type="button" className="button secondary" onClick={()=>setStep("copy")}>이전: 문안</button></div></WizardShell>;}
  return <WizardShell step="topic" {...shell}><p className="eyebrow">새 게시물 · 1분이면 충분해요</p><h1>오늘은 어떤 이야기로 가게를 소개할까요?</h1><p className="lead">AI 추천 3개 중 하나를 고르거나 직접 적어도 돼요.</p><div className="topic-tools"><button type="button" className="button secondary" disabled={topicsLoading} onClick={()=>void loadTopics(recommendationRound + 1,topics.map(item=>item.title))}>AI 추천 새로고침</button>{topicsLoading&&<GenerationProgress label="추천 주제"/>}</div><div className="topic-grid">{topics.map(item=><button key={item.id} type="button" className={`topic-card ${topic===item.title?"selected":""}`} onClick={()=>changeTopic(item.title,item.audience,item.imageBrief ?? "")}><span className="soft-badge">추천 {item.audience}</span><strong>{item.title}</strong><span>{item.reason}</span></button>)}</div><label className="custom-topic"><span>직접 주제를 적고 싶다면</span><input value={topic} onChange={e=>changeTopic(e.target.value,topicSelectionRef.current.audience)} /></label><div className="bottom-action"><span>나머지는 권장 설정으로 자동 진행돼요.</span><button type="button" className="button primary" disabled={!topic.trim()} onClick={()=>setStep("image")}>이미지 선택</button></div></WizardShell>;
}
