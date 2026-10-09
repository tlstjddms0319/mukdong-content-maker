// @vitest-environment node
// 예약 안전(검수 A-2·A-3): 같은 게시물의 저장이 겹쳐도 서로 덮어쓰지 않고, 목록을 다시 읽는 도중 저장한 것도 목록에 반영된다.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createDraftRepository, withDraftLock } from "@/features/drafts/repository";
import type { Draft } from "@/features/drafts/schema";

let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;});

const mediaId="22222222-2222-4222-8222-222222222222";
const draft=(id:string,extra:Partial<Draft>={}):Draft=>({id,status:"ready",topic:"홍어",audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"photo.jpg",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"글",facts_to_verify:[],store_profile_version:"v",created_at:"2026-10-01T00:00:00.000Z",updated_at:"2026-10-01T00:00:00.000Z",...extra});

it("runs read-modify-write work on one draft one at a time", async () => {
  let value=0;
  const bump=()=>withDraftLock("same",async()=>{const read=value;await new Promise(resolve=>setTimeout(resolve,5));value=read+1;});
  await Promise.all([bump(),bump(),bump()]);
  expect(value).toBe(3);
  // 다른 게시물은 서로 기다리지 않는다. 앞 작업이 실패해도 다음 작업은 돈다.
  await expect(withDraftLock("x",async()=>{throw new Error("boom");})).rejects.toThrow("boom");
  expect(await withDraftLock("x",async()=>"ok")).toBe("ok");
});

it("keeps a cancel that was saved while the list was being re-read", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-race-"));
  const repo=createDraftRepository(directory);
  const ids=Array.from({length:30},(_,i)=>`${String(i).padStart(8,"0")}-1111-4111-8111-111111111111`);
  for(const id of ids)await repo.saveDraft(draft(id,{planned_publish_at:"2030-01-01T09:00:00.000Z",final_review_complete:true}));
  // 새 저장소 폴더라 첫 목록은 저장소에서 읽는다. 읽는 도중 마지막 게시물의 예약을 취소한다.
  const listing=repo.listDraftSummaries();
  const target=ids.at(-1)!;
  await repo.saveDraft(draft(target,{planned_publish_at:"2030-01-01T09:00:00.000Z",final_review_complete:false}));
  await listing;
  const after=await repo.listDraftSummaries();
  expect(after.find(item=>item.id===target)?.final_review_complete).toBe(false);
});
