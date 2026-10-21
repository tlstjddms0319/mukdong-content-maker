# 묵동 콘텐츠 메이커

> 동네 홍어 전문점 사장님이 **주제 하나 고르고 버튼 한 번 누르면**, 인스타그램 카드뉴스(4–9장)와 올릴 글이 완성되는 웹앱입니다.
> 서울AI재단 청년 소상공인 매칭 프로그램에서 청년팀 MeriTale이 묵동홍어마을(서울 중랑구)을 위해 만들었고, 2026년 10월 사장님께 인수인계했습니다.

- 공개 주소: <https://mukdong-content-maker-0319.onrender.com/> (관리자 암호 로그인)
- 사장님 운영 가이드(인수인계): [docs/OWNER_HANDOVER_GUIDE.ko.md](docs/OWNER_HANDOVER_GUIDE.ko.md)
- 화면별 사용법과 실제 동작: [docs/APP_OPERATION_GUIDE.ko.md](docs/APP_OPERATION_GUIDE.ko.md)

## 왜 만들었나

소상공인에게 인스타그램 운영은 "무엇을 올릴지 → 사진·디자인 → 글쓰기 → 올리기"를 매번 혼자 해야 하는 일입니다. 50대 사장님이 혼자서도 **주 2–3회** 꾸준히 올릴 수 있으려면, 앱이 고를 것을 줄이고 나머지는 알아서 해야 합니다.

그래서 이 앱은 세 가지를 원칙으로 삼았습니다.

1. **고르는 건 둘뿐** — 주제 하나, 모양 하나(📷 사진 중심 / ✏️ 글 중심). 나머지는 `만들기` 한 번으로 끝까지 자동.
2. **홍보 글이 아니라 궁금증을 푸는 글** — "홍어는 왜 상하지 않고 삭을까?"처럼 독자가 궁금해할 "왜"를 과학·식문화 원리로 설명해, 저장하고 친구에게 보내고 싶은 게시물을 만듭니다.
3. **지어내지 않는다** — 가격·원산지·숙성 기간·건강 효능처럼 확인되지 않은 사실은 쓰지 않고, 사장님이 적어 둔 사실만 근거로 씁니다.

## 한눈에 보는 흐름

```
1 무엇을 올릴까요          2 만들기                                3 확인하고 올리기
┌──────────────────┐     ┌───────────────────────────────────┐   ┌───────────────────────┐
│ 추천 주제 3개     │──▶ │ 사진 중심 / 글 중심 고르기          │─▶│ 사진 미리보기 + 올릴 글 │
│ (계절·반응·검색어)│     │ 사진 올리기(선택)                  │   │ 글 다시 쓰기·장 고치기  |
│ 또는 직접 쓰기    │     │ 만들기 ▶ 구성안 → 그림 콘셉트 고르기│   │인스타그램에 바로 올리기 |
└──────────────────┘     │        → 카드 4–9장 → 홍보 카드    │   │ 휴대폰에 저장하기       │
                         │        → 저장 → 올릴 글            │   └───────────────────────┘
                         └───────────────────────────────────┘
```

| 단계 | 앱이 하는 일 |
| --- | --- |
| **1 무엇을 올릴까요** | 계절·명절, 반응 좋았던 지난 주제, 네이버 검색어 트렌드를 참고해 "왜" 질문형 주제 3개를 추천. 했던 주제·보관함 주제는 다시 나오지 않음 |
| **2 만들기** | 구성안(표지 훅 → 이유 장들 → 결론) → 그림 콘셉트 선택 → 장마다 그림(사장님 사진 또는 AI) → 자동 검수·다듬기 → 가게 홍보 카드 → 저장 → 올릴 글. 다른 화면에 다녀와도 계속 |
| **3 확인하고 올리기** | 한 화면에서 확인·수정하고 `인스타그램에 바로 올리기` 또는 `휴대폰에 저장하기`(사진 저장 + 글 복사). 카드 글자 고치기·장 빼고 넣기·모양 바꾸기 |
| **더보기** | 한 달 계획(날짜별 주제 자동 배치), 예약 자동 게시, 성과(인스타그램 반응 자동 수집), 사진 보관함, 휴대폰 알림 |

