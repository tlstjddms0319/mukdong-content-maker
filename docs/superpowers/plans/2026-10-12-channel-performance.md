# 채널 성과 모으기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인스타그램 인사이트와 GA4 숫자를 날마다 자동으로 모으고, 네이버 플레이스 기간 기록을 함께 저장해 '성과' 화면과 CSV로 보여 준다.

**Architecture:** 새 모듈 `src/features/metrics/`가 수집·저장·계산을 맡는다.
- 저장: 채널별 월 파일(`metrics/<channel>/YYYY-MM.json`)에 둔다. Supabase가 설정돼 있으면 거기에, 없으면 `DATA_DIR`에 쓴다.
- 수집: 기존 스케줄러 루프가 1분마다 `runDailyMetricsIfDue()`를 부르고, 채널별로 하루 한 번만 실제로 수집한다.
- 화면: 서버 컴포넌트 `/performance`가 저장된 값을 읽어 SVG 그래프와 표로 보여 준다.

**Tech Stack:** Next.js(App Router), TypeScript, zod, vitest(jsdom, fetch 스텁), Node `crypto`(GA4 JWT 서명). 새 npm 패키지는 넣지 않는다.

**Spec:** `docs/superpowers/specs/2026-10-12-channel-performance-design.md`

## Global Constraints

- 새 의존성 없음. 그래프는 SVG로 직접 그린다.
- 날짜는 한국 시간(Asia/Seoul) `YYYY-MM-DD` 문자열이다.
- API가 주지 않은 지표는 0이 아니라 빈칸(`undefined`)이다.
- 비밀값(액세스 토큰, 서비스 계정 키)은 로그·응답·CSV에 나오지 않는다.
- 네이버 비교는 `placeVisits ÷ dataDays`(하루 평균)와 `하루 평균 × 그달 일수`(한 달 환산)를 쓴다. 네이버 화면의 '일 평균'·'%' 값은 쓰지 않는다.
- 네이버 키워드·채널·성별·연령은 비율로만 기록한다. 유입 수를 곱해 횟수로 만들지 않는다.
- 사장님이 직접 적은 게시물 성과(`source` 없음 또는 `"manual"`)는 자동 수집이 덮어쓰지 않는다.
- 수집 실패는 게시·토큰 갱신을 막지 않는다. 채널마다 따로 실패한다.
- 인스타그램 인사이트 권한 이름: `instagram_business_manage_insights`.
- GA4 속성 ID 기본값 `555483214`, 수집 시작일 기본값 `2026-09-07`(`GA4_START_DATE`로 바꿀 수 있음).

## Review Focus

