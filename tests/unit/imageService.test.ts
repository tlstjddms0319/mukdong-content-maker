// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateCandidates } from "@/features/images/service";

describe("image service", () => {
  it("keeps generation metadata and requested count", async () => {
    const result = await generateCandidates({ topic: "삼합", count: 3, aspectRatio: "4:5" }, {
      generate: async () => ["one", "two", "three"],
    });
    expect(result).toHaveLength(3);
    expect(result.every((item) => item.source === "ai-generated" && item.promptVersion === "v1")).toBe(true);
  });
});
