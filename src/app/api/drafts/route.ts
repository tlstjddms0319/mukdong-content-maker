import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createDraftRepository } from "@/features/drafts/repository";
import { DraftSchema } from "@/features/drafts/schema";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { plannedAtFromPlanDate } from "@/features/drafts/planLink";
import { PerformanceSchema } from "@/features/drafts/performance";
import { z } from "zod";

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
    if(planned.data.planned_publish_at&&Date.parse(planned.data.planned_publish_at)<=Date.now())return privateJson({error:"미래의 게시 희망일시를 골라 주세요."},{status:400});
    if(planned.data.final_review_complete&&(!planned.data.planned_publish_at||!existing.caption?.trim()||!selectedDraftMedia(existing).length))return privateJson({error:"이미지와 문안을 저장하고 희망일시를 정한 뒤 확인해 주세요."},{status:400});
    return privateJson(await repository.saveDraft({...existing,...planned.data,updated_at:new Date().toISOString()}));
  }
  const parsed = CaptionInput.safeParse(body);
  if (!parsed.success) return privateJson({ error:"문안 내용을 확인해 주세요." }, { status:400 });
  const draft = await repository.saveCaption(parsed.data.id, parsed.data.caption);
  if (!draft) return privateJson({ error:"초안을 찾을 수 없습니다." }, { status:404 });
  return privateJson(draft);
}
