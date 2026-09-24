# Usable Local App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every visible app menu usable while preserving the existing draft-creation workflow and postponing new external integrations.

**Architecture:** Reuse `WizardShell`, `DraftWizard`, `selectedDraftMedia`, and the existing repositories. Add three protected server pages, a small static topic-card module, and minimal changes to the current client components. No new API, database, generator, provider, or dependency.

**Tech Stack:** Next.js App Router (installed version's `node_modules/next/dist/docs/01-app` conventions), React, TypeScript, Vitest/Testing Library, Playwright, existing CSS.

**Spec:** `docs/superpowers/specs/2026-09-24-local-app-shell-design.md`

## Global Constraints

- Keep existing topic, image, and copy AI calls and the four-step wizard working; do not activate Supabase, Meta, scheduling, trend collection, or another provider.
- New pages call `requireOwnerPage()` and expose no new public API.
- Do not overwrite saved drafts, captions, selected images, or inactive settings values.
- `/images` is a gallery and entry to the existing wizard, not an independent generator.
- `/library` cards are prepared local ideas, never labelled live trends; prefilled topics are plain text of at most 120 characters.
- Only `carouselSlideCount` and `imageAiProvider` are editable settings in this slice; reset touches only these two.
- Never present a static check as a completed validation; do not display provider secrets.
- Keep Korean copy simple and the current responsive/accessibility baseline (44px controls, focus indication, meaningful labels).

## Review Focus

1. A `?topic=` URL alongside `?draft=` must restore the draft, not create a new one — Task 2 tests precedence.
2. A new topic card opened while a previous draft ID is in localStorage must leave that saved draft intact — Task 2 tests a fresh ID and untouched old draft.
3. A missing or unusable image on one draft must not hide the rest of the gallery — Task 3 tests the gallery's image-less fallback.
4. Draft-list storage failure must not look like an empty list — Task 3 adds a retryable route error state and tests its message.
5. Resetting the two visible settings must not silently reset inactive stored settings — Task 4 tests the submitted object.

## File Map and Interfaces

- `src/components/wizard/WizardShell.tsx`: expand `section` union to `images | library | help`, mark the active menu, leave step navigation exclusive to `create`.
- `src/app/help/page.tsx`: authenticated static instructions; no data access.
- `src/features/topics/library.ts`: exported `LIBRARY_TOPICS` read-only local cards `{ title, intent, imageHint, factCheck }`.
- `src/app/library/page.tsx`: authenticated card UI; links to `/?topic=${encodeURIComponent(title)}`.
- `src/components/wizard/DraftWizard.tsx`: consume a validated topic query only for explicit new work; preserve existing `draft` query priority and saved-draft behavior.
- `src/app/images/page.tsx`: authenticated read-only gallery data load from `createDraftRepository().listDrafts()`.
- `src/components/images/ImageGallery.tsx`: presentational `ImageGallery({ drafts }: { drafts: Draft[] })`, using `selectedDraftMedia()`; no server-only imports.
- `src/app/images/error.tsx`, `src/app/drafts/error.tsx`: client-side route error fallback with `retry()` and no raw storage details.
- `src/components/settings/SettingsForm.tsx`, `src/app/settings/page.tsx`: display only effective controls, preserve inactive values, accurate connection/Meta wording.
- `src/components/copy/CopyEditor.tsx`, `src/components/wizard/DraftWizard.tsx`: remove inert tone buttons and replace unverified success badges with check prompts.
- `src/app/globals.css`: only the new gallery/library/help styles and responsive rules; reuse existing tokens and `state-card`/`button` patterns.
- `tests/unit/{WizardShell,DraftWizard,SettingsForm,CopyEditor}.test.tsx`, new `tests/unit/libraryTopics.test.ts`, new `tests/unit/imageGallery.test.tsx`, `tests/e2e/app-shell.spec.ts`: focused regressions; no paid AI call in tests.

The installed Next docs confirm that each route needs its own `page.tsx`, pages are server components by default, and `error.tsx` is a client component receiving `retry()`; read those guides again immediately before the relevant edit because this repository's Next version may change.

---

### Task 1: Complete navigation and help

**Files:**
- Modify: `src/components/wizard/WizardShell.tsx`
- Create: `src/app/help/page.tsx`
- Modify: `tests/unit/WizardShell.test.tsx`

**Interfaces:**
- Consumes: existing `requireOwnerPage(): Promise<void>` and `WizardShell` props.
- Produces: `section?: "create" | "drafts" | "images" | "library" | "settings" | "help"` for Tasks 2–3.

- [ ] **Step 1: Write failing navigation tests.** Extend `WizardShell.test.tsx` with this case:

```tsx
it("marks each auxiliary page current without wizard steps", () => {
  for (const [section, label] of [["images", "이미지 제작실"], ["library", "콘텐츠 자료"], ["help", "도움말"]] as const) {
    const { unmount } = render(<WizardShell step="topic" section={section}><h1>{label}</h1></WizardShell>);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByLabelText("제작 단계")).not.toBeInTheDocument();
    unmount();
  }
});
```

- [ ] **Step 2: Run the red test.** `npm test -- tests/unit/WizardShell.test.tsx`; expect the new assertion or TypeScript section type to fail.
- [ ] **Step 3: Implement navigation and help.** Keep existing `WizardShell` layout, add the three `section` values and active/`aria-current` handling to the appropriate links. Add `src/app/help/page.tsx` as an async server page calling `await requireOwnerPage()` before rendering `WizardShell section="help"`. Include four short steps, what an AI image is versus an uploaded photo, where drafts are reopened and downloaded, possible AI usage costs, photo fallback on AI failure, and that no scheduled/automatic posting or live trends are part of the basic workflow. Link to `/`, `/drafts`, `/images`, `/settings`; do not echo keys or technical errors. No new auth logic. Follow this page shape:

```tsx
import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";

export default async function HelpPage() {
  await requireOwnerPage();
  return <WizardShell step="topic" section="help">
    <p className="eyebrow">도움말</p><h1>처음 사용한다면</h1>
    <ol><li>주제를 고르세요.</li><li>사진을 올리거나 AI 이미지를 고르세요.</li><li>문안을 확인하고 고치세요.</li><li>저장하거나 내려받으세요.</li></ol>
    <p>AI 사용에는 계정 설정에 따라 비용이 들 수 있어요. 실패하면 직접 사진을 올릴 수 있어요.</p>
    <p>자동 게시와 실시간 인기 주제는 기본 제작 기능에 포함되지 않아요.</p>
    <Link href="/">새 초안 만들기</Link><Link href="/drafts">내 초안 보기</Link>
  </WizardShell>;
}
```
- [ ] **Step 4: Run the green test and route smoke.** `npm test -- tests/unit/WizardShell.test.tsx`; expect pass. `npm run build`; expect `/help` listed and no type error.
- [ ] **Step 5: Commit only this task's files.** `git add src/components/wizard/WizardShell.tsx src/app/help/page.tsx tests/unit/WizardShell.test.tsx` then `git commit -m "feat: complete app navigation and help"` (use checkout-specific `safe.directory` if needed).

### Task 2: Prepared content cards and safe topic prefill

**Files:**
- Create: `src/features/topics/library.ts`
- Create: `src/app/library/page.tsx`
- Modify: `src/components/wizard/DraftWizard.tsx`
- Create: `tests/unit/libraryTopics.test.ts`
- Modify: `tests/unit/DraftWizard.test.tsx`

**Interfaces:**
- Consumes: Task 1's `WizardShell section="library"`, `requireOwnerPage`, existing `changeTopic(title, audience, imageBrief?, preserveDraft?)`.
- Produces: `LIBRARY_TOPICS: readonly { title:string; intent:string; imageHint:string; factCheck:string }[]`; links send `/?topic=<encoded title>` only.

- [ ] **Step 1: Write failing focused tests.** In `libraryTopics.test.ts` verify at least five distinct non-empty titles, all `title.length <= 120`, and all four fields filled. In `DraftWizard.test.tsx`, add these cases using the existing `fetch` stubs:

```tsx
it("prefills a library topic without loading or mutating the previous draft", async () => {
  localStorage.setItem("mukdong-current-draft", "11111111-1111-4111-8111-111111111111");
  window.history.replaceState({}, "", "/?topic=" + encodeURIComponent("동네에서 홍어 한 상"));
  const request = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
  vi.stubGlobal("fetch", request);
  render(<DraftWizard />);
  expect(await screen.findByDisplayValue("동네에서 홍어 한 상")).toBeInTheDocument();
  expect(request.mock.calls.some(([url]) => String(url).startsWith("/api/drafts?"))).toBe(false);
  expect(request.mock.calls.some(([url]) => String(url) === "/api/drafts")).toBe(false);
  expect(localStorage.getItem("mukdong-current-draft")).toBeNull();
  expect(screen.getByRole("button", { name: "이미지 선택" })).toBeEnabled();
});
it("prefers an explicit draft id over a library topic", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  window.history.replaceState({}, "", `/?draft=${id}&topic=다른%20주제`);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).startsWith("/api/drafts?")
    ? { ok: true, json: async () => ({ id, topic: "기존 초안", audience: "A", media_candidates: [{ id: "22222222-2222-4222-8222-222222222222", source: "photo", file_id: "data:image/png;base64,aA==", purpose: "instagram-primary" }], selected_media_id: "22222222-2222-4222-8222-222222222222" }) }
    : { ok: false, json: async () => ({}) })));
  render(<DraftWizard />);
  expect(await screen.findByDisplayValue("기존 초안")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run red tests.** `npm test -- tests/unit/libraryTopics.test.ts tests/unit/DraftWizard.test.tsx`; expect the new export or prefill case to fail.
- [ ] **Step 3: Add local cards and protected page.** Define five materially different cards (beginner, eating sequence, pairing, neighborhood meal, actual menu photo) in `library.ts`. Avoid factual claims about current prices, hours, ingredients, or live popularity; each `factCheck` tells the owner what to confirm. `/library` uses `requireOwnerPage`, maps the cards to links, and labels them `미리 준비한 아이디어 · 실시간 인기 주제 아님`. Use this link expression:

```tsx
<Link className="button secondary" href={`/?topic=${encodeURIComponent(card.title)}`}>
  이 주제로 초안 시작
</Link>
```

- [ ] **Step 4: Apply query precedence in the existing mount effect.** Before reading `mukdong-current-draft`, parse `draft` and `topic`; accept the latter only if trimmed, at most 120 characters, and no `draft`. When accepted, clear only the current-draft pointer (never delete stored draft files), call `changeTopic(topic, "A", "")`, keep the topic step, and return without `loadTopics()`. When `draft` exists, retain the existing restore path. Keep ordinary `/` behavior untouched and add `maxLength={120}` to the manual topic input. Do not auto-save or call AI for the prefill. Insert this branch before the existing `savedId` lookup:

```tsx
const query = new URLSearchParams(window.location.search);
const requestedId = query.get("draft");
const requestedTopic = query.get("topic")?.trim();
if (!requestedId && requestedTopic && requestedTopic.length <= 120) {
  localStorage.removeItem("mukdong-current-draft");
  changeTopic(requestedTopic, "A", "");
  setStep("topic");
  return;
}
const savedId = requestedId ?? localStorage.getItem("mukdong-current-draft");
```
- [ ] **Step 5: Run green tests.** `npm test -- tests/unit/libraryTopics.test.ts tests/unit/DraftWizard.test.tsx`; expect pass. Manually verify `/?topic=` and `/?draft=...&topic=...` in the browser without making AI requests.
- [ ] **Step 6: Commit only this task's files.** `git add src/features/topics/library.ts src/app/library/page.tsx src/components/wizard/DraftWizard.tsx tests/unit/libraryTopics.test.ts tests/unit/DraftWizard.test.tsx` then `git commit -m "feat: add prepared topic library"`.

### Task 3: Image gallery and honest storage failure

**Files:**
- Create: `src/app/images/page.tsx`
- Create: `src/components/images/ImageGallery.tsx`
- Create: `src/app/images/error.tsx`
- Create: `src/app/drafts/error.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/unit/imageGallery.test.tsx`

**Interfaces:**
- Consumes: Task 1's `WizardShell section="images"`, `createDraftRepository().listDrafts(): Promise<Draft[]>`, `selectedDraftMedia(draft): MediaCandidate[]`.
- Produces: read-only `/images` gallery; each item links to `/?draft=<encoded id>`; both list routes have retryable error boundaries.

- [ ] **Step 1: Write failing gallery tests.** Keep gallery rendering separate from repository access in a named `ImageGallery({ drafts }: { drafts: Draft[] })` export from `src/components/images/ImageGallery.tsx`; mock `next/link` only if the existing test setup requires it. Test empty and mixed records:

```tsx
it("shows a start path when no drafts exist", () => {
  render(<ImageGallery drafts={[]} />);
  expect(screen.getByText("아직 저장된 초안이 없어요")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "이미지 제작 시작" })).toHaveAttribute("href", "/");
});
const baseDraft: Draft = {
  id: "11111111-1111-4111-8111-111111111111", status: "ready", topic: "홍어 한 상", audience: "A",
  media_candidates: [], selected_media_id: null, copy: null, facts_to_verify: [],
  store_profile_version: "2026-09-10", created_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-24T00:00:00.000Z",
};
const withSelectedMedia: Draft = { ...baseDraft, media_candidates: [{ id: "22222222-2222-4222-8222-222222222222", source: "photo", file_id: "data:image/png;base64,aA==", purpose: "instagram-primary" }], selected_media_id: "22222222-2222-4222-8222-222222222222" };
const withoutSelectedMedia: Draft = { ...baseDraft, id: "33333333-3333-4333-8333-333333333333", topic: "이미지 없는 초안" };
it("keeps image-less drafts visible beside selected media", () => {
  render(<ImageGallery drafts={[withSelectedMedia, withoutSelectedMedia]} />);
  expect(screen.getByText("이미지 미선택")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /초안 열기/ })[0]).toHaveAttribute("href", `/?draft=${withSelectedMedia.id}`);
});
```

Import `type Draft` from `@/features/drafts/schema`. Assert that a carousel's selected count is shown and unselected candidates are not counted by adding a third candidate but only one ID to `selected_media_ids`.
- [ ] **Step 2: Run red test.** `npm test -- tests/unit/imageGallery.test.tsx`; expect missing component failure.
- [ ] **Step 3: Implement `/images`.** Auth-check first, call `listDrafts()` once, pass records to `ImageGallery`. Show the three modes in short Korean copy and a single `이미지 제작 시작` link to `/`. Use `selectedDraftMedia` for cover/slide count, render only usable `file_id` strings as CSS backgrounds with a text fallback if media is absent, and give the preview a meaningful accessible name. Never create or mutate a draft from this page. Use the existing `state-card`, `draft-card`, and CSS variables; add only gallery-specific rules to `globals.css`, with a one-column layout under 720px. Keep the server wrapper this small:

```tsx
import { WizardShell } from "@/components/wizard/WizardShell";
import { ImageGallery } from "@/components/images/ImageGallery";
import { createDraftRepository } from "@/features/drafts/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";
export default async function ImagesPage() {
  await requireOwnerPage();
  const drafts = await createDraftRepository().listDrafts();
  return <WizardShell step="topic" section="images"><ImageGallery drafts={drafts} /></WizardShell>;
}
```
- [ ] **Step 4: Add route error states.** `src/app/images/error.tsx` and `src/app/drafts/error.tsx` must each be `"use client"`, accept `{ error: Error & { digest?: string }; retry: () => void }`, show `목록을 불러오지 못했어요` and `<button onClick={retry}>다시 시도</button>`, plus a `/` link. Do not show `error.message` or pretend the list is empty. In `imageGallery.test.tsx`, render both boundaries with a dummy error and assert the message and retry callback. Use this shape in both route files:

```tsx
"use client";
import Link from "next/link";
export default function ErrorState({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div className="state-card" role="alert"><h1>목록을 불러오지 못했어요</h1>
    <p>잠시 후 다시 시도해 주세요.</p><button className="button secondary" onClick={retry}>다시 시도</button>
    <Link className="button secondary" href="/">새 초안으로 돌아가기</Link></div>;
}
```
- [ ] **Step 5: Run green tests and page smoke.** `npm test -- tests/unit/imageGallery.test.tsx`; expect pass. `npm run build`; expect `/images` and `/library` in route output. In the browser, inspect a no-draft gallery, a draft with a selected cover, and a selected carousel.
- [ ] **Step 6: Commit only this task's files.** `git add src/app/images/page.tsx src/components/images/ImageGallery.tsx src/app/images/error.tsx src/app/drafts/error.tsx src/app/globals.css tests/unit/imageGallery.test.tsx` then `git commit -m "feat: add saved image gallery"`.

### Task 4: Make settings and review text match real behavior

**Files:**
- Modify: `src/components/settings/SettingsForm.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/components/copy/CopyEditor.tsx`
- Modify: `src/components/wizard/DraftWizard.tsx`
- Modify: `src/app/globals.css` only if an orphaned tone style must be removed
- Modify: `tests/unit/SettingsForm.test.tsx`
- Modify: `tests/unit/CopyEditor.test.tsx`
- Modify: `tests/unit/DraftWizard.test.tsx`

**Interfaces:**
- Consumes: existing `AppSettings`, `DEFAULT_SETTINGS`, and `onSave(value: AppSettings)`; no schema/API change.
- Produces: only two editable settings while preserving every other stored property on save and reset.

- [ ] **Step 1: Write failing tests.** Replace assertions for inert controls in `SettingsForm.test.tsx` with:

```tsx
it("saves only changed effective settings without resetting inactive values", async () => {
  const onSave = vi.fn();
  const initial = { ...DEFAULT_SETTINGS, copyLength: "detailed" as const, imageAspectRatio: "1:1" as const };
  render(<SettingsForm initialSettings={initial} onSave={onSave} />);
  expect(screen.queryByLabelText("이미지 비율")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("캐러셀 장수"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: /권장값으로 되돌리기/ }));
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ carouselSlideCount: 5, imageAiProvider: "automatic", copyLength: "detailed", imageAspectRatio: "1:1" }));
});
```

Add assertions that the tone button names are absent from `CopyEditor` and that review shows `직접 확인` text rather than three check-mark success claims.
- [ ] **Step 2: Run red tests.** `npm test -- tests/unit/SettingsForm.test.tsx tests/unit/CopyEditor.test.tsx tests/unit/DraftWizard.test.tsx`; expect new assertions to fail.
- [ ] **Step 3: Reduce settings inputs.** Keep `settings` state initialized from `initialSettings`. Render editable selects only for `carouselSlideCount` and `imageAiProvider`. Replace all other editable controls with a short non-interactive `추후 적용할 옵션` explanation. Keep connection status cards but say `키 설정됨` instead of `연결됨` where only env presence is known; never print values. Leave the `/api/settings` payload as the full `AppSettings` object so inactive stored values survive. In `settings/page.tsx`, remove the claim that all detailed options can be adjusted now and replace the interactive `InstagramConnectionCard` with a non-interactive `게시 연동은 추후 단계에서 설정해요` note; do not change existing publish/OAuth code. Use exactly this reset transformation:

```tsx
setSettings(current => ({
  ...current,
  carouselSlideCount: DEFAULT_SETTINGS.carouselSlideCount,
  imageAiProvider: DEFAULT_SETTINGS.imageAiProvider,
}));
setSaved(false);
```
- [ ] **Step 4: Remove false affordances.** Remove the inert `tone-row` buttons from `CopyEditor`; replace its `금지 표현 검사 완료 ✓` with `가격·영업시간·표현은 게시 전에 직접 확인해 주세요`. In `DraftWizard` review, replace `이미지 출처 표시 ✓`, `금지 표현 없음 ✓`, and `원본 사진 보존 ✓` with an honest `게시 전 확인할 항목` list for photo/AI disclosure, facts, and original photo. Do not alter the save/publish API or approval guard. The review copy should be:

```tsx
<div className="review-status" aria-label="게시 전 확인할 항목">
  <span>사진과 AI 이미지의 출처를 확인해 주세요</span>
  <span>가격·영업시간·메뉴 표현을 확인해 주세요</span>
  <span>원본 사진은 따로 보관해 주세요</span>
