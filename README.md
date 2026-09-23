# 묵동 콘텐츠 메이커

비전문 사용자도 주제 선택 → 이미지 제작 → 문안 확인 → 다운로드의 네 단계로 인스타그램 게시물 초안을 만드는 로컬 웹앱입니다.

## 시작하기

Node.js 20 이상이 필요합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. `.env.local`에 Gemini 키와 이미지 생성용 Cloudflare 계정 ID·Workers AI 토큰을 입력하세요. 기본 이미지 설정은 Cloudflare 무료 할당량을 먼저 사용하고, 실패할 때 `OPENAI_API_KEY`가 있으면 OpenAI로 전환합니다. Cloudflare 유료 요금제를 사용하면 무료 할당량 초과분이 과금될 수 있습니다. 설정에서 `Cloudflare만`을 고르면 유료 OpenAI 대체 호출을 하지 않습니다. 키는 브라우저, 초안 파일, 로그에 저장하지 않습니다. 키가 없어도 기본 추천과 화면 흐름을 확인할 수 있습니다.

## 관리자 로그인 설정

처음 한 번 PowerShell에서 `./scripts/setup-owner-password.ps1`을 실행하고 사용할 암호를 입력하세요. 스크립트가 `OWNER_PASSWORD_HASH`와 `AUTH_SECRET`을 로컬 `.env.local`에 자동 저장하며, 다른 설정은 유지합니다. 앱을 다시 시작하면 로그인 화면에 암호 입력란이 나타납니다. 실제 암호는 파일에 저장되지 않으므로 기억하거나 암호 관리자에 보관하세요. 설정 전에는 비공개 화면과 API를 사용할 수 없습니다. 배포할 때는 이 두 값을 배포 환경 변수에도 별도로 등록하고, `AUTH_URL`을 실제 공개 HTTPS 주소로 설정하세요. 로컬 `AUTH_URL`은 접속할 주소(`localhost` 또는 `127.0.0.1`)와 맞춰 설정합니다.

로그인 상태는 최초 로그인부터 최대 8시간 유지됩니다. 작업을 마친 뒤 상단의 **로그아웃**을 누르세요. 암호를 바꾸거나 비밀값이 노출됐다고 의심되면 설정 스크립트를 다시 실행하고 서버를 재시작하세요. 기존 로그인 상태는 무효화됩니다.

인터넷에 공개하기 전에는 HTTPS와 로그인 시도 제한을 제공하는 앞단 설정을 확인해야 합니다. 앱의 로그인 시도 제한은 한 서버 프로세스 안에서만 적용되므로, 공개 주소의 보호를 대신하지 않습니다. Instagram 게시는 자동으로 실행되지 않으며 사용자가 최종 승인 버튼을 눌러야 합니다.

## Instagram 연결 준비

1. Meta 개발자 대시보드에서 Business 앱을 만들고 **Instagram API with Instagram Login**을 추가합니다.
2. 로그인 리디렉션 URI를 `.env.local`의 `INSTAGRAM_REDIRECT_URI`와 글자 하나까지 같게 등록합니다. 로컬 기본값은 `http://localhost:3000/api/instagram/callback`입니다.
3. 프로페셔널 Instagram 계정(비즈니스 또는 크리에이터)을 테스트 계정으로 추가하고 `instagram_business_basic`, `instagram_business_content_publish` 권한을 허용합니다.
4. `.env.example`의 Instagram 항목을 참고해 앱 ID와 앱 시크릿을 `.env.local`에만 입력합니다. `MEDIA_SIGNING_SECRET`에는 충분히 긴 임의 문자열을 사용합니다.
5. 실제 게시 전에는 앱을 HTTPS로 배포하고 `MEDIA_PUBLIC_BASE_URL`을 그 공개 주소로 바꿉니다.

로컬 환경에서는 연결 화면과 OAuth 반환 흐름까지만 확인할 수 있습니다. Meta 서버가 이미지를 가져가야 하므로 `localhost` 주소로는 실제 게시 검증이 불가능합니다. 앱은 연결되었더라도 자동으로 게시하지 않으며, 최종 화면의 **승인하고 Instagram에 게시** 버튼을 사용자가 직접 눌러야 합니다.

## 확인 명령

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium
npx playwright test
```

## 데이터 보관

설정·초안·미디어는 기본적으로 `data/` 아래에 저장되며 Git에서 제외됩니다. 백업하려면 앱을 종료한 뒤 `data/` 폴더 전체를 복사하세요. 업로드한 원본 사진은 별도 위치에 보존합니다.

Render 무료 서버의 디스크는 재시작 시 지워집니다. 영구 보관하려면 Supabase 무료 프로젝트에서 이름이 정확히 `mukdong-private`인 **비공개 Storage bucket**을 만들고, Render 서비스의 Environment에 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 함께 설정하세요. 두 값 중 하나만 있으면 앱은 임시 디스크로 조용히 되돌아가지 않고 오류를 표시합니다. 비밀키는 브라우저 코드나 Git에 넣지 마세요. 연결 후 새로 저장하는 초안·설정·업로드 원본은 이 버킷에 보관됩니다. 기존 로컬 `data/` 파일은 자동으로 전송되지 않습니다. 롤백하려면 Render의 두 변수를 함께 제거하면 기존 로컬 저장 방식으로 돌아가지만, Supabase에 저장된 자료가 로컬로 자동 복사되지는 않습니다.

Supabase 무료 플랜은 저장 용량과 전송량 제한이 있으며, 일정 기간 사용하지 않으면 프로젝트가 일시정지될 수 있습니다. 이 경우 대시보드에서 재개해야 합니다. 이미지가 포함된 초안은 용량을 빨리 사용하므로 중요한 결과는 ZIP으로 내려받아 별도 보관하세요. 현재 Instagram 연결 정보·게시 기록은 이 외부 저장소로 이동하지 않았으므로 Meta 게시 기능을 활성화하기 전에는 별도 영구화 검증이 필요합니다.

`내 초안`에서 게시 희망일시(한국시간)와 최종 확인 상태를 저장할 수 있습니다. 이미지나 문안을 고치면 최종 확인 표시는 해제되고, 희망일시는 유지됩니다. 이 값은 예약 준비를 위한 메모이며 알림이나 자동 게시를 실행하지 않습니다.

## 첫 버전 범위

현재 버전은 초안 제작, 로컬 내보내기, 게시 희망일시 기록, Instagram 계정 연결, 사용자 승인 후 즉시 게시까지 지원합니다. 실제 예약 실행과 실시간 트렌드 수집은 아직 포함하지 않습니다. 실제 게시를 사용하려면 Meta 앱 설정과 HTTPS 배포가 필요합니다.
