import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createDraftRepository } from "@/features/drafts/repository";
import { duplicateDraft } from "@/features/drafts/duplicate";

// 초안 복제: 원본을 읽어 새 ID로 저장하고, 새 초안 ID를 돌려준다. 화면은 그 ID로 위저드를 연다.
export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const body=z.object({id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({error:"복제할 초안을 확인해 주세요."},{status:400,headers:{"Cache-Control":"no-store"}});
  const repository=createDraftRepository();
  const source=await repository.readDraft(body.data.id);
  if(!source)return NextResponse.json({error:"초안을 찾을 수 없습니다."},{status:404,headers:{"Cache-Control":"no-store"}});
  const copy=await repository.saveDraft(duplicateDraft(source,{id:randomUUID(),now:new Date().toISOString(),newId:randomUUID}));
  return NextResponse.json({id:copy.id},{status:201,headers:{"Cache-Control":"no-store"}});
}
