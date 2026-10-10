import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import { NotificationCard } from "@/components/settings/NotificationCard";
import { DEFAULT_NOTIFICATION_PREFS } from "@/features/notifications/schema";

const loaded=(devices:unknown[]=[])=>({ok:true,status:200,json:async()=>({publicKey:"BPublicKey",prefs:DEFAULT_NOTIFICATION_PREFS,devices})});

describe("NotificationCard",()=>{
  afterEach(()=>{vi.unstubAllGlobals();});

  it("알림을 받을 수 없는 브라우저에서는 크롬으로 열라고 안내하고, 받는 기기가 없으면 설정 칸을 숨긴다",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(loaded()));
    render(<NotificationCard/>);
    expect(await screen.findByText(/안드로이드 휴대폰의 크롬으로/)).toBeInTheDocument();
    await waitFor(()=>expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button",{name:"알림 설정 저장"})).not.toBeInTheDocument();
  });

  it("다른 기기가 알림을 받고 있으면 요일·시각을 고쳐 저장할 수 있다",async()=>{
    const fetchMock=vi.fn().mockImplementation(async(_url:string,init?:RequestInit)=>init?.method==="PUT"
      ?{ok:true,status:200,json:async()=>({prefs:JSON.parse(String(init.body))})}
      :loaded([{endpoint:"https://push.example/phone",label:"안드로이드 휴대폰",createdAt:"2026-10-11T00:00:00.000Z"}]));
    vi.stubGlobal("fetch",fetchMock);
    render(<NotificationCard/>);
    const save=await screen.findByRole("button",{name:"알림 설정 저장"});
    expect(save).toBeDisabled();
    expect(screen.getByRole("button",{name:"화"})).toHaveAttribute("aria-pressed","true");
    fireEvent.click(screen.getByRole("button",{name:"월"}));
    fireEvent.change(screen.getByLabelText("알림 시각"),{target:{value:"9"}});
    fireEvent.click(save);
    await screen.findByText("알림 설정을 저장했어요.");
    const put=fetchMock.mock.calls.find(([,init])=>init?.method==="PUT");
    expect(JSON.parse(String(put![1].body))).toMatchObject({weekdays:[1,2,5],hour:9});
  });
});
