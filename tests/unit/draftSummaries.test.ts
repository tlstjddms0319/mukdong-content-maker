// @vitest-environment node
// 초안 목록을 가볍게: 요약·썸네일을 따로 저장하고, 목록은 이미지 없이 읽는다. 예전 초안은 처음 목록을 볼 때 요약을 만든다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createDraftRepository, resetDraftSummaryCache } from "@/features/drafts/repository";
import type { Draft } from "@/features/drafts/schema";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));
vi.mock("server-only", () => ({}));

let dir = "";
let cover = "";
const id = "77777777-7777-4777-8777-777777777777", media = "88888888-8888-4888-8888-888888888888";
const draft = (overrides: Partial<Draft> = {}): Draft => ({ id, status: "ready", topic: "과메기 한 접시", audience: "A", media_candidates: [{ id: media, source: "photo", file_id: cover, purpose: "instagram-cover" }], selected_media_id: media, selected_media_ids: [media], copy: null, caption: "문안", facts_to_verify: [], store_profile_version: "v1", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z", ...overrides });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "draft-summary-"));
  process.env.DATA_DIR = dir;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
  resetDraftSummaryCache();
  const big = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#aa7755" } }).jpeg({ quality: 90 }).toBuffer();
  cover = `data:image/jpeg;base64,${big.toString("base64")}`;
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); delete process.env.DATA_DIR; });

describe("draft summaries", () => {
  it("saves a small summary and thumbnail next to the draft and lists without images", async () => {
    const repository = createDraftRepository(dir);
    await repository.saveDraft(draft());
    const [summary] = await repository.listDraftSummaries();
    expect(summary).toMatchObject({ id, topic: "과메기 한 접시", imageCount: 1, hasCaption: true, coverSource: "photo" });
    expect(JSON.stringify(summary)).not.toContain("base64");
    const thumbnail = await repository.readThumbnail(id);
    const bytes = Buffer.from(thumbnail!.split(",")[1], "base64");
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 300, height: 375, format: "jpeg" });
    expect(bytes.length).toBeLessThan(cover.length / 4);
  });

  it("builds summaries for older drafts that have none, once", async () => {
    await mkdir(path.join(dir, "drafts"), { recursive: true });
    await writeFile(path.join(dir, "drafts", `${id}.json`), JSON.stringify(draft()), "utf8");
    const repository = createDraftRepository(dir);
    expect((await repository.listDraftSummaries()).map(item => item.id)).toEqual([id]);
    expect(await readdir(path.join(dir, "draft-summaries"))).toEqual([`${id}.json`]);
    expect(await readdir(path.join(dir, "draft-thumbs"))).toEqual([`${id}.txt`]);
  });

  it("keeps the in-memory list in step with saves and deletes", async () => {
    const repository = createDraftRepository(dir);
    await repository.saveDraft(draft());
    await repository.listDraftSummaries();
    await repository.saveDraft(draft({ topic: "과메기 두 접시", updated_at: "2026-10-03T00:00:00.000Z" }));
    expect((await repository.listDraftSummaries())[0].topic).toBe("과메기 두 접시");
    expect(await repository.deleteDraft(id)).toBe(true);
    expect(await repository.listDraftSummaries()).toEqual([]);
    expect(await repository.readDraft(id)).toBeNull();
    await expect(readFile(path.join(dir, "draft-summaries", `${id}.json`))).rejects.toThrow();
  });

  it("serves the thumbnail and deletes through the routes", async () => {
    const repository = createDraftRepository(dir);
    await repository.saveDraft(draft());
    const { GET } = await import("@/app/api/drafts/thumbnail/route");
    const image = await GET(new Request(`http://localhost/api/drafts/thumbnail?id=${id}&v=1`));
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    expect(image.headers.get("Cache-Control")).toContain("immutable");
    const { DELETE } = await import("@/app/api/drafts/route");
    expect((await DELETE(new Request(`http://localhost/api/drafts?id=${id}`, { method: "DELETE" }))).status).toBe(200);
    expect((await DELETE(new Request(`http://localhost/api/drafts?id=${id}`, { method: "DELETE" }))).status).toBe(404);
    expect((await GET(new Request(`http://localhost/api/drafts/thumbnail?id=${id}&v=2`))).status).toBe(404);
  });
});
