# 묵동 콘텐츠 메이커

묵동홍어마을 인스타그램 게시물을 **주제 → 이미지 → 문안 → 최종 확인** 네 단계로 만드는 웹앱입니다.
캐러셀 카드(1080×1350)를 서버에서 직접 그리고, 문안·해시태그를 쓰고, 한 달 게시 기획과 예약 자동 게시, 게시 뒤 성과 기록까지 한곳에서 관리합니다.

- 공개 주소: <https://mukdong-content-maker-0319.onrender.com/> (관리자 암호 로그인)
- 사용법과 실제 동작: [docs/APP_OPERATION_GUIDE.ko.md](docs/APP_OPERATION_GUIDE.ko.md)

## 주요 기능

| 영역 | 할 수 있는 일 |
| --- | --- |
| 주제 | 계절·명절, 반응 좋았던 지난 주제, 네이버 검색어 트렌드를 참고한 추천 3개. 직접 입력도 가능 |
| 이미지 | 실제 사진 최대 10장으로 캐러셀(이미지 AI 비용 없음, 가로로 긴 표지 사진은 표지+2장 파노라마), AI 이미지 캐러셀(표지 후보 2장 → 나머지 장), 사진+AI, 무료 카드 편집 |
| 카드 고치기 | 장마다 제목·요점을 고쳐 그 장만 다시 그리기(무료), 장 빼기·새 장 넣기(최대 10장, 적은 글을 요청으로 읽어 AI가 문구·장면을 지음), 디자인 계열·테마·글꼴·계절 소품 바꾸기 |
| 가게 홍보 | 모든 캐러셀 맨 뒤에 가게 홍보 포스터 한 장(설정에서 그림 바꾸기·기본값 `assets/store/promo-card.webp`, 장 고치기에서 켜고 끄기) |
| 문안 | 본문·해시태그·음악 분위기 추천, 부분 재생성(첫 문장·가게 연결·마무리·해시태그) |
| 내보내기·게시 | 이미지·문안 ZIP 받기, 승인 후 Instagram 바로 게시, 게시 희망일시 예약 자동 게시(연결한 경우) |
| 관리 | 내 초안(다시 열기·복제), 한 달 콘텐츠 기획, 성과 기록과 성과 돌아보기, 사진 보관함(태그·검색), AI 사용량(설정) |

## 카드 디자인 엔진

카드는 sharp(libvips) + Pango 글자 + SVG 장식으로 서버에서 그립니다(`src/features/images/`).

- **디자인 계열 20종**: 기본 템플릿(레이아웃 18종 × 게시물 테마 7종, 조각보 포함)과 컬러 블록·웹툰·오마카세·타이포그래피·B급 키치·다이어리·도감·팝업북·필름·네온·한지·칠판·낙서·막걸리 라벨·모던 그리드·블랙&골드·수채화·티켓·매거진. 계열마다 색·사진 처리·글꼴·장식이 따로 있습니다(`styles/*.ts`).
- **계열 고르기**: AI 구성안이 글에 맞는 계열을 고릅니다. 계열 친화도 표(`styleCatalog.ts`)가 어울리지 않는 조합(예: 잔칫상 글 + B급 키치)을 피하게 합니다. 격식 있는 글이면 장식을 줄인 절제 변형으로 그립니다.
- **사진**: 따뜻한 색을 지키는 자동 보정, 음식 초점 크롭, 마무리 선명화. AI 사진과 실제 사진의 보정 강도를 다르게 둡니다.
- **글자**: 제목 균형 줄바꿈, 핵심어 색 강조, 자간·숫자 폭 고정, 빠진 글자는 Pretendard로 자동 대체. 글꼴은 모두 OFL이고 라이선스와 함께 `assets/fonts/`에 있습니다.
- **구성**: 표지 훅+부제, 표지 예고 띠("먹는 법 · 곁들임 · 방문 전 확인 — 5장"), 본문 장 "넘겨 보기", 마지막 장 가게 명함.
- **질감과 입체**: 미리 구운 질감(한지·벽돌·나무·크라프트·리넨 등, `assets/design/textures`), 두 겹 그림자·안쪽 그림자·접촉 그림자, 금박 베벨·네온 반사.
- **마스코트와 소품**: 홍어 마스코트 12포즈(`assets/design/mascot`)와 음식 소품 스티커 7종(`assets/design/props`). 장 역할에 맞는 포즈를 고릅니다.
- **계절 소품**: 빗줄기·보름달·색동 띠·눈송이·꽃잎·단풍잎을 글자·사진을 피해 빈 자리에만 옅게 얹습니다(`render/seasonLayer.ts`). 구성안 AI가 주제·시기에 맞을 때만 고르고, 화면에서 직접 고르거나 끌 수 있습니다.
- **표지+2장 파노라마**: 가로로 긴 사진 한 장을 표지와 2번째 장에 반씩 나눠, 넘기면 사진이 이어지게 그립니다(`render/panorama.ts`).
- **메뉴와 장면**: 가게 메뉴 목록(`src/features/store/menu.ts`)이 주제 추천·구성안·이미지 지시문·사진 점검의 기준입니다. 이미지 지시문은 사진에 나올 음식만 긍정문으로 말해(나오면 안 되는 음식은 이름도 꺼내지 않음) 과메기 글에 삼합이 끼어들지 않게 합니다(`sceneFoods.ts`).
- **자동 검수**: 그린 카드마다 글자 넘침·겹침·대비·인스타 격자 안전 영역을 재고, 문제가 있으면 크기를 바꿔 다시 그립니다(`render/audit.ts`).

