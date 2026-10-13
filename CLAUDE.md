@AGENTS.md

# Graphify (프로젝트 지식 그래프)

웹 세션은 시작할 때 `.claude/hooks/session-start.sh`가 Graphify를 설치하고 `graphify-out/`에 코드 그래프를 만든다(커밋하지 않음).

- 기능을 바꾸기 전에 관련 화면·데이터 필드·프롬프트·검증 규칙의 연결을 먼저 조회한다:
  `graphify explain "함수나 파일 이름"`, `graphify path "A" "B"`, `graphify query "질문"`.
  (예: `graphify explain "buildImagePrompt"` → OpenAI·Higgsfield·Cloudflare가 모두 이 함수를 쓴다는 것이 보인다.)
- 그래프는 참고용이다. 고치기 전에는 실제 파일을 읽어 확인한다.
- 코드를 많이 바꾼 뒤에는 `graphify update .`로 갱신한다(AI 호출 없음, 약 10초).
- `graphify-out/GRAPH_REPORT.md`의 "Built from commit"이 `git rev-parse HEAD`와 다르면 그래프가 오래된 것이다.

# PR 올리기 전 (충돌·배포 실패 재발 방지, 2026-10-13)

- 한 번에 **열린 PR은 하나**만 둔다. 같은 파일을 고치는 작업을 PR 여러 개로 나누지 않는다(같은 기반에서 나뉜 PR은 하나가 합쳐지면 다른 하나가 충돌한다).
- PR을 열기 전과 사장님이 다른 PR을 합친 뒤에는 **반드시 `git merge origin/master`**로 최신 상태를 받는다.
- 올리기 전 **`npm run check`**(타입 검사 + 테스트 + lint)를 돌려 모두 통과해야 한다. `next build`는 테스트 파일까지 타입 검사하므로 vitest만으로는 부족하다(#159 배포 실패).
- 사장님이 GitHub 웹에서 직접 고친 파일(README 등)은 PR을 열기 전에 먼저 받는다.
