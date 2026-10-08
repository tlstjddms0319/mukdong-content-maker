import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createDraftRepository } from "@/features/drafts/repository";
import { createInstagramRepository } from "@/features/instagram/repository";
import { publishStatusOf } from "@/features/instagram/publicationState";
import { resolvePublicationByOwner } from "@/features/instagram/publish";

// 초안 하나의 Instagram 게시 상태.
// GET ?draftId=…  → {state,label,detail?,publishedAt?} (최종 확인 화면이 게시 버튼 위에 보여 준다)
// POST {draftId,outcome:"published"|"failed"} → "게시 확인 필요"로 멈춘 기록을 사장님이 Instagram에서 본 결과로 정리한다.
const noStore={headers:{"Cache-Control":"no-store"}};
const Id=z.string().uuid();
const Resolve=z.object({draftId:Id,outcome:z.enum(["published","failed"])});

export async function GET(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const draftId=Id.safeParse(new URL(request.url).searchParams.get("draftId"));
  if(!draftId.success)return NextResponse.json({error:"게시물 번호를 확인해 주세요.",message:"게시물 번호를 확인해 주세요."},{status:400,...noStore});
  const [draft,publication]=await Promise.all([createDraftRepository().readDraft(draftId.data),createInstagramRepository().readPublication(draftId.data)]);
  return NextResponse.json(publishStatusOf(draft??{},publication,Date.now()),noStore);
}

export async function POST(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=Resolve.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"요청을 확인해 주세요.",message:"요청을 확인해 주세요."},{status:400,...noStore});
  const repo=createInstagramRepository();
  const previous=await repo.readPublication(parsed.data.draftId);
  // 준비 중(멈춤)인 기록만 고칠 수 있다. 이미 게시됐거나 실패로 정리된 기록은 그대로 둔다.
  if(previous?.status!=="preparing")return NextResponse.json({error:"정리할 게시 기록이 없어요.",message:"정리할 게시 기록이 없어요."},{status:409,...noStore});
  const saved=await repo.savePublication(resolvePublicationByOwner(previous,parsed.data.outcome,new Date()));
  const draft=await createDraftRepository().readDraft(parsed.data.draftId);
  return NextResponse.json(publishStatusOf(draft??{},saved,Date.now()),noStore);
}
