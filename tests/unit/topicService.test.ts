// @vitest-environment node
import { describe, expect, it } from "vitest";
import { suggestTopics } from "@/features/topics/service";

const input = { intent: "", storeName: "묵동홍어마을" };

describe("topic service", () => {
  it("returns three useful topics when AI is unavailable", async () => {
    const result = await suggestTopics(input, { suggest: async () => { throw new Error("offline"); } });
    expect(result).toHaveLength(3);
    expect(result.every((item) => /A|B|C/.test(item.audience))).toBe(true);
    expect(result.every((item) => item.reason.length > 0)).toBe(true);
  });
});
