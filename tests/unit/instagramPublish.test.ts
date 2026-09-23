// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { publishApprovedDraft } from "@/features/instagram/publish";
import type { Publication } from "@/features/instagram/schema";
import { verifyMediaSignature } from "@/features/instagram/publicMedia";
import { PublicationLockError } from "@/features/instagram/repository";

function setup(count=1){
  const draftId=randomUUID(),mediaId=randomUUID(),now="2026-09-11T00:00:00.000Z";
  const media_candidates=Array.from({length:count},(_,index)=>({id:index===0?mediaId:randomUUID(),source:"photo" as const,file_id:"data:image/png;base64,AQ==",purpose:index===0?"instagram-cover":`instagram-slide-${index+1}`}));
  const draft={id:draftId,status:"verify" as const,topic:"홍어",audience:"A" as const,media_candidates,selected_media_id:mediaId,selected_media_ids:media_candidates.map(media=>media.id),copy:{topic:"홍어",audience:"A" as const,hook:"한 점",information:"홍어 소개",store_connection:"묵동에서 만나요",call_to_action:"저장하세요",hashtags:["#홍어"],facts_used:[],facts_to_verify:[],image_disclosure:null},facts_to_verify:[],store_profile_version:"v1",created_at:now,updated_at:now};
  const connection={instagramUserId:"ig-1",username:"mukdong",accessToken:"token",expiresAt:"2026-10-01T00:00:00.000Z",scopes:["instagram_business_basic","instagram_business_content_publish"] as ("instagram_business_basic"|"instagram_business_content_publish")[],connectedAt:now,updatedAt:now};
  const meta={createImageContainer:vi.fn(async()=>`container-${meta.createImageContainer.mock.calls.length}`),createCarouselContainer:vi.fn(async()=>"parent-1"),getContainerStatus:vi.fn(async()=>"FINISHED" as const),publishContainer:vi.fn(async()=>"post-1")};
  let publication:Publication|null=null,locked=false;
  const repo={
    readPublication:vi.fn<(id:string)=>Promise<Publication|null>>(async()=>publication),
    savePublication:vi.fn(async(value:Publication)=>{publication=value;return value;}),
    async withPublicationLock<T>(_draftId:string,task:()=>Promise<T>){if(locked)throw new PublicationLockError();locked=true;try{return await task();}finally{locked=false;}},
  };
  return {draftId,draft,meta,repo,deps:{readDraft:vi.fn(async()=>draft),readConnection:vi.fn(async()=>connection),repo,meta,baseUrl:"https://app.example.com",signingSecret:"secret",now:()=>new Date(now),wait:vi.fn(async()=>{})}};
}

