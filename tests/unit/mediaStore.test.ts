// @vitest-environment node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMediaStore, MediaValidationError } from "@/lib/files/mediaStore";

describe("media store", () => {
  it("stores a real jpeg under an opaque id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-"));
    const store = createMediaStore(dir);
    const asset = await store.saveOriginal(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "meal.jpg", { type: "image/jpeg" }));
    expect(asset.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(asset.originalName).toBe("meal.jpg");
    expect(JSON.stringify(asset)).not.toContain(dir);
  });

  it("rejects forged image content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-"));
    await expect(createMediaStore(dir).saveOriginal(new File(["MZ executable"], "fake.jpg", { type: "image/jpeg" })))
      .rejects.toBeInstanceOf(MediaValidationError);
  });
});
