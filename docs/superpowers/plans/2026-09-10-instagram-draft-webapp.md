# 묵동 콘텐츠 메이커 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비전문 사용자가 주제 선택, 이미지 제작, 문안 확인, 다운로드의 네 단계로 인스타그램 게시물 초안을 완성하는 로컬 웹앱을 만든다.

**Architecture:** Next.js App Router가 화면과 서버 API를 함께 제공한다. 브라우저는 외부 AI를 직접 호출하지 않고 서버 경로만 사용하며, 초안·설정·미디어는 교체 가능한 로컬 파일 저장소에 기록한다. 이미지 제작을 핵심 흐름으로 두고 AI 결과는 구조화된 데이터와 사람의 최종 승인으로 통제한다.

**Tech Stack:** Next.js App Router, React, TypeScript, native CSS, OpenAI JavaScript SDK, Zod, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-09-10-instagram-draft-webapp-design.md`

## Global Constraints

- 첫 버전은 한 명이 사용하는 로컬 웹앱이다.
- 첫 버전에는 Instagram 예약 준비, 자동 게시, 실시간 트렌드 수집을 넣지 않는다.
- API 키는 `OPENAI_API_KEY` 서버 환경변수로만 읽고 클라이언트 응답·로그·저장 파일에 기록하지 않는다.
- 실제 사진을 기본으로 권장하고 AI 이미지의 출처를 항상 기록한다.
- 가격·영업시간·휴무·원산지·삭힘·메뉴 구성은 AI가 추측하지 않는다.
- 기본 이미지 비율은 4:5, 후보 수는 3장, 문안은 짧고 쉬운 한국어다.
- 원본 사진은 수정하지 않고 파생 파일을 별도로 만든다.
- 기본 본문은 16px 이상, 핵심 조작 영역은 44px 이상, 모바일 최소 폭은 320px다.
- 배경 `#faf9f5`, 글자 `#141413`, 강조 `#1f5a43`을 기본 디자인 토큰으로 사용한다.
- 각 AI 단계는 독립적으로 재시도하며 이미 성공한 주제·이미지·문안을 지우지 않는다.

---

## File Map

```text
src/app/                         Next.js 화면과 서버 경로
src/components/wizard/           네 단계 공통 화면과 진행 상태
src/features/topics/             주제 추천 규칙과 AI 요청
src/features/images/             업로드·분석·생성·후보 선택
src/features/copy/               구조화된 문안 생성과 부분 재생성
src/features/guard/              사실 확인과 금지 표현 검사
src/features/drafts/             초안 상태와 로컬 저장
src/features/settings/           권장 기본값과 사용자 설정
src/lib/ai/                      OpenAI 서버 연결부
src/lib/files/                   안전한 파일 저장과 내보내기
data/                            로컬 설정·초안·미디어, Git 제외
tests/unit/                      서비스 단위 테스트
tests/e2e/                       사용자 흐름 브라우저 테스트
```

---

### Task 1: 프로젝트 기반과 디자인 셸

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/wizard/WizardShell.tsx`
- Create: `tests/unit/WizardShell.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `WizardStep = "topic" | "image" | "copy" | "review"`
- Produces: `WizardShell({ step, children }: { step: WizardStep; children: ReactNode })`

- [ ] **Step 1: Initialize Git only if the workspace still has no repository**

Run:

```powershell
if (-not (Test-Path .git)) { git init }
```

Expected: `git status --short` runs without the dubious ownership error.

- [ ] **Step 2: Create the minimal package manifest and install dependencies**

Use scripts `dev`, `build`, `lint`, `test`, and `test:e2e`. Runtime dependencies are `next`, `react`, `react-dom`, `openai`, and `zod`. Development dependencies are TypeScript, React/Node types, ESLint Next config, Vitest, jsdom, Testing Library, and Playwright.

Run:

```powershell
npm install next react react-dom openai zod
npm install -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @playwright/test
```

Expected: `npm install` exits 0 and `package-lock.json` exists.

- [ ] **Step 3: Write the failing shell test**

```tsx
import { render, screen } from "@testing-library/react";
import { WizardShell } from "@/components/wizard/WizardShell";

it("shows four simple steps and the active step", () => {
  render(<WizardShell step="image"><p>이미지 선택</p></WizardShell>);
  expect(screen.getByText("이미지 선택")).toBeInTheDocument();
  expect(screen.getByLabelText("제작 단계")).toHaveTextContent("2 이미지");
});
```

