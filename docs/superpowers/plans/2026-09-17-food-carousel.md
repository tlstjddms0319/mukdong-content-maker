# Food Instagram Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a topic-aware five-slide food carousel that is generated, approved, persisted, previewed, exported, and published to Instagram without weakening the existing explicit approval boundary.

**Architecture:** Gemini produces a validated ordered content plan for the configured 3, 5, 7, or 10 slides, while the existing OpenAI image route renders one role-specific visual request at a time. Sharp adds reliable Korean text after generation. Drafts keep the cover in the legacy singular field and add an ordered selected ID list; review, export, public media, and Meta publishing consume that same order.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Zod, Gemini JSON API, OpenAI Images API, Sharp, JSZip, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-food-carousel-design.md`

## Global Constraints

- Preserve the current dirty working tree and do not commit or overwrite unrelated in-progress changes.
- Keep single-photo drafts and the existing `selected_media_id` contract working.
- Default to five slides and support only the settings values 3, 5, 7, and 10; never exceed the Meta API limit of 10.
- Use 1080×1350, 4:5, JPEG output for every generated carousel slide.
- Do not add a carousel dependency; use React state and CSS.
- Never publish without the existing explicit `approved: true` request and service-level approval check.
- Do not add scheduling, video, Reels, 11–20 slide export, drag sorting, or performance optimization.
- No task creates a git commit in this shared dirty worktree; each task ends with a focused green test gate instead.

---

### Task 1: Structured five-slide plan and role-specific image rendering

**Files:**
- Create: `src/features/images/carousel.ts`
- Create: `src/features/images/composeSlide.ts`
- Create: `src/app/api/images/plan/route.ts`
- Modify: `src/features/images/schema.ts`
- Modify: `src/features/images/openaiRequest.ts`
- Modify: `src/app/api/images/generate/route.ts`
- Create: `tests/unit/carouselPlan.test.ts`
- Create: `tests/unit/composeSlide.test.ts`
- Modify: `tests/unit/imageRequest.test.ts`

**Interfaces:**
- Produces: `CarouselPlanInputSchema`, `CarouselSlidePlanSchema`, `CarouselPlanSchema`, and `rolesForCount(3|5|7|10)`.
- Produces: `createFallbackCarouselPlan(input): CarouselPlan` and `planCarousel(input, ai?): Promise<CarouselPlan>`.
- Extends: `ImageBriefSchema` with optional `imageBrief`, `slide`, `styleAnchor`, and `referenceMode`.
- Produces: `composeSlideImage(input: Buffer, slide: CarouselSlidePlan, index: number, total: number): Promise<Buffer>`.
- `POST /api/images/plan` returns `{ plan: CarouselPlan, provider: "gemini" | "fallback" }`.
- `POST /api/images/generate` still returns `{ images: string[] }`, but returns normalized JPEG data URLs with overlays when `slide` is supplied.

- [ ] **Step 1: Write failing carousel plan tests**

```ts
it("keeps five distinct roles in publishing order", async () => {
  const plan=await planCarousel({topic:"막걸리 한 잔과 어울리는 홍어 한 점",imageBrief:"홍어와 막걸리"});
  expect(plan.slides.map(slide=>slide.role)).toEqual(["cover","detail","how-to","pairing","visit"]);
  expect(new Set(plan.slides.map(slide=>slide.visualPrompt)).size).toBe(5);
});

