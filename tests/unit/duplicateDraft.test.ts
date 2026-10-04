// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { duplicateDraft } from "@/features/drafts/duplicate";
import type { Draft } from "@/features/drafts/schema";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));

const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const source:Draft={id:"11111111-1111-4111-8111-111111111111",status:"ready",topic:"김장날엔 왜 수육일까?",audience:"A",image_brief:"김장 상차림",content_brief:"김장과 수육, 홍어 삼합으로 잇는다.",
  media_candidates:[{id:a,source:"photo",file_id:"data:image/png;base64,AAAA",purpose:"instagram-cover"},{id:b,source:"design",file_id:"data:image/png;base64,BBBB",purpose:"instagram-slide"}],
  selected_media_id:a,selected_media_ids:[a,b],copy:null,caption:"작년 김장철 문안",planned_publish_at:"2025-11-04T09:00:00.000Z",final_review_complete:true,plan_date:"2025-11-04",
  facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2025-10-01T00:00:00.000Z",updated_at:"2025-10-02T00:00:00.000Z"};

describe("duplicateDraft", () => {
  it("keeps topic, images and caption but drops the schedule, review and plan link", () => {
    let n=0;
    const copy=duplicateDraft(source,{id:"22222222-2222-4222-8222-222222222222",now:"2026-10-04T00:00:00.000Z",newId:()=>`cccccccc-cccc-4ccc-8ccc-00000000000${++n}`});
    expect(copy).toMatchObject({id:"22222222-2222-4222-8222-222222222222",topic:source.topic,image_brief:"김장 상차림",content_brief:source.content_brief,caption:"작년 김장철 문안",planned_publish_at:null,final_review_complete:false,created_at:"2026-10-04T00:00:00.000Z"});
    expect(copy.plan_date).toBeUndefined();
    // 이미지 파일은 그대로, ID만 새로(선택 순서 유지).
    expect(copy.media_candidates.map(media=>media.file_id)).toEqual(source.media_candidates.map(media=>media.file_id));
    expect(copy.selected_media_ids).toEqual(["cccccccc-cccc-4ccc-8ccc-000000000001","cccccccc-cccc-4ccc-8ccc-000000000002"]);
    expect(copy.selected_media_id).toBe(copy.selected_media_ids![0]);
  });
});

let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;delete process.env.DATA_DIR;vi.resetModules();});

it("duplicates a saved draft through the route and leaves the original untouched", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-dup-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const { createDraftRepository }=await import("@/features/drafts/repository");
  const repository=createDraftRepository(directory);
  await repository.saveDraft(source);
  const { POST }=await import("@/app/api/drafts/duplicate/route");
  const response=await POST(new Request("http://localhost/api/drafts/duplicate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:source.id})}));
  expect(response.status).toBe(201);
  const { id }=await response.json();
  expect(id).not.toBe(source.id);
  expect(await repository.readDraft(id)).toMatchObject({topic:source.topic,caption:"작년 김장철 문안",planned_publish_at:null,final_review_complete:false});
  expect(await repository.readDraft(source.id)).toMatchObject({planned_publish_at:"2025-11-04T09:00:00.000Z",final_review_complete:true});
  const missing=await POST(new Request("http://localhost/api/drafts/duplicate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"33333333-3333-4333-8333-333333333333"})}));
  expect(missing.status).toBe(404);
});