- [ ] **Step 4: Run the test and confirm the missing component failure**

Run: `npm test -- WizardShell`

Expected: FAIL because `WizardShell` does not exist.

- [ ] **Step 5: Implement the accessible app shell and shared tokens**

`WizardShell` renders one-line desktop navigation, mobile horizontal navigation, the four-step label, and a `<main>` slot. `globals.css` defines the three design colors, 10px control radius, 16px panel radius, 44px minimum controls, visible focus rings, and reduced-motion behavior.

- [ ] **Step 6: Verify shell behavior**

Run: `npm test -- WizardShell`

Expected: PASS.

Run: `npm run build`

Expected: production build exits 0.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts src/app src/components/wizard tests/unit/WizardShell.test.tsx .gitignore
git commit -m "feat: add accessible draft wizard shell"
```

---

### Task 2: 설정·가게 정보·초안 로컬 저장

**Files:**
- Create: `src/features/settings/schema.ts`
- Create: `src/features/settings/defaults.ts`
- Create: `src/features/drafts/schema.ts`
- Create: `src/features/drafts/repository.ts`
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/api/drafts/route.ts`
- Create: `tests/unit/repository.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `AppSettingsSchema`, `StoreProfileSchema`, `DraftSchema`
- Produces: `readSettings(): Promise<AppSettings>`
- Produces: `writeSettings(value: AppSettings): Promise<void>`
- Produces: `saveDraft(value: Draft): Promise<Draft>`
- Produces: `readDraft(id: string): Promise<Draft | null>`

- [ ] **Step 1: Write failing persistence tests**

Test with a temporary directory supplied to the repository factory:

```ts
it("round-trips a draft without storing secrets", async () => {
  const repo = createDraftRepository(tempDir);
  const saved = await repo.saveDraft(validDraft);
  expect(await repo.readDraft(saved.id)).toEqual(saved);
  expect(JSON.stringify(saved)).not.toContain("OPENAI_API_KEY");
});
```

Also assert that malformed JSON returns a typed `StorageError` and does not overwrite the last valid file.

- [ ] **Step 2: Run tests to verify the repository is missing**

Run: `npm test -- repository`

Expected: FAIL because schemas and repository do not exist.

- [ ] **Step 3: Define exact defaults and schemas**

```ts
export const DEFAULT_SETTINGS = {
  imageMode: "photo-first",
  imageCandidateCount: 3,
  imageAspectRatio: "4:5",
  copyLength: "short",
  aiProvider: "openai",
  aiModelMode: "automatic",
  preserveOriginals: true,
  blockUnverifiedClaims: true,
  recheckOnStoreChange: true,
} as const;
```

`Draft` stores `id`, `status`, `topic`, `audience`, `media_candidates`, `selected_media_id`, `copy`, `facts_to_verify`, `store_profile_version`, `created_at`, and `updated_at`.

- [ ] **Step 4: Implement atomic JSON persistence**

Write to `<target>.tmp`, close it, then rename it to the final path. Restrict IDs to generated UUIDs and never join user-provided filenames into data paths.

- [ ] **Step 5: Add settings and drafts server routes**

`GET /api/settings`, `PUT /api/settings`, `POST /api/drafts`, and `GET /api/drafts?id=<uuid>` validate every response and request with Zod. Validation failures return status 400; unavailable or corrupt local storage returns status 500 with a safe Korean message.

- [ ] **Step 6: Run persistence tests**

Run: `npm test -- repository`

Expected: PASS, including the atomic-write and malformed-file cases.

- [ ] **Step 7: Commit**

```powershell
git add src/features/settings src/features/drafts src/app/api/settings src/app/api/drafts tests/unit/repository.test.ts .gitignore
git commit -m "feat: persist settings and drafts locally"
```

---

### Task 3: 주제 추천과 사실 보호

**Files:**
- Create: `src/lib/ai/openaiClient.ts`
- Create: `src/features/topics/schema.ts`
- Create: `src/features/topics/service.ts`
- Create: `src/features/guard/rules.ts`
- Create: `src/features/guard/service.ts`
- Create: `src/app/api/topics/route.ts`
- Create: `tests/unit/topicService.test.ts`
- Create: `tests/unit/guardService.test.ts`

**Interfaces:**
- Produces: `suggestTopics(input: TopicInput): Promise<TopicSuggestion[]>`
- Produces: `checkClaims(copy: GeneratedCopy, profile: StoreProfile): GuardResult`
- `TopicSuggestion = { id: string; title: string; summary: string; reason: string; audience: "A" | "B" | "C"; imageBrief: string }`

- [ ] **Step 1: Write failing deterministic fallback tests**

```ts
it("returns three useful topics when the AI is unavailable", async () => {
  const result = await suggestTopics(validInput, failingAiClient);
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({ audience: expect.stringMatching(/A|B|C/) });
  expect(result.every(x => x.reason.length > 0)).toBe(true);
});
```

Guard tests must flag `흑산도`, `냄새 없음`, `누구나 먹음`, `삭힘 선택 가능`, and facts that differ from the active store profile.

- [ ] **Step 2: Run tests and verify missing services**

Run: `npm test -- topicService guardService`

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement the server-only OpenAI client**

`getOpenAIClient()` throws `AiConfigurationError("OpenAI API 키가 연결되지 않았습니다.")` when `OPENAI_API_KEY` is absent. The module must include `import "server-only"` and never export the raw key or SDK instance to client components.

- [ ] **Step 4: Implement topic suggestions with a non-AI fallback**

The AI request uses the five content pillars and asks for structured output matching `TopicSuggestion[]`. If the request fails, return three curated topics from the approved marketing plan so the user can keep working.

- [ ] **Step 5: Implement factual guard rules**

Return `{ blocked: ClaimIssue[]; verify: ClaimIssue[]; passed: string[] }`. Block unsupported origin, health claims, invented services, and statements that the aroma disappears. Mark changing values such as time, price, and holiday status for verification.

- [ ] **Step 6: Add the topic route and verify safe errors**

`POST /api/topics` accepts only validated `StoreProfile` and optional user intent. It never returns prompts, stack traces, or environment data.

- [ ] **Step 7: Run tests and commit**

Run: `npm test -- topicService guardService`

Expected: PASS.

```powershell
git add src/lib/ai src/features/topics src/features/guard src/app/api/topics tests/unit/topicService.test.ts tests/unit/guardService.test.ts
git commit -m "feat: suggest grounded content topics"
```

---

### Task 4: 안전한 사진 업로드와 이미지 제작실

**Files:**
- Create: `src/lib/files/mediaStore.ts`
- Create: `src/features/images/schema.ts`
- Create: `src/features/images/service.ts`
- Create: `src/app/api/media/upload/route.ts`
- Create: `src/app/api/images/generate/route.ts`
- Create: `src/app/api/images/analyze/route.ts`
- Create: `src/components/images/ImageStudio.tsx`
- Create: `tests/unit/mediaStore.test.ts`
- Create: `tests/unit/imageService.test.ts`
- Create: `tests/unit/ImageStudio.test.tsx`

**Interfaces:**
- Produces: `saveOriginal(file: File): Promise<MediaAsset>`
- Produces: `generateCandidates(input: ImageBrief): Promise<MediaCandidate[]>`
- Produces: `analyzeCandidate(asset: MediaAsset): Promise<ImageAnalysis>`
- `ImageAnalysis = { subjectClarity: Check; backgroundComplexity: Check; textSpace: Check; cropSafety: Check; disclosureRequired: boolean }`

- [ ] **Step 1: Write failing upload boundary tests**

Test accepted JPEG/PNG/WebP, rejected executable content with a forged extension, rejected files above the configured size, generated UUID filenames, and separation of `originals/` from `derived/`.

- [ ] **Step 2: Run tests and verify the media store is missing**

Run: `npm test -- mediaStore imageService ImageStudio`

Expected: FAIL.

- [ ] **Step 3: Implement safe local media storage**

Validate MIME type and magic bytes, cap upload size, generate internal UUID names, and store metadata separately. Never expose the local absolute path; return an opaque media ID served through an authenticated local route.

- [ ] **Step 4: Implement image generation and analysis adapters**

`generateCandidates` requests exactly the configured count and records provider, model, prompt version, timestamp, purpose, and source type. Prompts require a single clear subject, 4:5 composition, no embedded Korean text, no invented storefront or customer, and no unsupported food details.

`analyzeCandidate` returns descriptive checks rather than a numeric beauty score. An AI failure leaves existing candidates intact and returns a retryable error for only the failed operation.

- [ ] **Step 5: Implement the image studio UI**

Render three modes: actual photo, AI generation, and combined use. Show candidate comparison, 76px thumbnail preview, analysis checks, source disclosure, exactness protection, regenerate, and explicit `이 이미지 사용` approval.

- [ ] **Step 6: Add visual accessibility behavior**

Every candidate is a native button with visible selected state and meaningful alt text. Selection never depends only on color. Loading placeholders reserve 4:5 space; error text is inline; keyboard users can select and continue.

- [ ] **Step 7: Run image tests and commit**

Run: `npm test -- mediaStore imageService ImageStudio`

Expected: PASS.

```powershell
git add src/lib/files src/features/images src/app/api/media src/app/api/images src/components/images tests/unit/mediaStore.test.ts tests/unit/imageService.test.ts tests/unit/ImageStudio.test.tsx
git commit -m "feat: add image-first draft studio"
```

---

### Task 5: 구조화된 문안 생성과 부분 재생성

**Files:**
- Create: `src/features/copy/schema.ts`
- Create: `src/features/copy/service.ts`
- Create: `src/app/api/copy/route.ts`
- Create: `src/components/copy/CopyEditor.tsx`
- Create: `tests/unit/copyService.test.ts`
- Create: `tests/unit/CopyEditor.test.tsx`

**Interfaces:**
- Produces: `generateCopy(input: CopyInput): Promise<GeneratedCopy>`
- Produces: `regenerateCopyPart(part: CopyPart, current: GeneratedCopy, input: CopyInput): Promise<GeneratedCopy>`
- `CopyPart = "hook" | "store_connection" | "call_to_action" | "hashtags"`

- [ ] **Step 1: Write failing schema and preservation tests**

```ts
it("regenerates hashtags without changing approved copy", async () => {
  const result = await regenerateCopyPart("hashtags", current, input, fakeAi);
  expect(result.hook).toBe(current.hook);
  expect(result.information).toBe(current.information);
  expect(result.hashtags).not.toEqual(current.hashtags);
});
```

Also test that the guard blocks unsupported claims before the response is marked ready.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- copyService CopyEditor`