</div>
```
- [ ] **Step 5: Run green tests.** `npm test -- tests/unit/SettingsForm.test.tsx tests/unit/CopyEditor.test.tsx tests/unit/DraftWizard.test.tsx`; expect pass. `npm run lint` and `npm run build`; expect pass.
- [ ] **Step 6: Commit only this task's files.** `git add src/components/settings/SettingsForm.tsx src/app/settings/page.tsx src/components/copy/CopyEditor.tsx src/components/wizard/DraftWizard.tsx src/app/globals.css tests/unit/SettingsForm.test.tsx tests/unit/CopyEditor.test.tsx tests/unit/DraftWizard.test.tsx` then `git commit -m "fix: show only effective controls and checks"`.

### Task 5: End-to-end acceptance and responsive check

**Files:**
- Create: `tests/e2e/app-shell.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4 routes and existing `loginAsOwner(page, destination?)` helper.
- Produces: runnable browser proof of navigation, auth, prefill, and no-API basics; no new runtime behavior.

- [ ] **Step 1: Add the acceptance tests.** Use `loginAsOwner` and Playwright `test`/`expect`:

```ts
test("owner can reach each menu and use a prepared topic", async ({ page }) => {
  await loginAsOwner(page);
  for (const [label, path] of [["이미지 제작실", "/images"], ["콘텐츠 자료", "/library"], ["도움말", "/help"], ["설정", "/settings"]] as const) {
    await page.getByRole("link", { name: label }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/library");
  const topic = await page.locator(".library-card h2").first().textContent();
  await page.getByRole("link", { name: "이 주제로 초안 시작" }).first().click();
  await expect(page.getByLabel("직접 주제를 적고 싶다면")).toHaveValue(topic!);
});
test("anonymous visitor is sent to login for new pages", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/images");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});
```

