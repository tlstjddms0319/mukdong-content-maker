# 무료 텍스트 AI 제공자 교체와 비교 설계

작성일: 2026-09-28
상태: 구현 전 검토 요청

## 목적과 경계

주제 추천·문안·캐러셀 구성 생성을 비용 없이 안정적으로 돌린다. 지금은 Gemini `gemini-3.6-flash` 하나만 쓰는데, 이 모델의 무료 한도는 429 응답 본문 기준 분당 5회·하루 약 20회라(공식 표는 없음) 게시물 하나를 만드는 도중에도 소진된다. 사용자의 실제 볼륨은 주 1~3개 게시물(텍스트 약 6~18회, 이미지 약 6~18장)이다.

세 제공자를 같은 인터페이스 뒤에 두고, 실제 결과를 나란히 비교해 사용자가 고른다. 이미지 생성 코드는 바꾸지 않는다. Cloudflare 계정은 사용자가 직접 만들고 키만 연결한다.

2026-09-28 조사(공식 문서와 검증 에이전트 기준, 무료 한도는 예고 없이 바뀔 수 있음):

| 제공자 | 무료 한도 | 카드 | JSON 강제 | 비고 |
| --- | --- | --- | --- | --- |
| Gemini `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` | 모델별 분당 15회·하루 약 500회(429 본문 기준) | 불필요 | 응답 MIME `application/json` + 스키마 | 같은 키로 동작 확인. 무료 티어 입력은 구글 학습에 사용됨 |
| Groq `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` | 모델별 분당 30회·하루 1,000회·분당 8,000토큰 | 불필요 | `json_schema` strict(제약 디코딩 보장) | 입력 학습 불가 약관. 한국어 품질은 테스트 필요 |
| Cloudflare Workers AI `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/google/gemma-4-26b-a4b-it` | 계정당 하루 10,000뉴런(이미지와 공유), 호출당 약 35~60뉴런 | 불필요 | `response_format json_schema`(한국어 모델은 공식 보장 목록 밖) | 09:00 KST 초기화. 초과 시 과금 없이 실패 |

## 완료 기준

1. 설정 `문안 AI`에서 `자동`·`Gemini`·`Groq`·`Cloudflare`를 고를 수 있고, 기존 저장값 `gemini`는 그대로 읽힌다. 기본값은 `자동`이다.
2. 세 제공자 모두 같은 `generateJson(프롬프트, zod 스키마)` 계약으로 주제·문안·캐러셀 구성을 만들고, 결과는 기존 zod 검증을 통과해야 한다. 세 스키마는 선택 필드가 없고 추가 속성이 금지돼 있어 엄격 JSON 스키마 모드로 변환된다(2026-09-28 확인).
3. 선택한 제공자가 한도 초과(429)·일시 오류·스키마 불일치이면 `자동`에서는 다음 제공자로 넘어가고, 모두 실패하면 기존 준비된 주제·문안·구성으로 간다. 어느 제공자가 만들었는지 API 응답과 화면에 표시된다.
4. Gemini 기본 모델은 `gemini-3.5-flash-lite`이고, 429이면 `gemini-3.1-flash-lite`로 한 번 더 시도한다(모델별 한도가 따로 계산되므로 여유가 두 배가 된다).
5. `scripts/compare-text-providers.mjs`가 키가 있는 제공자마다 같은 주제 요청 2회와 문안 요청 2회를 보내 `output/text-provider-comparison-<날짜>/report.md`에 제목 길이·JSON 통과 여부·소요 시간·본문을 나란히 기록한다. 자동 판정은 하지 않는다.
6. 키가 없는 제공자는 건너뛰고 설정 화면에 `키 필요`로 보인다. 비밀값은 로그·응답·보고서 어디에도 출력하지 않는다.

## 화면별 경험

| 화면 | 사용자가 보는 것 | 동작 | 경계 |
| --- | --- | --- | --- |
| `/settings` | `문안 AI` 셀렉트(자동 권장), 연결 카드 Gemini·Groq·Cloudflare·OpenAI | 저장 | 키 저장 여부만 표시한다. 실제 생성 성공은 제작 화면에서 확인한다. |
| `/` 1단계 주제 | 기존 안내 그대로. 준비된 주제로 대체되면 이미 있는 안내문이 뜬다. | 변화 없음 | 제공자 이름은 응답 필드로만 제공한다. |
| `/` 3단계 문안 | `AI로 문안을 만들었어요 (Groq)`처럼 실제 제공자 이름 | 변화 없음 | 기본 문안 대체 문구는 그대로 둔다. |

## 구현 구조와 데이터 흐름

