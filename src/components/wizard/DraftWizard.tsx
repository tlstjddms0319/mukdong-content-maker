"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WizardShell, type WizardStep } from "./WizardShell";
import { ReelMaker } from "@/components/reels/ReelMaker";
import { ImageStudio } from "@/components/images/ImageStudio";
import { CopyEditor } from "@/components/copy/CopyEditor";
import { PostPreview } from "@/components/review/PostPreview";
import { ExportActions } from "@/components/review/ExportActions";
import type { ApprovedImage } from "@/components/images/ImageStudio";
import type { TopicSuggestion } from "@/features/topics/schema";
import { fallbackTopics } from "@/features/topics/service";
import { GenerationProgress } from "@/components/states/GenerationState";
import { selectedDraftMedia } from "@/features/drafts/selection";
import type { CarouselSlideCount } from "@/features/images/carousel";
import { useGenerationState } from "@/features/images/generationStore";
import { clearWizardSession, readWizardSession, saveWizardSession } from "@/features/drafts/wizardSession";
import { readJsonResponse } from "@/lib/http/readJson";
import { STYLES, StyleIdSchema, type StyleId } from "@/features/images/styleCatalog";
import { PLAN_DATE_PATTERN, PLAN_POST_TIME_KST } from "@/features/drafts/planLink";

