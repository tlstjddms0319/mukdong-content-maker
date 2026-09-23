import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyEditor } from "@/components/copy/CopyEditor";

describe("CopyEditor generation", () => {
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
    expect(screen.getByRole("status")).toHaveTextContent("Gemini가 문안을 만드는 중");
    fireEvent.change(screen.getByLabelText("게시물 문안"),{target:{value:"내가 직접 고친 문안"}});
    finish({ok:true,json:async()=>({topic:"선택한 주제",audience:"A",hook:"늦게 온 AI 문안",information:"정보",store_connection:"가게",call_to_action:"저장",hashtags:[],facts_used:[],facts_to_verify:[],image_disclosure:null,_meta:{provider:"gemini"}})});
    expect(await screen.findByDisplayValue("내가 직접 고친 문안")).toBeInTheDocument();
  });

  it("does not spend an AI request when reopening a saved caption", () => {
    const request=vi.fn().mockResolvedValue({ok:false});
    vi.stubGlobal("fetch",request);
    render(<CopyEditor topic="저장된 주제" initialText="내가 저장한 문안" onContinue={()=>undefined}/>);
    expect(screen.getByRole("textbox",{name:"게시물 문안"})).toHaveValue("내가 저장한 문안");
    expect(request).not.toHaveBeenCalled();
  });
});
