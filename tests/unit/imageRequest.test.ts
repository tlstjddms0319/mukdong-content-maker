// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildImageEditRequest, buildImageRequest } from "@/features/images/openaiRequest";
import { POST as generateImages } from "@/app/api/images/generate/route";
import { composeSlideImage } from "@/features/images/composeSlide";
import { ImageBriefSchema } from "@/features/images/schema";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
vi.mock("server-only",()=>({}));

const generateImage=vi.hoisted(()=>vi.fn());
const editImage=vi.hoisted(()=>vi.fn());
const readSettings=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/ai/openaiClient",()=>({
  AiConfigurationError:class AiConfigurationError extends Error {},
  getOpenAIClient:()=>({images:{generate:generateImage,edit:editImage}}),
}));
vi.mock("@/features/settings/repository",()=>({readSettings}));

const visitSlide={
  role:"visit" as const,
  headline:"오늘 한 상 어때요?",
  visualPrompt:"따뜻한 저녁 조명 아래 편안한 홍어 한 상을 넓게 담은 음식 사진",
  textPosition:"bottom" as const,
};

const carouselStyleAnchor="따뜻한 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트";
const visitSlideMetadata={slide:visitSlide,slideIndex:5,slideTotal:5,styleAnchor:carouselStyleAnchor};
const coverSlide={...visitSlide,role:"cover" as const,headline:"비 오는 날 홍어 한 상"};

