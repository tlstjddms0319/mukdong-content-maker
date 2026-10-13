// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiConfigurationError, createGeminiClient, toLegacyResponseSchema } from "@/lib/ai/geminiClient";

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

  it("sends the strict JSON schema with the request", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'{"title":"삼합"}' }] } }] }), { status:200 }));
    await createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ title:z.string() }));
    const body = JSON.parse(String(request.mock.calls[0][1].body));
    expect(body.generationConfig).toMatchObject({ responseMimeType:"application/json", responseJsonSchema:{ type:"object", additionalProperties:false, required:["title"] } });
  });

  // 운영 로그(2026-10-13): 예비 모델이 responseJsonSchema를 400으로 거부 → 스키마 없이 보내자 배열을 돌려줘 구성안이 기본 문안으로 떨어졌다.
  it("retries with the legacy responseSchema when Gemini rejects responseJsonSchema, and only then without any schema", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error:{ status:"INVALID_ARGUMENT" } }), { status:400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'{"ok":true}' }] } }] }), { status:200 }));
    await expect(createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ ok:z.boolean() }))).resolves.toEqual({ ok:true });
    const first=JSON.parse(String(request.mock.calls[0][1].body)).generationConfig, second=JSON.parse(String(request.mock.calls[1][1].body)).generationConfig;
    expect(first.responseJsonSchema).toBeDefined();
    expect(second.responseJsonSchema).toBeUndefined();
    expect(second.responseSchema).toMatchObject({ type:"object", required:["ok"], properties:{ ok:{ type:"boolean" } } });
    expect(second.responseSchema.additionalProperties).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("gemini-3.5-flash-lite:generateContent");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("responseSchema"), expect.any(String));
    warn.mockRestore();
  });

  it("unwraps a single object the model wrapped in an array", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'[{"ok":true}]' }] } }] }), { status:200 }));
    await expect(createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ ok:z.boolean() }))).resolves.toEqual({ ok:true });
  });

  it("strips keys the legacy responseSchema does not accept", () => {
    const legacy=toLegacyResponseSchema({ type:"object", additionalProperties:false, $schema:"x", properties:{ n:{ type:"integer", minimum:0, maximum:3 }, s:{ type:["string","null"], default:"", pattern:"^a" }, list:{ type:"array", minItems:1, items:{ type:"string" } } }, required:["n","s","list"] }) as Record<string, unknown>;
    expect(JSON.stringify(legacy)).not.toMatch(/additionalProperties|\$schema|minimum|maximum|default|pattern|minItems/);
    expect(legacy).toMatchObject({ properties:{ s:{ type:"string" }, list:{ type:"array", items:{ type:"string" } } }, required:["n","s","list"] });
  });

  it("falls back to plain JSON mode when the schema has optional fields", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'{"title":"삼합"}' }] } }] }), { status:200 }));
    await createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ title:z.string(), note:z.string().optional() }));
    expect(JSON.parse(String(request.mock.calls[0][1].body)).generationConfig.responseJsonSchema).toBeUndefined();
  });


  it("gives up after the legacy-schema and schema-less retries on a persistent 400", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 실제 fetch처럼 부를 때마다 새 Response(본문은 한 번만 읽을 수 있다).
    const request = vi.fn(async () => new Response(JSON.stringify({ error:{ status:"INVALID_ARGUMENT" } }), { status:400 }));
    await expect(createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ ok:z.boolean() }))).rejects.toMatchObject({ name:"TextAiHttpError", status:400 });
    expect(request).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("does not retry a 400 when no schema was attached", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}", { status:400 }));
    await expect(createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ title:z.string(), note:z.string().optional() }))).rejects.toMatchObject({ status:400 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the schema on the 503 retry and on the fallback model", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status:503 }))
      .mockResolvedValueOnce(new Response("{}", { status:429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'{"ok":true}' }] } }] }), { status:200 }));
    await expect(createGeminiClient({ apiKey:"secret", fetch:request }).generateJson("test", z.object({ ok:z.boolean() }))).resolves.toEqual({ ok:true });
    expect(request).toHaveBeenCalledTimes(3);
    for (const call of request.mock.calls) expect(JSON.parse(String(call[1].body)).generationConfig.responseJsonSchema).toBeDefined();
    expect(request.mock.calls[2][0]).toContain("gemini-3.1-flash-lite:generateContent");
  });

});
