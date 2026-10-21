import "server-only";
import { recordUsage } from "@/lib/usage/ledger";
import type { z } from "zod";
import type { AppSettings } from "@/features/settings/schema";
import { createCloudflareTextClient } from "./cloudflareTextClient";
import { TextAiHttpError } from "./errors";
import { createGeminiClient } from "./geminiClient";
import { createGroqClient } from "./groqClient";
import { createAnthropicClient } from "./anthropicClient";

export type TextProvider = "anthropic" | "gemini" | "groq" | "cloudflare";

export interface TextAiClient {
  provider: TextProvider;
  generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T>;
}

export class TextAiUnavailableError extends Error {
  constructor(message = "연결된 문안 AI가 없습니다.") {
    super(message);
    this.name = "TextAiUnavailableError";
  }
}

// Claude(2026-10-21)가 키만 있으면 맨 앞. 없으면 예전처럼 Gemini부터.
export const TEXT_PROVIDER_ORDER: readonly TextProvider[] = ["anthropic", "gemini", "groq", "cloudflare"];

// Stamp the provider name ourselves so the resolver never depends on the client carrying it.
// Spreading is safe: none of the clients' generateJson methods use `this`.
const defaultFactories: Record<TextProvider, () => TextAiClient> = {
  anthropic: () => ({ ...createAnthropicClient(), provider: "anthropic" }),
  gemini: () => ({ ...createGeminiClient(), provider: "gemini" }),
  groq: () => ({ ...createGroqClient(), provider: "groq" }),
  cloudflare: () => ({ ...createCloudflareTextClient(), provider: "cloudflare" }),
};

// A factory throws its ConfigurationError when the key is missing; that provider is simply skipped.
export function resolveTextClients(setting: AppSettings["textAiProvider"] | undefined, create: Record<TextProvider, () => TextAiClient> = defaultFactories): TextAiClient[] {
  const wanted = !setting || setting === "automatic" ? TEXT_PROVIDER_ORDER : [setting];
  const clients: TextAiClient[] = [];
  for (const provider of wanted) {
    try { clients.push(create[provider]()); } catch { /* not configured */ }
  }
  return clients;
}

// 키 문제(고치면 바로 됨) > 한도 초과(기다리면 됨) > 서버 혼잡·시간 초과 > 형식 오류 순으로 사장님에게 알릴 가치가 크다.
export function failureRank(error:unknown):number {
  if (error instanceof TextAiHttpError) return error.status === 401 || error.status === 403 ? 4 : error.status === 429 ? 3 : 2;
  return error instanceof TextAiUnavailableError ? 0 : 1;
}

function describe(error:unknown):string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 200) : String(error);
}

export function createTextClient(setting: AppSettings["textAiProvider"] | undefined, options: { onSwitch?:(from:TextProvider, reason:string)=>void; create?:Record<TextProvider, () => TextAiClient> } = {}) {
  const clients = resolveTextClients(setting, options.create);
  let last: TextProvider | null = null;
  return {
    get provider() { return last; },
    configured: clients.map((client) => client.provider),
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      let failure: unknown = new TextAiUnavailableError();
      // 제공자마다 마지막 실패를 모아 두고, 다 실패하면 가장 도움이 되는 이유를 던진다(아래 failureRank).
      // 예전에는 마지막 제공자의 오류만 던져, Gemini 한도 초과인데 "형식이 맞지 않았어요"가 보이곤 했다.
      const failures: unknown[] = [];
      for (const client of clients) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const value = await client.generateJson(prompt, schema);
            last = client.provider;
            recordUsage({ provider:client.provider, ok:true });
            return value;
          } catch (error) {
            failure = error;
            // 사용량 장부(설정 화면 "AI 사용량"): HTTP 실패면 상태 코드(429는 한도 초과)까지 적는다.
            recordUsage({ provider:client.provider, ok:false, status:error instanceof TextAiHttpError ? error.status : 0 });
            // HTTP, quota and network failures move on; only a malformed reply earns one more try here.
            if (error instanceof TextAiHttpError) break;
          }
        }
        failures.push(failure);
        options.onSwitch?.(client.provider, describe(failure));
      }
      throw failures.length ? failures.reduce((best, error) => failureRank(error) > failureRank(best) ? error : best, failures[0]) : failure;
    },
  };
}
