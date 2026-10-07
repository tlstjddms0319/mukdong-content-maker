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

  it("lists saved drafts newest first and still reads older files without a caption", async () => {
    const directory = await temporaryDirectory();
    const repository = createDraftRepository(directory);
    await repository.saveDraft(validDraft);
    await repository.saveDraft({ ...validDraft, id:"22222222-2222-4222-8222-222222222222", topic:"두 번째 주제", updated_at:"2026-09-11T00:00:00.000Z" });

    expect((await repository.listDrafts()).map(draft => draft.topic)).toEqual(["두 번째 주제", validDraft.topic]);
    expect(await repository.readDraft(validDraft.id)).toMatchObject({ topic:validDraft.topic });
  });

  it("saves an edited caption without removing the selected images or changing creation time", async () => {
    const directory = await temporaryDirectory();
    const repository = createDraftRepository(directory);
    const mediaId="33333333-3333-4333-8333-333333333333";
    await repository.saveDraft({ ...validDraft, media_candidates:[{id:mediaId,source:"photo",file_id:"photo.jpg",purpose:"instagram-primary"}], selected_media_id:mediaId });

    const updated=await repository.saveCaption(validDraft.id,"내가 쓴 홍어 소개\n#묵동", "2026-09-12T00:00:00.000Z");

    expect(updated).toMatchObject({caption:"내가 쓴 홍어 소개\n#묵동",created_at:validDraft.created_at,selected_media_id:mediaId,updated_at:"2026-09-12T00:00:00.000Z"});
    expect((await repository.readDraft(validDraft.id))?.caption).toBe("내가 쓴 홍어 소개\n#묵동");
  });

  it("keeps the planned time but clears final review when the caption changes", async () => {
    const repository = createDraftRepository(await temporaryDirectory());
    const mediaId="33333333-3333-4333-8333-333333333333";
    await repository.saveDraft({...validDraft,media_candidates:[{id:mediaId,source:"photo",file_id:"photo.jpg",purpose:"instagram-primary"}],selected_media_id:mediaId,caption:"이전 문안",planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:true});

    await repository.saveCaption(validDraft.id,"고친 문안","2026-09-22T00:00:00.000Z");

    expect(await repository.readDraft(validDraft.id)).toMatchObject({caption:"고친 문안",planned_publish_at:"2030-05-15T09:00:00.000Z",final_review_complete:false});
  });

  it("exposes stable beginner defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      carouselSlideCount: 5,
      imageMode: "photo-first",
      imageCandidateCount: 3,
      imageAspectRatio: "4:5",
      copyLength: "medium",
      textAiProvider: "automatic",
      imageAiProvider: "automatic",
    });
  });

  it("migrates the previous single-provider settings automatically", async () => {
    const directory = await temporaryDirectory();
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = directory;
    await writeFile(path.join(directory, "settings.json"), JSON.stringify({
      ...DEFAULT_SETTINGS,
      carouselSlideCount: undefined,
      textAiProvider: undefined,
      imageAiProvider: "openai",
      aiProvider: "openai",
    }), "utf8");
    try {
      expect(await readSettings()).toMatchObject({ carouselSlideCount:5, textAiProvider:"automatic", imageAiProvider:"automatic" });
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    }
  });

  it("keeps an explicitly saved text provider once the routing marker exists", async () => {
    const directory = await temporaryDirectory();
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = directory;
    try {
      await writeSettings({ ...DEFAULT_SETTINGS, textAiProvider:"groq" });
      expect(await readSettings()).toMatchObject({ textAiProvider:"groq" });
      await writeFile(path.join(directory, "settings.json"), JSON.stringify({ ...DEFAULT_SETTINGS, textAiProvider:"gemini" }), "utf8");
      expect(await readSettings()).toMatchObject({ textAiProvider:"automatic" });
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    }
  });

  it("reads settings saved before the remote cutout option existed with it turned off", async () => {
    const directory = await temporaryDirectory();
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = directory;
    const older: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete older.remoteCutout;
    delete older.remoteCutoutMonthlyCredits;
    await writeFile(path.join(directory, "settings.json"), JSON.stringify({ ...older, imageAiRoutingVersion:1, copyWritingVersion:1, textAiRoutingVersion:1 }), "utf8");
    try {
      expect(await readSettings()).toMatchObject({ remoteCutout:false, remoteCutoutMonthlyCredits:20 });
      await writeSettings({ ...(await readSettings()), remoteCutout:true, remoteCutoutMonthlyCredits:5 });
      expect(await readSettings()).toMatchObject({ remoteCutout:true, remoteCutoutMonthlyCredits:5 });
      await expect(writeSettings({ ...DEFAULT_SETTINGS, remoteCutoutMonthlyCredits:500 })).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    }
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
