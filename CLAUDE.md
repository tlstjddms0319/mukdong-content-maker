@AGENTS.md

# Graphify (프로젝트 지식 그래프)

웹 세션은 시작할 때 `.claude/hooks/session-start.sh`가 Graphify를 설치하고 `graphify-out/`에 코드 그래프를 만든다(커밋하지 않음).

- 기능을 바꾸기 전에 관련 화면·데이터 필드·프롬프트·검증 규칙의 연결을 먼저 조회한다:
  `graphify explain "함수나 파일 이름"`, `graphify path "A" "B"`, `graphify query "질문"`.
  (예: `graphify explain "buildImagePrompt"` → OpenAI·Higgsfield·Cloudflare가 모두 이 함수를 쓴다는 것이 보인다.)
- 그래프는 참고용이다. 고치기 전에는 실제 파일을 읽어 확인한다.
- 코드를 많이 바꾼 뒤에는 `graphify update .`로 갱신한다(AI 호출 없음, 약 10초).
- `graphify-out/GRAPH_REPORT.md`의 "Built from commit"이 `git rev-parse HEAD`와 다르면 그래프가 오래된 것이다.
