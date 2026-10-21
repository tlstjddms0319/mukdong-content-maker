// 설정 화면 "AI 사용량" 카드: 키를 넣은 AI만, 오늘·이번 달 사용량과 한도 초과·Groq 남은 요청 수·대시보드 링크를 보여 준다.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiUsageCard } from "@/components/settings/AiUsageCard";

const counter=(units:number,extra:Partial<{calls:number;failures:number;quota:number}>={})=>({calls:units,failures:0,quota:0,units,...extra});
const stat=(id:string,today:number,month:number,more:Record<string,unknown>={})=>({id,today:counter(today),month:counter(month),lastQuota:null,lastError:null,...more});

describe("AI usage card", () => {
  afterEach(()=>vi.unstubAllGlobals());
  it("shows configured AIs with counts, quota hits, Groq remaining and dashboard links", async () => {
    const now=new Date().toISOString();
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({usage:{month:"2026-10",today:"2026-10-07",groq:{remainingRequests:987,limitRequests:1000,at:now},providers:[
      stat("gemini",3,40,{month:counter(40,{failures:2,quota:1}),lastQuota:now}),stat("gemini-vision",0,6),stat("groq",1,5),stat("cloudflare",0,0),
      stat("higgsfield",2,12),stat("cloudflare-image",0,0),stat("openai-image",0,0),
    ]},cutout:{used:4,budget:20}})})));
    render(<AiUsageCard connections={{anthropic:false,gemini:true,groq:true,cloudflare:false,openai:false,higgsfield:true}}/>);
    expect(await screen.findByText("Gemini 문안")).toBeInTheDocument();
    expect(screen.getByText(/오늘 3회 · 이번 달 40회 · 실패 2번 · 마지막 한도 초과 오늘/)).toBeInTheDocument();
    expect(screen.getByText(/남은 요청 987 \/ 1,000/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 2장 · 이번 달 12장/)).toBeInTheDocument();
    expect(screen.getByText(/원격 누끼\(Higgsfield\) 이번 달 4크레딧 \/ 예산 20크레딧/)).toBeInTheDocument();
    // 키가 없고 쓴 적도 없는 AI는 숨긴다.
    expect(screen.queryByText("OpenAI 이미지")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link",{name:/AI Studio 사용량 열기/})[0]).toHaveAttribute("href","https://aistudio.google.com/usage");
  });

  it("shows why image generation failed", async () => {
    const now=new Date().toISOString();
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({usage:{month:"2026-10",today:"2026-10-10",groq:null,providers:[
      stat("higgsfield",0,14,{month:counter(14,{failures:88}),lastError:{at:now,status:503,reason:"failed",detail:"Grok Image 2.0 503 POST /xai/grok-imagine-image-2.0: overloaded"},reasons:{rejected:20,timeout:60,failed:8}}),
    ]},cutout:null})})));
    render(<AiUsageCard connections={{anthropic:false,gemini:false,groq:false,cloudflare:false,openai:false,higgsfield:true}}/>);
    expect(await screen.findByText(/실패 이유: 시간 초과 60, 모델이 요청 거절 20, 작업 실패 8\. 마지막 실패 오늘/)).toBeInTheDocument();
    expect(screen.getByText(/코드 503\) — Grok Image 2.0 503 POST/)).toBeInTheDocument();
  });
});
