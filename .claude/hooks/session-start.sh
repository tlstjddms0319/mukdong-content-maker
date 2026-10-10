#!/bin/bash
# 클라우드(웹) 세션 시작 때: npm 의존성과 Graphify(프로젝트 지식 그래프 CLI)를 설치하고 코드 그래프를 만든다.
# 그래프는 graphify-out/에 생기고 .gitignore로 커밋되지 않는다. 코드 그래프는 tree-sitter로 로컬에서 만들어 AI 호출·비용이 없다.
set -euo pipefail

# 사용자 컴퓨터에서는 돌리지 않는다(웹 세션 전용).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 1) 앱 의존성(테스트·lint용). 이미 맞으면 금방 끝난다.
npm install --no-audit --no-fund --loglevel=error

# 2) Graphify CLI. 버전을 고정해 세션마다 같은 그래프 형식을 쓴다.
GRAPHIFY_VERSION="0.9.84"
# (pipefail에서 grep -q가 일찍 끝나면 pip show가 깨진 파이프로 실패하므로, 출력을 먼저 받아 비교한다.)
installed="$(python3 -m pip show graphifyy 2>/dev/null || true)"
if ! grep -qx "Version: ${GRAPHIFY_VERSION}" <<<"$installed"; then
  python3 -m pip install --user --quiet --disable-pip-version-check "graphifyy==${GRAPHIFY_VERSION}"
fi
# pip --user 설치 위치를 세션 PATH에 넣는다.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

# 3) 코드 그래프 만들기(약 10~60초). 실패해도 세션 시작은 막지 않는다.
"$HOME/.local/bin/graphify" update . >/dev/null 2>&1 || echo "graphify update 실패: 세션에서 'graphify update .'을 다시 실행하세요." >&2