1. **`profile_views`처럼 지원되지 않는 지표가 하나 섞인 요청**: 한꺼번에 요청한 것이 400으로 실패해도 나머지 지표는 저장돼야 한다. 지표별 재시도로 막는다(Task 3 테스트).
2. **같은 날 두 번 저장**: 팔로워 수(오늘)와 일별 인사이트(나중에 채움)가 서로를 지우면 안 된다. 병합 저장으로 막는다(Task 2 테스트).
3. **연결은 있지만 예전 권한뿐인 계정**: 수집을 건너뛰고 "다시 연결" 안내가 나와야 하며, 오류로 반복 실패하면 안 된다(Task 3, Task 7 테스트).
4. **네이버 기간이 겹치는 기록**: 같은 날짜가 두 기록에 들어가면 비교가 틀어진다. 저장 전에 거절한다. 같은 id를 고칠 때는 허용한다(Task 1, Task 6 테스트).
5. **서버가 며칠 잠든 뒤 깨어남**: 인스타그램은 최근 30일 안에서만, GA4는 마지막 기록 이후 전부 채워야 한다. 하루에 한 번만 돌아야 한다(Task 3, Task 4, Task 5 테스트).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/features/metrics/dates.ts` | 한국 날짜 계산(오늘, 더하기, 범위, 그달 일수) |
| `src/features/metrics/naver.ts` | 네이버 기간 스키마, 계산(하루 평균·한 달 환산·20~30대·새 키워드·겹침), 첫 기록 |
| `src/features/metrics/store.ts` | 인스타그램·GA4 일별 기록, 네이버 기간, 수집 상태 저장(월 파일, 병합) |
| `src/features/metrics/instagramInsights.ts` | Meta 인사이트 호출, 인스타그램 수집 |
| `src/features/metrics/ga4.ts` | 서비스 계정 JWT, runReport, GA4 수집 |
| `src/features/metrics/collect.ts` | 하루 한 번 수집 판단, 상태 기록 |
| `src/features/metrics/csv.ts` | CSV 만들기 |
| `src/app/api/metrics/collect/route.ts` | 지금 수집(사장님만) |
| `src/app/api/metrics/naver/route.ts` | 네이버 기록 조회·추가·고치기·지우기 |
| `src/app/api/metrics/export/route.ts` | CSV 내려받기 |
| `src/app/performance/page.tsx` | 성과 화면 |
| `src/components/performance/LineChart.tsx` | SVG 선 그래프 |
| `src/components/performance/NaverPeriodForm.tsx` | 네이버 기록 입력 폼(클라이언트) |
| `src/components/performance/ChannelCards.tsx` | 인스타그램·홈페이지·네이버 카드 |
| 수정 `src/features/instagram/oauth.ts`, `schema.ts`, `repository.ts` | 인사이트 권한, 공개 연결 정보에 `insights` |
| 수정 `src/features/drafts/performance.ts`, `src/app/api/drafts/route.ts` | 성과 `source` |
| 수정 `src/features/instagram/schedulerRuntime.ts` | 루프에서 수집 호출 |
| 수정 `src/components/wizard/WizardShell.tsx` | '성과' 메뉴 |
| 수정 `src/components/settings/InstagramConnectionCard.tsx`, `src/components/drafts/PerformanceForm.tsx` | 다시 연결 안내, 자동 성과 표시 |
| 수정 `render.yaml`, 새 `docs/PERFORMANCE_METRICS.ko.md` | 환경변수, 설정 안내 |

---

### Task 1: 날짜 도우미와 네이버 기간 계산

**Files:**
- Create: `src/features/metrics/dates.ts`, `src/features/metrics/naver.ts`
- Test: `tests/unit/naverMetrics.test.ts`

**Interfaces:**
- Produces:
  - `kstToday(now?:Date):string`, `addDays(date:string,n:number):string`, `dateRange(from:string,to:string):string[]`, `daysInMonth(date:string):number`, `kstDateOf(iso:string):string`, `diffDays(a:string,b:string):number`(b−a)
  - `NaverPeriodSchema`, `type NaverPeriod`, `dailyAverage(p)`, `monthEquivalent(p)`, `youngShare(p):number|undefined`, `newKeywords(p,prev?):string[]`, `findOverlap(list,p):NaverPeriod|undefined`, `NAVER_SEED:NaverPeriod[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/naverMetrics.test.ts
import { describe,expect,it } from "vitest";
import { addDays,dateRange,daysInMonth,diffDays,kstToday } from "@/features/metrics/dates";
import { NAVER_SEED,NaverPeriodSchema,dailyAverage,findOverlap,monthEquivalent,newKeywords,youngShare } from "@/features/metrics/naver";

const [aug,sep,oct]=NAVER_SEED;

describe("한국 날짜",()=>{
  it("UTC 15시 이후는 한국 다음 날이다",()=>expect(kstToday(new Date("2026-10-11T15:30:00Z"))).toBe("2026-10-12"));
  it("더하기·범위·일수·차이",()=>{
    expect(addDays("2026-09-30",1)).toBe("2026-10-01");
    expect(dateRange("2026-08-30","2026-09-01")).toEqual(["2026-08-30","2026-08-31","2026-09-01"]);
    expect(daysInMonth("2026-02-10")).toBe(28);
    expect(diffDays("2026-10-01","2026-10-12")).toBe(11);
  });
});

describe("네이버 기간 계산",()=>{
  it("숫자가 있는 날로 하루 평균을 내고 그달 일수로 늘린다",()=>{
    expect(dailyAverage(aug)).toBe(12.4);
    expect(monthEquivalent(aug)).toBe(385);
    expect(dailyAverage(sep)).toBe(14.8);
    expect(monthEquivalent(sep)).toBe(444);
    expect(dailyAverage(oct)).toBe(23.6);
    expect(monthEquivalent(oct)).toBe(733);
  });
  it("20~30대 비율은 성별 비율로 가중한 어림값이다",()=>{
    expect(youngShare(sep)).toBe(41.8);
    expect(youngShare({...sep,gender:undefined})).toBeUndefined();
  });
  it("앞 기간에 없던 키워드를 찾는다",()=>{
    expect(newKeywords(oct,sep)).toEqual(["먹골홍어","묵동홍어집","석계역삼합"]);
    expect(newKeywords(aug)).toEqual([]);
  });
  it("겹치는 기간을 찾되 같은 id는 빼고 본다",()=>{
    expect(findOverlap(NAVER_SEED,{...oct,id:"new",start:"2026-09-30",end:"2026-10-02"})?.id).toBe(sep.id);
    expect(findOverlap(NAVER_SEED,{...oct,end:"2026-10-31"})).toBeUndefined();
  });
  it("비율은 0~100, 키워드는 5개까지, 숫자 있는 날은 기간 일수 이하",()=>{
    expect(NaverPeriodSchema.safeParse({...sep,keywords:[...sep.keywords,{name:"x",percent:1}]}).success).toBe(false);
    expect(NaverPeriodSchema.safeParse({...sep,gender:{male:120,female:-20}}).success).toBe(false);
    expect(NaverPeriodSchema.safeParse({...aug,dataDays:8}).success).toBe(false);
    for(const seed of NAVER_SEED)expect(NaverPeriodSchema.safeParse(seed).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/naverMetrics.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Write `dates.ts`**

```ts
// 성과 기록은 한국 날짜(YYYY-MM-DD)로 묶는다. 서버(Render)는 UTC라 직접 바꾼다.
const DAY=86_400_000;
const at=(date:string)=>Date.parse(`${date}T00:00:00Z`);
const fmt=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const kstDateOf=(iso:string|Date)=>fmt(new Date(iso).getTime()+9*3_600_000);
export const kstToday=(now=new Date())=>kstDateOf(now);
export const addDays=(date:string,n:number)=>fmt(at(date)+n*DAY);
export const diffDays=(a:string,b:string)=>Math.round((at(b)-at(a))/DAY);
export function dateRange(from:string,to:string){const out:string[]=[];for(let d=from;d<=to;d=addDays(d,1))out.push(d);return out;}
export function daysInMonth(date:string){const [y,m]=date.split("-").map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
// 한국 0시의 유닉스 초. Meta 인사이트 since/until에 쓴다.
export const kstStartSeconds=(date:string)=>Math.floor(Date.parse(`${date}T00:00:00+09:00`)/1000);
export const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(at(value));
```

- [ ] **Step 4: Write `naver.ts`**

```ts
import { z } from "zod";
import { daysInMonth,diffDays } from "./dates";

// 네이버 스마트플레이스·블로그 통계는 공식 API가 없어 Claude가 통계 화면을 읽어 기간 단위로 기록한다.
// 네이버 화면의 '일 평균'은 달력 일수로 나눠 일부만 있는 달(예: 8/25부터 잡힌 8월)을 작게 보이게 하므로 쓰지 않는다.
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const percent=z.number().min(0).max(100);
const count=z.number().int().min(0).max(10_000_000);
const share=z.object({name:z.string().trim().min(1).max(40),percent});
const ages=z.array(percent).length(7); // 10대~70대, 성별 안에서의 비율

export const NaverPeriodSchema=z.object({
  id:z.string().min(1).max(60),
  start:day,end:day,
  dataDays:z.number().int().min(1),
  placeVisits:count,
  channels:z.array(z.object({name:z.string().trim().min(1).max(40),count:count.optional(),percent:percent.optional()})).max(10),
  keywords:z.array(share).max(5),
  gender:z.object({male:percent,female:percent}).optional(),
  ageMale:ages.optional(),ageFemale:ages.optional(),
  peakHours:z.string().max(40).optional(),
  reviews:count.optional(),
  blogViews:count.optional(),blogVisitors:count.optional(),
  checkedOn:day,
  note:z.string().max(300).optional(),
}).refine(p=>p.start<=p.end,{message:"끝나는 날이 시작일보다 빨라요."})
  .refine(p=>p.dataDays<=diffDays(p.start,p.end)+1,{message:"숫자가 있는 날이 기간 일수보다 많아요."});
export type NaverPeriod=z.infer<typeof NaverPeriodSchema>;

const round1=(n:number)=>Math.round(n*10)/10;
export const dailyAverage=(p:NaverPeriod)=>round1(p.placeVisits/p.dataDays);
export const monthEquivalent=(p:NaverPeriod)=>Math.round(p.placeVisits/p.dataDays*daysInMonth(p.start));

// 전체 중 20~30대 비율(%) 어림값. 네이버 연령 비율은 성별 안의 비율이라 성별 비율로 가중한다.
export function youngShare(p:NaverPeriod){
  if(!p.gender||!p.ageMale||!p.ageFemale)return undefined;
  return round1((p.gender.male*(p.ageMale[1]+p.ageMale[2])+p.gender.female*(p.ageFemale[1]+p.ageFemale[2]))/100);
}

export function newKeywords(p:NaverPeriod,previous?:NaverPeriod){
  if(!previous)return [];
  const before=new Set(previous.keywords.map(k=>k.name));
  return p.keywords.map(k=>k.name).filter(name=>!before.has(name)).sort((a,b)=>a.localeCompare(b,"ko"));
}

export const findOverlap=(list:NaverPeriod[],p:NaverPeriod)=>list.find(o=>o.id!==p.id&&o.start<=p.end&&p.start<=o.end);

// 2026-10-12 사용자 화면에서 확인한 첫 기록. 10월은 11일 치 중간값이며 11월 초에 덮어쓴다.
export const NAVER_SEED:NaverPeriod[]=[
  {id:"2026-08",start:"2026-08-25",end:"2026-08-31",dataDays:7,placeVisits:87,reviews:0,checkedOn:"2026-10-12",peakHours:"17~18시",
    channels:[{name:"네이버지도",count:58,percent:66.67},{name:"네이버검색",count:29,percent:33.33}],
    keywords:[{name:"묵동홍어마을",percent:33.33},{name:"묵동홍어",percent:33.33},{name:"홍어마을노원",percent:12.5},{name:"먹골홍어",percent:12.5},{name:"홍어먹골",percent:8.33}],
    gender:{male:65,female:35},ageMale:[0,22,24,17,26,11,0],ageFemale:[0,16,36,32,16,0,0],
    note:"플레이스 유입은 8월 25일부터 잡혔다."},
  {id:"2026-09",start:"2026-09-01",end:"2026-09-30",dataDays:30,placeVisits:444,reviews:1,checkedOn:"2026-10-12",peakHours:"15시 (15~18시 높음)",
    channels:[{name:"네이버지도",count:259,percent:58.33},{name:"네이버검색",count:177,percent:39.86},{name:"네이버 블로그",count:6,percent:1.35},{name:"네이버 모바일메인",count:1,percent:0.23},{name:"네이버 MY플레이스",count:1,percent:0.23}],
    keywords:[{name:"묵동홍어마을",percent:49.5},{name:"묵동홍어",percent:26.73},{name:"먹골역홍어",percent:8.91},{name:"홍어본가",percent:7.92},{name:"홍어마을",percent:6.93}],
    gender:{male:64,female:36},ageMale:[0,19,26,25,21,6,4],ageFemale:[0,16,20,27,24,13,0]},
  {id:"2026-10",start:"2026-10-01",end:"2026-10-11",dataDays:11,placeVisits:260,reviews:0,checkedOn:"2026-10-12",peakHours:"18시 (15~19시 높음)",
    channels:[{name:"네이버지도",count:159,percent:61.15},{name:"네이버검색",count:100,percent:38.46},{name:"네이버 MY플레이스",count:1,percent:0.38}],
    keywords:[{name:"묵동홍어마을",percent:56.86},{name:"먹골홍어",percent:15.69},{name:"묵동홍어",percent:11.76},{name:"묵동홍어집",percent:9.8},{name:"석계역삼합",percent:5.88}],
    gender:{male:62,female:38},ageMale:[0,19,16,22,32,8,3],ageFemale:[0,20,5,32,37,5,1],
    note:"10월 11일까지의 중간값."},
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/naverMetrics.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/metrics/dates.ts src/features/metrics/naver.ts tests/unit/naverMetrics.test.ts
git commit -m "성과: 한국 날짜 도우미와 네이버 기간 계산·첫 기록"
```

---

### Task 2: 성과 저장소

**Files:**
- Create: `src/features/metrics/store.ts`
- Test: `tests/unit/metricsStore.test.ts`

**Interfaces:**
- Consumes: `NaverPeriodSchema`, `NAVER_SEED`(Task 1)
- Produces:
  - `InstagramDaySchema`/`type InstagramDay` = `{date, followers?, mediaCount?, reach?, views?, accountsEngaged?, totalInteractions?, profileViews?, websiteClicks?, fetchedAt}`
  - `Ga4DaySchema`/`type Ga4Day` = `{date, activeUsers?, sessions?, pageViews?, phoneClicks?, directionsClicks?, sources:{sourceMedium,sessions}[], fetchedAt}`
  - `type ChannelState={lastRunOn?:string;lastSuccessAt?:string;lastError?:string|null;filledThrough?:string}`, `type MetricsState={instagram?:ChannelState;ga4?:ChannelState}`
  - `createMetricsStore(root?)` → `{saveDays(channel:"instagram"|"ga4", days:Partial-with-date[]), listDays(channel,from,to), readNaver(), saveNaver(list), readState(), saveState(state)}`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/metricsStore.test.ts
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
  it("수집 상태를 저장하고 읽는다",async()=>{
    const store=createMetricsStore(root);
    expect(await store.readState()).toEqual({});
    await store.saveState({instagram:{lastRunOn:"2026-10-12",lastError:null}});
    expect(await store.readState()).toEqual({instagram:{lastRunOn:"2026-10-12",lastError:null}});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/metricsStore.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Write `store.ts`**

```ts
import { mkdir,readFile,rename,writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { remoteStore } from "@/lib/files/remoteStore";
import { NAVER_SEED,NaverPeriodSchema,type NaverPeriod } from "./naver";

// 채널별 일별 기록은 한 달에 한 파일(metrics/<channel>/YYYY-MM.json)로 둔다. 화면이 몇 달 치를 읽을 때 파일 수가 적다.
// Supabase가 설정돼 있으면 그쪽에 둔다(Render의 /tmp는 재시작 때 지워진다).
const n=z.number().min(0).optional();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const InstagramDaySchema=z.object({date:day,followers:n,mediaCount:n,reach:n,views:n,accountsEngaged:n,totalInteractions:n,profileViews:n,websiteClicks:n,fetchedAt:z.string()});
export const Ga4DaySchema=z.object({date:day,activeUsers:n,sessions:n,pageViews:n,phoneClicks:n,directionsClicks:n,sources:z.array(z.object({sourceMedium:z.string(),sessions:z.number().min(0)})).default([]),fetchedAt:z.string()});
export type InstagramDay=z.infer<typeof InstagramDaySchema>;
export type Ga4Day=z.infer<typeof Ga4DaySchema>;
const ChannelStateSchema=z.object({lastRunOn:day.optional(),lastSuccessAt:z.string().optional(),lastError:z.string().nullable().optional(),filledThrough:day.optional()});
const StateSchema=z.object({instagram:ChannelStateSchema.optional(),ga4:ChannelStateSchema.optional()});
export type ChannelState=z.infer<typeof ChannelStateSchema>;
export type MetricsState=z.infer<typeof StateSchema>;
type Channel="instagram"|"ga4";
type DayOf<C extends Channel>=C extends "instagram"?InstagramDay:Ga4Day;
type DayInput<C extends Channel>=Partial<Omit<DayOf<C>,"date">>&{date:string};
const schemaOf={instagram:InstagramDaySchema,ga4:Ga4DaySchema};

export function createMetricsStore(root=process.env.DATA_DIR??path.join(process.cwd(),"data")){
  const remote=remoteStore();
  const local=(name:string)=>path.join(root,...name.split("/"));
  async function read(name:string){
    if(remote)return remote.read(name);
    try{return await readFile(local(name),"utf8");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
  }
  async function write(name:string,value:unknown){
    const text=JSON.stringify(value);
    if(remote)return remote.write(name,text,"application/json");
    const target=local(name);await mkdir(path.dirname(target),{recursive:true});
    const temporary=`${target}.${randomUUID()}.tmp`;await writeFile(temporary,text,"utf8");await rename(temporary,target);
  }
  const monthName=(channel:Channel,month:string)=>`metrics/${channel}/${month}.json`;
  async function readMonth<C extends Channel>(channel:C,month:string):Promise<Record<string,DayOf<C>>>{
    const raw=await read(monthName(channel,month));
    if(!raw)return {};
    const parsed=JSON.parse(raw) as Record<string,unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([date,value])=>[date,schemaOf[channel].parse(value)])) as Record<string,DayOf<C>>;
  }
  return {
    // 같은 날 기록에 새 값만 덮어쓴다. undefined 칸은 기존 값을 지우지 않는다.
    async saveDays<C extends Channel>(channel:C,days:DayInput<C>[]){
      const byMonth=new Map<string,DayInput<C>[]>();
      for(const d of days)byMonth.set(d.date.slice(0,7),[...(byMonth.get(d.date.slice(0,7))??[]),d]);
      const fetchedAt=new Date().toISOString();
      for(const [month,list] of byMonth){
        const current=await readMonth(channel,month);
        for(const d of list){
          const defined=Object.fromEntries(Object.entries(d).filter(([,v])=>v!==undefined));
          current[d.date]=schemaOf[channel].parse({...current[d.date],...defined,fetchedAt}) as DayOf<C>;
        }
        await write(monthName(channel,month),current);
      }
    },
    async listDays<C extends Channel>(channel:C,from:string,to:string):Promise<DayOf<C>[]>{
      const months:string[]=[];
      for(let m=from.slice(0,7);m<=to.slice(0,7);){months.push(m);const [y,mo]=m.split("-").map(Number);m=mo===12?`${y+1}-01`:`${y}-${String(mo+1).padStart(2,"0")}`;}
      const all=(await Promise.all(months.map(m=>readMonth(channel,m)))).flatMap(o=>Object.values(o));
      return all.filter(d=>d.date>=from&&d.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
    },
    async readNaver():Promise<NaverPeriod[]>{
      const raw=await read("metrics/naver/periods.json");
      if(!raw)return NAVER_SEED;
      return z.array(NaverPeriodSchema).parse(JSON.parse(raw));
    },
    async saveNaver(list:NaverPeriod[]){
      const parsed=z.array(NaverPeriodSchema).parse(list).sort((a,b)=>a.start.localeCompare(b.start));
      await write("metrics/naver/periods.json",parsed);return parsed;
    },
    async readState():Promise<MetricsState>{const raw=await read("metrics/state.json");return raw?StateSchema.parse(JSON.parse(raw)):{};},
    async saveState(state:MetricsState){await write("metrics/state.json",StateSchema.parse(state));},
  };
}
export type MetricsStore=ReturnType<typeof createMetricsStore>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/metricsStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/metrics/store.ts tests/unit/metricsStore.test.ts
git commit -m "성과: 월 파일 단위 저장소(병합 저장·네이버 첫 기록·수집 상태)"
```

---

### Task 3: 인스타그램 인사이트 권한과 수집

**Files:**
- Modify: `src/features/instagram/oauth.ts:4`, `src/features/instagram/schema.ts:3,27`, `src/features/instagram/repository.ts`(`toPublicConnection`)
- Modify: `src/features/drafts/performance.ts`(`PerformanceSchema`에 `source`), `src/app/api/drafts/route.ts:48,65`
- Create: `src/features/metrics/instagramInsights.ts`
- Test: `tests/unit/instagramInsights.test.ts`. 기존 `tests/unit/instagramOAuth.test.ts`에서 scope 기대값이 바뀌면 함께 고친다.

**Interfaces:**
- Consumes: `kstToday, addDays, dateRange, kstDateOf, diffDays, kstStartSeconds`(Task 1), `MetricsStore`(Task 2)
- Produces:
  - `INSIGHTS_SCOPE="instagram_business_manage_insights"`
  - `createInsightsClient(fetcher?)` → `{accountSnapshot(userId,token), dayInsights(userId,token,date), mediaInsights(mediaId,token)}`
  - `collectInstagram(deps):Promise<{skipped?:"not-connected"|"needs-reconnect"|"expired";daysFilled:number;mediaUpdated:number;filledThrough?:string}>`
  - `PublicInstagramConnection.insights?:boolean`
  - `Performance.source?:"manual"|"instagram"`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/instagramInsights.test.ts
// @vitest-environment node
import { describe,expect,it,vi } from "vitest";
import { collectInstagram,createInsightsClient,INSIGHTS_SCOPE } from "@/features/metrics/instagramInsights";
import type { InstagramDay } from "@/features/metrics/store";

const ok=(body:unknown)=>({ok:true,status:200,json:async()=>body}) as Response;
const bad=(status=400)=>({ok:false,status,json:async()=>({error:{message:"metric not supported"}})}) as Response;
const conn=(scopes:string[]=["instagram_business_basic","instagram_business_content_publish",INSIGHTS_SCOPE])=>({instagramUserId:"ig1",username:"mukdong",accessToken:"secret-token",expiresAt:"2027-01-01T00:00:00.000Z",scopes,connectedAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z"});

describe("인사이트 호출",()=>{
  it("계정 인사이트를 한 번에 요청하고 total_value를 읽는다. 응답에 없는 지표는 빈칸",async()=>{
    const fetcher=vi.fn().mockResolvedValue(ok({data:[{name:"reach",total_value:{value:340}},{name:"views",total_value:{value:900}}]}));
    const value=await createInsightsClient(fetcher).dayInsights("ig1","t","2026-10-11");
    expect(value).toEqual({reach:340,views:900});
    const url=new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("metric_type")).toBe("total_value");
    expect(url.searchParams.get("since")).toBe(String(Date.parse("2026-10-11T00:00:00+09:00")/1000));
  });
  it("한꺼번에 요청이 400이면 지표별로 다시 요청해 되는 것만 저장한다",async()=>{
    const fetcher=vi.fn(async(input:string)=>{
      const metric=new URL(input).searchParams.get("metric")!;
      if(metric.includes(","))return bad();
      if(metric==="profile_views")return bad();
      return ok({data:[{name:metric,total_value:{value:7}}]});
    });
    const value=await createInsightsClient(fetcher as unknown as typeof fetch).dayInsights("ig1","t","2026-10-11");
    expect(value.profileViews).toBeUndefined();
    expect(value.reach).toBe(7);
  });
});

function fakeStore(){
  const saved:Partial<InstagramDay>[]=[];
  return {saved,store:{saveDays:vi.fn(async(_c:string,days:Partial<InstagramDay>[])=>{saved.push(...days);})}};
}
const client=()=>({accountSnapshot:vi.fn().mockResolvedValue({followers:130,mediaCount:12}),dayInsights:vi.fn().mockResolvedValue({reach:10}),mediaInsights:vi.fn().mockResolvedValue({likes:5,comments:1,saves:2,shares:0,reach:80})});
const noDrafts={listDraftSummaries:async()=>[],readDraft:async()=>null,saveDraft:vi.fn()};

describe("인스타그램 수집",()=>{
  it("예전 권한뿐이면 건너뛴다",async()=>{
    const {store}=fakeStore();
    const result=await collectInstagram({connection:conn(["instagram_business_basic"]),store,client:client(),drafts:noDrafts,readPublication:async()=>null,today:"2026-10-12",filledThrough:undefined});
    expect(result.skipped).toBe("needs-reconnect");
    expect(store.saveDays).not.toHaveBeenCalled();
  });
  it("팔로워는 오늘 기록에, 인사이트는 최근 30일 안 빠진 날(마지막 이틀은 다시)에 채운다",async()=>{
    const {store,saved}=fakeStore();const c=client();
    const first=await collectInstagram({connection:conn(),store,client:c,drafts:noDrafts,readPublication:async()=>null,today:"2026-10-12",filledThrough:undefined});
    expect(saved[0]).toMatchObject({date:"2026-10-12",followers:130,mediaCount:12});
    expect(c.dayInsights.mock.calls[0][2]).toBe("2026-09-12");
    expect(first.daysFilled).toBe(30);
    expect(first.filledThrough).toBe("2026-10-11");
    c.dayInsights.mockClear();
    await collectInstagram({connection:conn(),store,client:c,drafts:noDrafts,readPublication:async()=>null,today:"2026-10-14",filledThrough:"2026-10-11"});
    expect(c.dayInsights.mock.calls.map(call=>call[2])).toEqual(["2026-10-10","2026-10-11","2026-10-12","2026-10-13"]);
  });
  it("올린 게시물 성과를 채우되 직접 적은 성과는 덮어쓰지 않는다",async()=>{
    const {store}=fakeStore();const c=client();
    const drafts={
      listDraftSummaries:async()=>[{id:"a"},{id:"b"}] as never,
      readDraft:async(id:string)=>({id,performance:id==="b"?{likes:1,comments:0,saves:0,shares:0,recorded_at:"2026-10-10T00:00:00.000Z"}:undefined}) as never,
      saveDraft:vi.fn(async(value:unknown)=>value),
    };
    const pub={status:"published",mediaId:"m1",publishedAt:"2026-10-10T03:00:00.000Z"};
    const result=await collectInstagram({connection:conn(),store,client:c,drafts,readPublication:async()=>pub as never,today:"2026-10-12",filledThrough:"2026-10-11"});
    expect(result.mediaUpdated).toBe(1);
    expect(drafts.saveDraft.mock.calls[0][0]).toMatchObject({id:"a",performance:{likes:5,comments:1,saves:2,shares:0,reach:80,posted_on:"2026-10-10",source:"instagram"}});
  });
  it("8일 넘은 게시물은 7일마다, 90일 넘으면 가져오지 않는다",async()=>{
    const {store}=fakeStore();const c=client();
    const drafts={listDraftSummaries:async()=>[{id:"a"}] as never,readDraft:async(id:string)=>({id}) as never,saveDraft:vi.fn(async(v:unknown)=>v)};
    const at=(date:string)=>async()=>({status:"published",mediaId:"m",publishedAt:`${date}T03:00:00.000Z`}) as never;
    const run=(published:string)=>collectInstagram({connection:conn(),store,client:c,drafts,readPublication:at(published),today:"2026-10-12",filledThrough:"2026-10-11"});
    expect((await run("2026-10-02")).mediaUpdated).toBe(0); // 10일째
    expect((await run("2026-09-28")).mediaUpdated).toBe(1); // 14일째
    expect((await run("2026-07-01")).mediaUpdated).toBe(0); // 103일째
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/instagramInsights.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Add the scope and source fields**

`src/features/instagram/oauth.ts:4`:
```ts
export const INSTAGRAM_SCOPES=["instagram_business_basic","instagram_business_content_publish","instagram_business_manage_insights"] as const;
```
`src/features/instagram/schema.ts:3`:
```ts
export const InstagramScopeSchema=z.enum(["instagram_business_basic","instagram_business_content_publish","instagram_business_manage_insights"]);
```
`schema.ts` 마지막 줄의 `PublicInstagramConnection`에 `insights?:boolean`을 더한다. `repository.ts`의 `toPublicConnection` 반환값에 `insights:value.scopes.includes("instagram_business_manage_insights")`를 더한다.

`src/features/drafts/performance.ts`의 `PerformanceSchema`에 다음을 더한다.
```ts
  source:z.enum(["manual","instagram"]).optional(),         // 없으면 직접 적은 값. instagram이면 자동 수집 값
```
`src/app/api/drafts/route.ts:48`은 `PerformanceSchema.omit({recorded_at:true,source:true})`로 바꾼다. 65행은 `{...recorded.data.performance,source:"manual" as const,recorded_at:new Date().toISOString()}`로 바꾼다.

- [ ] **Step 4: Write `instagramInsights.ts`**

```ts
import type { InstagramConnection,Publication } from "@/features/instagram/schema";
import type { Draft } from "@/features/drafts/schema";
import type { Performance } from "@/features/drafts/performance";
import { addDays,dateRange,diffDays,kstDateOf,kstStartSeconds } from "./dates";
import type { InstagramDay,MetricsStore } from "./store";

export const INSIGHTS_SCOPE="instagram_business_manage_insights";
// impressions는 없어진 지표라 묻지 않는다. profile_views는 문서마다 지원 여부가 달라, 실패하면 그 칸만 비운다.
const ACCOUNT_METRICS={reach:"reach",views:"views",accounts_engaged:"accountsEngaged",total_interactions:"totalInteractions",profile_views:"profileViews",website_clicks:"websiteClicks"} as const;
const MEDIA_METRICS={likes:"likes",comments:"comments",saved:"saves",shares:"shares",reach:"reach",views:"views"} as const;
type MediaValues=Partial<Record<(typeof MEDIA_METRICS)[keyof typeof MEDIA_METRICS],number>>;
const BACKFILL_DAYS=30;

class InsightsHttpError extends Error{constructor(readonly status:number){super(`Instagram 인사이트 요청 실패(HTTP ${status})`);}}

export function createInsightsClient(fetcher:typeof fetch=fetch,version=process.env.INSTAGRAM_API_VERSION??"v24.0"){
  async function get(pathname:string,params:Record<string,string>){
    const url=new URL(`https://graph.instagram.com/${version}/${pathname}`);url.search=new URLSearchParams(params).toString();
    const response=await fetcher(url.toString(),{cache:"no-store"});
    if(!response.ok)throw new InsightsHttpError(response.status);
    return response.json() as Promise<Record<string,unknown>>;
  }
  const valueOf=(item:{total_value?:{value?:unknown};values?:{value?:unknown}[]})=>{const v=item.total_value?.value??item.values?.at(-1)?.value;return typeof v==="number"?v:undefined;};
  // 한 번에 묻고, 400이면(지원 안 되는 지표가 섞임) 지표마다 따로 물어 되는 것만 남긴다.
  async function insights<M extends Record<string,string>>(pathname:string,metrics:M,extra:Record<string,string>,token:string){
    const read=(body:Record<string,unknown>)=>{
      const out:Partial<Record<M[keyof M],number>>={};
      for(const item of (Array.isArray(body.data)?body.data:[]) as {name?:string}[]){
        const key=metrics[item.name as keyof M];const value=valueOf(item as never);
        if(key&&value!==undefined)out[key as M[keyof M]]=value;
      }
      return out;
    };
    try{return read(await get(pathname,{...extra,metric:Object.keys(metrics).join(","),access_token:token}));}
    catch(error){
      if(!(error instanceof InsightsHttpError)||error.status!==400)throw error;
      const parts=await Promise.all(Object.keys(metrics).map(metric=>get(pathname,{...extra,metric,access_token:token}).then(read).catch(()=>({}))));
      return Object.assign({},...parts) as Partial<Record<M[keyof M],number>>;
    }
  }
  return {
    async accountSnapshot(userId:string,token:string){
      const body=await get(userId,{fields:"followers_count,media_count",access_token:token});
      return {followers:typeof body.followers_count==="number"?body.followers_count:undefined,mediaCount:typeof body.media_count==="number"?body.media_count:undefined};
    },
    dayInsights(userId:string,token:string,date:string){
      return insights(`${userId}/insights`,ACCOUNT_METRICS,{period:"day",metric_type:"total_value",since:String(kstStartSeconds(date)),until:String(kstStartSeconds(addDays(date,1)))},token) as Promise<Partial<InstagramDay>>;
    },
    mediaInsights(mediaId:string,token:string){return insights(`${mediaId}/insights`,MEDIA_METRICS,{},token) as Promise<MediaValues>;},
  };
}
export type InsightsClient=ReturnType<typeof createInsightsClient>;

type DraftAccess={listDraftSummaries:()=>Promise<{id:string}[]>;readDraft:(id:string)=>Promise<Draft|null>;saveDraft:(value:Draft,options?:{thumbnail?:boolean})=>Promise<unknown>};
export type CollectInstagramDeps={
  connection:InstagramConnection|null;store:Pick<MetricsStore,"saveDays">;client:InsightsClient;
  drafts:DraftAccess;readPublication:(draftId:string)=>Promise<Publication|null>;
  today:string;filledThrough:string|undefined;now?:()=>Date;
  withLock?:<T>(id:string,work:()=>Promise<T>)=>Promise<T>;
};

export async function collectInstagram(deps:CollectInstagramDeps){
  const {connection,today}=deps;
  if(!connection)return {skipped:"not-connected" as const,daysFilled:0,mediaUpdated:0};
  if(!connection.scopes.includes(INSIGHTS_SCOPE))return {skipped:"needs-reconnect" as const,daysFilled:0,mediaUpdated:0};
  if(Date.parse(connection.expiresAt)<=(deps.now??(()=>new Date()))().getTime())return {skipped:"expired" as const,daysFilled:0,mediaUpdated:0};
  const {instagramUserId:id,accessToken:token}=connection;
  // 팔로워 수는 그 시점의 값이라 지난 날로 채울 수 없다. 오늘 기록에 남긴다.
  await deps.store.saveDays("instagram",[{date:today,...await deps.client.accountSnapshot(id,token)}]);
  // 마지막 이틀은 숫자가 늦게 확정되므로 다시 가져온다. Meta는 최근 30일만 준다.
  const earliest=addDays(today,-BACKFILL_DAYS),yesterday=addDays(today,-1);
  const from=deps.filledThrough?[addDays(deps.filledThrough,-1),earliest].sort().at(-1)!:earliest;
  const days=from<=yesterday?dateRange(from,yesterday):[];
  for(const date of days)await deps.store.saveDays("instagram",[{date,...await deps.client.dayInsights(id,token,date)}]);
  const mediaUpdated=await collectMedia(deps,token);
  return {daysFilled:days.length,mediaUpdated,filledThrough:days.length?yesterday:deps.filledThrough};
}

// 앱으로 올린 게시물: 올린 뒤 7일은 날마다, 90일까지는 7일마다. 직접 적은 성과는 그대로 둔다.
async function collectMedia(deps:CollectInstagramDeps,token:string){
  let updated=0;
  const lock=deps.withLock??(async(_id,work)=>work());
  for(const {id} of await deps.drafts.listDraftSummaries()){
    const publication=await deps.readPublication(id).catch(()=>null);
    if(publication?.status!=="published"||!publication.mediaId||!publication.publishedAt)continue;
    const postedOn=kstDateOf(publication.publishedAt),age=diffDays(postedOn,deps.today);
    if(age<0||age>90||(age>7&&age%7!==0))continue;
    const values=await deps.client.mediaInsights(publication.mediaId,token);
    const saved=await lock(id,async()=>{
      const draft=await deps.drafts.readDraft(id);
      if(!draft||(draft.performance&&draft.performance.source!=="instagram"))return false;
      const performance:Performance={likes:values.likes??0,comments:values.comments??0,saves:values.saves??0,shares:values.shares??0,...(values.reach!==undefined?{reach:values.reach}:{}),posted_on:postedOn,recorded_at:new Date().toISOString(),source:"instagram"};
      await deps.drafts.saveDraft({...draft,performance},{thumbnail:false});
      return true;
    });
    if(saved)updated++;
  }
  return updated;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/instagramInsights.test.ts tests/unit/instagramOAuth.test.ts tests/unit/draftRoute.test.ts tests/unit/instagramRepository.test.ts`
Expected: PASS. scope 목록을 그대로 비교하는 기존 테스트가 있으면 새 scope를 넣어 고친다.

- [ ] **Step 6: Commit**

```bash
git add src/features/instagram src/features/drafts/performance.ts src/app/api/drafts/route.ts src/features/metrics/instagramInsights.ts tests/unit
git commit -m "성과: 인스타그램 인사이트 권한과 계정·게시물 수집"
```

---

### Task 4: GA4 수집

**Files:**
- Create: `src/features/metrics/ga4.ts`
- Test: `tests/unit/ga4.test.ts`

**Interfaces:**
- Consumes: `addDays, kstToday`(Task 1), `Ga4Day, MetricsStore`(Task 2)
- Produces:
  - `type Ga4Config={propertyId:string;clientEmail:string;privateKey:string;startDate:string}`
  - `getGa4Config(env?):Ga4Config|null`
  - `signServiceJwt(config,nowSeconds):string`
  - `collectGa4({config,store,fetcher?,today,filledThrough,nowSeconds?}):Promise<{daysFilled:number;filledThrough?:string}>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ga4.test.ts
// @vitest-environment node
import { generateKeyPairSync,createVerify } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { collectGa4,getGa4Config,signServiceJwt } from "@/features/metrics/ga4";

const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const pem=privateKey.export({type:"pkcs8",format:"pem"}).toString();
const config={propertyId:"555483214",clientEmail:"bot@p.iam.gserviceaccount.com",privateKey:pem,startDate:"2026-09-07"};
const ok=(body:unknown)=>({ok:true,status:200,json:async()=>body}) as Response;
const row=(dims:string[],metrics:number[])=>({dimensionValues:dims.map(value=>({value})),metricValues:metrics.map(v=>({value:String(v)}))});

describe("GA4",()=>{
  it("환경변수가 없으면 null, 있으면 서비스 계정 JSON을 읽는다",()=>{
    expect(getGa4Config({})).toBeNull();
    const env={GA4_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:config.clientEmail,private_key:pem})};
    expect(getGa4Config(env)).toMatchObject({propertyId:"555483214",clientEmail:config.clientEmail,startDate:"2026-09-07"});
  });
  it("JWT를 RS256으로 서명하고 읽기 전용 범위를 요청한다",()=>{
    const jwt=signServiceJwt(config,1_000_000);
    const [h,c,s]=jwt.split(".");
    const claims=JSON.parse(Buffer.from(c,"base64url").toString());
    expect(claims).toMatchObject({iss:config.clientEmail,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:1_000_000,exp:1_003_600});
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey,Buffer.from(s,"base64url"))).toBe(true);
  });
  it("처음에는 시작일부터, 다음부터는 마지막 사흘을 다시 가져와 일별로 저장한다",async()=>{
    const bodies:unknown[]=[];
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.includes("oauth2"))return ok({access_token:"tok"});
      const body=JSON.parse(String(init!.body));bodies.push(body);
      const dims=body.dimensions.map((d:{name:string})=>d.name).join(",");
      if(dims==="date")return ok({rows:[row(["20261010"],[3,4,9])]});
      if(dims==="date,eventName")return ok({rows:[row(["20261010","phone_click"],[2])]});
      return ok({rows:[row(["20261010","naver / place"],[3]),row(["20261010","(direct) / (none)"],[1])]});
    });
    const saved:unknown[]=[];
    const store={saveDays:vi.fn(async(_c:string,days:unknown[])=>{saved.push(...days);})};
    const first=await collectGa4({config,store,fetcher:fetcher as unknown as typeof fetch,today:"2026-10-12",filledThrough:undefined,nowSeconds:1_000_000});
    expect((bodies[0] as {dateRanges:unknown}).dateRanges).toEqual([{startDate:"2026-09-07",endDate:"2026-10-11"}]);
    expect(saved).toEqual([{date:"2026-10-10",activeUsers:3,sessions:4,pageViews:9,phoneClicks:2,directionsClicks:0,sources:[{sourceMedium:"naver / place",sessions:3},{sourceMedium:"(direct) / (none)",sessions:1}]}]);
    expect(first.filledThrough).toBe("2026-10-11");
    bodies.length=0;
    await collectGa4({config,store,fetcher:fetcher as unknown as typeof fetch,today:"2026-10-14",filledThrough:"2026-10-11",nowSeconds:1_000_000});
    expect((bodies[0] as {dateRanges:unknown}).dateRanges).toEqual([{startDate:"2026-10-09",endDate:"2026-10-13"}]);
  });
  it("토큰 요청 실패 메시지에 비밀값을 넣지 않는다",async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:"invalid_grant"})});
    await expect(collectGa4({config,store:{saveDays:vi.fn()},fetcher,today:"2026-10-12",filledThrough:undefined})).rejects.toThrow(/구글 애널리틱스/);
    await collectGa4({config,store:{saveDays:vi.fn()},fetcher,today:"2026-10-12",filledThrough:undefined}).catch((e:Error)=>expect(e.message).not.toContain("PRIVATE KEY"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ga4.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Write `ga4.ts`**

```ts
import { createSign } from "node:crypto";
import { addDays } from "./dates";
import type { Ga4Day,MetricsStore } from "./store";

// 홈페이지 GA4 숫자를 서비스 계정으로 읽는다(GA4 속성에 서비스 계정 이메일을 '뷰어'로 추가해 둔다).
// 새 패키지 없이 Node crypto로 JWT를 서명해 토큰을 받는다.
export type Ga4Config={propertyId:string;clientEmail:string;privateKey:string;startDate:string};
type Env=Partial<Record<"GA4_PROPERTY_ID"|"GA4_SERVICE_ACCOUNT_JSON"|"GA4_START_DATE",string>>;

export function getGa4Config(env:Env=process.env as Env):Ga4Config|null{
  const raw=env.GA4_SERVICE_ACCOUNT_JSON?.trim();
  if(!raw)return null;
  const parsed=JSON.parse(raw) as {client_email?:string;private_key?:string};
  if(!parsed.client_email||!parsed.private_key)return null;
  return {propertyId:env.GA4_PROPERTY_ID?.trim()||"555483214",clientEmail:parsed.client_email,privateKey:parsed.private_key,startDate:env.GA4_START_DATE?.trim()||"2026-09-07"};
}

const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
export function signServiceJwt(config:Ga4Config,nowSeconds:number){
  const unsigned=`${b64({alg:"RS256",typ:"JWT"})}.${b64({iss:config.clientEmail,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:nowSeconds,exp:nowSeconds+3600})}`;
  return `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(config.privateKey).toString("base64url")}`;
}

class Ga4Error extends Error{}
async function accessToken(config:Ga4Config,fetcher:typeof fetch,nowSeconds:number){
  const response=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:signServiceJwt(config,nowSeconds)})});
  if(!response.ok)throw new Ga4Error(`구글 애널리틱스 인증에 실패했어요(HTTP ${response.status}). 서비스 계정 키를 확인해 주세요.`);
  const body=await response.json() as {access_token?:string};
  if(!body.access_token)throw new Ga4Error("구글 애널리틱스 인증 응답을 읽지 못했어요.");
  return body.access_token;
}

type Row={dimensionValues:{value:string}[];metricValues:{value:string}[]};
async function report(config:Ga4Config,token:string,fetcher:typeof fetch,body:Record<string,unknown>){
  const response=await fetcher(`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Ga4Error(`구글 애널리틱스 보고서를 읽지 못했어요(HTTP ${response.status}). 서비스 계정이 속성의 뷰어인지 확인해 주세요.`);
  return ((await response.json() as {rows?:Row[]}).rows??[]);
}
const isoOf=(yyyymmdd:string)=>`${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`;

export async function collectGa4({config,store,fetcher=fetch,today,filledThrough,nowSeconds=Math.floor(Date.now()/1000)}:{config:Ga4Config;store:Pick<MetricsStore,"saveDays">;fetcher?:typeof fetch;today:string;filledThrough:string|undefined;nowSeconds?:number}){
  const yesterday=addDays(today,-1);
  // GA4 숫자는 하루 이틀 늦게 확정되므로 마지막 사흘은 다시 가져온다.
  const from=filledThrough?[addDays(filledThrough,-2),config.startDate].sort().at(-1)!:config.startDate;
  if(from>yesterday)return {daysFilled:0,filledThrough};
  const token=await accessToken(config,fetcher,nowSeconds);
  const dateRanges=[{startDate:from,endDate:yesterday}];
  const [totals,events,sources]=await Promise.all([
    report(config,token,fetcher,{dateRanges,dimensions:[{name:"date"}],metrics:[{name:"activeUsers"},{name:"sessions"},{name:"screenPageViews"}],limit:1000}),
    report(config,token,fetcher,{dateRanges,dimensions:[{name:"date"},{name:"eventName"}],metrics:[{name:"eventCount"}],dimensionFilter:{filter:{fieldName:"eventName",inListFilter:{values:["phone_click","directions_click"]}}},limit:5000}),
    report(config,token,fetcher,{dateRanges,dimensions:[{name:"date"},{name:"sessionSourceMedium"}],metrics:[{name:"sessions"}],limit:10000}),
  ]);
  const days=new Map<string,Omit<Ga4Day,"fetchedAt">>();
  const dayOf=(raw:string)=>{const date=isoOf(raw);if(!days.has(date))days.set(date,{date,phoneClicks:0,directionsClicks:0,sources:[]});return days.get(date)!;};
  for(const r of totals){const d=dayOf(r.dimensionValues[0].value);[d.activeUsers,d.sessions,d.pageViews]=r.metricValues.map(m=>Number(m.value));}
  for(const r of events){const d=dayOf(r.dimensionValues[0].value);const v=Number(r.metricValues[0].value);if(r.dimensionValues[1].value==="phone_click")d.phoneClicks=v;else d.directionsClicks=v;}
  for(const r of sources)dayOf(r.dimensionValues[0].value).sources.push({sourceMedium:r.dimensionValues[1].value,sessions:Number(r.metricValues[0].value)});
  const list=[...days.values()].map(d=>({...d,sources:d.sources.sort((a,b)=>b.sessions-a.sessions).slice(0,10)})).sort((a,b)=>a.date.localeCompare(b.date));
  if(list.length)await store.saveDays("ga4",list);
  return {daysFilled:list.length,filledThrough:yesterday};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ga4.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/metrics/ga4.ts tests/unit/ga4.test.ts
git commit -m "성과: GA4 서비스 계정으로 홈페이지 일별 숫자 수집"
```

---

### Task 5: 하루 한 번 수집과 스케줄러 연결

**Files:**
- Create: `src/features/metrics/collect.ts`, `src/app/api/metrics/collect/route.ts`
- Modify: `src/features/instagram/schedulerRuntime.ts`(tick 안)
- Test: `tests/unit/metricsCollect.test.ts`

**Interfaces:**
- Consumes: `collectInstagram`(Task 3), `collectGa4, getGa4Config`(Task 4), `createMetricsStore`(Task 2), `kstToday`(Task 1)
- Produces:
  - `runDailyMetrics(deps:{store,today,instagram:(filledThrough)=>Promise<{skipped?;filledThrough?}>,ga4:((filledThrough)=>Promise<{filledThrough?}>)|null,force?:boolean,now?:()=>Date}):Promise<MetricsRun>`
  - `type MetricsRun={instagram:"ran"|"skipped"|"failed"|"not-due";ga4:"ran"|"failed"|"not-configured"|"not-due";messages:string[]}`
  - `runDailyMetricsIfDue(force?:boolean):Promise<MetricsRun|null>`(실제 의존성 연결, 메모리로 하루 한 번 거름)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/metricsCollect.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/metricsCollect.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Write `collect.ts`**

```ts
import { createDraftRepository,withDraftLock } from "@/features/drafts/repository";
import { createInstagramRepository } from "@/features/instagram/repository";
import { kstToday } from "./dates";
import { collectGa4,getGa4Config } from "./ga4";
import { collectInstagram,createInsightsClient } from "./instagramInsights";
import { createMetricsStore,type ChannelState,type MetricsState } from "./store";

// 스케줄러가 1분마다 부르지만 실제 수집은 채널마다 하루 한 번이다. 한 채널이 실패해도 다른 채널과 게시는 계속한다.
export type MetricsRun={instagram:"ran"|"skipped"|"failed"|"not-due";ga4:"ran"|"failed"|"not-configured"|"not-due";messages:string[]};
const SKIP_MESSAGES={"not-connected":"인스타그램이 연결되지 않았어요.","needs-reconnect":"설정에서 인스타그램을 다시 연결하면 성과를 자동으로 가져와요.","expired":"인스타그램 연결이 만료됐어요. 설정에서 다시 연결해 주세요."} as const;
type Skip=keyof typeof SKIP_MESSAGES;

export async function runDailyMetrics(deps:{
  store:{readState:()=>Promise<MetricsState>;saveState:(s:MetricsState)=>Promise<void>};
  today:string;force?:boolean;now?:()=>Date;
  instagram:(filledThrough:string|undefined)=>Promise<{skipped?:Skip;filledThrough?:string}>;
  ga4:((filledThrough:string|undefined)=>Promise<{filledThrough?:string}>)|null;
}):Promise<MetricsRun>{
  const state=await deps.store.readState();
  const stamp=(deps.now??(()=>new Date()))().toISOString();
  const due=(s?:ChannelState)=>deps.force||s?.lastRunOn!==deps.today;
  const run:MetricsRun={instagram:"not-due",ga4:deps.ga4?"not-due":"not-configured",messages:[]};
  const next:MetricsState={...state};
  if(due(state.instagram)){
    try{
      const result=await deps.instagram(state.instagram?.filledThrough);
      if(result.skipped){run.instagram="skipped";next.instagram={...state.instagram,lastRunOn:deps.today,lastError:SKIP_MESSAGES[result.skipped]};}
      else{run.instagram="ran";next.instagram={...state.instagram,lastRunOn:deps.today,lastSuccessAt:stamp,lastError:null,filledThrough:result.filledThrough??state.instagram?.filledThrough};}
    }catch(error){run.instagram="failed";next.instagram={...state.instagram,lastRunOn:deps.today,lastError:error instanceof Error?error.message:String(error)};}
  }
  if(deps.ga4&&due(state.ga4)){
    try{
      const result=await deps.ga4(state.ga4?.filledThrough);
      run.ga4="ran";next.ga4={...state.ga4,lastRunOn:deps.today,lastSuccessAt:stamp,lastError:null,filledThrough:result.filledThrough??state.ga4?.filledThrough};
    }catch(error){run.ga4="failed";next.ga4={...state.ga4,lastRunOn:deps.today,lastError:error instanceof Error?error.message:String(error)};}
  }
  if(run.instagram!=="not-due"||(run.ga4!=="not-due"&&run.ga4!=="not-configured"))await deps.store.saveState(next);
  for(const [channel,value] of Object.entries(next))if(value?.lastError)run.messages.push(`${channel}: ${value.lastError}`);
  return run;
}

let checkedOn="";
// 실제 저장소·Meta·GA4를 묶는다. 오늘 이미 확인했으면 저장소도 읽지 않는다(1분마다 불리므로).
export async function runDailyMetricsIfDue(force=false){
  const today=kstToday();
  if(!force&&checkedOn===today)return null;
  const store=createMetricsStore(),instagram=createInstagramRepository(),drafts=createDraftRepository();
  const config=getGa4Config();
  const run=await runDailyMetrics({store,today,force,
    instagram:async filledThrough=>collectInstagram({connection:await instagram.readConnection(),store,client:createInsightsClient(),drafts,readPublication:instagram.readPublication,today,filledThrough,withLock:withDraftLock}),
    ga4:config?filledThrough=>collectGa4({config,store,today,filledThrough}):null,
  });
  checkedOn=today;
  return run;
}
```

- [ ] **Step 4: Hook into the scheduler loop and add the route**

`src/features/instagram/schedulerRuntime.ts`의 `tick` 안에서 `try{...}catch{...}` 블록 바로 뒤, `finally` 앞에 둔다. try 블록이 끝난 뒤 같은 `try`에 붙지 않도록 별도 `try`로 감싼다.
```ts
    try{
      const metrics=await (await import("@/features/metrics/collect")).runDailyMetricsIfDue();
      if(metrics&&(metrics.instagram!=="not-due"||metrics.ga4==="ran"||metrics.ga4==="failed"))console.info(`[metrics] 성과 수집: 인스타그램 ${metrics.instagram}, 홈페이지 ${metrics.ga4}`);
    }catch(error){console.warn("[metrics] 성과 수집 실패:",error instanceof Error?error.message:String(error));}
```
(`tick`의 구조는 `running=true; try{게시}catch{}finally{running=false}`이다. 게시 `try/catch`와 `finally` 사이에 이 블록을 넣으려면 바깥을 `try{ 게시 try/catch; 성과 try/catch }finally{running=false}`로 바꾼다.)

`src/app/api/metrics/collect/route.ts`:
```ts
import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { runDailyMetricsIfDue } from "@/features/metrics/collect";

// 성과 화면의 '지금 가져오기'. 오늘 이미 가져왔어도 다시 가져온다.
export async function POST(){ const denied=await ownerApiError(); if(denied)return denied;
  const run=await runDailyMetricsIfDue(true);
  return NextResponse.json(run,{headers:{"Cache-Control":"no-store"}});
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/metricsCollect.test.ts tests/unit/instagramScheduler.test.ts tests/unit/instagramSchedulerRoute.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/metrics/collect.ts src/app/api/metrics/collect src/features/instagram/schedulerRuntime.ts tests/unit/metricsCollect.test.ts
git commit -m "성과: 하루 한 번 채널별 수집과 스케줄러 연결"
```

---

### Task 6: 네이버 기록 API와 CSV

**Files:**
- Create: `src/features/metrics/csv.ts`, `src/app/api/metrics/naver/route.ts`, `src/app/api/metrics/export/route.ts`
- Test: `tests/unit/metricsRoutes.test.ts`

**Interfaces:**
- Consumes: `createMetricsStore`(Task 2), `NaverPeriodSchema, findOverlap, dailyAverage, monthEquivalent, youngShare`(Task 1)
- Produces:
  - `toCsv({instagram,ga4,naver}):string`(머리줄 `채널,기간,지표,값`)
  - `GET/PUT/DELETE /api/metrics/naver`: PUT 본문 `{period:NaverPeriod}`, 겹치면 409
  - `GET /api/metrics/export?from&to`: `text/csv`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/metricsRoutes.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/metricsRoutes.test.ts`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Write `csv.ts`**

```ts
import { dailyAverage,monthEquivalent,youngShare,type NaverPeriod } from "./naver";
import type { Ga4Day,InstagramDay } from "./store";

const IG_LABELS:Record<string,string>={followers:"팔로워",mediaCount:"게시물 수",reach:"도달",views:"조회",accountsEngaged:"반응한 계정",totalInteractions:"전체 반응",profileViews:"프로필 방문",websiteClicks:"링크 클릭"};
const GA_LABELS:Record<string,string>={activeUsers:"방문자",sessions:"방문",pageViews:"페이지 조회",phoneClicks:"전화 버튼",directionsClicks:"길찾기 버튼"};
const cell=(value:string|number)=>{const text=String(value);return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;};

export function toCsv({instagram,ga4,naver}:{instagram:InstagramDay[];ga4:Ga4Day[];naver:NaverPeriod[]}){
  const rows:(string|number)[][]=[["채널","기간","지표","값"]];
  for(const d of instagram)for(const [key,label] of Object.entries(IG_LABELS)){const v=d[key as keyof InstagramDay];if(typeof v==="number")rows.push(["인스타그램",d.date,label,v]);}
  for(const d of ga4){
    for(const [key,label] of Object.entries(GA_LABELS)){const v=d[key as keyof Ga4Day];if(typeof v==="number")rows.push(["홈페이지",d.date,label,v]);}
    for(const s of d.sources)rows.push(["홈페이지",d.date,`유입:${s.sourceMedium}`,s.sessions]);
  }
  for(const p of naver){
    const span=`${p.start}~${p.end}`,push=(label:string,v:number|undefined)=>{if(v!==undefined)rows.push(["네이버 플레이스",span,label,v]);};
    push("숫자가 있는 날",p.dataDays);push("플레이스 유입",p.placeVisits);push("하루 평균 유입",dailyAverage(p));push("한 달 환산 유입",monthEquivalent(p));
    push("리뷰 등록",p.reviews);push("20~30대 비율(어림)",youngShare(p));push("블로그 조회",p.blogViews);push("블로그 방문자",p.blogVisitors);
    for(const c of p.channels){push(`유입 채널:${c.name}(회)`,c.count);push(`유입 채널:${c.name}(%)`,c.percent);}
    for(const k of p.keywords)push(`유입 키워드:${k.name}(%)`,k.percent);
    if(p.gender){push("남성(%)",p.gender.male);push("여성(%)",p.gender.female);}
  }
  return rows.map(r=>r.map(cell).join(",")).join("\n")+"\n";
}
```

- [ ] **Step 4: Write the routes**

`src/app/api/metrics/naver/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createMetricsStore } from "@/features/metrics/store";
import { NaverPeriodSchema,findOverlap } from "@/features/metrics/naver";

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});

export async function GET(){ const denied=await ownerApiError(); if(denied)return denied;
  return json(await createMetricsStore().readNaver());
}

// 같은 id면 고치고, 없으면 더한다. 다른 기록과 날짜가 겹치면 거절한다(비교가 틀어진다).
export async function PUT(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=z.object({period:NaverPeriodSchema}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return json({error:parsed.error.issues[0]?.message??"기록 값을 확인해 주세요."},400);
  const store=createMetricsStore(),list=await store.readNaver(),period=parsed.data.period;
  const overlap=findOverlap(list,period);
  if(overlap)return json({error:`${overlap.start}~${overlap.end} 기록과 날짜가 겹쳐요.`},409);
  return json(await store.saveNaver([...list.filter(p=>p.id!==period.id),period]));
}

export async function DELETE(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const id=new URL(request.url).searchParams.get("id");
  const store=createMetricsStore();
  return json(await store.saveNaver((await store.readNaver()).filter(p=>p.id!==id)));
}
```

`src/app/api/metrics/export/route.ts`:
```ts
import { ownerApiError } from "@/features/auth/guard";
import { createMetricsStore } from "@/features/metrics/store";
import { toCsv } from "@/features/metrics/csv";
import { isDate,kstToday } from "@/features/metrics/dates";

export async function GET(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const params=new URL(request.url).searchParams;
  const from=isDate(params.get("from")??"")?params.get("from")!:"2026-08-01";
  const to=isDate(params.get("to")??"")?params.get("to")!:kstToday();
  const store=createMetricsStore();
  const [instagram,ga4,naver]=await Promise.all([store.listDays("instagram",from,to),store.listDays("ga4",from,to),store.readNaver()]);
  const csv="﻿"+toCsv({instagram,ga4,naver:naver.filter(p=>p.end>=from&&p.start<=to)}); // BOM: 엑셀에서 한글이 깨지지 않게
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="performance-${from}-${to}.csv"`,"Cache-Control":"no-store"}});
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/metricsRoutes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/metrics/csv.ts src/app/api/metrics tests/unit/metricsRoutes.test.ts
git commit -m "성과: 네이버 기록 API(겹침 거절)와 CSV 내려받기"
```

---

### Task 7: 성과 화면, 메뉴, 다시 연결 안내

**Files:**
- Create: `src/components/performance/LineChart.tsx`, `src/components/performance/ChannelCards.tsx`, `src/components/performance/NaverPeriodForm.tsx`, `src/app/performance/page.tsx`
- Modify: `src/components/wizard/WizardShell.tsx:22-27`, `src/components/settings/InstagramConnectionCard.tsx`(연결됨 상태), `src/components/drafts/PerformanceForm.tsx:35`(요약 줄), `src/app/globals.css`(끝에 스타일)
- Test: `tests/unit/performancePage.test.tsx`. 메뉴 개수를 세는 `tests/unit/WizardShell.test.tsx`가 있으면 함께 고친다.

**Interfaces:**
- Consumes: Task 1~6의 모든 것
- Produces:
  - `LineChart({label,points:{x:string;y:number}[]})`
  - `InstagramCard({days,state,insights})`, `HomepageCard({days,state,configured})`, `NaverCard({periods})`
  - `NaverPeriodForm({period?})`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/performancePage.test.tsx
import { render,screen,within } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
import { HomepageCard,InstagramCard,NaverCard } from "@/components/performance/ChannelCards";
import { LineChart } from "@/components/performance/LineChart";
import { NAVER_SEED } from "@/features/metrics/naver";

describe("성과 카드",()=>{
  it("인사이트 권한이 없으면 다시 연결 안내를 보인다",()=>{
    render(<InstagramCard days={[]} state={undefined} insights={false}/>);
    expect(screen.getByText(/다시 연결하면/)).toBeTruthy();
  });
  it("팔로워는 처음과 마지막 값을, 기간 합계는 빈칸을 빼고 더한다",()=>{
    render(<InstagramCard insights state={undefined} days={[{date:"2026-10-10",followers:100,reach:10,fetchedAt:"t"},{date:"2026-10-11",reach:5,fetchedAt:"t"},{date:"2026-10-12",followers:130,fetchedAt:"t"}]}/>);
    expect(screen.getByText("100 → 130명")).toBeTruthy();
    expect(within(screen.getByRole("row",{name:/도달/})).getByText("15")).toBeTruthy();
  });
  it("GA4 설정이 없으면 연결 방법을 안내한다",()=>{
    render(<HomepageCard days={[]} state={undefined} configured={false}/>);
    expect(screen.getByText(/구글 애널리틱스 연결이 필요해요/)).toBeTruthy();
  });
  it("네이버 표는 하루 평균·한 달 환산·새 키워드·20~30대 비율을 보인다",()=>{
    render(<NaverCard periods={NAVER_SEED}/>);
    expect(screen.getByText("12.4")).toBeTruthy();
    expect(screen.getByText("약 733")).toBeTruthy();
    expect(screen.getByRole("cell",{name:/석계역삼합/})).toBeTruthy();
    expect(screen.getByText("41.8%")).toBeTruthy();
  });
  it("그래프는 점이 2개 미만이면 안내 문구를 보인다",()=>{
    render(<LineChart label="팔로워" points={[{x:"2026-10-12",y:130}]}/>);
    expect(screen.getByText(/이틀 이상 쌓이면/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/performancePage.test.tsx`
Expected: FAIL. 모듈을 찾지 못한다.

- [ ] **Step 3: Write `LineChart.tsx`**

```tsx
// 성과 화면의 작은 선 그래프. 차트 패키지 없이 SVG로 그린다. 값은 화면 읽기용 표(sr-only)로도 남긴다.
export function LineChart({label,points}:{label:string;points:{x:string;y:number}[]}){
  if(points.length<2)return <p className="field-help">{label} 그래프는 기록이 이틀 이상 쌓이면 보여요.</p>;
  const W=600,H=160,P=28;
  const max=Math.max(...points.map(p=>p.y),1),min=Math.min(...points.map(p=>p.y),0);
  const x=(i:number)=>P+i*(W-2*P)/(points.length-1),y=(v:number)=>H-P-(v-min)/(max-min||1)*(H-2*P);
  const d=points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  return <figure className="metric-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 추이, ${points[0].x}부터 ${points.at(-1)!.x}까지`}>
      <line x1={P} x2={W-P} y1={H-P} y2={H-P} className="metric-axis"/>
      <path d={d} className="metric-line"/>
      <text x={P} y={H-6} className="metric-tick">{points[0].x.slice(5)}</text>
      <text x={W-P} y={H-6} textAnchor="end" className="metric-tick">{points.at(-1)!.x.slice(5)}</text>
      <text x={P} y={14} className="metric-tick">{max.toLocaleString("ko-KR")}</text>
    </svg>
    <figcaption>{label}</figcaption>
  </figure>;
}
```

- [ ] **Step 4: Write `ChannelCards.tsx`**

```tsx
import { LineChart } from "./LineChart";
import { NaverPeriodForm } from "./NaverPeriodForm";
import { dailyAverage,monthEquivalent,newKeywords,youngShare,type NaverPeriod } from "@/features/metrics/naver";
import type { ChannelState,Ga4Day,InstagramDay } from "@/features/metrics/store";

const fmt=(n:number|undefined)=>n===undefined?"—":n.toLocaleString("ko-KR");
const sum=<T,>(list:T[],pick:(item:T)=>number|undefined)=>{const values=list.map(pick).filter((v):v is number=>v!==undefined);return values.length?values.reduce((a,b)=>a+b,0):undefined;};
function Status({state}:{state?:ChannelState}){
  if(!state?.lastRunOn)return <p className="field-help">아직 가져온 적이 없어요.</p>;
  return <p className="field-help">마지막 확인 {state.lastRunOn}{state.lastError?<> · <strong role="alert">{state.lastError}</strong></>:" · 정상"}</p>;
}
function Totals({rows}:{rows:[string,number|undefined][]}){
  return <table className="metric-table"><tbody>{rows.map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{fmt(value)}</td></tr>)}</tbody></table>;
}

