# Instagram 연결 및 승인 게시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성된 초안을 Instagram 프로페셔널 계정에 연결하고, 사용자가 최종 승인한 경우에만 단일 이미지 게시물을 안전하게 게시한다.

**Architecture:** Next.js 서버 경로가 Meta OAuth, 토큰 저장, 공개 미디어 준비, 게시 요청을 전담한다. 브라우저에는 연결 상태와 안전한 게시 결과만 전달하며, 초안별 게시 기록으로 중복 게시를 차단한다. 외부 API는 어댑터 뒤에 두어 자동 테스트에서 실제 Meta 호출이나 비용이 발생하지 않게 한다.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Node crypto/fs, Sharp, Vitest, Testing Library, Playwright, Instagram Graph API

**Spec:** `docs/superpowers/specs/2026-09-11-instagram-publishing-design.md`

## Global Constraints

- Instagram 비즈니스 또는 크리에이터 계정만 연결한다.
- 요청 권한은 `instagram_business_basic`, `instagram_business_content_publish`로 제한한다.
- 토큰과 `INSTAGRAM_APP_SECRET`은 서버에서만 읽고 응답, 로그, 초안, 내보내기 파일에 포함하지 않는다.
- 사용자가 `승인하고 Instagram에 게시`를 직접 누르기 전에는 게시 API를 호출하지 않는다.
- 동일 초안의 성공한 게시를 다시 생성하지 않는다.
- 실제 게시용 이미지는 공개 HTTPS URL에서 Meta가 가져갈 수 있는 4:5 JPEG 파생본이어야 한다.
- 예약, 릴스, 스토리, 캐러셀, 댓글, 성과 분석은 구현하지 않는다.
- 자동 테스트는 실제 Meta API를 호출하지 않는다.

---

## File Map

```text
src/features/instagram/schema.ts             연결 및 게시 데이터 검증
src/features/instagram/repository.ts         토큰과 게시 기록의 원자적 로컬 저장
src/features/instagram/metaClient.ts         OAuth와 Graph API HTTP 어댑터
src/features/instagram/oauth.ts              state 생성·검증과 토큰 교환 조정
src/features/instagram/publish.ts            공개 URL 준비부터 중복 방지까지 게시 조정
src/features/instagram/publicMedia.ts        서명 URL과 4:5 JPEG 파생본 생성
src/app/api/instagram/status/route.ts         안전한 연결 상태 조회
src/app/api/instagram/connect/route.ts        OAuth 시작
src/app/api/instagram/callback/route.ts       OAuth 콜백
src/app/api/instagram/connection/route.ts     연결 해제
src/app/api/instagram/publish/route.ts        명시적 승인 게시
src/app/api/media/public/[draftId]/route.ts   만료되는 서명 이미지 제공
src/components/settings/InstagramConnection.tsx
src/components/review/InstagramPublish.tsx
tests/unit/instagramRepository.test.ts
tests/unit/instagramOAuth.test.ts
tests/unit/publicMedia.test.ts
tests/unit/instagramPublish.test.ts
tests/unit/InstagramConnection.test.tsx
tests/unit/InstagramPublish.test.tsx
tests/e2e/instagram-publish.spec.ts
```

---

### Task 1: 연결 정보와 게시 기록 저장소

**Files:**
- Create: `src/features/instagram/schema.ts`
- Create: `src/features/instagram/repository.ts`
- Create: `tests/unit/instagramRepository.test.ts`

**Interfaces:**
- Produces: `InstagramConnectionSchema`, `PublicationSchema`
- Produces: `createInstagramRepository(root?: string)`
- Produces: `readConnection()`, `saveConnection(value)`, `deleteConnection()`, `readPublication(draftId)`, `savePublication(value)`

- [ ] **Step 1: Write failing repository tests**