## 시작하기

Node.js 22 이상을 권장합니다(카드 품질 스크립트는 TypeScript 변환 모드를 씁니다).

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 키가 하나도 없어도 앱에 준비된 기본 주제·문안과 실제 사진 캐러셀로 화면 흐름을 확인할 수 있습니다.

### 관리자 로그인

PowerShell에서 `./scripts/setup-owner-password.ps1`을 한 번 실행하면 `OWNER_PASSWORD_HASH`와 `AUTH_SECRET`이 `.env.local`에 저장됩니다. PowerShell이 없으면 `printf '%s' '암호' | node scripts/hash-owner-password.mjs`가 출력하는 두 줄을 `.env.local`에 직접 넣습니다. 로그인은 최대 8시간 유지됩니다. 배포할 때는 두 값과 실제 HTTPS 주소의 `AUTH_URL`을 배포 환경 변수에 등록하세요.

### 환경 변수

| 변수 | 용도 |
| --- | --- |
| `GEMINI_API_KEY` (`GEMINI_TEXT_MODEL`, `GEMINI_FALLBACK_TEXT_MODEL`) | 주제·문안·구성안. 표지 후보 점검 |
| `GROQ_API_KEY` (`GROQ_TEXT_MODEL`) | 문안 예비 작성자(무료) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (`CLOUDFLARE_TEXT_MODEL`) | 이미지 생성(무료 할당량), 선택 시 문안 |
| `HF_API_KEY_ID`, `HF_API_KEY_SECRET` | Higgsfield 이미지 생성(유료 크레딧) |
| `OPENAI_API_KEY` | 이미지 생성 대체(유료) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | 영구 저장소(비공개 버킷 `mukdong-private`) |
| `OWNER_PASSWORD_HASH`, `AUTH_SECRET`, `AUTH_URL` | 관리자 로그인 |
| `INSTAGRAM_*`, `MEDIA_PUBLIC_BASE_URL`, `MEDIA_SIGNING_SECRET` | Instagram 게시·예약 자동 게시([설정 가이드](docs/INSTAGRAM_AUTOPUBLISH.ko.md)) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (`NAVER_API_STYLE`) | 네이버 검색어 트렌드로 주제 추천(선택) |
| `DATA_DIR` | 로컬 저장 폴더(기본 `data/`) |