it("falls back without replacing the selected topic", async () => {
  const plan=await planCarousel({topic:"비 오는 날 홍어",imageBrief:"빗빛과 상차림"},{generate:async()=>{throw new Error("offline");}});
  expect(plan.slides[0].headline).toContain("비 오는 날 홍어");
});
```

- [ ] **Step 2: Run the plan tests and verify RED**

Run: `npm test -- --run tests/unit/carouselPlan.test.ts`

Expected: FAIL because `src/features/images/carousel.ts` does not exist.

- [ ] **Step 3: Implement the schemas, fallback, and Gemini plan route**

Use this exact role contract:

```ts
export const CarouselRoleSchema=z.enum(["cover","overview","detail","how-to","pairing","process","occasion","mood","visit","cta"]);
export const CarouselSlidePlanSchema=z.object({
  role:CarouselRoleSchema,
  headline:z.string().trim().min(1).max(42),
  visualPrompt:z.string().trim().min(12).max(600),
  textPosition:z.enum(["top","bottom"]),
});
export const CarouselPlanSchema=z.object({
  slideCount:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]),
  styleAnchor:z.string().trim().min(12).max(500),
  slides:z.array(CarouselSlidePlanSchema).min(3).max(10),
}).superRefine((plan,ctx)=>{
  const expected=rolesForCount(plan.slideCount);
  if(plan.slides.length!==expected.length)ctx.addIssue({code:"custom",path:["slides"],message:"슬라이드 수를 확인해 주세요."});
  plan.slides.forEach((slide,index)=>{
    if(slide.role!==expected[index])ctx.addIssue({code:"custom",path:["slides",index,"role"],message:"슬라이드 순서를 확인해 주세요."});
  });
});
```

`rolesForCount` returns `cover/how-to/visit` for 3; `cover/detail/how-to/pairing/visit` for 5; `cover/overview/detail/how-to/pairing/occasion/visit` for 7; and all ten roles in the enum order for 10. `planCarousel` accepts only a provider response matching the requested role order and otherwise returns the same-count fallback. The route calls `createGeminiClient().generateJson()` and instructs Gemini to preserve the supplied topic, avoid unverified store facts, write short Korean headlines, and return no text inside visual prompts.

- [ ] **Step 4: Verify the plan tests GREEN**

Run: `npm test -- --run tests/unit/carouselPlan.test.ts tests/unit/geminiClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing prompt and composition tests**

```ts
it("uses the selected topic and slide role instead of a fixed samhap prompt", () => {
  const request=buildImageRequest({topic:"비 오는 날 홍어와 막걸리",count:1,aspectRatio:"4:5",imageBrief:"창가의 빗빛",slide:visitSlide});
  expect(request.prompt).toContain("비 오는 날 홍어와 막걸리");
  expect(request.prompt).toContain(visitSlide.visualPrompt);
  expect(request.prompt).not.toContain("하나의 음식 피사체");
});

it("renders a 1080 by 1350 JPEG that differs from the plain input", async () => {
  const input=await sharp({create:{width:40,height:40,channels:3,background:"#f4ede2"}}).png().toBuffer();
  const output=await composeSlideImage(input,coverSlide,1,5);
  expect(await sharp(output).metadata()).toMatchObject({format:"jpeg",width:1080,height:1350});
  expect(output.equals(await sharp(input).resize(1080,1350,{fit:"cover"}).jpeg({quality:90}).toBuffer())).toBe(false);
});
```

- [ ] **Step 6: Run prompt and composition tests and verify RED**

Run: `npm test -- --run tests/unit/imageRequest.test.ts tests/unit/composeSlide.test.ts`

Expected: FAIL because slide-aware prompting and composition are missing.

- [ ] **Step 7: Implement minimal slide-aware prompting and Sharp overlay**

The prompt includes, in order: selected topic, existing image brief, slide role/visual prompt, shared style anchor, requested text-safe area, reference handling, and the existing no-text/no-logo/no-fabricated-store constraints. `composeSlideImage` resizes with `fit:"cover"`, composites an escaped SVG gradient/headline/counter using `Malgun Gothic, Noto Sans KR, sans-serif`, and returns JPEG quality 90. The route converts both base64 and remote provider outputs to bytes before composition so downstream storage always receives a data URL.

- [ ] **Step 8: Verify Task 1**

Run: `npm test -- --run tests/unit/carouselPlan.test.ts tests/unit/composeSlide.test.ts tests/unit/imageRequest.test.ts tests/unit/openaiError.test.ts`