## 무엇이 다른가 — 게시물 품질을 코드로 지키기

이 앱은 AI에게 "글 써 줘"라고 한 번 묻고 끝내지 않습니다. **쓰기 → 검사 → 고치기**를 여러 겹으로 돌리고, 지켜야 할 규칙을 코드로 둡니다(`src/features/copy/explain.ts`, `src/features/images/planReview.ts`).

### 글 (주제 · 카드 · 올릴 글)

| 장치 | 하는 일 |
| --- | --- |
| **"왜" 주제 규칙** | 답이 뻔한 질문("홍어찜은 왜 따뜻하게 먹을까?")은 버리고, 예상을 뒤집는 대비가 있는 질문("생선회와 달리 홍어회는 왜 삭혀도 상하지 않을까?")만 추천 |
| **후킹 규칙** | 표지는 오해 깨기·의외의 정체·공감 장면·대조 네 유형으로. 과장·도전형 말투·막연한 질문·답을 먼저 말하는 표지·예/아니오 질문은 걸러서 다시 쓰게 함 |
| **원리 노트** (`store/principles.ts`) | 메뉴 11개에 대해 확인해 둔 원리 29개(요소→암모니아, 콜라겐→젤라틴, 과메기 얼었다 녹기…)와 흔한 오해 21개. AI는 이유를 지어내지 않고 여기서 고름 |
| **비교 주제 목록** | 홍어 vs 가오리, 삭힌 홍어 vs 생홍어 등 기준별 차이를 확인된 원리로 말할 수 있는 10쌍만 비교 주제로. 상표끼리 비교는 사장님 메모에 사실이 있을 때만 |
| **원인 이름 검사** | 이유 장과 올릴 글 문단이 성분·구조·온도·조리 과정·감각·풍습 같은 원인 이름 없이 "~해서 맛있어요"로 끝나면 다시 쓰게 함 |
| **가게 이야기 메모** | 사장님이 설정에 적은 가게 사실(손질법·숙성 등)만 근거로 쓰고, 사실 검사도 메모에 있는 말은 통과. 없으면 지어내지 않음 |
| **사실 검사** (`guard/`) | 향이 없다는 보장, 확인 안 된 가격·원산지·숙성 기간·영업시간·효능, 가게가 "제공한다"는 단정을 막고 확인할 사실로 따로 알림 |
| **마지막 다듬기** | 표지를 후킹 유형별 후보 3개로 다시 쓰고, 카드에 안 들어가는 긴 제목만 줄이고, 짧은 올릴 글은 이유 문단을 더해 늘림 |

### 그림

| 장치 | 하는 일 |
| --- | --- |
| **그림 콘셉트 선택** | 구성안이 나오면 AI가 글에 맞는 콘셉트 2개를 제안(캐릭터 대결·상황 일러스트·단면 그림·만화 컷)하고 사장님이 실사와 함께 고름. 예: "홍어 vs 가오리" → 링 위에서 마주 선 두 캐릭터 |
| **홍어답게 그리기** | 실제 매장 사진을 기준으로 홍어회의 색(탁한 연보라빛 분홍)·연골 결·썬 모양을 지시하고, 사장님이 올린 홍어회 사진을 참고 이미지로 씀. 참치·연어처럼 나오던 문제를 잡음 |
| **표지 점검** | 표지 후보를 비전 AI가 점검(기대한 음식으로 보이나, 글자가 섞였나, 손이 어색한가, 먹음직스러운가)해 가장 좋은 것을 앞에 둠 |
| **이미지 속 글자 금지** | 촬영 힌트에서 "제목 자리" 같은 말을 빼고 빈 자리는 평범하게 두라고 지시해, 이미지 AI가 엉터리 한글을 그려 넣던 문제를 막음 |
| **카드 자동 검수** | 그린 카드마다 글자 넘침·겹침·대비·인스타 안전 영역을 재고, 문제가 있으면 크기를 바꿔 다시 그림(`render/audit.ts`) |

### 결과물을 숫자로 점검하기

