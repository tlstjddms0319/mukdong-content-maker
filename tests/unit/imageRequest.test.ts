// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { CANDIDATE_VARIANTS, buildImageEditRequest, buildImagePrompt, buildImageRequest, candidateBriefs } from "@/features/images/openaiRequest";
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
  subline:"",
  role:"visit" as const,
  headline:"오늘 한 상 어때요?",
  points:[],
  visualPrompt:"따뜻한 저녁 조명 아래 편안한 홍어 한 상을 넓게 담은 음식 사진",
  textPosition:"bottom" as const,
  layout:"frame" as const,
  keywords:["방문 전"],
  figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0,
};

const carouselStyleAnchor="따뜻한 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트";
const visitSlideMetadata={slide:visitSlide,slideIndex:5,slideTotal:5,styleAnchor:carouselStyleAnchor};
const coverSlide={...visitSlide,role:"cover" as const,subline:"",headline:"비 오는 날 홍어 한 상",layout:"fullscreen" as const};

describe("OpenAI image request", () => {
  it("uses the cooked preparation instead of a raw-slice directive for hongeo jeon",()=>{
    const request=buildImageRequest(ImageBriefSchema.parse({topic:"홍어전의 고소한 한입",imageBrief:"홍어회 접시를 표현한다는 잘못된 기획",count:1,refinement:"접시를 더 작게, 자연광은 부드럽게"}));
    expect(request.prompt).toContain("노릇");
    expect(request.prompt).not.toContain("숙성 홍어 날개 살을 얇고 불규칙하게");
    expect(request.prompt).toContain("접시를 더 작게, 자연광은 부드럽게");
    expect(buildImageRequest(ImageBriefSchema.parse({topic:"홍어 전문점"})).prompt).not.toContain("노릇");
  });
  it("forbids rendering the question topic as text at both ends of the prompt",()=>{
    const prompt=buildImageRequest({topic:"홍어가 톡 쏘는 이유",count:1,aspectRatio:"4:5"}).prompt;
    expect(prompt.startsWith("Absolutely no text in the image")).toBe(true);
    expect(prompt.trimEnd().endsWith("Food and background only.")).toBe(true);
    expect(prompt).toContain("이미지에 글자로 쓰지 말 것): 홍어가 톡 쏘는 이유");
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
    // 카드 글자만 고쳐 다시 그릴 수 있게 글자 없는 밑바탕도 함께 돌려준다.
    expect(body.baseImages).toHaveLength(1);
    expect(body.baseImages[0]).toHaveLength(1);
    expect(await sharp(Buffer.from(body.baseImages[0][0].split(",")[1],"base64")).metadata()).toMatchObject({width:40,height:40,format:"jpeg"});
  });
  beforeEach(()=>{
    generateImage.mockReset();
    editImage.mockReset();
    readSettings.mockReset();
    readSettings.mockResolvedValue({...DEFAULT_SETTINGS,imageAiProvider:"automatic"});
    // 이 파일은 Higgsfield 키가 없는 기존 순서(Cloudflare → OpenAI)를 검증한다.
    vi.stubEnv("HF_API_KEY_ID","");
    vi.stubEnv("HF_API_KEY_SECRET","");
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
  it("gives each cover candidate its own camera setup and continues numbering after a partial provider", () => {
    const briefs=candidateBriefs({topic:"홍어 표지",count:2,aspectRatio:"4:5",slide:coverSlide,slideIndex:1,slideTotal:5,styleAnchor:carouselStyleAnchor});
    expect(briefs.map(brief=>brief.count)).toEqual([1,1]);
    expect(briefs.map(brief=>brief.variant)).toEqual([CANDIDATE_VARIANTS[0],CANDIDATE_VARIANTS[1]]);
    expect(buildImagePrompt(briefs[1])).toContain(`이 후보만의 구도: ${CANDIDATE_VARIANTS[1]}`);
    expect(candidateBriefs({topic:"홍어 표지",count:1,aspectRatio:"4:5",candidateOffset:1})[0].variant).toBe(CANDIDATE_VARIANTS[1]);
    expect(candidateBriefs({topic:"홍어 한 장",count:1,aspectRatio:"4:5"})[0].variant).toBeUndefined();
  });

  it("sends two different prompts to OpenAI for two cover candidates", async () => {
    generateImage.mockResolvedValue({data:[{b64_json:"aW1n"}]});
    const response=await generateImages(new Request("http://localhost/api/images/generate",{
      method:"POST",
      body:JSON.stringify({topic:"홍어 표지",count:2,aspectRatio:"4:5"}),
    }));
    expect(response.status).toBe(200);
    expect(generateImage).toHaveBeenCalledTimes(2);
    const prompts=generateImage.mock.calls.map(([request])=>request.prompt);
    expect(prompts[0]).not.toBe(prompts[1]);
    expect(generateImage.mock.calls.every(([request])=>request.n===1)).toBe(true);
  });

  it("keeps only the mood of the cover for later slides and lowers fidelity so the scene can change", async () => {
    const reference="data:image/png;base64,"+Buffer.from("png").toString("base64");
    const request=await buildImageEditRequest({slide:visitSlide,slideIndex:5,slideTotal:5 as const,styleAnchor:carouselStyleAnchor,topic:"홍어 한 상",count:1,aspectRatio:"4:5",referenceImage:reference,referenceMode:"continuity"});
    expect(request.input_fidelity).toBe("low");
    expect(request.prompt).toContain("분위기만 이어 가고");
    expect(request.prompt).toContain("표지와 같은 접시 배치를 다시 그리지 말 것");
    expect(request.prompt).not.toContain("동일하게 유지");
    expect(request.prompt).toContain("손, 젓가락, 잔, 뒷모습");
    expect(request.prompt).not.toContain("손님 얼굴");
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
      slideLayout:"overlay",
      styleAnchor:"따뜻한 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트",
    });

    expect(request.prompt).toContain("비 오는 날 홍어와 막걸리");
    expect(request.prompt).toContain("창가의 빗빛");
    expect(request.prompt).toContain(visitSlide.visualPrompt);
    // 사진 위 글자형은 모든 장을 풀스크린으로 그리므로 아래쪽 여백과 필름 톤을 요청한다.
    expect(request.prompt).toContain("bottom 45%");
    expect(request.prompt).not.toContain("하나의 음식 피사체");
    // 장마다 자동(기본)은 그 장의 레이아웃(여기서는 대조 프레임)에 맞는 사진 분위기를 요청한다.
    const card=buildImageRequest({topic:"비 오는 날 홍어와 막걸리",count:1,aspectRatio:"4:5",slide:visitSlide,styleAnchor:"따뜻한 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트"});
    expect(card.prompt).toContain("calm subject centered");
    expect(card.prompt).not.toContain("bottom 45%");
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

    expect(request.prompt).toContain("화풍, 색감, 조명, 분위기만 참고");
    expect(request.prompt).toContain(visitSlide.visualPrompt);
    expect(request.prompt).not.toContain("원본 음식의 형태와 특징은 유지");
  });

  it("switches to the requested art style and drops the photo-realism directive",()=>{
    const anime=buildImageRequest(ImageBriefSchema.parse({topic:"홍어 삼합",count:1,imageStyle:"anime"})).prompt;
    expect(anime).toContain("anime-style");
    expect(anime).toContain("사진처럼 만들지 말고");
    expect(anime).not.toContain("Editorial food photography");
    const inferred=buildImageRequest(ImageBriefSchema.parse({topic:"홍어 삼합",count:1,refinement:"애니메이션 풍으로 바꿔 주세요"})).prompt;
    expect(inferred).toContain("anime-style");
    expect(inferred).toContain("가장 우선");
    expect(buildImageRequest(ImageBriefSchema.parse({topic:"홍어 삼합",count:1})).prompt).toContain("Editorial food photography");
  });

  it("tells the model not to copy text or characters from an uploaded reference and lowers fidelity when the image must change",async()=>{
    const reference={topic:"홍어",count:1,aspectRatio:"4:5" as const,referenceImage:"data:image/png;base64,iVBORw0KGgo="};
    const source=await buildImageEditRequest({...reference,referenceMode:"source"});
    expect(source.prompt).toContain("글자, 표, 로고, 캐릭터");
    expect(source.input_fidelity).toBe("high");
    expect((await buildImageEditRequest({...reference,referenceMode:"style"})).input_fidelity).toBe("low");
    expect((await buildImageEditRequest({...reference,referenceMode:"source",imageStyle:"illustration"})).input_fidelity).toBe("low");
    const revised=await buildImageEditRequest({...reference,referenceMode:"continuity",refinement:"애니메이션 풍으로"});
    expect(revised.input_fidelity).toBe("low");
    expect(revised.prompt).toContain("수정 요청을 우선");
    expect(revised.prompt).not.toContain("동일하게 유지");
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
    // AI가 만든 밑바탕은 라우트에서 약한 보정(photoKind "ai")을 거친다.
    const expected=await composeSlideImage(source,visitSlide,5,5,undefined,undefined,{photoKind:"ai"});

    expect(actual.equals(expected)).toBe(true);
  }, 15_000);

  it("keeps automatic routing when settings cannot be read", async () => {
    readSettings.mockRejectedValueOnce(new Error("broken settings"));
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,result:{image:"Y2xvdWRmbGFyZS1pbWFnZQ=="}}),{status:200,headers:{"Content-Type":"application/json"}})));
    const response=await generateImages(new Request("http://localhost/api/images/generate",{method:"POST",body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"})}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({provider:"cloudflare",fallback:false});
    expect(generateImage).not.toHaveBeenCalled();
  });


  it("fails closed on cost when settings cannot be read and Cloudflare fails", async () => {
    readSettings.mockRejectedValueOnce(new Error("broken settings"));
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","account-123");
    vi.stubEnv("CLOUDFLARE_API_TOKEN","token-123");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({success:false,errors:[{message:"daily limit"}]}),{status:429,headers:{"Content-Type":"application/json"}})));
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const response=await generateImages(new Request("http://localhost/api/images/generate",{method:"POST",body:JSON.stringify({topic:"홍어 한 상",count:1,aspectRatio:"4:5"})}));
    expect(response.status).toBe(502);
    expect(generateImage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("설정"), expect.any(String));
    warn.mockRestore();
  });

});