Expected: PASS with no network calls.

---

### Task 2: Cover-first carousel UI and ordered draft persistence

**Files:**
- Modify: `src/components/images/ImageStudio.tsx`
- Modify: `src/components/wizard/DraftWizard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/features/settings/schema.ts`
- Modify: `src/features/settings/defaults.ts`
- Modify: `src/features/settings/repository.ts`
- Modify: `src/components/settings/SettingsForm.tsx`
- Modify: `src/features/drafts/schema.ts`
- Create: `src/features/drafts/selection.ts`
- Modify: `tests/unit/ImageStudio.test.tsx`
- Modify: `tests/unit/DraftWizard.test.tsx`
- Modify: `tests/unit/repository.test.ts`
- Create: `tests/unit/draftSelection.test.ts`
- Modify: `tests/unit/SettingsForm.test.tsx`

**Interfaces:**
- `ImageStudio` consumes `topic: string`, `imageBrief?: string`, `slideCount: 3|5|7|10`, `approvedImages?: ApprovedImage[]`.
- `ImageStudio` produces `onApprove(images: ApprovedImage[]): void` only after one single photo or all five carousel slides are ready.
- `ApprovedImage` adds optional `role` and keeps `id`, `preview`, and `source`.
- `DraftSchema` adds `selected_media_ids?: string[]` with 1–10 UUIDs.
- Produces from `selection.ts`: `selectedDraftMedia(draft): MediaCandidate[]`, ordered by `selected_media_ids` with legacy singular fallback, without importing Zod into client components.

- [ ] **Step 1: Write failing settings and ImageStudio tests**

```tsx
it("passes the chosen topic into two cover candidates and generates four distinct roles after selection", async () => {
  render(<ImageStudio topic="비 오는 날 홍어" imageBrief="창가의 빗빛" onApprove={onApprove}/>);
  fireEvent.click(screen.getByRole("button",{name:"AI 이미지 생성"}));
  fireEvent.click(screen.getByRole("button",{name:"표지 후보 2장 만들기"}));
  await screen.findByText("표지 후보 1");
  expect(requestBody(coverCall)).toMatchObject({topic:"비 오는 날 홍어",count:2,slide:{role:"cover"}});
  fireEvent.click(screen.getByRole("button",{name:"표지 후보 1 선택"}));
  fireEvent.click(screen.getByRole("button",{name:"이 표지로 5장 완성하기"}));
  await screen.findByText("5/5장 완성");
  expect(generationCalls.slice(1).map(call=>requestBody(call).slide.role)).toEqual(["detail","how-to","pairing","visit"]);
});

it("keeps completed slides when a later slide fails", async () => {
  // cover and detail succeed; how-to fails
  await completeThroughFailure();
  expect(screen.getByText("2/5장 완성")).toBeVisible();
  expect(screen.getByRole("button",{name:"남은 슬라이드 다시 만들기"})).toBeEnabled();
});

it("uses five slides by default and exposes only API-safe slide counts", () => {
  render(<SettingsForm/>);
  expect(screen.getByLabelText("캐러셀 장수")).toHaveValue("5");
  expect(within(screen.getByLabelText("캐러셀 장수")).getAllByRole("option").map(option=>option.textContent)).toEqual(["3","5 (권장)","7","10"]);
});
```

- [ ] **Step 2: Run ImageStudio tests and verify RED**

Run: `npm test -- --run tests/unit/SettingsForm.test.tsx tests/unit/repository.test.ts tests/unit/ImageStudio.test.tsx`

Expected: FAIL because the component still hardcodes `홍어 삼합` and approves one image.

- [ ] **Step 3: Implement the cover-first state machine**

