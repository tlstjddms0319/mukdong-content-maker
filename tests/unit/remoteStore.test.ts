import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteStoreError, checkRemoteStore, createRemoteStore, remoteStore } from "@/lib/files/remoteStore";

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

  it("treats Supabase's 400 not_found body as a missing object, but not a missing bucket", async () => {
    const notFound = JSON.stringify({ statusCode:"404", error:"not_found", message:"Object not found" });
    const noBucket = JSON.stringify({ statusCode:"404", error:"Bucket not found", message:"Bucket not found" });
    const fetcher = vi.fn< typeof fetch >()
      .mockResolvedValueOnce(new Response(notFound, { status: 400 }))
      .mockResolvedValueOnce(new Response(notFound, { status: 400 }))
      .mockResolvedValueOnce(new Response(noBucket, { status: 400 }));
    const store = createRemoteStore("https://example.supabase.co", "sb_secret_test", fetcher);
    expect(await store.read("instagram/connection.json")).toBeNull();
    await expect(store.remove("instagram/connection.json")).resolves.toBeUndefined();
    const error = await store.read("instagram/connection.json").catch((caught) => caught);
    expect(error).toBeInstanceOf(RemoteStoreError);
    expect(error.reason).toBe("bucket");
  });

  it("explains the storage check result in plain words", async () => {
    const prior = { url:process.env.SUPABASE_URL, key:process.env.SUPABASE_SECRET_KEY };
    try {
      delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
      expect(await checkRemoteStore()).toMatchObject({ configured:false, ok:false });
      process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
      // 쓰기 → 읽기 → 지우기가 모두 되면 정상.
      vi.stubGlobal("fetch", vi.fn< typeof fetch >()
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))
        .mockResolvedValueOnce(new Response("ok", { status: 200 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 })));
      expect(await checkRemoteStore()).toMatchObject({ configured:true, ok:true });
      vi.stubGlobal("fetch", vi.fn< typeof fetch >().mockResolvedValueOnce(new Response(JSON.stringify({ error:"Bucket not found" }), { status: 400 })));
      expect((await checkRemoteStore()).message).toContain("버킷이 없어요");
      vi.stubGlobal("fetch", vi.fn< typeof fetch >().mockResolvedValueOnce(new Response(JSON.stringify({ message:"Invalid Compact JWS" }), { status: 403 })));
      expect((await checkRemoteStore()).message).toContain("키를 거절했어요");
    } finally {
      if (prior.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prior.url;
      if (prior.key === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = prior.key;
    }
  });
});