describe("hongeo stays the hero", () => {
  it("tells the image model that the skate is largest and in front while pork and kimchi are sides", () => {
    const prompt=buildImagePrompt({topic:"홍어 삼합",count:1,aspectRatio:"4:5",slideIndex:2,slideTotal:5,styleAnchor:"따뜻한 색온도, 흰 그릇, 짙은 나무 테이블",slide:{role:"how-to",subline:"",headline:"한 점은 이렇게",points:["묵은지 위에 수육과 홍어를 올려요"],visualPrompt:"젓가락으로 삼합 한 점을 만드는 손",textPosition:"top",layout:"step",keywords:["삼합"],figure:"",titleFont:"auto",bodyFont:"auto",variant:0}});
    expect(prompt).toContain("주인공은 홍어");
    expect(prompt).toContain("The fermented skate is the hero");
    expect(prompt).toContain("수육이 홍어를 가리면 안 된다");
    // 홍어와 무관한 주제에는 붙지 않는다.
    expect(buildImagePrompt({topic:"김치찌개",count:1,aspectRatio:"4:5",slideIndex:1,slideTotal:3,styleAnchor:"따뜻한 색온도, 흰 그릇, 짙은 나무 테이블"})).not.toContain("The fermented skate is the hero");
  });
  it("forbids drawing the skate as a whole small fish", () => {
    const prompt=buildImagePrompt({topic:"홍어회",count:1,aspectRatio:"4:5",slideIndex:1,slideTotal:5,styleAnchor:"따뜻한 색온도"});
    expect(prompt).toContain("통째 생선으로 그리지 않는다");
    expect(prompt).toContain("Never show a whole small fish");
  });
});

