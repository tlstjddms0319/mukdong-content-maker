// scripts/eval-posts.mjs — 실제 AI로 게시물을 끝까지 만들어 보고 같은 기준으로 점수를 매긴다(사장님 요청 2026-10-12:
// "게시물 퀄리티를 높이려면 실제 결과물로 점검"). 테스트는 "규칙대로 지시했는지"만 보므로, 실제 결과가 좋은지는 이걸로 본다.
//
// 사용법: npm run eval:posts -- [--posts=6] [--images=cover|none] [--out=output/post-eval-이름]
//   - 주제 → 구성안(검수 포함) → 표지 이미지 → 올릴 글을 앱과 같은 라우트로 만든다(로그인 검사만 scripts/eval/guard-stub.ts 대역).
//   - 키는 .env.local에서 읽는다. 운영 저장소(Supabase)는 건드리지 않도록 끄고, 빈 임시 데이터 폴더를 쓴다
//     (그래서 사진 보관함의 매장 홍어회 참고 사진은 쓰지 않는다).
//   - 비용: 글은 Gemini 무료 한도 안(게시물당 5~7번 호출), 이미지는 --images=cover면 게시물당 표지 1장(Higgsfield 크레딧).
//   - 점수: 앱의 자동 검수(slideCopyIssues·올릴 글 문제), Gemini 표지 사진 점검(scoreImages), AI 평가자의 기준표 점수.
//   - 결과: <out>/report.md(요약·약점 모음), <out>/posts/NN.md(게시물 전체 글), <out>/covers/NN.jpg, <out>/raw.json.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")).map(([key, value]) => [key, value ?? "true"]));
const POSTS = Math.max(1, Math.min(12, Number(args.posts ?? 6)));
const IMAGES = args.images === "none" ? "none" : "cover";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
const OUT = path.resolve(args.out ?? `output/post-eval-${stamp}`);

try { process.loadEnvFile(".env.local"); } catch { console.warn(".env.local을 찾지 못했어요. 환경변수만 씁니다."); }
// 운영 저장소를 건드리지 않는다: 주제 추천 라우트는 오래된 초안을 지우고, 모든 AI 호출은 사용 기록을 남긴다.
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "post-eval-"));
if (!process.env.GEMINI_API_KEY) { console.error("GEMINI_API_KEY가 필요해요(글·평가·표지 점검)."); process.exit(1); }

