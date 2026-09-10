import { NextResponse } from "next/server";
import { createDraftRepository } from "@/features/drafts/repository";
import { DraftSchema } from "@/features/drafts/schema";

const repository = createDraftRepository();

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "초안 ID가 필요합니다." }, { status: 400 });
  const draft = await repository.readDraft(id);
  if (!draft) return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(draft);
}

export async function POST(request: Request) {
  const parsed = DraftSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "초안 내용을 확인해 주세요." }, { status: 400 });
  return NextResponse.json(await repository.saveDraft(parsed.data), { status: 201 });
}