export function InstagramCard({days,state,insights}:{days:InstagramDay[];state?:ChannelState;insights:boolean}){
  const followers=days.filter(d=>d.followers!==undefined);
  return <section className="metric-card" aria-label="인스타그램">
    <h2>인스타그램</h2>
    {!insights&&<p className="notice">설정에서 인스타그램을 다시 연결하면 팔로워·도달·조회를 자동으로 가져와요.</p>}
    {followers.length>0&&<p className="metric-big">{`${fmt(followers[0].followers)} → ${fmt(followers.at(-1)!.followers)}명`}</p>}
    <LineChart label="팔로워" points={followers.map(d=>({x:d.date,y:d.followers!}))}/>
    <Totals rows={[["도달",sum(days,d=>d.reach)],["조회",sum(days,d=>d.views)],["반응한 계정",sum(days,d=>d.accountsEngaged)],["프로필 방문",sum(days,d=>d.profileViews)],["링크 클릭",sum(days,d=>d.websiteClicks)]]}/>
    <p className="field-help">도달·반응한 계정은 날마다의 값을 더한 것이라, 같은 사람이 여러 날 보면 여러 번 세어져요.</p>
    <Status state={state}/>
  </section>;
}

export function HomepageCard({days,state,configured}:{days:Ga4Day[];state?:ChannelState;configured:boolean}){
  const sources=new Map<string,number>();
  for(const d of days)for(const s of d.sources)sources.set(s.sourceMedium,(sources.get(s.sourceMedium)??0)+s.sessions);
  const top=[...sources].sort((a,b)=>b[1]-a[1]).slice(0,8);
  return <section className="metric-card" aria-label="홈페이지">
    <h2>홈페이지</h2>
    {!configured&&<p className="notice">구글 애널리틱스 연결이 필요해요. 도움말 문서(PERFORMANCE_METRICS)의 순서대로 서비스 계정을 추가해 주세요.</p>}
    <LineChart label="일별 방문자" points={days.filter(d=>d.activeUsers!==undefined).map(d=>({x:d.date,y:d.activeUsers!}))}/>
    <Totals rows={[["방문",sum(days,d=>d.sessions)],["페이지 조회",sum(days,d=>d.pageViews)],["전화 버튼",sum(days,d=>d.phoneClicks)],["길찾기 버튼",sum(days,d=>d.directionsClicks)]]}/>
    {top.length>0&&<><h3>어디서 들어왔나(방문)</h3><table className="metric-table"><tbody>{top.map(([name,count])=><tr key={name}><th scope="row">{name==="naver / place"?"네이버 플레이스 (naver / place)":name}</th><td>{fmt(count)}</td></tr>)}</tbody></table></>}
    <Status state={state}/>
  </section>;
}

