"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WizardShell, type WizardStep } from "./WizardShell";
import { MakeStep } from "./MakeStep";
import { ReviewStep, type CaptionStatus } from "./ReviewStep";
import type { TopicSuggestion } from "@/features/topics/schema";
import { fallbackTopics } from "@/features/topics/service";
import { GenerationProgress } from "@/components/states/GenerationState";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { acknowledgeAuto, adoptImages, cancelGeneration, approvedDeck, createAutomatically, deckComplete, deckPhotoNotes, designStyleOf, ensureGeneration, markApproved, storeCardPending, useGenerationState, type ApprovedImage, type GenerationInput } from "@/features/images/generationStore";
import { CURRENT_DRAFT_KEY, CURRENT_TOPIC_KEY, forgetCurrentDraft, rememberCurrentDraft, saveDraftCaption, saveDraftImages, writePostText, type DraftMeta } from "@/features/drafts/draftSave";
import { clearWizardSession, readWizardSession, saveWizardSession } from "@/features/drafts/wizardSession";
import { readJsonResponse } from "@/lib/http/readJson";
import { formatCopy } from "@/features/copy/writing";
import { PLAN_DATE_PATTERN, PLAN_POST_TIME_KST } from "@/features/drafts/planLink";
import { SAME_TOPIC_SIMILARITY, topicSimilarity } from "@/features/topics/topicSimilarity";
import { TRACK_SLIDE_COUNT, type CarouselTrack } from "@/features/images/track";

const DEFAULT_TOPICS:TopicSuggestion[] = fallbackTopics();
// 추천 카드 배지: 화면에 놓인 순서대로 "추천 A · B · C". 배지는 이것과 "이번 철" 하나만 둔다
// (예전의 독자 유형·검색 증가율 숫자는 사장님이 읽을 필요가 없어 뺐다. 추천 기준에는 그대로 쓰인다).
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
// 장 수는 갈래가 정한다(두 갈래 모두 5장 + 맨 뒤 가게 홍보 카드). 설정의 장 수는 예전 화면에만 쓰였다.
const SLIDES=TRACK_SLIDE_COUNT;
const hasAiImages=(images:ApprovedImage[])=>images.some(image=>image.source==="ai-generated"||image.source==="ai-edited");

