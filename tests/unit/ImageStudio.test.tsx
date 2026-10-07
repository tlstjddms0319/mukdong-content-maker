import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageStudio } from "@/components/images/ImageStudio";
import { resetGenerationStore } from "@/features/images/generationStore";

const plan={slideCount:3,styleAnchor:"따뜻한 흰 그릇과 나무 테이블의 일관된 음식 사진",design:{palette:"warm"},slides:[{role:"cover",headline:"표지",points:[],visualPrompt:"선명한 완성 음식 한 상을 정면에서 담은 사진",textPosition:"top",layout:"fullscreen",keywords:["홍어"],figure:""},{role:"how-to",headline:"먹는 법",points:[],visualPrompt:"젓가락으로 한 점을 만드는 손동작 음식 사진",textPosition:"bottom",layout:"frame",keywords:["먹는 법"],figure:""},{role:"visit",headline:"방문",points:[],visualPrompt:"편안한 완성 상차림을 담은 음식 사진 장면",textPosition:"bottom",layout:"frame",keywords:["방문"],figure:""}]};
describe("ImageStudio carousel",()=>{
  it("uses the clean selected cover as a reference and can replace only one slide",async()=>{
    let slideCalls=0;
    // 맨 뒤 가게 홍보 카드는 따로 그리므로 장 번호(slide-N)를 세지 않는다.
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:url==="/api/images/store-card"?{ok:true,json:async()=>({image:"store"})}:{ok:true,json:async()=>{
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
    expect(approve).toHaveBeenCalledWith([expect.objectContaining({preview:"cover-2"}),expect.objectContaining({preview:"slide-3"}),expect.objectContaining({preview:"slide-2"}),expect.objectContaining({preview:"store"})]);
    expect(JSON.parse(String(request.mock.calls.filter(([url])=>url==="/api/images/generate").at(-1)![1]?.body)).refinement).toBe("빛을 부드럽게 하고 접시 주변 여백을 넓혀 주세요");
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
    expect(bodies).toMatchObject([{count:2,slideIndex:1,slideTotal:4,storeCard:true,slide:{role:"cover"}},{count:1,slideIndex:2,slide:{role:"how-to"}},{count:1,slideIndex:3,slide:{role:"visit"}}]);
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
  it("approves uploaded photos as they are",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({asset:{id:"stored-photo",preview:"data:image/jpeg;base64,AAAA",name:"a"}})}));const approve=vi.fn();render(<ImageStudio topic="사진 주제" slideCount={3} onApprove={approve}/>);fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));await waitFor(()=>expect(approve).toHaveBeenCalledWith([expect.objectContaining({id:"stored-photo",source:"photo"})]));});
  it("keeps a recoverable retry after incomplete cover candidates",async()=>{
    const request=vi.fn(async(url:string)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:["only-one"]})});vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="주제" slideCount={3} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));expect(await screen.findByRole("button",{name:"표지 후보 다시 만들기"})).toBeEnabled();
  });
  it("uses the requested seven-slide count",async()=>{
    const seven={...plan,slideCount:7,slides:Array.from({length:7},(_,i)=>({...plan.slides[Math.min(i,2)],role:["cover","overview","detail","how-to","pairing","occasion","visit"][i]}))};const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan:seven})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"],source:"ai-generated"})});vi.stubGlobal("fetch",request);render(<ImageStudio topic="7장 주제" slideCount={7} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 7장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});expect(JSON.parse(String((request.mock.calls[0][1] as RequestInit).body)).slideCount).toBe(7);
  });
  it("sends the mixed reference for every generated slide, keeping the food only on the cover",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/media/upload"?{ok:true,json:async()=>({id:"reference"})}:url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["slide"]})});vi.stubGlobal("fetch",request);render(<ImageStudio topic="혼합 주제" slideCount={3} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"사진 + AI 함께"}));fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});await screen.findByText("a.png 참고 사진을 저장했어요.");fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});const bodies=request.mock.calls.filter(([url])=>url==="/api/images/generate").map(([,init])=>JSON.parse(String((init as RequestInit).body)));expect(bodies).toHaveLength(3);expect(bodies.every(body=>body.referenceImage)).toBe(true);
    // 표지 후보만 "음식 그대로", 나머지 장은 색감·조명만 이어 간다(같은 접시가 장마다 반복되지 않게).
    expect(bodies.map(body=>body.referenceMode)).toEqual(["source","style","style"]);
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
    let resolve:(value:unknown)=>void=()=>{};vi.stubGlobal("fetch",vi.fn(()=>new Promise(response=>{resolve=response;})));render(<ImageStudio topic="늦은 응답" slideCount={3} onApprove={()=>undefined}/>);fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));fireEvent.click(screen.getByRole("button",{name:"실제 사진 사용"}));resolve({ok:true,json:async()=>({plan})});await Promise.resolve();await Promise.resolve();expect(screen.queryByRole("button",{name:"표지 후보 1 선택"})).not.toBeInTheDocument();expect(screen.getByText(/사진을 여기에 끌어놓으세요/)).toBeInTheDocument();
  });
  it("shows the uploaded photo preview and leaves photo mode usable after an upload error",async()=>{
    const request=vi.fn(async()=>({ok:true,json:async()=>({asset:{id:"stored-photo",preview:"data:image/jpeg;base64,AAAA",name:"success"}})}));vi.stubGlobal("fetch",request);render(<ImageStudio topic="사진 주제" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"success.png",{type:"image/png"})]}});
    expect(await screen.findByAltText("success")).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith("/api/images/assets",expect.anything());
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({message:"사진을 올릴 수 없어요."})})));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["b"],"failure.png",{type:"image/png"})]}});
    expect(await screen.findByRole("alert")).toHaveTextContent("사진을 올릴 수 없어요.");expect(screen.getByRole("button",{name:"실제 사진 사용"})).toHaveAttribute("aria-pressed","true");expect(screen.getByText(/사진을 여기에 끌어놓으세요/)).toBeInTheDocument();expect(screen.getByAltText("success")).toBeInTheDocument();
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
  it("shows the AI cover check on the candidates",async()=>{
    const checks=[{score:8,note:"선명해요",warnings:[]},{score:6,note:"글자가 보여요",warnings:["이미지 속 글자"]}];
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan,provider:"gemini"})}:{ok:true,json:async()=>({images:["cover-1","cover-2"],checks})}));
    render(<ImageStudio topic="표지 점검" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByText("AI 추천 · 8점")).toBeInTheDocument();
    expect(screen.getByText("⚠ 이미지 속 글자")).toBeInTheDocument();
  });
  it("keeps AI mode selected when plan generation fails",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({message:"구성안을 만들 수 없어요."})})));render(<ImageStudio topic="AI 오류" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("구성안을 만들 수 없어요.");expect(screen.getByRole("button",{name:"AI 이미지 생성"})).toHaveAttribute("aria-pressed","true");expect(screen.getByRole("button",{name:"표지 후보 2장 만들기"})).toBeInTheDocument();
  });
  it("shows distinct planning, cover, and remaining-slide progress",async()=>{
    // 남은 장은 두 장씩 동시에 요청하므로, 장 요청마다 따로 풀 수 있게 차례대로 모아 둔다.
    let resolvePlan:(value:unknown)=>void=()=>{},resolveCover:(value:unknown)=>void=()=>{};const slideResolvers:Array<(value:unknown)=>void>=[];
    const resolveSlide=(value:unknown)=>slideResolvers.shift()?.(value);
    const request=vi.fn((url:string,init?:RequestInit)=>url==="/api/images/plan"?new Promise(resolve=>{resolvePlan=resolve;}):JSON.parse(String(init?.body)).count===2?new Promise(resolve=>{resolveCover=resolve;}):new Promise(resolve=>{slideResolvers.push(resolve);}));vi.stubGlobal("fetch",request);render(<ImageStudio topic="진행 상태" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));expect(screen.getByRole("status")).toHaveTextContent("캐러셀 구성을 만들고 있어요");
    resolvePlan({ok:true,json:async()=>({plan})});expect(await screen.findByRole("status")).toHaveTextContent("표지 후보 2장을 만들고 있어요");
    resolveCover({ok:true,json:async()=>({images:["cover-1","cover-2"]})});await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    expect(await screen.findByRole("status")).toHaveTextContent("1/3장 완성");await waitFor(()=>expect(slideResolvers).toHaveLength(2));resolveSlide({ok:true,json:async()=>({images:["two"]})});await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("2/3장 완성"));resolveSlide({ok:true,json:async()=>({images:["three"]})});await screen.findByRole("button",{name:"이 캐러셀 사용"});
  });
  it("makes the remaining slides two at a time but keeps them in order",async()=>{
    const slideResolvers:Array<(value:unknown)=>void>=[];
    const request=vi.fn((url:string,init?:RequestInit)=>url==="/api/images/plan"?Promise.resolve({ok:true,json:async()=>({plan})}):JSON.parse(String(init?.body)).count===2?Promise.resolve({ok:true,json:async()=>({images:["cover-1","cover-2"]})}):new Promise(resolve=>{slideResolvers.push(resolve);}));
    vi.stubGlobal("fetch",request);render(<ImageStudio topic="동시에" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    fireEvent.click(await screen.findByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));
    await waitFor(()=>expect(slideResolvers).toHaveLength(2));
    // 세 번째 장이 먼저 와도 두 번째 장을 기다렸다가 순서대로 붙인다.
    slideResolvers[1]({ok:true,json:async()=>({images:["three"]})});
    slideResolvers[0]({ok:true,json:async()=>({images:["two"]})});
    await screen.findByRole("button",{name:"이 캐러셀 사용"});
    expect(screen.getByRole("button",{name:"생성된 슬라이드 2 보기"})).toHaveStyle({backgroundImage:'url("two")'});
    expect(screen.getByRole("button",{name:"생성된 슬라이드 3 보기"})).toHaveStyle({backgroundImage:'url("three")'});
  });
  it("explains when automatic image generation used the OpenAI fallback",async()=>{
    const request=vi.fn(async(url:string)=>url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:true,json:async()=>({images:["cover-1","cover-2"],provider:"openai",fallback:true,notice:"Cloudflare 생성이 어려워 OpenAI(으)로 전환했어요."})});
    vi.stubGlobal("fetch",request);render(<ImageStudio topic="대체 생성" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    expect(await screen.findByText("Cloudflare 생성이 어려워 OpenAI(으)로 전환했어요.")).toBeInTheDocument();
  });
});

