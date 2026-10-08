// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null, requireOwnerPage: async () => {} }));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>{}})}));

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive:true, force:true });
  directory=undefined;
  delete process.env.DATA_DIR;
  vi.resetModules();
});

it("saves caption edits through the draft route and leaves a missing draft untouched", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-route-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="11111111-1111-4111-8111-111111111111";
  const repository=createDraftRepository(directory);
  await repository.saveDraft({id,status:"ready",topic:"홍어 한 점",audience:"A",media_candidates:[],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"});
  const { PATCH }=await import("@/app/api/drafts/route");

  const response=await PATCH(new Request("http://localhost/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,caption:"직접 고친 문안"})}));
  expect(response.status).toBe(200);
  expect((await repository.readDraft(id))?.caption).toBe("직접 고친 문안");

  const missing=await PATCH(new Request("http://localhost/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"22222222-2222-4222-8222-222222222222",caption:"없는 초안"})}));
  expect(missing.status).toBe(404);
});

it("renders a saved draft with a way to reopen it", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-list-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="11111111-1111-4111-8111-111111111111";
  await createDraftRepository(directory).saveDraft({id,status:"ready",topic:"홍어 첫 한 점",audience:"A",media_candidates:[],selected_media_id:null,copy:null,caption:"직접 쓴 소개 문구",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-12T00:00:00.000Z"});
  const { default:DraftsPage }=await import("@/app/drafts/page");

  const html=renderToStaticMarkup(await DraftsPage());
  expect(html).toContain("홍어 첫 한 점");
  expect(html).toContain("직접 쓴 소개 문구");
  expect(html).toContain(`/?draft=${id}`);
  // 올릴 날짜 정하기는 카드마다 접어 둔 "올릴 날짜 · 반응 적기" 안에 그대로 있다.
  expect(html).toContain("올릴 날짜 · 반응 적기");
  expect(html).toContain("올릴 날짜와 시각");
  expect(html).toContain("최종 확인 완료");
  expect(html).toContain("저절로 올라가요");
  expect(html).toContain("같은 주제로 새로");
  expect(html).toContain("내 게시물");
  expect(html).not.toContain("초안");
});

it("shows planned drafts in upcoming order on the month plan page and keeps overdue plans visible", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-overview-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const repository=createDraftRepository(directory);
  const base={status:"ready" as const,audience:"A" as const,media_candidates:[],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"};
  await repository.saveDraft({...base,id:"11111111-1111-4111-8111-111111111111",topic:"늦은 예정",planned_publish_at:"2099-01-02T09:00:00.000Z"});
  await repository.saveDraft({...base,id:"22222222-2222-4222-8222-222222222222",topic:"지난 계획",planned_publish_at:"2020-01-02T09:00:00.000Z"});
  await repository.saveDraft({...base,id:"33333333-3333-4333-8333-333333333333",topic:"이른 예정",planned_publish_at:"2098-01-02T09:00:00.000Z"});
  await repository.saveDraft({...base,id:"44444444-4444-4444-8444-444444444444",topic:"일정 없음"});
  vi.doMock("@/components/drafts/MonthPlanner",()=>({MonthPlanner:()=>null}));
  const { default:PlanPage }=await import("@/app/plan/page");

  const html=renderToStaticMarkup(await PlanPage());
  const overview=html.match(/<section[^>]*aria-label="올릴 날짜"[^>]*>[\s\S]*?<\/section>/)?.[0];
  expect(overview).toBeDefined();
  expect(overview).toContain('aria-label="콘텐츠 캘린더"');
  expect(overview).toContain("2098년 1월");
  expect(overview).toMatch(/이른 예정[\s\S]*늦은 예정[\s\S]*지난 계획/);
  expect(overview).toContain("날짜 지남");
  expect(overview).not.toContain("일정 없음");
});

it("saves a planned time and final-review status for a complete draft", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-plan-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="11111111-1111-4111-8111-111111111111";
  const mediaId="22222222-2222-4222-8222-222222222222";
  const repository=createDraftRepository(directory);
  await repository.saveDraft({id,status:"ready",topic:"홍어 한 점",audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"photo.jpg",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"홍어 소개",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"});
  const { PATCH }=await import("@/app/api/drafts/route");

  const response=await PATCH(new Request("http://localhost/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:true})}));

  expect(response.status).toBe(200);
  expect(await repository.readDraft(id)).toMatchObject({planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:true,caption:"홍어 소개",selected_media_id:mediaId});
});

it("keeps the planned time but clears final review when selected images change", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-reselect-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="11111111-1111-4111-8111-111111111111";
  const oldMedia="22222222-2222-4222-8222-222222222222";
  const newMedia="33333333-3333-4333-8333-333333333333";
  const repository=createDraftRepository(directory);
  const original={id,status:"ready" as const,topic:"홍어 한 점",audience:"A" as const,media_candidates:[{id:oldMedia,source:"photo" as const,file_id:"old.jpg",purpose:"instagram-primary"}],selected_media_id:oldMedia,copy:null,caption:"홍어 소개",planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:true,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"};
  await repository.saveDraft(original);
  const { POST }=await import("@/app/api/drafts/route");

  const response=await POST(new Request("http://localhost/api/drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...original,media_candidates:[{id:newMedia,source:"photo",file_id:"new.jpg",purpose:"instagram-primary"}],selected_media_id:newMedia,planned_publish_at:undefined,final_review_complete:undefined})}));

  expect(response.status).toBe(201);
  expect(await repository.readDraft(id)).toMatchObject({planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:false,selected_media_id:newMedia});
});

it("rejects final review for an unfinished draft and rejects past planned times", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-plan-guard-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="11111111-1111-4111-8111-111111111111";
  const repository=createDraftRepository(directory);
  await repository.saveDraft({id,status:"ready",topic:"홍어 한 점",audience:"A",media_candidates:[],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"});
  const { PATCH }=await import("@/app/api/drafts/route");
  const update=(planned_publish_at:string,final_review_complete:boolean)=>PATCH(new Request("http://localhost/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,planned_publish_at,final_review_complete})}));

  expect((await update("2030-05-15T09:00:00.000Z",true)).status).toBe(400);
  expect((await update("2020-05-15T09:00:00.000Z",false)).status).toBe(400);
  expect(await repository.readDraft(id)).not.toHaveProperty("planned_publish_at");
});

it("lets the owner cancel an overdue schedule but not re-enable it on a past date", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-plan-cancel-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const id="22222222-2222-4222-8222-222222222222",media="33333333-3333-4333-8333-333333333333";
  const repository=createDraftRepository(directory);
  const past="2020-05-15T09:00:00.000Z";
  await repository.saveDraft({id,status:"ready",topic:"홍어 한 점",audience:"A",media_candidates:[{id:media,source:"photo",file_id:"data:image/png;base64,AQ==",purpose:"instagram-cover"}],selected_media_id:media,selected_media_ids:[media],copy:null,caption:"문안",planned_publish_at:past,final_review_complete:true,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z"});
  const { PATCH }=await import("@/app/api/drafts/route");
  const update=(planned_publish_at:string,final_review_complete:boolean)=>PATCH(new Request("http://localhost/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,planned_publish_at,final_review_complete})}));

  // 서버가 잠들어 지나간 예약: 최종 확인을 끄는 것은 지난 날짜 그대로 보내도 된다.
  expect((await update(past,false)).status).toBe(200);
  expect(await repository.readDraft(id)).toMatchObject({planned_publish_at:past,final_review_complete:false});
  // 다시 켜려면 미래 시각이 필요하다.
  expect((await update(past,true)).status).toBe(400);
  expect((await update("2019-01-01T09:00:00.000Z",false)).status).toBe(400);
});

it("fills the planned time from the month plan only when a draft is first saved", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-plan-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const { POST }=await import("@/app/api/drafts/route");
  const id="44444444-4444-4444-8444-444444444444";
  const body=(over:Record<string,unknown>)=>new Request("http://localhost/api/drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:"ready",topic:"막걸리엔 왜 전일까?",audience:"A",media_candidates:[],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-10T00:00:00.000Z",updated_at:"2026-09-10T00:00:00.000Z",...over})});
  expect((await POST(body({plan_date:"2099-01-06"}))).status).toBe(201);
  expect(await createDraftRepository(directory).readDraft(id)).toMatchObject({plan_date:"2099-01-06",planned_publish_at:"2099-01-06T09:00:00.000Z"});
  // 다시 저장(이미지 다시 고르기)해도 처음 연결한 기획 날짜·시각은 바뀌지 않는다.
  await POST(body({plan_date:"2099-02-03"}));
  expect(await createDraftRepository(directory).readDraft(id)).toMatchObject({plan_date:"2099-01-06",planned_publish_at:"2099-01-06T09:00:00.000Z"});
  // 지난 날짜에서 시작한 초안은 연결만 하고 자동 게시 시각은 비워 둔다.
  const pastId="55555555-5555-4555-8555-555555555555";
  await POST(new Request("http://localhost/api/drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...JSON.parse(await body({}).text()),id:pastId,plan_date:"2020-01-07"})}));
  expect(await createDraftRepository(directory).readDraft(pastId)).toMatchObject({plan_date:"2020-01-07",planned_publish_at:null});
});
