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
const { CarouselPlanSchema, buildCarouselPlanPrompt } = await import("@/features/images/carousel");

const store = "묵동홍어마을";
const factories = [
  ["gemini", () => createGeminiClient(), process.env.GEMINI_TEXT_MODEL ?? "gemini-3.5-flash-lite"],
  ["groq", () => createGroqClient(), process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b"],
  ["cloudflare", () => createCloudflareTextClient(), process.env.CLOUDFLARE_TEXT_MODEL ?? "@cf/qwen/qwen3-30b-a3b-fp8"],
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (error) => String(error?.message ?? error).replace(/(key|token)=\S+/gi, "$1=***").replace(/\|/g, "\\|").slice(0, 200);

async function timed(run) {
  const started = Date.now();
  try { return { ok: true, value: await run(), ms: Date.now() - started }; }
  catch (error) { return { ok: false, error: safe(error), ms: Date.now() - started }; }
}

const results = [];
for (const [provider, create, model] of factories) {
  let client;
  try { client = create(); } catch (error) { results.push({ provider, model, skipped: safe(error) }); continue; }
  const entry = { provider, model, topics: [], copies: [], plans: [] };
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
      // One carousel plan per provider covers the third schema the app sends (roles, style anchor, distinct scenes).
      if (entry.plans.length === 0) {
        const imageBrief = String(first.imageBrief ?? "").trim().slice(0, 600) || undefined;
        const plan = await timed(() => client.generateJson(buildCarouselPlanPrompt({ topic: first.title, slideCount: 5, imageBrief }), CarouselPlanSchema));
        entry.plans.push({ topic: first.title, ...plan });
        await sleep(2500);
      }
    }
  }
  results.push(entry);
}

const date = new Date().toISOString().slice(0, 10);
const directory = path.join("output", `text-provider-comparison-${date}`);
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "raw.json"), JSON.stringify(results, null, 2), "utf8");

const lines = [`# 문안 AI 제공자 비교 (${date})`, "", "같은 프롬프트를 제공자별로 보낸 결과입니다. 품질 판단은 사람이 합니다. 키가 없는 제공자는 건너뛰었습니다.", "", "| 제공자 | 모델 | 주제 성공 | 제목 평균 길이 | 문안 성공 | 본문 평균 길이 | 구성 성공 | 평균 시간 | 오류 |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
for (const entry of results) {
  if (entry.skipped) { lines.push(`| ${entry.provider} | ${entry.model} | 건너뜀 | - | - | - | - | - | ${entry.skipped} |`); continue; }
  const okTopics = entry.topics.filter((t) => t.ok), okCopies = entry.copies.filter((c) => c.ok), okPlans = entry.plans.filter((p) => p.ok);
  const titleLength = okTopics.flatMap((t) => t.value.map((x) => x.title.length));
  const bodyLength = okCopies.map((c) => c.value.information.length);
  const avg = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : "-");
  const all = [...entry.topics, ...entry.copies, ...entry.plans];
  const errors = all.filter((x) => !x.ok).map((x) => x.error).join("; ") || "-";
  lines.push(`| ${entry.provider} | ${entry.model} | ${okTopics.length}/${entry.topics.length} | ${avg(titleLength)}자 | ${okCopies.length}/${entry.copies.length} | ${avg(bodyLength)}자 | ${okPlans.length}/${entry.plans.length} | ${avg(all.map((x) => x.ms))}ms | ${errors} |`);
}
for (const entry of results.filter((e) => !e.skipped)) {
  lines.push("", `## ${entry.provider} (${entry.model})`);
  for (const t of entry.topics) lines.push("", `### 주제 ${t.round + 1}회차 ${t.ok ? "" : "(실패: " + t.error + ")"}`, ...(t.ok ? t.value.map((x) => `- [${x.audience}] ${x.title} (${x.title.length}자)\n  ${x.summary}`) : []));
  for (const c of entry.copies) lines.push("", `### 문안: ${c.topic} ${c.ok ? "" : "(실패: " + c.error + ")"}`, ...(c.ok ? [c.value.hook, "", c.value.information, "", c.value.store_connection, "", c.value.call_to_action, "", c.value.hashtags.join(" "), "", `확인 필요: ${c.value.facts_to_verify.join(" / ") || "없음"}`] : []));
  for (const p of entry.plans) lines.push("", `### 캐러셀 구성: ${p.topic} ${p.ok ? "" : "(실패: " + p.error + ")"}`, ...(p.ok ? [`스타일 기준: ${p.value.styleAnchor}`, ...p.value.slides.map((s, i) => `${i + 1}. [${s.role}] ${s.headline} — ${s.visualPrompt}`)] : []));
}
await writeFile(path.join(directory, "report.md"), lines.join("\n") + "\n", "utf8");
console.log(`report: ${path.join(directory, "report.md")}`);
