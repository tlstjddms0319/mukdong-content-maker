// @vitest-environment node
// Claude 글 제공자(2026-10-21): 키가 있으면 자동 순서 맨 앞, 구조화 출력(parsed_output)을 zod로 검사, HTTP 오류는 TextAiHttpError로.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { AnthropicConfigurationError, createAnthropicClient, type ParseClient } from "@/lib/ai/anthropicClient";
import { TextAiHttpError } from "@/lib/ai/errors";
import { TEXT_PROVIDER_ORDER, resolveTextClients } from "@/lib/ai/textClient";
import { AppSettingsSchema } from "@/features/settings/schema";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

const Schema = z.object({ title: z.string(), points: z.array(z.string()) });
const fake = (parsed: unknown, extra: Partial<{ stop_reason: string | null }> = {}): ParseClient & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return { calls, messages: { parse: async (body) => { calls.push(body); return { parsed_output: parsed, stop_reason: extra.stop_reason ?? "end_turn", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 } }; } } };
};

describe("Claude text client", () => {
  it("refuses to build without a key, and names the default model", () => {
    expect(() => createAnthropicClient({ apiKey: "" })).toThrow(AnthropicConfigurationError);
    expect(createAnthropicClient({ apiKey: "k", client: fake({}) }).model).toBe("claude-opus-5-5");
  });
  it("sends the prompt with a structured-output format at low effort and validates the parsed output", async () => {
    const client = fake({ title: "홍어", points: ["a"] });
    const result = await createAnthropicClient({ apiKey: "k", client }).generateJson("프롬프트", Schema);
    expect(result).toEqual({ title: "홍어", points: ["a"] });
    const body = client.calls[0] as { model: string; messages: Array<{ content: string }>; output_config: { effort: string; format: { type: string } } };
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.messages[0].content).toBe("프롬프트");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
  });
  it("turns SDK errors into TextAiHttpError with the status, and a refusal into an error too", async () => {
    const failing: ParseClient = { messages: { parse: async () => { throw Object.assign(new Error("rate"), { status: 429 }); } } };
    await expect(createAnthropicClient({ apiKey: "k", client: failing }).generateJson("p", Schema)).rejects.toMatchObject({ name: "TextAiHttpError", status: 429 });
    const refused = fake(null, { stop_reason: "refusal" });
    await expect(createAnthropicClient({ apiKey: "k", client: refused }).generateJson("p", Schema)).rejects.toBeInstanceOf(TextAiHttpError);
  });
  it("is first in the automatic order and selectable in settings", () => {
    expect(TEXT_PROVIDER_ORDER[0]).toBe("anthropic");
    expect(AppSettingsSchema.parse({ ...DEFAULT_SETTINGS, textAiProvider: "anthropic" }).textAiProvider).toBe("anthropic");
    const only = resolveTextClients("anthropic", { anthropic: () => createAnthropicClient({ apiKey: "k", client: fake({}) }), gemini: () => { throw new Error("no"); }, groq: () => { throw new Error("no"); }, cloudflare: () => { throw new Error("no"); } });
    expect(only.map((client) => client.provider)).toEqual(["anthropic"]);
  });
});