`npm run eval:posts`는 실제 앱의 서버 길을 그대로 불러 게시물을 만들고, 평가 AI가 후킹·이유 깊이·흐름·사실 안전·올릴 글을 1–5점으로 매깁니다. 규칙을 고칠 때마다 전후를 비교하며 10회 돌렸습니다(게시물 6–10개씩, 같은 Gemini 모델).

| | 처음(1회) | 원리 노트 뒤(6회) | 지금(10회) |
| --- | --- | --- | --- |
| 이유 깊이 | 3.0 | **3.5** | 3.4 |
| 사실 안전 | 4.7 | **5.0** | 4.5 |
| 올릴 글 | 3.2 | 3.5 | **3.6** |
| 흐름 | 3.3 | 3.7 | 3.2 |
| 후킹 | 2.3 | 2.8 | 2.5 |
| 뻔한 질문 | 4/6 | 4/6 | 4/10 |
| 본문 길이 부족 | 거의 매번 | 거의 매번 | 0 |

점수는 6–10개 표본이라 ±0.3은 흔들림입니다. 이유 깊이는 "원리 노트"를 넣자 처음으로 올랐고, 후킹은 규칙만으로는 2.5–2.8에서 멈춰 실제 인스타그램 반응(저장·공유)을 다음 추천에 반영하는 쪽으로 방향을 잡았습니다.

## 카드 디자인 엔진

카드는 서버에서 sharp(libvips) + Pango 글자 + SVG 장식으로 직접 그립니다(`src/features/images/`). 외부 디자인 도구 없이 1080×1350 카드를 그리며, 렌더 시간은 장당 2.5초 이하를 목표로 벤치마크합니다.

- **두 갈래**: 사진 중심(사진이 크게, 글 한 줄)과 글 중심(제목 84px 이상 + 짧은 글 두 줄). 갈래가 장 수(4–9장)·사진 수·글 길이를 정합니다(`track.ts`).
- **모양 18벌**: 사진 중심 10벌·글 중심 8벌(매거진·반반·숙성 도장·노포 메뉴판·한지 붓글씨·호외 신문…). 게시물마다 자동으로 바꾸고, 확인 화면에서 견본을 보고 바꿀 수 있습니다. 모두 한식·노포·전통 모티프만 씁니다.
- **사진**: 따뜻한 색을 지키는 자동 보정, 음식 초점 크롭, 마무리 선명화. 가로로 긴 사진은 표지와 2장에 반씩 나눠 넘기면 이어지게(`render/panorama.ts`).
- **글자**: 제목 균형 줄바꿈, 핵심어 색 강조, 자간·숫자 폭 고정, 빠진 글자는 Pretendard로 대체. 글꼴은 모두 OFL(`assets/fonts/`).
- **장식**: 미리 구운 질감(한지·나무·리넨…), 홍어 마스코트 12포즈, 음식 소품 스티커, 계절 소품(빗줄기·보름달·눈송이…)을 글자와 사진을 피해 빈 자리에만.
- **예전 디자인 계열 20종**(예전 게시물용): 컬러 블록·웹툰·타이포그래피·한지·칠판·막걸리 라벨 등. 계열 친화도 표가 어울리지 않는 조합을 피하게 합니다(`styleCatalog.ts`).
- **가게 홍보 카드**: 모든 게시물 맨 뒤에 가게 포스터 한 장(이미지 AI 비용 없음).

## 기술 구성

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 앱 | Next.js(App Router) · React · TypeScript · zod | 서버 길과 화면을 한 저장소에서, 모든 입력을 스키마로 검사 |
| 카드 렌더 | sharp(libvips) · Pango · SVG | 서버에서 직접 그려 디자인 도구·브라우저 없이 재현 가능 |
| 글 AI | Gemini → Groq → Cloudflare(자동 전환) | 무료 한도 안에서 끊기지 않게. 엄격 JSON 스키마로 형식 오류 최소화 |
| 그림 AI | Higgsfield(Grok Image · Nano Banana) → Cloudflare FLUX, OpenAI는 선택 시에만 | 음식 사진 품질과 비용의 균형 |
| 사진 점검 | Gemini 비전 | 표지 후보 점검, 사장님 사진 속 음식 인식 |
| 저장 | Supabase Storage(비공개 버킷) / 로컬 `data/` | 무료 서버 재시작에도 초안·설정 보존 |
| 로그인·알림 | NextAuth(관리자 암호) · Web Push | 사장님 한 명이 쓰는 앱, 휴대폰 알림으로 꾸준히 |
| 게시 | Instagram Graph API · GitHub Actions 스케줄러 | 바로 올리기와 예약 자동 게시, 반응 자동 수집 |
| 품질 | vitest 단위 테스트 1,080여 개 · Playwright e2e · 결과물 점검 스크립트 | 규칙을 고칠 때마다 되돌아가지 않게 |

