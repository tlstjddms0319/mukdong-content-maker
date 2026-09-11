"use client";
import { useState } from "react";
import { WizardShell, type WizardStep } from "./WizardShell";
import { ImageStudio } from "@/components/images/ImageStudio";
import { CopyEditor } from "@/components/copy/CopyEditor";
import { PostPreview } from "@/components/review/PostPreview";
import { ExportActions } from "@/components/review/ExportActions";
import type { ApprovedImage } from "@/components/images/ImageStudio";

export function DraftWizard() {
  const [step,setStep]=useState<WizardStep>("topic");
  const [topic,setTopic]=useState("처음 먹는 홍어, 삼합부터");
  const [image,setImage]=useState<ApprovedImage>();
  const [caption,setCaption]=useState("");
  if(step==="image") return <WizardShell step={step}><ImageStudio onApprove={setImage}/><div className="bottom-action"><button className="button primary" onClick={()=>setStep("copy")}>문안 만들기</button></div></WizardShell>;
  if(step==="copy") return <WizardShell step={step}><CopyEditor onContinue={text=>{setCaption(text);setStep("review");}}/></WizardShell>;
  if(step==="review") return <WizardShell step={step}><p className="eyebrow">4 최종 확인</p><h1>게시하기 전에 한 번만 확인해요</h1><div className="review-status"><span>이미지 출처 표시 ✓</span><span>금지 표현 없음 ✓</span><span>원본 사진 보존 ✓</span></div><PostPreview caption={caption} imageUrl={image?.preview}/><ExportActions caption={caption} imageUrl={image?.preview}/></WizardShell>;
  return <WizardShell step="topic"><p className="eyebrow">새 게시물 · 1분이면 충분해요</p><h1>오늘은 어떤 이야기로 가게를 소개할까요?</h1><p className="lead">AI 추천 3개 중 하나를 고르거나 직접 적어도 돼요.</p><div className="topic-grid">{[
    ["처음 먹는 홍어, 삼합부터","처음 방문하는 손님의 선택 부담을 낮춰요.","A"],
    ["한 점을 더 맛있게 먹는 순서","저장해서 다시 보기 좋은 내용이에요.","B"],
    ["오늘 모임 메뉴로 홍어 삼합","모임 장소를 찾는 손님에게 잘 맞아요.","C"]
  ].map(([title,reason,audience])=><button key={title} type="button" className={`topic-card ${topic===title?"selected":""}`} onClick={()=>setTopic(title)}><span className="soft-badge">추천 {audience}</span><strong>{title}</strong><span>{reason}</span></button>)}</div><label className="custom-topic"><span>직접 주제를 적고 싶다면</span><input value={topic} onChange={e=>setTopic(e.target.value)} /></label><div className="bottom-action"><span>나머지는 권장 설정으로 자동 진행돼요.</span><button type="button" className="button primary" onClick={()=>setStep("image")}>이미지 선택</button></div></WizardShell>;
}
