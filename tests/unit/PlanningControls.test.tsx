import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlanningControls } from "@/components/drafts/PlanningControls";

const { refresh }=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));

afterEach(() => {vi.unstubAllGlobals();refresh.mockClear();});

it("saves a Korean-time plan and final review without publishing", async () => {
  const request=vi.fn(async(url:string,options:RequestInit)=>{void url;void options;return {ok:true,json:async()=>({planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:true})};});
  vi.stubGlobal("fetch",request);
  render(<PlanningControls draftId="11111111-1111-4111-8111-111111111111" topic="홍어 소개" plannedPublishAt={null} finalReviewComplete={false} canReview/>);

  fireEvent.change(screen.getByLabelText("게시 희망일시 (한국시간)"),{target:{value:"2030-05-15T18:00"}});
  fireEvent.click(screen.getByLabelText("최종 확인 완료"));
  fireEvent.click(screen.getByRole("button",{name:"예약 준비 저장"}));

  await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  const [url,options]=request.mock.calls[0];
  expect(url).toBe("/api/drafts");
  expect(options.method).toBe("PATCH");
  expect(JSON.parse(String(options.body))).toEqual({id:"11111111-1111-4111-8111-111111111111",planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:true});
  expect(await screen.findByText("게시 준비 완료")).toBeInTheDocument();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.map(([path])=>path)).not.toContain("/api/instagram/publish");
});

it("clears the planned time and final-review mark together", async () => {
  const request=vi.fn(async(url:string,options:RequestInit)=>{void url;void options;return {ok:true,json:async()=>({planned_publish_at:null,final_review_complete:false})};});
  vi.stubGlobal("fetch",request);
  render(<PlanningControls draftId="11111111-1111-4111-8111-111111111111" topic="홍어 소개" plannedPublishAt="2030-05-15T09:00:00.000Z" finalReviewComplete canReview/>);
  const input=screen.getByLabelText("게시 희망일시 (한국시간)");
  expect(input).toHaveValue("2030-05-15T18:00");

  fireEvent.change(input,{target:{value:""}});
  expect(screen.getByLabelText("최종 확인 완료")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button",{name:"예약 준비 저장"}));

  await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0][1].body))).toMatchObject({planned_publish_at:null,final_review_complete:false});
  expect(await screen.findByText("예약 준비 전")).toBeInTheDocument();
});
