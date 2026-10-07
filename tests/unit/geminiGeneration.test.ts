// @vitest-environment node
import { describe, expect, it } from "vitest";
import { suggestTopics } from "@/features/topics/service";
import { GeneratedCopyContentSchema } from "@/features/copy/schema";

describe("Gemini-backed generation fallbacks", () => {
  it("does not let Gemini replace the selected topic or audience", () => {
    expect(GeneratedCopyContentSchema.parse({ hook:"첫 문장", information:"정보", store_connection:"가게", call_to_action:"저장", hashtags:["#삼합"], facts_used:[], facts_to_verify:[], image_disclosure:null })).not.toHaveProperty("audience");
  });
  it("keeps usable topics when Gemini is unavailable", async () => {
    const topics = await suggestTopics({ storeName:"묵동홍어마을", intent:"" }, { suggest:async () => { throw new Error("quota"); } });
    expect(topics).toHaveLength(3);
  });

});
