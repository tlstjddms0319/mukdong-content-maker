import "server-only";
import type { z } from "zod";

export class GeminiConfigurationError extends Error {
  constructor(message = "Gemini API 키가 연결되지 않았습니다.") {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

type Fetch = typeof fetch;

export function createGeminiClient(options: { apiKey?:string; model?:string; fetch?:Fetch } = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) throw new GeminiConfigurationError();
  const model = options.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash";
  const request = options.fetch ?? fetch;
  return {
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const init={
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-goog-api-key":apiKey },
        body:JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ responseMimeType:"application/json" } }),
      };
      let response = await request(url, init);
      if(response.status===503) response=await request(url, init);
      if (!response.ok) throw new Error(`Gemini API 오류 (${response.status})`);
      const body = await response.json() as { candidates?:Array<{ content?:{ parts?:Array<{ text?:string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
      return schema.parse(JSON.parse(text));
    },
  };
}
