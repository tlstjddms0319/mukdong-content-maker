# 묵동 콘텐츠 메이커

비전문 사용자도 주제 선택 → 이미지 제작 → 문안 확인 → 다운로드의 네 단계로 인스타그램 게시물 초안을 만드는 로컬 웹앱입니다.

## 시작하기

Node.js 20 이상이 필요합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. `.env.local`의 `OPENAI_API_KEY=` 뒤에 본인의 키를 입력하세요. 키는 브라우저, 초안 파일, 로그에 저장하지 않습니다. 키가 없어도 기본 추천과 화면 흐름을 확인할 수 있습니다.

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

현재 버전은 초안 제작과 로컬 내보내기까지만 지원합니다. 로그인, 클라우드 배포, Instagram 연결, 예약, 자동 게시, 실시간 트렌드 수집은 포함하지 않습니다. 향후 자동 게시는 사용자가 명시적으로 승인한 콘텐츠만 대상으로 설계합니다.
