// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { createDraftRepository } from "@/features/drafts/repository";
import { readSettings, writeSettings } from "@/features/settings/repository";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "mukdong-drafts-"));
  created.push(directory);
  return directory;
}

const validDraft = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "ready" as const,
  topic: "삼합은 왜 같이 먹을까?",
  audience: "A" as const,
  media_candidates: [],
  selected_media_id: null,
  copy: null,
  facts_to_verify: [],
  store_profile_version: "2026-09-10",
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
};

describe("draft repository", () => {
  it("round-trips a draft without storing secrets", async () => {
    const directory = await temporaryDirectory();
    const repository = createDraftRepository(directory);

    const saved = await repository.saveDraft(validDraft);

    expect(await repository.readDraft(saved.id)).toEqual(saved);
    expect(JSON.stringify(saved)).not.toContain("OPENAI_API_KEY");
  });

  it("keeps the last valid draft when a temporary write is corrupt", async () => {
    const directory = await temporaryDirectory();
    const repository = createDraftRepository(directory);
    await repository.saveDraft(validDraft);
    await writeFile(path.join(directory, "drafts", `${validDraft.id}.json.tmp`), "broken", "utf8");

    const stored = JSON.parse(await readFile(path.join(directory, "drafts", `${validDraft.id}.json`), "utf8"));
    expect(stored.topic).toBe(validDraft.topic);
  });

  it("exposes stable beginner defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      imageMode: "photo-first",
      imageCandidateCount: 3,
      imageAspectRatio: "4:5",
      copyLength: "short",
    });
  });

  it("handles concurrent settings saves without sharing a temporary file", async () => {
    const directory = await temporaryDirectory();
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = directory;
    try {
      await Promise.all(Array.from({ length:12 }, (_, index) => writeSettings({ ...DEFAULT_SETTINGS, imageCandidateCount:index % 2 ? 1 : 3 })));
      expect([1, 3]).toContain((await readSettings()).imageCandidateCount);
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    }
  });
});