Add `carouselSlideCount` to settings with a backward-compatible repository default of 5. `HomePage` reads settings on the server and passes the serializable count into `DraftWizard`, which passes it into `ImageStudio`. Use these states only: `plan`, `coverCandidates`, `selectedCoverId`, `slides`, `workingStage`, and existing upload/error state. Fetch `/api/images/plan`, then `/api/images/generate` with `count:2` for cover. After selection, call the same generation route sequentially for the remaining plans with `count:1`, append successful results, and expose real `N/total장` progress. Retry starts at `slides.length`; it does not discard earlier slides.

- [ ] **Step 4: Verify ImageStudio GREEN**

Run: `npm test -- --run tests/unit/SettingsForm.test.tsx tests/unit/repository.test.ts tests/unit/ImageStudio.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write failing draft ordering and wizard tests**

```ts
it("preserves selected carousel order while accepting legacy singular drafts", () => {
  expect(selectedDraftMedia(carouselDraft).map(media=>media.id)).toEqual(carouselDraft.selected_media_ids);
  expect(selectedDraftMedia(legacyDraft)).toHaveLength(1);
});
```

```tsx
it("saves and restores all five approved slides in order", async () => {
  await finishFiveSlides();
  const payload=JSON.parse(String(draftCall[1]?.body));
  expect(payload.media_candidates).toHaveLength(5);
  expect(payload.selected_media_ids).toEqual(payload.media_candidates.map((media:{id:string})=>media.id));
  expect(payload.selected_media_id).toBe(payload.selected_media_ids[0]);
});
```

- [ ] **Step 6: Run draft tests and verify RED**

Run: `npm test -- --run tests/unit/repository.test.ts tests/unit/draftSelection.test.ts tests/unit/DraftWizard.test.tsx`

Expected: FAIL because ordered selections are not modeled or persisted.

- [ ] **Step 7: Implement additive draft compatibility and wizard plumbing**

Validate that every ordered ID exists in `media_candidates`, no ID repeats, and the first ordered ID equals `selected_media_id`. Save five candidates with `purpose` values `instagram-cover`, `instagram-detail`, `instagram-how-to`, `instagram-pairing`, `instagram-visit`. On reload use `selectedDraftMedia`; pass topic/image brief into `ImageStudio`; pass the ordered image array into review.

- [ ] **Step 8: Verify Task 2**

Run: `npm test -- --run tests/unit/ImageStudio.test.tsx tests/unit/DraftWizard.test.tsx tests/unit/repository.test.ts tests/unit/draftSelection.test.ts tests/unit/SettingsForm.test.tsx`

Expected: PASS for both five-slide and legacy single-image flows.

---

### Task 3: Carousel review and multi-image ZIP export

**Files:**
- Modify: `src/components/review/PostPreview.tsx`
- Modify: `src/components/review/ExportActions.tsx`
- Modify: `src/components/review/InstagramPublish.tsx`
- Modify: `src/lib/files/exportBundle.ts`
- Modify: `src/app/api/export/[draftId]/route.ts`
- Create: `tests/unit/PostPreview.test.tsx`
- Modify: `tests/unit/ExportActions.test.tsx`
- Modify: `tests/unit/InstagramPublish.test.tsx`
- Modify: `tests/unit/exportBundle.test.ts`

**Interfaces:**
- `PostPreview({caption,imageUrls})` displays one active slide and always uses `imageUrls[0]` as the feed thumbnail.
- `ExportActions({caption,images,draftId})` consumes ordered `{url,source}[]`.
- `InstagramPublish({draftId,caption,imageUrls})` uses the first image as its thumbnail and shows the slide count.
- `buildExportBundle({caption,images,checks})` consumes ordered `{bytes,name,source}[]`.

- [ ] **Step 1: Write failing preview and export tests**

```tsx
it("moves through five slides while keeping the first image as feed cover", () => {
  render(<PostPreview caption="문안" imageUrls={["one","two","three","four","five"]}/>);
  expect(screen.getByText("1 / 5")).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"다음 슬라이드"}));
  expect(screen.getByText("2 / 5")).toBeVisible();
  expect(screen.getByLabelText("피드 대표 이미지")).toHaveStyle({backgroundImage:'url("one")'});
});
```

```ts
it("stores five numbered images and ordered source metadata", async () => {
  const zip=await JSZip.loadAsync(await buildExportBundle({caption:"문안",images:fiveImages,checks:[]}));
  expect(Object.keys(zip.files).sort()).toEqual(["caption.txt","metadata.json","slide-01.jpg","slide-02.jpg","slide-03.jpg","slide-04.jpg","slide-05.jpg"]);
});
```

- [ ] **Step 2: Run review/export tests and verify RED**

Run: `npm test -- --run tests/unit/PostPreview.test.tsx tests/unit/exportBundle.test.ts tests/unit/ExportActions.test.tsx tests/unit/InstagramPublish.test.tsx`

Expected: FAIL because every interface is singular.

- [ ] **Step 3: Implement the minimal carousel controls and ordered export**

Use local `activeIndex`, previous/next buttons, and a thumbnail button list. Disable previous at index 0 and next at the final index. Keep the existing caption and AI disclosure. Export the cover directly as `instagram-cover.jpg`; the full bundle includes every numbered slide, caption, per-slide source, checks, and export time. Adapt the existing placeholder export route to the new array input with one empty legacy image so it remains build-compatible without expanding that unused route into a second draft export implementation. The publish panel still sends only draft ID, approval, and caption; it never sends media order from the browser.

- [ ] **Step 4: Verify Task 3**

Run: `npm test -- --run tests/unit/PostPreview.test.tsx tests/unit/exportBundle.test.ts tests/unit/ExportActions.test.tsx tests/unit/InstagramPublish.test.tsx`

Expected: PASS.

---

### Task 4: Signed slide URLs and approved Instagram carousel publishing

**Files:**
- Modify: `src/features/instagram/publicMedia.ts`
- Modify: `src/app/api/media/public/[draftId]/route.ts`
- Modify: `src/features/instagram/metaClient.ts`
- Modify: `src/features/instagram/publish.ts`
- Modify: `tests/unit/publicMedia.test.ts`
- Modify: `tests/unit/instagramPublish.test.ts`

**Interfaces:**
- `prepareInstagramImage(draft, mediaId?)` returns the requested selected slide or the legacy cover.
- `signMediaUrl` and `verifyMediaSignature` add optional `mediaId` and sign `draftId.mediaId.expiresAt`.
- Extends `createImageContainer` with optional `caption` and `isCarouselItem`.
- Adds `createCarouselContainer({instagramUserId,accessToken,children,caption}): Promise<string>`.
- `publishApprovedDraft` selects one-image or 2–10 image flow from the server-side draft.

- [ ] **Step 1: Write failing signed-media tests**

```ts
it("binds each signed URL to one selected slide", async () => {
  const first=new URL(signMediaUrl({...base,mediaId:firstId}));
  expect(verifyMediaSignature({...verify,mediaId:firstId,signature:first.searchParams.get("sig")!})).toBe(true);
  expect(verifyMediaSignature({...verify,mediaId:secondId,signature:first.searchParams.get("sig")!})).toBe(false);
  await expect(prepareInstagramImage(draft,secondId)).resolves.toEqual(expect.any(Buffer));
});
```

- [ ] **Step 2: Run public media tests and verify RED**

Run: `npm test -- --run tests/unit/publicMedia.test.ts`

Expected: FAIL because media ID is not part of selection or signature.

- [ ] **Step 3: Implement media-bound URLs and route lookup**

Read `media` from the existing route query, require it to be in the approved ordered selection, and pass it through the signature verifier and image preparation. Keep no-media URLs valid for legacy singular drafts. Return the same JPEG and cache headers.

- [ ] **Step 4: Verify public media GREEN**

Run: `npm test -- --run tests/unit/publicMedia.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing carousel publication tests**

