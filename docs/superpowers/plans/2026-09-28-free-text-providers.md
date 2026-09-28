# Free Text AI Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let topic, caption and carousel-plan generation run on Gemini flash-lite, Groq or Cloudflare Workers AI behind one interface, fall back automatically, and produce a side-by-side comparison report so the owner can pick the best free provider.

**Architecture:** Every provider implements `generateJson(prompt, zodSchema)` exactly like today's Gemini client. A resolver (`src/lib/ai/textClient.ts`) turns the `textAiProvider` setting plus available keys into an ordered client list and retries/falls back. The three API routes swap `createGeminiClient()` for the resolver and report which provider answered. A Node script imports the same clients through a small loader to build the comparison report.

**Tech Stack:** Next.js 16 route handlers, Zod 4 (`z.toJSONSchema`), `openai` SDK 7 (pointed at Groq), plain `fetch` for Gemini and Cloudflare REST, Vitest (jsdom + node), Playwright, Node 24 type stripping for the script.

**Spec:** `docs/superpowers/specs/2026-09-28-free-text-providers-design.md`

## Global Constraints

- Node 20+ runtime for the app; the comparison script requires Node 24 (native type stripping) and is documented as such.
- No new dependencies. `openai`, `zod`, `sharp` are already installed.
- Secrets never appear in logs, responses, reports or test fixtures. Tests use fake keys like `"secret"` and assert the URL never contains them.
- Default text provider setting is `"automatic"`; order is Gemini → Groq → Cloudflare. Stored settings files without `textAiRoutingVersion: 1` read as `"automatic"`.
- Gemini default model `gemini-3.5-flash-lite`, fallback model `gemini-3.1-flash-lite`. Groq default `openai/gpt-oss-120b`. Cloudflare default `@cf/qwen/qwen3-30b-a3b-fp8`.
- Korean UI copy: short sentences, no provider jargon beyond the provider name. The caption status reads `AI로 문안을 만들었어요 (Groq)`.
- Files in this repo use LF; some are CRLF. When editing with scripts, preserve the file's existing line endings. Run `npm test`, `npm run lint`, `npx tsc --noEmit` before every commit; run `npx playwright test` at the end of Tasks 5, 8 and 10.
- Commit after each task with the message given in the task; end each commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/lib/ai/errors.ts` (new) | `TextAiHttpError` shared by all providers so the resolver can tell HTTP failures from parse failures. |
| `src/lib/ai/jsonSchema.ts` (new) | `toStrictJsonSchema(zod)` → JSON Schema with `additionalProperties:false` and every property required. |
| `src/lib/ai/geminiClient.ts` (modify) | Default model flash-lite, 429 → fallback model once, exposes `provider:"gemini"`, throws `TextAiHttpError`. |
| `src/lib/ai/groqClient.ts` (new) | Groq via `openai` SDK, strict `json_schema`, `reasoning_effort:"low"`. |
| `src/lib/ai/cloudflareTextClient.ts` (new) | Cloudflare Workers AI REST text generation with `response_format json_schema`. |
| `src/lib/ai/textClient.ts` (new) | `resolveTextClients`, `createTextClient` (ordered fallback, last provider). |
| `src/features/settings/{schema,defaults,repository}.ts` (modify) | `textAiProvider` enum + migration marker `textAiRoutingVersion`. |
| `src/components/settings/SettingsForm.tsx`, `src/app/settings/page.tsx` (modify) | `문안 AI` select, Groq connection card. |
| `src/app/api/{topics,copy,images/plan}/route.ts` (modify) | Use the resolver, report `provider`. |
| `src/components/copy/CopyEditor.tsx` (modify) | Provider-neutral status text with provider name. |
| `scripts/register-ts.mjs`, `scripts/ts-alias-hooks.mjs`, `scripts/compare-text-providers.mjs` (new) | Comparison report using the real clients. |
| `.env.example`, `render.yaml`, `README.md`, `docs/APP_OPERATION_GUIDE.ko.md` (modify) | New variables and owner-facing explanation. |

---

### Task 1: Shared error type and strict JSON schema helper

**Files:**
- Create: `src/lib/ai/errors.ts`
- Create: `src/lib/ai/jsonSchema.ts`
- Test: `tests/unit/jsonSchema.test.ts`

**Interfaces:**
- Produces: `class TextAiHttpError extends Error { provider: string; status: number }` and `toStrictJsonSchema(schema: z.ZodType): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/jsonSchema.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toStrictJsonSchema } from "@/lib/ai/jsonSchema";
import { TextAiHttpError } from "@/lib/ai/errors";
import { GeneratedCopyContentSchema } from "@/features/copy/schema";
import { topicGenerationSchema } from "@/features/topics/prompt";
import { topicDirectionsForRound } from "@/features/topics/service";
import { CarouselPlanSchema } from "@/features/images/carousel";

