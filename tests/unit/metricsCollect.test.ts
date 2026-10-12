// @vitest-environment node
import { describe,expect,it,vi } from "vitest";
import { runDailyMetrics } from "@/features/metrics/collect";
import type { MetricsState } from "@/features/metrics/store";

function memoryStore(initial:MetricsState={}){
  let state=initial;
  return {readState:async()=>state,saveState:vi.fn(async(next:MetricsState)=>{state=next;}),get state(){return state;}};
}

describe("하루 한 번 수집",()=>{
  it("채널마다 오늘 이미 돌았으면 건너뛴다",async()=>{
    const store=memoryStore({instagram:{lastRunOn:"2026-10-12"},ga4:{lastRunOn:"2026-10-12"}});
    const instagram=vi.fn(),ga4=vi.fn();
    const run=await runDailyMetrics({store,today:"2026-10-12",instagram,ga4});
    expect(run).toMatchObject({instagram:"not-due",ga4:"not-due"});
    expect(instagram).not.toHaveBeenCalled();
  });
  it("한 채널이 실패해도 다른 채널은 돌고, 실패 이유를 남기되 마지막 성공 기록은 지키지 않는다",async()=>{
    const store=memoryStore({ga4:{filledThrough:"2026-10-10"}});
    const run=await runDailyMetrics({store,today:"2026-10-12",
      instagram:vi.fn().mockRejectedValue(new Error("Instagram 인사이트 요청 실패(HTTP 500)")),
      ga4:vi.fn().mockResolvedValue({filledThrough:"2026-10-11"})});
    expect(run).toMatchObject({instagram:"failed",ga4:"ran"});
    expect(store.state.instagram).toMatchObject({lastRunOn:"2026-10-12",lastError:"Instagram 인사이트 요청 실패(HTTP 500)"});
    expect(store.state.ga4).toMatchObject({lastRunOn:"2026-10-12",lastError:null,filledThrough:"2026-10-11"});
  });
  it("권한이 없어 건너뛰면 다시 연결 안내를 오류 칸에 남긴다",async()=>{
    const store=memoryStore();
    const run=await runDailyMetrics({store,today:"2026-10-12",instagram:vi.fn().mockResolvedValue({skipped:"needs-reconnect"}),ga4:null});
    expect(run).toMatchObject({instagram:"skipped",ga4:"not-configured"});
    expect(store.state.instagram?.lastError).toContain("다시 연결");
  });
  it("force면 오늘 돌았어도 다시 돈다",async()=>{
    const store=memoryStore({instagram:{lastRunOn:"2026-10-12"}});
    const instagram=vi.fn().mockResolvedValue({});
    await runDailyMetrics({store,today:"2026-10-12",instagram,ga4:null,force:true});
    expect(instagram).toHaveBeenCalledOnce();
  });
});
