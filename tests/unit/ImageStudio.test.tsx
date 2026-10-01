import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageStudio } from "@/components/images/ImageStudio";
import { resetGenerationStore } from "@/features/images/generationStore";

const plan={slideCount:3,styleAnchor:"따뜻한 흰 그릇과 나무 테이블의 일관된 음식 사진",design:{palette:"warm"},slides:[{role:"cover",headline:"표지",points:[],visualPrompt:"선명한 완성 음식 한 상을 정면에서 담은 사진",textPosition:"top",layout:"fullscreen",keywords:["홍어"],figure:""},{role:"how-to",headline:"먹는 법",points:[],visualPrompt:"젓가락으로 한 점을 만드는 손동작 음식 사진",textPosition:"bottom",layout:"frame",keywords:["먹는 법"],figure:""},{role:"visit",headline:"방문",points:[],visualPrompt:"편안한 완성 상차림을 담은 음식 사진 장면",textPosition:"bottom",layout:"frame",keywords:["방문"],figure:""}]};
describe("ImageStudio carousel",()=>{
  it("uses the clean selected cover as a reference and can replace only one slide",async()=>{
    let slideCalls=0;
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>{
      const body=JSON.parse(String(init?.body));
      return body.count===2?{images:["cover-1","cover-2"],referenceImages:["clean-cover-1","clean-cover-2"]}:{images:[`slide-${++slideCalls}`]};
    }});
    vi.stubGlobal("fetch",request);const approve=vi.fn();render(<ImageStudio topic="홍어 한 점" slideCount={3} onApprove={approve}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    fireEvent.click(await screen.findByRole("button",{name:"표지 후보 2 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    await screen.findByRole("button",{name:"이 캐러셀 사용"});
    const bodies=request.mock.calls.filter(([url])=>url==="/api/images/generate").map(([,init])=>JSON.parse(String(init?.body)));
    expect(bodies.slice(1).every(body=>body.referenceImage==="clean-cover-2"&&body.referenceMode==="continuity")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"생성된 슬라이드 2 보기"}));
    fireEvent.change(screen.getByLabelText("이 장의 수정 요청"),{target:{value:"빛을 부드럽게 하고 접시 주변 여백을 넓혀 주세요"}});
    fireEvent.click(screen.getByRole("button",{name:"이 장만 다시 만들기"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"이 캐러셀 사용"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:"이 캐러셀 사용"}));
    expect(approve).toHaveBeenCalledWith([expect.objectContaining({preview:"cover-2"}),expect.objectContaining({preview:"slide-3"}),expect.objectContaining({preview:"slide-2"})]);
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]?.body)).refinement).toBe("빛을 부드럽게 하고 접시 주변 여백을 넓혀 주세요");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({message:"이미지를 만들 수 없어요."})}));
    fireEvent.click(screen.getByRole("button",{name:"이 장만 다시 만들기"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("이미지를 만들 수 없어요.");
    expect(screen.getByLabelText("생성된 캐러셀 미리보기")).toHaveStyle({backgroundImage:'url("slide-3")'});
    expect(screen.getByLabelText("이 장의 수정 요청")).toHaveValue("빛을 부드럽게 하고 접시 주변 여백을 넓혀 주세요");
  });
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});
  it("keeps a running generation and its results when the studio unmounts and comes back",async()=>{
    let resolveCover:(value:unknown)=>void=()=>{};
    const request=vi.fn((url:string,init?:RequestInit)=>url==="/api/images/plan"?Promise.resolve({ok:true,json:async()=>({plan})}):JSON.parse(String(init?.body)).count===2?new Promise(resolve=>{resolveCover=resolve;}):Promise.resolve({ok:true,json:async()=>({images:["slide"]})}));vi.stubGlobal("fetch",request);
    const first=render(<ImageStudio topic="이어지는 주제" slideCount={3} sessionKey="draft-1" onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByRole("status")).toHaveTextContent("표지 후보 2장을 만들고 있어요");
    first.unmount();
    resolveCover({ok:true,json:async()=>({images:["cover-1","cover-2"]})});
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
    render(<ImageStudio topic="이어지는 주제" slideCount={3} sessionKey="draft-1" onApprove={()=>undefined}/>);
    expect(await screen.findByRole("button",{name:"표지 후보 2 선택"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"AI 이미지 생성"})).toHaveAttribute("aria-pressed","true");
  });
  it("starts fresh for a different draft session",async()=>{
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"]})}));
    const first=render(<ImageStudio topic="첫 주제" slideCount={3} sessionKey="draft-1" onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});
    first.unmount();
    render(<ImageStudio topic="둘째 주제" slideCount={3} sessionKey="draft-2" onApprove={()=>undefined}/>);
    expect(screen.queryByRole("button",{name:"표지 후보 1 선택"})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"실제 사진 사용"})).toHaveAttribute("aria-pressed","true");
  });
  it("plans with the selected topic, selects a cover, then generates ordered remaining slides",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:[`image-${request.mock.calls.filter(([path])=>path==="/api/images/generate").length}`],source:"ai-generated"})});
    vi.stubGlobal("fetch",request); const approve=vi.fn(); render(<ImageStudio topic="새 주제" imageBrief="따뜻한 한 상" slideCount={3} onApprove={approve}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"})); fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    await screen.findByRole("button",{name:"표지 후보 1 선택"}); fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"})); fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    await screen.findByRole("button",{name:"이 캐러셀 사용"}); fireEvent.click(screen.getByRole("button",{name:"이 캐러셀 사용"}));
    const bodies=request.mock.calls.map(([,init])=>JSON.parse(String((init as RequestInit).body))).filter((body)=>body.slide);
    expect(JSON.parse(String((request.mock.calls[0][1] as RequestInit).body))).toMatchObject({topic:"새 주제",slideCount:3});
    expect(bodies).toMatchObject([{count:2,slideIndex:1,slideTotal:3,slide:{role:"cover"}},{count:1,slideIndex:2,slide:{role:"how-to"}},{count:1,slideIndex:3,slide:{role:"visit"}}]);
    expect(JSON.stringify(bodies)).not.toContain("홍어 삼합"); expect(approve).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({role:"cover"}),expect.objectContaining({role:"visit"})]));
  });
  it("shows the completed carousel in order before explicit approval",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>{const body=JSON.parse(String(init?.body));return {images:body.count===2?["cover-1","cover-2"]:[`slide-${body.slideIndex}`],source:"ai-generated"};}});
    vi.stubGlobal("fetch",request);const approve=vi.fn();render(<ImageStudio topic="미리보기 주제" slideCount={3} onApprove={approve}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    await screen.findByRole("button",{name:"표지 후보 2 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 2 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    await screen.findByRole("button",{name:"이 캐러셀 사용"});
    expect(screen.queryByRole("button",{name:"이 표지로 3장 완성하기"})).not.toBeInTheDocument();
    const preview=screen.getByLabelText("생성된 캐러셀 미리보기"),thumbnails=screen.getAllByRole("button",{name:/생성된 슬라이드 \d 보기/});
    expect(thumbnails).toHaveLength(3);expect(thumbnails.map(thumbnail=>thumbnail.style.backgroundImage)).toEqual(['url("cover-2")','url("slide-2")','url("slide-3")']);
    expect(preview).toHaveStyle({aspectRatio:"4 / 5",backgroundImage:'url("cover-2")'});expect(screen.getByText("1 / 3")).toBeInTheDocument();expect(approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"생성된 슬라이드 3 보기"}));expect(preview).toHaveStyle({backgroundImage:'url("slide-3")'});expect(screen.getByText("3 / 3")).toBeInTheDocument();expect(approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"이 캐러셀 사용"}));expect(approve).toHaveBeenCalledWith([expect.objectContaining({preview:"cover-2"}),expect.objectContaining({preview:"slide-2"}),expect.objectContaining({preview:"slide-3"})]);
  });
  it("keeps completed slides and retries from the failed position",async()=>{
    let calls=0; const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:JSON.parse(String(init?.body)).count===2?{ok:true,json:async()=>({images:["cover-1","cover-2"]})}:{ok:calls++!==1,json:async()=>calls===2?{message:"실패"}:{images:[`image-${calls}`]}}); vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="주제" slideCount={3} onApprove={()=>undefined}/>); fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"})); fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"})); await screen.findByRole("button",{name:"표지 후보 1 선택"}); fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"})); fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    expect(await screen.findByRole("button",{name:"남은 슬라이드 다시 만들기"})).toBeInTheDocument(); fireEvent.click(screen.getByRole("button",{name:"남은 슬라이드 다시 만들기"})); await screen.findByRole("button",{name:"이 캐러셀 사용"});
  });
  it("approves one uploaded photo",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"stored-photo"})}));const approve=vi.fn();render(<ImageStudio topic="사진 주제" slideCount={3} onApprove={approve}/>);fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});await waitFor(()=>expect(approve).toHaveBeenCalledWith([expect.objectContaining({id:"stored-photo",source:"photo"})]));});
  it("keeps a recoverable retry after incomplete cover candidates",async()=>{
    const request=vi.fn(async(url:string)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:["only-one"]})});vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="주제" slideCount={3} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));expect(await screen.findByRole("button",{name:"표지 후보 다시 만들기"})).toBeEnabled();
  });
  it("uses the requested seven-slide count",async()=>{
    const seven={...plan,slideCount:7,slides:Array.from({length:7},(_,i)=>({...plan.slides[Math.min(i,2)],role:["cover","overview","detail","how-to","pairing","occasion","visit"][i]}))};const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan:seven})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"],source:"ai-generated"})});vi.stubGlobal("fetch",request);render(<ImageStudio topic="7장 주제" slideCount={7} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 7장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});expect(JSON.parse(String((request.mock.calls[0][1] as RequestInit).body)).slideCount).toBe(7);
  });
  it("sends the mixed reference for every generated slide",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/media/upload"?{ok:true,json:async()=>({id:"reference"})}:url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"]})});vi.stubGlobal("fetch",request);render(<ImageStudio topic="혼합 주제" slideCount={3} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"사진 + AI 함께"}));fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});await screen.findByText("a.png 참고 사진을 저장했어요.");fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});const bodies=request.mock.calls.filter(([url])=>url==="/api/images/generate").map(([,init])=>JSON.parse(String((init as RequestInit).body)));expect(bodies).toHaveLength(3);expect(bodies.every(body=>body.referenceImage&&body.referenceMode==="source")).toBe(true);
  });
  it("sends the chosen art style and reference use with every request",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/media/upload"?{ok:true,json:async()=>({id:"reference"})}:url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"]})});vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="화풍 주제" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"사진 + AI 함께"}));fireEvent.click(screen.getByRole("button",{name:"애니메이션"}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});await screen.findByText("a.png 참고 사진을 저장했어요.");
    fireEvent.click(screen.getByRole("button",{name:"화풍·분위기만"}));expect(screen.getByRole("button",{name:"화풍·분위기만"})).toHaveAttribute("aria-pressed","true");
    fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});
    expect(JSON.parse(String(request.mock.calls.find(([url])=>url==="/api/images/plan")![1]?.body)).imageStyle).toBe("anime");
    const bodies=request.mock.calls.filter(([url])=>url==="/api/images/generate").map(([,init])=>JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toHaveLength(3);expect(bodies.every(body=>body.imageStyle==="anime"&&body.referenceImage&&body.referenceMode==="style")).toBe(true);
  });
  it("sends the card layout by default and the overlay layout when chosen",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"]})});vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="디자인 주제" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));
    expect(screen.getByRole("button",{name:"장마다 자동"})).toHaveAttribute("aria-pressed","true");
    fireEvent.click(screen.getByRole("button",{name:"사진 위 글자"}));
    fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});
    const body=JSON.parse(String(request.mock.calls.find(([url])=>url==="/api/images/generate")![1]?.body));
    expect(body.slideLayout).toBe("overlay");
  });
  it("ignores a late AI plan after switching to photo mode",async()=>{
    let resolve:(value:unknown)=>void=()=>{};vi.stubGlobal("fetch",vi.fn(()=>new Promise(response=>{resolve=response;})));render(<ImageStudio topic="늦은 응답" slideCount={3} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));fireEvent.click(screen.getByRole("button",{name:"실제 사진 사용"}));resolve({ok:true,json:async()=>({plan})});await Promise.resolve();await Promise.resolve();expect(screen.queryByRole("button",{name:"표지 후보 1 선택"})).not.toBeInTheDocument();expect(screen.getByText("사진을 여기에 끌어놓으세요")).toBeInTheDocument();
  });
  it("shows the uploaded photo preview and leaves photo mode usable after an upload error",async()=>{
    const request=vi.fn(async()=>({ok:true,json:async()=>({id:"stored-photo"})}));vi.stubGlobal("fetch",request);render(<ImageStudio topic="사진 주제" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"success.png",{type:"image/png"})]}});
    expect(await screen.findByAltText("선택한 사진 미리보기")).toBeInTheDocument();
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({message:"사진을 올릴 수 없어요."})})));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["b"],"failure.png",{type:"image/png"})]}});
    expect(await screen.findByRole("alert")).toHaveTextContent("사진을 올릴 수 없어요.");expect(screen.getByRole("button",{name:"실제 사진 사용"})).toHaveAttribute("aria-pressed","true");expect(screen.getByText("사진을 여기에 끌어놓으세요")).toBeInTheDocument();
  });
  it("stops before making covers when the plan came from the prepared fallback and retries on request",async()=>{
    let planCalls=0;
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan,provider:++planCalls===1?"fallback":"gemini"})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"]})});
    vi.stubGlobal("fetch",request);render(<ImageStudio topic="기본 문안" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("기본 문안으로 채웠어요");
    expect(request.mock.calls.filter(([url])=>url==="/api/images/generate")).toHaveLength(0);
    expect(screen.getByRole("button",{name:"기본 구성안으로 표지 만들기"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"구성안 다시 만들기"}));
    await screen.findByRole("button",{name:"표지 후보 1 선택"});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("keeps AI mode selected when plan generation fails",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({message:"구성안을 만들 수 없어요."})})));render(<ImageStudio topic="AI 오류" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("구성안을 만들 수 없어요.");expect(screen.getByRole("button",{name:"AI 이미지 생성"})).toHaveAttribute("aria-pressed","true");expect(screen.getByRole("button",{name:"표지 후보 2장 만들기"})).toBeInTheDocument();
  });
  it("shows distinct planning, cover, and remaining-slide progress",async()=>{
    let resolvePlan:(value:unknown)=>void=()=>{},resolveCover:(value:unknown)=>void=()=>{},resolveSlide:(value:unknown)=>void=()=>{};
    const request=vi.fn((url:string,init?:RequestInit)=>url==="/api/images/plan"?new Promise(resolve=>{resolvePlan=resolve;}):JSON.parse(String(init?.body)).count===2?new Promise(resolve=>{resolveCover=resolve;}):new Promise(resolve=>{resolveSlide=resolve;}));vi.stubGlobal("fetch",request);render(<ImageStudio topic="진행 상태" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));expect(screen.getByRole("status")).toHaveTextContent("캐러셀 구성을 만들고 있어요");
    resolvePlan({ok:true,json:async()=>({plan})});expect(await screen.findByRole("status")).toHaveTextContent("표지 후보 2장을 만들고 있어요");
    resolveCover({ok:true,json:async()=>({images:["cover-1","cover-2"]})});await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    expect(await screen.findByRole("status")).toHaveTextContent("1/3장 완성");resolveSlide({ok:true,json:async()=>({images:["two"]})});await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("2/3장 완성"));resolveSlide({ok:true,json:async()=>({images:["three"]})});await screen.findByRole("button",{name:"이 캐러셀 사용"});
  });
  it("explains when automatic image generation used the OpenAI fallback",async()=>{
    const request=vi.fn(async(url:string)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:["cover-1","cover-2"],provider:"openai",fallback:true,notice:"Cloudflare 생성이 어려워 OpenAI(으)로 전환했어요."})});
    vi.stubGlobal("fetch",request);render(<ImageStudio topic="대체 생성" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByText("Cloudflare 생성이 어려워 OpenAI(으)로 전환했어요.")).toBeInTheDocument();
  });
});