- `src/lib/ai/jsonSchema.ts`: `z.toJSONSchema` 래퍼. 객체마다 `additionalProperties:false`와 전체 `required`를 보장하고, 변환 불가 타입은 오류로 막는다.
- `src/lib/ai/geminiClient.ts`: 기본 모델 변경, 429 시 대체 모델 1회 재시도(옵션 `fallbackModel`), 오류에 HTTP 상태를 실어 선택기가 판단하게 한다. 기존 시그니처와 테스트는 유지한다.
- `src/lib/ai/groqClient.ts`: 이미 설치된 `openai` 패키지에 `baseURL https://api.groq.com/openai/v1`. `response_format: {type:"json_schema", json_schema:{strict:true}}`, `reasoning_effort:"low"`. 모델은 `GROQ_TEXT_MODEL`(기본 `openai/gpt-oss-120b`).
- `src/lib/ai/cloudflareTextClient.ts`: `POST /client/v4/accounts/{id}/ai/run/{model}`에 `messages`와 `response_format json_schema`. 기존 `CLOUDFLARE_ACCOUNT_ID`·`CLOUDFLARE_API_TOKEN` 재사용. 모델은 `CLOUDFLARE_TEXT_MODEL`(기본 `@cf/qwen/qwen3-30b-a3b-fp8`). `result.response`가 문자열이든 객체든 처리한다.
- `src/lib/ai/textClient.ts`: `TextAiClient = {provider, generateJson}`. `resolveTextClients(settings)`가 설정과 키 유무로 시도 순서를 만들고, `generateWithFallback(clients, prompt, schema, onSwitch)`가 순서대로 시도한다. 자동 순서는 Gemini(한국어 품질 확인됨) → Groq(JSON 강제, 하루 1,000회) → Cloudflare(이미지와 뉴런을 나누므로 마지막)다.
- 설정 스키마: `textAiProvider: enum("automatic","gemini","groq","cloudflare")`, 기본 `automatic`. 기존 파일의 `gemini`는 그대로 유효하다.
- 라우트 3곳(`/api/topics`, `/api/copy`, `/api/images/plan`)은 `createGeminiClient()` 대신 선택기를 쓰고, 응답에 실제 제공자를 넣는다. 주제는 기존 `source`에 `provider`를 더하고, 문안은 `_meta.provider`, 구성은 `provider`를 실제 이름으로 바꾼다.
- 환경변수: `GROQ_API_KEY`, `GROQ_TEXT_MODEL`, `CLOUDFLARE_TEXT_MODEL`을 `.env.example`에 추가하고, `render.yaml`에 Cloudflare 계정 ID·토큰과 Groq 키를 `sync:false`로 추가한다.
- 토큰 예산: Groq는 분당 8,000토큰이므로 호출을 순차로 보내고, 문안 보완 프롬프트(이전 초안 최대 7,000자 포함)는 한 번에 약 5,000토큰 안에 두도록 이전 초안 인용을 3,000자로 줄인다.

## 실패·빈 상태

- 키 없음: 해당 제공자를 건너뛴다. 설정 카드에 `키 필요`.
- 429·5xx·네트워크 오류: 다음 제공자로 넘기고 서버 로그에 한 줄 남긴다. 예: `[text-ai] gemini → groq: 429`.
- JSON 파싱·스키마 실패: 같은 제공자에서 한 번 더 시도한 뒤 다음 제공자.
- 모두 실패: 기존 동작 유지. 주제는 준비된 주제와 안내문, 문안은 재시도 안내(502), 구성은 규칙 기반.
- Cloudflare 일일 뉴런 소진(429, 내부 코드 3036): 텍스트는 다음 제공자로 간다. 이미지 쪽 안내 문구는 이번 범위 밖이다.

## 검증 범위

- 단위: 클라이언트별 요청 형태(주소·헤더·`response_format`), 키 미노출, 오류 매핑, Gemini 대체 모델 재시도, 선택기 순서와 폴백, 설정 마이그레이션, 라우트 응답의 `provider`. 기존 라우트 테스트는 그대로 통과해야 한다.
- 브라우저: 설정 화면에서 `문안 AI` 저장, 문안 화면의 제공자 표시(응답 모킹).
- 실제 키: 비교 스크립트 결과를 사용자가 읽고 고른다. 한국어 품질을 코드로 채점하지 않는다.
- 한계: Cloudflare 텍스트 모델 ID와 JSON 강제 여부는 토큰 연결 후 첫 실행에서 확인한다. Groq 한국어 품질도 같다.

## 이번에 하지 않는 일

이미지 제공자 변경, 앱 안의 제공자별 테스트 생성 화면, 스트리밍, 자동 품질 채점, 사용량 기반 모델 자동 순환.

## 구현 순서 제안

1. JSON 스키마 래퍼와 Gemini 모델·재시도 변경(테스트 먼저).
2. Groq 클라이언트, Cloudflare 텍스트 클라이언트.
3. 선택기와 폴백, 설정 스키마·화면.
4. 라우트 3곳 전환과 문안 화면 제공자 표시.
5. 비교 스크립트, `.env.example`·`render.yaml`·README·운영 가이드 갱신.
6. 단위·브라우저·정적 검사 전체 실행.
