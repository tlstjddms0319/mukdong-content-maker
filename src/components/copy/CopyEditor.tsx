"use client";
import { useEffect, useRef, useState } from "react";
import type { CopyPart } from "@/features/copy/schema";
import { AI_IMAGE_DISCLOSURE, copySection, copyTextIssues, formatCopy } from "@/features/copy/writing";
import { checkTextClaims } from "@/features/guard/service";
import { GenerationProgress } from "@/components/states/GenerationState";

const PROVIDER_LABELS:Record<string,string>={gemini:"Gemini",groq:"Groq",cloudflare:"Cloudflare"};

export function CopyEditor({topic="처음 먹는 홍어, 삼합부터",audience="A",contentBrief,imageBrief,hasAiImages=false,initialText,onTextChange,onContinue,saving=false}:{topic?:string;audience?:"A"|"B"|"C";contentBrief?:string;imageBrief?:string;hasAiImages?:boolean;initialText?:string;onTextChange?:(text:string)=>void;onContinue:(text:string)=>void;saving?:boolean}) {
  const [text,setText]=useState(initialText??"");
  const [status,setStatus]=useState<"loading"|"ai"|"fallback"|"saved">(initialText?"saved":"loading");
  const [provider,setProvider]=useState("");
  const [error,setError]=useState("");
  const [factsToVerify,setFactsToVerify]=useState<string[]>([]);
  const writingIssues=copyTextIssues(text);
  const facts=[...new Set([...factsToVerify,...checkTextClaims(text).verify])];
  const disclosureMissing=hasAiImages&&!text.includes(AI_IMAGE_DISCLOSURE);
  const edited=useRef(Boolean(initialText)),runRef=useRef(0);
  const generate=async(focus?:CopyPart)=>{
    const current=text,section=focus?copySection(current,focus):undefined;
    if(focus&&!section){setError("부분 수정은 첫 문장·본문·가게 소개·마무리가 빈 줄로 나뉜 문안에서 사용할 수 있어요.");return;}
    const run=++runRef.current;edited.current=false;setStatus("loading");setError("");
    try{
      const response=await fetch("/api/copy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,audience,contentBrief,imageBrief,hasAiImages,focus,...(focus?{currentText:current}:{})})});
      const copy=await response.json();
      if(!response.ok)throw new Error(copy.message||"문안을 만들지 못했어요. 다시 시도해 주세요.");
      if(run!==runRef.current)return;
      const next=section?current.slice(0,section.start)+(section.start===current.length?"\n\n":"")+copy.replacement+current.slice(section.end):formatCopy(copy);
      if(next.length>2200)throw new Error("문안이 2,200자를 넘었어요. 글을 줄인 뒤 다시 시도해 주세요.");
      if(!edited.current){setText(next);onTextChange?.(next);if(!focus)setFactsToVerify(copy.facts_to_verify??[]);}
      setProvider(String((copy as {_meta?:{provider?:string}})._meta?.provider??""));
      setStatus("ai");
    }catch(reason){if(run===runRef.current){setStatus("fallback");setError(reason instanceof Error?reason.message:"문안 생성에 실패했어요. 기존 글은 그대로 있어요.");}}
  };
  useEffect(()=>{
    if(edited.current)return;
    const runCounter=runRef;
    let active=true;
    fetch("/api/copy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,audience,contentBrief,imageBrief,hasAiImages})})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message||"문안을 만들지 못했어요.");return body;})
      .then(copy=>{if(active){if(!edited.current){const next=formatCopy(copy);setText(next);onTextChange?.(next);setFactsToVerify(copy.facts_to_verify??[]);}setProvider(String(copy._meta?.provider??""));setStatus("ai");}})
      .catch(reason=>{if(active){setStatus("fallback");setError(reason instanceof Error?reason.message:"문안을 만들지 못했어요. 다시 시도해 주세요.");}});
    return ()=>{active=false;runCounter.current++;};
  },[topic,audience,contentBrief,imageBrief,hasAiImages,onTextChange]);
  return <section className="copy-layout" aria-labelledby="copy-title"><div>
    <p className="eyebrow">3 문안</p><h2 id="copy-title">완성된 글을 확인해요</h2><p className="lead">음식 이야기에서 묵동홍어마을 방문 안내까지 자연스럽게 이어가요. 글 길이는 설정에서 바꿀 수 있어요.</p>
    {contentBrief&&<p className="copy-brief"><strong>글의 설명 방향</strong><br/>{contentBrief}</p>}
    {imageBrief&&<p className="copy-brief"><strong>이미지와 맞출 이야기</strong><br/>{imageBrief}</p>}
    {status==="loading"?<GenerationProgress label="AI가 문안을"/>:<p role="status">{status==="saved"?"저장된 문안을 불러왔어요.":status==="ai"?`AI로 문안을 만들었어요${provider?` (${PROVIDER_LABELS[provider]??provider})`:""}`:"문안 생성이 완료되지 않았어요."}</p>}
    {error&&<p role="alert">{error}</p>}
    <textarea aria-label="게시물 문안" rows={18} maxLength={2200} value={text} onChange={event=>{edited.current=true;setText(event.target.value);onTextChange?.(event.target.value);}}/>
    <p>{text.length.toLocaleString()} / 2,200자 · 해시태그는 관련성 높은 3~5개를 사용해요.</p>
    <button type="button" className="button secondary" disabled={status==="loading"||saving} onClick={()=>void generate()}>전체 문안 새로 생성</button>
    <div className="copy-actions">{([["첫 문장 다시 만들기","hook"],["가게 연결 다시 만들기","store_connection"],["마무리 다시 만들기","call_to_action"],["해시태그 다시 만들기","hashtags"]] as const).map(([label,focus])=><button type="button" key={focus} className="button secondary" disabled={status==="loading"||saving||!text.trim()} onClick={()=>void generate(focus)}>{label}</button>)}</div>
  </div><aside className="verify-card"><strong>문안 다듬기</strong>{writingIssues.length>0?<ul>{writingIssues.map(issue=><li key={issue}>{issue}</li>)}</ul>:<p>짧은 첫 문장, 새로운 정보, 자연스러운 가게 연결이 있는지 읽어 보세요.</p>}
    {disclosureMissing&&<><p>AI 이미지 안내를 문안에 넣어 주세요.</p><button type="button" className="button secondary" disabled={status==="loading"||saving||text.length+AI_IMAGE_DISCLOSURE.length+2>2200} onClick={()=>{edited.current=true;const next=text.trimEnd()+"\n\n"+AI_IMAGE_DISCLOSURE;setText(next);onTextChange?.(next);}}>AI 이미지 안내 넣기</button></>}
    <strong>사실 확인</strong>{facts.length>0&&<ul>{facts.map(fact=><li key={fact}>{fact}</li>)}</ul>}<p>가격·영업시간·표현은 게시 전에 직접 확인해 주세요. 위 안내는 사실 검증 결과가 아닙니다.</p><button type="button" className="button primary" disabled={!text.trim()||saving||status==="loading"} onClick={()=>onContinue(text)}>{saving?"문안 저장 중…":"최종 화면 보기"}</button></aside></section>;
}