```ts
it("creates five ordered children, one parent, and publishes once after approval", async () => {
  const {draftId,deps,meta}=setupCarousel();
  await publishApprovedDraft({draftId,approved:true},deps);
  expect(meta.createImageContainer).toHaveBeenCalledTimes(5);
  expect(meta.createImageContainer.mock.calls.every(([value])=>value.isCarouselItem===true)).toBe(true);
  expect(meta.createCarouselContainer).toHaveBeenCalledWith(expect.objectContaining({children:["child-1","child-2","child-3","child-4","child-5"]}));
  expect(meta.publishContainer).toHaveBeenCalledTimes(1);
});

it("does not create a parent when one child fails", async () => {
  meta.createImageContainer.mockRejectedValueOnce(new Error("child failed"));
  await expect(publishApprovedDraft({draftId,approved:true},deps)).rejects.toThrow();
  expect(meta.createCarouselContainer).not.toHaveBeenCalled();
  expect(meta.publishContainer).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run publish tests and verify RED**

Run: `npm test -- --run tests/unit/instagramPublish.test.ts`

Expected: FAIL because the Meta adapter and coordinator support one image only.

- [ ] **Step 7: Implement the singular/carousel branch**

For one selected medium, preserve the current image container call. For 2–10 selected media, create child image containers in draft order with `is_carousel_item=true`, create one parent using `media_type=CAROUSEL` and comma-separated child IDs, poll the parent with the existing bounded loop, and publish that parent. Attach caption only to the single-image container or carousel parent. Save only the parent container ID in the existing publication record.

- [ ] **Step 8: Verify Task 4**

Run: `npm test -- --run tests/unit/publicMedia.test.ts tests/unit/instagramPublish.test.ts tests/unit/InstagramPublish.test.tsx`

Expected: PASS, including explicit approval, duplicate prevention, single image, and five-image carousel cases.

---

### Task 5: Responsive styling, E2E flow, and final verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/draft-flow.spec.ts`

