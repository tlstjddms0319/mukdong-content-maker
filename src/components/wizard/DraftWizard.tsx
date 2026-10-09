"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WizardShell, type WizardStep } from "./WizardShell";
import { MakeStep } from "./MakeStep";
import { TrendLine } from "./TrendLine";
import { TopicCardBody } from "./TopicCardBody";
import type { TrendStatus } from "@/features/topics/naverTrend";
import { ReviewStep, type CaptionStatus } from "./ReviewStep";
import type { TopicSuggestion } from "@/features/topics/schema";
import { fallbackTopics } from "@/features/topics/service";
import { seasonContext } from "@/features/topics/season";
import { GenerationProgress } from "@/components/states/GenerationState";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { addLibraryPhoto, describePhotos, uploadStudioPhoto, type StudioPhoto } from "@/features/images/generationStore";
import { TopicPhotoBox } from "./TopicPhotoBox";
import { meaningfulPhotoName } from "@/features/images/photoName";
import { STOP_RUNNING_QUESTION, acknowledgeAuto, adoptImages, cancelGeneration, approvedDeck, createAutomatically, deckComplete, deckPhotoNotes, designStyleOf, ensureGeneration, studioSnapshotOf, generatingDraftId, isGenerating, markApproved, runningAuto, storeCardPending, useGenerationState, type ApprovedImage, type GenerationInput } from "@/features/images/generationStore";
import { CURRENT_DRAFT_KEY, CURRENT_TOPIC_KEY, forgetCurrentDraft, rememberCurrentDraft, saveDraftCaption, saveDraftImages, writePostText, type DraftMeta } from "@/features/drafts/draftSave";
import { clearWizardSession, readWizardSession, saveWizardSession } from "@/features/drafts/wizardSession";
import { readJsonResponse } from "@/lib/http/readJson";
import { formatCopy, withAiDisclosure } from "@/features/copy/writing";
import { PLAN_DATE_PATTERN, PLAN_POST_TIME_KST } from "@/features/drafts/planLink";
import { SAME_TOPIC_SIMILARITY, topicSimilarity } from "@/features/topics/topicSimilarity";
import { TRACK_SLIDE_COUNT, type CarouselTrack } from "@/features/images/track";

