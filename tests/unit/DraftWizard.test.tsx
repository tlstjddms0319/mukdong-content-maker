import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftWizard } from "@/components/wizard/DraftWizard";
import { resetGenerationStore } from "@/features/images/generationStore";

// 새 3단계 화면(1 무엇을 올릴까요 → 2 만들기 → 3 확인하고 올리기)과 자동 만들기 흐름.
// fetch는 주소별 처리기로 흉내 낸다. 처리기가 FAIL을 돌려주면 ok:false 응답이 된다.
type Handler=(body:Record<string,unknown>,init?:RequestInit)=>unknown;
const FAIL={__fail:true};
function api(routes:Record<string,Handler>){
  return vi.fn(async(url:string,init?:RequestInit)=>{
    const key=Object.keys(routes).find(route=>route.endsWith("*")?url.startsWith(route.slice(0,-1)):`${init?.method??"GET"} ${url}`===route||url===route);
    if(!key)return {ok:false,json:async()=>({})};
    const body=typeof init?.body==="string"?JSON.parse(init.body):{};
    const result=await routes[key](body,init);
    return result===FAIL?{ok:false,json:async()=>({message:"실패"})}:{ok:true,json:async()=>result};
  });
}
const calls=(request:ReturnType<typeof api>,url:string,method?:string)=>request.mock.calls.filter(([called,init])=>called===url&&(!method||(init as RequestInit|undefined)?.method===method)).map(([,init])=>JSON.parse(String((init as RequestInit).body)));
const roles=["cover","detail","how-to","pairing","visit"] as const;
// 갈래가 정한 구성안(서버가 applyTrack까지 마친 모양): 표지 fullscreen, 본문 browser(글 중심) / frame(사진 중심).
const trackPlan=(track:"photo"|"text")=>({slideCount:5,styleAnchor:"따뜻한 자연광, 흰 그릇, 짙은 나무 테이블",design:{palette:"warm",style:track==="photo"?"photo-focus":"text-focus",theme:"classic",titleFont:"pretendard",bodyFont:"pretendard",tone:"loud",season:"none"},slides:roles.map((role,i)=>({role,headline:["표지 제목","결이 보여요","이렇게 드세요","막걸리와 짝","오시기 전에"][i],subline:"",points:i?["짧은 글"]:[],visualPrompt:"따뜻한 홍어 한 상을 담은 음식 사진 장면",textPosition:"bottom",layout:i===0?"fullscreen":track==="photo"?"frame":"browser",keywords:["홍어"],figure:"",titleFont:"auto",bodyFont:"auto",variant:0}))});
const copy={topic:"t",audience:"A",hook:"AI 첫 문장",information:"정보",store_connection:"가게",call_to_action:"방문",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null};
const textarea=()=>screen.getByRole("textbox",{name:"올릴 글"}) as HTMLTextAreaElement;
// 자동 만들기에 쓰는 기본 처리기(AI 이미지는 장 번호로 이름을 붙인다).
function makingRoutes(track:"photo"|"text",extra:Record<string,Handler>={}):Record<string,Handler>{
  return {
    "/api/topics":()=>FAIL,
    "/api/images/plan":()=>({plan:trackPlan(track),provider:"gemini"}),
    "/api/images/generate":body=>({images:Array.from({length:Number(body.count)},(_,i)=>i?`cover-${i+1}`:Number(body.slideIndex)===1?"cover-1":`slide-${body.slideIndex}`),source:Number(body.slideIndex)===1?"ai-generated":"design"}),
    "/api/images/store-card":()=>({image:"store-card"}),
    "POST /api/drafts":()=>({saved:true}),
    "PATCH /api/drafts":()=>({saved:true}),
    "/api/copy":()=>copy,
    "/api/instagram/status":()=>({connected:false}),
    ...extra,
  };
}
async function goMake(track:"photo"|"text"){
  fireEvent.click(await screen.findByRole("button",{name:"다음"}));
  fireEvent.click(screen.getByRole("button",{name:new RegExp(track==="photo"?"사진 중심":"글 중심")}));
  fireEvent.click(screen.getByRole("button",{name:"만들기"}));
}