describe("toStrictJsonSchema", () => {
  it("marks every object closed with all properties required", () => {
    const json = toStrictJsonSchema(z.object({ title: z.string(), tags: z.array(z.string()) }));
    expect(json).toMatchObject({ type: "object", additionalProperties: false, required: ["title", "tags"] });
    expect(json).not.toHaveProperty("$schema");
  });

  it("converts the three app schemas without optional fields", () => {
    for (const schema of [GeneratedCopyContentSchema, topicGenerationSchema(topicDirectionsForRound(0)), CarouselPlanSchema]) {
      expect(() => toStrictJsonSchema(schema as z.ZodType)).not.toThrow();
    }
  });

  it("refuses optional fields because strict providers would reject them", () => {
    expect(() => toStrictJsonSchema(z.object({ title: z.string(), note: z.string().optional() }))).toThrow(/note/);
  });

  it("keeps provider and status on HTTP errors", () => {
    const error = new TextAiHttpError("Gemini", 429);
    expect(error.message).toBe("Gemini API 오류 (429)");
    expect(error.status).toBe(429);
    expect(error.provider).toBe("Gemini");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/jsonSchema.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/jsonSchema` and `@/lib/ai/errors`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ai/errors.ts
export class TextAiHttpError extends Error {
  constructor(public readonly provider: string, public readonly status: number, message = `${provider} API 오류 (${status})`) {
    super(message);
    this.name = "TextAiHttpError";
  }
}
```

```ts
// src/lib/ai/jsonSchema.ts
import { z } from "zod";

// Groq strict mode and Cloudflare json_schema both want closed objects with every property required.
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return tighten(json) as Record<string, unknown>;
}

function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (!node || typeof node !== "object") return node;
  const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  if (copy.type === "object" && copy.properties && typeof copy.properties === "object") {
    const keys = Object.keys(copy.properties as Record<string, unknown>);
    const required = new Set(Array.isArray(copy.required) ? (copy.required as string[]) : []);
    const optional = keys.filter((key) => !required.has(key));
    if (optional.length) throw new Error(`선택 필드가 있어 엄격한 JSON 스키마로 보낼 수 없습니다: ${optional.join(", ")}`);
    copy.additionalProperties = false;
  }
  for (const key of Object.keys(copy)) copy[key] = tighten(copy[key]);
  return copy;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/jsonSchema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/errors.ts src/lib/ai/jsonSchema.ts tests/unit/jsonSchema.test.ts
git commit -m "feat: add strict JSON schema helper and shared text AI error"
```

---

### Task 2: Gemini client uses flash-lite and falls back on rate limits

**Files:**
- Modify: `src/lib/ai/geminiClient.ts`
- Test: `tests/unit/geminiClient.test.ts`

**Interfaces:**
- Consumes: `TextAiHttpError` from Task 1.
- Produces: `createGeminiClient(options?: { apiKey?; model?; fallbackModel?; fetch? })` returning `{ provider: "gemini"; generateJson<T>(prompt, schema): Promise<T> }`. Non-OK responses throw `TextAiHttpError("Gemini", status)`.

- [ ] **Step 1: Update the model expectation and add the fallback test**

In `tests/unit/geminiClient.test.ts` change the third test to:

```ts
  it("uses the free flash-lite model by default", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'{"ok":true}' }] } }] }), { status:200 }));
    const client = createGeminiClient({ apiKey:"secret", fetch:request });
    await client.generateJson("test", z.object({ok:z.boolean()}));
    expect(request.mock.calls[0][0]).toContain("gemini-3.5-flash-lite:generateContent");
    expect(client.provider).toBe("gemini");
  });
```

Append two tests inside the describe block:

```ts
  it("switches to the fallback model once after a rate limit", async () => {
    const request=vi.fn()
      .mockResolvedValueOnce(new Response("{}", {status:429}))
      .mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}), {status:200}));
    await expect(createGeminiClient({apiKey:"secret",fetch:request}).generateJson("test",z.object({ok:z.boolean()}))).resolves.toEqual({ok:true});
    expect(request.mock.calls[1][0]).toContain("gemini-3.1-flash-lite:generateContent");
  });

  it("reports the HTTP status when both models are rate limited", async () => {
    const request=vi.fn().mockResolvedValue(new Response("{}", {status:429}));
    await expect(createGeminiClient({apiKey:"secret",fetch:request}).generateJson("test",z.object({ok:z.boolean()}))).rejects.toMatchObject({name:"TextAiHttpError",status:429,provider:"Gemini"});
    expect(request).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/geminiClient.test.ts`
Expected: FAIL — default model still `gemini-3.6-flash`, no `provider`, no fallback.

- [ ] **Step 3: Rewrite the client**

Replace the body of `src/lib/ai/geminiClient.ts` from `type Fetch` to the end with:

```ts
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
```

Add `import { TextAiHttpError } from "./errors";` after the zod import.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/geminiClient.test.ts tests/unit/topicRoute.test.ts tests/unit/topicSource.test.ts tests/unit/copyRouteQuality.test.ts`
Expected: PASS. (`topicSource` still sees "429" in the warning because the message is `Gemini API 오류 (429)`.)

- [ ] **Step 5: Point the local environment at the new default**

Run (does not print secrets): `sed -i 's/^GEMINI_TEXT_MODEL=.*/GEMINI_TEXT_MODEL=gemini-3.5-flash-lite/' .env.local && grep -c "^GEMINI_TEXT_MODEL=gemini-3.5-flash-lite" .env.local`
Expected: `1`. `.env.local` is git-ignored; nothing to commit for it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/geminiClient.ts tests/unit/geminiClient.test.ts
git commit -m "feat: default Gemini text to flash-lite with rate-limit fallback"
```

---

### Task 3: Groq client

**Files:**
- Create: `src/lib/ai/groqClient.ts`
- Test: `tests/unit/groqClient.test.ts`

**Interfaces:**
- Consumes: `toStrictJsonSchema`, `TextAiHttpError` (Task 1).
- Produces: `createGroqClient(options?: { apiKey?; model?; client? })` returning `{ provider: "groq"; generateJson }`; `class GroqConfigurationError`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/groqClient.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GroqConfigurationError, createGroqClient } from "@/lib/ai/groqClient";

vi.mock("server-only", () => ({}));

describe("Groq client", () => {
  it("asks for a strict JSON schema and parses the reply", async () => {
    const create = vi.fn().mockResolvedValue({ choices:[{ message:{ content:'{"title":"삼합 이야기"}' } }] });
    const client = createGroqClient({ apiKey:"secret", client:{ chat:{ completions:{ create } } } });
    await expect(client.generateJson("추천해 줘", z.object({ title:z.string() }))).resolves.toEqual({ title:"삼합 이야기" });
    const body = create.mock.calls[0][0];
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format).toMatchObject({ type:"json_schema", json_schema:{ strict:true, schema:{ type:"object", additionalProperties:false, required:["title"] } } });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(client.provider).toBe("groq");
  });

  it("explains when the Groq key is missing", () => {
    expect(() => createGroqClient({ apiKey:"" })).toThrow(GroqConfigurationError);
  });

  it("maps SDK failures to an HTTP error with status", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("rate"), { status:429 }));
    const client = createGroqClient({ apiKey:"secret", client:{ chat:{ completions:{ create } } } });
    await expect(client.generateJson("x", z.object({ ok:z.boolean() }))).rejects.toMatchObject({ name:"TextAiHttpError", provider:"Groq", status:429 });
  });

  it("rejects an empty reply", async () => {
    const create = vi.fn().mockResolvedValue({ choices:[{ message:{ content:null } }] });
    const client = createGroqClient({ apiKey:"secret", client:{ chat:{ completions:{ create } } } });
    await expect(client.generateJson("x", z.object({ ok:z.boolean() }))).rejects.toThrow(/비어/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/groqClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the client**

```ts
// src/lib/ai/groqClient.ts
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
```

- [ ] **Step 4: Run test and type-check**

Run: `npx vitest run tests/unit/groqClient.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. If `tsc` complains that the fake `client` in the test is not assignable, type the test fake as `unknown as Parameters<typeof createGroqClient>[0]["client"]`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/groqClient.ts tests/unit/groqClient.test.ts
git commit -m "feat: add Groq text client with strict JSON schema"
```

---

### Task 4: Cloudflare Workers AI text client

**Files:**
- Create: `src/lib/ai/cloudflareTextClient.ts`
- Test: `tests/unit/cloudflareTextClient.test.ts`

**Interfaces:**
- Consumes: `toStrictJsonSchema`, `TextAiHttpError`.
- Produces: `createCloudflareTextClient(options?: { accountId?; token?; model?; fetch? })` returning `{ provider: "cloudflare"; generateJson }`; `class CloudflareTextConfigurationError`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/cloudflareTextClient.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CloudflareTextConfigurationError, createCloudflareTextClient } from "@/lib/ai/cloudflareTextClient";

vi.mock("server-only", () => ({}));

const ok = (result:unknown) => new Response(JSON.stringify({ success:true, result }), { status:200 });

describe("Cloudflare text client", () => {
  it("posts messages with a JSON schema and reads an object reply", async () => {
    const request = vi.fn().mockResolvedValue(ok({ response:{ title:"삼합 이야기" } }));
    const client = createCloudflareTextClient({ accountId:"acct", token:"secret", fetch:request });
    await expect(client.generateJson("추천해 줘", z.object({ title:z.string() }))).resolves.toEqual({ title:"삼합 이야기" });
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/qwen/qwen3-30b-a3b-fp8");
    expect(init.headers).toMatchObject({ Authorization:"Bearer secret" });
    expect(String(url)).not.toContain("secret");
    const body = JSON.parse(init.body);
    expect(body.messages.at(-1)).toEqual({ role:"user", content:"추천해 줘" });
    expect(body.response_format).toMatchObject({ type:"json_schema", json_schema:{ type:"object", additionalProperties:false } });
    expect(body.max_tokens).toBe(4096);
    expect(client.provider).toBe("cloudflare");
  });

  it("accepts a JSON string reply, even wrapped in code fences", async () => {
    const request = vi.fn().mockResolvedValue(ok({ response:'```json\n{"title":"문자열"}\n```' }));
    const client = createCloudflareTextClient({ accountId:"acct", token:"secret", fetch:request });
    await expect(client.generateJson("x", z.object({ title:z.string() }))).resolves.toEqual({ title:"문자열" });
  });

  it("explains missing configuration", () => {
    expect(() => createCloudflareTextClient({ accountId:"", token:"" })).toThrow(CloudflareTextConfigurationError);
  });

  it("maps HTTP failures to an error with status", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}", { status:429 }));
    const client = createCloudflareTextClient({ accountId:"acct", token:"secret", fetch:request });
    await expect(client.generateJson("x", z.object({ ok:z.boolean() }))).rejects.toMatchObject({ name:"TextAiHttpError", provider:"Cloudflare", status:429 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cloudflareTextClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the client**

```ts
// src/lib/ai/cloudflareTextClient.ts
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
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/cloudflareTextClient.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/cloudflareTextClient.ts tests/unit/cloudflareTextClient.test.ts
git commit -m "feat: add Cloudflare Workers AI text client"
```

---

### Task 5: Text provider setting, migration and settings screen

**Files:**
- Modify: `src/features/settings/schema.ts` (line `textAiProvider: z.literal("gemini")`)
- Modify: `src/features/settings/defaults.ts` (`textAiProvider: "gemini"`)
- Modify: `src/features/settings/repository.ts` (lines 18, 30, 37)
- Modify: `src/components/settings/SettingsForm.tsx`
- Modify: `src/app/settings/page.tsx`
- Test: `tests/unit/repository.test.ts`, `tests/unit/SettingsForm.test.tsx`, `tests/e2e/error-states.spec.ts`

**Interfaces:**
- Produces: `AppSettings["textAiProvider"]` = `"automatic" | "gemini" | "groq" | "cloudflare"`; `SettingsForm` prop `connections: { gemini; groq; cloudflare; openai }`.

- [ ] **Step 1: Update the failing tests**

In `tests/unit/repository.test.ts`: in "exposes stable beginner defaults" change `textAiProvider: "gemini"` to `textAiProvider: "automatic"`. In "migrates the previous single-provider settings automatically" change the expectation to `textAiProvider:"automatic"`. Append inside the same describe:

```ts
  it("keeps an explicitly saved text provider once the routing marker exists", async () => {
    const directory = await temporaryDirectory();
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = directory;
    try {
      await writeSettings({ ...DEFAULT_SETTINGS, textAiProvider:"groq" });
      expect(await readSettings()).toMatchObject({ textAiProvider:"groq" });
      await writeFile(path.join(directory, "settings.json"), JSON.stringify({ ...DEFAULT_SETTINGS, textAiProvider:"gemini" }), "utf8");
      expect(await readSettings()).toMatchObject({ textAiProvider:"automatic" });
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    }
  });
```

In `tests/unit/SettingsForm.test.tsx`: in the first test replace `expect(screen.queryByLabelText("문안 AI")).not.toBeInTheDocument();` with `expect(screen.getByLabelText("문안 AI")).toHaveValue("automatic");` and add `expect(screen.getByRole("option", { name:"자동 (Gemini → Groq → Cloudflare)" })).toBeInTheDocument();`. In "preserves inactive saved values" add `textAiProvider:"automatic"` to the `objectContaining`. Replace the last test with:

```ts
  it("shows every AI connection status without exposing keys", () => {
    render(<SettingsForm connections={{gemini:true,groq:false,cloudflare:true,openai:false}} />);
    expect(screen.getByText("Gemini 키 설정됨")).toBeInTheDocument();
    expect(screen.getByText("Groq 키 필요")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare 키 설정됨")).toBeInTheDocument();
    expect(screen.getByText("OpenAI 키 필요")).toBeInTheDocument();
    expect(screen.queryByText(/token-123|sk-|gsk_/)).not.toBeInTheDocument();
  });

  it("saves the chosen text provider", () => {
    const onSave=vi.fn();
    render(<SettingsForm onSave={onSave}/>);
    fireEvent.change(screen.getByLabelText("문안 AI"), { target:{ value:"groq" } });
    fireEvent.click(screen.getByRole("button", { name:"설정 저장" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ textAiProvider:"groq" }));
  });
```

In `tests/e2e/error-states.spec.ts` add after the OpenAI expectation:

```ts
  await expect(page.getByText(/Groq (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByLabel("문안 AI")).toHaveValue("automatic");
```

The `/실시간 인기 주제 연결은 후속 단계/` expectation stays as is (only "문안 AI 선택" is removed from that sentence in the component).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/repository.test.ts tests/unit/SettingsForm.test.tsx`
Expected: FAIL on the new expectations.

- [ ] **Step 3: Schema, defaults and repository**

`src/features/settings/schema.ts`: replace `textAiProvider: z.literal("gemini"),` with `textAiProvider: z.enum(["automatic", "gemini", "groq", "cloudflare"]),`.

`src/features/settings/defaults.ts`: replace `textAiProvider: "gemini",` with `textAiProvider: "automatic",`.

`src/features/settings/repository.ts` line 18: replace `textAiProvider:stored.textAiProvider ?? "gemini"` with `textAiProvider:stored.textAiRoutingVersion===1 ? stored.textAiProvider : "automatic"`. On lines 30 and 37 change both `{...settings,imageAiRoutingVersion:1,copyWritingVersion:1}` to `{...settings,imageAiRoutingVersion:1,copyWritingVersion:1,textAiRoutingVersion:1}`.

- [ ] **Step 4: Settings form and page**

In `src/components/settings/SettingsForm.tsx`:

1. Change the `connections` default and type to `{ gemini:false, groq:false, cloudflare:false, openai:false }` / `{gemini:boolean;groq:boolean;cloudflare:boolean;openai:boolean}`.
2. After the `이미지 AI` label add:

```tsx
      <label>문안 AI<select aria-label="문안 AI" value={settings.textAiProvider} onChange={e=>update("textAiProvider",e.target.value as AppSettings["textAiProvider"])}><option value="automatic">자동 (Gemini → Groq → Cloudflare)</option><option value="gemini">Gemini만</option><option value="groq">Groq만</option><option value="cloudflare">Cloudflare만 (이미지와 무료 한도 공유)</option></select></label>
```

3. In the `AI 연결 상태` panel add after the `<p>고품질로 만들려면 …</p>` paragraph: `<p>문안 AI의 자동은 키가 있는 순서로 Gemini, Groq, Cloudflare를 시도하고 모두 실패하면 준비된 문안을 써요. 세 서비스 모두 무료 한도 안에서는 비용이 없어요.</p>`. Change the Gemini card text to `Gemini {connections.gemini?"키 설정됨":"키 필요"}` with `<p>주제와 문안 생성의 첫 순서예요.</p>`; insert a Groq card `<div className="connection-card"><span className={`status-dot ${connections.groq?"on":""}`}/><div><strong>Groq {connections.groq?"키 설정됨":"키 필요"}</strong><p>Gemini 한도가 넘치면 이어받아요.</p></div></div>`; rename the Cloudflare card title to `Cloudflare {…}` with `<p>이미지 생성과 문안의 마지막 순서에 사용해요.</p>`.
4. In the `추후 적용할 옵션` paragraph remove `문안 AI 선택, ` so it reads `이미지 방식·비율·후보 수, 자동 품질 검사와 실시간 인기 주제 연결은 후속 단계에서 제공해요.`
5. In the restore button add `textAiProvider:DEFAULT_SETTINGS.textAiProvider,` to the object.

In `src/app/settings/page.tsx` change the `connections` prop to `{{gemini:Boolean(process.env.GEMINI_API_KEY),groq:Boolean(process.env.GROQ_API_KEY),cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openai:Boolean(process.env.OPENAI_API_KEY)}}`.

- [ ] **Step 5: Run unit tests, lint, types, then the settings E2E**

Run: `npm test && npm run lint && npx tsc --noEmit && npx playwright test tests/e2e/error-states.spec.ts --reporter=line`
Expected: all PASS. Look at `tests/unit/copyRouteQuality.test.ts` and `tests/unit/imageRequest.test.ts` if they fail: their mocked settings spread `DEFAULT_SETTINGS`, so they should pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings tests/unit/repository.test.ts tests/unit/SettingsForm.test.tsx tests/e2e/error-states.spec.ts src/components/settings/SettingsForm.tsx src/app/settings/page.tsx
git commit -m "feat: add text AI provider setting with Groq and Cloudflare status"
```

---

### Task 6: Resolver with ordered fallback

**Files:**
- Create: `src/lib/ai/textClient.ts`
- Test: `tests/unit/textClient.test.ts`

**Interfaces:**
- Consumes: the three `create*Client` factories, `TextAiHttpError`, `AppSettings["textAiProvider"]`.
- Produces:
  - `type TextProvider = "gemini" | "groq" | "cloudflare"`
  - `interface TextAiClient { provider: TextProvider; generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> }`
  - `resolveTextClients(setting: AppSettings["textAiProvider"] | undefined, create?: Record<TextProvider, () => TextAiClient>): TextAiClient[]`
  - `createTextClient(setting, options?: { onSwitch?: (from: TextProvider, reason: string) => void; create?: … })` returning `{ readonly provider: TextProvider | null; configured: TextProvider[]; generateJson<T>(prompt, schema): Promise<T> }`
  - `class TextAiUnavailableError extends Error` (message `연결된 문안 AI가 없습니다.`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/textClient.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TextAiHttpError } from "@/lib/ai/errors";
import { TextAiUnavailableError, createTextClient, resolveTextClients, type TextAiClient } from "@/lib/ai/textClient";

vi.mock("server-only", () => ({}));

const schema = z.object({ ok:z.boolean() });
const fake = (provider:TextAiClient["provider"], generateJson:TextAiClient["generateJson"]):TextAiClient => ({ provider, generateJson });
const factories = (overrides:Partial<Record<TextAiClient["provider"], () => TextAiClient>>) => ({
  gemini:() => { throw new Error("no key"); },
  groq:() => { throw new Error("no key"); },
  cloudflare:() => { throw new Error("no key"); },
  ...overrides,
});

describe("text client resolver", () => {
  it("orders automatic mode Gemini, Groq, Cloudflare and skips providers without keys", () => {
    const clients = resolveTextClients("automatic", factories({ cloudflare:() => fake("cloudflare", vi.fn()), gemini:() => fake("gemini", vi.fn()) }));
    expect(clients.map(client => client.provider)).toEqual(["gemini", "cloudflare"]);
  });

  it("uses only the chosen provider when one is selected", () => {
    const clients = resolveTextClients("groq", factories({ gemini:() => fake("gemini", vi.fn()), groq:() => fake("groq", vi.fn()) }));
    expect(clients.map(client => client.provider)).toEqual(["groq"]);
  });

  it("falls through to the next provider after a rate limit and reports the switch", async () => {
    const onSwitch = vi.fn();
    const client = createTextClient("automatic", { onSwitch, create:factories({
      gemini:() => fake("gemini", vi.fn().mockRejectedValue(new TextAiHttpError("Gemini", 429))),
      groq:() => fake("groq", vi.fn().mockResolvedValue({ ok:true })),
    }) });
    await expect(client.generateJson("p", schema)).resolves.toEqual({ ok:true });
    expect(client.provider).toBe("groq");
    expect(onSwitch).toHaveBeenCalledWith("gemini", "Gemini API 오류 (429)");
  });

  it("retries the same provider once when the reply did not match the schema", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new SyntaxError("bad json")).mockResolvedValueOnce({ ok:true });
    const client = createTextClient("gemini", { create:factories({ gemini:() => fake("gemini", generate) }) });
    await expect(client.generateJson("p", schema)).resolves.toEqual({ ok:true });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry the same provider after an HTTP failure", async () => {
    const generate = vi.fn().mockRejectedValue(new TextAiHttpError("Groq", 503));
    const client = createTextClient("groq", { create:factories({ groq:() => fake("groq", generate) }) });
    await expect(client.generateJson("p", schema)).rejects.toMatchObject({ status:503 });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when nothing is configured", async () => {
    const client = createTextClient("automatic", { create:factories({}) });
    expect(client.configured).toEqual([]);
    await expect(client.generateJson("p", schema)).rejects.toBeInstanceOf(TextAiUnavailableError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/textClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the resolver**

```ts
// src/lib/ai/textClient.ts
import "server-only";
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

const defaultFactories: Record<TextProvider, () => TextAiClient> = {
  gemini: () => createGeminiClient(),
  groq: () => createGroqClient(),
  cloudflare: () => createCloudflareTextClient(),
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
            return value;
          } catch (error) {
            failure = error;
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
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/textClient.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/textClient.ts tests/unit/textClient.test.ts
git commit -m "feat: resolve text AI providers with ordered fallback"
```

---

### Task 7: Routes use the resolver and report the provider

**Files:**
- Modify: `src/app/api/topics/route.ts`
- Modify: `src/app/api/copy/route.ts` (lines 17, 26, 31, 42, 44)
- Modify: `src/app/api/images/plan/route.ts`
- Test: `tests/unit/topicRoute.test.ts`, `tests/unit/topicSource.test.ts`, `tests/unit/copyRouteQuality.test.ts`, `tests/unit/carouselPlan.test.ts`

**Interfaces:**
- Consumes: `createTextClient` (Task 6), `readSettings`.
- Produces: `/api/topics` → `{ topics, source: "ai"|"fallback", provider: TextProvider|null }`; `/api/copy` → `_meta.provider` is the real provider; `/api/images/plan` → `{ plan, provider: "gemini"|"groq"|"cloudflare"|"fallback" }`.

- [ ] **Step 1: Extend the route tests first**

`tests/unit/topicRoute.test.ts`, `tests/unit/topicSource.test.ts` and `tests/unit/carouselPlan.test.ts`: add below the existing `vi.mock("@/features/auth/guard", …)` line:

```ts
vi.mock("@/features/settings/repository", () => ({ readSettings: async () => ({ textAiProvider:"automatic" }) }));
```

`tests/unit/topicSource.test.ts`: in "marks fallback topics…" add `expect(body.provider).toBeNull();`; in "marks Gemini topics as ai" add `expect(body.provider).toBe("gemini");`.

`tests/unit/carouselPlan.test.ts` line 57 keeps `provider:"gemini"` (the mocked Gemini answers).

`tests/unit/copyRouteQuality.test.ts`: find the assertion on `_meta` (search `provider`) — if none exists, add to the first successful-generation test: `expect(body._meta).toMatchObject({ provider:"gemini" });`.

Run: `npx vitest run tests/unit/topicRoute.test.ts tests/unit/topicSource.test.ts tests/unit/carouselPlan.test.ts tests/unit/copyRouteQuality.test.ts`
Expected: `topicSource` FAILS on `provider`; others PASS.

- [ ] **Step 2: Topics route**

Replace the import of `createGeminiClient` with `import { createTextClient } from "@/lib/ai/textClient";` and add `import { readSettings } from "@/features/settings/repository";`. Replace the block from `const directions = …` to `return NextResponse.json({ topics, source });` with:

```ts
    const directions = topicDirectionsForRound(input.recommendationRound);
    const settings = await readSettings();
    const client = createTextClient(settings.textAiProvider, { onSwitch:(from, reason) => console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`, reason) });
    let source: "ai" | "fallback" = "ai";
    const topics = await suggestTopics(input, { suggest:() => client.generateJson(
      buildTopicPrompt(input),
      topicGenerationSchema(directions),
    ) }, (reason) => { source = "fallback"; console.warn("[topics] using prepared topics:", reason); });
    return NextResponse.json({ topics, source, provider: source === "ai" ? client.provider : null });
```

- [ ] **Step 3: Copy route**

Replace `import { createGeminiClient } from "@/lib/ai/geminiClient";` with `import { createTextClient } from "@/lib/ai/textClient";`. Replace `const client=createGeminiClient();` with `const client=createTextClient(settings.textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});`. Replace every `_meta:{provider:"gemini"` with `_meta:{provider:client.provider??"unknown"` (three places). Change `.slice(0,7000)` on line 44 to `.slice(0,3000)` (Groq allows 8,000 tokens per minute).

- [ ] **Step 4: Plan route**

Replace the Gemini import with `import { createTextClient } from "@/lib/ai/textClient";` and add `import { readSettings } from "@/features/settings/repository";`. Change `let provider:"gemini"|"fallback"="fallback";` to `let provider:"gemini"|"groq"|"cloudflare"|"fallback"="fallback";`. Before `const plan=await planCarousel(` add `const client=createTextClient((await readSettings()).textAiProvider,{onSwitch:(from,reason)=>console.warn(`[text-ai] ${from} 실패, 다음 제공자로:`,reason)});`. Replace `createGeminiClient().generateJson(` with `client.generateJson(` and `provider="gemini";` with `provider=client.provider??"gemini";`.

- [ ] **Step 5: Run the route tests, full unit suite, lint, types**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: PASS. If `tests/unit/imageRequest.test.ts` or others mock `readSettings` without `textAiProvider`, the resolver treats `undefined` as automatic, so they still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/topics/route.ts src/app/api/copy/route.ts src/app/api/images/plan/route.ts tests/unit/topicRoute.test.ts tests/unit/topicSource.test.ts tests/unit/carouselPlan.test.ts tests/unit/copyRouteQuality.test.ts
git commit -m "feat: route text generation through the provider resolver"
```

---

### Task 8: Caption screen names the provider that answered

**Files:**
- Modify: `src/components/copy/CopyEditor.tsx` (lines 10, 29, 38, 46)
- Test: `tests/unit/CopyEditorGeneration.test.tsx`, `tests/unit/DraftWizard.test.tsx` (only if they assert the old text), `tests/e2e/draft-flow.spec.ts` (only if it asserts the old text)

**Interfaces:**
- Consumes: `/api/copy` `_meta.provider` from Task 7.

- [ ] **Step 1: Find and update assertions on the old wording**

Run: `grep -rn "Gemini로 문안\|Gemini가 문안" tests`
For every hit, change `Gemini로 문안을 만들었어요.` to a regex `/AI로 문안을 만들었어요/` and `Gemini가 문안을` to `AI가 문안을`. Add to `tests/unit/CopyEditorGeneration.test.tsx` a test that renders the editor with a fetch mock returning `_meta:{provider:"groq"}` and expects `await screen.findByText("AI로 문안을 만들었어요 (Groq)")`. Model the fetch mock on the existing tests in that file (search `finish(` to see how the mocked response is resolved).

Run: `npx vitest run tests/unit/CopyEditorGeneration.test.tsx`
Expected: FAIL on the new text.

- [ ] **Step 2: Update the component**

Line 10: change the status union to `"loading"|"ai"|"fallback"|"saved"` and add `const [provider,setProvider]=useState("");`. Where the code reads the generated copy (lines 29 and 38), capture the provider: at line 29 the parsed response object used for `formatCopy` is available — call `setProvider(String((data as {_meta?:{provider?:string}})._meta?.provider??""))` right before `setStatus("ai")`, and do the same in the `.then(copy=>…)` handler on line 38 using `copy._meta?.provider`. Replace both `setStatus("gemini")` with `setStatus("ai")`.

Line 46: replace `<GenerationProgress label="Gemini가 문안을"/>` with `<GenerationProgress label="AI가 문안을"/>` and the status text with:

```tsx
{status==="saved"?"저장된 문안을 불러왔어요.":status==="ai"?`AI로 문안을 만들었어요${provider?` (${PROVIDER_LABELS[provider]??provider})`:""}`:"문안 생성이 완료되지 않았어요."}
```

Add near the top of the file: `const PROVIDER_LABELS:Record<string,string>={gemini:"Gemini",groq:"Groq",cloudflare:"Cloudflare"};`

- [ ] **Step 3: Run tests, lint, types and the draft-flow E2E**

Run: `npm test && npm run lint && npx tsc --noEmit && npx playwright test tests/e2e/draft-flow.spec.ts --reporter=line`
Expected: PASS. `draft-flow.spec.ts` mocks `/api/copy` without `_meta`, so the text is `AI로 문안을 만들었어요` with no suffix; update its expectation if it asserted the Gemini wording.

- [ ] **Step 4: Commit**

```bash
git add src/components/copy/CopyEditor.tsx tests/unit/CopyEditorGeneration.test.tsx tests/unit/DraftWizard.test.tsx tests/e2e/draft-flow.spec.ts
git commit -m "feat: show which AI wrote the caption"
```

---

### Task 9: Comparison script, environment files and docs

**Files:**
- Create: `scripts/register-ts.mjs`, `scripts/ts-alias-hooks.mjs`, `scripts/compare-text-providers.mjs`
- Modify: `package.json` (scripts), `.env.example`, `render.yaml`, `README.md`, `docs/APP_OPERATION_GUIDE.ko.md`

**Interfaces:**
- Consumes: the real clients and prompts through `@/…` imports.
- Produces: `npm run compare:text` → `output/text-provider-comparison-<YYYY-MM-DD>/report.md` and `raw.json`.

- [ ] **Step 1: Loader (verified on 2026-09-28 with Node 24.20)**

```js
// scripts/register-ts.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register(new URL("./ts-alias-hooks.mjs", import.meta.url), pathToFileURL("./"));
```

```js
// scripts/ts-alias-hooks.mjs
// Lets plain Node (24+, native type stripping) import the app's TypeScript modules:
// "@/x" -> src/x and extensionless relative imports -> .ts/.tsx/index.ts.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts")];

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith("@/")) target = path.join(root, "src", specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  if (target) for (const file of candidates(target)) if (existsSync(file) && statSync(file).isFile()) return { url: pathToFileURL(file).href, shortCircuit: true };
  return next(specifier, context);
}
```

- [ ] **Step 2: Comparison script**

```js
// scripts/compare-text-providers.mjs
// Usage: npm run compare:text   (Node 24+, keys read from .env.local; nothing secret is written)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

process.loadEnvFile(".env.local");
const { createGeminiClient } = await import("@/lib/ai/geminiClient");
const { createGroqClient } = await import("@/lib/ai/groqClient");
const { createCloudflareTextClient } = await import("@/lib/ai/cloudflareTextClient");
const { buildTopicPrompt, topicGenerationSchema } = await import("@/features/topics/prompt");
const { topicDirectionsForRound } = await import("@/features/topics/service");
const { buildCopyPrompt } = await import("@/features/copy/writing");
const { GeneratedCopyContentSchema } = await import("@/features/copy/schema");

const store = "묵동홍어마을";
const factories = [
  ["gemini", () => createGeminiClient(), process.env.GEMINI_TEXT_MODEL ?? "gemini-3.5-flash-lite"],
  ["groq", () => createGroqClient(), process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b"],
  ["cloudflare", () => createCloudflareTextClient(), process.env.CLOUDFLARE_TEXT_MODEL ?? "@cf/qwen/qwen3-30b-a3b-fp8"],
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (error) => String(error?.message ?? error).replace(/(key|token)=\S+/gi, "$1=***").slice(0, 200);

async function timed(run) {
  const started = Date.now();
  try { return { ok: true, value: await run(), ms: Date.now() - started }; }
  catch (error) { return { ok: false, error: safe(error), ms: Date.now() - started }; }
}

const results = [];
for (const [provider, create, model] of factories) {
  let client;
  try { client = create(); } catch (error) { results.push({ provider, model, skipped: safe(error) }); continue; }
  const entry = { provider, model, topics: [], copies: [] };
  for (const round of [0, 1]) {
    const input = { storeName: store, recommendationRound: round };
    const topic = await timed(() => client.generateJson(buildTopicPrompt(input), topicGenerationSchema(topicDirectionsForRound(round))));
    entry.topics.push({ round, ...topic });
    await sleep(2500);
    if (topic.ok) {
      const first = topic.value[0];
      const copy = await timed(() => client.generateJson(buildCopyPrompt({ topic: first.title, audience: first.audience, contentBrief: first.summary.slice(0, 600) }, "medium"), GeneratedCopyContentSchema));
      entry.copies.push({ topic: first.title, ...copy });
      await sleep(2500);
    }
  }
  results.push(entry);
}

const date = new Date().toISOString().slice(0, 10);
const directory = path.join("output", `text-provider-comparison-${date}`);
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "raw.json"), JSON.stringify(results, null, 2), "utf8");

const lines = [`# 문안 AI 제공자 비교 (${date})`, "", "같은 프롬프트를 제공자별로 보낸 결과입니다. 품질 판단은 사람이 합니다. 키가 없는 제공자는 건너뛰었습니다.", "", "| 제공자 | 모델 | 주제 성공 | 제목 평균 길이 | 문안 성공 | 본문 평균 길이 | 평균 시간 | 오류 |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
for (const entry of results) {
  if (entry.skipped) { lines.push(`| ${entry.provider} | ${entry.model} | 건너뜀 | - | - | - | - | ${entry.skipped} |`); continue; }
  const okTopics = entry.topics.filter((t) => t.ok), okCopies = entry.copies.filter((c) => c.ok);
  const titleLength = okTopics.flatMap((t) => t.value.map((x) => x.title.length));
  const bodyLength = okCopies.map((c) => c.value.information.length);
  const avg = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : "-");
  const ms = [...entry.topics, ...entry.copies].map((x) => x.ms);
  const errors = [...entry.topics, ...entry.copies].filter((x) => !x.ok).map((x) => x.error).join("; ") || "-";
  lines.push(`| ${entry.provider} | ${entry.model} | ${okTopics.length}/${entry.topics.length} | ${avg(titleLength)}자 | ${okCopies.length}/${entry.copies.length} | ${avg(bodyLength)}자 | ${avg(ms)}ms | ${errors} |`);
}
for (const entry of results.filter((e) => !e.skipped)) {
  lines.push("", `## ${entry.provider} (${entry.model})`);
  for (const t of entry.topics) lines.push("", `### 주제 ${t.round + 1}회차 ${t.ok ? "" : "(실패: " + t.error + ")"}`, ...(t.ok ? t.value.map((x) => `- [${x.audience}] ${x.title} (${x.title.length}자)\n  ${x.summary}`) : []));
  for (const c of entry.copies) lines.push("", `### 문안: ${c.topic} ${c.ok ? "" : "(실패: " + c.error + ")"}`, ...(c.ok ? [c.value.hook, "", c.value.information, "", c.value.store_connection, "", c.value.call_to_action, "", c.value.hashtags.join(" "), "", `확인 필요: ${c.value.facts_to_verify.join(" / ") || "없음"}`] : []));
}
await writeFile(path.join(directory, "report.md"), lines.join("\n") + "\n", "utf8");
console.log(`report: ${path.join(directory, "report.md")}`);
```

- [ ] **Step 3: npm script and environment files**

`package.json` scripts: add `"compare:text": "node --conditions=react-server --import ./scripts/register-ts.mjs scripts/compare-text-providers.mjs"`.

`.env.example`: change `GEMINI_TEXT_MODEL=gemini-3.6-flash` to `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite` and add below it:

```
GEMINI_FALLBACK_TEXT_MODEL=gemini-3.1-flash-lite
# 무료 문안 AI 예비 (선택): console.groq.com 에서 키 발급. 카드 불필요.
GROQ_API_KEY=
GROQ_TEXT_MODEL=openai/gpt-oss-120b
# Cloudflare 문안 모델 (선택): 이미지와 같은 계정·토큰을 사용하며 하루 10,000뉴런을 함께 씁니다.
CLOUDFLARE_TEXT_MODEL=@cf/qwen/qwen3-30b-a3b-fp8
```

`render.yaml` envVars: add after `GEMINI_API_KEY`:

```yaml
      - key: GROQ_API_KEY
        sync: false
      - key: CLOUDFLARE_ACCOUNT_ID
        sync: false
      - key: CLOUDFLARE_API_TOKEN
        sync: false
```

- [ ] **Step 4: Docs**

`README.md`: in `## 시작하기` change the sentence starting `.env.local에 Gemini 키와` to mention that Gemini uses the free `gemini-3.5-flash-lite` model by default, that `GROQ_API_KEY` adds a free backup writer, and that `CLOUDFLARE_TEXT_MODEL` lets the Cloudflare account also write captions. Add a section before `## 확인 명령`:

```markdown
## 문안 AI 선택과 비교

`설정 → 문안 AI`에서 `자동`(Gemini → Groq → Cloudflare 순서), `Gemini만`, `Groq만`, `Cloudflare만`을 고릅니다. 자동은 키가 있는 서비스만 시도하고, 한도 초과나 응답 오류가 나면 다음 서비스로 넘어간 뒤 모두 실패하면 준비된 문안을 씁니다. 문안 화면에는 어느 서비스가 썼는지 표시됩니다.

무료 한도(2026-09-28 기준, 변동 가능): Gemini flash-lite는 모델별 하루 약 500회, Groq는 모델별 하루 1,000회, Cloudflare는 이미지와 합쳐 하루 10,000뉴런입니다. 세 서비스 모두 카드 없이 시작할 수 있습니다.

같은 프롬프트로 세 서비스를 비교하려면 Node 24 이상에서 `npm run compare:text`를 실행하세요. 결과는 `output/text-provider-comparison-<날짜>/report.md`에 저장되며 키는 기록되지 않습니다.
```

`docs/APP_OPERATION_GUIDE.ko.md`: add at the top a dated note `> 2026-09-28 추가: 문안 AI를 Gemini·Groq·Cloudflare 중에서 고르고 자동으로 넘어가도록 바꿨습니다. 자세한 내용은 README의 "문안 AI 선택과 비교"를 보세요.` and change the sentence on line 16 to `주제와 문안은 설정한 문안 AI(기본: Gemini → Groq → Cloudflare 자동)를 시도하고, 모두 실패하면 앱에 들어 있는 기본 추천·문안을 사용합니다.` In the settings table add a row `| 문안 AI | 자동은 키가 있는 순서로 Gemini, Groq, Cloudflare를 시도합니다. 하나만 고르면 그 서비스만 씁니다. |`. On line 79 change `` 문안 화면의 `Gemini로 문안을 만들었어요` `` to `` 문안 화면의 `AI로 문안을 만들었어요` ``.

- [ ] **Step 5: Smoke-test the loader without spending quota**

Run: `node --conditions=react-server --import ./scripts/register-ts.mjs -e "const m=await import('@/features/topics/prompt');console.log(typeof m.buildTopicPrompt)"`
Expected: `function`.

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/register-ts.mjs scripts/ts-alias-hooks.mjs scripts/compare-text-providers.mjs package.json .env.example render.yaml README.md docs/APP_OPERATION_GUIDE.ko.md
git commit -m "feat: add text provider comparison script and document free providers"
```

---

### Task 10: Full verification and live comparison

**Files:**
- Modify: `docs/superpowers/plans/2026-09-28-free-text-providers.md` (tick boxes, add results)

- [ ] **Step 1: Run everything**

Run: `npm test && npm run lint && npx tsc --noEmit && npx playwright test --reporter=line`
Expected: all PASS (unit ≥ 262, E2E 30).

- [ ] **Step 2: Live comparison with whatever keys exist**

Run: `npm run compare:text`
Expected: `output/text-provider-comparison-<date>/report.md` exists; providers without keys are listed as 건너뜀. Confirm no key material appears: `grep -c "AIza\|gsk_\|Bearer" output/text-provider-comparison-*/report.md` → `0`.

- [ ] **Step 3: Record results and commit**

Tick every box in this plan, append a `## Verification (<date>)` section listing the test counts and which providers produced output, then:

```bash
git add docs/superpowers/plans/2026-09-28-free-text-providers.md
git commit -m "docs: record free text provider verification"
```

---

## Self-Review

- Spec coverage: setting enum + migration (Task 5), three clients with one contract (Tasks 2–4), ordered fallback and provider reporting (Tasks 6–7), Gemini flash-lite + fallback model (Task 2), comparison script and report (Task 9), key-less providers skipped and shown as `키 필요` (Tasks 5–6), Groq token budget via the 3,000-char retry slice (Task 7), env/render/docs (Task 9), verification (Task 10). Caption provider label (Task 8). Topic screen unchanged per spec.
- Placeholders: none; every code step carries the code.
- Type consistency: `TextAiClient.provider` is `TextProvider`; `createTextClient(...).provider` is `TextProvider | null`; routes coerce `null` to `"unknown"`/`"gemini"`/`null` as stated in Task 7's Interfaces.
