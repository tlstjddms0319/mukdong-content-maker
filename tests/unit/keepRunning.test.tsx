// 내 게시물에서 다른 게시물을 열거나 복제할 때, 만드는 중인 게시물이 있으면 먼저 묻는다(취소하면 그대로 둔다).
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeepRunningLink } from "@/components/drafts/KeepRunningLink";
import { DuplicateDraftButton } from "@/components/drafts/DuplicateDraftButton";
import { STOP_RUNNING_QUESTION, addLibraryPhoto, buildPhotoCarousel, confirmStopGeneration, ensureGeneration, generatingDraftId, resetGenerationStore } from "@/features/images/generationStore";

const push=vi.fn();
vi.mock("next/navigation",()=>({useRouter:()=>({push,refresh:vi.fn()})}));

// 사진 묶음 만들기를 시작하고 서버 답을 붙잡아 두어 "만드는 중"으로 둔다.
function startMaking(id="running"){
  vi.stubGlobal("fetch",vi.fn(()=>new Promise(()=>{})));
  ensureGeneration(`${id}|5`,{topic:"홍어",slideCount:5});
  addLibraryPhoto({id:"p1",preview:"data:image/jpeg;base64,AAAA",name:"사진"});
  void buildPhotoCarousel();
}

describe("keeping a post that is still being made",()=>{
  afterEach(()=>{vi.unstubAllGlobals();resetGenerationStore();push.mockReset();});

  it("does not ask when nothing is being made or the same post is opened",()=>{
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    expect(confirmStopGeneration("other")).toBe(true);
    startMaking();
    expect(generatingDraftId()).toBe("running");
    expect(confirmStopGeneration("running")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps making on cancel and stops it on OK",()=>{
    startMaking();
    const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
    expect(confirmStopGeneration("other")).toBe(false);
    expect(confirm).toHaveBeenCalledWith(STOP_RUNNING_QUESTION);
    expect(generatingDraftId()).toBe("running");
    confirm.mockReturnValue(true);
    expect(confirmStopGeneration()).toBe(true);
    expect(generatingDraftId()).toBeNull();
  });

  it("stays on 내 게시물 when the owner cancels opening another post",()=>{
    startMaking();
    vi.stubGlobal("confirm",vi.fn(()=>false));
    render(<KeepRunningLink href="/?draft=other" draftId="other">열기</KeepRunningLink>);
    const click=new MouseEvent("click",{bubbles:true,cancelable:true});
    screen.getByRole("link",{name:"열기"}).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(generatingDraftId()).toBe("running");
  });

  it("does not make a copy when the owner cancels 복제해서 고치기",()=>{
    startMaking();
    const fetch=globalThis.fetch as ReturnType<typeof vi.fn>;
    const before=fetch.mock.calls.length;
    vi.stubGlobal("confirm",vi.fn(()=>false));
    render(<DuplicateDraftButton draftId="old" topic="지난 게시물"/>);
    fireEvent.click(screen.getByRole("button",{name:"지난 게시물 복제해서 고치기"}));
    expect(fetch.mock.calls.slice(before).some(([url])=>url==="/api/drafts/duplicate")).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
