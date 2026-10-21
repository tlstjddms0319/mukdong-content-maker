"use client";
import { useEffect, useState } from "react";
import type { UsageProvider, UsageSummary } from "@/lib/usage/ledger";
import { FAILURE_REASON_LABELS, type FailureReason } from "@/lib/usage/failureReasons";
import { readJsonResponse } from "@/lib/http/readJson";

// 설정 화면 "AI 사용량". 각 AI가 남은 무료 한도를 API로 알려 주지 않아서(Groq만 예외),
// 앱이 직접 센 오늘·이번 달 사용 횟수와 마지막 한도 초과 시각을 보여 주고, 정확한 남은 양은 대시보드 링크로 안내한다.
type Connections={anthropic:boolean;gemini:boolean;groq:boolean;cloudflare:boolean;openai:boolean;higgsfield:boolean};
const ROWS:Array<{id:UsageProvider;label:string;unit:string;key:keyof Connections;dashboard:string;dashboardLabel:string}>=[
  {id:"anthropic",label:"Claude 문안",unit:"회",key:"anthropic",dashboard:"https://console.anthropic.com/settings/usage",dashboardLabel:"Anthropic 사용량"},
  {id:"gemini",label:"Gemini 문안",unit:"회",key:"gemini",dashboard:"https://aistudio.google.com/usage",dashboardLabel:"AI Studio 사용량"},
  {id:"gemini-vision",label:"Gemini 사진 점검",unit:"장",key:"gemini",dashboard:"https://aistudio.google.com/usage",dashboardLabel:"AI Studio 사용량"},
  {id:"groq",label:"Groq 문안(예비)",unit:"회",key:"groq",dashboard:"https://console.groq.com/settings/limits",dashboardLabel:"Groq 한도"},
  {id:"cloudflare",label:"Cloudflare 문안(예비)",unit:"회",key:"cloudflare",dashboard:"https://dash.cloudflare.com/?to=/:account/ai/workers-ai",dashboardLabel:"Cloudflare Workers AI"},
  {id:"higgsfield",label:"Higgsfield 이미지",unit:"장",key:"higgsfield",dashboard:"https://cloud.higgsfield.ai",dashboardLabel:"Higgsfield 대시보드"},
  {id:"cloudflare-image",label:"Cloudflare 이미지",unit:"장",key:"cloudflare",dashboard:"https://dash.cloudflare.com/?to=/:account/ai/workers-ai",dashboardLabel:"Cloudflare Workers AI"},
  {id:"openai-image",label:"OpenAI 이미지",unit:"장",key:"openai",dashboard:"https://platform.openai.com/usage",dashboardLabel:"OpenAI 사용량"},
];
type UsageResponse={usage:UsageSummary;cutout:{used:number;budget:number|null}|null};

// "오늘 14:02"처럼 짧게. 오늘이 아니면 "10월 3일 14:02".
function when(iso:string|null|undefined):string {
  if(!iso)return "";
  const date=new Date(iso);
  const time=date.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Seoul"});
  const day=date.toLocaleDateString("ko-KR",{month:"long",day:"numeric",timeZone:"Asia/Seoul"});
  const today=new Date().toLocaleDateString("ko-KR",{month:"long",day:"numeric",timeZone:"Asia/Seoul"});
  return day===today?`오늘 ${time}`:`${day} ${time}`;
}

async function fetchUsage():Promise<UsageResponse> {
  const response=await fetch("/api/usage",{cache:"no-store"});
  const body=await readJsonResponse(response);
  if(!response.ok||!body.usage)throw new Error(body.message||"사용량을 불러오지 못했어요.");
  return body as UsageResponse;
}

