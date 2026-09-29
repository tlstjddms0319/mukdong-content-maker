import "server-only";
import OpenAI from "openai";
import type { z } from "zod";
import { TextAiHttpError } from "./errors";
import { toStrictJsonSchema } from "./jsonSchema";

export class GroqConfigurationError extends Error {
  constructor(message = "Groq API 키가 연결되지 않았습니다.") {
    super(message);
    this.name = "GroqConfigurationError";
  }
}

type CompletionClient = {
  chat: { completions: { create(body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> } };
};

export function createGroqClient(options: { apiKey?:string; model?:string; client?:CompletionClient } = {}) {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? "";
  if (!apiKey) throw new GroqConfigurationError();
  const model = options.model ?? process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b";
  const client: CompletionClient = options.client ?? new OpenAI({ apiKey, baseURL:"https://api.groq.com/openai/v1" });
  return {
    provider: "groq" as const,
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await client.chat.completions.create({
          model,
          messages:[{ role:"user", content:prompt }],
          response_format:{ type:"json_schema", json_schema:{ name:"result", strict:true, schema:toStrictJsonSchema(schema) } },
          reasoning_effort:"low",
        });
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
