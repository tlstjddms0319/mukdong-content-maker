import "server-only";
import type { z } from "zod";
import { TextAiHttpError } from "./errors";
import { toStrictJsonSchema } from "./jsonSchema";

export class CloudflareTextConfigurationError extends Error {
  constructor(message = "Cloudflare 계정 ID와 Workers AI 토큰이 연결되지 않았습니다.") {
    super(message);
    this.name = "CloudflareTextConfigurationError";
  }
}

type Fetch = typeof fetch;

function extractJson(text:string):string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = (fenced ? fenced[1] : text).trim();
  const start = inner.indexOf("{"), end = inner.lastIndexOf("}");
  return start >= 0 && end > start ? inner.slice(start, end + 1) : inner;
}

export function createCloudflareTextClient(options: { accountId?:string; token?:string; model?:string; fetch?:Fetch } = {}) {
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = options.token ?? process.env.CLOUDFLARE_API_TOKEN ?? "";
  if (!accountId || !token) throw new CloudflareTextConfigurationError();
  const model = options.model ?? process.env.CLOUDFLARE_TEXT_MODEL ?? "@cf/qwen/qwen3-30b-a3b-fp8";
  const request = options.fetch ?? fetch;
  return {
    provider: "cloudflare" as const,
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      const response = await request(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`, {
        method:"POST",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body:JSON.stringify({
          messages:[{ role:"system", content:"요청한 JSON 스키마에 맞는 JSON만 출력하세요. 설명이나 마크다운을 붙이지 마세요." }, { role:"user", content:prompt }],
          response_format:{ type:"json_schema", json_schema:toStrictJsonSchema(schema) },
          max_tokens:4096,
        }),
      });
      if (!response.ok) throw new TextAiHttpError("Cloudflare", response.status);
      const body = await response.json() as { success?:boolean; result?:{ response?:unknown } };
      const payload = body.result?.response;
      if (!body.success || payload === undefined || payload === null || payload === "") throw new Error("Cloudflare 응답이 비어 있습니다.");
      return schema.parse(typeof payload === "string" ? JSON.parse(extractJson(payload)) : payload);
    },
  };
}
