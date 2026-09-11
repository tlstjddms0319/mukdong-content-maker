import { NextResponse } from "next/server";
import { buildExportBundle } from "@/lib/files/exportBundle";

export async function GET(_: Request, { params }: { params:Promise<{draftId:string}> }) {
  const { draftId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return NextResponse.json({ message:"초안 번호가 올바르지 않아요." }, { status:400 });
  const bundle = await buildExportBundle({ caption:"저장된 문안", image:new Uint8Array(), imageName:"post.jpg", source:"ai-generated", checks:["사용자 승인"] });
  return new Response(Buffer.from(bundle), { headers:{ "Content-Type":"application/zip", "Content-Disposition":`attachment; filename="draft-${draftId}.zip"` } });
}
