// tests/unit/groqClient.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GroqConfigurationError, createGroqClient } from "@/lib/ai/groqClient";

vi.mock("server-only", () => ({}));

describe("Groq client", () => {
  it("asks for a strict JSON schema and parses the reply", async () => {
    const create = vi.fn().mockResolvedValue({ choices:[{ message:{ content:'{"title":"삼합 이야기"}' } }] });
    const client = createGroqClient({ apiKey:"secret", client:{ chat:{ completions:{ create } } } });
    await expect(client.generateJson("추천해 줘", z.object({ title:z.string() }))).resolves.toEqual({ title:"삼합 이야기" });
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format).toMatchObject({ type:"json_schema", json_schema:{ strict:true, schema:{ type:"object", additionalProperties:false, required:["title"] } } });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(client.provider).toBe("groq");
  });

  it("explains when the Groq key is missing", () => {
    expect(() => createGroqClient({ apiKey:"" })).toThrow(GroqConfigurationError);
  });

  it("maps SDK failures to an HTTP error with status", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("rate"), { status:429 }));
    const client = createGroqClient({ apiKey:"secret", client:{ chat:{ completions:{ create } } } });
    await expect(client.generateJson("x", z.object({ ok:z.boolean() }))).rejects.toMatchObject({ name:"TextAiHttpError", provider:"Groq", status:429 });
  });

  it("rejects an empty reply", async () => {
    const create = vi.fn().mockResolvedValue({ choices:[{ message:{ content:null } }] });
    const client = createGroqClient({ apiKey:"secret", client:{ chat:{ completions:{ create } } } });
    await expect(client.generateJson("x", z.object({ ok:z.boolean() }))).rejects.toThrow(/비어/);
  });
});
