const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1_000;
// 접속 주소마다 따로 센다. 예전에는 모두 "owner" 한 칸에 세서, 아무나 틀린 암호 5번으로 사장님 로그인을 15분씩 막을 수 있었다.
// 여러 주소에서 몰아치는 경우를 위해 전체 실패도 따로 세되, 한도를 훨씬 높게 둔다.
export const GLOBAL_MAX_FAILED_ATTEMPTS = 100;
const MAX_TRACKED_KEYS = 2_000;

const attempts = new Map<string, { failures: number; blockedUntil?: number; firstAt: number }>();

export function recordLoginAttempt(key: string, accepted: boolean, now = Date.now(), maxFailures = MAX_FAILED_ATTEMPTS): { blocked: boolean } {
  const previous = attempts.get(key);
  if (previous?.blockedUntil && now < previous.blockedUntil) return { blocked: true };

  // 막힌 시간이 지났거나, 처음 실패한 지 15분이 지난 기록은 새로 센다.
  if (previous && (previous.blockedUntil || now - previous.firstAt >= LOCKOUT_MS)) attempts.delete(key);
  if (accepted) {
    attempts.delete(key);
    return { blocked: false };
  }

  const current = attempts.get(key);
  const failures = (current?.failures ?? 0) + 1;
  // 기억하는 주소가 너무 많아지면 오래된 것부터 지운다(메모리 보호).
  if (!current && attempts.size >= MAX_TRACKED_KEYS) attempts.delete(attempts.keys().next().value!);
  if (failures >= maxFailures) {
    attempts.set(key, { failures, blockedUntil: now + LOCKOUT_MS, firstAt: current?.firstAt ?? now });
    return { blocked: true };
  }

  attempts.set(key, { failures, firstAt: current?.firstAt ?? now });
  return { blocked: false };
}

// 요청한 곳의 주소. 모르면 "unknown".
// Render 앞단의 Cloudflare가 넣는 cf-connecting-ip·true-client-ip를 먼저 쓴다(접속한 쪽이 보낸 값은 Cloudflare가 덮어쓴다).
// x-forwarded-for는 Render가 접속한 쪽이 보낸 값 뒤에 덧붙이기만 해서, 맨 앞 값은 마음대로 바꿔 보낼 수 있다.
// 예전에는 그 맨 앞 값으로 세어, 요청마다 주소를 바꿔 보내면 주소별 5번 한도를 피할 수 있었다(전체 100번 한도만 남음).
export function clientAddress(headers: Pick<Headers, "get"> | undefined): string {
  const edge = headers?.get("cf-connecting-ip")?.trim() || headers?.get("true-client-ip")?.trim();
  if (edge) return edge;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip")?.trim() || "unknown";
}

// 로그인 한 번을 기록한다: 주소별 한도(5번)와 전체 한도(100번) 중 하나라도 막히면 막는다.
export function recordOwnerLogin(address: string, accepted: boolean, now = Date.now()): { blocked: boolean } {
  const local = recordLoginAttempt(`ip:${address}`, accepted, now);
  const global = recordLoginAttempt("global", accepted, now, GLOBAL_MAX_FAILED_ATTEMPTS);
  return { blocked: local.blocked || global.blocked };
}
