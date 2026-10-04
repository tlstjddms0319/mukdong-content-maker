import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyEditor } from "@/components/copy/CopyEditor";

describe("CopyEditor generation", () => {
  it("passes the image context and shows verification notes without replacing manual edits",async()=>{
    const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({topic:"홍어전",audience:"A",hook:"노릇한 한입",information:"전 이야기",store_connection:"묵동홍어마을",call_to_action:"메뉴 확인",hashtags:["#홍어전"],facts_used:[],facts_to_verify:["홍어전 판매 여부 확인"],image_disclosure:"AI 연출 이미지가 포함되어 있으며 실제 메뉴와 다를 수 있습니다."})});
    vi.stubGlobal("fetch",request);
    render(<CopyEditor topic="홍어전" imageBrief="노릇한 전을 흰 접시에" hasAiImages onContinue={()=>undefined}/>);
    expect(await screen.findByText("홍어전 판매 여부 확인")).toBeVisible();
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({imageBrief:"노릇한 전을 흰 접시에",hasAiImages:true});
    expect((screen.getByLabelText("게시물 문안") as HTMLTextAreaElement).value).toContain("AI 연출 이미지");
    fireEvent.change(screen.getByLabelText("게시물 문안"),{target:{value:"냄새 없음"}});
    expect(screen.getByText("향이 없다고 단정할 수 없어요.")).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"AI 이미지 안내 넣기"}));
    expect(screen.getByLabelText("게시물 문안")).toHaveValue("냄새 없음\n\nAI 연출 이미지가 포함되어 있으며 실제 메뉴와 다를 수 있습니다.");
  });
  it("swaps in a first-line candidate and keeps the old first line as an option",async()=>{
    const copy={topic:"홍어",audience:"A",hook:"원래 첫 문장이에요",information:"설명 문단이에요",store_connection:"묵동에서 홍어를 알아볼 때 묵동홍어마을도 살펴보세요.",call_to_action:"메뉴를 확인해 보세요.",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null,hook_options:["홍어는 왜 수육이랑 먹을까요?","결이 보이는 홍어 한 점"]};
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>copy}));
    render(<CopyEditor topic="홍어" onContinue={()=>undefined}/>);
    fireEvent.click(await screen.findByRole("button",{name:"홍어는 왜 수육이랑 먹을까요?"}));
    const value=(screen.getByLabelText("게시물 문안") as HTMLTextAreaElement).value;
    expect(value.startsWith("홍어는 왜 수육이랑 먹을까요?\n\n설명 문단이에요")).toBe(true);
    expect(screen.getByRole("button",{name:"원래 첫 문장이에요"})).toBeInTheDocument();
  });
  it("keeps the user's prose intact when replacing hashtags",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({replacement:"#홍어 #묵동맛집 #중랑구맛집"})}));
    const original="내 첫 문장\n\n내 설명\n\n내 가게 소개\n\n내 마무리\n\n#기존";
    render(<CopyEditor initialText={original} onContinue={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"해시태그 다시 만들기"}));
    await waitFor(()=>expect(screen.getByRole("textbox")).toHaveValue(original.replace("#기존","#홍어 #묵동맛집 #중랑구맛집")));
  });
  it("preserves saved text and provides a retry when the API fails",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({message:"생성에 실패했어요."})}));
    render(<CopyEditor initialText="사용자가 저장한 글" onContinue={()=>undefined}/>);
    fireEvent.click(screen.getByRole("button",{name:"전체 문안 새로 생성"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("생성에 실패했어요.");
    expect(screen.getByRole("textbox")).toHaveValue("사용자가 저장한 글");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("replaces the fallback with Gemini copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok:true, json:async () => ({
      topic:"선택한 주제", audience:"A", hook:"Gemini가 만든 첫 문장", information:"정보", store_connection:"가게", call_to_action:"저장", hashtags:["#삼합"], facts_used:[], facts_to_verify:[], image_disclosure:null,
    }) }));
    render(<CopyEditor topic="선택한 주제" onContinue={() => undefined}/>);
    expect(await screen.findByDisplayValue(/Gemini가 만든 첫 문장/)).toBeInTheDocument();
  });

  it("shows generation progress and never overwrites a manual edit", async () => {
    let finish:(value:unknown)=>void=()=>undefined;
    vi.stubGlobal("fetch",vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
    render(<CopyEditor topic="선택한 주제" onContinue={()=>undefined}/>);
    expect(screen.getByRole("status")).toHaveTextContent("AI가 문안을 만드는 중");
    fireEvent.change(screen.getByLabelText("게시물 문안"),{target:{value:"내가 직접 고친 문안"}});
    finish({ok:true,json:async()=>({topic:"선택한 주제",audience:"A",hook:"늦게 온 AI 문안",information:"정보",store_connection:"가게",call_to_action:"저장",hashtags:[],facts_used:[],facts_to_verify:[],image_disclosure:null,_meta:{provider:"gemini"}})});
    expect(await screen.findByDisplayValue("내가 직접 고친 문안")).toBeInTheDocument();
  });

  it("names the provider that answered", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok:true, json:async () => ({
      topic:"선택한 주제", audience:"A", hook:"첫 문장", information:"정보", store_connection:"가게", call_to_action:"저장", hashtags:["#삼합"], facts_used:[], facts_to_verify:[], image_disclosure:null, _meta:{provider:"groq"},
    }) }));
    render(<CopyEditor topic="선택한 주제" onContinue={() => undefined}/>);
    expect(await screen.findByText("AI로 문안을 만들었어요 (Groq)")).toBeInTheDocument();
  });

  it("does not spend an AI request when reopening a saved caption", () => {
    const request=vi.fn().mockResolvedValue({ok:false});
    vi.stubGlobal("fetch",request);
    render(<CopyEditor topic="저장된 주제" initialText="내가 저장한 문안" onContinue={()=>undefined}/>);
    expect(screen.getByRole("textbox",{name:"게시물 문안"})).toHaveValue("내가 저장한 문안");
    expect(request).not.toHaveBeenCalled();
  });
});
