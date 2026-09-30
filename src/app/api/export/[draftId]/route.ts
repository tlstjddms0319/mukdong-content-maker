import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createDraftRepository } from "@/features/drafts/repository";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { buildExportBundle, type ExportImage } from "@/lib/files/exportBundle";

const repository=createDraftRepository();

// 저장된 초안의 실제 문안과 선택 이미지로 ZIP을 만든다. 이미지는 초안에 data URL로 저장되어 있다.
export async function GET(_: Request, { params }: { params:Promise<{draftId:string}> }) { const denied=await ownerApiError(); if(denied)return denied;
  const { draftId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return NextResponse.json({ message:"초안 번호가 올바르지 않아요." }, { status:400 });
  const draft=await repository.readDraft(draftId);
  if(!draft)return NextResponse.json({ message:"초안을 찾을 수 없어요." },{ status:404 });
  const images:ExportImage[]=selectedDraftMedia(draft).flatMap(item=>{
    const match=item.file_id.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/);
    return match?[{bytes:new Uint8Array(Buffer.from(match[1],"base64")),name:item.id,source:item.source}]:[];
  }).slice(0,10);
  if(!draft.caption?.trim()||!images.length)return NextResponse.json({ message:"이미지와 문안을 저장한 뒤 내려받을 수 있어요." },{ status:409 });
  const bundle = await buildExportBundle({ caption:draft.caption, images, checks:["사용자 선택 완료", "게시 전 사실 정보 확인 필요"] });
  return new Response(Buffer.from(bundle), { headers:{ "Content-Type":"application/zip", "Content-Disposition":`attachment; filename="draft-${draftId}.zip"`, "Cache-Control":"no-store" } });
}
