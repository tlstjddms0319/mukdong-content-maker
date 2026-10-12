// @vitest-environment node
import { mkdtemp,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
vi.mock("@/features/auth/guard",()=>({ownerApiError:async()=>null}));
import { NAVER_SEED } from "@/features/metrics/naver";
import { toCsv } from "@/features/metrics/csv";

let root="";
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),"metrics-route-"));vi.stubEnv("DATA_DIR",root);vi.stubEnv("SUPABASE_URL","");vi.stubEnv("SUPABASE_SECRET_KEY","");vi.resetModules();});
afterEach(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
const put=(period:unknown)=>new Request("http://x/api/metrics/naver",{method:"PUT",body:JSON.stringify({period})});

describe("네이버 기록 API",()=>{
  it("겹치는 기간은 409로 거절하고, 같은 id는 고친다",async()=>{
    const {PUT,GET}=await import("@/app/api/metrics/naver/route");
    const overlap=await PUT(put({...NAVER_SEED[2],id:"x",start:"2026-09-29"}));
    expect(overlap.status).toBe(409);
    const fixed=await PUT(put({...NAVER_SEED[2],end:"2026-10-31",dataDays:31,placeVisits:700}));
    expect(fixed.status).toBe(200);
    const list=await (await GET()).json();
    expect(list.find((p:{id:string})=>p.id==="2026-10").placeVisits).toBe(700);
  });
  it("잘못된 값은 400",async()=>{
    const {PUT}=await import("@/app/api/metrics/naver/route");
    expect((await PUT(put({...NAVER_SEED[0],dataDays:99}))).status).toBe(400);
  });
});

describe("CSV",()=>{
  it("네이버는 하루 평균·한 달 환산을 함께 쓰고, 비밀값 칸은 없다",()=>{
    const csv=toCsv({instagram:[{date:"2026-10-11",followers:130,fetchedAt:"t"}],ga4:[{date:"2026-10-10",sessions:4,sources:[{sourceMedium:"naver / place",sessions:3}],fetchedAt:"t"}],naver:[NAVER_SEED[0]]});
    const lines=csv.trim().split("\n");
    expect(lines[0]).toBe("채널,기간,지표,값");
    expect(lines).toContain("인스타그램,2026-10-11,팔로워,130");
    expect(lines).toContain("홈페이지,2026-10-10,유입:naver / place,3");
    expect(lines).toContain("네이버 플레이스,2026-08-25~2026-08-31,하루 평균 유입,12.4");
    expect(lines).toContain("네이버 플레이스,2026-08-25~2026-08-31,한 달 환산 유입,385");
    expect(csv).not.toMatch(/token|fetchedAt/i);
  });
  it("게시물별 숫자를 게시물 줄로 쓴다",()=>{
    const csv=toCsv({instagram:[],ga4:[],naver:[],posts:[{id:"m1",timestamp:"2026-10-10T03:00:00+0000",permalink:"https://www.instagram.com/p/x/",type:"IMAGE",caption:["홍어, 한 점","두 번째 줄"].join("\n"),likes:12,views:640,fetchedAt:"t"}]});
    expect(csv).toContain("인스타그램 게시물,\"2026-10-10 홍어, 한 점\",좋아요,12");
    expect(csv).toContain("인스타그램 게시물,\"2026-10-10 홍어, 한 점\",조회,640");
  });
});
