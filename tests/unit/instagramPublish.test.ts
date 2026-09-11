// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { publishApprovedDraft } from "@/features/instagram/publish";
import type { Publication } from "@/features/instagram/schema";

function setup(){
  const draftId=randomUUID(),mediaId=randomUUID(),now="2026-09-11T00:00:00.000Z";
  const draft={id:draftId,status:"verify" as const,topic:"홍어",audience:"A" as const,media_candidates:[{id:mediaId,source:"photo" as const,file_id:"data:image/png;base64,AQ==",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:{topic:"홍어",audience:"A" as const,hook:"한 점",information:"홍어 소개",store_connection:"묵동에서 만나요",call_to_action:"저장하세요",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null},facts_to_verify:[],store_profile_version:"v1",created_at:now,updated_at:now};
  const connection={instagramUserId:"ig-1",username:"mukdong",accessToken:"token",expiresAt:"2026-10-01T00:00:00.000Z",scopes:["instagram_business_basic","instagram_business_content_publish"] as ("instagram_business_basic"|"instagram_business_content_publish")[],connectedAt:now,updatedAt:now};
  const meta={createImageContainer:vi.fn(async()=>"container-1"),getContainerStatus:vi.fn(async()=>"FINISHED" as const),publishContainer:vi.fn(async()=>"post-1")};
  const repo={readPublication:vi.fn<(id:string)=>Promise<Publication|null>>(async()=>null),savePublication:vi.fn(async (value:Publication)=>value)};
  return {draftId,meta,repo,deps:{readDraft:vi.fn(async()=>draft),readConnection:vi.fn(async()=>connection),repo,meta,baseUrl:"https://app.example.com",signingSecret:"secret",now:()=>new Date(now),wait:vi.fn(async()=>{})}};
}

describe("Instagram publishing",()=>{
  it("명시적 승인 없이는 거절한다",async()=>{const {draftId,deps,meta}=setup();await expect(publishApprovedDraft({draftId,approved:false},deps)).rejects.toThrow("게시 승인이 필요해요");expect(meta.createImageContainer).not.toHaveBeenCalled();});
  it("컨테이너를 만들고 처리 완료 후 한 번 게시한다",async()=>{const {draftId,deps,meta}=setup();const result=await publishApprovedDraft({draftId,approved:true},deps);expect(meta.createImageContainer).toHaveBeenCalledWith(expect.objectContaining({caption:expect.stringContaining("홍어 소개"),imageUrl:expect.stringMatching(/^https:\/\//)}));expect(meta.publishContainer).toHaveBeenCalledTimes(1);expect(result).toMatchObject({status:"published",alreadyPublished:false,mediaId:"post-1"});});
  it("이미 게시된 초안은 다시 게시하지 않는다",async()=>{const {draftId,deps,repo,meta}=setup();repo.readPublication.mockResolvedValue({draftId,status:"published",containerId:"old",mediaId:"post-old",safeError:null,attemptedAt:"2026-09-11T00:00:00.000Z",publishedAt:"2026-09-11T00:01:00.000Z"});expect(await publishApprovedDraft({draftId,approved:true},deps)).toMatchObject({alreadyPublished:true,mediaId:"post-old"});expect(meta.createImageContainer).not.toHaveBeenCalled();});
});
