// @vitest-environment node
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe,expect,it } from "vitest";
import { prepareInstagramImage,signMediaUrl,verifyMediaSignature } from "@/features/instagram/publicMedia";
import type { Draft } from "@/features/drafts/schema";

async function draftWithPng():Promise<Draft>{
  const id=randomUUID();
  const input=await sharp({create:{width:40,height:40,channels:3,background:"#9b4035"}}).png().toBuffer();
  return {id,status:"verify",topic:"홍어 삼합",audience:"A",media_candidates:[{id:randomUUID(),source:"photo",file_id:`data:image/png;base64,${input.toString("base64")}`,purpose:"instagram-primary"}],selected_media_id:null,copy:null,facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-11T00:00:00.000Z",updated_at:"2026-09-11T00:00:00.000Z"};
}

describe("Instagram public media",()=>{
  it("원본을 바꾸지 않고 4:5 JPEG 파생본을 만든다",async()=>{
    const draft=await draftWithPng();draft.selected_media_id=draft.media_candidates[0].id;
    const original=draft.media_candidates[0].file_id;
    const output=await prepareInstagramImage(draft);
    const metadata=await sharp(output).metadata();
    expect(metadata).toMatchObject({format:"jpeg",width:1080,height:1350});
    expect(draft.media_candidates[0].file_id).toBe(original);
  });

  it("만료되거나 수정된 서명을 거절한다",()=>{
    const draftId=randomUUID(),expiresAt=2_000_000_000,secret="test-secret";
    const url=new URL(signMediaUrl({draftId,expiresAt,baseUrl:"https://example.com",secret}));
    const signature=url.searchParams.get("sig")!;
    expect(verifyMediaSignature({draftId,expiresAt,signature,secret,now:1_900_000_000})).toBe(true);
    expect(verifyMediaSignature({draftId:randomUUID(),expiresAt,signature,secret,now:1_900_000_000})).toBe(false);
    expect(verifyMediaSignature({draftId,expiresAt,signature,secret,now:2_000_000_001})).toBe(false);
  });
});
