import { describe, expect, it } from "vitest";
import { DraftSchema } from "@/features/drafts/schema";
import { selectedDraftMedia } from "@/features/drafts/selection";

const first="11111111-1111-4111-8111-111111111111";
const second="22222222-2222-4222-8222-222222222222";
const draft={id:"33333333-3333-4333-8333-333333333333",status:"ready" as const,topic:"주제",audience:"A" as const,media_candidates:[{id:first,source:"ai-generated" as const,file_id:"one",purpose:"instagram-cover"},{id:second,source:"ai-generated" as const,file_id:"two",purpose:"instagram-detail"}],selected_media_id:first,copy:null,facts_to_verify:[],store_profile_version:"v",created_at:"2026-09-17T00:00:00.000Z",updated_at:"2026-09-17T00:00:00.000Z"};

describe("draft carousel selection",()=>{
  it("keeps the ordered selected IDs and rejects invalid selections",()=>{
    const saved=DraftSchema.parse({...draft,selected_media_ids:[first,second]});
    expect(selectedDraftMedia(saved).map(media=>media.id)).toEqual([first,second]);
    expect(()=>DraftSchema.parse({...draft,selected_media_ids:[first,first]})).toThrow();
    expect(()=>DraftSchema.parse({...draft,selected_media_ids:[second]})).toThrow();
    expect(()=>DraftSchema.parse({...draft,selected_media_ids:[first,"44444444-4444-4444-8444-444444444444"]})).toThrow();
  });
  it("reads legacy singular selection",()=>expect(selectedDraftMedia(DraftSchema.parse(draft)).map(media=>media.id)).toEqual([first]));
});
