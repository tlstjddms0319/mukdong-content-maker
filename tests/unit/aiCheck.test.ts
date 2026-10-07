// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));
const { runAiChecks, scrubMessage }=await import("@/features/aiCheck/runChecks");

const gemini={provider:"gemini" as const,generateJson:async<T,>()=>({ok:true,word:"홍어"}) as T};
const failingGroq={provider:"groq" as const,generateJson:async()=>{throw new Error("HTTP 401 invalid key gsk_SECRETVALUE123");}};

describe("AI connection check", () => {
  it("reports the Higgsfield image model in use when its route answers (input error means the route exists)", async () => {
    const fetcher=vi.fn(async(url:string)=>new Response("{}",{status:url.endsWith("/nano-banana-pro")?422:404}));
    const items=await runAiChecks({env:{HF_API_KEY_ID:"id",HF_API_KEY_SECRET:"secret"},fetch:fetcher as unknown as typeof fetch,textClients:{}});
    const higgsfield=items.find(item=>item.id==="higgsfield")!;
    expect(higgsfield.status).toBe("ok");
    expect(higgsfield.message).toContain("이미지 모델 Nano Banana Pro 사용");
  });

  it("checks each text provider separately, the cover check and image key auth, without leaking keys", async () => {
    const fetcher=vi.fn(async(url:string)=>new Response("{}",{status:url.includes("higgsfield")?404:200}));
    const items=await runAiChecks({
      env:{GEMINI_API_KEY:"gem-key-123456",GROQ_API_KEY:"gsk_SECRETVALUE123",HF_API_KEY_ID:"id",HF_API_KEY_SECRET:"secret",OPENAI_API_KEY:"sk-open-123456"},
      fetch:fetcher as unknown as typeof fetch,
      textClients:{gemini:()=>gemini,groq:()=>failingGroq as never},
      coverCheck:async()=>[{foodVisible:true,looksLikeSkate:true,textInImage:false,oddHands:false,appetite:4,lighting:4,composition:4,dark:false,blurry:false,clutter:false,food:"홍어회",scene:"",score:8,note:"좋음",warnings:[]}],
      sampleImage:async()=>Buffer.from("x"),
    });
    const byId=Object.fromEntries(items.map(item=>[item.id,item]));
    expect(byId["text-gemini"]).toMatchObject({status:"ok",message:"정상 응답 (홍어)"});
    expect(byId["text-groq"].status).toBe("fail");
    expect(byId["text-groq"].message).toBe("HTTP 401 invalid key ***");
    expect(byId["text-cloudflare"]).toMatchObject({status:"skip"});
    expect(byId["cover-vision"]).toMatchObject({status:"ok",message:"견본 사진 점수 8/10 · 홍어로 보임"});
    expect(byId.higgsfield).toMatchObject({status:"ok"});
    // 이미지 모델 경로가 열려 있지 않으면(404) 예전 모델로 만든다고 알려 준다.
    expect(byId.higgsfield.message).toContain("Nano Banana Pro 경로를 찾지 못해 Grok Image 2.0(으)로 만들어요");
    expect(byId.openai).toMatchObject({status:"ok"});
    expect(JSON.stringify(items)).not.toContain("gsk_SECRETVALUE123");
  });

  it("reports rejected image keys and skips what is not configured", async () => {
    const fetcher=vi.fn(async()=>new Response("{}",{status:401}));
    const items=await runAiChecks({env:{HF_API_KEY_ID:"id",HF_API_KEY_SECRET:"secret",OPENAI_API_KEY:"sk-open-123456"},fetch:fetcher as unknown as typeof fetch,textClients:{}});
    const byId=Object.fromEntries(items.map(item=>[item.id,item]));
    expect(byId.higgsfield).toMatchObject({status:"fail"});
    expect(byId.higgsfield.message).toContain("401");
    expect(byId.openai.message).toContain("401");
    expect(byId["cover-vision"].status).toBe("skip");
  });

  it("times out slow providers", async () => {
    const slow={provider:"gemini" as const,generateJson:()=>new Promise<never>(()=>{})};
    const items=await runAiChecks({env:{},textClients:{gemini:()=>slow},timeoutMs:20});
    expect(items.find(item=>item.id==="text-gemini")).toMatchObject({status:"fail",message:"0초 안에 답이 없어요."});
  });

  it("scrubs secrets and trims long messages", () => {
    expect(scrubMessage("bad token abcdef123 here",{CLOUDFLARE_API_TOKEN:"abcdef123"})).toBe("bad token *** here");
    expect(scrubMessage("x".repeat(500),{}).length).toBe(240);
  });
});