export function AiUsageCard({connections}:{connections:Connections}){
  const [data,setData]=useState<UsageResponse|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  // 처음 열 때 한 번 불러온다(setState는 응답이 온 뒤 콜백에서만).
  useEffect(()=>{
    let cancelled=false;
    fetchUsage().then(body=>{if(!cancelled)setData(body);}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"사용량을 불러오지 못했어요.");});
    return ()=>{cancelled=true;};
  },[]);
  const reload=async()=>{
    setBusy(true);setError("");
    try{setData(await fetchUsage());}
    catch(cause){setError(cause instanceof Error?cause.message:"사용량을 불러오지 못했어요.");}
    finally{setBusy(false);}
  };
  // 키를 넣었거나 이번 달에 한 번이라도 쓴 AI만 보여 준다.
  const rows=ROWS.map(row=>({...row,stat:data?.usage.providers.find(item=>item.id===row.id)})).filter(row=>connections[row.key]||(row.stat?.month.calls??0)>0);
  const groq=data?.usage.groq;
  return <section className="settings-section" aria-label="AI 사용량"><div><h2>AI 사용량</h2>
    <p>앱이 직접 센 이번 달 사용량이에요. 구글·OpenAI 등은 남은 무료 한도를 앱에 알려 주지 않아서, 정확한 남은 양은 각 대시보드에서 확인해 주세요(Groq는 남은 요청 수를 알려 줘서 함께 보여 줘요).</p>
    {data&&<ul className="ai-check-list">{rows.map(row=>{
      const stat=row.stat;
      const quota=stat?.lastQuota?` · 마지막 한도 초과 ${when(stat.lastQuota)}`:"";
      // 실패 이유별 횟수(많은 순)와 마지막 실패. 이유를 남기기 전 기록은 횟수만 보인다.
      const reasons=Object.entries(stat?.reasons??{}).filter(([,count])=>(count??0)>0).sort((a,b)=>(b[1]??0)-(a[1]??0)).map(([reason,count])=>`${FAILURE_REASON_LABELS[reason as FailureReason]} ${count}`).join(", ");
      const lastFailure=stat?.month.failures&&stat.lastError?`마지막 실패 ${when(stat.lastError.at)}${stat.lastError.reason?` · ${FAILURE_REASON_LABELS[stat.lastError.reason]}`:""}${stat.lastError.status?` (코드 ${stat.lastError.status})`:""}${stat.lastError.detail?` — ${stat.lastError.detail}`:""}`:"";
      const remaining=row.id==="groq"&&groq?.remainingRequests!==undefined?` · 남은 요청 ${groq.remainingRequests.toLocaleString("ko-KR")}${groq.limitRequests?` / ${groq.limitRequests.toLocaleString("ko-KR")}`:""}(${when(groq.at)} 기준)`:"";
      return <li key={row.id} className="connection-card">
        <span className={`status-dot${stat?.lastQuota&&when(stat.lastQuota).startsWith("오늘")?"":" on"}`}/>
        <div><strong>{row.label}</strong>
          <p>오늘 {stat?.today.units??0}{row.unit} · 이번 달 {stat?.month.units??0}{row.unit}{stat?.month.failures?` · 실패 ${stat.month.failures}번`:""}{quota}{remaining}</p>
          {(reasons||lastFailure)&&<p className="field-help">{reasons?`실패 이유: ${reasons}. `:""}{lastFailure}</p>}
          <p><a href={row.dashboard} target="_blank" rel="noreferrer">{row.dashboardLabel} 열기 ↗</a></p>
        </div>
      </li>;
    })}</ul>}
    {data?.cutout&&<p className="field-help">원격 누끼(Higgsfield) 이번 달 {data.cutout.used}크레딧{data.cutout.budget!==null?` / 예산 ${data.cutout.budget}크레딧`:""}</p>}
    {data&&!rows.length&&<p className="field-help">아직 연결된 AI가 없어요.</p>}
    {error&&<p role="alert">{error}</p>}
    <div className="connection-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>void reload()}>{busy?"불러오는 중…":"사용량 새로 보기"}</button></div>
  </div></section>;
}
