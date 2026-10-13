import "server-only";
import type { z } from "zod";
import { TEXT_AI_TIMEOUT_MS, TextAiHttpError, guardedFetch } from "./errors";
import { recordUsage } from "@/lib/usage/ledger";
import { OptionalFieldsError, toStrictJsonSchema } from "./jsonSchema";

// 예비 모델(gemini-3.1-flash-lite)은 새 필드 responseJsonSchema를 거부한다(운영 로그 2026-10-13: 400 INVALID_ARGUMENT). 그 모델은
// 예전 필드 responseSchema(OpenAPI 부분집합)를 받으므로, 스키마를 아예 빼기 전에 예전 형식으로 한 번 더 보낸다. 예전 형식이 모르는
// 키(additionalProperties·$schema·default·const 등)는 떼어 낸다. 스키마 없이 보내면 모델이 객체 대신 배열을 돌려주기도 해
// 구성안이 통째로 기본 문안으로 떨어졌다.
const LEGACY_DROP=new Set(["additionalProperties","$schema","default","const","$defs","$ref","minimum","maximum","exclusiveMinimum","exclusiveMaximum","minLength","maxLength","pattern","minItems","maxItems","propertyNames","nullable"]);
export function toLegacyResponseSchema(node:unknown):unknown {
  if(Array.isArray(node))return node.map(toLegacyResponseSchema);
  if(!node||typeof node!=="object")return node;
  const copy:Record<string,unknown>={};
  for(const [key,value] of Object.entries(node as Record<string,unknown>)){
    if(LEGACY_DROP.has(key))continue;
    if(key==="type"&&Array.isArray(value)){copy.type=value.find(item=>item!=="null")??value[0];continue;}
    copy[key]=key==="properties"&&value&&typeof value==="object"&&!Array.isArray(value)
      ?Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([name,child])=>[name,toLegacyResponseSchema(child)]))
      :toLegacyResponseSchema(value);
  }
  if(copy.const!==undefined)delete copy.const;
  return copy;
}

// Gemini의 responseJsonSchema는 배열 길이 제한(minItems·maxItems)을 받지 않는다(점검 2026-10-13: 구성안 스키마가 기본 모델에서도 400,
// minItems·maxItems만 떼면 200). 그 때문에 구성안 요청마다 400 → 예전 형식 재요청으로 호출이 두 배가 됐다. 길이는 받은 뒤 zod가 검사한다.
export function withoutArrayBounds(node:unknown):unknown {
  if(Array.isArray(node))return node.map(withoutArrayBounds);
  if(!node||typeof node!=="object")return node;
  const copy:Record<string,unknown>={};
  for(const [key,value] of Object.entries(node as Record<string,unknown>)){
    if(key==="minItems"||key==="maxItems")continue;
    copy[key]=key==="properties"&&value&&typeof value==="object"&&!Array.isArray(value)
      ?Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([name,child])=>[name,withoutArrayBounds(child)]))
      :withoutArrayBounds(value);
  }
  return copy;
}

// 모델이 객체 대신 배열을 보내면(스키마 없는 요청에서 가끔) 객체 하나를 감싼 배열은 풀고, 그 밖의 배열은 그대로 둔다(검사에서 떨어진다).
export function unwrapSingleObject(value:unknown):unknown {
  return Array.isArray(value)&&value.length===1&&value[0]&&typeof value[0]==="object"&&!Array.isArray(value[0])?value[0]:value;
}

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
  const call = (name:string, prompt:string, jsonSchema?:Record<string, unknown>, legacy=false) => guardedFetch("Gemini", () => request(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,
    { method:"POST", signal:AbortSignal.timeout(TEXT_AI_TIMEOUT_MS), headers:{ "Content-Type":"application/json", "x-goog-api-key":apiKey }, body:JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ responseMimeType:"application/json", ...(jsonSchema ? (legacy ? { responseSchema:toLegacyResponseSchema(jsonSchema) } : { responseJsonSchema:jsonSchema }) : {}) } }) },
  ));
  return {
    provider: "gemini" as const,
    async generateJson<T>(prompt:string, schema:z.ZodType<T>):Promise<T> {
      // Schemas with optional fields cannot be expressed strictly; plain JSON mode still works for them.
      let jsonSchema:Record<string, unknown>|undefined;
      try { jsonSchema = withoutArrayBounds(toStrictJsonSchema(schema)) as Record<string, unknown>; }
      catch (error) { if (!(error instanceof OptionalFieldsError)) throw error; jsonSchema = undefined; }
      // Gemini's JSON Schema support is a moving subset: if a model rejects the new field, try the legacy field, then once without any schema.
      // 모델마다 받는 형식이 달라서 어느 형식이 통했는지는 모델별로 기억한다(예비 모델로 넘어가도 첫 모델의 거부가 번지지 않게).
      const legacyFor=new Set<string>();
      const send = async (name:string) => {
        let response = await call(name, prompt, jsonSchema, legacyFor.has(name));
        if (response.status===400 && jsonSchema && !legacyFor.has(name)) {
          const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 200);
          console.warn(`[text-ai] Gemini(${name})가 responseJsonSchema를 거부해 예전 형식(responseSchema)으로 다시 요청합니다:`, detail);
          legacyFor.add(name);
          response = await call(name, prompt, jsonSchema, true);
        }
        if (response.status===400 && jsonSchema) {
          const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 200);
          console.warn(`[text-ai] Gemini(${name})가 스키마를 거부해 스키마 없이 다시 요청합니다:`, detail);
          response = await call(name, prompt);
        }
        return response;
      };
      let response = await send(model);
      if (response.status===503) response = await send(model);
      // Free quotas are counted per model, so a second flash-lite model doubles the daily headroom.
      // 503(과부하)도 모델마다 따로 나므로(운영 로그 2026-10-13: 기본 모델 503 두 번 → 준비된 주제), 한 번 더 해도 503이면 예비 모델로 간다.
      if ((response.status===429 || response.status===503) && fallbackModel && fallbackModel!==model) {
        // 첫 모델의 무료 한도가 찬 것을 사용량 장부에 남긴다(두 번째 모델이 성공하면 textClient는 성공만 본다).
        if (response.status===429) recordUsage({ provider:"gemini", ok:false, status:429 });
        else console.warn(`[text-ai] Gemini(${model})가 바빠요(503). 예비 모델(${fallbackModel})로 다시 요청합니다.`);
        response = await send(fallbackModel);
      }
      if (!response.ok) throw new TextAiHttpError("Gemini", response.status);
      const body = await response.json() as { candidates?:Array<{ content?:{ parts?:Array<{ text?:string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
      return schema.parse(unwrapSingleObject(JSON.parse(text)));
    },
  };
}
