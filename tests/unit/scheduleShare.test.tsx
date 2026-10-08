import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleShare } from "@/components/review/ScheduleShare";
import { formatKstTime, quickScheduleChoices } from "@/features/instagram/scheduleChoices";

const ID="11111111-1111-4111-8111-111111111111";
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe("quick schedule times", () => {
  it("offers only times at least 30 minutes ahead, in KST", () => {
    // 2026-10-08 11:40 KST → 오늘 점심 12시는 20분 뒤라 빠지고, 오늘 저녁·내일 점심·내일 저녁.
    const now=Date.parse("2026-10-08T11:40:00+09:00");
    expect(quickScheduleChoices(now).map(choice=>[choice.label,choice.iso])).toEqual([
      ["오늘 저녁 6시","2026-10-08T09:00:00.000Z"],["내일 점심 12시","2026-10-09T03:00:00.000Z"],["내일 저녁 6시","2026-10-09T09:00:00.000Z"],
    ]);
    // 밤 11시(KST)면 내일 것만.
    expect(quickScheduleChoices(Date.parse("2026-10-08T23:00:00+09:00")).map(choice=>choice.label)).toEqual(["내일 점심 12시","내일 저녁 6시"]);
  });
  it("reads times the owner's way", () => {
    expect(formatKstTime("2026-10-09T09:00:00.000Z")).toBe("10월 9일(금) 저녁 6:00");
    expect(formatKstTime("2026-10-09T03:30:00.000Z")).toBe("10월 9일(금) 오후 12:30");
  });
});

describe("ScheduleShare", () => {
  it("saves the caption, then the time with final review on", async () => {
    const calls:Array<{url:string;init?:RequestInit}>=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{calls.push({url,init});return init?.method==="PATCH"?{ok:true,json:async()=>({})}:{ok:true,json:async()=>({id:ID,final_review_complete:false,planned_publish_at:null})};}));
    vi.stubGlobal("confirm",vi.fn(()=>true));
    const saveCaption=vi.fn(async()=>true);
    render(<ScheduleShare draftId={ID} ready onBeforeSchedule={saveCaption}/>);
    fireEvent.click(screen.getByRole("button",{name:"예약해서 올리기"}));
    const first=screen.getAllByRole("button",{pressed:false}).find(button=>/시$/.test(button.textContent??""))!;
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button",{name:/에 예약하기$/}));
    expect(await screen.findByText(/에 올라가요\./)).toBeInTheDocument();
    expect(saveCaption).toHaveBeenCalled();
    const patch=calls.find(call=>call.init?.method==="PATCH")!;
    const body=JSON.parse(String(patch.init!.body));
    expect(body).toMatchObject({id:ID,final_review_complete:true});
    expect(Date.parse(body.planned_publish_at)).toBeGreaterThan(Date.now());
  });

  it("shows an existing reservation and cancels it", async () => {
    const at=new Date(Date.now()+3*60*60*1000).toISOString();
    const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="PATCH"?{ok:true,json:async()=>({})}:{ok:true,json:async()=>({id:ID,final_review_complete:true,planned_publish_at:at})});
    vi.stubGlobal("fetch",fetch);vi.stubGlobal("confirm",vi.fn(()=>true));
    render(<ScheduleShare draftId={ID} ready/>);
    expect(await screen.findByText(`${formatKstTime(at)}에 올라가요.`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"예약 취소"}));
    expect(await screen.findByRole("button",{name:"예약해서 올리기"})).toBeInTheDocument();
    const patch=fetch.mock.calls.find(([,init])=>init?.method==="PATCH")!;
    expect(JSON.parse(String(patch[1]!.body))).toEqual({id:ID,planned_publish_at:null,final_review_complete:false});
  });

  it("is off until Instagram is connected, and shows the server's reason on failure", async () => {
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="PATCH"?{ok:false,json:async()=>({error:"사진과 글을 만들고 올릴 날짜를 정한 뒤 확인해 주세요."})}:{ok:false,json:async()=>({})}));
    vi.stubGlobal("confirm",vi.fn(()=>true));
    const {rerender}=render(<ScheduleShare draftId={ID} ready={false}/>);
    expect(screen.getByRole("button",{name:"예약해서 올리기"})).toBeDisabled();
    expect(screen.getByText("인스타그램을 연결하면 예약할 수 있어요")).toBeInTheDocument();
    rerender(<ScheduleShare draftId={ID} ready/>);
    fireEvent.click(screen.getByRole("button",{name:"예약해서 올리기"}));
    fireEvent.change(screen.getByLabelText("다른 날짜·시각"),{target:{value:"2099-01-06T18:00"}});
    fireEvent.click(screen.getByRole("button",{name:/에 예약하기$/}));
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("사진과 글을 만들고"));
  });
});

describe("ArchiveShare", () => {
  it("saves the caption, archives, and can take it back out", async () => {
    const { ArchiveShare }=await import("@/components/review/ArchiveShare");
    const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="PATCH"?{ok:true,json:async()=>({})}:{ok:true,json:async()=>({id:ID})});
    vi.stubGlobal("fetch",fetch);
    const saveCaption=vi.fn(async()=>true),changed=vi.fn();
    render(<ArchiveShare draftId={ID} onBeforeArchive={saveCaption} onChange={changed}/>);
    fireEvent.click(screen.getByRole("button",{name:"보관함에 보관하기"}));
    expect(await screen.findByText("보관함에 넣었어요.")).toBeInTheDocument();
    expect(saveCaption).toHaveBeenCalled();expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link",{name:"보관함 보기"})).toHaveAttribute("href","/drafts?view=archive");
    fireEvent.click(screen.getByRole("button",{name:"꺼내기"}));
    expect(await screen.findByRole("button",{name:"보관함에 보관하기"})).toBeInTheDocument();
    const bodies=fetch.mock.calls.filter(([,init])=>init?.method==="PATCH").map(([,init])=>JSON.parse(String(init!.body)));
    expect(bodies).toEqual([{id:ID,archived:true},{id:ID,archived:false}]);
  });
});