export function DraftWizard() {
  const [step,setStep]=useState<WizardStep>("topic");
  // 추천 주제는 늦게 도착할 수 있다. 그사이 사용자가 2단계로 넘어갔으면 주제를 바꾸지 않도록 지금 단계를 ref로 본다.
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
  const unsavedWork=paidWork||(caption.trim()!==""&&caption!==savedCaption);
  const unsavedRef=useRef(unsavedWork);
  useEffect(()=>{unsavedRef.current=unsavedWork;},[unsavedWork]);
  // 새로고침·탭 닫기·로그아웃으로 만들던 것이 사라지기 전에 브라우저가 한 번 묻게 한다.
  useEffect(()=>{
    if(!unsavedWork)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[unsavedWork]);
  const confirmDiscard=()=>!unsavedRef.current||window.confirm("아직 저장하지 않은 사진·글이 있어요. 다른 주제로 바꾸면 사라져요. 바꿀까요?");
  // 지금 게시물이 어떤 주제에서 시작했는지(추천 카드·한 달 계획·저장된 게시물의 제목). 직접 고친 제목이 이것과 비슷하면 같은 게시물로 본다.
  const anchorTopicRef=useRef(topic);
  const changeTopic=useCallback((nextTopic:string,nextAudience:"A"|"B"|"C",nextImageBrief="",preserveDraft=false,nextContentBrief="",keepAnchor=false)=>{
    const next={topic:nextTopic,audience:nextAudience,imageBrief:nextImageBrief,contentBrief:nextContentBrief};
    if(!keepAnchor)anchorTopicRef.current=nextTopic;
    const current=topicSelectionRef.current;
    const changed=current.topic!==next.topic||current.audience!==next.audience||current.imageBrief!==next.imageBrief||current.contentBrief!==next.contentBrief;
    topicSelectionRef.current=next;setTopic(next.topic);setAudience(next.audience);setImageBrief(next.imageBrief);setContentBrief(next.contentBrief);
    if(changed&&!preserveDraft){cancelGeneration(`${draftIdRef.current}|${SLIDES}`);setPlanLink(null);const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopyError("");setDraftId(nextDraftId);forgetCurrentDraft();if(window.location.search)window.history.replaceState({},"","/");}
  },[]);
  // 직접 주제 칸.
  // - 몇 단어만 고친 제목(시작한 주제와 비슷함)이면 같은 게시물·한 달 계획 연결·메모를 그대로 둔다.
  // - 아예 다른 주제를 적으면 새 게시물로 시작한다(다른 주제의 사진·글·메모가 따라가지 않게).
  //   단, 만드는 중이면 지우지 않는다(키를 누를 때마다 물을 수 없으므로 남겨 두고, 다시 만들 수 있게).
  // - 이 게시물에 붙은 것(사진·글·게시일·메모)이 하나도 없으면 지울 것도 없으니 그대로 이어 간다.
  const editTopicText=(value:string)=>{
    const current=topicSelectionRef.current;
    const attached=images.length>0||caption.trim()!==""||planLink!==null||current.imageBrief!==""||current.contentBrief!=="";
    const same=topicSimilarity(value,anchorTopicRef.current)>=SAME_TOPIC_SIMILARITY;
    if(!attached)changeTopic(value,current.audience,current.imageBrief,true,current.contentBrief);
    else if(same||paidWork)changeTopic(value,current.audience,current.imageBrief,true,current.contentBrief,true);
    else changeTopic(value,current.audience,"",false,"");
  };
  // round를 주지 않으면(처음 열 때) 지난번 다음 회차로 시작한다.
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
        setTopics(data.topics);setTopicsFallback(data.source==="fallback");rememberTopics(data.topics.map((item:TopicSuggestion)=>item.title));rememberRound(round);
        // 1단계에 머물러 있고 그사이 주제를 직접 바꾸지 않았을 때만 첫 추천으로 자동 선택한다.
        if(stepRef.current==="topic"&&topicSelectionRef.current.topic===topicAtRequest&&!unsavedRef.current)changeTopic(data.topics[0].title,data.topics[0].audience,data.topics[0].imageBrief ?? "",false,data.topics[0].summary ?? "");
        setRecommendationRound(round);
      }
    }catch{if(requestId===topicRequestRef.current)setTopicsFallback(true);}finally{if(requestId===topicRequestRef.current)setTopicsLoading(false);}
  },[changeTopic]);
  // 이어서 만들던 게시물을 두고 완전히 새로 시작한다. 이전 게시물은 서버에 저장된 그대로 내 게시물에 남는다.
  const startNewDraft=useCallback(()=>{
    cancelGeneration(`${draftIdRef.current}|${SLIDES}`);
    const nextDraftId=crypto.randomUUID();draftIdRef.current=nextDraftId;createdAtRef.current=new Date().toISOString();
    setImages([]);setCaption("");setSavedCaption("");setSaveState("idle");setCopyError("");setLoadError("");setPlanLink(null);setDraftId(nextDraftId);
    forgetCurrentDraft();clearWizardSession();
    if(window.location.search)window.history.replaceState({},"","/");
    setTopics(DEFAULT_TOPICS);changeTopic(DEFAULT_TOPICS[0].title,DEFAULT_TOPICS[0].audience,DEFAULT_TOPICS[0].imageBrief ?? "",true,DEFAULT_TOPICS[0].summary ?? "");
    setStep("topic");
    void loadTopics();
  },[changeTopic,loadTopics]);
  const meta=():DraftMeta=>({id:draftIdRef.current,topic,audience,imageBrief,contentBrief,createdAt:createdAtRef.current,...(planLink?{planDate:planLink.date}:{}),caption});
  // 사진 묶음을 (다시) 저장한다. 3단계에서 장을 다시 만들거나 고쳤을 때, 글자 카드로 바꿨을 때 쓴다.
  const saveImages=async(approved:ApprovedImage[])=>{
    const savingDraftId=draftIdRef.current;
    setImages(approved);setSaveState("saving");setImageNotice("바뀐 사진을 저장하는 중…");
    try{
      await saveDraftImages(meta(),approved,generation.key===`${savingDraftId}|${SLIDES}`?designStyleOf(generation):undefined);
      if(draftIdRef.current!==savingDraftId)return;
      rememberCurrentDraft(savingDraftId,topic);setSaveState("saved");setImageNotice("바뀐 사진을 저장했어요.");
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
  useEffect(()=>{
    if(step==="topic")return;
    ensureGeneration(genKey,JSON.parse(genInputKey) as GenerationInput,step==="review"?images:[]);
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
  // 3단계에서 장을 다시 만들거나(이 장 다시 만들기) 장 고치기·글자 고치기를 하면, 다 그린 뒤 저절로 다시 저장한다.
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
      if(query.get("new")==="1"){startNewDraft();return;}
      const requestedId=query.get("draft");
      const requestedTopic=query.get("topic")?.trim();
      const requestedAudienceValue=query.get("audience");
      const requestedAudience=requestedAudienceValue==="B"||requestedAudienceValue==="C"?requestedAudienceValue:"A";
      const requestedImageBriefValue=query.get("imageBrief")?.trim()??"";
      const requestedImageBrief=requestedImageBriefValue.length<=500?requestedImageBriefValue:"";
      // 한 달 계획에서 시작하면 주제 설명(brief)도 함께 넘어와 글·구성의 설명 방향이 된다.
      const requestedBriefValue=query.get("brief")?.trim()??"";
      const requestedBrief=requestedBriefValue.length<=600?requestedBriefValue:"";
      if(!requestedId&&requestedTopic&&requestedTopic.length<=120){
        forgetCurrentDraft();
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
              // 아주 예전 게시물은 글이 caption이 아니라 copy(나눠 쓴 글)에만 있다. 그 글을 그대로 이어 보여 주고(곧 caption으로 저장된다),
              // 새로 써서 덮어쓰지 않는다.
              const savedText=draft.caption?.trim()?draft.caption as string:draft.copy?formatCopy(draft.copy):"";
              changeTopic(draft.topic,draft.audience,draft.image_brief??"",true,draft.content_brief??"");setPlanLink(draft.plan_date?{date:draft.plan_date}:null);draftIdRef.current=draft.id;createdAtRef.current=draft.created_at??new Date().toISOString();setDraftId(draft.id);setImages(restored);setCaption(savedText);setSavedCaption(draft.caption??"");setCaptionStatus("saved");setSaveState("saved");rememberCurrentDraft(draft.id,draft.topic);
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
      if(session&&session.step!=="topic"){changeTopic(session.topic,session.audience,session.imageBrief,true,session.contentBrief);setPlanLink(planLinkFrom(session.planDate));draftIdRef.current=session.draftId;setDraftId(session.draftId);setStep("image");return;}
      void loadTopics();
    };
    void load().finally(()=>{if(active)setSessionLoaded(true);});
    return () => { active=false; };
  // writeCaption은 만들기 상태가 바뀔 때마다 새로 만들어지지만, 처음 열 때 한 번만 불러오면 된다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeTopic,loadTopics,startNewDraft]);
  useEffect(()=>{
    if(!sessionLoaded)return;
    saveWizardSession({draftId,topic,audience,imageBrief,contentBrief,step,track,...(planLink?{planDate:planLink.date}:{})});
  },[sessionLoaded,draftId,topic,audience,imageBrief,contentBrief,step,planLink,track]);
  const canVisit:WizardStep[]=["topic",...(topic.trim()?["image" as const]:[]),...(images.length&&saveState==="saved"?["review" as const]:[])];
  const planDay=planLink?new Date(`${planLink.date}T00:00:00`):null;
  const planNote=planLink&&planDay?<p className="season-line plan-line">한 달 계획 · {planDay.getMonth()+1}/{planDay.getDate()}({"일월화수목금토"[planDay.getDay()]}) {PLAN_POST_TIME_KST}에 올릴 글</p>:null;
  const shell={canVisit,onStepChange:setStep,onNewDraft:step==="topic"?undefined:()=>{if(confirmDiscard())startNewDraft();}};
  const make=()=>{ensureGeneration(genKey,genInput,[]);void createAutomatically(meta());};
  if(loadError)return <WizardShell step="topic" {...shell}><div className="state-card"><p role="alert">{loadError}</p><Link className="button secondary" href="/drafts">내 게시물로 돌아가기</Link></div></WizardShell>;
  if(step==="image")return <WizardShell step={step} {...shell}>{planNote}<MakeStep topic={topic} track={track} onTrack={setTrack} state={generationMine?generation:{...generation,auto:{stage:"idle",error:""},photos:[],slides:[],phase:"idle",error:""}} onMake={make} onBack={()=>setStep("topic")}/></WizardShell>;
  if(step==="review")return <WizardShell step={step} {...shell}><ReviewStep draftId={draftId} topic={topic} audience={audience} images={images} generation={generationMine?generation:null} caption={caption} onCaption={setCaption} captionStatus={captionShown} writing={writing} copyError={copyError} onRewrite={rewrite} onSaveCaption={()=>caption===savedCaption?Promise.resolve(true):saveCaption(caption)} onFreeCards={cards=>{adoptImages(cards);void saveImages(cards);}} imageNotice={imageNotice}/></WizardShell>;
  const resumeNote=resumeDraft?<div className="resume-draft" role="status"><span>만들던 게시물이 있어요{resumeDraft.topic?` · ${resumeDraft.topic}`:""}</span>{/* 처음부터 다시 읽어 들이도록 페이지를 새로 연다(같은 화면 안 이동이면 열 때 한 번만 읽는 복원이 돌지 않는다). */}<a className="button secondary" href={`/?draft=${encodeURIComponent(resumeDraft.id)}`}>이어서 만들기</a><button type="button" className="button secondary" onClick={()=>{forgetCurrentDraft();setResumeDraft(null);}}>닫기</button></div>:null;
  return <WizardShell step="topic" {...shell}>{resumeNote}
    <h1>무엇을 올릴까요?</h1>
    <p className="lead">추천 주제 하나를 누르거나, 아래 칸에 직접 쓰세요.</p>
    {planNote}
    <div className="topic-tools"><button type="button" className="button secondary" disabled={topicsLoading} onClick={()=>void loadTopics(recommendationRound + 1,topics.map(item=>item.title))}>다른 주제 보기</button>{topicsLoading&&<GenerationProgress label="추천 주제를"/>}</div>
    {topicsFallback&&!topicsLoading&&<p role="status" className="field-help">추천을 불러오지 못해 준비된 주제를 보여 드려요. 잠시 뒤 &apos;다른 주제 보기&apos;를 눌러 보세요.</p>}
    <div className="topic-grid">{topics.map((item,index)=><button key={item.id} type="button" aria-pressed={topic===item.title} className={`topic-card ${topic===item.title?"selected":""}`} onClick={()=>{if(topic!==item.title&&!confirmDiscard())return;changeTopic(item.title,item.audience,item.imageBrief ?? "",false,item.summary ?? "");}}><span className="topic-badges"><span className="soft-badge">{topicCardLabel(index)}</span>{item.season&&<span className="season-badge">이번 철 · {item.season}</span>}</span><strong>{item.title}</strong><span>{item.summary}</span></button>)}</div>
    <label className="custom-topic"><span>직접 쓰기</span><input maxLength={120} value={topic} placeholder="예: 비 오는 날 홍어전" onChange={e=>editTopicText(e.target.value)} /></label>
    <div className="bottom-action"><span/><button type="button" className="button primary big" disabled={!topic.trim()} onClick={()=>setStep("image")}>다음</button></div>
  </WizardShell>;
}
