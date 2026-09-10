import { NextResponse } from "next/server";
import { CopyInputSchema } from "@/features/copy/schema";
import { createFallbackCopy } from "@/features/copy/service";

export async function POST(request: Request) {
  const input = CopyInputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ message:"주제와 대상을 확인해 주세요." }, { status:400 });
  return NextResponse.json(createFallbackCopy(input.data));
}
