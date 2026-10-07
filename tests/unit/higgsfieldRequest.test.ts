// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
vi.mock("server-only",()=>({}));
const readSettings=vi.hoisted(()=>vi.fn());
vi.mock("@/features/settings/repository",()=>({readSettings}));

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
let png:Buffer;

beforeEach(async()=>{
  png=await sharp({create:{width:300,height:400,channels:3,background:"#bb8877"}}).png().toBuffer();
  vi.stubEnv("HF_API_KEY_ID","key-id");
  vi.stubEnv("HF_API_KEY_SECRET","key-secret");
  // 아래 예전 테스트는 Grok Image 2.0 요청 모양을 본다(기본 모델 Nano Banana Pro는 맨 아래 테스트에서 따로 본다).
  vi.stubEnv("HF_IMAGE_MODEL","grok-image-2");
  readSettings.mockReset();
  readSettings.mockResolvedValue({...DEFAULT_SETTINGS,imageAiProvider:"automatic"});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe("Higgsfield image generation",()=>{
  it("submits a 3:4 job with Key auth, polls it, and returns a 1080×1350 JPEG",async()=>{
    const calls:{url:string;init?:RequestInit}[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      calls.push({url,init});
      if(url.endsWith("/xai/grok-imagine-image-2.0"))return json({status:"queued",request_id:"r1",status_url:"https://api.higgsfield.ai/requests/r1/status"});
      if(url.endsWith("/requests/r1/status"))return json({status:"completed",images:[{url:"https://cdn.example.com/r1.png"}]});
      if(url==="https://cdn.example.com/r1.png")return new Response(new Uint8Array(png));
      throw new Error(`unexpected ${url}`);
    }));
    const { generateHiggsfieldImages }=await import("@/features/images/higgsfieldRequest");

    const [image]=await generateHiggsfieldImages({topic:"홍어가 톡 쏘는 이유",count:1,aspectRatio:"4:5"});

    const submit=calls[0];
    expect((submit.init?.headers as Record<string,string>).Authorization).toBe("Key key-id:key-secret");
    expect(JSON.parse(String(submit.init?.body))).toMatchObject({aspect_ratio:"3:4",resolution:"2k"});
    expect(JSON.parse(String(submit.init?.body))).not.toHaveProperty("image_urls");
    expect(image.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(await sharp(Buffer.from(image.split(",")[1],"base64")).metadata()).toMatchObject({width:1080,height:1350});
  },10_000);

  it("uploads the reference photo to the presigned URL without API credentials",async()=>{
    const calls:{url:string;init?:RequestInit}[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      calls.push({url,init});
      if(url.endsWith("/files/generate-upload-url"))return json({upload_url:"https://storage.example.com/put",public_url:"https://cdn.example.com/ref.jpg",upload_headers:{"Content-Type":"image/jpeg","x-amz-tagging":"t"}});
      if(url==="https://storage.example.com/put")return new Response(null,{status:200});
      if(url.endsWith("/xai/grok-imagine-image-2.0"))return json({status:"completed",request_id:"r2",images:[{url:"https://cdn.example.com/r2.png"}]});
      if(url==="https://cdn.example.com/r2.png")return new Response(new Uint8Array(png));
      throw new Error(`unexpected ${url}`);
    }));
    const { generateHiggsfieldImages }=await import("@/features/images/higgsfieldRequest");

    await generateHiggsfieldImages({topic:"홍어",count:1,aspectRatio:"4:5",referenceImage:`data:image/png;base64,${png.toString("base64")}`,referenceMode:"source"});

    const upload=calls.find(call=>call.url==="https://storage.example.com/put")!;
    expect(upload.init?.headers).toEqual({"Content-Type":"image/jpeg","x-amz-tagging":"t"});
    const submit=calls.find(call=>call.url.endsWith("/xai/grok-imagine-image-2.0"))!;
    expect(JSON.parse(String(submit.init?.body)).image_urls).toEqual(["https://cdn.example.com/ref.jpg"]);
  });

  it("does not send the chosen cover as a reference for the next slides",async()=>{
    // 표지 이어 가기(continuity)에 표지 이미지를 넘기면 이 모델이 같은 접시·같은 구도를 장마다 복사했다.
    const calls:{url:string;init?:RequestInit}[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      calls.push({url,init});
      if(url.endsWith("/xai/grok-imagine-image-2.0"))return json({status:"completed",request_id:"r3",images:[{url:"https://cdn.example.com/r3.png"}]});
      if(url==="https://cdn.example.com/r3.png")return new Response(new Uint8Array(png));
      throw new Error(`unexpected ${url}`);
    }));
    const { generateHiggsfieldImages }=await import("@/features/images/higgsfieldRequest");
    await generateHiggsfieldImages({topic:"홍어",count:1,aspectRatio:"4:5",referenceImage:`data:image/png;base64,${png.toString("base64")}`,referenceMode:"continuity"});
    expect(calls.some(call=>call.url.endsWith("/files/generate-upload-url"))).toBe(false);
    const submit=calls.find(call=>call.url.endsWith("/xai/grok-imagine-image-2.0"))!;
    expect(JSON.parse(String(submit.init?.body))).not.toHaveProperty("image_urls");
  });

  it("uses Higgsfield first in automatic mode and falls back to Cloudflare when credits run out",async()=>{
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
      if(url.includes("api.higgsfield.ai"))return json({detail:"Not enough credits"},403);
      if(url.includes("api.cloudflare.com"))return json({success:true,result:{image:"Y2xvdWRmbGFyZQ=="}});
      throw new Error(`unexpected ${url}`);
    }));
    const { POST }=await import("@/app/api/images/generate/route");

    const response=await POST(new Request("http://localhost/api/images/generate",{method:"POST",body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"})}));
    const body=await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({provider:"cloudflare",fallback:true,notice:"Higgsfield 생성이 어려워 Cloudflare(으)로 전환했어요."});
  });

  it("in automatic mode shows the credit problem instead of a missing OpenAI key",async()=>{
    // Cloudflare·OpenAI 키가 없으면 자동 순서에서 빠지고, Higgsfield의 실제 실패 이유(크레딧 부족)가 보인다.
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","");vi.stubEnv("CLOUDFLARE_API_TOKEN","");vi.stubEnv("OPENAI_API_KEY","");
    vi.stubGlobal("fetch",vi.fn(async()=>json({detail:"Not enough credits"},403)));
    const { POST }=await import("@/app/api/images/generate/route");
    const response=await POST(new Request("http://localhost/api/images/generate",{method:"POST",body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"})}));
    expect(response.status).toBe(502);
    expect((await response.json()).message).toContain("크레딧이 부족");
  });
  it("explains missing credits when Higgsfield is the only selected image AI",async()=>{
    readSettings.mockResolvedValue({...DEFAULT_SETTINGS,imageAiProvider:"higgsfield"});
    vi.stubGlobal("fetch",vi.fn(async()=>json({detail:"Not enough credits"},403)));
    const { POST }=await import("@/app/api/images/generate/route");

    const response=await POST(new Request("http://localhost/api/images/generate",{method:"POST",body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"})}));

    expect(response.status).toBe(502);
    expect((await response.json()).message).toContain("크레딧이 부족");
  });

  it("uses Nano Banana Pro first, at the card's photo window ratio",async()=>{
    vi.stubEnv("HF_IMAGE_MODEL","");
    const { generateHiggsfieldImages,resetHiggsfieldModelSkips }=await import("@/features/images/higgsfieldRequest");
    resetHiggsfieldModelSkips();
    const calls:{url:string;init?:RequestInit}[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      calls.push({url,init});
      if(url.endsWith("/nano-banana-pro"))return json({status:"completed",request_id:"n1",images:[{url:"https://cdn.example.com/n1.png"}]});
      if(url==="https://cdn.example.com/n1.png")return new Response(new Uint8Array(png));
      throw new Error(`unexpected ${url}`);
    }));
    await generateHiggsfieldImages({topic:"과메기",count:1,aspectRatio:"4:5",windowRatio:1.5});
    expect(calls[0].url).toBe("https://api.higgsfield.ai/nano-banana-pro");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({aspect_ratio:"3:2",resolution:"2k"});
  });

  it("falls back to Grok Image 2.0 when the Nano Banana Pro route is not open for the account, and remembers it",async()=>{
    vi.stubEnv("HF_IMAGE_MODEL","");
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const { generateHiggsfieldImages,resetHiggsfieldModelSkips }=await import("@/features/images/higgsfieldRequest");
    resetHiggsfieldModelSkips();
    const calls:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
      calls.push(url);
      if(url.endsWith("/nano-banana-pro"))return json({detail:"Not Found"},404);
      if(url.endsWith("/xai/grok-imagine-image-2.0"))return json({status:"completed",request_id:"g1",images:[{url:"https://cdn.example.com/g1.png"}]});
      if(url==="https://cdn.example.com/g1.png")return new Response(new Uint8Array(png));
      throw new Error(`unexpected ${url}`);
    }));
    const [image]=await generateHiggsfieldImages({topic:"과메기",count:1,aspectRatio:"4:5"});
    expect(image.startsWith("data:image/jpeg")).toBe(true);
    expect(calls.filter(url=>url.endsWith("/nano-banana-pro"))).toHaveLength(1);
    // 다음 요청은 열리지 않은 경로를 다시 두드리지 않는다.
    await generateHiggsfieldImages({topic:"과메기",count:1,aspectRatio:"4:5"});
    expect(calls.filter(url=>url.endsWith("/nano-banana-pro"))).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not hide credit or safety failures behind the fallback",async()=>{
    vi.stubEnv("HF_IMAGE_MODEL","");
    const { generateHiggsfieldImages,resetHiggsfieldModelSkips }=await import("@/features/images/higgsfieldRequest");
    resetHiggsfieldModelSkips();
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
      if(url.endsWith("/nano-banana-pro"))return json({detail:"no credits"},402);
      throw new Error(`unexpected ${url}`);
    }));
    await expect(generateHiggsfieldImages({topic:"과메기",count:1,aspectRatio:"4:5"})).rejects.toMatchObject({reason:"credits"});
  });
});
