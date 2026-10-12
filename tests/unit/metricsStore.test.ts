// @vitest-environment node
import { mkdtemp,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { createMetricsStore } from "@/features/metrics/store";
import { NAVER_SEED } from "@/features/metrics/naver";

let root="";
beforeEach(async()=>{vi.stubEnv("SUPABASE_URL","");vi.stubEnv("SUPABASE_SECRET_KEY","");root=await mkdtemp(path.join(os.tmpdir(),"metrics-"));});
afterEach(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});

describe("성과 저장소",()=>{
  it("같은 날을 두 번 저장하면 새 값만 병합한다(빈칸은 지우지 않음)",async()=>{
    const store=createMetricsStore(root);
    await store.saveDays("instagram",[{date:"2026-10-11",followers:120}]);
    await store.saveDays("instagram",[{date:"2026-10-11",reach:340}]);
    const [day]=await store.listDays("instagram","2026-10-01","2026-10-31");
    expect(day).toMatchObject({date:"2026-10-11",followers:120,reach:340});
  });
  it("여러 달에 걸친 범위를 날짜순으로 읽는다",async()=>{
    const store=createMetricsStore(root);
    await store.saveDays("ga4",[{date:"2026-10-01",sessions:5,sources:[]},{date:"2026-09-30",sessions:3,sources:[]},{date:"2026-08-01",sessions:1,sources:[]}]);
    const days=await store.listDays("ga4","2026-09-01","2026-10-31");
    expect(days.map(d=>d.date)).toEqual(["2026-09-30","2026-10-01"]);
  });
  it("네이버 기록이 없으면 첫 기록을 돌려주고, 저장한 뒤에는 저장한 것을 돌려준다",async()=>{
    const store=createMetricsStore(root);
    expect(await store.readNaver()).toEqual(NAVER_SEED);
    await store.saveNaver([NAVER_SEED[1]]);
    expect((await store.readNaver()).map(p=>p.id)).toEqual(["2026-09"]);
  });
  it("게시물 목록은 통째로 바꿔 저장하고 최신순으로 읽는다",async()=>{
    const store=createMetricsStore(root);
    expect(await store.readPosts()).toEqual([]);
    await store.savePosts([
      {id:"1",timestamp:"2026-10-01T03:00:00+0000",permalink:"https://instagram.com/p/1",type:"IMAGE",likes:3,fetchedAt:"t"},
      {id:"2",timestamp:"2026-10-10T03:00:00+0000",permalink:"https://instagram.com/p/2",type:"CAROUSEL_ALBUM",likes:9,views:120,fetchedAt:"t"},
    ]);
    expect((await store.readPosts()).map(p=>p.id)).toEqual(["2","1"]);
  });
  it("수집 상태를 저장하고 읽는다",async()=>{
    const store=createMetricsStore(root);
    expect(await store.readState()).toEqual({});
    await store.saveState({instagram:{lastRunOn:"2026-10-12",lastError:null}});
    expect(await store.readState()).toEqual({instagram:{lastRunOn:"2026-10-12",lastError:null}});
  });
});
