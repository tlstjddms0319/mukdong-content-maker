import "server-only";
import OpenAI from "openai";
import type { z } from "zod";
import { TextAiHttpError } from "./errors";
import { toStrictJsonSchema } from "./jsonSchema";
import { recordGroqLimits } from "@/lib/usage/ledger";

export class GroqConfigurationError extends Error {
  constructor(message = "Groq API 키가 연결되지 않았습니다.") {
    super(message);
    this.name = "GroqConfigurationError";
  }
}

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export function groqSdkOptions(apiKey: string) {
  // The resolver owns retries and fallback; the SDK must fail fast.
  return { apiKey, baseURL: GROQ_BASE_URL, maxRetries: 0, timeout: 30_000 };
}

type CompletionClient = {
  chat: { completions: { create(body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> } };
};

export function createGroqClient(options: { apiKey?:string; model?:string; client?:CompletionClient } = {}) {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? "";
  if (!apiKey) throw new GroqConfigurationError();
  const model = options.model ?? process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b";
  const client: CompletionClient = options.client ?? new OpenAI(groqSdkOptions(apiKey));
  return {
    provider: "groq" as const,
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        const request = client.chat.completions.create({
          model,
          messages:[{ role:"user", content:prompt }],
          response_format:{ type:"json_schema", json_schema:{ name:"result", strict:true, schema:toStrictJsonSchema(schema) } },
          reasoning_effort:"low",
        }) as Promise<OpenAI.Chat.Completions.ChatCompletion> & { withResponse?:()=>Promise<{ data:OpenAI.Chat.Completions.ChatCompletion; response:Response }> };
        // Groq는 응답 머리글로 남은 요청·토큰 수를 알려 준다. 설정 화면 "AI 사용량"에 보여 주려고 적어 둔다.
        if (typeof request.withResponse === "function") {
          const { data, response } = await request.withResponse();
          completion = data;
          recordGroqLimits(response.headers);
        } else completion = await request;
      } catch (error) {
        const status = typeof (error as { status?:unknown }).status === "number" ? (error as { status:number }).status : 0;
        throw new TextAiHttpError("Groq", status, `Groq API 오류 (${status || "network"})`);
      }
      const text = completion.choices?.[0]?.message?.content;
      if (!text) throw new Error("Groq 응답이 비어 있습니다.");
      return schema.parse(JSON.parse(text));
    },
  };
}
