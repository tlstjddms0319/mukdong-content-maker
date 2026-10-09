// @vitest-environment node
// 내 게시물 30일 자동 삭제(보관함 제외). 인스타그램에 올리는 중인 게시물만 이번에 건너뛴다.
import { describe, expect, it, vi } from "vitest";
import { DRAFT_RETENTION_DAYS, daysUntilDeletion, isDraftExpired } from "@/features/drafts/retention";
import { purgeExpiredDrafts } from "@/features/drafts/purge";

const NOW=Date.parse("2026-10-09T12:00:00Z");
const daysAgo=(days:number)=>new Date(NOW-days*24*60*60*1000).toISOString();

describe("draft retention", () => {
  it("expires posts 30 days after they were made, except the archive", () => {
    expect(DRAFT_RETENTION_DAYS).toBe(30);
    expect(isDraftExpired({created_at:daysAgo(29)},NOW)).toBe(false);
    expect(isDraftExpired({created_at:daysAgo(30)},NOW)).toBe(true);
    expect(isDraftExpired({created_at:daysAgo(400),archived:true},NOW)).toBe(false);
    expect(isDraftExpired({created_at:"not a date"},NOW)).toBe(false);
  });
  it("counts the days left for the notice on 내 게시물", () => {
    expect(daysUntilDeletion({created_at:daysAgo(25)},NOW)).toBe(5);
    expect(daysUntilDeletion({created_at:daysAgo(31)},NOW)).toBe(0);
    expect(daysUntilDeletion({created_at:daysAgo(25),archived:true},NOW)).toBeNull();
  });
  it("deletes expired posts, keeps the archive and new ones, and skips one being posted right now", async () => {
    const summaries=[
      {id:"old",created_at:daysAgo(40)},
      {id:"old-scheduled",created_at:daysAgo(31),planned_publish_at:"2026-10-20T09:00:00.000Z",final_review_complete:true},
      {id:"old-archived",created_at:daysAgo(90),archived:true},
      {id:"posting",created_at:daysAgo(45)},
      {id:"new",created_at:daysAgo(3)},
    ];
    const deleteDraft=vi.fn(async(_id:string)=>true);
    const removed=await purgeExpiredDrafts(NOW,{
      drafts:{listDraftSummaries:async()=>summaries,deleteDraft} as never,
      instagram:{readPublication:async(id:string)=>id==="posting"?{status:"preparing"}:null} as never,
    });
    expect(removed).toBe(2);
    expect(deleteDraft.mock.calls.map(([id])=>id)).toEqual(["old","old-scheduled"]);
  });
});
