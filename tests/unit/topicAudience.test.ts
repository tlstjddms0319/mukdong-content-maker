import { describe, expect, it } from "vitest";
import { TopicSuggestionSchema } from "@/features/topics/schema";

const base = { id: "1", title: "왜 그럴까?", summary: "홍어 설명", reason: "이유", imageBrief: "사진" };

describe("topic audience from AI output", () => {
  it.each([["A", "A"], ["b", "B"], ["C=호기심 입문형", "C"], ["C (호기심 입문형)", "C"], ["음식 탐색형", "A"], ["약속 결정형", "B"], ["호기심 입문형", "C"]])("reads %s as %s", (raw, expected) => {
    expect(TopicSuggestionSchema.parse({ ...base, audience: raw }).audience).toBe(expected);
  });
  it("still rejects unknown audiences", () => {
    expect(TopicSuggestionSchema.safeParse({ ...base, audience: "모두" }).success).toBe(false);
  });
});
