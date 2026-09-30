# Instagram 자동 게시 설정 가이드

이 앱은 두 가지 방식으로 Instagram에 게시합니다.

- **바로 게시**: 최종 확인 화면의 "승인하고 Instagram에 게시" 버튼.
- **예약 자동 게시**: 내 초안 달력에서 게시 희망일시를 정하고 "최종 확인 완료"를 켜 두면, 서버가 그 시각이 지난 초안을 찾아 자동으로 게시합니다.

둘 다 아래 준비가 끝나야 동작합니다. 메뉴 이름은 Meta 화면 개편에 따라 조금 다를 수 있습니다.

## 1. Instagram 계정을 프로페셔널 계정으로 바꾸기

게시 API는 **비즈니스 또는 크리에이터 계정**에서만 쓸 수 있습니다.

1. Instagram 앱 → 프로필 → 메뉴(≡) → **설정 및 개인정보** → **계정 유형 및 도구** → **프로페셔널 계정으로 전환**.
2. 비즈니스 또는 크리에이터 중 하나를 고릅니다. 페이스북 페이지 연결은 필요 없습니다.

## 2. Meta 개발자 앱 만들기

1. https://developers.facebook.com 에 Instagram 계정과 연결된 Facebook 계정으로 로그인 → **내 앱** → **앱 만들기**.
2. 사용 사례에서 **Instagram**(Instagram API with Instagram Login)을 고릅니다. 앱 유형을 물으면 "비즈니스"를 고릅니다.
3. 앱 대시보드 → 왼쪽 **Instagram** → **API 설정(Instagram 로그인)** 화면에서:
   - **Instagram 앱 ID**와 **Instagram 앱 시크릿**을 확인합니다. → `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`
   - **비즈니스 로그인 설정**의 OAuth 리디렉션 URI에 `https://<배포 주소>/api/instagram/callback` 을 추가합니다. → `INSTAGRAM_REDIRECT_URI` 와 글자 하나까지 같아야 합니다.
   - 권한(scope)에 `instagram_business_basic`, `instagram_business_content_publish` 가 포함돼 있는지 확인합니다.
4. 앱이 **개발 모드**인 동안은 테스터로 등록된 계정만 로그인할 수 있습니다.
   - 앱 대시보드 → **앱 역할** → **역할** → **Instagram 테스터** 추가 → 게시할 Instagram 계정 아이디 입력.
   - Instagram 앱 → 설정 → **앱 및 웹사이트** → **테스터 초대**에서 초대를 수락합니다.
   - 다른 사람 계정에도 쓰려면 앱 검수(App Review)를 받아 라이브 모드로 전환해야 합니다. 본인 계정 하나만 쓰면 개발 모드로 충분합니다.

## 3. https 주소로 배포하기

Meta 서버가 이미지를 URL로 가져가므로 **localhost로는 게시할 수 없습니다.** 저장소의 `render.yaml`로 Render에 배포하면 됩니다.

Render 대시보드 → 서비스 → **Environment**에 아래 값을 넣습니다.

| 변수 | 값 |
| --- | --- |
| `INSTAGRAM_APP_ID` | 2단계의 앱 ID |
| `INSTAGRAM_APP_SECRET` | 2단계의 앱 시크릿 |
| `INSTAGRAM_REDIRECT_URI` | `https://<배포 주소>/api/instagram/callback` (render.yaml에 기본값 있음) |
| `MEDIA_PUBLIC_BASE_URL` | `https://<배포 주소>` (render.yaml에 기본값 있음) |
| `MEDIA_SIGNING_SECRET` | 긴 랜덤 문자열 (render.yaml이 자동 생성) |
| `INSTAGRAM_SCHEDULER_SECRET` | 긴 랜덤 문자열 (render.yaml이 자동 생성) |
| `INSTAGRAM_AUTOPUBLISH` | `on` (끄려면 `off`) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | **강력 권장.** 없으면 Render 무료 플랜의 `/tmp`가 재시작 때 지워져 연결 정보와 초안이 사라집니다. |

값을 넣은 뒤 재배포합니다. 설정 화면의 "게시 서버 설정" 카드에서 빠진 항목이 없는지 확인할 수 있습니다.

## 4. 앱에서 Instagram 연결하기

1. 배포된 앱에 로그인 → **설정** → **Instagram 연결** 카드 → **Instagram 연결**.
2. Instagram 로그인 화면에서 게시할 계정으로 로그인하고 권한을 허용합니다.
3. 설정 화면으로 돌아오면 "@계정 연결됨"이 보입니다. 장기 토큰(60일)이 저장되고, 만료 7일 전부터 서버가 자동으로 갱신합니다.

## 5. 예약 자동 게시 사용하기

1. 초안을 만들고 이미지·문안까지 저장합니다.
2. **내 초안** 달력에서 초안을 고르고 **게시 희망일시(한국시간)** 를 정한 뒤 **최종 확인 완료**를 켭니다.
3. 그 시각이 지나면 서버가 1분 안에 게시합니다(서버 내부 타이머, `INSTAGRAM_SCHEDULER_INTERVAL_SECONDS` 기본 60초).
4. 실패하면 30분 뒤에 다시 시도합니다. 이미 게시된 초안은 다시 게시하지 않습니다.

### Render 무료 플랜이라면: 외부 크론 추가

무료 인스턴스는 15분 동안 요청이 없으면 잠들고, 잠든 동안은 내부 타이머가 돌지 않습니다. 무료 외부 크론(예: cron-job.org)에서 5분마다 아래 요청을 보내면 인스턴스가 깨어나면서 예약 게시를 점검합니다.

```
POST https://<배포 주소>/api/instagram/scheduler
Authorization: Bearer <INSTAGRAM_SCHEDULER_SECRET>
```

응답은 이번 점검에서 대상·게시·건너뜀·실패한 초안 목록입니다. 로그인한 상태에서 같은 주소를 호출해도 됩니다.

## 6. 자동 게시 멈추기

- 잠깐 멈추려면 `INSTAGRAM_AUTOPUBLISH=off` 로 바꾸고 재배포합니다. 바로 게시 버튼은 계속 동작합니다.
- 특정 초안만 빼려면 달력에서 **최종 확인 완료**를 끕니다.
- 계정 연결을 끊으려면 설정 화면의 **연결 해제**.

## 자주 막히는 곳

- **"게시 서버 설정이 필요합니다"**: `MEDIA_PUBLIC_BASE_URL` 또는 `MEDIA_SIGNING_SECRET`이 비어 있습니다.
- **"공개 HTTPS 주소 설정이 필요합니다"**: `MEDIA_PUBLIC_BASE_URL`이 `https://`로 시작하지 않습니다.
- **연결 버튼을 눌렀는데 오류로 돌아옴**: 리디렉션 URI 불일치, 테스터 미등록, 프로페셔널 계정 아님 중 하나입니다.
- **"Instagram을 다시 연결해 주세요"**: 토큰이 만료됐습니다(60일 넘게 서버가 꺼져 있었던 경우). 설정에서 다시 연결합니다.
- **게시가 "처리 중"에서 실패**: Meta 쪽 이미지 처리가 늦은 경우입니다. 30분 뒤 자동으로 다시 시도하며, 이미지 URL이 외부에서 열리는지(`/api/media/public/...`) 확인해 보세요.