const { POST: topicsRoute } = await import("@/app/api/topics/route");
const { POST: planRoute } = await import("@/app/api/images/plan/route");
const { POST: copyRoute } = await import("@/app/api/copy/route");
const { POST: imageRoute } = await import("@/app/api/images/generate/route");
const { resetTopicPace } = await import("@/features/topics/refreshPace");
const { slideCopyIssues } = await import("@/features/images/planReview");
const { scoreImages, expectedFoodFrom } = await import("@/features/images/coverCheck");
const { createTextClient } = await import("@/lib/ai/textClient");
const { HOOK_RULE, COMPARISON_RULE, CLOSING_INVITE_TAIL, comparedPair } = await import("@/features/copy/explain");
const { z } = await import("zod");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const call = async (route, body) => {
  const response = await route(new Request("http://localhost/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${data.message ?? data.error ?? ""}`.trim());
  return data;
};
const short = (error) => String(error?.message ?? error).replace(/(key|token)=\S+/gi, "$1=***").slice(0, 200);
const bytesOf = (dataUrl) => Buffer.from(String(dataUrl).split(",")[1] ?? "", "base64");

// ── AI 평가자 기준표 ────────────────────────────────────────────────────────────
// 사장님이 지적한 문제(뻔한 질문, "다르다"만 말하는 비교, 막연한 이유, 약한 후킹)를 그대로 점수로 본다. 1~5, 높을수록 좋다.
const JudgeSchema = z.object({
  hook: z.number().int().min(1).max(5),          // 첫 장이 손가락을 멈추게 하는가(구체적 대상·의외성·답의 약속)
  why_depth: z.number().int().min(1).max(5),     // 이유가 원리·근거(무엇이 무엇을 어떻게 바꾸는지)인가, 결과만 말하는가
  flow: z.number().int().min(1).max(5),          // 표지 질문 → 이유 → 결론이 한 이야기로 이어지는가
  fact_safety: z.number().int().min(1).max(5),   // 지어낸 수치·가게 사실·확실하지 않은 단정이 없는가(5=안전)
  caption: z.number().int().min(1).max(5),       // 올릴 글 첫 문장과 본문이 읽고 싶게, 카드와 같은 이야기인가
  obvious_question: z.boolean(),                 // 답이 뻔하거나 독자가 이미 아는 질문인가
  comparison_vague: z.boolean().nullable(),      // 비교 주제라면: "다르다"만 하고 양쪽을 안 쓰거나 공통점을 차이로 썼는가(비교가 아니면 null)
  weakest: z.string().max(80),                   // 가장 약한 점 한 줄(한국어)
  fix: z.string().max(120),                      // 가장 효과 큰 고칠 점 한 줄(한국어)
});
const judgePrompt = (post) => `당신은 음식점 Instagram 카드뉴스 편집장입니다. 아래 게시물 하나를 냉정하게 평가해 JSON으로만 답하세요.
평가 기준(1~5, 5가 가장 좋음):
- hook: 첫 장(표지 제목·부제)이 스크롤을 멈추게 하는가. 기준: ${HOOK_RULE}
- why_depth: 본문 이유가 원리·근거(무엇이 무엇을 어떻게 바꾸는지)를 말하는가. "조화롭게 잡아줘요", "깊게 해요"처럼 결과만 말하면 낮게.
- flow: 표지 질문 하나에 본문 제목들이 차례로 답하고 마지막 장이 한 줄 결론인가.
- fact_safety: 지어낸 수치·연구, 가게만의 사실(원산지·숙성 기간·가격), 확실하지 않은 단정이 없는가(5=안전).
- caption: 올릴 글 첫 문장이 표지와 다른 방식으로 궁금하게 만들고, 본문이 카드와 같은 이야기를 더 자세히 하는가.
- obvious_question: 답이 뻔하거나 독자가 이미 아는 질문이면 true(예: "홍어찜은 왜 따뜻하게 먹을까?").
- comparison_vague: 두 대상을 견주는 주제일 때만 true/false(${COMPARISON_RULE.slice(0, 220)}…). 비교 주제가 아니면 null.
- weakest / fix: 가장 약한 점과, 가장 효과가 큰 고칠 점을 한국어 한 줄씩.

게시물(참고 데이터):
${JSON.stringify(post, null, 1)}`;

// ── 만들기 ─────────────────────────────────────────────────────────────────────
await mkdir(path.join(OUT, "posts"), { recursive: true });
await mkdir(path.join(OUT, "covers"), { recursive: true });
console.info(`결과물 점검: 게시물 ${POSTS}개, 이미지 ${IMAGES === "cover" ? "표지 1장씩" : "만들지 않음"} → ${OUT}`);

const topics = [];
for (let round = 0; topics.length < POSTS && round < 6; round++) {
  resetTopicPace();
  try {
    const data = await call(topicsRoute, { storeProfile: { name: "묵동홍어마을" }, recommendationRound: round, recentTitles: topics.map((topic) => topic.title).slice(0, 20) });
    for (const topic of data.topics ?? []) if (!topics.some((known) => known.title === topic.title)) topics.push({ ...topic, topicSource: data.source ?? "unknown" });
  } catch (error) { console.warn(`주제 ${round + 1}회차 실패: ${short(error)}`); }
  await sleep(1500);
}
if (!topics.length) { console.error("주제를 하나도 받지 못했어요."); process.exit(1); }

const judge = createTextClient("automatic");
const posts = [];
for (const [index, topic] of topics.slice(0, POSTS).entries()) {
  const n = String(index + 1).padStart(2, "0");
  const track = index % 2 === 0 ? "photo" : "text";
  const post = { n, title: topic.title, track, topicSource: topic.topicSource, summary: topic.summary, errors: [] };
  console.info(`[${n}] ${topic.title} (${track === "photo" ? "사진 중심" : "글 중심"})`);
  try {
    const planned = await call(planRoute, { topic: topic.title, contentBrief: topic.summary, imageBrief: topic.imageBrief, track });
    post.plan = planned.plan;
    post.planProvider = planned.provider;
    post.review = planned.review;
    post.polish = planned.polish ?? null;
    // 앱은 검수 뒤에 결론 장 맺음말("~을 묵동홍어마을에서 즐겨 보세요")을 붙인다(applyTrack). 그 줄의 길이 지적은 빼고 본다.
    post.copyIssues = slideCopyIssues(planned.plan, track).filter((issue) => !issue.message.includes(CLOSING_INVITE_TAIL)).map((issue) => `${issue.slide}장: ${issue.message}`);
    post.comparison = Boolean(comparedPair(planned.plan.slides[0]?.headline ?? "") ?? comparedPair(topic.title));
  } catch (error) { post.errors.push(`구성안: ${short(error)}`); }

  if (post.plan && IMAGES === "cover") {
    const slide = post.plan.slides[0];
    try {
      const image = await call(imageRoute, { topic: topic.title, imageBrief: topic.imageBrief, slideTotal: post.plan.slides.length + 1, storeCard: true, deckEdited: true, imageStyle: "photo", slideLayout: "card", slide, styleAnchor: post.plan.styleAnchor, design: post.plan.design, slideIndex: 1, count: 1 });
      post.imageProvider = image.provider;
      await writeFile(path.join(OUT, "covers", `${n}.jpg`), bytesOf(image.images[0]));
      // 표지 점검은 글자를 얹기 전 원본으로 본다(카드 글자를 "이미지 속 글자"로 잡지 않게).
      const base = image.baseImages?.[0]?.[0] ?? image.images[0];
      const [check] = (await scoreImages([bytesOf(base)], { expectedFood: expectedFoodFrom(topic.title, slide.headline) })) ?? [null];
      post.coverCheck = check ? { score: check.score, looksLike: check.looksLikeSkate, warnings: check.warnings, note: check.note, food: check.food } : null;
    } catch (error) { post.errors.push(`표지 이미지: ${short(error)}`); }
  }

  if (post.plan) {
    try {
      const copy = await call(copyRoute, { topic: topic.title, audience: topic.audience, imageBrief: topic.imageBrief, contentBrief: topic.summary, hasAiImages: IMAGES === "cover", slideOutline: post.plan.slides.map((slide) => slide.headline).slice(0, 10), slideNotes: post.plan.slides.map((slide) => slide.notes ?? "").slice(0, 10) });
      post.caption = { hook: copy.hook, information: copy.information, store_connection: copy.store_connection, call_to_action: copy.call_to_action, hook_options: copy.hook_options, warnings: copy.quality_warnings ?? [], facts_to_verify: copy.facts_to_verify ?? [] };
    } catch (error) { post.errors.push(`올릴 글: ${short(error)}`); }
  }

  if (post.plan) {
    try {
      const cards = post.plan.slides.map((slide, i) => ({ 장: i + 1, 제목: slide.headline, 부제: slide.subline || undefined, 짧은글: slide.points }));
      post.judge = await judge.generateJson(judgePrompt({ 주제: topic.title, 주제설명: topic.summary, 카드: cards, 올릴글: post.caption ? { 첫문장: post.caption.hook, 본문: post.caption.information } : null }), JudgeSchema);
    } catch (error) { post.errors.push(`평가: ${short(error)}`); }
  }
  posts.push(post);
  await writeFile(path.join(OUT, "posts", `${n}.md`), postMarkdown(post));
  await sleep(1500);
}

// ── 보고서 ─────────────────────────────────────────────────────────────────────
function postMarkdown(post) {
  const lines = [`# ${post.n}. ${post.title}`, "", `- 갈래: ${post.track === "photo" ? "사진 중심" : "글 중심"} · 주제 출처: ${post.topicSource} · 구성안: ${post.planProvider ?? "-"}${post.review ? ` (검수 ${post.review.before}→${post.review.after}건)` : ""}${post.polish ? ` · 다듬기: 표지 ${post.polish.coverChanged ? `다시 씀(${post.polish.hookType})` : "그대로"}, 줄인 제목 ${post.polish.shortened}개` : ""} · 표지 이미지: ${post.imageProvider ?? "-"}`, `- 주제 설명: ${post.summary}`, ""];
  if (post.judge) lines.push(`## 평가`, `후킹 ${post.judge.hook} · 이유 깊이 ${post.judge.why_depth} · 흐름 ${post.judge.flow} · 사실 안전 ${post.judge.fact_safety} · 올릴 글 ${post.judge.caption}${post.judge.obvious_question ? " · ⚠ 뻔한 질문" : ""}${post.judge.comparison_vague ? " · ⚠ 비교가 흐림" : ""}`, `- 가장 약한 점: ${post.judge.weakest}`, `- 고칠 점: ${post.judge.fix}`, "");
  if (post.coverCheck) lines.push(`## 표지 사진 점검`, `점수 ${post.coverCheck.score}/10 · 기대 음식처럼 보임: ${post.coverCheck.looksLike ? "예" : "아니요"} · 보인 음식: ${post.coverCheck.food || "-"} · ${post.coverCheck.note}${post.coverCheck.warnings.length ? ` · 경고: ${post.coverCheck.warnings.join(", ")}` : ""}`, `![표지](../covers/${post.n}.jpg)`, "");
  if (post.plan) {
    lines.push("## 카드");
    for (const [i, slide] of post.plan.slides.entries()) lines.push(`${i + 1}. **${slide.headline}**${slide.subline ? ` — ${slide.subline}` : ""}${slide.points?.length ? `\n   - ${slide.points.join("\n   - ")}` : ""}`);
    lines.push("");
  }
  if (post.copyIssues?.length) lines.push("## 앱 자동 검수가 남긴 문제", ...post.copyIssues.map((issue) => `- ${issue}`), "");
  if (post.caption) lines.push("## 올릴 글", `**${post.caption.hook}**`, "", post.caption.information, "", post.caption.store_connection, post.caption.call_to_action, "", `첫 문장 후보: ${(post.caption.hook_options ?? []).join(" / ")}`, ...(post.caption.warnings.length ? [`다듬을 곳: ${post.caption.warnings.join(" / ")}`] : []), ...(post.caption.facts_to_verify.length ? [`확인할 사실: ${post.caption.facts_to_verify.join(" / ")}`] : []), "");
  if (post.errors.length) lines.push("## 오류", ...post.errors.map((error) => `- ${error}`), "");
  return lines.join("\n");
}

const judged = posts.filter((post) => post.judge);
const avg = (key) => judged.length ? (judged.reduce((sum, post) => sum + post.judge[key], 0) / judged.length).toFixed(1) : "-";
const covers = posts.filter((post) => post.coverCheck);
const report = [
  `# 게시물 결과물 점검 (${new Date().toLocaleString("ko-KR")})`, "",
  `게시물 ${posts.length}개 · 평가 ${judged.length}개 · 표지 점검 ${covers.length}개`, "",
  `구성안을 쓴 AI: ${[...new Set(posts.map((post) => post.planProvider ?? "-"))].join(", ")} · 표지 이미지: ${[...new Set(posts.map((post) => post.imageProvider ?? "-"))].join(", ")}. 운영 앱과 다른 AI(키가 없거나 무효라 다음 순서로 넘어감)로 만들었다면 점수를 운영 품질로 보지 마세요.`, "",
  "## 평균 점수 (1~5)",
  `| 후킹 | 이유 깊이 | 흐름 | 사실 안전 | 올릴 글 | 뻔한 질문 | 흐린 비교 | 표지 사진(10점) | 홍어처럼 보임 |`,
  `|---|---|---|---|---|---|---|---|---|`,
  `| ${avg("hook")} | ${avg("why_depth")} | ${avg("flow")} | ${avg("fact_safety")} | ${avg("caption")} | ${judged.filter((post) => post.judge.obvious_question).length}/${judged.length} | ${judged.filter((post) => post.judge.comparison_vague).length}/${judged.filter((post) => post.judge.comparison_vague !== null).length} | ${covers.length ? (covers.reduce((sum, post) => sum + post.coverCheck.score, 0) / covers.length).toFixed(1) : "-"} | ${covers.filter((post) => post.coverCheck.looksLike).length}/${covers.length} |`, "",
  "## 게시물별",
  `| # | 주제 | 갈래 | 후킹 | 이유 | 흐름 | 사실 | 글 | 표지 | 자동 검수 남은 문제 | 가장 약한 점 |`,
  `|---|---|---|---|---|---|---|---|---|---|---|`,
  ...posts.map((post) => `| [${post.n}](posts/${post.n}.md) | ${post.title} | ${post.track === "photo" ? "사진" : "글"} | ${post.judge?.hook ?? "-"} | ${post.judge?.why_depth ?? "-"} | ${post.judge?.flow ?? "-"} | ${post.judge?.fact_safety ?? "-"} | ${post.judge?.caption ?? "-"} | ${post.coverCheck?.score ?? "-"} | ${post.copyIssues?.length ?? "-"} | ${(post.judge?.weakest ?? post.errors[0] ?? "").replace(/\|/g, "/")} |`), "",
  "## 고칠 점 모음 (평가자)", ...judged.map((post) => `- ${post.n}. ${post.judge.fix}`), "",
  "## 자동 검수가 남긴 문제 (자주 나온 순)",
  ...Object.entries(posts.flatMap((post) => post.copyIssues ?? []).map((issue) => issue.replace(/^\d+장: /, "").replace(/'[^']*'/g, "'…'")).reduce((counts, issue) => ({ ...counts, [issue]: (counts[issue] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([issue, count]) => `- ${count}회: ${issue}`), "",
  ...(posts.some((post) => post.errors.length) ? ["## 오류", ...posts.flatMap((post) => post.errors.map((error) => `- ${post.n}. ${error}`)), ""] : []),
].join("\n");
await writeFile(path.join(OUT, "report.md"), report);
await writeFile(path.join(OUT, "raw.json"), JSON.stringify(posts, null, 2));
console.info(`\n끝났어요: ${path.join(OUT, "report.md")}`);