describe("DraftWizard",()=>{
  // 만들기 상태는 모듈 전체가 함께 쓰므로 테스트마다 비운다(앞 테스트의 장이 다음 테스트로 남지 않게).
  // 화면을 먼저 내린 뒤 저장소를 비운다(남은 화면이 비운 뒤에 탭 세션을 다시 쓰지 않게).
  afterEach(()=>{cleanup();resetGenerationStore();vi.unstubAllGlobals();vi.useRealTimers();localStorage.clear();sessionStorage.clear();window.history.replaceState({},"","/");resetGenerationStore();});

  it("makes a text-focus post automatically: plan by track, best of two covers, all slides, store card, save, text, then step 3",async()=>{
    const request=api(makingRoutes("text"));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    // 1단계 배지는 "추천 A·B·C"와 이번 철뿐(독자 유형·검색 증가율 없음).
    expect(screen.queryByText(/음식 탐색형|약속 결정형|호기심 입문형/)).not.toBeInTheDocument();
    await goMake("text");
    expect(await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000})).toBeInTheDocument();
    expect(calls(request,"/api/images/plan")[0]).toMatchObject({track:"text",slideCount:5});
    const generated=calls(request,"/api/images/generate");
    // 글 중심은 AI 그림이 표지 한 장뿐이라 후보 두 장을 만들어 서버 점검이 앞에 둔 것을 쓴다. 표지는 고르라고 묻지 않는다.
    expect(generated[0]).toMatchObject({slideIndex:1,count:2,slide:{role:"cover"}});
    expect(generated.map(body=>body.slideIndex)).toEqual([1,2,3,4,5]);
    expect(screen.queryByRole("button",{name:/표지 후보/})).not.toBeInTheDocument();
    const saved=calls(request,"/api/drafts","POST")[0];
    expect(saved.media_candidates.map((media:{file_id:string})=>media.file_id)).toEqual(["cover-1","slide-2","slide-3","slide-4","slide-5","store-card"]);
    expect(saved.selected_media_ids).toEqual(saved.media_candidates.map((media:{id:string})=>media.id));
    expect(saved.design_style).toBe("text-focus");
    // 글은 카드 순서를 따라 자동으로 쓰고 저장한다.
    expect(calls(request,"/api/copy")[0]).toMatchObject({hasAiImages:true,slideOutline:["표지 제목","결이 보여요","이렇게 드세요","막걸리와 짝","오시기 전에"]});
    expect(calls(request,"/api/drafts","PATCH")[0]).toMatchObject({id:saved.id,caption:expect.stringContaining("AI 첫 문장")});
    expect(textarea().value).toContain("AI 첫 문장");
    expect(screen.getByText("1 / 6")).toBeInTheDocument();
    const thumbs=within(screen.getByLabelText("모든 장")).getAllByRole("button");
    expect(thumbs.map(thumb=>thumb.style.backgroundImage)).toEqual(['url("cover-1")','url("slide-2")','url("slide-3")','url("slide-4")','url("slide-5")','url("store-card")']);
    expect(localStorage.getItem("mukdong-current-draft")).toBe(saved.id);
    // 큰 버튼 두 개. 인스타그램이 연결되지 않으면 바로 올리기는 막히고 한 줄로 안내한다.
    expect(await screen.findByText("설정에서 인스타그램을 연결하면 바로 올릴 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"인스타그램에 바로 올리기"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"휴대폰에 저장하기"})).toBeEnabled();
    // 주인공 버튼은 하나: 못 올리는 "바로 올리기"는 주인공 색을 내려놓고 "휴대폰에 저장하기"가 주인공이 된다.
    await waitFor(()=>expect(screen.getByRole("button",{name:"휴대폰에 저장하기"})).toHaveClass("primary"));
    expect(screen.getByRole("button",{name:"인스타그램에 바로 올리기"})).not.toHaveClass("primary");
    // 예전 화면의 골라야 하는 것들은 화면에 없다.
    for(const gone of [/디자인 계열/,/화풍/,/파노라마/,/첫 문장 후보/,/음악 방향/,/해시태그/])expect(screen.queryByText(gone)).not.toBeInTheDocument();
  });

  it("asks the AI for only one cover candidate on the photo-focus track",async()=>{
    const request=api(makingRoutes("photo"));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("photo");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(calls(request,"/api/images/plan")[0]).toMatchObject({track:"photo"});
    expect(calls(request,"/api/images/generate")[0]).toMatchObject({slideIndex:1,count:1});
  });

  it("tells plainly how long it takes and shows one sentence with a progress bar while making",async()=>{
    let release:()=>void=()=>{};
    const hold=new Promise<void>(resolve=>{release=resolve;});
    const request=api(makingRoutes("photo",{"/api/images/plan":async()=>{await hold;return {plan:trackPlan("photo"),provider:"gemini"};}}));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    fireEvent.click(await screen.findByRole("button",{name:"다음"}));
    expect(screen.getByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    expect(screen.getByText(/AI가 5장을 모두 그려요. 10분쯤 걸려요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/글 중심/}));
    expect(screen.getByText(/AI가 표지 한 장만 그려요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/사진 중심/}));
    fireEvent.click(screen.getByRole("button",{name:"만들기"}));
    expect(await screen.findByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    expect(screen.getByText(/어떤 순서로 보여 줄지 정하고 있어요/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await act(async()=>{release();});
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
  });

  it("keeps making after the screen goes away and shows step 3 when the owner comes back",async()=>{
    let release:()=>void=()=>{};
    const hold=new Promise<void>(resolve=>{release=resolve;});
    const request=api(makingRoutes("text",{"/api/copy":async()=>{await hold;return copy;}}));
    vi.stubGlobal("fetch",request);
    const first=render(<DraftWizard/>);
    await goMake("text");
    await waitFor(()=>expect(calls(request,"/api/copy")).toHaveLength(1),{timeout:5000});
    first.unmount();
    await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,0));});
    render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000})).toBeInTheDocument();
    expect(textarea().value).toContain("AI 첫 문장");
  });

  // ── 만드는 중인 게시물을 소리 없이 잃지 않기(간소화 C) ──
  // 구성안에서 붙잡아 두는 처리기: release()를 부르기 전까지 "만들고 있어요" 화면에 머문다.
  function heldMaking(track:"photo"|"text"="text",extra:Record<string,Handler>={}){
    let release:()=>void=()=>{};
    const hold=new Promise<void>(resolve=>{release=resolve;});
    const request=api(makingRoutes(track,{"/api/images/plan":async()=>{await hold;return {plan:trackPlan(track),provider:"gemini"};},...extra}));
    vi.stubGlobal("fetch",request);
    return {request,release:()=>release()};
  }
  const STOP="지금 만드는 게시물이 있어요. 그만두고 새로 시작할까요?";

  it("comes back to the progress screen from the 만들기 menu while making, even after leaving from step 1",async()=>{
    const {request,release}=heldMaking();
    const first=render(<DraftWizard/>);
    await goMake("text");
    expect(await screen.findByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    const topic=calls(request,"/api/images/plan")[0]?.topic??"";
    // 만드는 중에 1단계로 돌아갔다가 다른 메뉴로 나간 경우(예전에는 새 추천 주제가 골라져 만들던 것이 소리 없이 멈췄다).
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    // 만드는 중에는 3단계로 건너뛸 수 없다.
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeDisabled();
    first.unmount();
    render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    await act(async()=>{release();});
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(calls(request,"/api/drafts","POST")[0]).toMatchObject({topic});
  });

  it("asks before opening another post from 내 게시물 while making, and keeps making on cancel",async()=>{
    const other="33333333-3333-4333-8333-333333333333";
    const {request,release}=heldMaking("text",{"/api/drafts?*":()=>({id:other,topic:"다른 게시물",audience:"A",caption:"다른 글",created_at:"2026-09-24T00:00:00.000Z",media_candidates:[{id:"44444444-4444-4444-8444-444444444444",source:"photo",file_id:"data:image/png;base64,aA==",purpose:"instagram-primary"}],selected_media_id:"44444444-4444-4444-8444-444444444444"})});
    const first=render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"만들고 있어요"});
    first.unmount();
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    window.history.replaceState({},"",`/?draft=${other}`);
    render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith(STOP);
    expect(window.location.search).toBe("");
    expect(request.mock.calls.some(([url])=>String(url).startsWith("/api/drafts?"))).toBe(false);
    await act(async()=>{release();});
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(calls(request,"/api/drafts","POST")).toHaveLength(1);
  });

  it("stops the running post and opens the chosen one when the owner agrees",async()=>{
    const other="33333333-3333-4333-8333-333333333333";
    const {request,release}=heldMaking("text",{"/api/drafts?*":()=>({id:other,topic:"다른 게시물",audience:"A",caption:"다른 글",created_at:"2026-09-24T00:00:00.000Z",media_candidates:[{id:"44444444-4444-4444-8444-444444444444",source:"photo",file_id:"data:image/png;base64,aA==",purpose:"instagram-primary"}],selected_media_id:"44444444-4444-4444-8444-444444444444"})});
    const first=render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"만들고 있어요"});
    first.unmount();
    vi.stubGlobal("confirm",vi.fn(()=>true));
    window.history.replaceState({},"",`/?draft=${other}`);
    render(<DraftWizard/>);
    await waitFor(()=>expect(textarea().value).toBe("다른 글"));
    await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,0));});
    // 멈춘 게시물은 늦게 끝나도 저장하지 않는다.
    expect(calls(request,"/api/drafts","POST")).toHaveLength(0);
    expect(textarea().value).toBe("다른 글");
  });

  it("asks before 새로 만들기 while making and keeps making on cancel",async()=>{
    const {request,release}=heldMaking();
    render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"만들고 있어요"});
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    fireEvent.click(screen.getByRole("button",{name:"새로 만들기"}));
    expect(confirm).toHaveBeenCalledWith(STOP);
    expect(screen.getByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    await act(async()=>{release();});
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(calls(request,"/api/drafts","POST")).toHaveLength(1);
  });

  it("asks when a different topic is typed while making: cancel returns to the running post, OK starts a new one",async()=>{
    const {request,release}=heldMaking();
    render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"만들고 있어요"});
    const running=calls(request,"/api/images/plan")[0].topic as string;
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    fireEvent.change(screen.getByLabelText("직접 쓰기"),{target:{value:"막걸리와 즐기는 저녁 한 상"}});
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    fireEvent.click(screen.getByRole("button",{name:"다음"}));
    expect(confirm).toHaveBeenCalledWith(STOP);
    expect(screen.getByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    expect(screen.getByLabelText("직접 쓰기")).toHaveValue(running);
    fireEvent.change(screen.getByLabelText("직접 쓰기"),{target:{value:"막걸리와 즐기는 저녁 한 상"}});
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button",{name:"다음"}));
    expect(screen.getByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    expect(screen.getByText("주제: 막걸리와 즐기는 저녁 한 상")).toBeInTheDocument();
    await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,0));});
    expect(calls(request,"/api/drafts","POST")).toHaveLength(0);
  });

  // 직접 쓴 주제(메모 없음)로 만들던 중 아예 다른 주제를 적고 "확인"하면, 예전에는 바뀐 것이 없다고 보고 만들기를 멈추지 않아
  // 옛 주제의 그림이 새 주제 게시물에 붙었다.
  it("really stops a running post started from a typed topic when the owner agrees to a different topic",async()=>{
    const {request,release}=heldMaking();
    render(<DraftWizard/>);
    fireEvent.change(await screen.findByLabelText("직접 쓰기"),{target:{value:"비 오는 날 홍어전"}});
    await goMake("text");
    await screen.findByRole("heading",{name:"만들고 있어요"});
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    fireEvent.change(screen.getByLabelText("직접 쓰기"),{target:{value:"막걸리와 즐기는 저녁 한 상"}});
    vi.stubGlobal("confirm",vi.fn(()=>true));
    fireEvent.click(screen.getByRole("button",{name:"다음"}));
    expect(screen.getByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,0));});
    expect(calls(request,"/api/drafts","POST")).toHaveLength(0);
    expect(screen.getByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
  });

  // 단계 표시줄의 "2 만들기"나 "만들기" 메뉴로 가도 "다음"과 똑같이 묻는다(옆길로 가면 묻지 않고 주제만 바뀌었다).
  it("asks the same way when the step bar or the 만들기 menu is used instead of 다음",async()=>{
    const {request,release}=heldMaking();
    render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"만들고 있어요"});
    const running=calls(request,"/api/images/plan")[0].topic as string;
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    fireEvent.change(screen.getByLabelText("직접 쓰기"),{target:{value:"막걸리와 즐기는 저녁 한 상"}});
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    fireEvent.click(screen.getByRole("button",{name:"2 만들기"}));
    expect(confirm).toHaveBeenCalledWith(STOP);
    expect(screen.getByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    expect(screen.getByLabelText("직접 쓰기")).toHaveValue(running);
    // 같은 화면 안에서 "만들기" 메뉴를 눌러도 진행 화면으로 돌아간다.
    fireEvent.click(within(screen.getByRole("navigation",{name:"주요 메뉴"})).getByRole("link",{name:"만들기"}));
    expect(screen.getByRole("heading",{name:"만들고 있어요"})).toBeInTheDocument();
    await act(async()=>{release();});
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(calls(request,"/api/drafts","POST")[0]).toMatchObject({topic:running});
  });

  it("asks before making a finished post again from the start",async()=>{
    const request=api(makingRoutes("text"));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    fireEvent.click(screen.getByRole("button",{name:"2 만들기"}));
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    fireEvent.click(screen.getByRole("button",{name:"만들기"}));
    expect(confirm).toHaveBeenCalledWith("이미 만든 게시물이 있어요. 처음부터 다시 만들까요? 그림을 새로 만들어요.");
    expect(calls(request,"/api/images/plan")).toHaveLength(1);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button",{name:"만들기"}));
    await waitFor(()=>expect(calls(request,"/api/images/plan")).toHaveLength(2));
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
  });

  it("stops with a plain sentence when a slide fails and continues from that slide on '다시 해 보기'",async()=>{
    let failSlide3=true;
    const base=makingRoutes("photo");
    const request=api({...base,"/api/images/generate":body=>Number(body.slideIndex)===3&&failSlide3?FAIL:base["/api/images/generate"](body)});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("photo");
    expect(await screen.findByText(/사진을 다 만들지 못했어요. '다시 해 보기'를 눌러 주세요/,undefined,{timeout:5000})).toBeInTheDocument();
    expect(calls(request,"/api/drafts","POST")).toHaveLength(0);
    // 사진 없이 AI 그림이 멈췄을 때는 사장님이 할 수 있는 다른 길(가게 사진 올리기)도 한 줄로 알려 준다.
    expect(screen.getByText(/가게 사진을 올린 뒤 눌러 보세요/)).toBeInTheDocument();
    failSlide3=false;
    const before=calls(request,"/api/images/generate").length;
    fireEvent.click(screen.getByRole("button",{name:"다시 해 보기"}));
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    // 구성안·표지는 다시 만들지 않고, 멈춘 장부터 남은 장만 만든다.
    expect(calls(request,"/api/images/plan")).toHaveLength(1);
    expect(calls(request,"/api/images/generate").slice(before).map(body=>body.slideIndex).sort()).toEqual(expect.arrayContaining([3]));
    expect(calls(request,"/api/images/generate").slice(before).some(body=>body.slideIndex===1)).toBe(false);
  });

  it("retries only the save when saving failed after every slide was made",async()=>{
    let saves=0;
    const request=api(makingRoutes("text",{"POST /api/drafts":()=>++saves===1?FAIL:{saved:true}}));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    expect(await screen.findByText(/만든 사진을 저장하지 못했어요/,undefined,{timeout:5000})).toBeInTheDocument();
    // 저장이 멈춘 것이라 사진을 올리라는 안내는 맞지 않는다.
    expect(screen.queryByText(/가게 사진을 올린 뒤 눌러 보세요/)).not.toBeInTheDocument();
    const made=calls(request,"/api/images/generate").length;
    fireEvent.click(screen.getByRole("button",{name:"다시 해 보기"}));
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(calls(request,"/api/images/generate")).toHaveLength(made);
    expect(saves).toBe(2);
  });

  it("reaches step 3 even when the text could not be written, and '글 다시 쓰기' writes it",async()=>{
    let writes=0;
    const request=api(makingRoutes("text",{"/api/copy":()=>++writes===1?FAIL:copy}));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    expect(screen.getByRole("alert")).toHaveTextContent("글 다시 쓰기");
    fireEvent.click(screen.getByRole("button",{name:"글 다시 쓰기"}));
    await waitFor(()=>expect(textarea().value).toContain("AI 첫 문장"));
    expect(calls(request,"/api/drafts","PATCH").at(-1)).toMatchObject({caption:expect.stringContaining("AI 첫 문장")});
  });

  it("uses the owner's photos: text track puts a photo on the cover only, and no image AI is asked",async()=>{
    let uploads=0;
    const request=api(makingRoutes("text",{
      "/api/images/assets":()=>({asset:{id:`photo-${++uploads}`,preview:`data:image/jpeg;base64,P${uploads}`,name:`p${uploads}`}}),
      "/api/images/analyze":()=>FAIL,
      "/api/images/generate":body=>({images:[`card-${body.slideIndex}`],source:Array.isArray(body.photos)?"photo":"design"}),
    }));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    fireEvent.click(await screen.findByRole("button",{name:"다음"}));
    fireEvent.click(screen.getByRole("button",{name:/글 중심/}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"}),new File(["b"],"b.png",{type:"image/png"})]}});
    await waitFor(()=>expect(within(screen.getByRole("list",{name:"고른 사진"})).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByText(/올린 첫 사진이 표지가 되고/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"만들기"}));
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    const generated=calls(request,"/api/images/generate");
    expect(generated.map(body=>(body.photos as string[]|undefined)?.length??0)).toEqual([1,0,0,0,0]);
    expect(generated.every(body=>body.count===1)).toBe(true);
    expect(calls(request,"/api/images/plan")[0]).toMatchObject({track:"text",imageStyle:"photo"});
  });

  it("autosaves an edited text and asks before rewriting it",async()=>{
    const request=api(makingRoutes("text"));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    fireEvent.change(textarea(),{target:{value:"사장님이 고친 글"}});
    await waitFor(()=>expect(calls(request,"/api/drafts","PATCH").at(-1)).toMatchObject({caption:"사장님이 고친 글"}),{timeout:4000});
    fireEvent.change(textarea(),{target:{value:"또 고친 글"}});
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    fireEvent.click(screen.getByRole("button",{name:"글 다시 쓰기"}));
    expect(confirm).toHaveBeenCalled();
    expect(textarea().value).toBe("또 고친 글");
  });

  it("remakes the shown AI slide with '이 장 다시 만들기' and saves the new set by itself",async()=>{
    let round=0;
    const base=makingRoutes("text");
    const request=api({...base,"/api/images/generate":body=>Number(body.slideIndex)===1&&body.count===1?{images:[`cover-again-${++round}`],source:"ai-generated"}:base["/api/images/generate"](body)});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    // 글만 있는 장(글 중심 본문)은 다시 만들 것이 없다.
    fireEvent.click(screen.getByRole("button",{name:"2번째 장 보기"}));
    expect(screen.queryByRole("button",{name:"이 장 다시 만들기"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"1번째 장 보기"}));
    fireEvent.click(screen.getByRole("button",{name:"이 장 다시 만들기"}));
    await waitFor(()=>expect(calls(request,"/api/drafts","POST")).toHaveLength(2),{timeout:5000});
    expect(calls(request,"/api/drafts","POST")[1].media_candidates[0].file_id).toBe("cover-again-1");
    await waitFor(()=>expect(screen.getByRole("button",{name:"1번째 장 보기"})).toHaveStyle({backgroundImage:'url("cover-again-1")'}));
  });

  it("opens an old saved draft with its images and text without redrawing (old designs keep working)",async()=>{
    const id="11111111-1111-4111-8111-111111111111";
    window.history.replaceState({},"",`/?draft=${id}`);
    const request=api({"/api/drafts?*":()=>({id,status:"ready",topic:"다시 보는 홍어",audience:"A",caption:"저장된 글",design_style:"newspaper",selected_media_id:"22222222-2222-4222-8222-222222222222",selected_media_ids:["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"photo",file_id:"saved-1",purpose:"instagram-cover"},{id:"33333333-3333-4333-8333-333333333333",source:"ai-generated",file_id:"saved-2",purpose:"instagram-detail"}]}),"/api/instagram/status":()=>({connected:false})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"확인하고 올리기"})).toBeInTheDocument();
    expect(textarea().value).toBe("저장된 글");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"2번째 장 보기"})).toHaveStyle({backgroundImage:'url("saved-2")'});
    // 구성안이 없는 예전 게시물은 다시 만들 것이 없어 버튼을 숨긴다(잘못 눌러 비용이 들지 않게).
    expect(screen.queryByRole("button",{name:"이 장 다시 만들기"})).not.toBeInTheDocument();
    expect(request.mock.calls.some(([url])=>url==="/api/images/generate"||url==="/api/copy")).toBe(false);
    expect(screen.getByRole("button",{name:"2 만들기"})).toBeEnabled();
  });

  it.each([["ai-edited",true],["design",false]] as const)("writes the text for an old draft saved with only %s images",async(source,hasAiImages)=>{
    const id="33333333-3333-4333-8333-333333333333",mediaId="22222222-2222-4222-8222-222222222222";
    window.history.replaceState({},"",`/?draft=${id}`);
    const request=api({"/api/drafts?*":()=>({id,topic:"홍어전",audience:"A",image_brief:"노릇한 전 한 접시",content_brief:"익혔을 때 달라지는 식감을 설명하고 홍어전으로 연결한다.",media_candidates:[{id:mediaId,source,file_id:"saved-photo",purpose:"instagram-primary"}],selected_media_id:mediaId}),"/api/copy":()=>copy,"PATCH /api/drafts":()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await waitFor(()=>expect(calls(request,"/api/copy")).toHaveLength(1));
    expect(calls(request,"/api/copy")[0]).toMatchObject({topic:"홍어전",imageBrief:"노릇한 전 한 접시",contentBrief:"익혔을 때 달라지는 식감을 설명하고 홍어전으로 연결한다.",hasAiImages});
    await waitFor(()=>expect(textarea().value).toContain("AI 첫 문장"));
  });

  it("keeps the text of a very old draft saved only as split copy (no caption) instead of writing a new one",async()=>{
    const id="44444444-4444-4444-8444-444444444444",mediaId="22222222-2222-4222-8222-222222222222";
    window.history.replaceState({},"",`/?draft=${id}`);
    const request=api({"/api/drafts?*":()=>({id,topic:"예전 홍어",audience:"B",copy:{...copy,hook:"예전에 쓴 첫 문장"},media_candidates:[{id:mediaId,source:"photo",file_id:"saved-photo",purpose:"instagram-primary"}],selected_media_id:mediaId}),"PATCH /api/drafts":()=>({}),"/api/copy":()=>copy,"/api/instagram/status":()=>({connected:false})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await screen.findByRole("heading",{name:"확인하고 올리기"});
    expect(textarea().value).toContain("예전에 쓴 첫 문장");
    // 그 글을 글 칸 글(caption)로 저장해 두고, 새로 써서 덮어쓰지 않는다.
    await waitFor(()=>expect(calls(request,"/api/drafts","PATCH").at(-1)).toMatchObject({id,caption:expect.stringContaining("예전에 쓴 첫 문장")}),{timeout:4000});
    expect(calls(request,"/api/copy")).toHaveLength(0);
  });

  it("reopens a saved draft without an image at step 2",async()=>{
    const id="33333333-3333-4333-8333-333333333333";
    window.history.replaceState({},"",`/?draft=${id}`);
    vi.stubGlobal("fetch",api({"/api/drafts?*":()=>({id,topic:"사진 없는 게시물",audience:"A",caption:null,created_at:"2026-09-24T00:00:00.000Z",media_candidates:[],selected_media_id:null})}));
    render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeDisabled();
    expect(screen.queryByText(/찾지 못했어요/)).not.toBeInTheDocument();
    expect(localStorage.getItem("mukdong-current-draft")).toBe(id);
  });

  it("explains in plain words when a chosen saved draft is missing",async()=>{
    window.history.replaceState({},"","/?draft=11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({})})));
    render(<DraftWizard/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("게시물을 찾지 못했어요");
    expect(screen.getByRole("link",{name:"내 게시물로 돌아가기"})).toHaveAttribute("href","/drafts");
  });

  it("prefers an explicit saved draft over a library topic",async()=>{
    const id="11111111-1111-4111-8111-111111111111";
    window.history.replaceState({},"",`/?draft=${id}&topic=다른%20주제`);
    vi.stubGlobal("fetch",api({"/api/drafts?*":()=>({id,topic:"기존 게시물",audience:"A",caption:"기존 글",created_at:"2026-09-24T00:00:00.000Z",media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"photo",file_id:"data:image/png;base64,aA==",purpose:"instagram-primary"}],selected_media_id:"22222222-2222-4222-8222-222222222222"})}));
    render(<DraftWizard/>);
    await waitFor(()=>expect(textarea().value).toBe("기존 글"));
    expect(screen.queryByDisplayValue("다른 주제")).not.toBeInTheDocument();
  });

  it("returns to the same unsaved draft and step after the wizard is remounted",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({})})));
    const first=render(<DraftWizard/>);
    fireEvent.change(screen.getByLabelText("직접 쓰기"),{target:{value:"이어지는 주제"}});
    fireEvent.click(screen.getByRole("button",{name:"다음"}));
    fireEvent.click(screen.getByRole("button",{name:/글 중심/}));
    expect(screen.getByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    await waitFor(()=>expect(JSON.parse(sessionStorage.getItem("mukdong-wizard-session")??"null")).toMatchObject({topic:"이어지는 주제",step:"image",track:"text"}));
    const {draftId}=JSON.parse(sessionStorage.getItem("mukdong-wizard-session")!);
    first.unmount();
    render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    // 고른 갈래도 그대로다.
    expect(screen.getByRole("button",{name:/글 중심/})).toHaveAttribute("aria-pressed","true");
    fireEvent.click(screen.getByRole("button",{name:"이전"}));
    expect(screen.getByLabelText("직접 쓰기")).toHaveValue("이어지는 주제");
    await waitFor(()=>expect(JSON.parse(sessionStorage.getItem("mukdong-wizard-session")!)).toMatchObject({draftId,step:"topic"}));
  });

  it("prefills a library topic without loading or mutating the previous draft",async()=>{
    localStorage.setItem("mukdong-current-draft","11111111-1111-4111-8111-111111111111");
    window.history.replaceState({},"","/?topic="+encodeURIComponent("동네에서 홍어 한 상")+"&audience=B&imageBrief="+encodeURIComponent("퇴근 후 실제 상차림"));
    const request=api({"/api/images/plan":()=>({plan:trackPlan("text"),provider:"gemini"})});
    vi.stubGlobal("fetch",request);
    render(<DraftWizard/>);
    expect(await screen.findByDisplayValue("동네에서 홍어 한 상")).toBeInTheDocument();
    expect(request.mock.calls.some(([url])=>String(url).startsWith("/api/drafts"))).toBe(false);
    expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    await goMake("text");
    await waitFor(()=>expect(calls(request,"/api/images/plan")).toHaveLength(1));
    expect(calls(request,"/api/images/plan")[0]).toMatchObject({topic:"동네에서 홍어 한 상",imageBrief:"퇴근 후 실제 상차림"});
  });

  it("keeps an explicit library topic under StrictMode effect replay",async()=>{
    window.history.replaceState({},"","/?topic="+encodeURIComponent("삼합 한 점을 만드는 순서"));
    const request=vi.fn(async()=>({ok:true,json:async()=>({topics:[{id:"one",title:"AI replacement topic",audience:"A",reason:"other",imageBrief:""},{id:"two",title:"Other 2",audience:"B",reason:"other",imageBrief:""},{id:"three",title:"Other 3",audience:"C",reason:"other",imageBrief:""}]})}));
    vi.stubGlobal("fetch",request);
    render(<StrictMode><DraftWizard/></StrictMode>);
    await waitFor(()=>expect(screen.getByLabelText("직접 쓰기")).toHaveValue("삼합 한 점을 만드는 순서"));
    expect(request).not.toHaveBeenCalledWith("/api/topics",expect.anything());
  });

  it("ignores a topic query longer than 120 characters",async()=>{
    window.history.replaceState({},"","/?topic="+"가".repeat(121));
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({})})));
    render(<DraftWizard/>);
    expect(await screen.findByDisplayValue("같은 회인데 왜 식감은 다를까?")).toBeInTheDocument();
  });

  it("carries the month plan date into the new post",async()=>{
    window.history.replaceState({},"","/?"+new URLSearchParams({topic:"막걸리엔 왜 전일까?",audience:"A",imageBrief:"전 한 접시",brief:"막걸리와 전의 궁합에서 홍어로 잇는다.",planDate:"2099-01-06",style:"newspaper"}));
    const request=api(makingRoutes("text"));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    expect(await screen.findByText(/한 달 계획 · 1\/6\(화\) 18:00에 올릴 글/)).toBeInTheDocument();
    expect(screen.queryByText(/추천 계열/)).not.toBeInTheDocument();
    await goMake("text");
    await waitFor(()=>expect(calls(request,"/api/drafts","POST")).toHaveLength(1),{timeout:5000});
    expect(calls(request,"/api/drafts","POST")[0]).toMatchObject({topic:"막걸리엔 왜 전일까?",plan_date:"2099-01-06",content_brief:"막걸리와 전의 궁합에서 홍어로 잇는다."});
  });

  it("starts each visit from the next recommendation direction and sends recently shown topics",async()=>{
    const bodies:Array<Record<string,unknown>>=[];
    const topics=["굴은 왜 겨울에 맛있을까?","국밥엔 왜 깍두기가 어울릴까?","홍어는 왜 겨울에 더 찾을까?"].map((title,i)=>({id:String(i),title,summary:"익숙한 장면에서 출발해 홍어로 이어지는 설명입니다. 충분히 긴 요약.",reason:"이유",audience:"A",imageBrief:"사진",season:""}));
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{if(url==="/api/topics"){bodies.push(JSON.parse(String(init?.body)));return {ok:true,json:async()=>({topics,source:"ai"})};}return {ok:false,json:async()=>({})};}));
    const first=render(<DraftWizard/>);
    await waitFor(()=>expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({recommendationRound:0,recentTitles:[]});
    await screen.findByText("굴은 왜 겨울에 맛있을까?");
    first.unmount();sessionStorage.clear();localStorage.removeItem("mukdong-current-draft");
    render(<DraftWizard/>);
    await waitFor(()=>expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({recommendationRound:1});
    expect(bodies[1].recentTitles).toEqual(expect.arrayContaining(topics.map(topic=>topic.title)));
  });

  it("starts a new post when the topic changes after making one",async()=>{
    const request=api(makingRoutes("text"));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    const firstSave=calls(request,"/api/drafts","POST")[0];
    expect(firstSave.content_brief).toContain("홍어");
    expect(localStorage.getItem("mukdong-current-draft")).toBe(firstSave.id);
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    fireEvent.change(screen.getByLabelText("직접 쓰기"),{target:{value:"막걸리와 즐기는 저녁 한 상"}});
    expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeDisabled();
    await goMake("text");
    await screen.findByRole("heading",{name:"확인하고 올리기"},{timeout:5000});
    const secondSave=calls(request,"/api/drafts","POST").at(-1);
    expect(secondSave).toMatchObject({topic:"막걸리와 즐기는 저녁 한 상",content_brief:""});
    expect(secondSave.id).not.toBe(firstSave.id);
    expect(calls(request,"/api/copy").at(-1)).toMatchObject({topic:"막걸리와 즐기는 저녁 한 상"});
    expect(calls(request,"/api/copy").at(-1)).not.toHaveProperty("contentBrief");
  });

  it("stops the old post when the owner picks another topic while it is still saving",async()=>{
    let finishSave:()=>void=()=>{};
    const saving=new Promise<void>(resolve=>{finishSave=resolve;});
    const request=api(makingRoutes("text",{"POST /api/drafts":async()=>{await saving;return {saved:true};}}));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await goMake("text");
    await waitFor(()=>expect(calls(request,"/api/drafts","POST")).toHaveLength(1),{timeout:5000});
    expect(screen.getByText("만든 사진을 저장하고 있어요")).toBeInTheDocument();
    const confirm=vi.fn(()=>true);vi.stubGlobal("confirm",confirm);
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    fireEvent.click(screen.getAllByRole("button").filter(button=>button.classList.contains("topic-card"))[1]);
    expect(confirm).toHaveBeenCalled();
    await act(async()=>{finishSave();await new Promise(resolve=>setTimeout(resolve,0));});
    // 늦게 끝난 저장이 새 주제의 "지금 게시물"이 되지 않고, 글도 쓰지 않으며, 화면도 옮기지 않는다.
    expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    expect(calls(request,"/api/copy")).toHaveLength(0);
    expect(screen.getByRole("heading",{name:"무엇을 올릴까요?"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeDisabled();
  });

  it("opens a fresh tab on new recommendations and offers to resume the last post",async()=>{
    const id="44444444-4444-4444-8444-444444444444";
    localStorage.setItem("mukdong-current-draft",id);localStorage.setItem("mukdong-current-draft-topic","지난번 주제");
    const topics=[{id:"one",title:"오늘의 추천",summary:"",reason:"이유",audience:"A",imageBrief:""},{id:"two",title:"둘째",summary:"",reason:"이유",audience:"B",imageBrief:""},{id:"three",title:"셋째",summary:"",reason:"이유",audience:"C",imageBrief:""}];
    const request=vi.fn(async(url:string)=>url==="/api/topics"?{ok:true,json:async()=>({topics})}:{ok:false,json:async()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    expect(await screen.findByDisplayValue("오늘의 추천")).toBeInTheDocument();
    expect(screen.getByText(/만들던 게시물이 있어요 · 지난번 주제/)).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"이어서 만들기"})).toHaveAttribute("href",`/?draft=${id}`);
    expect(request.mock.calls.some(([url])=>url.startsWith("/api/drafts?"))).toBe(false);
  });

  it("keeps the post, plan date and briefs when the topic title is only polished",async()=>{
    window.history.replaceState({},"","/?topic="+encodeURIComponent("과메기는 왜 찬바람이 불면 찾을까?")+"&audience=A&imageBrief="+encodeURIComponent("김과 쪽파를 곁들인 과메기 한 접시")+"&brief="+encodeURIComponent("찬바람과 제철")+"&planDate=2030-11-03");
    const request=api({"/api/images/plan":()=>FAIL});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    const input=await screen.findByDisplayValue("과메기는 왜 찬바람이 불면 찾을까?");
    expect(screen.getByText(/한 달 계획 · 11\/3/)).toBeInTheDocument();
    fireEvent.change(input,{target:{value:"과메기는 왜 찬바람 불 때 찾을까?"}});
    expect(screen.getByText(/한 달 계획 · 11\/3/)).toBeInTheDocument();
    await goMake("photo");
    await waitFor(()=>expect(calls(request,"/api/images/plan")).toHaveLength(1));
    expect(calls(request,"/api/images/plan")[0]).toMatchObject({topic:"과메기는 왜 찬바람 불 때 찾을까?",imageBrief:"김과 쪽파를 곁들인 과메기 한 접시",contentBrief:"찬바람과 제철"});
  });

  it("removes a recommendation image brief after the topic is edited directly",async()=>{
    const topics=[{id:"one",title:"추천 주제",summary:"",reason:"이유",audience:"A",imageBrief:"광택 나는 한 상"},{id:"two",title:"다른 추천",summary:"",reason:"이유",audience:"B",imageBrief:"다른 이미지"},{id:"three",title:"세 번째 추천",summary:"",reason:"이유",audience:"C",imageBrief:"세 번째 이미지"}];
    const request=api({"/api/topics":()=>({topics}),"/api/images/plan":()=>FAIL});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);await screen.findByText("추천 주제");
    fireEvent.click(screen.getByText("추천 주제").closest("button")!);
    fireEvent.change(screen.getByDisplayValue("추천 주제"),{target:{value:"직접 수정한 주제"}});
    await goMake("text");
    await waitFor(()=>expect(calls(request,"/api/images/plan")).toHaveLength(1));
    expect(calls(request,"/api/images/plan")[0]).toMatchObject({topic:"직접 수정한 주제",slideCount:5});
    expect(calls(request,"/api/images/plan")[0]).not.toHaveProperty("imageBrief");
  });

  it("keeps the topic when recommendations arrive after moving on to step 2",async()=>{
    let answer:(value:unknown)=>void=()=>undefined;
    const late=new Promise(resolve=>{answer=resolve;});
    const topics=[{id:"t1",title:"늦게 온 추천 주제일까?",summary:"홍어로 이어지는 설명 방향입니다. 충분히 긴 요약입니다.",reason:"이유",audience:"B",imageBrief:"사진",season:""},{id:"t2",title:"두 번째 주제일까?",summary:"홍어로 이어지는 설명 방향입니다. 충분히 긴 요약입니다.",reason:"이유",audience:"A",imageBrief:"사진",season:""},{id:"t3",title:"홍어는 왜 그럴까?",summary:"홍어로 이어지는 설명 방향입니다. 충분히 긴 요약입니다.",reason:"이유",audience:"C",imageBrief:"사진",season:""}];
    vi.stubGlobal("fetch",vi.fn((url:string)=>url==="/api/topics"?late:Promise.resolve({ok:true,json:async()=>({})})));
    render(<DraftWizard/>);
    const initial=((await screen.findByLabelText("직접 쓰기",undefined,{timeout:5000})) as HTMLInputElement).value;
    fireEvent.click(screen.getByRole("button",{name:"다음"}));
    answer({ok:true,json:async()=>({topics,source:"ai"})});
    await act(async()=>{await late;await new Promise(resolve=>setTimeout(resolve,0));});
    expect(screen.getByRole("heading",{name:"어떻게 만들까요?"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"1 무엇을 올릴까요"}));
    expect(await screen.findByText("늦게 온 추천 주제일까?",undefined,{timeout:5000})).toBeInTheDocument();
    expect((screen.getByLabelText("직접 쓰기") as HTMLInputElement).value).toBe(initial);
  });

  it("refreshes all recommendation cards without overwriting a manual topic",async()=>{
    let resolveRefresh:(value:unknown)=>void=()=>{};
    const first=[{id:"one",title:"첫 추천",summary:"",reason:"첫 이유",audience:"A",imageBrief:"첫 이미지"},{id:"two",title:"둘째 추천",summary:"",reason:"둘째 이유",audience:"B",imageBrief:"둘째 이미지"},{id:"three",title:"셋째 추천",summary:"",reason:"셋째 이유",audience:"C",imageBrief:"셋째 이미지"}];
    const refreshed=[{id:"four",title:"새 첫 추천",summary:"",reason:"새 첫 이유",audience:"A",imageBrief:"새 이미지"},{id:"five",title:"새 둘째 추천",summary:"",reason:"새 둘째 이유",audience:"B",imageBrief:"새 이미지"},{id:"six",title:"새 셋째 추천",summary:"",reason:"새 셋째 이유",audience:"C",imageBrief:"새 이미지"}];
    const request=vi.fn((url:string,init?:RequestInit)=>{
      if(url!=="/api/topics") return Promise.resolve({ok:false,json:async()=>({})});
      const body=JSON.parse(String(init?.body));
      return body.recommendationRound===1?new Promise(resolve=>{resolveRefresh=resolve;}):Promise.resolve({ok:true,json:async()=>({topics:first})});
    });
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);await screen.findByText("첫 추천");
    fireEvent.click(screen.getByRole("button",{name:"다른 주제 보기"}));
    const refreshBody=JSON.parse(String((request.mock.calls.at(-1)?.[1] as RequestInit).body));
    expect(refreshBody.excludeTitles).toEqual(["첫 추천","둘째 추천","셋째 추천"]);
    fireEvent.change(screen.getByDisplayValue("첫 추천"),{target:{value:"직접 정한 주제"}});
    resolveRefresh({ok:true,json:async()=>({topics:refreshed})});
    await screen.findByText("새 셋째 추천");
    expect(screen.getByDisplayValue("직접 정한 주제")).toBeInTheDocument();
  });

  it("starts a new post when a refresh picks a new recommendation for a restored one",async()=>{
    const draftId="11111111-1111-4111-8111-111111111111";
    const refreshed=[{id:"four",title:"새 첫 추천",summary:"",reason:"새 첫 이유",audience:"A",imageBrief:"새 이미지"},{id:"five",title:"새 둘째 추천",summary:"",reason:"새 둘째 이유",audience:"B",imageBrief:"새 이미지"},{id:"six",title:"새 셋째 추천",summary:"",reason:"새 셋째 이유",audience:"C",imageBrief:"새 이미지"}];
    localStorage.setItem("mukdong-current-draft",draftId);sessionStorage.setItem("mukdong-wizard-session",JSON.stringify({draftId,topic:"저장된 주제",audience:"A",imageBrief:"",contentBrief:"",step:"topic"}));
    vi.stubGlobal("fetch",api({"/api/drafts?*":()=>({id:draftId,topic:"저장된 주제",audience:"B",caption:"저장된 글",selected_media_id:"22222222-2222-4222-8222-222222222222",selected_media_ids:["22222222-2222-4222-8222-222222222222"],media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"ai-generated",file_id:"one",purpose:"instagram-cover"}]}),"/api/topics":()=>({topics:refreshed})}));
    render(<DraftWizard/>);await screen.findByDisplayValue("저장된 주제");
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:"다른 주제 보기"}));
    await screen.findByDisplayValue("새 첫 추천");expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    expect(screen.getByRole("button",{name:"3 확인하고 올리기"})).toBeDisabled();
  });

  it("labels recommendation cards A, B, C in screen order with only the season badge",async()=>{
    const topics=[{id:"one",title:"첫 주제",summary:"",reason:"이유",audience:"B",imageBrief:"",season:"가을",trend:"방어"},{id:"two",title:"둘째 주제",summary:"",reason:"이유",audience:"B",imageBrief:""},{id:"three",title:"셋째 주제",summary:"",reason:"이유",audience:"A",imageBrief:""}];
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url==="/api/topics"?{ok:true,json:async()=>({topics,trends:[{keyword:"방어",growth:1.4}],trendStatus:"ok"})}:{ok:false,json:async()=>({})}));
    render(<DraftWizard/>);
    await screen.findByText("셋째 주제");
    const cards=screen.getAllByRole("button").filter(button=>button.classList.contains("topic-card"));
    expect(cards.map(card=>card.querySelector(".soft-badge")?.textContent)).toEqual(["추천 A","추천 B","추천 C"]);
    expect(cards[0]).toHaveTextContent("이번 철 · 가을");
    // 독자 유형·검색 증가율은 화면에 내지 않는다(추천 기준에는 그대로 쓰인다).
    expect(document.body.textContent).not.toMatch(/약속 결정형|음식 탐색형|\+40%|검색 흐름/);
  });
});
