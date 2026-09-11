# 묵동 콘텐츠 메이커

비전문 사용자도 주제 선택 → 이미지 제작 → 문안 확인 → 다운로드의 네 단계로 인스타그램 게시물 초안을 만드는 로컬 웹앱입니다.

## 시작하기

Node.js 20 이상이 필요합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. `.env.local`에 본인의 OpenAI·Gemini 키를 입력하세요. 키는 브라우저, 초안 파일, 로그에 저장하지 않습니다. 키가 없어도 기본 추천과 화면 흐름을 확인할 수 있습니다.

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

## 첫 버전 범위

현재 버전은 초안 제작, 로컬 내보내기, Instagram 계정 연결, 사용자 승인 후 즉시 게시까지 지원합니다. 예약 게시와 실시간 트렌드 수집은 아직 포함하지 않습니다. 실제 게시를 사용하려면 Meta 앱 설정과 HTTPS 배포가 필요합니다.