describe("OpenAI image request", () => {
  it("uses the cooked preparation instead of a raw-slice directive for hongeo jeon",()=>{
    const request=buildImageRequest(ImageBriefSchema.parse({topic:"홍어전의 고소한 한입",imageBrief:"홍어회 접시를 표현한다는 잘못된 기획",count:1,refinement:"접시를 더 작게, 자연광은 부드럽게"}));
    expect(request.prompt).toContain("노릇");
    expect(request.prompt).not.toContain("숙성 홍어 날개 살을 얇고 불규칙하게");
    expect(request.prompt).toContain("접시를 더 작게, 자연광은 부드럽게");
    expect(buildImageRequest(ImageBriefSchema.parse({topic:"홍어 전문점"})).prompt).not.toContain("노릇");
  });
  it("does not force an eye-level full plate on a top-down or macro scene",()=>{
    for(const role of ["overview","detail"] as const){
      const prompt=buildImageRequest({topic:"홍어",count:1,aspectRatio:"4:5",slide:{...visitSlide,role}}).prompt;
      expect(prompt).not.toContain("eye-level or 45-degree view");
      if(role==="detail")expect(prompt).not.toContain("entire main dish");
    }
  });
  it("requests explicit high quality and describes realistic thin slices",()=>{
    const request=buildImageRequest({topic:"홍어삼합",count:1,aspectRatio:"4:5"},"high");
    expect(request.quality).toBe("high");
    expect(request.prompt).toContain("얇고 불규칙하게");
    expect(request.prompt).toContain("정육면체");
  });
  it("returns an uncaptioned cover reference alongside the captioned image",async()=>{
    const source=await sharp({create:{width:40,height:40,channels:3,background:"#778877"}}).png().toBuffer();
    generateImage.mockResolvedValue({data:[{b64_json:source.toString("base64")}]});
    const response=await generateImages(new Request("http://localhost/api/images/generate",{method:"POST",body:JSON.stringify({topic:"홍어",count:1,...visitSlideMetadata,slide:coverSlide,slideIndex:1})}));
    const body=await response.json();
    expect(body.referenceImages).toHaveLength(1);
    expect(body.referenceImages[0]).not.toBe(body.images[0]);
    expect(await sharp(Buffer.from(body.referenceImages[0].split(",")[1],"base64")).metadata()).toMatchObject({width:40,height:40});
  });
  beforeEach(()=>{
    generateImage.mockReset();
    editImage.mockReset();
    readSettings.mockReset();
    readSettings.mockResolvedValue({...DEFAULT_SETTINGS,imageAiProvider:"automatic"});
  });
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

  it("uses configured Cloudflare Workers AI before OpenAI in automatic mode", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,result:{image:"Y2xvdWRmbGFyZS1pbWFnZQ=="}}),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",request);

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"}),
    }));
    const body=await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({images:["data:image/jpeg;base64,Y2xvdWRmbGFyZS1pbWFnZQ=="],provider:"cloudflare",fallback:false});
    expect(request).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/black-forest-labs/flux-2-klein-4b",
      expect.objectContaining({method:"POST",headers:{Authorization:"Bearer token-123"},body:expect.any(FormData),signal:expect.any(AbortSignal)}),
    );
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when Cloudflare fails in automatic mode", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({success:false,errors:[{message:"daily limit"}]}),{status:429,headers:{"Content-Type":"application/json"}})));
    generateImage.mockResolvedValue({data:[{b64_json:"b3BlbmFpLWltYWdl"}]});

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"}),
    }));
    const body=await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({images:["data:image/png;base64,b3BlbmFpLWltYWdl"],provider:"openai",fallback:true});
    expect(generateImage).toHaveBeenCalledOnce();
  });

  it("finishes each Cloudflare request before starting the next candidate", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    let active=0,maxActive=0,call=0;
    vi.stubGlobal("fetch",vi.fn(async()=>{
      active++;maxActive=Math.max(maxActive,active);
      await new Promise(resolve=>setTimeout(resolve,5));
      active--;call++;
      return new Response(JSON.stringify({success:true,result:{image:`image-${call}`}}),{status:200,headers:{"Content-Type":"application/json"}});
    }));

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"홍어 표지",count:2,aspectRatio:"4:5"}),
    }));

    expect(response.status).toBe(200);
    expect(maxActive).toBe(1);
  });

  it("keeps successful Cloudflare candidates and asks OpenAI only for the missing count", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    let call=0;
    vi.stubGlobal("fetch",vi.fn(async()=>++call===1
      ? new Response(JSON.stringify({success:true,result:{image:"Y2xvdWRmbGFyZS1maXJzdA=="}}),{status:200,headers:{"Content-Type":"application/json"}})
      : new Response("limit",{status:429})));
    generateImage.mockResolvedValue({data:[{b64_json:"b3BlbmFpLW1pc3Npbmc="}]});

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"홍어 표지",count:2,aspectRatio:"4:5"}),
    }));
    const body=await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      images:["data:image/jpeg;base64,Y2xvdWRmbGFyZS1maXJzdA==","data:image/png;base64,b3BlbmFpLW1pc3Npbmc="],
      provider:"mixed",
      fallback:true,
    });
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({n:1}));
  });

  it("does not call paid OpenAI when Cloudflare-only mode fails", async () => {
    readSettings.mockResolvedValue({...DEFAULT_SETTINGS,imageAiProvider:"cloudflare"});
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("limit",{status:429})));

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"}),
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({retryable:true});
    expect(generateImage).not.toHaveBeenCalled();
  });
  it("omits the unsupported response_format parameter", () => {
    const request = buildImageRequest({ topic:"홍어 삼합", count:1, aspectRatio:"4:5" });
    expect(request).not.toHaveProperty("response_format");
    expect(request).toMatchObject({ model:"gpt-image-1.5", quality:"medium", size:"1024x1536", n:1 });
  });

  it("turns a data URL into an image edit request", async () => {
    const request=await buildImageEditRequest({topic:"홍어 삼합",count:3,aspectRatio:"4:5",referenceImage:"data:image/png;base64,iVBORw0KGgo=",referenceMode:"source"});
    expect(request).toMatchObject({model:"gpt-image-1.5",quality:"medium",size:"1024x1536",n:3,input_fidelity:"high"});
    expect(request.image).toMatchObject({name:"reference.png",type:"image/png"});
    expect(request.prompt).toContain("원본 음식의 형태와 특징");
  });

  it("uses the selected topic and role-specific visual prompt for a slide", () => {
    const request=buildImageRequest({
      topic:"비 오는 날 홍어와 막걸리",
      count:1,
      aspectRatio:"4:5",
      imageBrief:"창가의 빗빛",
      slide:visitSlide,
      styleAnchor:"따뜻한 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트",
    });

    expect(request.prompt).toContain("비 오는 날 홍어와 막걸리");
    expect(request.prompt).toContain("창가의 빗빛");
    expect(request.prompt).toContain(visitSlide.visualPrompt);
    expect(request.prompt).toContain("아래쪽");
    expect(request.prompt).not.toContain("하나의 음식 피사체");
  });

  it("uses a reference image as style only when requested", async () => {
    const request=await buildImageEditRequest({
      topic:"저녁 홍어 한 상",
      count:1,
      aspectRatio:"4:5",
      referenceImage:"data:image/jpeg;base64,iVBORw0KGgo=",
      referenceMode:"style",
      slide:visitSlide,
    });

    expect(request.prompt).toContain("조명과 색감만 참고");
    expect(request.prompt).toContain(visitSlide.visualPrompt);
    expect(request.prompt).not.toContain("원본 음식의 형태와 특징은 유지");
  });

  it("keeps legacy requests valid and permits two cover candidates at carousel position one", () => {
    expect(ImageBriefSchema.safeParse({topic:"홍어 삼합",count:1,aspectRatio:"4:5"}).success).toBe(true);
    expect(ImageBriefSchema.safeParse({
      topic:"비 오는 날 홍어",
      count:2,
      aspectRatio:"4:5",
      slide:coverSlide,
      slideIndex:1,
      slideTotal:5,
      styleAnchor:carouselStyleAnchor,
    }).success).toBe(true);
  });

  it.each([
    ["missing index",{...visitSlideMetadata,slideIndex:undefined}],
    ["missing total",{...visitSlideMetadata,slideTotal:undefined}],
    ["missing style anchor",{...visitSlideMetadata,styleAnchor:undefined}],
    ["index beyond total",{...visitSlideMetadata,slideIndex:6}],
    ["role out of order",{...visitSlideMetadata,slideIndex:4}],
  ])("rejects a slide request with %s", async (_reason,metadata) => {
    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"저녁 홍어 한 상",count:1,aspectRatio:"4:5",...metadata}),
    }));

    expect(response.status).toBe(400);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("normalizes a base64 slide result to an overlaid JPEG", async () => {
    const source=await sharp({create:{width:40,height:40,channels:3,background:"#4f643f"}}).png().toBuffer();
    generateImage.mockResolvedValue({data:[{b64_json:source.toString("base64")}]});

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"비 오는 날 홍어",count:1,aspectRatio:"4:5",...visitSlideMetadata}),
    }));
    const body=await response.json();
    const output=Buffer.from(String(body.images[0]).split(",")[1],"base64");

    expect(body.images[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(await sharp(output).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
  }, 15_000);

  it("downloads a remote slide result before composing it", async () => {
    const source=await sharp({create:{width:40,height:40,channels:3,background:"#aa8866"}}).png().toBuffer();
    generateImage.mockResolvedValue({data:[{url:"https://images.example/slide.png"}]});
    const request=vi.fn().mockResolvedValue(new Response(source,{status:200,headers:{"Content-Type":"image/png"}}));
    vi.stubGlobal("fetch",request);

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"저녁 홍어 한 상",count:1,aspectRatio:"4:5",...visitSlideMetadata}),
    }));
    const body=await response.json();

    expect(request).toHaveBeenCalledWith("https://images.example/slide.png");
    expect(body.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  }, 15_000);

  it("uses the carousel position rather than the provider candidate count for the counter", async () => {
    const source=await sharp({create:{width:40,height:40,channels:3,background:"#725747"}}).png().toBuffer();
    generateImage.mockResolvedValue({data:[{b64_json:source.toString("base64")}]});

    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"저녁 홍어 한 상",count:1,aspectRatio:"4:5",...visitSlideMetadata}),
    }));
    const body=await response.json();
    const actual=Buffer.from(String(body.images[0]).split(",")[1],"base64");
    const expected=await composeSlideImage(source,visitSlide,5,5);

    expect(actual.equals(expected)).toBe(true);
  }, 15_000);
});