**Interfaces:**
- The E2E mocks `/api/images/plan`, two cover results, and four role results without external AI calls.
- The review screen exposes `1 / 5`, navigation buttons, five thumbnails, export, and explicit publish approval.

- [ ] **Step 1: Update the E2E test before styling changes**

The route mock returns the exact default five-role plan. The first image call returns two cover data URLs; subsequent calls each return one data URL. The test selects a cover, waits for `5/5장 완성`, approves the carousel, verifies the draft payload contains five ordered IDs, reaches review, navigates to slide 5, and downloads `instagram-draft.zip`.

- [ ] **Step 2: Run desktop E2E and verify RED**

Run: `npm run test:e2e -- tests/e2e/draft-flow.spec.ts --project=desktop`

Expected: FAIL on missing carousel layout or interaction.

- [ ] **Step 3: Add minimal responsive CSS**

Add styles for the two-column cover comparison, horizontally scrollable completed slide strip, active thumbnail border, overlay-safe 4:5 cards, navigation row, and stacked mobile controls. Reuse existing colors, radii, button classes, and reduced-motion handling. Do not add animations or a third-party carousel.

- [ ] **Step 4: Run focused and full gates**

Run:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e -- tests/e2e/draft-flow.spec.ts --project=desktop
npm run test:e2e -- tests/e2e/draft-flow.spec.ts --project=mobile
git diff --check
```

Expected: every command exits 0; tests call no real Gemini, OpenAI, or Meta endpoint.

- [ ] **Step 5: Manual local acceptance without publishing**

At `http://localhost:3000/`, choose a non-samhap topic, confirm the request and visible copy use that topic, compare two covers, complete five slides, navigate all slides, return to earlier wizard steps without losing the set, and inspect the downloaded ZIP. Do not click the real Instagram publish button without a separate explicit request naming the target account and exact content.

---

## Stop Condition

Stop when the approved five-slide flow works end to end, legacy single-photo drafts still work, all automated gates pass, and real Instagram publication remains behind the existing explicit approval click. Do not add scheduling or live trend ingestion in this implementation.