```ts
// @vitest-environment node
it("round-trips a connection and never exposes it through a public view", async () => {
  const repo=createInstagramRepository(tempDir);
  await repo.saveConnection(validConnection);
  expect(await repo.readConnection()).toEqual(validConnection);
  expect(toPublicConnection(validConnection)).toEqual({connected:true,username:"mukdong",expiresAt:validConnection.expiresAt});
  expect(JSON.stringify(toPublicConnection(validConnection))).not.toContain(validConnection.accessToken);
});

it("returns an existing successful publication for the same draft", async () => {
  await repo.savePublication({...validPublication,status:"published"});
  expect(await repo.readPublication(validPublication.draftId)).toMatchObject({status:"published"});
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/instagramRepository.test.ts`

Expected: FAIL because the Instagram schemas and repository do not exist.

- [ ] **Step 3: Implement schemas and atomic persistence**

```ts
export const InstagramConnectionSchema=z.object({
  instagramUserId:z.string().min(1), username:z.string().min(1),
  accessToken:z.string().min(1), expiresAt:z.string().datetime(),
  scopes:z.array(z.enum(["instagram_business_basic","instagram_business_content_publish"])),
  connectedAt:z.string().datetime(), updatedAt:z.string().datetime(),
});

export const PublicationSchema=z.object({
  draftId:z.string().uuid(), status:z.enum(["preparing","published","failed"]),
  containerId:z.string().nullable(), mediaId:z.string().nullable(),
  safeError:z.string().nullable(), attemptedAt:z.string().datetime(), publishedAt:z.string().datetime().nullable(),
});
```

Store connection at `<root>/instagram/connection.json` and publications at `<root>/instagram/publications/<draft-id>.json`; write to a UUID-suffixed temporary file and rename.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/unit/instagramRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/instagram/schema.ts src/features/instagram/repository.ts tests/unit/instagramRepository.test.ts
git commit -m "feat: store Instagram connection safely"
```

---

### Task 2: OAuth 시작, 콜백, 연결 상태

**Files:**
- Create: `src/features/instagram/metaClient.ts`
- Create: `src/features/instagram/oauth.ts`
- Create: `src/app/api/instagram/status/route.ts`
- Create: `src/app/api/instagram/connect/route.ts`
- Create: `src/app/api/instagram/callback/route.ts`
- Create: `src/app/api/instagram/connection/route.ts`
- Create: `tests/unit/instagramOAuth.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createInstagramRepository()` from Task 1
- Produces: `InstagramMetaClient` with `exchangeCode(code)`, `getProfile(token)`
- Produces: `createOAuthState(): string`, `buildAuthorizationUrl(config,state): string`, `completeInstagramOAuth(input,deps)`

- [ ] **Step 1: Write failing OAuth tests**

```ts
it("builds an authorization URL with only the approved scopes", () => {
  const url=new URL(buildAuthorizationUrl(config,"state-value"));
  expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
  expect(url.searchParams.get("state")).toBe("state-value");
});

