import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestTopics } from "@/features/topics/service";
import { TopicInputSchema } from "@/features/topics/schema";

const RequestSchema = z.object({
  storeProfile: z.object({ name: z.string().trim().min(1).max(80) }),
  intent: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const body = RequestSchema.parse(await request.json());
    const input = TopicInputSchema.parse({ storeName: body.storeProfile.name, intent: body.intent });
    return NextResponse.json({ topics: await suggestTopics(input) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({ message: "주제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