// 서버 연결 실패 때(또는 추천을 받지 않는 화면: 한 달 계획 주제·이어 만들기) 보이는 준비된 주제도 오늘(한국 시간) 계절·행사에 맞춰 고른다(예전에는 시기 없이 골라 계절 표시가 빠졌다).
const DEFAULT_TOPICS:TopicSuggestion[] = fallbackTopics(0,[],seasonContext());
// 추천 카드 이름: 화면에 놓인 순서대로 "추천 A · B · C". 카드 속 모양은 TopicCardBody(제목이 주인공, 계절·검색 표시는 맨 아래 한 줄)
// (예전의 독자 유형·검색 증가율 숫자는 사장님이 읽을 필요가 없어 뺐다. 추천 기준에는 그대로 쓰인다).
// 준비된 주제를 보여 줄 때 붙이는 이유(서버가 이유를 주지 않았을 때, 서버에 아예 닿지 못했을 때).
const TOPIC_FALLBACK_NOTE="잠시 뒤 '다른 주제 보기'를 눌러 보세요.";
const TOPIC_OFFLINE_NOTE="서버와 연결이 잠시 끊겼어요(오래 쉬던 서버는 깨어나는 데 1분쯤 걸려요). 잠시 뒤 '다른 주제 보기'를 눌러 보세요.";
// 직접 쓰는 주제의 최대 글자 수(구성안·이미지·글 쓰기 요청이 받는 주제 길이와 같다).
const TOPIC_MAX=200;
const topicCardLabel=(index:number)=>`추천 ${String.fromCharCode(65+index)}`;
// 이 브라우저에서 최근에 보여 준 추천 주제(최대 15개)와 마지막 추천 회차 번호. 같은 주제가 매번 나오지 않게 서버에 알려 준다.
const RECENT_TOPICS_KEY="mukdong-recent-topics",TOPIC_ROUND_KEY="mukdong-topic-round";
function readRecentTopics():string[] {
  try{const value=JSON.parse(localStorage.getItem(RECENT_TOPICS_KEY)??"[]");return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string").slice(0,15):[];}catch{return [];}
}
function rememberTopics(titles:string[]){
  try{localStorage.setItem(RECENT_TOPICS_KEY,JSON.stringify([...new Set([...titles,...readRecentTopics()])].slice(0,15)));}catch{/* 저장 공간이 막혀도 추천은 계속한다 */}
}
// 처음 열 때마다 지난번에 본 추천 회차의 다음 회차로 시작한다(0번 회차만 반복하지 않게). 처음 쓰는 브라우저는 0번.
function nextInitialRound():number {
  try{const last=localStorage.getItem(TOPIC_ROUND_KEY);return last===null?0:((Number(last)||0)+1)%1000;}catch{return 0;}
}
function rememberRound(round:number){try{localStorage.setItem(TOPIC_ROUND_KEY,String(round));}catch{/* 무시 */}}
// 주소·세션에서 받은 게시일을 확인해 기획 연결로 만든다. 날짜 형식이 틀리면 연결하지 않는다.
// (예전에는 추천 디자인 계열도 함께 받았지만, 이제 디자인은 갈래가 정한다.)
function planLinkFrom(date:string|null|undefined):{date:string}|null {
  return date&&PLAN_DATE_PATTERN.test(date)?{date}:null;
}
// 장 수는 구성안 AI가 내용에 맞춰 4~9장 중에서 정한다(+ 맨 뒤 가게 홍보 카드). 여기 5장은 구성안이 오기 전 진행 표시·기본 문안용이고,
// 만들기 키에도 들어가 예전 초안과 같은 키를 쓴다. 설정의 장 수는 예전 화면에만 쓰였다.
const SLIDES=TRACK_SLIDE_COUNT;
// 이미 다 만든 게시물에서 "만들기"를 다시 누르면 그림을 새로 만든다(시간·돈이 든다). 멈춘 뒤 '다시 해 보기'는 묻지 않는다.
const REMAKE_QUESTION="이미 만든 게시물이 있어요. 처음부터 다시 만들까요? 그림을 새로 만들어요.";
const hasAiImages=(images:ApprovedImage[])=>images.some(image=>image.source==="ai-generated"||image.source==="ai-edited");

export function DraftWizard() {
  const [step,setStep]=useState<WizardStep>("topic");
  // 추천 주제는 늦게 도착할 수 있다. 그사이 사용자가 2단계로 넘어갔으면 주제를 바꾸지 않도록 지금 단계를 ref로 본다.
  const stepRef=useRef<WizardStep>("topic");
  useEffect(()=>{stepRef.current=step;},[step]);
  // 처음에는 비워 두고 추천이 오면 첫 주제를 골라 둔다(예전에는 준비된 주제를 먼저 보였다가 추천으로 바뀌었다).
  const [topic,setTopic]=useState("");
  const [audience,setAudience]=useState<"A"|"B"|"C">("C");
  const [imageBrief,setImageBrief]=useState("");
  const [contentBrief,setContentBrief]=useState("");
  // 비어 있으면 추천을 기다리는 중(빈 카드 자리만 보인다). 열자마자 "만드는 중"으로 시작한다.
  const [topics,setTopics]=useState<TopicSuggestion[]>([]);
  const [topicsLoading,setTopicsLoading]=useState(true);
  // 준비된 주제를 보여 줄 때 그 이유(서버가 알려 준 말, 연결 실패면 연결 안내). 빈 문자열이면 AI 추천.
  const [topicsFallback,setTopicsFallbackReason]=useState("");
  // 네이버 검색 흐름(요즘 검색이 늘어난 음식 말)을 이번 추천에 반영했는지 사장님이 알 수 있게 서버가 알려 준 그대로 둔다.
  const [trendInfo,setTrendInfo]=useState<{status:TrendStatus;keywords:string[]}|null>(null);
  // "다른 주제 보기"를 다시 누를 수 있는 시각(ms). 서버가 무료 AI 분당 한도를 따져 알려 준 초(cooldownSeconds)로 정한다.
  // 기다리는 동안 버튼에 남은 초를 보여 준다(연달아 누르면 AI가 한도에 걸려 준비된 주제·네이버 반영 빠짐이 생겼다).
  const [refreshAt,setRefreshAt]=useState(0);
  const [clock,setClock]=useState(()=>Date.now());
  const refreshWait=Math.max(0,Math.ceil((refreshAt-clock)/1000));
  useEffect(()=>{
    if(refreshAt<=Date.now())return;
    const timer=window.setInterval(()=>{const now=Date.now();setClock(now);if(now>=refreshAt)window.clearInterval(timer);},500);
    return()=>window.clearInterval(timer);
  },[refreshAt]);
  const holdRefresh=(seconds:unknown)=>{const value=typeof seconds==="number"&&Number.isFinite(seconds)?Math.min(120,Math.max(0,seconds)):0;const now=Date.now();setClock(now);setRefreshAt(now+value*1000);};
  const [recommendationRound,setRecommendationRound]=useState(0);
  // 한 달 계획의 게시일 칸에서 시작한 게시물이면 그 날짜. 저장할 때 날짜를 초안에 남겨 계획표와 이어 준다.
  const [planLink,setPlanLink]=useState<{date:string}|null>(null);
  const topicSelectionRef=useRef({topic,audience,imageBrief,contentBrief});
  const topicRequestRef=useRef(0);
  // 2단계에서 고른 갈래. 처음에는 사진 중심(첫 카드)이 골라져 있다.
  const [track,setTrack]=useState<CarouselTrack>("photo");
  const [images,setImages]=useState<ApprovedImage[]>([]);
  const [caption,setCaption]=useState("");
  const [savedCaption,setSavedCaption]=useState("");
  const [captionStatus,setCaptionStatus]=useState<CaptionStatus>("saved");
  const [writing,setWriting]=useState(false);
  const [copyError,setCopyError]=useState("");
  const [imageNotice,setImageNotice]=useState("");
  const [draftId,setDraftId]=useState(()=>crypto.randomUUID());
  const draftIdRef=useRef(draftId);
  const createdAtRef=useRef(new Date().toISOString());
  const [saveState,setSaveState]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const generation=useGenerationState();
  const genKey=`${draftId}|${SLIDES}`;
  const generationMine=generation.key===genKey;
  const [loadError,setLoadError]=useState("");
  // 새 탭으로 열었는데 이 브라우저에 만들던 게시물이 있으면, 바로 들어가지 않고 추천 주제 위에 "이어서 하기"만 보여 준다.
  const [resumeDraft,setResumeDraft]=useState<{id:string;topic:string}|null>(null);
  // 마운트 시 복원 판단이 끝나기 전에는 세션을 쓰지 않는다. 그래야 개발 모드의 effect 재실행이 저장된 세션을 덮어쓰지 않는다.
  const [sessionLoaded,setSessionLoaded]=useState(false);
  const initialQueryRef=useRef<string|null>(null);
  // 아직 저장하지 않은 작업: 이 게시물을 만드는 중이거나(사진·저장·글), 글을 고치고 저장하기 전.
  const autoBusy=generationMine&&(generation.auto.stage==="working"||generation.auto.stage==="saving"||generation.auto.stage==="writing");
  const paidWork=generationMine&&(generation.phase!=="idle"||autoBusy);
  // 이 게시물을 지금 만드는 중인지(자동 만들기·장 고치기). 다른 주제·새로 만들기로 옮기기 전에 따로 묻는다.
  const running=generationMine&&isGenerating(generation);
  // 만들기 화면에 사진을 넣어 두고 아직 만들지 않았으면 그 사진도 저장 안 한 것으로 본다. 다른 주제를 고르면 새 게시물로 바뀌어
  // 사진이 묻지 않고 사라졌다(검수 보고서: 2단계 사진 사라짐). 이제는 바꾸기 전에 한 번 묻는다.
  const pendingPhotos=generationMine&&generation.photos.length>0&&generation.slides.length===0&&images.length===0;
  const unsavedWork=paidWork||pendingPhotos||(caption.trim()!==""&&caption!==savedCaption);
  const unsavedRef=useRef(unsavedWork);
  // 이 게시물에 붙은 것(사진·글·한 달 계획 날짜)이 있는지. 없으면 주제를 바꿔도 새 게시물로 바꿀 필요가 없다.
  const hasAttached=images.length>0||caption.trim()!==""||planLink!==null;
  const attachedRef=useRef(hasAttached);
  useEffect(()=>{attachedRef.current=hasAttached;},[hasAttached]);
  useEffect(()=>{unsavedRef.current=unsavedWork;},[unsavedWork]);
  const runningRef=useRef(running);
  useEffect(()=>{runningRef.current=running;},[running]);
  // 새로고침·탭 닫기·로그아웃으로 만들던 것이 사라지기 전에 브라우저가 한 번 묻게 한다.
  useEffect(()=>{
    if(!unsavedWork)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[unsavedWork]);
  // 만드는 중이면 "그만두고 새로 시작할까요?"(취소하면 만들던 것을 그대로 둔다), 아니면 저장 안 한 글이 있을 때만 묻는다.
  const confirmDiscard=()=>runningRef.current?window.confirm(STOP_RUNNING_QUESTION):!unsavedRef.current||window.confirm("아직 저장하지 않은 사진·글이 있어요. 다른 주제로 바꾸면 사라져요. 바꿀까요?");
  // 지금 게시물이 어떤 주제에서 시작했는지(추천 카드·한 달 계획·저장된 게시물의 제목). 직접 고친 제목이 이것과 비슷하면 같은 게시물로 본다.
  const anchorTopicRef=useRef(topic);
  // 주제 칸을 누가 채웠는지. 새 추천이 오면 첫 주제를 저절로 골라 주는데, 사장님이 직접 쓴 주제나 한 달 계획·주제 모음에서
  // 가져온 주제("user")는 바꾸지 않는다(예전에는 "다른 주제 보기"·사진 넣기에 덮어써지고 한 달 계획 날짜 연결까지 끊겼다, 검수 보고서 B-6).
  // "none": 비어 있음, "auto": 추천에서 고른 주제(카드를 누른 것 포함, 저장된 게시물을 다시 연 것도 여기에 든다).
  const topicSourceRef=useRef<"none"|"auto"|"user">(topic?"user":"none");
  // 지금 게시물(만드는 중이면 그 만들기도)을 내려놓고 빈 새 게시물로 바꾼다. 주제 칸은 건드리지 않는다.
  const freshDraft=useCallback(()=>{
    cancelGeneration(`${draftIdRef.current}|${SLIDES}`);setPlanLink(null);const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopyError("");setDraftId(nextDraftId);forgetCurrentDraft();if(window.location.search)window.history.replaceState({},"","/");
  },[]);
  const changeTopic=useCallback((nextTopic:string,nextAudience:"A"|"B"|"C",nextImageBrief="",preserveDraft=false,nextContentBrief="",keepAnchor=false)=>{
    const next={topic:nextTopic,audience:nextAudience,imageBrief:nextImageBrief,contentBrief:nextContentBrief};
    if(!keepAnchor)anchorTopicRef.current=nextTopic;
    const current=topicSelectionRef.current;
    const changed=current.topic!==next.topic||current.audience!==next.audience||current.imageBrief!==next.imageBrief||current.contentBrief!==next.contentBrief;
    topicSelectionRef.current=next;setTopic(next.topic);setAudience(next.audience);setImageBrief(next.imageBrief);setContentBrief(next.contentBrief);
    if(changed&&!preserveDraft)freshDraft();
  },[freshDraft]);
  // 직접 주제 칸.
  // - 몇 단어만 고친 제목(시작한 주제와 비슷함)이면 같은 게시물·한 달 계획 연결·메모를 그대로 둔다.
  // - 아예 다른 주제를 적으면 새 게시물로 시작한다(다른 주제의 사진·글·메모가 따라가지 않게).
  //   단, 만드는 중이면 지우지 않는다(키를 누를 때마다 물을 수 없으므로 남겨 두고, 다시 만들 수 있게).
  // - 이 게시물에 붙은 것(사진·글·게시일·메모)이 하나도 없으면 지울 것도 없으니 그대로 이어 간다.
  const editTopicText=(value:string)=>{
    topicSourceRef.current=value.trim()?"user":"none";
    const current=topicSelectionRef.current;
    const attached=images.length>0||caption.trim()!==""||planLink!==null||current.imageBrief!==""||current.contentBrief!=="";
    const same=topicSimilarity(value,anchorTopicRef.current)>=SAME_TOPIC_SIMILARITY;
    if(!attached)changeTopic(value,current.audience,current.imageBrief,true,current.contentBrief);
    else if(same||paidWork)changeTopic(value,current.audience,current.imageBrief,true,current.contentBrief,true);
    else changeTopic(value,current.audience,"",false,"");
  };
  // 사진으로 주제 정하기: 1단계에서 먼저 넣은 사진과 사진마다 보이는 것(한 줄). 있으면 추천 요청에 실어 그 사진에서 주제를 고르게 하고,
  // 다음 단계(만들기)로 넘어갈 때 이 게시물의 사진으로 옮긴다.
  const [topicPhotos,setTopicPhotos]=useState<StudioPhoto[]>([]);
  const [topicPhotoStatus,setTopicPhotoStatus]=useState("");
  const [topicPhotoError,setTopicPhotoError]=useState("");
  // topicPhotos와 같은 순서: 사진마다 보이는 것(사진을 못 읽었으면 ""). 추천 요청에는 읽은 것만 보낸다.
  const photoNotesRef=useRef<string[]>([]);
  // 넣은 사진을 읽었는지(하나라도). 못 읽었으면 "사진을 보고 고른 주제예요"라고 하지 않는다(검수 보고서 B-7).
  const [topicPhotosRead,setTopicPhotosRead]=useState(false);
  // round를 주지 않으면(처음 열 때) 지난번 다음 회차로 시작한다.
  const loadTopics=useCallback(async(requestedRound?:number,excludeTitles:string[]=[])=>{
    const round=requestedRound??nextInitialRound();
    const requestId=++topicRequestRef.current;
    const topicAtRequest=topicSelectionRef.current.topic;
    setTopicsLoading(true);
    try{
      const response=await fetch("/api/topics", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({storeProfile:{name:"묵동홍어마을"},recommendationRound:round,excludeTitles,recentTitles:readRecentTopics(),...(photoNotesRef.current.some(Boolean)?{photoNotes:photoNotesRef.current.filter(Boolean)}:{})}) });
      // 너무 빨리 다시 누른 경우(서버가 AI를 부르지 않음): 지금 추천을 그대로 두고 남은 초만 받는다.
      if(response.status===429){const data=await readJsonResponse(response).catch(()=>({}));if(requestId===topicRequestRef.current)holdRefresh((data as {cooldownSeconds?:unknown}).cooldownSeconds??10);return;}
      if(!response.ok) throw new Error();
      const data=await readJsonResponse(response);
      if(requestId===topicRequestRef.current)holdRefresh(data.cooldownSeconds);
      if(requestId===topicRequestRef.current&&Array.isArray(data.topics)&&data.topics.length===3){
        setTopics(data.topics);setTopicsFallbackReason(data.source==="fallback"?(typeof data.fallbackMessage==="string"&&data.fallbackMessage?data.fallbackMessage:TOPIC_FALLBACK_NOTE):"");setTrendInfo(typeof data.trendStatus==="string"?{status:data.trendStatus as TrendStatus,keywords:Array.isArray(data.trends)?data.trends.map((trend:{keyword:string})=>trend.keyword).filter(Boolean):[]}:null);rememberTopics(data.topics.map((item:TopicSuggestion)=>item.title));rememberRound(round);
        // 1단계에 머물러 있고 그사이 주제를 직접 바꾸지 않았을 때만 첫 추천으로 자동 선택한다.
        // 직접 쓴 주제·한 달 계획 주제는 그대로 둔다(topicSourceRef). 붙은 것(사진·글·게시일)이 없으면 새 게시물로 바꾸지 않는다:
        // 바꾸면 "만들던 게시물이 있어요" 기록까지 지워졌다(검수 보고서).
        if(stepRef.current==="topic"&&topicSelectionRef.current.topic===topicAtRequest&&!unsavedRef.current&&topicSourceRef.current!=="user"){
          topicSourceRef.current="auto";
          changeTopic(data.topics[0].title,data.topics[0].audience,data.topics[0].imageBrief ?? "",!attachedRef.current,data.topics[0].summary ?? "");
        }
        setRecommendationRound(round);
      }else if(requestId===topicRequestRef.current)throw new Error("추천 모양이 맞지 않아요.");
    }catch{
      if(requestId!==topicRequestRef.current)return;
      setTopicsFallbackReason(TOPIC_OFFLINE_NOTE);
      // 처음 추천을 못 받았으면(빈 화면) 오늘 계절에 맞춘 준비된 주제를 대신 보이고, 그사이 주제를 직접 안 바꿨으면 첫 주제를 골라 둔다.
      setTopics(current=>current.length?current:DEFAULT_TOPICS);
      if(stepRef.current==="topic"&&topicSelectionRef.current.topic===topicAtRequest&&!topicAtRequest&&!unsavedRef.current){topicSourceRef.current="auto";changeTopic(DEFAULT_TOPICS[0].title,DEFAULT_TOPICS[0].audience,DEFAULT_TOPICS[0].imageBrief ?? "",!attachedRef.current,DEFAULT_TOPICS[0].summary ?? "");}
    }finally{if(requestId===topicRequestRef.current)setTopicsLoading(false);}
  },[changeTopic]);
  // 이어서 만들던 게시물을 두고 완전히 새로 시작한다. 이전 게시물은 서버에 저장된 그대로 내 게시물에 남는다.
  const startNewDraft=useCallback(()=>{
    cancelGeneration(`${draftIdRef.current}|${SLIDES}`);
    const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();
    setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopyError("");setLoadError("");setPlanLink(null);setDraftId(nextDraftId);
    forgetCurrentDraft();clearWizardSession();
    // 1단계에 넣어 둔 주제용 사진과 그 메모도 비운다(새 게시물의 추천이 지난 사진을 따라가지 않게. 검수 보고서 B-5).
    setTopicPhotos([]);photoNotesRef.current=[];setTopicPhotosRead(false);
    if(window.location.search)window.history.replaceState({},"","/");
    // 준비된 주제를 먼저 보이지 않고 곧장 새 추천을 받는다(오면 첫 주제를 골라 둔다).
    setTopics([]);topicSourceRef.current="none";changeTopic("","C","",true,"");
    setStep("topic");
    void loadTopics();
  },[changeTopic,loadTopics]);
  const meta=():DraftMeta=>({id:draftIdRef.current,topic,audience,imageBrief,contentBrief,createdAt:createdAtRef.current,...(planLink?{planDate:planLink.date}:{}),caption});
  // 사진 묶음을 (다시) 저장한다. 3단계에서 장을 다시 만들거나 고쳤을 때, 글자 카드로 바꿨을 때 쓴다.
  const saveImages=async(approved:ApprovedImage[])=>{
    const savingDraftId=draftIdRef.current;
    setImages(approved);setSaveState("saving");setImageNotice("바뀐 사진을 저장하는 중…");
    try{
      const mine=generation.key===`${savingDraftId}|${SLIDES}`;
      await saveDraftImages(meta(),approved,mine?designStyleOf(generation):undefined,mine?studioSnapshotOf(generation):undefined);
      if(draftIdRef.current!==savingDraftId)return;
      rememberCurrentDraft(savingDraftId,topic);setSaveState("saved");
      // 새로 넣은 장에 AI 그림이 있는데 글에 "AI 연출 이미지" 안내가 없으면 붙여 저장한다(글은 처음 쓸 때만 안내를 붙였다, B-8).
      const disclosed=hasAiImages(approved)&&!writing?withAiDisclosure(caption):caption;
      if(disclosed!==caption){setCaption(disclosed);void saveCaption(disclosed);setImageNotice("바뀐 사진을 저장했어요. AI 그림이 들어가 글에 'AI 연출 이미지' 안내를 붙였어요.");}
      else setImageNotice("바뀐 사진을 저장했어요.");
    }catch(error){if(draftIdRef.current===savingDraftId){setSaveState("error");setImageNotice(error instanceof Error?error.message:"사진을 저장하지 못했어요.");}}
  };
  // 글 저장. 성공하면 true(바로 올리기 전에도 부른다).
  const saveCaption=useCallback(async(text:string):Promise<boolean>=>{
    const savingDraftId=draftIdRef.current;
    setCaptionStatus("saving");
    try{
      await saveDraftCaption(savingDraftId,text);
      if(draftIdRef.current===savingDraftId){setSavedCaption(text);setCaptionStatus("saved");}
      return true;
    }catch{if(draftIdRef.current===savingDraftId)setCaptionStatus("error");return false;}
  },[]);
  // 글 (다시) 쓰기. 카드 순서와 사진에 보이는 것을 함께 넘겨 사진과 맞는 글이 되게 한다.
  const writeCaption=useCallback(async(input:{topic:string;audience:"A"|"B"|"C";contentBrief:string;imageBrief:string},withImages:ApprovedImage[])=>{
    const writingDraftId=draftIdRef.current;
    setWriting(true);setCopyError("");
    try{
      const current=generation.key===`${writingDraftId}|${SLIDES}`?generation:null;
      const text=await writePostText({topic:input.topic,audience:input.audience,contentBrief:input.contentBrief||undefined,imageBrief:input.imageBrief||undefined,hasAiImages:hasAiImages(withImages),slideOutline:current?.plan?.slides.map(slide=>slide.headline),photoNotes:current?deckPhotoNotes(current):undefined});
      if(draftIdRef.current!==writingDraftId)return;
      setCaption(text);
      await saveCaption(text);
    }catch(error){if(draftIdRef.current===writingDraftId)setCopyError(error instanceof Error?error.message:"글을 쓰지 못했어요. '글 다시 쓰기'를 눌러 주세요.");}
    finally{if(draftIdRef.current===writingDraftId)setWriting(false);}
  },[generation,saveCaption]);
  const rewrite=()=>{
    if(caption.trim()&&caption!==savedCaption&&!window.confirm("고친 글이 새 글로 바뀌어요. 다시 쓸까요?"))return;
    void writeCaption({topic,audience,contentBrief,imageBrief},images);
  };
  // 고친 글은 잠시 뒤 저절로 저장한다(저장 버튼을 따로 누르지 않게).
  useEffect(()=>{
    if(step!=="review"||writing||caption===savedCaption||!caption.trim())return;
    const timer=window.setTimeout(()=>void saveCaption(caption),1200);
    return()=>window.clearTimeout(timer);
  },[step,writing,caption,savedCaption,saveCaption]);
  const captionShown:CaptionStatus=caption!==savedCaption&&captionStatus!=="saving"&&captionStatus!=="error"?"unsaved":captionStatus;

  // 2단계·3단계는 이 게시물의 만들기 상태를 쓴다. 3단계는 저장된 사진을 넘겨, 저장된 게시물을 다시 열었을 때도 장 고치기를 쓸 수 있게 한다.
  const genInput:GenerationInput={topic,...(imageBrief.trim()?{imageBrief:imageBrief.trim()}:{}),...(contentBrief.trim()?{contentBrief:contentBrief.trim()}:{}),slideCount:SLIDES,track};
  const genInputKey=JSON.stringify(genInput);
  // 내 게시물에서 다시 연 게시물의 만들기 상태(그 게시물 id와 함께). 다른 게시물에는 쓰지 않는다.
  const studioRef=useRef<{draftId:string;studio:unknown}|null>(null);
  useEffect(()=>{
    if(step==="topic")return;
    const saved=step==="review"&&studioRef.current&&genKey.startsWith(`${studioRef.current.draftId}|`)?studioRef.current.studio:undefined;
    ensureGeneration(genKey,JSON.parse(genInputKey) as GenerationInput,step==="review"?images:[],saved);
  },[step,genKey,genInputKey,images]);
  // 자동 만들기가 끝나면(다른 화면에 다녀왔어도) 만든 장·글을 가져와 3단계로 넘어간다.
  // 그사이 1단계로 돌아가 있으면 화면을 옮기지 않고 3단계 단추만 열어 둔다(주제를 적는 중에 화면이 바뀌지 않게).
  const auto=generationMine?generation.auto:null;
  useEffect(()=>{
    if(auto?.stage!=="done")return;
    const made=auto.images??[],text=auto.caption??"";
    acknowledgeAuto();
    // 바깥 상태(만들기 저장소)에서 받은 값을 화면 상태로 옮긴다.
    queueMicrotask(()=>{
      setImages(made);setSaveState("saved");setImageNotice("");
      setCaption(text);setSavedCaption(auto.captionSaved?text:"");setCaptionStatus(auto.captionSaved?"saved":"error");setCopyError(auto.copyError??"");
      if(stepRef.current==="image")setStep("review");
    });
  },[auto]);
  // 3단계에서 장을 다시 만들거나(장 고치기) 장 넣기·빼기를 하면, 다 그린 뒤 저절로 다시 저장한다.
  const deckToSave=step==="review"&&generationMine&&!generation.approved&&generation.phase==="idle"&&deckComplete(generation)&&!storeCardPending(generation)?approvedDeck(generation):null;
  const deckChanged=Boolean(deckToSave&&deckToSave.map(image=>image.id).join("|")!==images.map(image=>image.id).join("|"));
  const saveImagesRef=useRef(saveImages);
  useEffect(()=>{saveImagesRef.current=saveImages;});
  useEffect(()=>{
    if(!deckChanged||!deckToSave)return;
    markApproved();
    void saveImagesRef.current(deckToSave);
  },[deckChanged,deckToSave]);

  useEffect(() => {
    let active=true;
    const load=async()=>{
      // Keep the mount URL stable when React replays effects in development.
      if(initialQueryRef.current===null)initialQueryRef.current=window.location.search;
      const session=readWizardSession();
      if(session?.track)setTrack(session.track);
      const query=new URLSearchParams(initialQueryRef.current);
      // 다른 화면에 다녀오는 사이에도 만들기는 이 모듈에서 계속 돈다. 화면이 새로 열렸을 때:
      // - 주소가 다른 게시물·새로 만들기·새 주제를 가리키면 한 번 묻는다. "확인"이면 그 만들기를 멈추고 주소대로 연다.
      // - 그냥 "만들기" 메뉴로 왔거나 "취소"면 만드는 중인 게시물로 돌아가 진행 화면을 보여 준다(소리 없이 멈추지 않게).
      const runningId=generatingDraftId();
      let requestedId=query.get("draft");
      if(runningId){
        const wantsOther=query.get("new")==="1"||Boolean(requestedId&&requestedId!==runningId)||(!requestedId&&Boolean(query.get("topic")?.trim()));
        if(wantsOther&&window.confirm(STOP_RUNNING_QUESTION))cancelGeneration(`${runningId}|${SLIDES}`);
        else{
          // 개발 모드에서 effect가 다시 돌아도 같은 질문을 두 번 하지 않게 처음 주소를 비운다.
          initialQueryRef.current="";if(window.location.search)window.history.replaceState({},"","/");
          const auto=runningAuto();
          if(auto){
            const {meta}=auto;
            topicSourceRef.current="user";changeTopic(meta.topic,meta.audience,meta.imageBrief,true,meta.contentBrief);setPlanLink(planLinkFrom(meta.planDate));
            draftIdRef.current=meta.id;createdAtRef.current=meta.createdAt;setDraftId(meta.id);if(auto.track)setTrack(auto.track);
            setStep("image");
            return;
          }
          // 확인 화면의 "장 고치기"처럼 저장된 게시물을 고치는 중이면 그 게시물을 다시 연다.
          requestedId=runningId;
        }
      }
      if(query.get("new")==="1"&&!generatingDraftId()){startNewDraft();return;}
      const requestedTopic=requestedId===query.get("draft")?query.get("topic")?.trim():undefined;
      const requestedAudienceValue=query.get("audience");
      const requestedAudience=requestedAudienceValue==="B"||requestedAudienceValue==="C"?requestedAudienceValue:"A";
      const requestedImageBriefValue=query.get("imageBrief")?.trim()??"";
      const requestedImageBrief=requestedImageBriefValue.length<=500?requestedImageBriefValue:"";
      // 한 달 계획에서 시작하면 주제 설명(brief)도 함께 넘어와 글·구성의 설명 방향이 된다.
      const requestedBriefValue=query.get("brief")?.trim()??"";
      const requestedBrief=requestedBriefValue.length<=600?requestedBriefValue:"";
      if(!requestedId&&requestedTopic&&requestedTopic.length<=TOPIC_MAX){
        forgetCurrentDraft();
        // 한 달 계획·주제 모음에서 가져온 주제는 사장님이 고른 것이다(새 추천이 와도 바꾸지 않는다).
        topicSourceRef.current="user";
        changeTopic(requestedTopic,requestedAudience,requestedImageBrief,false,requestedBrief);
        setPlanLink(planLinkFrom(query.get("planDate")));
        setStep("topic");
        return;
      }
      const savedId=requestedId??localStorage.getItem(CURRENT_DRAFT_KEY);
      // 새 방문(이 탭의 진행 기록이 없음): 지난 게시물로 곧장 들어가면 추천 주제를 못 받고, 이미 올린 게시물을 덮어쓸 수도 있다.
      if(!requestedId&&savedId&&!session){
        setResumeDraft({id:savedId,topic:localStorage.getItem(CURRENT_TOPIC_KEY)??""});
        void loadTopics();
        return;
      }
      if(savedId){
        try{
          const response=await fetch(`/api/drafts?id=${encodeURIComponent(savedId)}`);
          if(response.ok){
            const draft=await readJsonResponse(response);
            const selected=selectedDraftMedia(draft);
            if(active&&draft?.id&&draft?.topic){
              // 예전 계열·예전 방식으로 만든 게시물도 저장된 사진·글 그대로 연다(다시 그리지 않는다).
              const restored=selected.map(item=>({id:item.id,preview:item.file_id,source:item.source}));
              // 함께 저장한 만들기 상태(구성안·밑바탕)가 있으면 3단계에서 장 고치기를 그대로 쓰게 되살린다.
              studioRef.current=draft.studio?{draftId:draft.id,studio:draft.studio}:null;
              // 아주 예전 게시물은 글이 caption이 아니라 copy(나눠 쓴 글)에만 있다. 그 글을 그대로 이어 보여 주고(곧 caption으로 저장된다),
              // 새로 써서 덮어쓰지 않는다.
              const savedText=draft.caption?.trim()?draft.caption as string:draft.copy?formatCopy(draft.copy):"";
              topicSourceRef.current="auto";changeTopic(draft.topic,draft.audience,draft.image_brief??"",true,draft.content_brief??"");setPlanLink(draft.plan_date?{date:draft.plan_date}:null);draftIdRef.current=draft.id;createdAtRef.current=draft.created_at??new Date().toISOString();setDraftId(draft.id);setImages(restored);setCaption(savedText);setSavedCaption(draft.caption??"");setCaptionStatus("saved");setSaveState("saved");rememberCurrentDraft(draft.id,draft.topic);
              const target:WizardStep=selected.length?"review":"image";
              setStep(!requestedId&&session&&session.draftId===draft.id&&(session.step!=="review"||selected.length)?session.step:target);
              // 사진은 있는데 글이 없는 게시물(예전 화면에서 사진만 저장)은 열면서 글을 써 준다.
              if(selected.length&&!savedText.trim())void writeCaption({topic:draft.topic,audience:draft.audience,contentBrief:draft.content_brief??"",imageBrief:draft.image_brief??""},restored);
              return;
            }
          }
        }catch{}
        if(requestedId)setLoadError("고른 게시물을 찾지 못했어요. 내 게시물에서 다시 골라 주세요.");
        else forgetCurrentDraft();
      }
      if(!active)return;
      // 저장되지 않은 게시물이라도 이 탭에서 주제를 고르고 다음 단계로 넘어갔던 것이 있으면 같은 게시물·2단계로 돌아간다
      // (만드는 중이었으면 그 진행 상황이 그대로 보인다). 확인 단계는 서버에 저장된 게시물이 있어야 열린다.
      if(session&&session.step!=="topic"){topicSourceRef.current="user";changeTopic(session.topic,session.audience,session.imageBrief,true,session.contentBrief);setPlanLink(planLinkFrom(session.planDate));draftIdRef.current=session.draftId;setDraftId(session.draftId);setStep("image");return;}
      void loadTopics();
    };
    // 추천을 받지 않고 끝난 경우(한 달 계획 주제, 이어 만들던 게시물): 1단계로 돌아왔을 때 빈 화면이 아니게 준비된 주제를 둔다.
    void load().finally(()=>{if(!active)return;setSessionLoaded(true);if(!topicRequestRef.current){setTopics(current=>current.length?current:DEFAULT_TOPICS);setTopicsLoading(false);}});
    return () => { active=false; };
  // writeCaption은 만들기 상태가 바뀔 때마다 새로 만들어지지만, 처음 열 때 한 번만 불러오면 된다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeTopic,loadTopics,startNewDraft]);
  useEffect(()=>{
    if(!sessionLoaded)return;
    saveWizardSession({draftId,topic,audience,imageBrief,contentBrief,step,track,...(planLink?{planDate:planLink.date}:{})});
  },[sessionLoaded,draftId,topic,audience,imageBrief,contentBrief,step,planLink,track]);
  // 만드는 중에는 3단계로 건너뛰지 않는다(다 만들면 저절로 넘어간다. 예전 사진을 보다가 새 장과 섞이지 않게).
  const canVisit:WizardStep[]=["topic",...(topic.trim()?["image" as const]:[]),...(images.length&&saveState==="saved"&&!running?["review" as const]:[])];
  const planDay=planLink?new Date(`${planLink.date}T00:00:00`):null;
  const planNote=planLink&&planDay?<p className="season-line plan-line">한 달 계획 · {planDay.getMonth()+1}/{planDay.getDate()}({"일월화수목금토"[planDay.getDay()]}) {PLAN_POST_TIME_KST}에 올릴 글</p>:null;
  const make=()=>{
    if(images.length&&(generationMine?generation.auto.stage:"idle")!=="error"&&!window.confirm(REMAKE_QUESTION))return;
    ensureGeneration(genKey,genInput,[]);void createAutomatically(meta());
  };
  // 1단계 "다음". 만드는 중에 아예 다른 주제를 적었으면 여기서 묻는다(글자를 칠 때마다 물을 수는 없어서 적는 동안은 그대로 둔다).
  // "확인"이면 새 주제로 새 게시물, "취소"면 만들던 주제로 되돌리고 진행 화면으로 간다.
  // "확인"은 주제 칸이 이미 새 주제라 changeTopic만으로는 "바뀐 것 없음"으로 보일 수 있다(메모 없는 직접 쓴 주제). 그래서 직접 새 게시물로 바꾼다.
  // 단계 표시줄의 "2 만들기"와 같은 화면 안의 "만들기" 메뉴도 이 길로 보낸다(옆길로 가면 묻지 않고 주제만 바뀌었다).
  const goNext=()=>{
    let backToRunning=running;
    if(running&&topicSimilarity(topic,generation.input.topic)<SAME_TOPIC_SIMILARITY){
      if(window.confirm(STOP_RUNNING_QUESTION)){freshDraft();changeTopic(topic,audience,"",true,"");backToRunning=false;}
      else changeTopic(generation.input.topic,audience,imageBrief,true,contentBrief);
    }
    // 1단계에서 주제용으로 넣은 사진은 이 게시물의 사진으로 옮긴다(만들기 화면에 그대로 보이고 카드에 쓰인다).
    // 만드는 중인 다른 게시물로 돌아가는 경우에는 옮기지 않는다(그 게시물의 사진이 바뀌지 않게).
    if(topicPhotos.length&&!backToRunning){
      ensureGeneration(`${draftIdRef.current}|${SLIDES}`,{...genInput,topic:topicSelectionRef.current.topic},[]);
      topicPhotos.forEach(photo=>addLibraryPhoto(photo));
      // 사진은 이 게시물로 옮겼으니 주제 추천에서는 더 쓰지 않는다(이후 "다른 주제 보기"·새로 만들기가 그 사진 기준으로 나오던 문제, B-5).
      setTopicPhotos([]);photoNotesRef.current=[];setTopicPhotosRead(false);
    }
    setStep("image");
  };
  const visitStep=(next:WizardStep)=>{if(next==="image"&&step==="topic")goNext();else setStep(next);};
  // 만드는 중에 "만들기" 메뉴를 누르면(같은 화면이라 새로 열리지 않는다) 진행 화면으로 돌아간다. 확인 화면의 다시 그리기는 그 화면 그대로.
  const backToProgress=running&&autoBusy?()=>visitStep("image"):undefined;
  // 사진을 넣으면: 보관함에 올리고(큰 사진은 줄여서) → 사진에 보이는 것을 읽고 → 그 사진으로 주제 3개를 새로 받는다.
  const addTopicPhotos=async(files:File[])=>{
    if(!files.length)return;
    setTopicPhotoError("");
    let next=topicPhotos;
    try{
      for(const [i,file] of files.entries()){
        setTopicPhotoStatus(`사진을 올리고 있어요 ${i+1}/${files.length}`);
        const photo=await uploadStudioPhoto(file);
        if(!next.some(item=>item.id===photo.id))next=[...next,photo];
        setTopicPhotos(next);
      }
    }catch(error){setTopicPhotoError(error instanceof Error?error.message:"사진을 올리지 못했어요.");}
    if(!next.length){setTopicPhotoStatus("");return;}
    setTopicPhotoStatus("사진을 보고 주제를 생각하고 있어요…");
    const notes=await describePhotos(next,"");
    // 사진을 못 읽었으면(AI 키 없음 등) 뜻이 있는 사진 이름("홍어무침.jpg")만 대신 쓴다. "IMG_1234"·"KakaoTalk_…" 같은 이름은 쓰지 않는다.
    photoNotesRef.current=notes.map((note,i)=>note||meaningfulPhotoName(next[i].name));
    setTopicPhotosRead(photoNotesRef.current.some(Boolean));
    setTopicPhotoStatus("");
    await loadTopics(recommendationRound+1,[]);
  };
  const removeTopicPhoto=(index:number)=>{
    const next=topicPhotos.filter((_,i)=>i!==index);
    setTopicPhotos(next);
    photoNotesRef.current=photoNotesRef.current.filter((_,i)=>i!==index);
    if(!next.length)photoNotesRef.current=[];
    setTopicPhotosRead(photoNotesRef.current.some(Boolean));
    void loadTopics(recommendationRound+1,[]);
  };
  const shell={canVisit,onStepChange:visitStep,onCreateMenu:backToProgress,onNewDraft:step==="topic"?undefined:()=>{if(confirmDiscard())startNewDraft();}};
  if(loadError)return <WizardShell step="topic" {...shell}><div className="state-card"><p role="alert">{loadError}</p><Link className="button secondary" href="/drafts">내 게시물로 돌아가기</Link></div></WizardShell>;
  if(step==="image")return <WizardShell step={step} {...shell}>{planNote}<MakeStep topic={topic} track={track} onTrack={setTrack} state={generationMine?generation:{...generation,auto:{stage:"idle",error:""},photos:[],slides:[],phase:"idle",error:""}} onMake={make} onBack={()=>setStep("topic")}/></WizardShell>;
  if(step==="review")return <WizardShell step={step} {...shell}><ReviewStep draftId={draftId} topic={topic} audience={audience} images={images} generation={generationMine?generation:null} caption={caption} savedCaption={savedCaption} onCaption={setCaption} captionStatus={captionShown} writing={writing} copyError={copyError} onRewrite={rewrite} onSaveCaption={()=>caption===savedCaption?Promise.resolve(true):saveCaption(caption)} onFreeCards={cards=>{adoptImages(cards);void saveImages(cards);}} imageNotice={imageNotice}/></WizardShell>;
  const resumeNote=resumeDraft?<div className="resume-draft" role="status"><span>만들던 게시물이 있어요{resumeDraft.topic?` · ${resumeDraft.topic}`:""}</span>{/* 처음부터 다시 읽어 들이도록 페이지를 새로 연다(같은 화면 안 이동이면 열 때 한 번만 읽는 복원이 돌지 않는다). */}<a className="button secondary" href={`/?draft=${encodeURIComponent(resumeDraft.id)}`}>이어서 만들기</a><button type="button" className="button secondary" onClick={()=>{forgetCurrentDraft();setResumeDraft(null);}}>닫기</button></div>:null;
  return <WizardShell step="topic" {...shell}>{resumeNote}
    <h1>무엇을 올릴까요?</h1>
    <p className="lead">추천 주제 하나를 누르거나, 아래 칸에 직접 쓰세요.</p>
    {planNote}
    <TopicPhotoBox photos={topicPhotos} busy={topicsLoading||topicPhotoStatus!==""} status={topicPhotoStatus} error={topicPhotoError} onAdd={files=>void addTopicPhotos(files)} onRemove={removeTopicPhoto}/>
    {topicPhotos.length>0&&!topicsLoading&&!topicPhotoStatus&&<p className="field-help topic-photo-note">{topicPhotosRead?"넣은 사진을 보고 고른 주제예요.":"사진에 무엇이 있는지 읽지 못해 평소처럼 추천했어요. 넣은 사진은 만들기에서 그대로 써요."}</p>}
    <div className="topic-tools"><button type="button" className="button secondary" disabled={topicsLoading||refreshWait>0} onClick={()=>void loadTopics(recommendationRound + 1,topics.map(item=>item.title))}>{refreshWait>0?`다른 주제 보기 (${refreshWait}초)`:"다른 주제 보기"}</button>{topicsLoading&&<GenerationProgress label="추천 주제를"/>}{!topicsLoading&&refreshWait>0&&<span className="field-help refresh-wait">AI가 쉬지 않게 {refreshWait}초 뒤에 다시 볼 수 있어요.</span>}</div>
    {topicsFallback&&!topicsLoading&&<p role="status" className="field-help">준비된 주제를 보여 드려요. {topicsFallback}</p>}
    {trendInfo&&!topicsLoading&&<TrendLine info={trendInfo} used={topics.filter(item=>item.trend).map(item=>item.trend)} prepared={topicsFallback!==""}/>}
    {/* 추천을 기다리는 동안은 카드 자리만 보인다(글자 없는 빈 카드). */}
    {!topics.length&&<div className="topic-grid" aria-hidden="true">{[0,1,2].map(index=><div key={index} className="topic-card topic-card-placeholder"><span className="topic-card-label">{topicCardLabel(index)}</span><span className="placeholder-line"/><span className="placeholder-line short"/></div>)}</div>}
    {topics.length>0&&<div className="topic-grid">{topics.map((item,index)=><button key={item.id} type="button" aria-pressed={topic===item.title} className={`topic-card ${topic===item.title?"selected":""}`} onClick={()=>{if(topic!==item.title&&!confirmDiscard())return;topicSourceRef.current="auto";changeTopic(item.title,item.audience,item.imageBrief ?? "",false,item.summary ?? "");}}><TopicCardBody label={topicCardLabel(index)} title={item.title} season={item.season} trend={item.trend} selected={topic===item.title}/></button>)}</div>}
    {/* 직접 쓰기: 넓은 두 줄 칸(TOPIC_MAX자까지). 줄바꿈은 주제에 넣지 않고 띄어쓰기로 바꾼다(Enter를 눌러도 한 줄 주제). */}
    <label className="custom-topic"><span>직접 쓰기 <small aria-hidden="true">({topic.length}/{TOPIC_MAX}자)</small></span><textarea aria-label="직접 쓰기" rows={2} maxLength={TOPIC_MAX} value={topic} placeholder="예: 비 오는 날 홍어전엔 왜 막걸리가 생각날까?" onChange={e=>editTopicText(e.target.value.replace(/\s*\n\s*/g," "))} /></label>
    <div className="bottom-action"><span/><button type="button" className="button primary big" disabled={!topic.trim()} onClick={goNext}>다음</button></div>
  </WizardShell>;
}