export function NaverCard({periods}:{periods:NaverPeriod[]}){
  return <section className="metric-card metric-wide" aria-label="네이버 플레이스">
    <h2>네이버 플레이스</h2>
    <p className="field-help">하루 평균은 숫자가 있는 날로 나눈 값이고, 한 달 환산은 그 평균에 그달 일수를 곱한 값이에요. 키워드·연령은 네이버 화면의 비율이에요.</p>
    <div className="table-scroll"><table className="metric-table">
      <thead><tr><th>기간</th><th>숫자 있는 날</th><th>유입</th><th>하루 평균</th><th>한 달 환산</th><th>리뷰</th><th>20~30대(어림)</th><th>새 키워드</th><th>많이 본 시간</th></tr></thead>
      <tbody>{periods.map((p,i)=>{const young=youngShare(p);const fresh=newKeywords(p,periods[i-1]);return <tr key={p.id}>
        <th scope="row">{p.start}~{p.end}</th><td>{p.dataDays}일</td><td>{fmt(p.placeVisits)}</td>
        <td>{dailyAverage(p)}</td><td>{`약 ${monthEquivalent(p).toLocaleString("ko-KR")}`}</td><td>{fmt(p.reviews)}</td>
        <td>{young===undefined?"—":`${young}%`}</td><td>{fresh.length?fresh.join(", "):"—"}</td><td>{p.peakHours??"—"}</td>
      </tr>;})}</tbody>
    </table></div>
    <details className="metric-details"><summary>키워드·채널·연령 자세히</summary>
      {periods.map(p=><div key={p.id}><h3>{p.start}~{p.end}</h3>
        <p>유입 채널: {p.channels.map(c=>`${c.name} ${c.count!==undefined?`${c.count}회 `:""}${c.percent!==undefined?`(${c.percent}%)`:""}`).join(" · ")}</p>
        <p>유입 키워드: {p.keywords.map(k=>`${k.name} ${k.percent}%`).join(" · ")}</p>
        {p.gender&&<p>성별: 남 {p.gender.male}% · 여 {p.gender.female}%</p>}
        {p.note&&<p className="field-help">{p.note}</p>}
      </div>)}
    </details>
    <NaverPeriodForm/>
  </section>;
}
```

- [ ] **Step 5: Write `NaverPeriodForm.tsx`**

```tsx
"use client";
import { useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/readJson";

// 네이버 기록 추가·고치기. 같은 기간 id(예: 2026-10)로 저장하면 그 기록을 고친다.
// 채널·키워드는 한 줄에 "이름 비율" 또는 "이름 횟수 비율", 연령은 "0,19,16,22,32,8,3"(10대~70대).
const lines=(text:string)=>text.split("\n").map(l=>l.trim()).filter(Boolean);
const numbers=(text:string)=>text.split(/[,\s]+/).filter(Boolean).map(Number);
export function NaverPeriodForm(){
  const router=useRouter();
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const f=new FormData(event.currentTarget),get=(k:string)=>String(f.get(k)??"").trim(),num=(k:string)=>get(k)===""?undefined:Number(get(k));
    const ageMale=numbers(get("ageMale")),ageFemale=numbers(get("ageFemale"));
    const period={id:get("id"),start:get("start"),end:get("end"),dataDays:num("dataDays"),placeVisits:num("placeVisits"),reviews:num("reviews"),blogViews:num("blogViews"),blogVisitors:num("blogVisitors"),
      checkedOn:new Date().toISOString().slice(0,10),peakHours:get("peakHours")||undefined,note:get("note")||undefined,
      channels:lines(get("channels")).map(l=>{const parts=l.split(/\s+/),nums=parts.filter(p=>/^[\d.]+%?$/.test(p)).map(p=>p.replace("%",""));const name=parts.filter(p=>!/^[\d.]+%?$/.test(p)).join(" ");return nums.length===2?{name,count:Number(nums[0]),percent:Number(nums[1])}:{name,percent:Number(nums[0])};}),
      keywords:lines(get("keywords")).map(l=>{const parts=l.split(/\s+/);return {name:parts.slice(0,-1).join(" "),percent:Number(parts.at(-1)!.replace("%",""))};}),
      gender:get("male")?{male:Number(get("male")),female:Number(get("female"))}:undefined,
      ageMale:ageMale.length?ageMale:undefined,ageFemale:ageFemale.length?ageFemale:undefined};
    try{
      const response=await fetch("/api/metrics/naver",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({period})});
      const body=await readJsonResponse(response);
      if(!response.ok)throw new Error(body.error||"저장하지 못했어요.");
      setMessage("저장했어요.");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  }
  return <details className="metric-details"><summary>네이버 기록 추가·고치기</summary>
    <form className="naver-form" onSubmit={save} aria-label="네이버 기록">
      <label>기록 이름(같은 이름이면 고쳐요)<input name="id" required placeholder="2026-10"/></label>
      <label>시작일<input name="start" type="date" required/></label><label>끝일<input name="end" type="date" required/></label>
      <label>숫자가 있는 날<input name="dataDays" type="number" min={1} required/></label>
      <label>플레이스 유입<input name="placeVisits" type="number" min={0} required/></label>
      <label>리뷰 등록<input name="reviews" type="number" min={0}/></label>
      <label>블로그 조회<input name="blogViews" type="number" min={0}/></label><label>블로그 방문자<input name="blogVisitors" type="number" min={0}/></label>
      <label>유입 채널(줄마다 "이름 횟수 비율")<textarea name="channels" rows={3} placeholder={"네이버지도 159 61.15\n네이버검색 100 38.46"}/></label>
      <label>유입 키워드(줄마다 "키워드 비율", 5개까지)<textarea name="keywords" rows={5} placeholder="묵동홍어마을 56.86"/></label>
      <label>남성 %<input name="male" type="number" min={0} max={100} step="0.01"/></label><label>여성 %<input name="female" type="number" min={0} max={100} step="0.01"/></label>
      <label>남성 연령 10~70대 %<input name="ageMale" placeholder="0,19,16,22,32,8,3"/></label><label>여성 연령 10~70대 %<input name="ageFemale" placeholder="0,20,5,32,37,5,1"/></label>
      <label>많이 본 시간대<input name="peakHours" placeholder="18시 (15~19시 높음)"/></label><label>메모<input name="note"/></label>
      <button className="button primary" disabled={busy}>{busy?"저장 중…":"저장"}</button>
      {message&&<p role="status" className="field-help">{message}</p>}
    </form>
  </details>;
}
```

- [ ] **Step 6: Write `src/app/performance/page.tsx`**

```tsx
import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";
import { createMetricsStore } from "@/features/metrics/store";
import { addDays,isDate,kstToday } from "@/features/metrics/dates";
import { getGa4Config } from "@/features/metrics/ga4";
import { createInstagramRepository,toPublicConnection } from "@/features/instagram/repository";
import { HomepageCard,InstagramCard,NaverCard } from "@/components/performance/ChannelCards";
import { CollectNowButton } from "@/components/performance/CollectNowButton";

