// scripts/check-higgsfield.mjs
// Usage: npm run check:higgsfield   (keys read from .env.local; no image is generated and no secret is printed)
// 없는 요청 번호의 상태를 물어봐서 키만 확인한다. 401이면 키가 틀렸고, 그 외 응답이면 인증은 통과한 것이다.
try { process.loadEnvFile(".env.local"); } catch {}

const id = process.env.HF_API_KEY_ID?.trim();
const secret = process.env.HF_API_KEY_SECRET?.trim();
if (!id || !secret) {
  console.log("HF_API_KEY_ID 또는 HF_API_KEY_SECRET이 비어 있어요. .env.local에 두 값을 넣어 주세요.");
  process.exit(1);
}

const response = await fetch("https://api.higgsfield.ai/requests/00000000-0000-4000-8000-000000000000/status", {
  headers: { Authorization: `Key ${id}:${secret}`, Accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
}).catch((error) => ({ status: 0, error }));

if (response.status === 0) {
  console.log(`Higgsfield에 연결하지 못했어요: ${response.error?.message ?? "네트워크 오류"}`);
  process.exit(1);
}
if (response.status === 401) {
  console.log("키가 거부됐어요(401). 키 ID와 시크릿이 서로 맞는 한 쌍인지, 앞뒤 공백이 없는지 확인해 주세요.");
  process.exit(1);
}
console.log(`키 인증 통과 (응답 ${response.status}). 이미지 생성 연결을 진행할 수 있어요.`);