### 폴더

```
src/app/            화면(만들기·내 게시물·한 달 계획·성과·설정)과 서버 길(/api/*)
src/features/
  topics/           주제 추천·한 달 기획·했던 주제 기록
  images/           구성안·검수·다듬기·그림 콘셉트·카드 렌더(styles/, render/)·이미지 AI 요청
  copy/             올릴 글 쓰기·규칙(explain.ts)·다듬기
  store/            가게 메뉴·원리 노트·비교 목록·가게 이야기 메모
  guard/            사실 검사(금지 표현·확인할 사실)
  drafts/ instagram/ metrics/ settings/ notifications/
scripts/            결과물 점검(eval-posts), 카드 검수·갤러리·벤치, 키 점검
docs/               운영 가이드·설정 가이드·점검 기록
tests/              단위 테스트(unit/)·e2e
```

## 시작하기

Node.js 22 이상을 권장합니다.

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 키가 하나도 없어도 준비된 기본 주제·문안과 실제 사진 카드로 화면 흐름을 확인할 수 있습니다.

### 관리자 로그인

PowerShell에서 `./scripts/setup-owner-password.ps1`을 한 번 실행하면 `OWNER_PASSWORD_HASH`와 `AUTH_SECRET`이 `.env.local`에 저장됩니다. PowerShell이 없으면 `printf '%s' '암호' | node scripts/hash-owner-password.mjs`가 출력하는 두 줄을 넣습니다. 배포할 때는 두 값과 실제 HTTPS 주소의 `AUTH_URL`을 함께 등록하세요.

### 환경 변수

| 변수 | 용도 |
| --- | --- |
| `ANTHROPIC_API_KEY` (`ANTHROPIC_TEXT_MODEL`, 기본 `claude-opus-5-5`) | 글 AI 1순위(유료). 키가 있으면 자동 모드에서 Claude부터 쓴다 |
| `GEMINI_API_KEY` (`GEMINI_TEXT_MODEL`, `GEMINI_FALLBACK_TEXT_MODEL`) | 주제·구성안·올릴 글, 표지 후보 점검 |
| `GROQ_API_KEY` (`GROQ_TEXT_MODEL`) | 글 AI 예비(무료) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (`CLOUDFLARE_TEXT_MODEL`) | 이미지 생성 예비(무료 할당량), 선택 시 글 |
| `HF_API_KEY_ID`, `HF_API_KEY_SECRET` | Higgsfield 이미지 생성(유료 크레딧) |
| `OPENAI_API_KEY` | 이미지 생성 대체(유료, 설정에서 고를 때만) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | 영구 저장소(비공개 버킷 `mukdong-private`) |
| `OWNER_PASSWORD_HASH`, `AUTH_SECRET`, `AUTH_URL` | 관리자 로그인 |
| `INSTAGRAM_*`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_SIGNING_SECRET` | Instagram 게시·예약 자동 게시·반응 수집([설정 가이드](docs/INSTAGRAM_AUTOPUBLISH.ko.md)) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (`NAVER_API_STYLE`) | 네이버 검색어 트렌드로 주제 추천(선택) |
| `DATA_DIR` | 로컬 저장 폴더(기본 `data/`) |

글 AI는 `설정 → 문안 AI`에서 자동(Gemini → Groq → Cloudflare) 또는 하나만, 이미지 AI는 자동(Higgsfield → Cloudflare) 또는 하나만 고릅니다. 키는 서버 환경 변수에만 두고 브라우저·초안·로그에 저장하지 않습니다.

## 배포와 저장소

- **Render**: `master`에 머지하면 자동 배포됩니다. 무료 서버는 재시작 때 디스크가 지워지므로 Supabase를 함께 씁니다.
- **Supabase**: 이름이 정확히 `mukdong-private`인 비공개 Storage 버킷과 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`를 설정하면 초안·설정·업로드 원본이 영구 보관됩니다. `설정 → 저장소 연결 확인`으로 상태를 봅니다.
- **예약 게시**: `.github/workflows/instagram-scheduler.yml`이 정해진 시각에 서버의 스케줄러 길을 불러 예약된 게시물을 올립니다.
- 배포 뒤 실제 계정으로 확인할 항목: [docs/LIVE_CHECKLIST.ko.md](docs/LIVE_CHECKLIST.ko.md)

