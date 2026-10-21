// Claude(Anthropic API) 글 제공자(2026-10-21, 사장님 결정: 글 품질 테스트). 다른 제공자와 같은 모양(generateJson)으로,
// 구조화 출력(output_config.format)으로 JSON을 받아 zod 스키마로 검사한다. 키는 ANTHROPIC_API_KEY(.env.local 또는 Render 환경 변수).
// 모델은 ANTHROPIC_TEXT_MODEL(기본 claude-opus-5-5). 재시도·다음 제공자 넘기기는 textClient가 맡으므로 SDK 재시도는 끈다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { TextAiHttpError } from "./errors";

export class AnthropicConfigurationError extends Error {
  constructor(message = "Claude API 키가 연결되지 않았습니다.") {
    super(message);
    this.name = "AnthropicConfigurationError";
  }
}

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
// 구성안 한 번이 긴 JSON(장 5~9개)이라 45초보다 넉넉히. 그래도 넘기면 다음 제공자로 간다.
export const ANTHROPIC_TIMEOUT_MS = 120_000;

export type ParseClient = {
  messages: { parse(body: Anthropic.MessageCreateParamsNonStreaming & { output_config?: unknown }): Promise<{ parsed_output: unknown; stop_reason: string | null; usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null } }> };
};

export function anthropicSdkOptions(apiKey: string) {
  return { apiKey, maxRetries: 0, timeout: ANTHROPIC_TIMEOUT_MS };
}

export function createAnthropicClient(options: { apiKey?: string; model?: string; client?: ParseClient; onUsage?: (usage: { inputTokens: number; outputTokens: number; cachedTokens: number }) => void } = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey.trim()) throw new AnthropicConfigurationError();
  const model = options.model ?? process.env.ANTHROPIC_TEXT_MODEL ?? ANTHROPIC_DEFAULT_MODEL;
  const client: ParseClient = options.client ?? (new Anthropic(anthropicSdkOptions(apiKey)) as unknown as ParseClient);
  return {
    provider: "anthropic" as const,
    model,
    async generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
      let response: Awaited<ReturnType<ParseClient["messages"]["parse"]>>;
      try {
        response = await client.messages.parse({
          model,
          max_tokens: 16000,
          messages: [{ role: "user", content: prompt }],
          // 카드 글은 짧고 규칙이 많다. 깊은 생각보다 규칙 준수가 중요하므로 effort는 낮게(비용·시간도 준다).
          output_config: { format: zodOutputFormat(schema as z.ZodType), effort: "low" },
        } as Anthropic.MessageCreateParamsNonStreaming & { output_config: unknown });
      } catch (error) {
        const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 0;
        const detail = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 160) : "";
        throw new TextAiHttpError("Claude", status, status === 429 ? "Claude API 한도에 걸렸어요(429)." : status === 401 || status === 403 ? "Claude API 키가 맞지 않아요." : `Claude API 오류 (${status || "network"})${detail ? `: ${detail}` : ""}`);
      }
      if (response.usage) options.onUsage?.({ inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cachedTokens: response.usage.cache_read_input_tokens ?? 0 });
      if (response.stop_reason === "refusal") throw new TextAiHttpError("Claude", 0, "Claude가 이 요청에 답하지 않았어요(안전 기준).");
      if (response.parsed_output === null || response.parsed_output === undefined) throw new Error("Claude 응답을 JSON으로 읽지 못했습니다.");
      return schema.parse(response.parsed_output);
    },
  };
}