it("rejects a callback when the cookie state differs", async () => {
  await expect(completeInstagramOAuth({code:"code",state:"wrong",cookieState:"right"},deps))
    .rejects.toThrow("연결 요청을 확인할 수 없어요");
  expect(deps.exchangeCode).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/instagramOAuth.test.ts`

Expected: FAIL because OAuth helpers do not exist.

- [ ] **Step 3: Implement the Meta adapter and OAuth coordinator**

Use `crypto.randomBytes(32).toString("base64url")` for state. `GET /api/instagram/connect` stores it in a 10-minute `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie and redirects to Meta. The callback compares state with `timingSafeEqual`, exchanges the code, reads the profile, stores the connection, clears the cookie, and redirects to `/settings?instagram=connected`.

`GET /api/instagram/status` returns only:

```ts
type PublicInstagramConnection={connected:boolean;username?:string;expiresAt?:string;needsReconnect?:boolean};
```

`DELETE /api/instagram/connection` removes the connection file and returns `{connected:false}`. Missing configuration returns a safe 503 response naming only the missing environment-variable names.

- [ ] **Step 4: Add placeholder-only environment keys**

```dotenv
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/instagram/callback
MEDIA_PUBLIC_BASE_URL=https://your-deployed-app.example
MEDIA_SIGNING_SECRET=replace_with_a_random_secret
```

- [ ] **Step 5: Verify GREEN and secret boundaries**

Run: `npm test -- --run tests/unit/instagramOAuth.test.ts`

Run: `rg -n "accessToken|APP_SECRET" src/app/api/instagram src/components`

Expected: tests PASS; no response object or client component includes either secret value.

- [ ] **Step 6: Commit**

```powershell
git add src/features/instagram/metaClient.ts src/features/instagram/oauth.ts src/app/api/instagram .env.example tests/unit/instagramOAuth.test.ts
git commit -m "feat: connect Instagram with OAuth"
```

---

### Task 3: 설정 화면 연결 카드

**Files:**
- Create: `src/components/settings/InstagramConnection.tsx`
- Modify: `src/components/settings/SettingsForm.tsx`
- Create: `tests/unit/InstagramConnection.test.tsx`

**Interfaces:**
- Consumes: `GET /api/instagram/status`, `GET /api/instagram/connect`, `DELETE /api/instagram/connection`
- Produces: `InstagramConnection()` client component

- [ ] **Step 1: Write failing component tests**

```tsx
it("offers connection without exposing credentials", async () => {
  mockStatus({connected:false});
  render(<InstagramConnection/>);
  expect(await screen.findByRole("link",{name:"Instagram 연결"})).toHaveAttribute("href","/api/instagram/connect");
  expect(document.body.textContent).not.toMatch(/access.?token|app.?secret/i);
});

it("shows the connected account and requires confirmation before disconnecting", async () => {
  mockStatus({connected:true,username:"mukdong",expiresAt:"2026-10-01T00:00:00.000Z"});
  render(<InstagramConnection/>);
  expect(await screen.findByText("@mukdong 연결됨")).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"연결 해제"}));
  expect(screen.getByRole("button",{name:"정말 연결 해제"})).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/InstagramConnection.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement three connection states**

Render `연결 안 됨`, `@username 연결됨`, or `다시 연결 필요`. Use a normal link for OAuth navigation. Require a second explicit click before DELETE. Add the component below the existing AI connection cards without adding Instagram credentials to `AppSettingsSchema`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/unit/InstagramConnection.test.tsx tests/unit/SettingsForm.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/settings/InstagramConnection.tsx src/components/settings/SettingsForm.tsx tests/unit/InstagramConnection.test.tsx
git commit -m "feat: show Instagram connection status"
```

---

### Task 4: 공개 JPEG 파생본과 서명 URL

**Files:**
- Create: `src/features/instagram/publicMedia.ts`
- Create: `src/app/api/media/public/[draftId]/route.ts`
- Create: `tests/unit/publicMedia.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `createDraftRepository().readDraft(draftId)`
- Produces: `prepareInstagramImage(draft): Promise<Buffer>`
- Produces: `signMediaUrl({draftId,expiresAt,baseUrl,secret}): string`
- Produces: `verifyMediaSignature({draftId,expiresAt,signature,secret}): boolean`

- [ ] **Step 1: Install the one required image dependency**

Run: `npm install sharp`

Expected: `sharp` appears in runtime dependencies.

- [ ] **Step 2: Write failing media tests**

```ts
it("creates a 4:5 JPEG without changing the original", async () => {
  const output=await prepareInstagramImage(draftWithPngDataUrl);
  const metadata=await sharp(output).metadata();
  expect(metadata.format).toBe("jpeg");
  expect(metadata.width! / metadata.height!).toBeCloseTo(4/5,2);
});

it("rejects expired or modified signed media URLs", () => {
  const url=new URL(signMediaUrl(validInput));
  expect(verifyMediaSignature({...validVerification,signature:url.searchParams.get("sig")!})).toBe(true);
  expect(verifyMediaSignature({...validVerification,draftId:crypto.randomUUID(),signature:url.searchParams.get("sig")!})).toBe(false);
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- --run tests/unit/publicMedia.test.ts`

Expected: FAIL because the media helper does not exist.

- [ ] **Step 4: Implement conversion and signed serving**

Decode only validated `data:image/png|jpeg|webp;base64` selected media. Use Sharp `resize(1080,1350,{fit:"cover"}).jpeg({quality:90})`. Sign `draftId.expiresAt` with HMAC-SHA256 and compare signatures with `timingSafeEqual`. The public route returns `image/jpeg`, `Cache-Control: private, max-age=300`; reject expired or invalid signatures with 403.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run tests/unit/publicMedia.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json src/features/instagram/publicMedia.ts src/app/api/media/public tests/unit/publicMedia.test.ts
git commit -m "feat: prepare signed Instagram media"
```

---

### Task 5: 게시 서비스와 중복 방지 API

**Files:**
- Modify: `src/features/instagram/metaClient.ts`
- Create: `src/features/instagram/publish.ts`
- Create: `src/app/api/instagram/publish/route.ts`
- Create: `tests/unit/instagramPublish.test.ts`

**Interfaces:**
- Consumes: connection/publication repositories and `signMediaUrl()`
- Extends: `InstagramMetaClient` with `createImageContainer(input)`, `getContainerStatus(id)`, `publishContainer(id)`
- Produces: `publishApprovedDraft({draftId,approved},deps): Promise<PublicPublicationResult>`

- [ ] **Step 1: Write failing publishing tests**

```ts
it("refuses a request without explicit approval", async () => {
  await expect(publishApprovedDraft({draftId,approved:false},deps)).rejects.toThrow("게시 승인이 필요해요");
  expect(deps.meta.createImageContainer).not.toHaveBeenCalled();
});

it("creates, waits for, and publishes one container", async () => {
  deps.meta.getContainerStatus.mockResolvedValue("FINISHED");
  const result=await publishApprovedDraft({draftId,approved:true},deps);
  expect(deps.meta.createImageContainer).toHaveBeenCalledWith(expect.objectContaining({caption,imageUrl:expect.stringMatching(/^https:\/\//)}));
  expect(deps.meta.publishContainer).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({status:"published",alreadyPublished:false});
});

it("returns the previous result instead of posting twice", async () => {
  deps.repo.readPublication.mockResolvedValue(existingPublished);
  expect(await publishApprovedDraft({draftId,approved:true},deps)).toMatchObject({alreadyPublished:true});
  expect(deps.meta.createImageContainer).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/instagramPublish.test.ts`

Expected: FAIL because the publishing service does not exist.

- [ ] **Step 3: Implement the coordinator**

Validate approval, connection expiry, draft completeness, HTTPS public base URL, and previous publication before Meta calls. Save `preparing` before container creation. Poll status at bounded intervals supplied through dependencies; accept only `FINISHED`, stop on `ERROR` or `EXPIRED`, and cap attempts at five. Save `published` only after `media_publish` returns a media ID. Map auth, permission, media fetch, rate limit, and processing errors to Korean safe messages.

- [ ] **Step 4: Implement the route boundary**

`POST /api/instagram/publish` accepts only `{draftId: UUID, approved: true}`. Return 409 for an in-progress publication, the existing success for a duplicate, 400 for an incomplete draft, 401 for reconnect-required, and 502 for safe Meta failures. Never serialize caught SDK errors.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run tests/unit/instagramPublish.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/instagram/metaClient.ts src/features/instagram/publish.ts src/app/api/instagram/publish tests/unit/instagramPublish.test.ts
git commit -m "feat: publish approved Instagram drafts"
```

---

### Task 6: 최종 확인 화면의 명시적 승인 게시

**Files:**
- Create: `src/components/review/InstagramPublish.tsx`
- Modify: `src/components/wizard/DraftWizard.tsx`
- Create: `tests/unit/InstagramPublish.test.tsx`
- Modify: `tests/e2e/instagram-publish.spec.ts`

**Interfaces:**
- Consumes: `GET /api/instagram/status`, `POST /api/instagram/publish`
- Produces: `InstagramPublish({draftId,caption,imageUrl})`

- [ ] **Step 1: Write failing UI tests**

```tsx
it("does not offer posting while disconnected", async () => {
  mockStatus({connected:false});
  render(<InstagramPublish draftId={draftId} caption="문안" imageUrl={image}/>);
  expect(await screen.findByRole("link",{name:"Instagram 연결하기"})).toHaveAttribute("href","/settings");
  expect(screen.queryByRole("button",{name:/게시/})).not.toBeInTheDocument();
});

it("posts only after the explicit approval click", async () => {
  mockStatus({connected:true,username:"mukdong"});
  render(<InstagramPublish draftId={draftId} caption="문안" imageUrl={image}/>);
  expect(fetch).not.toHaveBeenCalledWith("/api/instagram/publish",expect.anything());
  fireEvent.click(await screen.findByRole("button",{name:"승인하고 Instagram에 게시"}));
  expect(fetch).toHaveBeenCalledWith("/api/instagram/publish",expect.objectContaining({method:"POST"}));
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/InstagramPublish.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the approval panel**

Show target `@username`, the existing preview image, and the first 80 caption characters. Render one destructive-looking primary action with explanatory copy: `이 버튼을 눌러야 실제 게시됩니다.` Disable it while preparing/publishing. Show `게시 준비 중`, `Instagram에서 처리 중`, `게시 완료`, or the safe error. On success, remove the active button and show the media ID without linking to an unverified permalink.

- [ ] **Step 4: Mount it after existing export actions**

Pass the existing `draftId`, `caption`, and `image.preview` from `DraftWizard` review step. Keep image download, copy, ZIP download, and backward navigation unchanged.

- [ ] **Step 5: Add a no-network E2E flow**

Intercept status and publish endpoints in `tests/e2e/instagram-publish.spec.ts`. Verify both desktop and mobile show the account summary, make zero publish requests before the click, make exactly one after the click, and show completion. Do not contact Meta.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- --run tests/unit/InstagramPublish.test.tsx tests/unit/DraftWizard.test.tsx`

Run: `npx playwright test tests/e2e/instagram-publish.spec.ts`

Expected: unit and desktop/mobile E2E tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/review/InstagramPublish.tsx src/components/wizard/DraftWizard.tsx tests/unit/InstagramPublish.test.tsx tests/e2e/instagram-publish.spec.ts
git commit -m "feat: add explicit Instagram publish approval"
```

---

### Task 7: 운영 문서와 전체 검증

**Files:**
- Modify: `README.md`
- Modify: `tests/e2e/error-states.spec.ts`

**Interfaces:**
- Consumes: all earlier tasks
- Produces: safe setup instructions and final regression proof

- [ ] **Step 1: Document Meta setup without secret values**

Add steps for creating a Meta app, selecting Instagram Login, setting the exact redirect URI, requesting the two scopes, adding the professional test account, generating `MEDIA_SIGNING_SECRET`, and placing values only in `.env.local`. State that localhost proves OAuth/UI but cannot prove Meta media fetch; `MEDIA_PUBLIC_BASE_URL` must be deployed HTTPS for real posting.

- [ ] **Step 2: Expand error-state E2E coverage**

Mock disconnected, expired token, denied OAuth, invalid media signature, and Meta publish failure. Assert the completed draft and download buttons remain available in every case.

- [ ] **Step 3: Run all automated gates**

Run:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected: all commands exit 0; no test contacts Meta, Gemini, or OpenAI.

- [ ] **Step 4: Run the activation checklist without posting**

Verify the Instagram account is professional, rotated AI keys are present only in `.env.local`, Meta app credentials exist, redirect URI matches exactly, requested scopes are approved for the test account, deployed HTTPS base URL is reachable, and the signed media URL returns JPEG without authentication cookies.

- [ ] **Step 5: Perform one user-approved live smoke post**

Only after the user explicitly approves the exact test image, caption, target account, and immediate post action: connect the test account, publish once, verify the returned media ID, and confirm the post in Instagram. If any prerequisite is missing, report it and do not post.

- [ ] **Step 6: Commit documentation**

```powershell
git add README.md tests/e2e/error-states.spec.ts
git commit -m "docs: add Instagram activation runbook"
```

---

## Stop Condition

Stop when Tasks 1–7 pass and the app supports safe Instagram connection plus explicit approval publishing. Do not add scheduling until one live smoke post succeeds and the user separately approves the scheduling phase.