describe("Instagram publishing",()=>{
  it("명시적 승인 없이는 거절한다",async()=>{const {draftId,deps,meta}=setup();await expect(publishApprovedDraft({draftId,approved:false},deps)).rejects.toThrow("게시 승인이 필요해요");expect(meta.createImageContainer).not.toHaveBeenCalled();});
  it("컨테이너를 저장한 뒤 처리 완료 후 한 번 게시한다",async()=>{const {draftId,draft,deps,meta,repo}=setup();meta.publishContainer.mockImplementationOnce(async()=>{expect(repo.savePublication).toHaveBeenLastCalledWith(expect.objectContaining({status:"preparing",containerId:"container-1",mediaId:null}));return "post-1";});const result=await publishApprovedDraft({draftId,approved:true},deps);const input=(meta.createImageContainer.mock.calls as unknown as Array<[{caption?:string;imageUrl:string}]>)[0][0],url=new URL(input.imageUrl),signature=url.searchParams.get("sig")!;expect(input).toMatchObject({caption:expect.stringContaining("홍어 소개")});expect(url.searchParams.has("media")).toBe(false);expect(verifyMediaSignature({draftId,expiresAt:Number(url.searchParams.get("expires")),signature,secret:"secret",now:1_700_000_000})).toBe(true);expect(verifyMediaSignature({draftId,mediaId:draft.selected_media_id!,expiresAt:Number(url.searchParams.get("expires")),signature,secret:"secret",now:1_700_000_000})).toBe(false);expect(meta.publishContainer).toHaveBeenCalledTimes(1);expect(result).toMatchObject({status:"published",alreadyPublished:false,mediaId:"post-1"});});
  it("이미 게시된 초안은 다시 게시하지 않는다",async()=>{const {draftId,deps,repo,meta}=setup();repo.readPublication.mockResolvedValue({draftId,status:"published",containerId:"old",mediaId:"post-old",safeError:null,attemptedAt:"2026-09-11T00:00:00.000Z",publishedAt:"2026-09-11T00:01:00.000Z"});expect(await publishApprovedDraft({draftId,approved:true},deps)).toMatchObject({alreadyPublished:true,mediaId:"post-old"});expect(meta.createImageContainer).not.toHaveBeenCalled();});
  it("이미 준비 중인 초안은 새 컨테이너를 만들지 않는다",async()=>{const {draftId,deps,repo,meta}=setup(5);repo.readPublication.mockResolvedValue({draftId,status:"preparing",containerId:null,mediaId:null,safeError:null,attemptedAt:"2026-09-11T00:00:00.000Z",publishedAt:null});await expect(publishApprovedDraft({draftId,approved:true},deps)).rejects.toThrow("이미 게시 준비 중");expect(meta.createImageContainer).not.toHaveBeenCalled();expect(meta.createCarouselContainer).not.toHaveBeenCalled();});

  it("동시 승인 요청에서도 Meta 게시를 한 번만 실행한다",async()=>{
    const {draftId,deps,meta,repo}=setup();
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    repo.savePublication.mockImplementationOnce(async(value:Publication)=>{await gate;return value;});
    const first=publishApprovedDraft({draftId,approved:true},deps);
    await vi.waitFor(()=>expect(repo.savePublication).toHaveBeenCalledTimes(1));
    const second=publishApprovedDraft({draftId,approved:true},deps);
    release();
    const results=await Promise.allSettled([first,second]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
    expect((results.find(result=>result.status==="rejected") as PromiseRejectedResult).reason).toMatchObject({kind:"in-progress"});
    expect(meta.publishContainer).toHaveBeenCalledTimes(1);
  });

  it("Meta 게시 뒤 최종 저장이 실패해도 ID를 보존하고 다음 호출에서 로컬 복구한다",async()=>{
    const {draftId,deps,meta,repo}=setup();
    let failPublishedSave=true;
    repo.savePublication.mockImplementation(async(value:Publication)=>{
      if(value.status==="published"&&failPublishedSave){failPublishedSave=false;throw new Error("disk full");}
      // Keep the test repository's observable state in sync with reads.
      (repo.readPublication as ReturnType<typeof vi.fn>).mockResolvedValue(value);
      return value;
    });
    await expect(publishApprovedDraft({draftId,approved:true},deps)).rejects.toThrow("Instagram 게시에 실패");
    const recoverySave=repo.savePublication.mock.calls.at(-1)?.[0];
    expect(recoverySave).toMatchObject({status:"preparing",containerId:"container-1",mediaId:"post-1"});
    expect(meta.publishContainer).toHaveBeenCalledTimes(1);
    const recovered=await publishApprovedDraft({draftId,approved:true},deps);
    expect(recovered).toMatchObject({status:"published",alreadyPublished:true,mediaId:"post-1"});
    expect(meta.publishContainer).toHaveBeenCalledTimes(1);
    expect(repo.savePublication).toHaveBeenLastCalledWith(expect.objectContaining({status:"published",containerId:"container-1",mediaId:"post-1"}));
    await expect(repo.readPublication(draftId)).resolves.toMatchObject({status:"published",containerId:"container-1",mediaId:"post-1"});
  });

  it("다섯 장을 순서대로 자식으로 준비하고 부모만 게시한다",async()=>{
    const {draftId,draft,deps,meta,repo}=setup(5);
    await expect(publishApprovedDraft({draftId,approved:true,caption:"승인한 캐러셀 문안"},deps)).resolves.toMatchObject({mediaId:"post-1"});
    expect(meta.createImageContainer).toHaveBeenCalledTimes(5);
    const imageCalls=meta.createImageContainer.mock.calls as unknown as Array<[{isCarouselItem?:boolean;imageUrl:string}]>;
    expect(imageCalls.map(([input])=>input.isCarouselItem)).toEqual([true,true,true,true,true]);
    expect(imageCalls.every(([input])=>!("caption" in input))).toBe(true);
    expect(imageCalls.map(([input])=>new URL(input.imageUrl).searchParams.get("media"))).toEqual(draft.selected_media_ids);
    expect(imageCalls.every(([input],index)=>{const url=new URL(input.imageUrl);return verifyMediaSignature({draftId,mediaId:draft.selected_media_ids[index],expiresAt:Number(url.searchParams.get("expires")),signature:url.searchParams.get("sig")!,secret:"secret",now:1_700_000_000});})).toBe(true);
    expect(meta.createCarouselContainer).toHaveBeenCalledWith(expect.objectContaining({children:["container-1","container-2","container-3","container-4","container-5"],caption:"승인한 캐러셀 문안"}));
    expect(meta.getContainerStatus).toHaveBeenCalledWith("parent-1","token");
    expect(meta.publishContainer).toHaveBeenCalledWith(expect.objectContaining({containerId:"parent-1"}));
    expect(repo.savePublication).toHaveBeenLastCalledWith(expect.objectContaining({status:"published",containerId:"parent-1"}));
  });

  it.each([2,10])("%i장 캐러셀 경계값을 순서대로 게시한다",async(count)=>{
    const {draftId,draft,deps,meta}=setup(count);
    await publishApprovedDraft({draftId,approved:true},deps);
    expect(meta.createImageContainer).toHaveBeenCalledTimes(count);
    expect((meta.createImageContainer.mock.calls as unknown as Array<[{imageUrl:string}]>).map(([value])=>new URL(value.imageUrl).searchParams.get("media"))).toEqual(draft.selected_media_ids);
    expect(meta.createCarouselContainer).toHaveBeenCalledTimes(1);
    expect(meta.publishContainer).toHaveBeenCalledTimes(1);
  });

  it("자식 생성 실패 시 부모 생성이나 게시를 하지 않고 실패를 기록한다",async()=>{
    const {draftId,deps,meta,repo}=setup(5);
    meta.createImageContainer.mockRejectedValueOnce(new Error("child failed"));
    await expect(publishApprovedDraft({draftId,approved:true},deps)).rejects.toThrow("Instagram 게시에 실패");
    expect(meta.createCarouselContainer).not.toHaveBeenCalled();
    expect(meta.publishContainer).not.toHaveBeenCalled();
    expect(repo.savePublication).toHaveBeenLastCalledWith(expect.objectContaining({status:"failed",safeError:expect.any(String)}));
  });

  it("불완전한 선택 순서는 Meta 호출 없이 거절한다",async()=>{
    const {draftId,draft,deps,meta}=setup(5);
    deps.readDraft.mockResolvedValue({...draft,selected_media_ids:[randomUUID()]});
    await expect(publishApprovedDraft({draftId,approved:true},deps)).rejects.toThrow("선택 이미지");
    expect(meta.createImageContainer).not.toHaveBeenCalled();
    expect(meta.createCarouselContainer).not.toHaveBeenCalled();
  });

  it("중복된 선택 순서는 Meta 호출 없이 거절한다",async()=>{
    const {draftId,draft,deps,meta}=setup(5);
    deps.readDraft.mockResolvedValue({...draft,selected_media_ids:[draft.selected_media_id!,draft.selected_media_id!]});
    await expect(publishApprovedDraft({draftId,approved:true},deps)).rejects.toThrow("선택 이미지");
    expect(meta.createImageContainer).not.toHaveBeenCalled();
    expect(meta.createCarouselContainer).not.toHaveBeenCalled();
  });
});
