// @vitest-environment node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDraftRepository } from "@/features/drafts/repository";
import { readSettings, writeSettings } from "@/features/settings/repository";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { createMediaStore } from "@/lib/files/mediaStore";

const previousUrl = process.env.SUPABASE_URL;
const previousKey = process.env.SUPABASE_SECRET_KEY;
afterEach(() => {
  if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previousKey;
  vi.unstubAllGlobals();
});

function fakeStorage() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const objects = new Map<string, string>();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/object/list/")) {
      const { prefix } = JSON.parse(String(init?.body)) as { prefix: string };
      return Response.json([...objects.keys()].filter((name) => name.startsWith(`${prefix}/`)).map((name) => ({ name: name.slice(prefix.length + 1) })));
    }
    const name = url.split("/mukdong-private/")[1];
    if (init?.method === "POST") {
      objects.set(name, typeof init.body === "string" ? init.body : Buffer.from(init.body as Buffer).toString("base64"));
      return Response.json({});
    }
    return objects.has(name) ? new Response(objects.get(name)) : new Response("missing", { status: 404 });
  }));
  return objects;
}

describe("persistent repositories", () => {
  it("restores drafts, settings, and uploaded original after recreating repositories", async () => {
    const objects = fakeStorage();
    const local = await mkdtemp(join(tmpdir(), "persistent-"));
    const id = "11111111-1111-4111-8111-111111111111";
    const draft = { id, status:"ready" as const, topic:"홍어", audience:"A" as const, media_candidates:[], selected_media_id:null, copy:null, facts_to_verify:[], store_profile_version:"2026-09-10", created_at:"2026-09-10T00:00:00.000Z", updated_at:"2026-09-10T00:00:00.000Z" };
    await createDraftRepository(local).saveDraft(draft);
    await writeSettings({ ...DEFAULT_SETTINGS, carouselSlideCount: 3 });
    const image = await createMediaStore(local).saveOriginal(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "meal.jpg", { type:"image/jpeg" }));
    expect((await createDraftRepository(local).listDrafts()).map((item) => item.id)).toEqual([id]);
    expect(await createDraftRepository(local).readDraft(id)).toMatchObject({ topic:"홍어" });
    expect((await readSettings()).carouselSlideCount).toBe(3);
    expect(objects.has(`drafts/${id}.json`)).toBe(true);
    expect(objects.has("settings.json")).toBe(true);
    expect(objects.has(`originals/${image.id}.jpg`)).toBe(true);
  });
});