Expected: FAIL.

- [ ] **Step 3: Implement structured copy generation**

Return the exact fields from the spec: `topic`, `audience`, `hook`, `information`, `store_connection`, `call_to_action`, `hashtags`, `facts_used`, `facts_to_verify`, and `image_disclosure`. Compose the editable text from these fields instead of parsing free-form model output.

- [ ] **Step 4: Implement partial regeneration**

Send only the requested part plus the approved context. Merge the returned field into the existing object after Zod validation and guard checks. Preserve every other field byte-for-byte.

- [ ] **Step 5: Implement the copy editor**

Show the completed text first. Add only four partial actions and the three tone buttons from the spec. Display verification items beside the editor and require correction or explicit confirmation before moving to review.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- copyService CopyEditor`

Expected: PASS.

```powershell
git add src/features/copy src/app/api/copy src/components/copy tests/unit/copyService.test.ts tests/unit/CopyEditor.test.tsx
git commit -m "feat: generate and refine grounded captions"
```

---

### Task 6: 최종 미리보기·다운로드·전체 흐름

**Files:**
- Create: `src/lib/files/exportBundle.ts`
- Create: `src/app/api/export/[draftId]/route.ts`
- Create: `src/components/review/PostPreview.tsx`
- Create: `src/components/review/ExportActions.tsx`
- Create: `src/components/wizard/DraftWizard.tsx`
- Modify: `src/app/page.tsx`
- Create: `tests/unit/exportBundle.test.ts`
- Create: `tests/e2e/draft-flow.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Produces: `buildExportBundle(draft: Draft): Promise<Uint8Array>`
- Produces: complete `DraftWizard` state flow

