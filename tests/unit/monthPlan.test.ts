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
const generateJson=vi.hoisted(()=>vi.fn(async(_prompt:string):Promise<unknown>=>{throw new Error("offline");}));
vi.mock("@/lib/ai/textClient",()=>({createTextClient:()=>({provider:null,generateJson})}));

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

  it("re-planning keeps the slots whose draft was already started",async()=>{
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    const { POST }=await import("@/app/api/topics/month/route");
    const { createDraftRepository }=await import("@/features/drafts/repository");
    const call=()=>POST(new Request("http://localhost/api/topics/month",{method:"POST",body:JSON.stringify({month:"2030-12"})}));
    const first=(await (await call()).json()).plan.items as Array<{date:string;title:string}>;
    const started=first[2];
    const media="55555555-5555-4555-8555-555555555555";
    await createDraftRepository().saveDraft({id:"66666666-6666-4666-8666-666666666666",status:"ready",topic:started.title,audience:"A",media_candidates:[{id:media,source:"photo",file_id:"data:image/png;base64,AQ==",purpose:"instagram-cover"}],selected_media_id:media,selected_media_ids:[media],copy:null,plan_date:started.date,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"});
    const second=await (await call()).json();
    const again=second.plan.items as Array<{date:string;title:string}>;
    expect(again.find(item=>item.date===started.date)?.title).toBe(started.title);
    expect(second.kept).toBe(1);
    expect(again.map(item=>item.date)).toEqual(first.map(item=>item.date));
    expect(new Set(again.map(item=>item.title)).size).toBe(again.length);
  });

  it("rotates menus across months instead of repeating last month's plan",async()=>{
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    const { POST }=await import("@/app/api/topics/month/route");
    const plan=async(month:string)=>((await (await POST(new Request("http://localhost/api/topics/month",{method:"POST",body:JSON.stringify({month})}))).json()).plan.items as Array<{title:string}>).map(item=>item.title);
    const november=await plan("2030-11");
    generateJson.mockClear();
    const december=await plan("2030-12");
    // AI에게 지난달 기획 주제를 "최근 주제"로 알려 준다(예전에는 이번 달 것만 알려 11·12월 기획이 거의 같았다).
    const firstWeekPrompt=String(generateJson.mock.calls[0]?.[0]??"");
    expect(november.some(title=>firstWeekPrompt.includes(title))).toBe(true);
    // 준비된 주제로 채워도 한 메뉴가 한 달에 몰리지 않는다.
    expect(december.filter(title=>title.includes("과메기")).length).toBeLessThanOrEqual(2);
  });
});
