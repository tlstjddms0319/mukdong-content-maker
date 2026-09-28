# Free image cards implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Owner can register reusable assets, select relevant photos, compose free cards and use them in the existing draft/export flow without image-generation providers.

**Architecture:** Add a free editor alongside existing ImageStudio modes. Store asset metadata and display previews using the existing local/remote storage pattern. Use installed Sharp and bundled Korean fonts for three templates; render requests reference stored UUIDs only. Keep all current uncommitted work.

**Tech Stack:** Existing Next.js route handlers, React, Zod, Sharp, filesystem/remoteStore, Vitest, Playwright. No new dependencies.

**Spec:** docs/FREE_IMAGE_STRATEGY.ko.md, approved by the user's “진행해보자”.

## Constraints

- No paid image-generation calls or new external connections.
- Typography is rendered locally; assets retain original source categories.
- Topic/metadata matching is keyword based and must not claim image understanding.
- Missing relevant photos produce a text card rather than an unrelated food photo.
- One card at a time can be edited and composed, up to ten cards collected for a post. Existing AI carousel configuration is unchanged.
- No deployment or publication. New source `design` must save/restore/export and must not trigger AI-image disclosure.

## Review focus

- Invalid image contents, huge files, non-UUID paths, owner authentication.
- Empty library, unrelated tags, two-photo comparison with too few images.
- Long Korean headings, reserved XML characters, missing/incorrect source disclosure.
- Changing card text or selected images invalidates prior preview; failed requests preserve completed cards.
- Design and AI-derived cards retain correct provenance across draft/copy/export boundaries.

## Tasks

- [x] Write failing tests for asset ranking, actual image validation, render dimensions/provenance/fallback, and authenticated routes.
- [x] Implement `src/features/images/freeCards.ts`, `assetLibrary.ts`, `renderFreeCard.ts`, `/api/images/assets`, `/api/images/compose` using existing storage and typography tools.
- [x] Add `FreeCardStudio.tsx`, wire ImageStudio and new `design` source into draft/export/copy. Keep other modes intact.
- [x] Verify editor invalidation and queue behavior with focused unit tests.
- [x] Run full unit tests, lint, TypeScript. Run authenticated local browser tests with no provider keys; inspect desktop/mobile and actual rendered cards.
- [x] Update operation guide, mark completed tasks and report limitations. Do not commit unrelated pre-existing changes.

## Verification (2026-09-28, Claude Code)

- Codex의 2026-09-27 마지막 실행은 사용량 한도로 끊겨 `tests/e2e/free-cards.spec.ts` 실패(desktop·mobile 60초 타임아웃)를 확인하지 못했다. 원인: DraftWizard는 POST /api/drafts 응답 본문(카드 미리보기 base64 ≈ 350KB 에코)을 읽지 않으므로 Chromium이 응답을 완료로 표시하지 않았고, 스펙의 `response.json()`이 무한 대기했다. 스펙을 요청 페이로드 + `GET /api/drafts?id` 조회로 바꿨다(앱 코드 변경 없음).
- 단위 테스트 `npm test`: 52 파일 236개 통과. `npm run lint`: 통과. `npx tsc --noEmit`: 통과.
- E2E `npx playwright test`: 28/28 통과(desktop·mobile), free-cards 단독 실행 2/2 통과.
- 한계: 실제 Gemini 문안 생성 품질과 실제 사진으로 만든 카드의 시각 품질은 여전히 사용자 확인이 필요하다. POST /api/drafts가 클라이언트가 사용하지 않는 미리보기 전체를 되돌려주는 비효율은 후속 과제로 남긴다.