- [ ] **Step 1: Write the failing export test**

Assert the archive contains one selected image, `caption.txt`, and `metadata.json`; metadata includes media source and checks but excludes API keys, prompts containing secrets, and local absolute paths.

- [ ] **Step 2: Write the failing browser flow**

```ts
test("creates a draft without requiring advanced settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "이미지 선택" }).click();
  await page.getByRole("button", { name: "AI 이미지 생성" }).click();
  await page.getByRole("button", { name: "이 이미지 사용" }).click();
  await page.getByRole("button", { name: "문안 만들기" }).click();
  await page.getByRole("button", { name: "최종 화면 보기" }).click();
  await expect(page.getByText("게시하기 전에")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 묶음 받기" })).toBeEnabled();
});
```

Use mocked server adapters so the end-to-end test does not spend API credits.

- [ ] **Step 3: Run both tests and verify failure**

Run: `npm test -- exportBundle`

Expected: FAIL.

Run: `npx playwright test tests/e2e/draft-flow.spec.ts`

Expected: FAIL because the full wizard is incomplete.

- [ ] **Step 4: Implement preview and export**

Show the 4:5 post, a 76px feed thumbnail, caption excerpt, source disclosure, verification result, and original preservation state. Provide image download, clipboard copy, full archive download, and local draft save. Do not render scheduling or publish controls.