문안 AI는 `설정 → 문안 AI`에서 자동(Gemini → Groq → Cloudflare)·서비스 하나만을 고르고, 이미지 AI는 자동(Higgsfield → Cloudflare → OpenAI) 또는 서비스 하나만(Higgsfield·Cloudflare·OpenAI)을 고릅니다. 키는 서버 환경 변수에만 두고 브라우저·초안·로그에 저장하지 않습니다.

## 배포와 저장소

- **Render**: `master`에 머지하면 자동 배포됩니다. 무료 서버는 재시작 때 디스크가 지워집니다.
- **Supabase**: 이름이 정확히 `mukdong-private`인 비공개 Storage 버킷을 만들고 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`를 함께 설정하면 초안·설정·업로드 원본이 버킷에 영구 보관됩니다. 둘 중 하나만 있으면 임시 디스크로 조용히 되돌아가지 않고 오류를 냅니다. `설정 → 저장소 연결 확인`으로 상태를 볼 수 있습니다.
- 로컬에서는 `data/`(Git 제외)에 저장됩니다. 백업은 앱을 끈 뒤 `data/` 폴더를 복사하세요.
- 배포 뒤 실제 계정으로 확인할 항목: [docs/LIVE_CHECKLIST.ko.md](docs/LIVE_CHECKLIST.ko.md)

## 확인 명령

```bash
npm run lint
npm test               # vitest 단위 테스트
npm run build
npm run test:e2e       # Playwright (처음 한 번 npx playwright install chromium)
```

### 카드 품질 도구

TypeScript 소스를 바로 불러오므로 아래처럼 실행합니다.

```bash
R="node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/register-ts.mjs"
$R scripts/audit-cards.mjs [--style=계열] [--verbose] [--handle=계정] [--theme=테마]   # 전 계열·레이아웃 자동 검수(넘침·겹침·대비·몰래 축소·외톨이 줄)
$R scripts/render-season-gallery.mjs [소품] [--theme=테마]                # 계절 소품 시트 → output/season/
$R scripts/render-style-gallery.mjs [--stress] [계열]                   # 계열 갤러리 → output/style-gallery/
$R scripts/render-template-gallery.mjs                                  # 템플릿 갤러리 → output/template-gallery/
$R scripts/bench-cards.mjs [--compare=output/bench-baseline.json]       # 카드 렌더 시간(목표: 장당 2.5초 이하)
node scripts/check-fonts.mjs                                            # 글꼴별 한글 음절 지원 범위
node scripts/bake-textures.mjs                                          # 질감 자산 다시 굽기
node scripts/extract-stickers.mjs <시트> <폴더> <이름,...>              # 흰 바탕 시트에서 스티커 오리기
```

## 문서

- [사용법과 실제 동작](docs/APP_OPERATION_GUIDE.ko.md)
- [실제 서비스 점검표](docs/LIVE_CHECKLIST.ko.md)
- [Instagram 자동 게시 설정](docs/INSTAGRAM_AUTOPUBLISH.ko.md)
- [무료 카드 편집](docs/FREE_IMAGE_CARDS.ko.md) · [무료 이미지 전략](docs/FREE_IMAGE_STRATEGY.ko.md)
- [Higgsfield 인수인계](docs/HANDOVER_HIGGSFIELD.ko.md) · [호기심 주제 프롬프트](docs/CURIOSITY_TOPICS_PROMPT.ko.md)
- [인스타그램 마케팅 계획서](묵동홍어마을_인스타그램_마케팅_계획서_v1.md)

## 주의

- AI 이미지는 실제 음식·가게와 다를 수 있습니다. 가격·영업시간·메뉴 구성·효능 같은 사실은 게시 전 사람이 확인하세요. 카드 장식에는 날짜·가격·연도 같은 숫자를 넣지 않습니다.
- Higgsfield·OpenAI·Cloudflare 유료 요금제는 사용량만큼 비용이 생깁니다. 실제 사진 캐러셀과 카드 글자 고치기는 이미지 AI를 부르지 않습니다.
- 공개 주소의 로그인 시도 제한은 서버 프로세스 하나 안에서만 적용됩니다. 공개 운영 전에는 HTTPS와 앞단 보호를 확인하세요.
