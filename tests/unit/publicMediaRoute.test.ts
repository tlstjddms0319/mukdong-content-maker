// @vitest-environment node
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { Draft } from "@/features/drafts/schema";
import { signMediaUrl } from "@/features/instagram/publicMedia";

const readDraft=vi.fn();
vi.mock("@/features/drafts/repository",()=>({createDraftRepository:()=>({readDraft})}));

import { GET } from "@/app/api/media/public/[draftId]/route";

async function carouselDraft():Promise<Draft>{
  const id=randomUUID();
  const first=await sharp({create:{width:40,height:40,channels:3,background:"#9b4035"}}).png().toBuffer();
  const second=await sharp({create:{width:40,height:40,channels:3,background:"#315b79"}}).png().toBuffer();
  const firstId=randomUUID(),secondId=randomUUID();
  return {id,status:"verify",topic:"홍어",audience:"A",media_candidates:[{id:firstId,source:"photo",file_id:`data:image/png;base64,${first.toString("base64")}`,purpose:"instagram-cover"},{id:secondId,source:"ai-generated",file_id:`data:image/png;base64,${second.toString("base64")}`,purpose:"instagram-detail"}],selected_media_id:firstId,selected_media_ids:[firstId,secondId],copy:null,facts_to_verify:[],store_profile_version:"v1",created_at:"2026-09-11T00:00:00.000Z",updated_at:"2026-09-11T00:00:00.000Z"};
}

describe("public Instagram media route",()=>{
  const previousSecret=process.env.MEDIA_SIGNING_SECRET;
  beforeEach(()=>{process.env.MEDIA_SIGNING_SECRET="route-secret";readDraft.mockReset();});
  afterEach(()=>{if(previousSecret===undefined)delete process.env.MEDIA_SIGNING_SECRET;else process.env.MEDIA_SIGNING_SECRET=previousSecret;});

  it("서명된 B URL은 B 이미지만 반환하고 media 변조는 거절한다",async()=>{
    const draft=await carouselDraft(),mediaB=draft.selected_media_ids![1],expiresAt=Math.floor(Date.now()/1000)+600;
    readDraft.mockResolvedValue(draft);
    const signed=new URL(signMediaUrl({draftId:draft.id,mediaId:mediaB,expiresAt,baseUrl:"https://app.example.com",secret:"route-secret"}));
    const response=await GET(new Request(signed),{params:Promise.resolve({draftId:draft.id})});
    expect(response.status).toBe(200);
    const expected=await sharp(Buffer.from(draft.media_candidates[1].file_id.split(",")[1],"base64")).rotate().resize(1080,1350,{fit:"cover"}).jpeg({quality:90}).toBuffer();
    const actualStats=await sharp(Buffer.from(await response.arrayBuffer())).stats(),expectedStats=await sharp(expected).stats();
    expect(actualStats.channels.map(channel=>channel.mean)).toEqual(expectedStats.channels.map(channel=>channel.mean));
    signed.searchParams.set("media",draft.selected_media_ids![0]);
    const tampered=await GET(new Request(signed),{params:Promise.resolve({draftId:draft.id})});
    expect(tampered.status).toBe(403);
  });

  it("여러 장 초안은 유효한 레거시 서명이어도 media 식별자 없이는 거절한다",async()=>{
    const draft=await carouselDraft(),expiresAt=Math.floor(Date.now()/1000)+600;
    readDraft.mockResolvedValue(draft);
    const signed=signMediaUrl({draftId:draft.id,expiresAt,baseUrl:"https://app.example.com",secret:"route-secret"});
    const response=await GET(new Request(signed),{params:Promise.resolve({draftId:draft.id})});
    expect(response.status).toBe(400);
  });
});
