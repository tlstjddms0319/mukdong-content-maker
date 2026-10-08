# 인수인계서: Higgsfield로 카드 템플릿 작업 이어 가기

새 세션이 이 문서만 읽고 바로 이어서 일할 수 있도록 정리한 문서다. 2026-10-01 기준.

## 0. 새 세션을 시작하기 전에 사람이 할 일

1. **Higgsfield 연결.** 둘 중 하나.
   - claude.ai의 커넥터 설정(https://claude.ai/customize/connectors)에서 Higgsfield MCP를 연결하고 새 세션을 연다. 커넥터는 세션 시작 때만 읽힌다.
   - API 키 방식이면 작업 환경의 비밀값에 `HF_API_KEY_ID`, `HF_API_KEY_SECRET`를 넣는다. 채팅에 키를 붙이지 않는다.
2. **네트워크 허용 목록**에 아래 도메인을 추가한다. 이 세션에서는 둘 다 막혀 있었다.
   - `api.higgsfield.ai` (이미지 생성 API)
   - `mukdong-content-maker-0319.onrender.com` (배포된 앱 확인용)
3. **브랜치.** 작업은 `claude/sharp-brown-nmlojn`에 있고 아직 master에 머지되지 않았다. 새 세션은 이 브랜치를 체크아웃해서 시작한다.
   ```
   git fetch origin claude/sharp-brown-nmlojn
   git checkout claude/sharp-brown-nmlojn
   ```

## 1. 프로젝트 한 줄 요약

묵동홍어마을(서울 중랑구 묵동의 홍어 식당)의 Instagram 캐러셀을 만드는 Next.js 앱. 주제를 넣으면 텍스트 AI가 슬라이드 구성안(문안·장면·디자인)을 만들고, 이미지 AI가 글자 없는 사진을 만들고, 서버 코드가 사진 위에 한글을 찍어 카드를 완성한다. Instagram 자동 게시까지 붙어 있다.

- 배포: Render 무료 플랜, 서비스 이름 `mukdong-content-maker-0319`, 주소 `https://mukdong-content-maker-0319.onrender.com`. master에 푸시하면 자동 재배포된다.
- Instagram: 프로페셔널 계정 `@pssy71633` 연결 완료. Meta 앱은 "Instagram API로 메시지 및 콘텐츠 관리" 사용 사례로 새로 만들었다.
- Render 환경변수: Instagram 관련 6개, OpenAI·Gemini 키, Higgsfield 키(`HF_API_KEY_ID`, `HF_API_KEY_SECRET`)가 들어 있다. Supabase는 사용자가 넣었는지 확인하지 못했다. 없으면 Instagram 연결 정보가 재배포 때 지워질 수 있다.

## 2. 현재 브랜치 상태

master 최신 커밋: `99134d7` (PR #2 머지: Instagram 로그인 복귀 주소 수정 + Higgsfield 이미지 생성).

브랜치에만 있는 커밋(아래에서 위로 쌓임):

| 커밋 | 내용 |
|---|---|
| `d6e3000` | 구성안 프롬프트를 한 편의 이야기로 재작성, 표지 후보 구도 다양화, AI 실패 시 알림, Pretendard 글꼴과 카드 위계 |
| `5a83870` | AI가 색 조합과 장별 레이아웃을 고르는 디자인 명세 구조 |
| `c29e768` | 사장님이 준 다섯 스타일(풀스크린·대조 프레임·일러스트·콜라주·브라우저)로 레이아웃 교체 |
| `8668b96` | 다섯 스타일 추가(대형 숫자·A vs B·단계·Q&A·인용구) |
| `994e938` | Q&A 형광펜 위치 보정 |

검사 상태: 단위 테스트 332개 통과. `tests/unit/ownerSetupScript.test.ts` 하나는 `powershell.exe`가 필요해 Linux 환경에서는 항상 실패한다(코드 문제 아님). `npx tsc --noEmit`, `npx eslint src tests` 통과.

## 3. 콘텐츠 파이프라인 지도

| 단계 | 파일 | 역할 |
|---|---|---|
| 구성안 | `src/features/images/carousel.ts` | 슬라이드 스키마, 역할 순서, 준비 문안(fallback), 구성안 프롬프트 `buildCarouselPlanPrompt`, `normalizeCarouselDesign` |
| 구성안 API | `src/app/api/images/plan/route.ts` | 텍스트 AI 호출 → `guardSlidePoints` → 응답. AI 실패 시 `provider:"fallback"` |
| 요점 검열 | `src/features/images/slidePoints.ts` | 제목 반복·확인 필요한 수치(가격 등)가 든 요점과 figure 제거 |
| 디자인 선택지 | `src/features/images/design.ts` | 색 조합 6개, 레이아웃 10개, 역할별 기본 레이아웃, `normalizeCardLayout`, `photosNeeded`, `designCatalogText` |
| 이미지 프롬프트 | `src/features/images/openaiRequest.ts` | `buildImagePrompt`, 후보별 구도 `CANDIDATE_VARIANTS`·`candidateBriefs`, 참고 이미지 지시, 레이아웃별 `photoHint` 삽입 |
| 이미지 제공자 | `higgsfieldRequest.ts`, `cloudflareRequest.ts`, OpenAI는 generate 라우트 안 | 자동 순서: Higgsfield → Cloudflare → OpenAI |
| 이미지 API | `src/app/api/images/generate/route.ts` | 제공자 체인, 사진 0장 레이아웃은 생성 생략, 여러 장 레이아웃은 한 카드로 합성 |
| 카드 합성 | `src/features/images/composeSlide.ts` | 레이아웃 10개 렌더러, Pretendard 글꼴, 띄어쓰기에서만 줄바꿈 |
| 생성 흐름(클라이언트) | `src/features/images/generationStore.ts` | 구성안 → 표지 후보 2장 → 나머지 장. 모듈 싱글턴이라 화면 이동 중에도 계속 돈다 |
| 캡션 | `src/features/copy/writing.ts`, `src/app/api/copy/route.ts` | 슬라이드 제목 순서(`slideOutline`)를 받아 같은 이야기 흐름으로 쓴다 |
| 글꼴 | `assets/fonts/Pretendard-{Bold,SemiBold,Regular}.otf` | OFL 라이선스 동봉 |

슬라이드 한 장의 데이터(`CarouselSlidePlanSchema`): `role`, `headline`, `points`(0~4줄, 각 40자 이내), `visualPrompt`, `textPosition`, `layout`, `keywords`(0~3개), `figure`(대형 숫자용, 없으면 빈 문자열). 구성안 전체에는 `design.palette`가 있다.

**엄격 JSON 스키마 주의.** Groq·Cloudflare는 선택(optional) 필드를 허용하지 않는다. AI가 내는 스키마에 필드를 더할 때는 반드시 필수로 두고, 없을 때 값(빈 문자열·빈 배열)을 정한다. 테스트 픽스처(`tests/unit/*.test.ts*`의 slide 객체)에도 필드를 함께 추가해야 한다.

## 4. 레이아웃 10개와 사진 장수

| id | 이름 | 사진 | 표지 가능 | 비고 |
|---|---|---|---|---|
| `fullscreen` | 감성 풀스크린 | 1 | O | 표지 기본. 위 오른쪽 가게 이름, 아래 가운데 흰 제목 |
| `frame` | 대조 프레임 | 1 | O | 같은 사진을 흐리게 깔고 흰 테두리 프레임에 선명한 장면 |
| `illustration` | 일러스트 설명 | 1 | X | 파스텔 배경, 기울어진 흰 카드, 마지막 요점이 노란 말풍선 |
| `collage` | 사진 콜라주 | 3 | X | 세 장 격자 + 키워드 해시태그 알약 |
| `browser` | 브라우저 프레임 | 0 | X | 번호 목록 + 검색창 캡슐(키워드) |
| `stat` | 대형 숫자 | 0 | X | `figure`가 비면 browser로 자동 교체 |
| `versus` | A vs B | 2 | X | 키워드 앞 두 개가 양쪽 이름. 두 개 미만이면 frame으로 교체 |
| `step` | 단계 가이드 | 1 | X | STEP 스티커 번호는 장 번호-1 |
| `qa` | Q&A 말풍선 | 0 | X | 제목=질문, 첫 요점=답, 마지막 요점=팁 |
| `quote` | 인용구 | 1 | O | 톤 낮춘 사진, 큰 따옴표, 출처 줄 |

색 조합(`PALETTES`): `warm`(기본), `sea`, `night`, `herb`, `clay`, `plum`. 각각 `paper`, `soft`, `ink`, `accent`, `muted`, `highlight`, `onAccent`.

사진 분위기 지시는 `CARD_LAYOUTS[id].photoHint`에 있고 `buildImagePrompt`가 붙인다. 디자인 선택지 "사진 위 글자"(`slideLayout:"overlay"`)는 모든 장을 `fullscreen`으로 통일한다.

## 5. 지켜야 할 규칙

- 글자는 항상 코드로 찍는다. 이미지 AI에게 한글을 그리게 하지 않는다. 프롬프트 양 끝에 "글자 금지" 지시가 들어 있다.
- 사진에 식별되는 얼굴을 넣지 않는다. 손, 젓가락, 잔, 뒷모습은 허용한다.
- 확인되지 않은 가격·원산지·영업시간·수치를 문안에 만들지 않는다. `checkTextClaims`가 걸러낸다.
- 홍어회와 홍어전·찜·무침을 구분하고, 주제에 없는 삼합을 강제하지 않는다.
- 커밋 메시지에 모델 이름을 쓰지 않는다. 세션이 지정한 공동 작성자 줄을 붙인다.
- 사용자(개발자) 선호: 코드 예시는 최신 문법, 동작 원리를 주석으로 설명, 큰 수정은 먼저 물어보기, 버그 설명은 예상 원인 3가지부터.

## 6. 샘플 카드 그리는 방법

실제 사진 없이 레이아웃을 확인할 때 쓴 방법이다. 임시 테스트 파일을 만들어 돌리고 지운다.

```ts
// tests/unit/zz-render-cards.test.ts  (실행 후 삭제)
// @vitest-environment node
import { it } from "vitest";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { composeSlideImage } from "@/features/images/composeSlide";

it("renders sample cards", async () => {
  // photo 자리에 Higgsfield로 만든 실제 사진 버퍼를 넣으면 된다.
  const photo = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: "#8a5a3c" } }).jpeg().toBuffer();
  const slide = { role: "detail" as const, layout: "frame" as const, headline: "가까이 보면 결이 이렇게 살아 있어요",
    points: ["얇게 썰려 빛에 비치면 결이 보여요"], visualPrompt: "x", textPosition: "bottom" as const, keywords: ["결"], figure: "" };
  await writeFile("/tmp/sample.jpg", await composeSlideImage([photo], slide, 2, 5, "card", { palette: "sea" }));
}, 60_000);
```

```
npx vitest run tests/unit/zz-render-cards.test.ts && rm tests/unit/zz-render-cards.test.ts
```

Higgsfield 호출은 `generateHiggsfieldImages(brief)`(`src/features/images/higgsfieldRequest.ts`)를 그대로 쓰면 된다. 모델은 Grok Image 2.0, 3:4로 받아 1080×1350으로 자른다. 한 장에 약 2분, 장당 크레딧이 든다. 키 확인은 `npm run check:higgsfield`.

## 7. 새 세션에서 Higgsfield로 할 일

사용자가 "지금까지의 과정을 Higgsfield로 다시" 하고 싶다고 했다. 구체 작업은 아래 순서를 제안한다.

### A. 열 가지 템플릿 샘플을 실제 사진으로 다시 만들기
1. 홍어 주제로 장면별 사진을 Higgsfield로 만든다. 각 레이아웃의 `photoHint`와 `CANDIDATE_VARIANTS`를 프롬프트에 반영한다. 콜라주는 3장, 비교는 2장, 나머지는 1장.
2. 6번 방법으로 열 장을 그려 사용자에게 보낸다(채팅에 이미지로).
3. 사용자 피드백을 받아 `composeSlide.ts`의 해당 렌더러를 고친다.

### B. 재사용할 템플릿 장식 요소 만들기 (선택)
- 일러스트형: 카드 테두리에 겹치는 캐릭터 그림(배경 투명 필요 → 생성 후 `sharp`로 배경 제거가 쉬운 단색 배경으로 요청).
- 종이 질감, 파스텔 배경 무늬.
- 저장 위치 제안: `assets/design/` (저장소에 커밋, 게시물마다 비용 없음). `composeSlide.ts`에서 읽어 합성.
- 사용자에게 먼저 물을 것: 원하는 캐릭터·분위기 한 줄.

### C. 품질 옵션 (선택)
- 설정 화면의 "OpenAI 이미지 품질"은 OpenAI에만 적용된다. Higgsfield의 `quality`는 `higgsfieldRequest.ts`에 `"medium"`으로 고정. 허용 값과 크레딧 차이를 Higgsfield 문서에서 확인한 뒤 공용 "이미지 품질" 옵션으로 묶을 수 있다.

## 8. 사용자에게 아직 받지 못한 것

- 샘플 열 장에 대한 의견.
- 가게 이름 영문 표기(풀스크린 위 오른쪽, 인용구 출처 줄에 쓸 것). 없으면 한글 유지.
- ~~로고 파일.~~ → 받음(2026-10). `assets/brand/logo-round.png`(원 바깥 투명)·`logo-original.webp`. 앱 아이콘·상단·로그인·설정 브랜드 키트에 씀. 카드에 넣을 자리는 사장님 선택 대기.
- 레퍼런스 카드뉴스 파일. 로컬 `C:\Users\s4034\OneDrive\Desktop\인스타 그램 자동화\레퍼런스`에 있다고 했으나 저장소에는 올라오지 않았다. 올리려면 `docs/reference/`에 넣고 커밋·푸시.
- 배포 여부. 브랜치를 master에 머지하려면 PR이 필요하다. 이전에는 "PR 만들어줘" → "PR 머지해줘" 순서로 진행했고, squash 머지를 썼다.

## 9. 검사 명령

```
npx vitest run            # 단위 테스트 (PowerShell 테스트 1개는 Linux에서 실패가 정상)
npx tsc --noEmit          # 타입 검사 (끝나면 tsconfig.tsbuildinfo 삭제)
npx eslint src tests      # 린트
```

관련 문서: `docs/INSTAGRAM_AUTOPUBLISH.ko.md`(Instagram 설정), `docs/APP_OPERATION_GUIDE.ko.md`(운영), `.env.example`(환경변수 목록).