- [ ] **Step 5: Connect all four wizard stages**

Persist after every successful stage. Returning to an earlier step preserves later approved values until a changed dependency makes them stale; then mark only affected output as `확인 필요`.

- [ ] **Step 6: Run unit and end-to-end checks**

Run: `npm test`

Expected: all unit/component tests PASS.

Run: `npx playwright test`

Expected: desktop and 390px mobile flows PASS with no horizontal overflow.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/files/exportBundle.ts src/app/api/export src/components/review src/components/wizard/DraftWizard.tsx src/app/page.tsx tests/unit/exportBundle.test.ts tests/e2e/draft-flow.spec.ts playwright.config.ts
git commit -m "feat: complete draft preview and export flow"
```

---

### Task 7: 설정 화면·상태 완성·운영 문서

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/components/settings/SettingsForm.tsx`
- Create: `src/components/states/GenerationState.tsx`
- Create: `tests/unit/SettingsForm.test.tsx`
- Create: `tests/e2e/error-states.spec.ts`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Consumes: `readSettings`, `writeSettings`, `DEFAULT_SETTINGS`
- Produces: final settings UI and documented local startup flow

- [ ] **Step 1: Write failing settings tests**

Test that defaults render without interaction, save sends only validated settings, reset restores exact defaults, and API key values never appear in the DOM.

- [ ] **Step 2: Write failing error-state tests**

Mock missing API key, image generation failure, malformed upload, and local-save failure. Assert each screen explains the problem in Korean, preserves completed work, and exposes one relevant retry or settings action.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- SettingsForm`

Expected: FAIL.

Run: `npx playwright test tests/e2e/error-states.spec.ts`

Expected: FAIL.

- [ ] **Step 4: Implement settings sections**

Provide basic, store, AI connection, image generation, copy, trend connection, and data management sections. Show trend connection as a disabled future section with an explanation, not a working integration. Show only `연결됨` or `연결 필요` for the OpenAI key.

- [ ] **Step 5: Implement loading, empty, verification, and failure states**

Use reserved 4:5 skeleton space for image work, inline errors for fields, and contextual retry for AI operations. Do not use a global spinner that hides already completed content.

- [ ] **Step 6: Document safe startup**

`.env.example` contains only `OPENAI_API_KEY=` and `DATA_DIR=./data`. `README.md` explains installation, where to enter the key without printing it, development start, tests, production build, local data backup, and the explicit first-version exclusions.

- [ ] **Step 7: Run the full verification gate**

Run:

```powershell
npm run lint
npm test
npm run build
npx playwright test
```

Expected: all four commands exit 0; desktop and mobile flows pass; no test invokes a paid external API.

- [ ] **Step 8: Build and inspect the Graphify project graph**

Run from the project root after the implementation files exist:

```powershell
graphify .
```

Expected: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, and `graphify-out/graph.html` exist. Surface any graph health warning instead of hiding it.

- [ ] **Step 9: Commit**

```powershell
git add src/app/settings src/components/settings src/components/states tests/unit/SettingsForm.test.tsx tests/e2e/error-states.spec.ts .env.example README.md
git commit -m "feat: finish settings and resilient app states"
```

---

## Stop Condition

Stop after Task 7 when the four-stage local draft workflow, image candidate comparison, structured copy, export, settings, safety checks, responsive UI, tests, and documentation pass. Do not add authentication, cloud deployment, analytics collection, Instagram OAuth, scheduling, publishing, general keyword scraping, or multiple AI providers in this implementation plan.
