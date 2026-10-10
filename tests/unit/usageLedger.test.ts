// @vitest-environment node
// AI 사용량 장부(설정 화면 "AI 사용량"): 호출·실패·한도 초과를 날짜별로 세고, Groq 남은 요청 수를 적는다.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const { applyEvent, kstDay, memoryUsageStore, readUsage, recordGroqLimits, recordUsage, setUsageStoreForTests, summarize, flushUsage }=await import("@/lib/usage/ledger");
const { createTextClient }=await import("@/lib/ai/textClient");
const { TextAiHttpError }=await import("@/lib/ai/errors");
const { createGroqClient }=await import("@/lib/ai/groqClient");

afterEach(()=>setUsageStoreForTests(null));

describe("usage ledger", () => {
  it("counts calls, failures and quota hits per KST day", () => {
    const morning=new Date("2026-10-07T00:30:00Z"),late=new Date("2026-10-07T16:00:00Z"); // KST 09:30, 다음 날 01:00
    expect(kstDay(morning)).toBe("2026-10-07");
    expect(kstDay(late)).toBe("2026-10-08");
    let month={month:"2026-10",days:{},lastQuota:{},lastError:{}};
    month=applyEvent(month,{provider:"gemini",ok:true},morning);
    month=applyEvent(month,{provider:"gemini",ok:false,status:429},morning);
    month=applyEvent(month,{provider:"higgsfield",ok:true,units:2},morning);
    month=applyEvent(month,{provider:"gemini",ok:true},late);
    const summary=summarize(month,late);
    const gemini=summary.providers.find(item=>item.id==="gemini")!;
    expect(gemini.month).toEqual({calls:3,failures:1,quota:1,units:2});
    expect(gemini.today).toEqual({calls:1,failures:0,quota:0,units:1});
    expect(gemini.lastQuota).toBe(morning.toISOString());
    expect(summary.providers.find(item=>item.id==="higgsfield")!.month.units).toBe(2);
  });

  it("records through the text client and Groq's remaining-request headers", async () => {
    setUsageStoreForTests(()=>store);
    const store=memoryUsageStore();
    const client=createTextClient("automatic",{create:{
      gemini:()=>({provider:"gemini",generateJson:async()=>{throw new TextAiHttpError("Gemini",429);}}),
      groq:()=>({provider:"groq",generateJson:async<T,>()=>({ok:true} as T)}),
      cloudflare:()=>{throw new Error("not configured");},
    } as never});
    await client.generateJson("p",{parse:(value:unknown)=>value} as never);
    recordGroqLimits(new Headers({"x-ratelimit-remaining-requests":"987","x-ratelimit-limit-requests":"1000"}));
    const usage=await readUsage();
    const row=(id:string)=>usage.providers.find(item=>item.id===id)!;
    expect(row("gemini").today).toMatchObject({calls:1,failures:1,quota:1});
    expect(row("groq").today).toMatchObject({calls:1,failures:0,units:1});
    expect(usage.groq).toMatchObject({remainingRequests:987,limitRequests:1000});
  });

  it("reads Groq limits from the SDK response when available", async () => {
    setUsageStoreForTests(()=>store);
    const store=memoryUsageStore();
    const completion={choices:[{message:{content:'{"ok":true}'}}]};
    const create=()=>Object.assign(Promise.resolve(completion),{withResponse:async()=>({data:completion,response:new Response(null,{headers:{"x-ratelimit-remaining-requests":"12"}})})});
    const groq=createGroqClient({apiKey:"k",client:{chat:{completions:{create}}} as never});
    const { z }=await import("zod");
    await groq.generateJson("p",z.object({ok:z.boolean()}));
    await flushUsage();
    expect((await readUsage()).groq?.remainingRequests).toBe(12);
  });

  it("never throws when recording", () => {
    setUsageStoreForTests(()=>({read:async()=>{throw new Error("down");},write:async()=>{throw new Error("down");}}));
    expect(()=>recordUsage({provider:"openai-image",ok:true})).not.toThrow();
    return expect(flushUsage()).resolves.toBeUndefined();
  });

  // 사장님 지적(2026-10-10): Higgsfield "실패 88번"만 보이고 이유를 알 수 없었다. 이유별로 센다.
  it("counts failure reasons and keeps the last one", () => {
    const at=new Date("2026-10-10T03:00:00Z");
    let month={month:"2026-10",days:{},lastQuota:{},lastError:{}};
    month=applyEvent(month,{provider:"higgsfield",ok:false,status:504,reason:"timeout"},at);
    month=applyEvent(month,{provider:"higgsfield",ok:false,status:504,reason:"timeout"},at);
    month=applyEvent(month,{provider:"higgsfield",ok:false,status:422,reason:"rejected",units:1},at);
    month=applyEvent(month,{provider:"higgsfield",ok:true,units:3},at);
    const higgsfield=summarize(month,at).providers.find(item=>item.id==="higgsfield")!;
    expect(higgsfield.month.failures).toBe(3);
    expect(higgsfield.reasons).toEqual({timeout:2,rejected:1});
    expect(higgsfield.lastError).toMatchObject({status:422,reason:"rejected"});
    // 예전 장부(이유 없음)도 읽힌다.
    expect(summarize({month:"2026-10",days:{},lastQuota:{},lastError:{}},at).providers[0].reasons).toEqual({});
  });
});
