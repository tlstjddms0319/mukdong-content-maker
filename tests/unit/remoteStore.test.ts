import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteStore, remoteStore } from "@/lib/files/remoteStore";

afterEach(() => vi.unstubAllGlobals());

describe("private remote storage", () => {
  it("does not silently use temporary disk when only one credential is configured", () => {
    const priorUrl = process.env.SUPABASE_URL;
    const priorKey = process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SECRET_KEY;
    try { expect(() => remoteStore()).toThrow("SUPABASE_SECRET_KEY"); }
    finally {
      if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
      if (priorKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = priorKey;
    }
  });

  it("writes and reads a private draft without exposing the secret in the URL", async () => {
    const fetcher = vi.fn< typeof fetch >()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response('{"id":"saved"}', { status: 200 }));
    const store = createRemoteStore("https://example.supabase.co", "sb_secret_test", fetcher);
    await store.write("drafts/one.json", '{"id":"saved"}', "application/json");
    expect(await store.read("drafts/one.json")).toBe('{"id":"saved"}');
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/storage/v1/object/mukdong-private/drafts/one.json");
    expect(String(url)).not.toContain("sb_secret_test");
    expect((options?.headers as Record<string,string>).apikey).toBe("sb_secret_test");
    expect((options?.headers as Record<string,string>).Authorization).toBeUndefined();
  });

  it("lists all draft pages and treats only a missing object as absent", async () => {
    const fetcher = vi.fn< typeof fetch >()
      .mockResolvedValueOnce(new Response(JSON.stringify([{name:"one.json"}]), { status: 200 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const store = createRemoteStore("https://example.supabase.co", "sb_secret_test", fetcher);
    expect(await store.list("drafts")).toEqual(["one.json"]);
    expect(await store.read("drafts/missing.json")).toBeNull();
    await expect(store.read("drafts/one.json")).rejects.toThrow("503");
  });
});