describe("appetizing photo direction (A9)", () => {
  const brief={topic:"홍어회",count:1,aspectRatio:"4:5" as const,slideIndex:1,slideTotal:5,styleAnchor:"따뜻한 색온도"};
  it("asks for glossy texture, warm side light, Korean props only, at a sane length", () => {
    const prompt=buildImagePrompt(brief);
    expect(prompt).toContain("glossy moist highlights");
    expect(prompt).toContain("3200-4000K side light");
    expect(prompt).toContain("visible parallel fiber texture");
    expect(prompt).toContain("translucent pink edges backlit");
    expect(prompt).toContain("plate fills about 60%");
    expect(prompt).toContain("brass yugi bowls");
    expect(prompt).toContain("No Japanese props");
    expect(prompt.length).toBeLessThan(3200);
  });
  it("keeps skate texture out of other foods and illustration styles", () => {
    expect(buildImagePrompt({...brief,topic:"김치찌개"})).not.toContain("Skate texture:");
    expect(buildImagePrompt({...brief,imageStyle:"anime"})).not.toContain("Skate texture:");
  });
});

describe("each slide shows what its copy describes", () => {
  const slide=(headline:string,points:string[])=>({role:"how-to" as const,subline:"",headline,points,visualPrompt:"젓가락으로 한 점을 집는 손",textPosition:"top" as const,layout:"frame" as const,keywords:["홍어"],figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0});
  const brief=(headline:string,points:string[])=>({topic:"홍어가 코를 찡하게 하는 이유",count:1,aspectRatio:"4:5" as const,slideIndex:4,slideTotal:5,styleAnchor:"따뜻한 조명",slide:slide(headline,points)});
  it("puts the kimchi wrap and the boiled pork from the copy into the image prompt", () => {
    // 사장님이 보내 준 실제 사례: "묵은지에 가볍게 감싸요"·"수육 한 조각을 곁들여요" 장인데 홍어만 든 사진이 나왔다.
    const prompt=buildImagePrompt(brief("홍어 한 점을 묵은지에 가볍게 감싸요.",["홍어 한 점을 새콤한 묵은지 위에 올려 부드럽게 감싸요","홍어의 독특한 향 뒤로 담백한 수육 한 조각을 살짝 곁들여요"]));
    expect(prompt).toContain("MUST SHOW");
    expect(prompt).toContain("wrapped in or laid on a leaf of red aged kimchi");
    expect(prompt).toContain("a slice of boiled pork belly together with the skate");
    // 필수 장면은 공통 지시문보다 앞(장면 설명 바로 앞)에 온다.
    expect(prompt.indexOf("MUST SHOW")).toBeLessThan(prompt.indexOf("슬라이드 역할"));
  });
  it("uses one samhap line instead of repeating pork and kimchi", () => {
    const prompt=buildImagePrompt(brief("삼합은 이렇게 겹쳐 드세요",["묵은지 위에 수육과 홍어를 올려요"]));
    expect(prompt).toContain("stacked together in one chopstick bite");
    expect(prompt).not.toContain("a slice of boiled pork belly together with the skate");
  });
  it("adds nothing when the copy names no combination", () => {
    expect(buildImagePrompt(brief("홍어 살은 씹을수록 찰져요",["얇게 썰려 결이 보여요"]))).not.toContain("MUST SHOW");
  });
});

describe("no chopstick lifting unless the scene asks for it", () => {
  const brief=(visualPrompt:string)=>({topic:"홍어회",count:1,aspectRatio:"4:5" as const,slideIndex:2,slideTotal:5,styleAnchor:"따뜻한 조명",
    slide:{role:"pairing" as const,subline:"",headline:"막걸리와 함께 놓아요",points:["사발에 막걸리를 따라요"],visualPrompt,textPosition:"top" as const,layout:"frame" as const,keywords:["막걸리"],figure:"",titleFont:"auto" as const,bodyFont:"auto" as const,variant:0}});
  it("tells the model to keep the food on the plate when the scene does not mention lifting", () => {
    expect(buildImagePrompt(brief("홍어 접시 옆 사발에 막걸리를 따르는 순간, 손·젓가락·얼굴 없음"))).toContain("Do NOT show chopsticks lifting a slice");
  });
  it("allows it when the scene itself is about lifting a slice", () => {
    expect(buildImagePrompt(brief("젓가락으로 홍어 한 점을 집어 든 손을 눈높이에서"))).not.toContain("Do NOT show chopsticks lifting a slice");
  });
});