## 확인 명령

```bash
npm run lint
npm test               # vitest 단위 테스트
npm run build
npm run test:e2e       # Playwright (처음 한 번 npx playwright install chromium)
npm run eval:posts -- --posts=6 --images=none   # 실제 게시물 6개를 만들어 점수 매기기 → output/post-eval-*/report.md
```

### 카드 품질 도구

```bash
R="node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs"
$R scripts/audit-cards.mjs [--style=계열] [--verbose]     # 전 계열·레이아웃 자동 검수(넘침·겹침·대비)
$R scripts/render-style-gallery.mjs [계열]                 # 계열 갤러리 → output/style-gallery/
$R scripts/render-template-gallery.mjs                     # 템플릿 갤러리 → output/template-gallery/
$R scripts/bench-cards.mjs                                 # 카드 렌더 시간(목표: 장당 2.5초 이하)
node scripts/check-fonts.mjs                               # 글꼴별 한글 음절 지원 범위
npm run check:higgsfield                                   # Higgsfield 키·크레딧 점검
```

## 문서

- [사장님 운영 가이드(인수인계)](docs/OWNER_HANDOVER_GUIDE.ko.md) · [화면별 사용법과 실제 동작](docs/APP_OPERATION_GUIDE.ko.md)
- [Instagram 자동 게시 설정](docs/INSTAGRAM_AUTOPUBLISH.ko.md) · [성과 모으기 설정](docs/PERFORMANCE_METRICS.ko.md) · [휴대폰 알림](docs/NOTIFICATIONS.ko.md)
- [실제 서비스 점검표](docs/LIVE_CHECKLIST.ko.md) · [전체 점검과 개선 계획](docs/IMPROVEMENT_PLAN.ko.md) · [일반 사용자 눈으로 본 게시물 비판](docs/INSTAGRAM_VIEWER_CRITIQUE.ko.md)
- [호기심 주제 프롬프트](docs/CURIOSITY_TOPICS_PROMPT.ko.md) · [무료 카드 편집](docs/FREE_IMAGE_CARDS.ko.md) · [무료 이미지 전략](docs/FREE_IMAGE_STRATEGY.ko.md) · [Higgsfield 인수인계](docs/HANDOVER_HIGGSFIELD.ko.md)

## 주의

- AI 이미지는 실제 음식·가게와 다를 수 있습니다. 게시물에는 "AI 연출 이미지" 안내가 자동으로 붙습니다. 가격·영업시간·메뉴 구성·효능 같은 사실은 게시 전 사람이 확인하세요.
- Higgsfield·OpenAI·Cloudflare 유료 요금제는 사용량만큼 비용이 생깁니다. 사장님 사진으로 만드는 게시물과 카드 글자 고치기는 이미지 AI를 부르지 않습니다.
- 공개 주소의 로그인 시도 제한은 서버 프로세스 하나 안에서만 적용됩니다. 공개 운영 전에는 HTTPS와 앞단 보호를 확인하세요.

## 만든 사람

서울AI재단 청년 소상공인 매칭 프로그램 · 청년팀 **MeriTale** · 2026년 9월–10월.
홈페이지·네이버 플레이스·블로그와 함께 묵동홍어마을의 온라인 채널을 처음부터 만들어 인수인계했습니다.
