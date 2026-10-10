// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CloudflareTextConfigurationError, createCloudflareTextClient } from "@/lib/ai/cloudflareTextClient";

vi.mock("server-only", () => ({}));

const ok = (result:unknown) => new Response(JSON.stringify({ success:true, result }), { status:200 });

describe("Cloudflare text client", () => {
  it("posts messages with a JSON schema and reads an object reply", async () => {
    const request = vi.fn().mockResolvedValue(ok({ response:{ title:"삼합 이야기" } }));
    const client = createCloudflareTextClient({ accountId:"acct", token:"secret", fetch:request });
    await expect(client.generateJson("추천해 줘", z.object({ title:z.string() }))).resolves.toEqual({ title:"삼합 이야기" });
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/qwen/qwen3-30b-a3b-fp8");
    expect(init.headers).toMatchObject({ Authorization:"Bearer secret" });
    expect(String(url)).not.toContain("secret");
    const body = JSON.parse(init.body);
    expect(body.messages.at(-1)).toEqual({ role:"user", content:"추천해 줘" });
    expect(body.response_format).toMatchObject({ type:"json_schema", json_schema:{ type:"object", additionalProperties:false } });
    expect(body.max_tokens).toBe(8192);
    expect(client.provider).toBe("cloudflare");
  });

  it("accepts a JSON string reply, even wrapped in code fences", async () => {
    const request = vi.fn().mockResolvedValue(ok({ response:'```json\n{"title":"문자열"}\n```' }));
    const client = createCloudflareTextClient({ accountId:"acct", token:"secret", fetch:request });
    await expect(client.generateJson("x", z.object({ title:z.string() }))).resolves.toEqual({ title:"문자열" });
  });

  it("explains missing configuration", () => {
    expect(() => createCloudflareTextClient({ accountId:"", token:"" })).toThrow(CloudflareTextConfigurationError);
  });

  it("maps HTTP failures to an error with status", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}", { status:429 }));
    const client = createCloudflareTextClient({ accountId:"acct", token:"secret", fetch:request });
    await expect(client.generateJson("x", z.object({ ok:z.boolean() }))).rejects.toMatchObject({ name:"TextAiHttpError", provider:"Cloudflare", status:429 });
  });
});