Give each library card the `.library-card` class used by the test. For the input assertion, compare its value with the clicked card's title; do not settle for merely non-empty. Add a mobile viewport case (390×844) with `await page.setViewportSize({ width: 390, height: 844 })` and `expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)` after opening `/images`; assert its main CTA is visible. Stub paid AI endpoints or use fallback paths; never run a chargeable generation request in acceptance tests.
- [ ] **Step 2: Run the suite.** `npm test`, `npm run lint`, `npm run build`, then `npm run test:e2e -- tests/e2e/app-shell.spec.ts`; record each outcome. Also run the existing draft-flow and saved-drafts E2E specs if the local test server and auth fixture are available.
- [ ] **Step 3: Manually inspect at desktop and mobile widths.** Check navigation active state, empty gallery, card-to-topic path, settings disabled/future explanation, help, and existing draft reopening. Report browser checks separately from build/test results. Do not claim Render deployment or Supabase persistence from local checks.
- [ ] **Step 4: Commit the test file only.** `git add tests/e2e/app-shell.spec.ts` then `git commit -m "test: cover completed app shell"`.

## Self-Review Record

- Spec sections covered: all six menu targets, image entry/gallery, library prefill, effective settings, help, honesty copy, auth, empty/error states, responsive layout, existing wizard regression.
- Intentional non-goals remain untouched: Supabase, Meta activation, trends, new AI, new storage. Existing unpublished user files are not staged or modified.
- Task interfaces align: Task 1 adds `WizardShell` sections consumed in Tasks 2–3; Task 2 produces `/?topic=` consumed by the existing wizard; Task 3 reads existing draft repository only; Task 4 preserves `AppSettings` schema.
- The five Review Focus cases are attached to Tasks 2–4. Before execution, confirm fixture names and exact rendered labels against current source if the checkout has changed.
