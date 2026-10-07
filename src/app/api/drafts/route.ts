import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createDraftRepository } from "@/features/drafts/repository";
import { DraftSchema } from "@/features/drafts/schema";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { plannedAtFromPlanDate } from "@/features/drafts/planLink";
import { PerformanceSchema } from "@/features/drafts/performance";
import { z } from "zod";
import { createInstagramRepository } from "@/features/instagram/repository";

function privateJson(body: unknown, init?: ResponseInit) { const headers=new Headers(init?.headers); headers.set("Cache-Control","no-store"); return NextResponse.json(body,{...init,headers}); }

const repository = createDraftRepository();

export async function GET(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return privateJson({ error: "초안 ID가 필요합니다." }, { status: 400 });
  const draft = await repository.readDraft(id);
  if (!draft) return privateJson({ error: "초안을 찾을 수 없습니다." }, { status: 404 });
  return privateJson(draft);
}

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed = DraftSchema.safeParse(await request.json());
  if (!parsed.success) return privateJson({ error: "초안 내용을 확인해 주세요." }, { status: 400 });
  const previous=await repository.readDraft(parsed.data.id);
  // 게시 희망일시는 PATCH(게시 계획)로만 바꾼다. 단, 한 달 기획에서 시작한 새 초안은 처음 저장할 때 그 게시일의 기본 시각을 채운다.
  const plan_date=previous?previous.plan_date:parsed.data.plan_date;
  const planned_publish_at=previous?previous.planned_publish_at??null:plannedAtFromPlanDate(plan_date);
  // 적어 둔 성과도 PATCH로만 바꾼다(이미지를 다시 저장해도 사라지지 않게 이전 값을 유지).
  return privateJson(await repository.saveDraft({...parsed.data,plan_date,planned_publish_at,final_review_complete:false,performance:previous?.performance}), { status: 201 });
}

const CaptionInput = z.object({ id:z.string().uuid(), caption:z.string().trim().min(1).max(2200) });
const PerformanceInput = z.object({ id:z.string().uuid(), performance:PerformanceSchema.omit({recorded_at:true}).nullable() });
const ScheduleInput = z.object({ id:z.string().uuid(), planned_publish_at:z.string().datetime().nullable(), final_review_complete:z.boolean() });

export async function PATCH(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const body=await request.json();
  // 성과 기록: 숫자를 저장하거나(null이면 지운다), 기록 시각은 서버가 채운다.
  if(body&&typeof body==="object"&&"performance" in body){
    const recorded=PerformanceInput.safeParse(body);
    if(!recorded.success)return privateJson({error:"성과 숫자를 확인해 주세요."},{status:400});
    const existing=await repository.readDraft(recorded.data.id);
    if(!existing)return privateJson({error:"초안을 찾을 수 없습니다."},{status:404});
    const performance=recorded.data.performance?{...recorded.data.performance,recorded_at:new Date().toISOString()}:undefined;
    return privateJson(await repository.saveDraft({...existing,performance}));
  }
  if(body&&typeof body==="object"&&"planned_publish_at" in body){
    const planned=ScheduleInput.safeParse(body);
    if(!planned.success)return privateJson({error:"게시 희망일시를 확인해 주세요."},{status:400});
    const existing=await repository.readDraft(planned.data.id);
    if(!existing)return privateJson({error:"초안을 찾을 수 없습니다."},{status:404});
    // "미래 시각"은 날짜를 새로 정하거나 최종 확인을 켤 때만 본다. 예약 시각이 지난 초안의 최종 확인을 끄는 것(예약 취소)은
    // 언제든 되어야 한다. 예전에는 지난 날짜가 그대로 다시 오는 바람에 취소가 막혀, 지난 글이 1분 뒤 게시될 수 있었다.
    const minute=(value:string|null|undefined)=>value?Math.floor(Date.parse(value)/60_000):null;
    const dateChanged=minute(planned.data.planned_publish_at)!==minute(existing.planned_publish_at);
    const turningOn=planned.data.final_review_complete&&!existing.final_review_complete;
    if(planned.data.planned_publish_at&&(dateChanged||turningOn)&&Date.parse(planned.data.planned_publish_at)<=Date.now())return privateJson({error:"미래의 게시 희망일시를 골라 주세요."},{status:400});
    if(planned.data.final_review_complete&&(!planned.data.planned_publish_at||!existing.caption?.trim()||!selectedDraftMedia(existing).length))return privateJson({error:"이미지와 문안을 저장하고 희망일시를 정한 뒤 확인해 주세요."},{status:400});
    return privateJson(await repository.saveDraft({...existing,...planned.data,updated_at:new Date().toISOString()}));
  }
  const parsed = CaptionInput.safeParse(body);
  if (!parsed.success) return privateJson({ error:"문안 내용을 확인해 주세요." }, { status:400 });
  const draft = await repository.saveCaption(parsed.data.id, parsed.data.caption);
  if (!draft) return privateJson({ error:"초안을 찾을 수 없습니다." }, { status:404 });
  return privateJson(draft);
}

// 초안 지우기(초안·목록 요약·썸네일). 게시 중(준비 중)인 초안은 지우지 않는다(게시 기록과 어긋나지 않게).
export async function DELETE(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return privateJson({ error: "초안 ID가 필요합니다." }, { status: 400 });
  const publication = await createInstagramRepository().readPublication(id).catch(() => null);
  if (publication?.status === "preparing" && !publication.mediaId) return privateJson({ error: "인스타그램에 게시하는 중이거나 확인이 필요한 초안이에요. 게시 상태를 정리한 뒤 지워 주세요." }, { status: 409 });
  const removed = await repository.deleteDraft(id);
  if (!removed) return privateJson({ error: "초안을 찾을 수 없습니다." }, { status: 404 });
  return privateJson({ deleted: true });
}