export const dynamic="force-dynamic";
// 우리가 처음 만든 세 채널(인스타그램·홈페이지·네이버 플레이스)의 숫자를 모아 보는 화면. 보고서에 쓸 CSV도 여기서 받는다.
const OPENED="2026-08-25"; // 네이버 플레이스 유입이 처음 잡힌 날
export default async function PerformancePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireOwnerPage();
  const params=await searchParams,today=kstToday(),month=today.slice(0,7);
  const lastMonthEnd=addDays(`${month}-01`,-1);
  const ranges={this:[`${month}-01`,today],last:[`${lastMonthEnd.slice(0,7)}-01`,lastMonthEnd],all:[OPENED,today]} as const;
  const preset=ranges[(params.range as keyof typeof ranges)??"all"]??ranges.all;
  const from=isDate(params.from??"")?params.from!:preset[0],to=isDate(params.to??"")?params.to!:preset[1];
  const store=createMetricsStore();
  const [instagram,ga4,naver,state,connection]=await Promise.all([store.listDays("instagram",from,to),store.listDays("ga4",from,to),store.readNaver(),store.readState(),createInstagramRepository().readConnection().catch(()=>null)]);
  const pub=toPublicConnection(connection);
  return <WizardShell step="topic" section="performance">
    <h1>성과</h1>
    <p className="lead">홈페이지·인스타그램·네이버 플레이스는 우리가 처음 만든 채널이에요. 여기 숫자는 모두 개설 뒤에 생긴 성과예요.</p>
    <nav className="metric-range" aria-label="기간">
      <Link href="/performance?range=this">이번 달</Link><Link href="/performance?range=last">지난 달</Link><Link href="/performance?range=all">개설 이후</Link>
      <form method="get"><label>시작<input type="date" name="from" defaultValue={from}/></label><label>끝<input type="date" name="to" defaultValue={to}/></label><button className="button secondary">보기</button></form>
    </nav>
    <p className="field-help">{from} ~ {to}</p>
    <div className="metric-grid">
      <InstagramCard days={instagram} state={state.instagram} insights={!!pub.insights}/>
      <HomepageCard days={ga4} state={state.ga4} configured={!!getGa4Config()}/>
      <NaverCard periods={naver.filter(p=>p.end>=from&&p.start<=to)}/>
    </div>
    <div className="metric-actions">
      <a className="button primary" href={`/api/metrics/export?from=${from}&to=${to}`}>CSV 내려받기</a>
      <CollectNowButton/>
    </div>
  </WizardShell>;
}
```

`src/components/performance/CollectNowButton.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
// 하루 한 번 자동으로 가져오지만, 다시 연결한 직후처럼 바로 보고 싶을 때 누른다.
export function CollectNowButton(){
  const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  return <><button type="button" className="button secondary" disabled={busy} onClick={async()=>{
    setBusy(true);setMessage("");
    try{const response=await fetch("/api/metrics/collect",{method:"POST"});const run=await response.json() as {messages?:string[]};setMessage(run.messages?.length?run.messages.join(" / "):"가져왔어요.");router.refresh();}
    catch{setMessage("가져오지 못했어요. 잠시 뒤 다시 눌러 주세요.");}
    finally{setBusy(false);}
  }}>{busy?"가져오는 중…":"지금 가져오기"}</button>{message&&<p role="status" className="field-help">{message}</p>}</>;
}
```

- [ ] **Step 7: Menu, settings hint, auto-performance label, styles**

`WizardShell.tsx`: `Section`에 `"performance"`를 더한다. `MAIN`의 '내 게시물' 다음에 `{section:"performance",href:"/performance",label:"성과"}`를 넣는다.

`InstagramConnectionCard.tsx`: 사장님용(main) 연결됨 상태에 다음 한 줄을 넣는다(연결 상태를 그리는 바로 아래).
```tsx
{status.connected&&status.insights===false&&<p className="notice">성과를 자동으로 가져오려면 ‘연결 끊기’ 뒤 ‘인스타그램 연결하기’를 한 번 다시 눌러 주세요.</p>}
```

`PerformanceForm.tsx:35`의 summary 문구를 다음으로 바꾼다.
```tsx
<summary>성과 기록{performance?` · 반응 점수 ${engagementScore(performance).toLocaleString("ko-KR")}${performance.source==="instagram"?` · 인스타그램에서 자동으로 가져옴(${performance.recorded_at.slice(0,10)})`:""}`:" (올린 뒤 숫자 적기)"}</summary>
```

`globals.css` 끝에 다음을 더한다.
```css
.metric-grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr)); margin:16px 0; }
.metric-card { display:grid; gap:10px; padding:20px; border:1px solid var(--line); border-radius:var(--panel-radius); background:#fff; min-width:0; }
.metric-card h2 { margin:0; }
.metric-wide { grid-column:1/-1; }
.metric-big { font-size:28px; font-weight:800; margin:0; }
.metric-chart { margin:0; } .metric-chart svg { width:100%; height:auto; }
.metric-line { fill:none; stroke:var(--accent); stroke-width:3; } .metric-axis { stroke:var(--line); } .metric-tick { font-size:12px; fill:var(--muted); }
.metric-table { width:100%; border-collapse:collapse; } .metric-table th,.metric-table td { padding:6px 8px; border-bottom:1px solid var(--line); text-align:left; } .metric-table td { text-align:right; }
.table-scroll { overflow-x:auto; }
.metric-range { display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; } .metric-range a { min-height:44px; display:inline-flex; align-items:center; font-weight:700; }
.metric-range form { display:flex; flex-wrap:wrap; gap:8px; align-items:end; }
.metric-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.naver-form { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); margin-top:10px; }
.naver-form label { display:grid; gap:4px; } .naver-form textarea { width:100%; }
```

- [ ] **Step 8: Run tests and type check**

Run: `npx vitest run tests/unit/performancePage.test.tsx tests/unit/WizardShell.test.tsx tests/unit/InstagramConnectionCard.test.tsx && npx tsc --noEmit`
Expected: PASS, 타입 오류 없음

- [ ] **Step 9: Commit**

```bash
git add src/app/performance src/components/performance src/components/wizard/WizardShell.tsx src/components/settings/InstagramConnectionCard.tsx src/components/drafts/PerformanceForm.tsx src/app/globals.css tests/unit
git commit -m "성과: 성과 화면(인스타그램·홈페이지·네이버), 메뉴, 다시 연결 안내"
```

---

### Task 8: 설정 안내 문서, 환경변수, 전체 확인

**Files:**
- Modify: `render.yaml`(envVars)
- Create: `docs/PERFORMANCE_METRICS.ko.md`
- Test: 기존 `tests/unit/deploymentConfig.test.ts`가 render.yaml 키를 확인하면 함께 통과해야 한다.

- [ ] **Step 1: Add env vars to `render.yaml`** (`INSTAGRAM_APP_ID` 항목 근처에)

```yaml
      - key: GA4_PROPERTY_ID
        value: "555483214"
      - key: GA4_START_DATE
        value: "2026-09-07"
      - key: GA4_SERVICE_ACCOUNT_JSON
        sync: false
