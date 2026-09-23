# 1인 관리자 로그인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자 1명만 초안 제작 화면과 API를 사용하도록 보호하고, 기존 Instagram 콜백·서명 미디어·게시 승인 흐름을 유지한다.

**Architecture:** Auth.js Credentials로 고정 관리자 1명의 8시간 세션을 발급한다. Next.js Proxy는 화면 이동을 돕고, 서버 페이지와 모든 비공개 Route Handler는 공통 서버 가드로 다시 검사한다. Instagram OAuth 콜백과 서명 미디어만 기존 검증을 조건으로 익명 접근을 허용한다.

**Tech Stack:** 현재 프로젝트의 Next.js 16.3.4, React, TypeScript, Node `crypto`, Auth.js (`next-auth@beta`, 설치 후 잠금 파일에서 실제 버전 고정), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-owner-access-design.md`

## Global Constraints

- 관리자 1명만 사용한다. 가입, 직원 계정, 암호 재설정 메일, 예약·자동 게시를 만들지 않는다.
- 현재 초안 데이터와 명시적인 Instagram 게시 승인 조건을 변경·삭제하지 않는다.
- 설정이 없으면 fail-closed: 보호 API `503`, 로그인 화면은 설정 필요 안내. 익명 사용 모드 없음.
- 세션은 최대 8시간. 암호 원문은 파일·명령 기록·로그에 저장하지 않는다. `OWNER_PASSWORD_HASH`와 `AUTH_SECRET`은 서버 환경변수에만 둔다.
- 익명 예외는 로그인 경로, 정적 자산, 검증된 `/api/instagram/callback`, 서명·만료가 유효한 `/api/media/public/[draftId]`뿐이다.
- 외부 공개 완료 조건은 HTTPS와 진입점 요청 제한 확인이다. 로컬 테스트 성공만으로 배포 완료라고 하지 않는다.
- 현재 작업 폴더는 다른 변경사항이 많다. 작업 시작 시 `git status --short`를 확인하고 관련 파일만 수정한다. `.git`이 쓰기 금지이면 첫 실패 뒤 재시도하지 않고 변경 목록을 보고한다.

---

## File map

| 책임 | 파일 |
|---|---|
| 암호 해시·설정·실패 제한 | 새 `src/features/auth/password.ts`, `config.ts`, `attempts.ts`; 새 `scripts/setup-owner-password.ps1`, `scripts/hash-owner-password.mjs`; 새 `tests/unit/ownerAuth.test.ts` |
| 세션·로그인·로그아웃·선행 리다이렉트 | 새 `src/auth.ts`, `src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`, `src/features/auth/actions.ts`, `routes.ts`; 수정 `src/components/wizard/WizardShell.tsx`, `src/app/globals.css`; 새 `tests/unit/ownerAccess.test.ts` |
| 페이지와 API 본인 확인 | 새 `src/features/auth/guard.ts`; 수정 `src/app/page.tsx`, `drafts/page.tsx`, `settings/page.tsx`와 아래 Task 3의 13개 보호 Route Handler; 관련 기존 단위 테스트 |
| 공개 예외 회귀 | 기존 `src/app/api/instagram/callback/route.ts`, `src/app/api/media/public/[draftId]/route.ts`, `src/features/instagram/publish.ts`; 새 `tests/unit/ownerExceptions.test.ts` 및 기존 공개 미디어·게시 테스트 |
| 실제 브라우저와 운영 안내 | 수정 `playwright.config.ts`, `tests/e2e/*.spec.ts`, `.env.example`, `README.md`; 새 `tests/e2e/owner-login.spec.ts`, `tests/e2e/helpers.ts` |

## Task 1: 관리자 암호와 설정을 검증 가능하게 만들기

**Files:** Create `src/features/auth/password.ts`, `config.ts`, `attempts.ts`, `scripts/setup-owner-password.ps1`, `scripts/hash-owner-password.mjs`, `tests/unit/ownerAuth.test.ts`; modify `.env.example`.

**Interfaces:** `isOwnerConfigured(env?: NodeJS.ProcessEnv): boolean`; `verifyOwnerPassword(input: string, encoded: string): Promise<boolean>`; `recordLoginAttempt(key: string, accepted: boolean, now?: number): { blocked: boolean }`. 해시 형식은 `scrypt:<base64url salt>:<base64url digest>`로 고정한다. scrypt 파라미터는 Node 기본값, 64바이트 출력으로 고정하고 비교에는 `timingSafeEqual`을 쓴다.

- [ ] **Step 1: 실패하는 단위 테스트 작성.** 올바른 해시 통과, 틀린 암호·깨진 해시 실패, 키 또는 해시 누락 시 `isOwnerConfigured=false`, 동일 키의 5회 실패 후 15분 제한과 시간 경과 후 해제를 각각 검사한다.

```ts
expect(await verifyOwnerPassword("owner-pass", encoded)).toBe(true);
expect(await verifyOwnerPassword("wrong", encoded)).toBe(false);
expect(isOwnerConfigured({ AUTH_SECRET:"x".repeat(32) } as NodeJS.ProcessEnv)).toBe(false);
expect(recordLoginAttempt("owner", false, 0).blocked).toBe(false);
```

- [ ] **Step 2: 실패 확인.** `npm test -- tests/unit/ownerAuth.test.ts` → 모듈 미존재로 FAIL.
- [ ] **Step 3: 최소 구현.** `scrypt`/`timingSafeEqual`과 해시 형식 검사, 모듈 내부 `Map` 기반 5회/15분 제한을 구현한다. 차단 중 맞는 암호를 입력해도 차단을 풀지 않고, 기간이 지난 뒤에만 다시 시도할 수 있게 한다. 이는 단일 프로세스 보조 제한일 뿐이므로 외부 진입점 제한을 Task 5의 배포 조건으로 남긴다. `scripts/setup-owner-password.ps1`은 `Read-Host -AsSecureString`으로 암호를 가려 받고, 원문을 명령 인수가 아닌 표준 입력으로 `scripts/hash-owner-password.mjs`에 전달한다. Node 스크립트는 32바이트 salt와 64바이트 digest로 위 형식의 해시와 별도 `AUTH_SECRET`을 출력한다. PowerShell은 BSTR 사용 뒤 `ZeroFreeBSTR`로 메모리를 정리한다.

```ts
const [kind, salt, digest] = encoded.split(":");
if (kind !== "scrypt" || !salt || !digest) return false;
const expected = Buffer.from(digest, "base64url");
const actual = await scryptAsync(input, Buffer.from(salt, "base64url"), 64);
return expected.length === actual.length && timingSafeEqual(expected, actual);
```

설정 스크립트는 다음처럼 화면에 암호가 보이지 않게 받고, 명령 인수가 아닌 표준 입력으로 Node 해시 스크립트에 전달한다. Node 스크립트는 마지막 줄바꿈 하나만 제거하고 `randomBytes(32)` 및 `scryptSync(password, salt, 64)`로 값을 만든다.

```powershell
$secure = Read-Host '관리자 암호' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $OutputEncoding = New-Object System.Text.UTF8Encoding $false
  $plain | node scripts/hash-owner-password.mjs
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable plain -ErrorAction SilentlyContinue
}
```

- [ ] **Step 4: 통과 확인.** `npm test -- tests/unit/ownerAuth.test.ts` → PASS. `.env.example`에는 `OWNER_PASSWORD_HASH=` 및 `AUTH_SECRET=` 빈 항목과 `./scripts/setup-owner-password.ps1` 실행 안내만 추가하고 실제 값은 넣지 않는다.
- [ ] **Step 5: 작업 파일만 커밋 시도.** `git add -- src/features/auth/password.ts src/features/auth/config.ts src/features/auth/attempts.ts scripts/setup-owner-password.ps1 scripts/hash-owner-password.mjs tests/unit/ownerAuth.test.ts .env.example` 후 `git commit -m "feat: validate single owner credentials"`. `.git` 권한이 거부되면 다른 파일을 건드리지 않고 기록한다.

## Task 2: 로그인, 세션, 로그아웃 화면

**Files:** Create `src/auth.ts`, `src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`, `src/features/auth/actions.ts`, `src/features/auth/routes.ts`, `tests/unit/ownerAccess.test.ts`; modify `package.json`, `package-lock.json`, `src/components/wizard/WizardShell.tsx`, `src/app/globals.css`.

**Interfaces:** `src/auth.ts` exports Auth.js `auth`, `handlers`, `signIn`, `signOut`. Credentials `authorize` only returns `{ id: "owner", name: "관리자" }` after Task 1 checks. `src/features/auth/actions.ts` exports `login(formData: FormData): Promise<void>` and `logout(): Promise<void>`. `safeReturnPath(value: string | null): string` allows only a local `/...` path and defaults to `/`. `src/features/auth/routes.ts` exports `isPublicException(pathname: string): boolean` for the OAuth callback and signed media paths.

- [ ] **Step 1: 실패하는 테스트 작성.** `safeReturnPath("/drafts")`는 `/drafts`, `safeReturnPath("//evil.example")`와 외부 URL은 `/`; 설정 누락 때 로그인 페이지에 설정 안내; 익명 페이지는 `/login?next=...`로 이동; 로그아웃 버튼은 shell에 표시되는지 검사한다.

```ts
expect(safeReturnPath("/drafts")).toBe("/drafts");
expect(safeReturnPath("//evil.example")).toBe("/");
expect(safeReturnPath("https://evil.example")).toBe("/");
```

- [ ] **Step 2: 실패 확인.** `npm test -- tests/unit/ownerAccess.test.ts` → 모듈 미존재로 FAIL.
- [ ] **Step 3: Auth.js 설치·구현.** `npm install next-auth@beta` 후 설치된 버전과 Next 16.3.4의 `npm run build` 호환성을 먼저 확인한다. `src/auth.ts`에 Credentials, `session: { strategy:"jwt", maxAge: 8*60*60 }`, 서버 비밀키를 설정한다. 설정이 없으면 `authorize`가 항상 거절한다. `src/app/api/auth/[...nextauth]/route.ts`는 설정 누락 시 `503`, 그 외 `handlers`를 반환한다. 로그인 Server Action은 `AuthError`만 일반 오류 안내로 바꾸고 성공하면 내부 경로로 이동한다. 로그아웃은 `signOut({ redirectTo:"/login" })`을 호출한다.

```ts
export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [Credentials({ credentials: { password: {} }, authorize: async (values) => {
    if (!isOwnerConfigured() || typeof values.password !== "string") return null;
    const accepted = await verifyOwnerPassword(values.password, process.env.OWNER_PASSWORD_HASH!);
    if (recordLoginAttempt("owner", accepted).blocked || !accepted) return null;
    return { id: "owner", name: "관리자" };
  } })],
});
```

`src/proxy.ts`는 정적 자산, `/login`, `/api/auth/*`, `isPublicException`에 해당하는 경로를 제외한 화면 요청만 선행 리다이렉트한다. API 거절은 Task 3의 서버 가드가 담당한다. `WizardShell`에 `로그아웃` 버튼을 추가하고 로그인 화면은 기존 스타일 토큰으로 간결하게 만든다. 세션 쿠키의 `HttpOnly`·`SameSite=Lax` 및 HTTPS `Secure` 여부는 브라우저에서 확인한다.

```ts
export function safeReturnPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}
export function isPublicException(pathname: string): boolean {
  return pathname === "/api/instagram/callback" || /^\/api\/media\/public\/[^/]+$/.test(pathname);
}
```

- [ ] **Step 4: 단위·빌드 통과 확인.** `npm test -- tests/unit/ownerAccess.test.ts`, `npm run build` → PASS. 빌드 오류가 Auth.js/Next 호환성에서 나면 이 Task를 완료로 표시하지 않는다.
- [ ] **Step 5: 작업 파일만 커밋 시도.** `git add -- package.json package-lock.json src/auth.ts src/proxy.ts src/app/api/auth src/app/login src/features/auth/actions.ts src/features/auth/routes.ts src/components/wizard/WizardShell.tsx src/app/globals.css tests/unit/ownerAccess.test.ts` 후 `git commit -m "feat: add owner login session"`.

## Task 3: 모든 비공개 화면과 API를 서버에서 보호

**Files:** Create `src/features/auth/guard.ts`, `tests/unit/ownerGuard.test.ts`; modify `src/app/page.tsx`, `src/app/drafts/page.tsx`, `src/app/settings/page.tsx`, `src/app/api/topics/route.ts`, `src/app/api/images/{analyze,plan,generate}/route.ts`, `src/app/api/copy/route.ts`, `src/app/api/media/upload/route.ts`, `src/app/api/drafts/route.ts`, `src/app/api/export/[draftId]/route.ts`, `src/app/api/settings/route.ts`, `src/app/api/instagram/{connect,connection,status,publish}/route.ts`; update any existing direct-route unit tests to mock a valid owner session explicitly.

**Interfaces:** `ownerApiError(): Promise<NextResponse | null>` returns `503` when setup is absent, `401` when no owner session, otherwise `null`; `requireOwnerPage(): Promise<void>` redirects to `/login` before server data reads. Both use Task 2's `auth()` and Task 1's `isOwnerConfigured()`.

- [ ] **Step 1: 실패하는 API 가드 테스트 작성.** 익명 `GET /api/drafts?id=...`와 `POST /api/instagram/publish`가 본문 처리·저장·Meta 요청 전에 `401`; 설정 누락은 `503`; 정상 세션이면 가드가 `null`을 반환하는지 확인한다. `/drafts`의 저장소 목록 조회보다 `requireOwnerPage()`가 먼저 호출되는지도 검사한다.

```ts
expect((await ownerApiError())?.status).toBe(401);
expect((await ownerApiError())?.headers.get("Cache-Control")).toBe("no-store");
```

- [ ] **Step 2: 실패 확인.** `npm test -- tests/unit/ownerGuard.test.ts` → 모듈 미존재 또는 익명 요청 허용으로 FAIL.
- [ ] **Step 3: 가드 구현과 모든 진입점 적용.** 각 보호 Route Handler의 첫 실행문에서 `const denied=await ownerApiError(); if(denied)return denied;`을 호출한다. 페이지는 설정·초안 저장소를 읽기 전 `await requireOwnerPage()`를 호출한다. `ownerApiError` 응답과 초안·설정 JSON 응답에 `Cache-Control: no-store`를 사용한다. 새 API 추가 시 이 가드가 기본이라는 주석을 `guard.ts`에 남긴다.

```ts
export async function POST(request: Request) {
  const denied = await ownerApiError();
  if (denied) return denied;
  // 기존 본문 검증과 비즈니스 동작은 그대로 둔다.
}
```

- [ ] **Step 4: 회귀 확인.** `npm test -- tests/unit/ownerGuard.test.ts tests/unit/draftRoute.test.ts tests/unit/topicRoute.test.ts tests/unit/instagramStatusRoute.test.ts`, `npm run lint`, `npm run build` → PASS. 기존 단위 테스트는 `auth()`만 모킹해 실제 비즈니스 검증을 계속 실행하게 한다.
- [ ] **Step 5: 작업 파일만 커밋 시도.** 위 가드·페이지·Route Handler·관련 테스트만 `git add -- <명시 파일들>`로 스테이징해 `git commit -m "feat: guard draft and publishing routes"`.

## Task 4: 두 공개 예외와 게시 승인 회귀

**Files:** Create `tests/unit/ownerExceptions.test.ts`; inspect `src/app/api/instagram/callback/route.ts`, `src/app/api/media/public/[draftId]/route.ts`, `src/features/instagram/publish.ts`, `src/features/auth/routes.ts`; modify them only if the tests reveal a regression.

**Interfaces:** 기존 `completeInstagramOAuth`의 state 비교, `verifyMediaSignature`, `publishApprovedDraft`의 `approved:true` 조건을 변경하지 않는다. Proxy의 예외 목록과 서버 가드의 보호 목록을 검증한다.

- [ ] **Step 1: 회귀 테스트 작성.** 로그아웃 상태에서도 올바른 OAuth state 콜백과 유효한 서명 미디어는 해당 기존 로직까지 도달한다. 잘못된 state, 만료·변조 서명은 실패한다. 연결 시작은 `401`, `approved`가 없거나 false인 게시 요청은 기존 승인 오류를 유지한다.

```ts
expect(isPublicException("/api/instagram/callback")).toBe(true);
expect(isPublicException("/api/media/public/known-draft")).toBe(true);
expect(isPublicException("/api/instagram/publish")).toBe(false);
```

- [ ] **Step 2: 실패 확인.** `npm test -- tests/unit/ownerExceptions.test.ts` → 보호·예외 경로를 구분하는 신규 회귀 테스트가 FAIL. 이미 테스트가 통과한다면 기능 코드는 바꾸지 않는다.
- [ ] **Step 3: 필요한 최소 수정.** Task 2의 `src/features/auth/routes.ts`에는 경로 2개만 명시한다. Proxy가 이를 사용한다. 공개 핸들러 안의 state·서명 검증을 유지한다. 보호된 연결 시작/게시 경로에서 인증 검사가 승인·Meta 호출보다 먼저 실행되도록 보정한다.

```ts
export function isPublicException(pathname: string) {
  return pathname === "/api/instagram/callback" || /^\/api\/media\/public\/[^/]+$/.test(pathname);
}
```

- [ ] **Step 4: 관련 테스트 통과 확인.** `npm test -- tests/unit/ownerExceptions.test.ts tests/unit/publicMediaRoute.test.ts tests/unit/instagramOAuth.test.ts tests/unit/instagramPublish.test.ts` → PASS.
- [ ] **Step 5: 작업 파일만 커밋 시도.** 새 테스트와 실제 수정한 예외·게시 파일만 스테이징해 `git commit -m "test: preserve public media and approved publishing"`.

## Task 5: 사용자 안내와 실제 브라우저 검증

**Files:** Modify `playwright.config.ts`, `tests/e2e/draft-flow.spec.ts`, `tests/e2e/error-states.spec.ts`, `tests/e2e/saved-drafts.spec.ts`, `README.md`; create `tests/e2e/owner-login.spec.ts`, `tests/e2e/helpers.ts`.

**Interfaces:** 테스트 전용 관리자 암호와 해시는 Playwright webServer의 프로세스 환경변수로만 넣는다. 기존 사용자의 `.env.local`은 읽거나 덮어쓰지 않는다. 테스트 서버는 현재 사용 중인 3000번 대신 3001번을 쓰고 기존 서버를 재사용하지 않는다.

- [ ] **Step 1: 실패하는 E2E 작성.** 익명 `/drafts`가 로그인으로 이동, 로그인 성공 후 `/drafts`로 복귀, 잘못된 암호 실패, `/api/drafts` 직접 접근 `401`, 로그아웃 후 재접근 차단, 모바일 로그인 표시를 검사한다. 기존 세 흐름 테스트에는 `loginAsOwner(page)` 헬퍼를 첫 단계로 넣는다.

```ts
await page.goto("/drafts");
await expect(page).toHaveURL(/\/login\?next=/);
await page.getByLabel("관리자 암호").fill("test-owner-password");
await page.getByRole("button", { name: "로그인" }).click();
await expect(page).toHaveURL(/\/drafts$/);
```

- [ ] **Step 2: 실패 확인.** `npm run test:e2e -- owner-login.spec.ts` → 로그인 기능이 없거나 테스트 서버 설정이 없어 FAIL.
- [ ] **Step 3: 테스트 환경·운영 안내 구현.** `playwright.config.ts`의 webServer를 `npm run dev -- -p 3001`, `baseURL`을 `http://127.0.0.1:3001`로 바꾸고 고정 테스트 전용 비밀키와 암호 해시를 환경변수로 전달한다. `tests/e2e/helpers.ts`는 `loginAsOwner(page)`를 내보내며 `/login`에서 테스트 암호를 입력한다. `README.md`에 설정 스크립트 실행, 출력 값을 `.env.local`/배포 환경변수에 저장, 앱 재시작, 로그아웃·비밀키 교체, 공개 전 HTTPS·진입점 요청 제한 확인을 한국어로 적는다. 실암호나 실제 해시를 예제로 넣지 않는다.

```ts
import { scryptSync } from "node:crypto";
const salt = Buffer.from("test-owner-salt-2026");
webServer: { command: "npm run dev -- -p 3001", url: "http://127.0.0.1:3001/login", reuseExistingServer: false,
  env: { AUTH_SECRET: "test-only-auth-secret-32-chars-minimum", OWNER_PASSWORD_HASH: `scrypt:${salt.toString("base64url")}:${scryptSync("test-owner-password", salt, 64).toString("base64url")}` } },
use: { baseURL: "http://127.0.0.1:3001" },
```

- [ ] **Step 4: 전체 검증.** `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` → 모두 PASS. 앱이 3000번에서 이미 실행 중이라면 건드리지 않는다. 사용자 실제 공개 URL 검증은 HTTPS·진입점 제한이 준비된 뒤 별도로 수행하고, 준비 전에는 완료로 표시하지 않는다.
- [ ] **Step 5: 작업 파일만 커밋 시도.** 관련 설정·E2E·README만 스테이징해 `git commit -m "docs: verify owner login setup"`. `git status --short`로 다른 작업 변경이 보존되었는지 확인한다.

## Self-review gate

- 설계서의 설정 누락, 암호 원문 보호, 8시간 세션, 화면/API 이중 검사, OAuth·미디어 예외, 게시 승인, 외부 진입점 제한이 각각 Task 1–5에 대응하는지 확인한다.
- 미정 단계나 후속 구현에 맡기는 빈 지시가 없는지 문서를 다시 읽는다.
- 구현 중 Auth.js와 Next 16.3.4가 호환되지 않으면 우회 세션을 즉석에서 만들지 않고 의존성 결정을 다시 검토한다.