const DEFAULT_TOPICS:TopicSuggestion[] = fallbackTopics();
// 이 브라우저에서 최근에 보여 준 추천 주제(최대 15개)와 마지막 추천 방향 번호. 같은 주제가 매번 나오지 않게 서버에 알려 준다.
const RECENT_TOPICS_KEY="mukdong-recent-topics",TOPIC_ROUND_KEY="mukdong-topic-round";
function readRecentTopics():string[] {
  try{const value=JSON.parse(localStorage.getItem(RECENT_TOPICS_KEY)??"[]");return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string").slice(0,15):[];}catch{return [];}
}
function rememberTopics(titles:string[]){
  try{localStorage.setItem(RECENT_TOPICS_KEY,JSON.stringify([...new Set([...titles,...readRecentTopics()])].slice(0,15)));}catch{/* 저장 공간이 막혀도 추천은 계속한다 */}
}
// 처음 열 때마다 지난번에 본 추천 방향의 다음 방향으로 시작한다(0번 방향만 반복하지 않게). 처음 쓰는 브라우저는 0번.
function nextInitialRound():number {
  try{const last=localStorage.getItem(TOPIC_ROUND_KEY);return last===null?0:((Number(last)||0)+1)%1000;}catch{return 0;}
}
function rememberRound(round:number){try{localStorage.setItem(TOPIC_ROUND_KEY,String(round));}catch{/* 무시 */}}
// 주소·세션에서 받은 게시일·계열 값을 확인해 기획 연결로 만든다. 날짜 형식이 틀리면 연결하지 않고, 모르는 계열은 버린다.
function planLinkFrom(date:string|null|undefined,style:string|null|undefined):{date:string;style?:StyleId}|null {
  if(!date||!PLAN_DATE_PATTERN.test(date))return null;
  const parsed=StyleIdSchema.safeParse(style);
  return {date,...(parsed.success?{style:parsed.data}:{})};
}

export function DraftWizard({slideCount=5}:{slideCount?:CarouselSlideCount}) {
  const [step,setStep]=useState<WizardStep>("topic");
  // 추천 주제는 늦게 도착할 수 있다. 그사이 사용자가 이미지 단계로 넘어갔으면 주제를 바꾸지 않도록 지금 단계를 ref로 본다.
  const stepRef=useRef<WizardStep>("topic");
  useEffect(()=>{stepRef.current=step;},[step]);
  const [topic,setTopic]=useState(DEFAULT_TOPICS[0].title);
  const [audience,setAudience]=useState<"A"|"B"|"C">("C");
  const [imageBrief,setImageBrief]=useState("");
  const [contentBrief,setContentBrief]=useState(DEFAULT_TOPICS[0].summary);
  const [topics,setTopics]=useState(DEFAULT_TOPICS);
  const [topicsLoading,setTopicsLoading]=useState(false);
  const [topicsFallback,setTopicsFallback]=useState(false);
  const [recommendationRound,setRecommendationRound]=useState(0);
  // 서버가 알려 준 이번 시기(계절·다가오는 행사). 추천 화면 위에 "이번 시즌" 한 줄로 보여 준다.
  // 한 달 기획의 게시일 칸에서 시작한 초안이면 그 날짜와 추천 디자인 계열. 저장할 때 날짜를 초안에 남겨 기획표와 이어 준다.
  const [planLink,setPlanLink]=useState<{date:string;style?:StyleId}|null>(null);
  // 네이버 검색이 늘어난 음식 말(키가 있을 때만 서버가 알려 준다).
  const [trendInfo,setTrendInfo]=useState<Array<{keyword:string;growth:number}>>([]);
  const [seasonInfo,setSeasonInfo]=useState<{name:string;events:{name:string;daysAway:number}[]}|null>(null);
  const topicSelectionRef=useRef({topic,audience,imageBrief,contentBrief});
  const topicRequestRef=useRef(0);
  const [images,setImages]=useState<ApprovedImage[]>([]);
  const [caption,setCaption]=useState("");
  const [savedCaption,setSavedCaption]=useState("");
  const [draftId,setDraftId]=useState(()=>crypto.randomUUID());
  const draftIdRef=useRef(draftId);
  const createdAtRef=useRef(new Date().toISOString());
  const [saveState,setSaveState]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const [copySaveState,setCopySaveState]=useState<"idle"|"saving"|"error">("idle");
  // 이미지 단계에서 만든 캐러셀 구성안이 있으면 캡션도 같은 이야기 순서를 따르게 넘긴다. 실제 사진만 쓴 초안에는 없다.
  const generation=useGenerationState();
  const slideOutline=generation.key===`${draftId}|${slideCount}`&&generation.plan?generation.plan.slides.map(slide=>slide.headline):undefined;
  const [loadError,setLoadError]=useState("");
  // 마운트 시 복원 판단이 끝나기 전에는 세션을 쓰지 않는다. 그래야 개발 모드의 effect 재실행이 저장된 세션을 덮어쓰지 않는다.
  const [sessionLoaded,setSessionLoaded]=useState(false);
  const initialQueryRef=useRef<string|null>(null);
  const changeTopic=useCallback((nextTopic:string,nextAudience:"A"|"B"|"C",nextImageBrief="",preserveDraft=false,nextContentBrief="")=>{
    const next={topic:nextTopic,audience:nextAudience,imageBrief:nextImageBrief,contentBrief:nextContentBrief};
    const current=topicSelectionRef.current;
    const changed=current.topic!==next.topic||current.audience!==next.audience||current.imageBrief!==next.imageBrief||current.contentBrief!==next.contentBrief;
    topicSelectionRef.current=next;setTopic(next.topic);setAudience(next.audience);setImageBrief(next.imageBrief);setContentBrief(next.contentBrief);
    if(changed&&!preserveDraft){setPlanLink(null);const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopySaveState("idle");setDraftId(nextDraftId);localStorage.removeItem("mukdong-current-draft");if(window.location.search)window.history.replaceState({},"","/");}
  },[]);
  // round를 주지 않으면(처음 열 때) 지난번 다음 방향으로 시작한다.
  const loadTopics=useCallback(async(requestedRound?:number,excludeTitles:string[]=[])=>{
    const round=requestedRound??nextInitialRound();
    const requestId=++topicRequestRef.current;
    const topicAtRequest=topicSelectionRef.current.topic;
    setTopicsLoading(true);
    try{
      const response=await fetch("/api/topics", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({storeProfile:{name:"묵동홍어마을"},recommendationRound:round,excludeTitles,recentTitles:readRecentTopics()}) });
      if(!response.ok) throw new Error();
      const data=await readJsonResponse(response);
      if(requestId===topicRequestRef.current&&Array.isArray(data.topics)&&data.topics.length===3){
        setTopics(data.topics);setTopicsFallback(data.source==="fallback");rememberTopics(data.topics.map((item:TopicSuggestion)=>item.title));rememberRound(round);if(data.season)setSeasonInfo(data.season);if(Array.isArray(data.trends))setTrendInfo(data.trends);
        // 주제 단계에 머물러 있고 그사이 주제를 직접 바꾸지 않았을 때만 첫 추천으로 자동 선택한다.
        // (이미지 단계로 넘어간 뒤 바꾸면 새 초안이 시작돼 올리던 사진·만들던 이미지가 사라진다.)
        if(stepRef.current==="topic"&&topicSelectionRef.current.topic===topicAtRequest)changeTopic(data.topics[0].title,data.topics[0].audience,data.topics[0].imageBrief ?? "",false,data.topics[0].summary ?? "");
        setRecommendationRound(round);
      }
    }catch{if(requestId===topicRequestRef.current)setTopicsFallback(true);}finally{if(requestId===topicRequestRef.current)setTopicsLoading(false);}
  },[changeTopic]);
  // 이어서 만들던 초안을 두고 완전히 새 초안으로 시작한다. 이전 초안은 서버에 저장된 그대로 내 초안에 남는다.
  const startNewDraft=useCallback(()=>{
    const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();
    setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopySaveState("idle");setLoadError("");setPlanLink(null);setDraftId(nextDraftId);
    localStorage.removeItem("mukdong-current-draft");clearWizardSession();
    if(window.location.search)window.history.replaceState({},"","/");
    setTopics(DEFAULT_TOPICS);changeTopic(DEFAULT_TOPICS[0].title,DEFAULT_TOPICS[0].audience,DEFAULT_TOPICS[0].imageBrief ?? "",true,DEFAULT_TOPICS[0].summary ?? "");
    setStep("topic");
    void loadTopics();
  },[changeTopic,loadTopics]);
  const approveImage=async (approved:ApprovedImage[]) => {
    const savingDraftId=draftIdRef.current;
    // 성과를 디자인 계열별로 비교할 수 있게, 이 초안 카드에 쓴 계열(직접 고른 계열 → 구성안이 고른 계열)을 함께 저장한다.
    // 구성안 없이 사진만 쓴 초안은 계열이 없으므로 남기지 않는다.
    const sameDraft=generation.key===`${savingDraftId}|${slideCount}`;
    const designStyle=sameDraft&&generation.plan?(generation.style!=="auto"?generation.style:generation.plan.design?.style):undefined;
    setImages(approved); setSaveState("saving");
    const now=new Date().toISOString();
    try {
      const response=await fetch("/api/drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:savingDraftId,status:"ready",topic,audience,image_brief:imageBrief,content_brief:contentBrief,media_candidates:approved.map((item,index)=>({id:item.id,source:item.source,file_id:item.preview ?? item.id,purpose:approved.length===1?"instagram-primary":`instagram-${item.role ?? (index===0?"cover":"slide")}`})),selected_media_id:approved[0]?.id ?? null,...(approved.length?{selected_media_ids:approved.map(item=>item.id)}:{}),copy:null,...(caption.trim()?{caption}:{}),...(planLink?{plan_date:planLink.date}:{}),...(designStyle?{design_style:designStyle}:{}),facts_to_verify:[],store_profile_version:"2026-09-10",created_at:createdAtRef.current,updated_at:now})});
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
      // Keep the mount URL stable when React replays effects in development.
      if(initialQueryRef.current===null)initialQueryRef.current=window.location.search;
      const session=readWizardSession();
      const query=new URLSearchParams(initialQueryRef.current);
      if(query.get("new")==="1"){startNewDraft();return;}
      const requestedId=query.get("draft");
      const requestedTopic=query.get("topic")?.trim();
      const requestedAudienceValue=query.get("audience");
      const requestedAudience=requestedAudienceValue==="B"||requestedAudienceValue==="C"?requestedAudienceValue:"A";
      const requestedImageBriefValue=query.get("imageBrief")?.trim()??"";
      const requestedImageBrief=requestedImageBriefValue.length<=500?requestedImageBriefValue:"";
      // 한 달 기획에서 시작하면 주제 설명(brief)도 함께 넘어와 문안·구성안의 설명 방향이 된다.
      const requestedBriefValue=query.get("brief")?.trim()??"";
      const requestedBrief=requestedBriefValue.length<=600?requestedBriefValue:"";
      if(!requestedId&&requestedTopic&&requestedTopic.length<=120){
        localStorage.removeItem("mukdong-current-draft");
        changeTopic(requestedTopic,requestedAudience,requestedImageBrief,false,requestedBrief);
        // 한 달 기획에서 왔으면 게시일·추천 계열을 이어받는다(형식이 틀린 값은 버린다).
        setPlanLink(planLinkFrom(query.get("planDate"),query.get("style")));
        setStep("topic");
        return;
      }
      const savedId=requestedId??localStorage.getItem("mukdong-current-draft");
      if(savedId){
        try{
          const response=await fetch(`/api/drafts?id=${encodeURIComponent(savedId)}`);
          if(response.ok){
            const draft=await readJsonResponse(response);
            const selected=selectedDraftMedia(draft);
            if(active&&draft?.id&&draft?.topic){changeTopic(draft.topic,draft.audience,draft.image_brief??"",true,draft.content_brief??"");setPlanLink(draft.plan_date?{date:draft.plan_date}:null);draftIdRef.current=draft.id;createdAtRef.current=draft.created_at??new Date().toISOString();setDraftId(draft.id);setImages(selected.map(item=>({id:item.id,preview:item.file_id,source:item.source})));setCaption(draft.caption??"");setSavedCaption(draft.caption??"");setSaveState("saved");localStorage.setItem("mukdong-current-draft",draft.id);if(requestedId||!selected.length)setStep(selected.length&&draft.caption?.trim()?"review":"image");if(!requestedId&&session&&session.draftId===draft.id)setStep(session.step);return;}
          }
        }catch{}
        if(requestedId)setLoadError("선택한 초안을 찾지 못했어요. 내 초안에서 다시 골라 주세요.");
        else localStorage.removeItem("mukdong-current-draft");
      }
      if(!active)return;
      // 저장되지 않은 초안이라도 이 탭에서 주제를 고르고 다음 단계로 넘어갔던 것이 있으면 같은 초안·이미지 단계로 돌아간다.
      // 주제 단계에 머물던 세션은 새 방문처럼 다룬다(AI 추천을 다시 받는 기존 흐름 유지).
      // 문안·확인 단계는 서버에 저장된 초안이 있어야 열리므로 세션만으로는 이미지 단계까지만 복원한다.
      if(session&&session.step!=="topic"){changeTopic(session.topic,session.audience,session.imageBrief,true,session.contentBrief);setPlanLink(planLinkFrom(session.planDate,session.planStyle));draftIdRef.current=session.draftId;setDraftId(session.draftId);setStep("image");return;}
      void loadTopics();
    };
    void load().finally(()=>{if(active)setSessionLoaded(true);});
    return () => { active=false; };
  }, [changeTopic,loadTopics,startNewDraft]);
  useEffect(()=>{
    if(!sessionLoaded)return;
    saveWizardSession({draftId,topic,audience,imageBrief,contentBrief,step,...(planLink?{planDate:planLink.date,planStyle:planLink.style}:{})});
  },[sessionLoaded,draftId,topic,audience,imageBrief,contentBrief,step,planLink]);
  const canVisit:WizardStep[]=["topic",...(topic.trim()?["image" as const]:[]),...(images.length&&saveState==="saved"?["copy" as const]:[]),...(caption.trim()&&caption===savedCaption&&copySaveState!=="saving"?["review" as const]:[])];
  // 한 달 기획에서 시작한 초안 안내 한 줄: 언제 올릴 글인지, 어떤 계열을 추천받았는지.
  const planDay=planLink?new Date(`${planLink.date}T00:00:00`):null;
  const planNote=planLink&&planDay?<p className="season-line plan-line">한 달 기획 · {planDay.getMonth()+1}/{planDay.getDate()}({"일월화수목금토"[planDay.getDay()]}) {PLAN_POST_TIME_KST} 게시 예정{planLink.style?` · 추천 계열 ${STYLES[planLink.style].label}`:""}</p>:null;
  const shell={canVisit,onStepChange:setStep,onNewDraft:step==="topic"?undefined:startNewDraft};
  if(loadError)return <WizardShell step="topic" {...shell}><div className="state-card"><p role="alert">{loadError}</p><Link className="button secondary" href="/drafts">내 초안으로 돌아가기</Link></div></WizardShell>;
  if(step==="image") return <WizardShell step={step} {...shell}>{planNote}<ImageStudio preferredStyle={planLink?.style} topic={topic} imageBrief={imageBrief.trim()||undefined} contentBrief={contentBrief.trim()||undefined} slideCount={slideCount} approvedImages={images} onApprove={approveImage} sessionKey={draftId}/><div className="bottom-action"><button type="button" className="button secondary" onClick={()=>setStep("topic")}>이전: 주제</button>{saveState!=="idle"&&<span role="status">{saveState==="saving"?"이미지 선택을 저장하는 중…":saveState==="saved"?`이미지 ${images.length}장을 저장했어요.`:"저장하지 못했어요. 다시 선택해 주세요."}</span>}{saveState==="error"&&<button type="button" className="button secondary" onClick={()=>void approveImage(images)}>저장 다시 시도</button>}<button className="button primary" disabled={!images.length||saveState!=="saved"} onClick={()=>setStep("copy")}>문안 만들기</button></div></WizardShell>;
  if(step==="copy") return <WizardShell step={step} {...shell}><CopyEditor topic={topic} audience={audience} contentBrief={contentBrief} imageBrief={imageBrief} slideOutline={slideOutline} hasAiImages={images.some(image=>image.source==="ai-generated"||image.source==="ai-edited")} initialText={caption} onTextChange={setCaption} saving={copySaveState==="saving"} onContinue={text=>void saveCaption(text)}/>{copySaveState==="error"&&<p role="alert">문안을 저장하지 못했어요. 다시 시도해 주세요.</p>}<div className="bottom-action"><button type="button" className="button secondary" onClick={()=>setStep("image")}>이전: 이미지</button></div></WizardShell>;
  if(step==="review") {const reviewImages=images.flatMap(image=>image.preview?[{url:image.preview,source:image.source}]:[]);return <WizardShell step={step} {...shell}><p className="eyebrow">4 최종 확인</p><h1>게시하기 전에 한 번만 확인해요</h1><div className="review-status" aria-label="게시 전 확인할 항목"><span>사진과 AI 이미지의 출처를 확인해 주세요</span><span>가격·영업시간·메뉴 표현을 확인해 주세요</span><span>원본 사진은 따로 보관해 주세요</span></div><PostPreview caption={caption} imageUrls={reviewImages.map(image=>image.url)}/><ExportActions caption={caption} images={reviewImages} topic={topic} audience={audience} draftId={draftId}/><ReelMaker cards={reviewImages.map(image=>image.url)} coverSource={images[0]?.referencePreview} topic={topic}/><div className="bottom-action"><button type="button" className="button secondary" onClick={()=>setStep("copy")}>이전: 문안</button></div></WizardShell>;}
  return <WizardShell step="topic" {...shell}><p className="eyebrow">새 게시물 · 1분이면 충분해요</p><h1>오늘은 어떤 이야기로 가게를 소개할까요?</h1><p className="lead">일상 음식 궁금증 2개와 홍어 질문 1개를 추천해요. 이번 시기에 맞는 주제도 섞어 드려요.</p>{planNote}{seasonInfo&&<p className="season-line">이번 시즌 · {seasonInfo.name}{seasonInfo.events.map(event=><span key={event.name}> · {event.name}{event.daysAway>0?` ${event.daysAway}일 뒤`:" 진행 중"}</span>)}</p>}{trendInfo.length>0&&<p className="season-line trend-line">요즘 검색이 늘어난 말(네이버){trendInfo.map(trend=><span key={trend.keyword}> · {trend.keyword} +{Math.round((trend.growth-1)*100)}%</span>)}</p>}<div className="topic-tools"><button type="button" className="button secondary" disabled={topicsLoading} onClick={()=>void loadTopics(recommendationRound + 1,topics.map(item=>item.title))}>AI 추천 새로고침</button>{topicsLoading&&<GenerationProgress label="추천 주제"/>}</div>{topicsFallback&&!topicsLoading&&<p role="status" className="field-help">AI 추천을 불러오지 못해 준비된 주제를 보여드려요. 잠시 후 AI 추천 새로고침을 다시 눌러 보세요.</p>}<div className="topic-grid">{topics.map(item=><button key={item.id} type="button" className={`topic-card ${topic===item.title?"selected":""}`} onClick={()=>changeTopic(item.title,item.audience,item.imageBrief ?? "",false,item.summary ?? "")}><span className="topic-badges"><span className="soft-badge">추천 {item.audience}</span>{item.season&&<span className="season-badge">이번 시즌 · {item.season}</span>}</span><strong>{item.title}</strong><span>{item.summary}</span><span>{item.reason}</span></button>)}</div><label className="custom-topic"><span>직접 주제를 적고 싶다면</span><input maxLength={120} value={topic} onChange={e=>changeTopic(e.target.value,topicSelectionRef.current.audience)} /></label><div className="bottom-action"><span>나머지는 권장 설정으로 자동 진행돼요.</span><button type="button" className="button primary" disabled={!topic.trim()} onClick={()=>setStep("image")}>이미지 선택</button></div></WizardShell>;
}
