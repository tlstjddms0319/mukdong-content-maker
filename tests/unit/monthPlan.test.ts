// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { groupByWeek, pickWeekTopics, postDatesForMonth, rotateStyles } from "@/features/topics/monthPlan";

vi.mock("@/features/auth/guard",()=>({ownerApiError:async()=>null}));
vi.mock("server-only",()=>({}));
vi.mock("@/features/settings/repository",()=>({readSettings:async()=>({textAiProvider:"automatic"})}));
// 텍스트 AI 없음 → 준비된 주제(시즌 주제 포함)로 채워지는 경로를 시험한다.
vi.mock("@/lib/ai/textClient",()=>({createTextClient:()=>({provider:null,generateJson:async()=>{throw new Error("offline");}})}));

describe("month plan helpers", () => {
  it("lists Tuesdays and Fridays, optionally from today", () => {
    expect(postDatesForMonth("2026-11")).toEqual(["2026-11-03","2026-11-06","2026-11-10","2026-11-13","2026-11-17","2026-11-20","2026-11-24","2026-11-27"]);
    expect(postDatesForMonth("2026-11",undefined,"2026-11-18")).toEqual(["2026-11-20","2026-11-24","2026-11-27"]);
  });

  it("groups post dates into Monday-based weeks", () => {
    expect(groupByWeek(["2026-11-03","2026-11-06","2026-11-10"])).toEqual([["2026-11-03","2026-11-06"],["2026-11-10"]]);
  });

  it("prefers seasonal, then hongeo topics, and skips titles already used", () => {
    const topic=(title:string,season="")=>({id:title,title,summary:"요약",reason:"이유",audience:"A" as const,imageBrief:"사진",season,trend:""});
    const picked=pickWeekTopics([topic("같은 회인데 왜 다를까?"),topic("홍어는 왜 수육이랑 먹을까?"),topic("김장날엔 왜 수육을 삶을까?","김장철")],2,new Set());
    expect(picked.map(item=>item.title)).toEqual(["김장날엔 왜 수육을 삶을까?","홍어는 왜 수육이랑 먹을까?"]);
    expect(pickWeekTopics([topic("홍어는 왜 수육이랑 먹을까?")],1,new Set(["홍어는왜수육이랑먹을까"]))).toEqual([]);
    // 두 개를 고를 때 둘 다 홍어회·삼합이면 하나를 다른 메뉴 주제로 바꾼다.
    const varied=pickWeekTopics([topic("과메기는 왜 찬바람이 불면 찾을까?"),topic("홍어는 왜 수육이랑 먹을까?"),topic("김장날엔 왜 수육을 삶을까?","김장철")],2,new Set());
    expect(varied.map(item=>item.title)).toEqual(["김장날엔 왜 수육을 삶을까?","과메기는 왜 찬바람이 불면 찾을까?"]);
  });

  it("rotates design families without repeating one back to back", () => {
    const styles=rotateStyles(10,"2026-11");
    expect(styles).not.toContain("template");
    styles.slice(1).forEach((style,i)=>expect(style).not.toBe(styles[i]));
    expect(new Set(styles).size).toBeGreaterThan(7);
  });
});

describe("month plan route", () => {
  let dir="";
  beforeEach(async()=>{dir=await mkdtemp(path.join(os.tmpdir(),"month-plan-"));process.env.DATA_DIR=dir;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;});
  afterEach(async()=>{await rm(dir,{recursive:true,force:true});delete process.env.DATA_DIR;vi.spyOn(console,"warn").mockRestore();});

  it("fills every post date with a distinct topic, uses the season of that week and saves the plan", async () => {
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    const { GET, POST } = await import("@/app/api/topics/month/route");
    const response=await POST(new Request("http://localhost/api/topics/month",{method:"POST",body:JSON.stringify({month:"2030-11"})}));
    const body=await response.json();
    expect(response.status).toBe(200);
    const items=body.plan.items as Array<{date:string;title:string;season:string;style:string}>;
    expect(items.map(item=>item.date)).toEqual(postDatesForMonth("2030-11").slice(0,items.length));
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(new Set(items.map(item=>item.title)).size).toBe(items.length);
    // 11월 중순 이후 주에는 김장철 주제가 들어간다.
    expect(items.some(item=>item.season==="김장철")).toBe(true);
    expect(body.fallbackWeeks).toBeGreaterThan(0);
    const saved=await (await GET(new Request("http://localhost/api/topics/month?month=2030-11"))).json();
    expect(saved.plan.items).toEqual(items);
  });
});