describe("owner photo cover recommendation",()=>{
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();});
  it("shows quality badges and a cover pick, asks Gemini only from the button, and never reorders on its own",async()=>{
    let uploads=0;
    const analysis=(score:boolean)=>({analyzed:true,scored:score,scoreAvailable:true,ranking:["p2","p1"],recommended:"p2",photos:[
      {id:"p1",flags:["dark"],labels:["어두움"],measured:true,appetite:null},
      {id:"p2",flags:[],labels:[],measured:true,appetite:score?{score:9,appetite:5,lighting:4,composition:4,warnings:[],note:"윤기가 좋아요"}:null},
    ]});
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/analyze"?{ok:true,json:async()=>analysis(JSON.parse(String(init?.body)).score)}
      :{ok:true,json:async()=>{uploads++;return {asset:{id:`p${uploads}`,preview:"data:image/jpeg;base64,AAAA",name:`사진${uploads}`}};}});
    vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="홍어전" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"}),new File(["b"],"b.png",{type:"image/png"})]}});
    expect(await screen.findByText("표지로 추천")).toBeInTheDocument();
    expect(screen.getByText("어두움")).toBeInTheDocument();
    const analyzeBodies=()=>request.mock.calls.filter(([url])=>url==="/api/images/analyze").map(([,init])=>JSON.parse(String(init?.body)));
    expect(analyzeBodies().every(body=>body.score===false)).toBe(true);
    // 자동으로 순서를 바꾸지 않는다: 첫 사진은 여전히 사진1.
    const strip=screen.getByRole("list",{name:"고른 사진"});
    expect(strip.querySelectorAll("li")[0].querySelector("img")?.getAttribute("alt")).toBe("사진1");
    fireEvent.click(screen.getByRole("button",{name:"맛있어 보이는 사진 찾기 · 메뉴 확인"}));
    await waitFor(()=>expect(analyzeBodies().at(-1)).toMatchObject({score:true,topic:"홍어전"}));
    expect(await screen.findByText(/표지는 직접 골라 주세요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"2번 사진을 표지로"}));
    await waitFor(()=>expect(strip.querySelectorAll("li")[0].querySelector("img")?.getAttribute("alt")).toBe("사진2"));
  });
  it("warns when a chosen photo shows a different menu than the post, and tags uploads with the topic only as a topic",async()=>{
    // 사장님이 겪은 사례: 과메기 글에 삼합 사진. 막지는 않고 어느 사진인지 알려 준다.
    let uploads=0;const forms:FormData[]=[];
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/images/analyze"?{ok:true,json:async()=>({analyzed:true,ranking:["p1","p2"],recommended:null,scored:false,scoreAvailable:false,photos:[
      {id:"p1",flags:[],labels:[],measured:true,food:"과메기",mismatch:null,appetite:null},
      {id:"p2",flags:[],labels:[],measured:true,food:"삼합",mismatch:"과메기 글인데 삼합 사진이에요",appetite:null},
    ]})}:(forms.push(init?.body as FormData),{ok:true,json:async()=>{uploads++;return {asset:{id:`p${uploads}`,preview:"data:image/jpeg;base64,AAAA",name:`사진${uploads}`}};}}));
    vi.stubGlobal("fetch",request);
    render(<ImageStudio topic="겨울엔 과메기 한 점" slideCount={3} onApprove={()=>undefined}/>);
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"}),new File(["b"],"b.png",{type:"image/png"})]}});
    expect(await screen.findByText("메뉴 다름")).toBeInTheDocument();
    expect(screen.getByText(/과메기 글인데 삼합 사진이에요\(2번\)/)).toBeInTheDocument();
    const analyzeBody=JSON.parse(String(request.mock.calls.find(([url])=>url==="/api/images/analyze")![1]?.body));
    expect(analyzeBody.topic).toBe("겨울엔 과메기 한 점");
    // 올린 사진의 태그에는 주제가 "주제:"로만 붙는다(사진 속 음식으로 오해하지 않게).
    expect(String(forms[0].get("tags"))).toBe("주제:겨울엔 과메기 한 점,매장 사진");
  });
  it("offers the cover panorama only when the cover photo is wide",async()=>{
    let uploads=0;
    const analysis=(wide:boolean)=>({analyzed:true,ranking:["p1","p2"],recommended:null,scored:false,scoreAvailable:false,photos:[
      {id:"p1",flags:[],labels:[],measured:true,wide,food:null,mismatch:null,appetite:null},{id:"p2",flags:[],labels:[],measured:true,wide:false,food:null,mismatch:null,appetite:null}]});
    let wide=false;
    const request=vi.fn(async(url:string)=>url==="/api/images/analyze"?{ok:true,json:async()=>analysis(wide)}:{ok:true,json:async()=>{uploads++;return {asset:{id:`p${uploads}`,preview:"data:image/jpeg;base64,AAAA",name:`사진${uploads}`}};}});
    vi.stubGlobal("fetch",request);
    const first=render(<ImageStudio topic="홍어 한 점" slideCount={5} sessionKey="pano-a" onApprove={()=>undefined}/>);
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"}),new File(["b"],"b.png",{type:"image/png"})]}});
    await screen.findByRole("button",{name:/캐러셀 만들기/});
    await waitFor(()=>expect(request.mock.calls.some(([url])=>url==="/api/images/analyze")).toBe(true));
    expect(screen.queryByLabelText(/파노라마/)).not.toBeInTheDocument();
    first.unmount();
    wide=true;uploads=0;
    render(<ImageStudio topic="홍어 한 점" slideCount={5} sessionKey="pano-b" onApprove={()=>undefined}/>);
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"}),new File(["b"],"b.png",{type:"image/png"})]}});
    expect(await screen.findByLabelText(/파노라마/)).toBeInTheDocument();
  });
});
