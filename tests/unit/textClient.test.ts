// tests/unit/textClient.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TextAiHttpError } from "@/lib/ai/errors";
import { TextAiUnavailableError, createTextClient, resolveTextClients, type TextAiClient } from "@/lib/ai/textClient";

vi.mock("server-only", () => ({}));

const schema = z.object({ ok:z.boolean() });
const fake = (provider:TextAiClient["provider"], generateJson:TextAiClient["generateJson"]):TextAiClient => ({ provider, generateJson });
const factories = (overrides:Partial<Record<TextAiClient["provider"], () => TextAiClient>>) => ({
  gemini:() => { throw new Error("no key"); },
  groq:() => { throw new Error("no key"); },
  cloudflare:() => { throw new Error("no key"); },
  ...overrides,
});

describe("text client resolver", () => {
  it("orders automatic mode Gemini, Groq, Cloudflare and skips providers without keys", () => {
    const clients = resolveTextClients("automatic", factories({ cloudflare:() => fake("cloudflare", vi.fn()), gemini:() => fake("gemini", vi.fn()) }));
    expect(clients.map(client => client.provider)).toEqual(["gemini", "cloudflare"]);
  });

  it("uses only the chosen provider when one is selected", () => {
    const clients = resolveTextClients("groq", factories({ gemini:() => fake("gemini", vi.fn()), groq:() => fake("groq", vi.fn()) }));
    expect(clients.map(client => client.provider)).toEqual(["groq"]);
  });

  it("falls through to the next provider after a rate limit and reports the switch", async () => {
    const onSwitch = vi.fn();
    const client = createTextClient("automatic", { onSwitch, create:factories({
      gemini:() => fake("gemini", vi.fn().mockRejectedValue(new TextAiHttpError("Gemini", 429))),
      groq:() => fake("groq", vi.fn().mockResolvedValue({ ok:true })),
    }) });
    await expect(client.generateJson("p", schema)).resolves.toEqual({ ok:true });
    expect(client.provider).toBe("groq");
    expect(onSwitch).toHaveBeenCalledWith("gemini", "Gemini API 오류 (429)");
  });

  it("retries the same provider once when the reply did not match the schema", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new SyntaxError("bad json")).mockResolvedValueOnce({ ok:true });
    const client = createTextClient("gemini", { create:factories({ gemini:() => fake("gemini", generate) }) });
    await expect(client.generateJson("p", schema)).resolves.toEqual({ ok:true });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry the same provider after an HTTP failure", async () => {
    const generate = vi.fn().mockRejectedValue(new TextAiHttpError("Groq", 503));
    const client = createTextClient("groq", { create:factories({ groq:() => fake("groq", generate) }) });
    await expect(client.generateJson("p", schema)).rejects.toMatchObject({ status:503 });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when nothing is configured", async () => {
    const client = createTextClient("automatic", { create:factories({}) });
    expect(client.configured).toEqual([]);
    await expect(client.generateJson("p", schema)).rejects.toBeInstanceOf(TextAiUnavailableError);
  });
});
