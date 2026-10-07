import "server-only";
import type { z } from "zod";
import { TEXT_AI_TIMEOUT_MS, TextAiHttpError, guardedFetch } from "./errors";
import { recordUsage } from "@/lib/usage/ledger";
import { OptionalFieldsError, toStrictJsonSchema } from "./jsonSchema";

export class GeminiConfigurationError extends Error {
  constructor(message = "Gemini API 키가 연결되지 않았습니다.") {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

type Fetch = typeof fetch;

export function createGeminiClient(options: { apiKey?:string; model?:string; fallbackModel?:string; fetch?:Fetch } = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) throw new GeminiConfigurationError();
  const model = options.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3.5-flash-lite";
  const fallbackModel = options.fallbackModel ?? process.env.GEMINI_FALLBACK_TEXT_MODEL ?? "gemini-3.1-flash-lite";
  const request = options.fetch ?? fetch;
  // 요청마다 45초 제한. 멈추거나 연결이 끊기면 TextAiHttpError(0)로 바꿔 textClient가 바로 다음 AI로 넘어가게 한다.
  const call = (name:string, prompt:string, jsonSchema?:Record<string, unknown>) => guardedFetch("Gemini", () => request(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,
    { method:"POST", signal:AbortSignal.timeout(TEXT_AI_TIMEOUT_MS), headers:{ "Content-Type":"application/json", "x-goog-api-key":apiKey }, body:JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ responseMimeType:"application/json", ...(jsonSchema ? { responseJsonSchema:jsonSchema } : {}) } }) },
  ));
  return {
    provider: "gemini" as const,
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      // Schemas with optional fields cannot be expressed strictly; plain JSON mode still works for them.
      let jsonSchema:Record<string, unknown>|undefined;
      try { jsonSchema = toStrictJsonSchema(schema); }
      catch (error) { if (!(error instanceof OptionalFieldsError)) throw error; jsonSchema = undefined; }
      // Gemini's JSON Schema support is a moving subset: if a model rejects the schema, say so and retry once without it.
      const send = async (name:string) => {
        let response = await call(name, prompt, jsonSchema);
        if (response.status===400 && jsonSchema) {
          const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 200);
          console.warn(`[text-ai] Gemini(${name})가 responseJsonSchema를 거부해 스키마 없이 다시 요청합니다:`, detail);
          jsonSchema = undefined;
          response = await call(name, prompt);
        }
        return response;
      };
      let response = await send(model);
      if (response.status===503) response = await send(model);
      // Free quotas are counted per model, so a second flash-lite model doubles the daily headroom.
      if (response.status===429 && fallbackModel && fallbackModel!==model) {
        // 첫 모델의 무료 한도가 찬 것을 사용량 장부에 남긴다(두 번째 모델이 성공하면 textClient는 성공만 본다).
        recordUsage({ provider:"gemini", ok:false, status:429 });
        response = await send(fallbackModel);
      }
      if (!response.ok) throw new TextAiHttpError("Gemini", response.status);
      const body = await response.json() as { candidates?:Array<{ content?:{ parts?:Array<{ text?:string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
      return schema.parse(JSON.parse(text));
    },
  };
}
