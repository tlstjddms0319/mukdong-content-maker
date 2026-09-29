// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiConfigurationError, createGeminiClient } from "@/lib/ai/geminiClient";

vi.mock("server-only", () => ({}));

describe("Gemini client", () => {
  it("keeps the API key in the request header and parses structured output", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates:[{ content:{ parts:[{ text:'{"title":"삼합 이야기"}' }] } }],
    }), { status:200 }));
    const client = createGeminiClient({ apiKey:"secret", fetch:request, model:"gemini-test" });

    await expect(client.generateJson("추천해 줘", z.object({ title:z.string() }))).resolves.toEqual({ title:"삼합 이야기" });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("gemini-test:generateContent"), expect.objectContaining({
      headers:expect.objectContaining({ "x-goog-api-key":"secret" }),
    }));
    expect(String(request.mock.calls[0][0])).not.toContain("secret");
  });

  it("explains when the Gemini key is missing", () => {
    expect(() => createGeminiClient({ apiKey:"" })).toThrow(GeminiConfigurationError);
  });

  it("uses the free flash-lite model by default", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'{"ok":true}' }] } }] }), { status:200 }));
    const client = createGeminiClient({ apiKey:"secret", fetch:request });
    await client.generateJson("test", z.object({ok:z.boolean()}));
    expect(request.mock.calls[0][0]).toContain("gemini-3.5-flash-lite:generateContent");
    expect(client.provider).toBe("gemini");
  });

  it("retries one temporary service failure", async () => {
    const request=vi.fn()
      .mockResolvedValueOnce(new Response("{}", {status:503}))
      .mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}), {status:200}));
    await expect(createGeminiClient({apiKey:"secret",fetch:request}).generateJson("test",z.object({ok:z.boolean()}))).resolves.toEqual({ok:true});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("switches to the fallback model once after a rate limit", async () => {
    const request=vi.fn()
      .mockResolvedValueOnce(new Response("{}", {status:429}))
      .mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}), {status:200}));
    await expect(createGeminiClient({apiKey:"secret",fetch:request}).generateJson("test",z.object({ok:z.boolean()}))).resolves.toEqual({ok:true});
    expect(request.mock.calls[1][0]).toContain("gemini-3.1-flash-lite:generateContent");
  });

  it("reports the HTTP status when both models are rate limited", async () => {
    const request=vi.fn().mockResolvedValue(new Response("{}", {status:429}));
    await expect(createGeminiClient({apiKey:"secret",fetch:request}).generateJson("test",z.object({ok:z.boolean()}))).rejects.toMatchObject({name:"TextAiHttpError",status:429,provider:"Gemini"});
    expect(request).toHaveBeenCalledTimes(2);
  });
});
