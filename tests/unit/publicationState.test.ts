import { describe, expect, it } from "vitest";
import { NEEDS_CHECK_MESSAGE, publishStatusOf } from "@/features/instagram/publicationState";
import { resolvePublicationByOwner } from "@/features/instagram/publish";
import type { Publication } from "@/features/instagram/schema";

const NOW=Date.parse("2026-10-07T09:00:00.000Z");
const at=(minutes:number)=>new Date(NOW+minutes*60_000).toISOString();
const record=(overrides:Partial<Publication>):Publication=>({draftId:"11111111-1111-4111-8111-111111111111",status:"preparing",containerId:null,mediaId:null,safeError:null,attemptedAt:at(-1),publishedAt:null,...overrides});

describe("publish status shown on draft cards",()=>{
  it("does not call a post scheduled when Instagram isn't connected or the post is archived",()=>{
    const notConnected=publishStatusOf({planned_publish_at:at(60),final_review_complete:true},null,NOW,{connected:false});
    expect(notConnected).toMatchObject({state:"scheduled",label:"연결 전이라 안 올라가요"});
    expect(publishStatusOf({planned_publish_at:at(60),final_review_complete:true},null,NOW,{connected:true}).label).toBe("예약됨");
    expect(publishStatusOf({planned_publish_at:at(60),final_review_complete:true,archived:true},null,NOW).state).toBe("none");
  });

  it("reads scheduled, due and missed from the plan when nothing was published yet",()=>{
    expect(publishStatusOf({planned_publish_at:at(60),final_review_complete:true},null,NOW).state).toBe("scheduled");
    expect(publishStatusOf({planned_publish_at:at(-30),final_review_complete:true},null,NOW).state).toBe("due");
    expect(publishStatusOf({planned_publish_at:at(-7*60),final_review_complete:true},null,NOW)).toMatchObject({state:"missed",label:"예약 놓침"});
    expect(publishStatusOf({planned_publish_at:at(-7*60),final_review_complete:false},null,NOW).state).toBe("none");
  });
  it("tells a running publish from one that got stuck",()=>{
    expect(publishStatusOf({},record({}),NOW).state).toBe("publishing");
    expect(publishStatusOf({},record({attemptedAt:at(-30)}),NOW).state).toBe("needs-check");
    expect(publishStatusOf({},record({safeError:NEEDS_CHECK_MESSAGE}),NOW).state).toBe("needs-check");
    expect(publishStatusOf({},record({mediaId:"post-1"}),NOW).state).toBe("published");
  });
  it("says whether a failed scheduled post will be retried",()=>{
    const failed=record({status:"failed",safeError:"실패했어요."});
    expect(publishStatusOf({planned_publish_at:at(-30),final_review_complete:true},failed,NOW).detail).toContain("30분 뒤");
    expect(publishStatusOf({planned_publish_at:at(-8*60),final_review_complete:true},failed,NOW).detail).not.toContain("30분 뒤");
  });
  it("lets the owner settle a stuck publish after checking Instagram",()=>{
    const stuck=record({containerId:"c1",safeError:NEEDS_CHECK_MESSAGE});
    expect(resolvePublicationByOwner(stuck,"published",new Date(NOW))).toMatchObject({status:"published",safeError:null,publishedAt:new Date(NOW).toISOString()});
    expect(resolvePublicationByOwner(stuck,"failed",new Date(NOW))).toMatchObject({status:"failed"});
  });
});
