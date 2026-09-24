import { describe, expect, it } from "vitest";
import { LIBRARY_TOPICS } from "@/features/topics/library";

describe("prepared content topics", () => {
  it("offers distinct usable directions without overlong titles", () => {
    expect(LIBRARY_TOPICS).toHaveLength(5);
    expect(new Set(LIBRARY_TOPICS.map(card => card.title)).size).toBe(5);
    for (const card of LIBRARY_TOPICS) {
      expect(card.title.trim().length).toBeGreaterThan(0);
      expect(card.title.length).toBeLessThanOrEqual(120);
      expect(card.intent.trim()).not.toBe("");
      expect(card.imageHint.trim()).not.toBe("");
      expect(card.factCheck.trim()).not.toBe("");
    }
  });
});
