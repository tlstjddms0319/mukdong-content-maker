import "server-only";
import { recordUsage } from "@/lib/usage/ledger";
import type { z } from "zod";
import type { AppSettings } from "@/features/settings/schema";
import { createCloudflareTextClient } from "./cloudflareTextClient";
import { TextAiHttpError } from "./errors";
import { createGeminiClient } from "./geminiClient";
import { createGroqClient } from "./groqClient";

export type TextProvider = "gemini" | "groq" | "cloudflare";

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

export const TEXT_PROVIDER_ORDER: readonly TextProvider[] = ["gemini", "groq", "cloudflare"];

// Stamp the provider name ourselves so the resolver never depends on the client carrying it.
// Spreading is safe: none of the clients' generateJson methods use `this`.
const defaultFactories: Record<TextProvider, () => TextAiClient> = {
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
        options.onSwitch?.(client.provider, describe(failure));
      }
      throw failure;
    },
  };
}