```

- [ ] **Step 2: Write `docs/PERFORMANCE_METRICS.ko.md`**

이 문서는 사용자가 따라 할 순서를 담는다. 넣을 내용:
1. 인스타그램 다시 연결: 배포 뒤 설정 → 연결 끊기 → 인스타그램 연결하기 → 인사이트 권한 허용. Meta 앱에서 'Instagram 비즈니스 로그인' 권한 목록에 `instagram_business_manage_insights`가 켜져 있는지 확인.
2. GA4 서비스 계정 만들기:
   - Google Cloud 콘솔에서 프로젝트를 고르고 'Google Analytics Data API'를 켠다.
   - IAM → 서비스 계정 만들기 → 키(JSON)를 받는다.
   - GA4 관리 → 속성 액세스 관리 → 서비스 계정 이메일을 '뷰어'로 추가한다.
   - Render 환경변수 `GA4_SERVICE_ACCOUNT_JSON`에 JSON 전체를 붙여 넣는다.
3. 네이버 기록: Claude에게 "네이버 숫자 확인해 줘"라고 하면, 앱 안 브라우저에서 스마트플레이스 통계를 열고 사장님이 로그인한 뒤 Claude가 읽어 성과 화면에 기록한다. 직접 넣을 때는 '네이버 기록 추가·고치기'를 쓴다. 비교 규칙(하루 평균·한 달 환산)도 설명한다.
4. 숫자 읽는 법: 도달 합계는 날마다 값의 합이라 같은 사람이 겹칠 수 있다. 팔로워 일별 변화는 100명 이상일 때만 인스타그램이 준다. 우리는 날마다 총 팔로워 수를 저장한다.

- [ ] **Step 3: Run the full check**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src tests`
Expected: 모두 통과

- [ ] **Step 4: Run the app and look at `/performance`**

`run` 스킬로 개발 서버를 띄운다. 로그인한 뒤 `/performance`에서 네이버 첫 기록 3건과 하루 평균(12.4·14.8·23.6), 한 달 환산(약 385·444·약 733)이 보이는지, 휴대폰 폭(375px)에서 가로 스크롤 없이 보이는지 확인한다. 화면 캡처를 남긴다.

- [ ] **Step 5: Commit**

```bash
git add render.yaml docs/PERFORMANCE_METRICS.ko.md
git commit -m "성과: GA4 환경변수와 설정 안내 문서"
```
