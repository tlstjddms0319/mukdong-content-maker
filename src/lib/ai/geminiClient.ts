import "server-only";
import type { z } from "zod";
import { TextAiHttpError } from "./errors";

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
  const call = (name:string, prompt:string) => request(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,
    { method:"POST", headers:{ "Content-Type":"application/json", "x-goog-api-key":apiKey }, body:JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ responseMimeType:"application/json" } }) },
  );
  return {
    provider: "gemini" as const,
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      let response = await call(model, prompt);
      if (response.status===503) response = await call(model, prompt);
      // Free quotas are counted per model, so a second flash-lite model doubles the daily headroom.
      if (response.status===429 && fallbackModel && fallbackModel!==model) response = await call(fallbackModel, prompt);
      if (!response.ok) throw new TextAiHttpError("Gemini", response.status);
      const body = await response.json() as { candidates?:Array<{ content?:{ parts?:Array<{ text?:string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
      return schema.parse(JSON.parse(text));
    },
  };
}
