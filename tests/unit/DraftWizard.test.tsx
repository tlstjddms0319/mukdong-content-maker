import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftWizard } from "@/components/wizard/DraftWizard";
const plan={slideCount:3,styleAnchor:"따뜻한 흰 그릇과 나무 테이블의 일관된 음식 사진",design:{palette:"warm"},slides:[{role:"cover",headline:"표지",points:[],visualPrompt:"선명한 완성 음식 한 상을 정면에서 담은 사진",textPosition:"top",layout:"fullscreen",keywords:["홍어"],figure:""},{role:"how-to",headline:"먹는 법",points:[],visualPrompt:"젓가락으로 한 점을 만드는 손동작 음식 사진",textPosition:"bottom",layout:"frame",keywords:["먹는 법"],figure:""},{role:"visit",headline:"방문",points:[],visualPrompt:"편안한 완성 상차림을 담은 음식 사진 장면",textPosition:"bottom",layout:"frame",keywords:["방문"],figure:""}]};
describe("DraftWizard",()=>{
  it.each([["ai-edited",true],["design",false]] as const)("restores the image brief and passes %s provenance into new copy",async(source,hasAiImages)=>{
    const id="33333333-3333-4333-8333-333333333333",mediaId="22222222-2222-4222-8222-222222222222";
    window.history.replaceState({},"",`/?draft=${id}`);
    const request=vi.fn(async(url:string,init?:RequestInit)=>{void init;return url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id,topic:"홍어전",audience:"A",image_brief:"노릇한 전 한 접시",content_brief:"익혔을 때 달라지는 식감을 설명하고 홍어전으로 연결한다.",media_candidates:[{id:mediaId,source,file_id:"saved-photo",purpose:"instagram-primary"}],selected_media_id:mediaId})}:{ok:false,json:async()=>({})};});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    fireEvent.click(await screen.findByRole("button",{name:"문안 만들기"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/copy",expect.anything()));
    const copyRequest=request.mock.calls.find(([url])=>url==="/api/copy");
    expect(JSON.parse(String(copyRequest?.[1]?.body))).toMatchObject({topic:"홍어전",imageBrief:"노릇한 전 한 접시",contentBrief:"익혔을 때 달라지는 식감을 설명하고 홍어전으로 연결한다.",hasAiImages});
  });
  afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();sessionStorage.clear();window.history.replaceState({},"","/");});
  it("returns to the same unsaved draft and step after the wizard is remounted",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({})})));
    const first=render(<DraftWizard/>);
    fireEvent.change(screen.getByLabelText("직접 주제를 적고 싶다면"),{target:{value:"이어지는 주제"}});
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    expect(screen.getByRole("heading",{name:"눈길을 끄는 이미지를 골라요"})).toBeInTheDocument();
    await waitFor(()=>expect(JSON.parse(sessionStorage.getItem("mukdong-wizard-session")??"null")).toMatchObject({topic:"이어지는 주제",step:"image"}));
    const {draftId}=JSON.parse(sessionStorage.getItem("mukdong-wizard-session")!);
    first.unmount();
    render(<DraftWizard/>);
    expect(await screen.findByRole("heading",{name:"눈길을 끄는 이미지를 골라요"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"이전: 주제"}));
    expect(screen.getByLabelText("직접 주제를 적고 싶다면")).toHaveValue("이어지는 주제");
    await waitFor(()=>expect(JSON.parse(sessionStorage.getItem("mukdong-wizard-session")!)).toMatchObject({draftId,step:"topic"}));
  });
  it("prefills a library topic without loading or mutating the previous draft",async()=>{
    localStorage.setItem("mukdong-current-draft","11111111-1111-4111-8111-111111111111");
    window.history.replaceState({},"","/?topic="+encodeURIComponent("동네에서 홍어 한 상")+"&audience=B&imageBrief="+encodeURIComponent("퇴근 후 실제 상차림"));
    const request=vi.fn(async(url:string,init?:RequestInit)=>{void init;return url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:{ok:false,json:async()=>({})};});
    vi.stubGlobal("fetch",request);
    render(<DraftWizard/>);
    expect(await screen.findByDisplayValue("동네에서 홍어 한 상")).toBeInTheDocument();
    expect(request.mock.calls.some(([url])=>String(url).startsWith("/api/drafts?"))).toBe(false);
    expect(request.mock.calls.some(([url])=>String(url)==="/api/drafts")).toBe(false);
    expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));
    fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/images/plan",expect.anything()));
    const body=JSON.parse(String(request.mock.calls.find(([url])=>url==="/api/images/plan")?.[1]?.body));
    expect(body).toMatchObject({topic:"동네에서 홍어 한 상",imageBrief:"퇴근 후 실제 상차림"});
  });
  it("keeps an explicit library topic under StrictMode effect replay",async()=>{
    window.history.replaceState({},"","/?topic="+encodeURIComponent("삼합 한 점을 만드는 순서"));
    const request=vi.fn(async()=>({ok:true,json:async()=>({topics:[{id:"one",title:"AI replacement topic",audience:"A",reason:"other",imageBrief:""},{id:"two",title:"Other 2",audience:"B",reason:"other",imageBrief:""},{id:"three",title:"Other 3",audience:"C",reason:"other",imageBrief:""}]})}));
    vi.stubGlobal("fetch",request);
    render(<StrictMode><DraftWizard/></StrictMode>);
    await waitFor(()=>expect(screen.getByLabelText("직접 주제를 적고 싶다면")).toHaveValue("삼합 한 점을 만드는 순서"));
    expect(request).not.toHaveBeenCalledWith("/api/topics",expect.anything());
  });
  it("reopens a saved draft without an image at the image step",async()=>{
    const id="33333333-3333-4333-8333-333333333333";
    window.history.replaceState({},"",`/?draft=${id}`);
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id,topic:"이미지 없는 초안",audience:"A",caption:null,created_at:"2026-09-24T00:00:00.000Z",media_candidates:[],selected_media_id:null})}:{ok:false,json:async()=>({})}));
    render(<DraftWizard/>);
    expect(await screen.findByRole("button",{name:"문안 만들기"})).toBeDisabled();
    expect(screen.queryByText("선택한 초안을 찾지 못했어요. 내 초안에서 다시 골라 주세요.")).not.toBeInTheDocument();
    expect(localStorage.getItem("mukdong-current-draft")).toBe(id);
  });
  it("prefers an explicit saved draft over a library topic",async()=>{
    const id="11111111-1111-4111-8111-111111111111";
    window.history.replaceState({},"",`/?draft=${id}&topic=다른%20주제`);
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id,topic:"기존 초안",audience:"A",caption:"기존 문안",created_at:"2026-09-24T00:00:00.000Z",media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"photo",file_id:"data:image/png;base64,aA==",purpose:"instagram-primary"}],selected_media_id:"22222222-2222-4222-8222-222222222222"})}:{ok:false,json:async()=>({})}));
    render(<DraftWizard/>);
    await waitFor(()=>expect(document.querySelector(".preserved-caption")).toHaveTextContent("기존 문안"));
    expect(screen.queryByDisplayValue("다른 주제")).not.toBeInTheDocument();
  });
  it("ignores a topic query longer than 120 characters",async()=>{
    window.history.replaceState({},"","/?topic="+"가".repeat(121));
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({})})));
    render(<DraftWizard/>);
    expect(await screen.findByDisplayValue("수육에는 왜 김치를 곁들일까?")).toBeInTheDocument();
  });
  it("opens a chosen saved draft with its edited caption and ordered images",async()=>{
    const id="11111111-1111-4111-8111-111111111111";
    window.history.replaceState({},"",`/?draft=${id}`);
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id,status:"ready",topic:"다시 보는 홍어",audience:"A",caption:"저장된 문안",selected_media_id:"22222222-2222-4222-8222-222222222222",selected_media_ids:["22222222-2222-4222-8222-222222222222"],media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"photo",file_id:"saved-photo",purpose:"instagram-cover"}]})}:url==="/api/copy"?{ok:false,json:async()=>({})}:url==="/api/instagram/status"?{ok:true,json:async()=>({connected:false})}:{ok:false,json:async()=>({})}));
    render(<DraftWizard/>);
    await waitFor(()=>expect(document.querySelector(".preserved-caption")).toHaveTextContent("저장된 문안"));
    expect(screen.getByLabelText("게시 전 확인할 항목")).toHaveTextContent("가격·영업시간");
    expect(screen.queryByText("금지 표현 없음 ✓")).not.toBeInTheDocument();
    expect(screen.getByLabelText("피드 대표 이미지")).toHaveStyle({backgroundImage:'url("saved-photo")'});
    fireEvent.click(screen.getByRole("button",{name:"3 문안"}));
    expect(screen.getByRole("textbox",{name:"게시물 문안"})).toHaveValue("저장된 문안");
  });
  it("explains when a selected saved draft is missing",async()=>{
    window.history.replaceState({},"","/?draft=11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>({})})));
    render(<DraftWizard/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("초안을 찾지 못했어요");
    expect(screen.getByRole("link",{name:"내 초안으로 돌아가기"})).toHaveAttribute("href","/drafts");
  });
  it("saves an edited caption before showing final review",async()=>{
    const id="11111111-1111-4111-8111-111111111111";
    localStorage.setItem("mukdong-current-draft",id);
    const request=vi.fn(async(url:string,init?:RequestInit)=>url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id,topic:"저장된 주제",audience:"A",selected_media_id:"22222222-2222-4222-8222-222222222222",media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"photo",file_id:"saved-photo",purpose:"instagram-primary"}]})}:url==="/api/drafts"&&init?.method==="PATCH"?{ok:true,json:async()=>({})}:url==="/api/copy"?{ok:false,json:async()=>({})}:{ok:false,json:async()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    await screen.findByDisplayValue("저장된 주제");
    fireEvent.click(screen.getByRole("button",{name:"2 이미지"}));
    fireEvent.click(screen.getByRole("button",{name:"문안 만들기"}));
    fireEvent.change(await screen.findByRole("textbox",{name:"게시물 문안"}),{target:{value:"새로 쓴 문안"}});
    expect(screen.getByRole("button",{name:"4 확인"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"최종 화면 보기"}));
    await waitFor(()=>expect(document.querySelector(".preserved-caption")).toHaveTextContent("새로 쓴 문안"));
    const save=request.mock.calls.find(([url,init])=>url==="/api/drafts"&&init?.method==="PATCH");
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({id,caption:"새로 쓴 문안"});
  });
  it("saves the complete ordered carousel before enabling the copy step",async()=>{
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/topics"?{ok:false,json:async()=>({})}:url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:url==="/api/images/generate"?{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:["image"],source:"ai-generated"})}:url==="/api/drafts"?{ok:true,json:async()=>({})}:{ok:true,json:async()=>({})});vi.stubGlobal("fetch",request);
    render(<DraftWizard slideCount={3}/>);fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});fireEvent.click(screen.getByRole("button",{name:"이 캐러셀 사용"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/drafts",expect.anything())); const save=request.mock.calls.find(([url])=>url==="/api/drafts"); const body=JSON.parse(String((save?.[1] as RequestInit).body));expect(body.selected_media_ids).toHaveLength(3);expect(body.selected_media_id).toBe(body.selected_media_ids[0]);expect(screen.getByRole("button",{name:"문안 만들기"})).toBeEnabled();
  });
  it("passes every saved carousel slide to review in its stored order",async()=>{
    const copy={topic:"수육에는 왜 김치를 곁들일까?",audience:"A",hook:"첫 문장",information:"정보",store_connection:"가게",call_to_action:"방문",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null,_meta:{provider:"fallback"}};
    let generated=0;
    const request=vi.fn(async(url:string,init?:RequestInit)=>url==="/api/topics"?{ok:false,json:async()=>({})}:url==="/api/images/plan"?{ok:true,json:async()=>({plan})}:url==="/api/images/generate"?{ok:true,json:async()=>({images:JSON.parse(String(init?.body)).count===2?["cover-1","cover-2"]:[generated++===0?"detail-2":"visit-3"],source:"ai-generated"})}:url==="/api/drafts"?{ok:true,json:async()=>({})}:url==="/api/copy"?{ok:true,json:async()=>copy}:{ok:false,json:async()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard slideCount={3}/>);fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));await screen.findByRole("button",{name:"표지 후보 1 선택"});fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));fireEvent.click(screen.getByRole("button",{name:"이 표지로 3장 완성하기"}));await screen.findByRole("button",{name:"이 캐러셀 사용"});fireEvent.click(screen.getByRole("button",{name:"이 캐러셀 사용"}));await screen.findByRole("button",{name:"문안 만들기"});fireEvent.click(screen.getByRole("button",{name:"문안 만들기"}));fireEvent.click(await screen.findByRole("button",{name:"최종 화면 보기"}));
    expect(await screen.findByText("1 / 3")).toBeVisible();
    expect(screen.getAllByRole("button",{name:/슬라이드 [123] 보기/})).toHaveLength(3);
    expect(screen.getByRole("button",{name:"슬라이드 1 보기"})).toHaveStyle({backgroundImage:'url("cover-1")'});
    expect(screen.getByRole("button",{name:"슬라이드 2 보기"})).toHaveStyle({backgroundImage:'url("detail-2")'});
    expect(screen.getByRole("button",{name:"슬라이드 3 보기"})).toHaveStyle({backgroundImage:'url("visit-3")'});
    expect(screen.getByLabelText("피드 대표 이미지")).toHaveStyle({backgroundImage:'url("cover-1")'});
  });
  it("restores every ordered saved media item",async()=>{const draftId="11111111-1111-4111-8111-111111111111";localStorage.setItem("mukdong-current-draft",draftId);vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id:draftId,topic:"저장된 주제",audience:"B",selected_media_id:"22222222-2222-4222-8222-222222222222",selected_media_ids:["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"ai-generated",file_id:"one",purpose:"instagram-cover"},{id:"33333333-3333-4333-8333-333333333333",source:"ai-generated",file_id:"two",purpose:"instagram-detail"}]})}:{ok:false,json:async()=>({})}));render(<DraftWizard/>);await screen.findByDisplayValue("저장된 주제");fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));expect(screen.getByText("선택한 이미지 2장이 저장되어 있어요.")).toBeInTheDocument();});
  it("invalidates restored images when refresh selects a new recommendation",async()=>{
    const draftId="11111111-1111-4111-8111-111111111111";
    const refreshed=[{id:"four",title:"새 첫 추천",summary:"",reason:"새 첫 이유",audience:"A",imageBrief:"새 이미지"},{id:"five",title:"새 둘째 추천",summary:"",reason:"새 둘째 이유",audience:"B",imageBrief:"새 이미지"},{id:"six",title:"새 셋째 추천",summary:"",reason:"새 셋째 이유",audience:"C",imageBrief:"새 이미지"}];
    localStorage.setItem("mukdong-current-draft",draftId);
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.startsWith("/api/drafts?")?{ok:true,json:async()=>({id:draftId,topic:"저장된 주제",audience:"B",selected_media_id:"22222222-2222-4222-8222-222222222222",selected_media_ids:["22222222-2222-4222-8222-222222222222"],media_candidates:[{id:"22222222-2222-4222-8222-222222222222",source:"ai-generated",file_id:"one",purpose:"instagram-cover"}]})}:url==="/api/topics"?{ok:true,json:async()=>({topics:refreshed})}:{ok:false,json:async()=>({})}));
    render(<DraftWizard/>);await screen.findByDisplayValue("저장된 주제");fireEvent.click(screen.getByRole("button",{name:"AI 추천 새로고침"}));
    await screen.findByDisplayValue("새 첫 추천");expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));expect(screen.queryByText(/선택한 이미지 \d+장이 저장되어 있어요/)).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"문안 만들기"})).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button",{name:"AI 추천 새로고침"}));
    const refreshBody=JSON.parse(String((request.mock.calls.at(-1)?.[1] as RequestInit).body));
    expect(refreshBody.excludeTitles).toEqual(["첫 추천","둘째 추천","셋째 추천"]);
    fireEvent.change(screen.getByDisplayValue("첫 추천"),{target:{value:"직접 정한 주제"}});
    resolveRefresh({ok:true,json:async()=>({topics:refreshed})});
    await screen.findByText("새 셋째 추천");
    expect(screen.getByDisplayValue("직접 정한 주제")).toBeInTheDocument();
  });
  it("removes a recommendation image brief after the topic is edited directly",async()=>{
    const topics=[{id:"one",title:"추천 주제",summary:"",reason:"이유",audience:"A",imageBrief:"광택 나는 한 상"},{id:"two",title:"다른 추천",summary:"",reason:"이유",audience:"B",imageBrief:"다른 이미지"},{id:"three",title:"세 번째 추천",summary:"",reason:"이유",audience:"C",imageBrief:"세 번째 이미지"}];
    const request=vi.fn<(url:string,init?:RequestInit)=>Promise<unknown>>(async(url:string)=>url==="/api/topics"?{ok:true,json:async()=>({topics})}:url==="/api/images/plan"?{ok:false,json:async()=>({message:"계획 실패"})}:{ok:false,json:async()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);await screen.findByText("추천 주제");
    fireEvent.click(screen.getByText("추천 주제").closest("button")!);
    fireEvent.change(screen.getByDisplayValue("추천 주제"),{target:{value:"직접 수정한 주제"}});
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));
    fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/images/plan",expect.anything()));
    const planBody=JSON.parse(String((request.mock.calls.find(([url])=>url==="/api/images/plan")?.[1] as RequestInit).body));
    expect(planBody).toMatchObject({topic:"직접 수정한 주제",slideCount:5});
    expect(planBody).not.toHaveProperty("imageBrief");
  });
  it("preserves an edited caption through review, back, and review again",async()=>{
    const copy={topic:"수육에는 왜 김치를 곁들일까?",audience:"A",hook:"AI 첫 문장",information:"정보",store_connection:"가게",call_to_action:"방문",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null,_meta:{provider:"fallback"}};
    const request=vi.fn(async(url:string)=>url==="/api/topics"?{ok:false,json:async()=>({})}:url==="/api/images/assets"?{ok:true,json:async()=>({asset:{id:"photo-id",preview:"data:image/jpeg;base64,AAAA",name:"a"}})}:url==="/api/drafts"?{ok:true,json:async()=>({})}:url==="/api/copy"?{ok:true,json:async()=>copy}:{ok:false,json:async()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
    // 사진 모드는 사진을 모아 두었다가 "글자 없이 사진만 쓰기"(또는 캐러셀 만들기)로 확정한다.
    fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"문안 만들기"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"문안 만들기"}));
    const textarea=await screen.findByRole("textbox",{name:"게시물 문안"});fireEvent.change(textarea,{target:{value:"내가 고친 문안"}});
    fireEvent.click(screen.getByRole("button",{name:"최종 화면 보기"}));await waitFor(()=>expect(document.querySelector(".preserved-caption")).toHaveTextContent("내가 고친 문안"));
    fireEvent.click(screen.getByRole("button",{name:"이전: 문안"}));
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"게시물 문안"})).toHaveValue("내가 고친 문안"));
    fireEvent.click(screen.getByRole("button",{name:"최종 화면 보기"}));await waitFor(()=>expect(document.querySelector(".preserved-caption")).toHaveTextContent("내가 고친 문안"));
  });
  it("keeps the topic when recommendations arrive after moving on to images",async()=>{
    let answer:(value:unknown)=>void=()=>undefined;
    const late=new Promise(resolve=>{answer=resolve;});
    const topics=[{id:"t1",title:"늦게 온 추천 주제일까?",summary:"홍어로 이어지는 설명 방향입니다. 충분히 긴 요약입니다.",reason:"이유",audience:"B",imageBrief:"사진",season:""},{id:"t2",title:"두 번째 주제일까?",summary:"홍어로 이어지는 설명 방향입니다. 충분히 긴 요약입니다.",reason:"이유",audience:"A",imageBrief:"사진",season:""},{id:"t3",title:"홍어는 왜 그럴까?",summary:"홍어로 이어지는 설명 방향입니다. 충분히 긴 요약입니다.",reason:"이유",audience:"C",imageBrief:"사진",season:""}];
    vi.stubGlobal("fetch",vi.fn((url:string)=>url==="/api/topics"?late:Promise.resolve({ok:true,json:async()=>({})})));
    render(<DraftWizard/>);
    // 첫 화면(주제 입력란)이 그려질 때까지 기다린다. 전체 테스트를 함께 돌리면 첫 렌더가 늦을 수 있다.
    const initial=((await screen.findByRole("textbox",undefined,{timeout:5000})) as HTMLInputElement).value;
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    answer({ok:true,json:async()=>({topics,source:"ai"})});
    await waitFor(()=>expect(screen.getByRole("button",{name:"실제 사진 사용"})).toBeInTheDocument());
    // 늦은 응답의 처리(json 읽기·상태 반영)가 이미지 단계에서 모두 끝나도록 기다린다(고정 시간 대신 응답 자체를 기다려 부하에 흔들리지 않게).
    await act(async()=>{await late;await new Promise(resolve=>setTimeout(resolve,0));});
    fireEvent.click(screen.getByRole("button",{name:"1 주제"}));
    expect(await screen.findByText("늦게 온 추천 주제일까?",undefined,{timeout:5000})).toBeInTheDocument();
    expect((screen.getByLabelText("직접 주제를 적고 싶다면") as HTMLInputElement).value).toBe(initial);
  });

  it("carries the month plan date and recommended style into the new draft",async()=>{
    window.history.replaceState({},"","/?"+new URLSearchParams({topic:"막걸리엔 왜 전일까?",audience:"A",imageBrief:"전 한 접시",brief:"막걸리와 전의 궁합에서 홍어로 잇는다.",planDate:"2099-01-06",style:"newspaper"}));
    let uploads=0;
    const request=vi.fn(async(url:string,init?:RequestInit)=>{void init;return url==="/api/images/assets"?{ok:true,json:async()=>({asset:{id:`photo-${++uploads}`,preview:"data:image/jpeg;base64,AAAA",name:"p"}})}:url==="/api/drafts"?{ok:true,json:async()=>({})}:{ok:false,json:async()=>({})};});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);
    expect(await screen.findByText(/한 달 기획 · 1\/6\(화\) 18:00 게시 예정 · 추천 계열 한지·수묵/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    // 추천 계열이 디자인 계열 선택의 기본값이 된다.
    expect(screen.getByRole("combobox",{name:"디자인 계열"})).toHaveValue("hanji");
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
    fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));
    await waitFor(()=>expect(request.mock.calls.some(([url])=>url==="/api/drafts")).toBe(true));
    const saved=JSON.parse(String((request.mock.calls.find(([url])=>url==="/api/drafts")?.[1] as RequestInit).body));
    expect(saved).toMatchObject({topic:"막걸리엔 왜 전일까?",plan_date:"2099-01-06"});
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
    // 두 번째 방문: 다음 추천 방향으로, 지난번에 보여 준 세 주제는 피해 달라고 알린다.
    expect(bodies[1]).toMatchObject({recommendationRound:1});
    expect(bodies[1].recentTitles).toEqual(expect.arrayContaining(topics.map(topic=>topic.title)));
  });

  it("invalidates saved images and copy when the topic changes",async()=>{
    let uploads=0;
    const copy={topic:"수육에는 왜 김치를 곁들일까?",audience:"A",hook:"새 AI 문안",information:"정보",store_connection:"가게",call_to_action:"방문",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null,_meta:{provider:"fallback"}};
    const request=vi.fn(async(url:string,init?:RequestInit)=>{void init;return url==="/api/topics"?{ok:false,json:async()=>({})}:url==="/api/images/assets"?{ok:true,json:async()=>({asset:{id:`photo-${++uploads}`,preview:"data:image/jpeg;base64,AAAA",name:`photo-${uploads}`}})}:url==="/api/drafts"?{ok:true,json:async()=>({})}:url==="/api/copy"?{ok:true,json:async()=>copy}:url==="/api/images/plan"?{ok:false,json:async()=>({message:"계획 실패"})}:{ok:false,json:async()=>({})};});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
    // 사진 모드는 사진을 모아 두었다가 "글자 없이 사진만 쓰기"(또는 캐러셀 만들기)로 확정한다.
    fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"문안 만들기"})).toBeEnabled());
    const firstSave=JSON.parse(String((request.mock.calls.find(([url])=>url==="/api/drafts")?.[1] as RequestInit).body));
    expect(firstSave.content_brief).toContain("홍어");
    expect(localStorage.getItem("mukdong-current-draft")).toBe(firstSave.id);
    fireEvent.click(screen.getByRole("button",{name:"문안 만들기"}));
    const textarea=await screen.findByRole("textbox",{name:"게시물 문안"});fireEvent.change(textarea,{target:{value:"이전 주제용 수정 문안"}});
    fireEvent.click(screen.getByRole("button",{name:"1 주제"}));
    fireEvent.change(screen.getByDisplayValue("수육에는 왜 김치를 곁들일까?"),{target:{value:"막걸리와 즐기는 저녁 한 상"}});
    expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    expect(screen.getByRole("button",{name:"3 문안"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"4 확인"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    expect(screen.queryByText(/선택한 이미지 \d+장이 저장되어 있어요/)).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"문안 만들기"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/images/plan",expect.anything()));
    const planBody=JSON.parse(String((request.mock.calls.find(([url])=>url==="/api/images/plan")?.[1] as RequestInit).body));
    expect(planBody.topic).toBe("막걸리와 즐기는 저녁 한 상");
    fireEvent.click(screen.getByRole("button",{name:"실제 사진 사용"}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["b"],"b.png",{type:"image/png"})]}});
    fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));
    await waitFor(()=>expect(request.mock.calls.filter(([url])=>url==="/api/drafts")).toHaveLength(2));
    const secondSave=JSON.parse(String((request.mock.calls.filter(([url])=>url==="/api/drafts")[1][1] as RequestInit).body));
    expect(secondSave).toMatchObject({topic:"막걸리와 즐기는 저녁 한 상",content_brief:""});expect(secondSave.id).not.toBe(firstSave.id);
    await waitFor(()=>expect(screen.getByRole("button",{name:"문안 만들기"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"문안 만들기"}));
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"게시물 문안"})).not.toHaveValue("이전 주제용 수정 문안"));
    const lastCopy=request.mock.calls.filter(([url])=>url==="/api/copy").at(-1);
    expect(JSON.parse(String(lastCopy?.[1]?.body))).toMatchObject({contentBrief:""});
  });
  it("ignores a late draft save after the topic changes",async()=>{
    let finishSave:(value:unknown)=>void=()=>{};
    const request=vi.fn((url:string)=>url==="/api/topics"?Promise.resolve({ok:false,json:async()=>({})}):url==="/api/images/assets"?Promise.resolve({ok:true,json:async()=>({asset:{id:"photo-id",preview:"data:image/jpeg;base64,AAAA",name:"a"}})}):url==="/api/drafts"?new Promise(resolve=>{finishSave=resolve;}):Promise.resolve({ok:false,json:async()=>({})}));
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
    fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith("/api/drafts",expect.anything()));
    expect(screen.getByText("이미지 선택을 저장하는 중…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"이전: 주제"}));
    fireEvent.change(screen.getByDisplayValue("수육에는 왜 김치를 곁들일까?"),{target:{value:"저장 중 바꾼 새 주제"}});
    await act(async()=>{finishSave({ok:true,json:async()=>({})});await Promise.resolve();});
    expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
    expect(screen.getByRole("button",{name:"3 문안"})).toBeDisabled();
  });
  it("keeps copy disabled after a save failure until retry succeeds",async()=>{
    let saves=0;
    const request=vi.fn(async(url:string)=>url==="/api/topics"?{ok:false,json:async()=>({})}:url==="/api/images/assets"?{ok:true,json:async()=>({asset:{id:"photo-id",preview:"data:image/jpeg;base64,AAAA",name:"a"}})}:url==="/api/drafts"?{ok:++saves>1,json:async()=>({})}:{ok:false,json:async()=>({})});
    vi.stubGlobal("fetch",request);render(<DraftWizard/>);fireEvent.click(screen.getByRole("button",{name:"이미지 선택"}));
    fireEvent.change(screen.getByLabelText("사진 파일"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
    fireEvent.click(await screen.findByRole("button",{name:"글자 없이 사진만 쓰기"}));
    expect(await screen.findByRole("button",{name:"저장 다시 시도"})).toBeInTheDocument();expect(screen.getByRole("button",{name:"문안 만들기"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"저장 다시 시도"}));await waitFor(()=>expect(screen.getByRole("button",{name:"문안 만들기"})).toBeEnabled());expect(saves).toBe(2);
  });
});
