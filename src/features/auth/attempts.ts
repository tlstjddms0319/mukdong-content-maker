const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1_000;

const attempts = new Map<string, { failures: number; blockedUntil?: number }>();

export function recordLoginAttempt(key: string, accepted: boolean, now = Date.now()): { blocked: boolean } {
  const previous = attempts.get(key);
  if (previous?.blockedUntil && now < previous.blockedUntil) return { blocked: true };

  if (previous?.blockedUntil) attempts.delete(key);
  if (accepted) {
    attempts.delete(key);
    return { blocked: false };
  }

  const failures = (attempts.get(key)?.failures ?? 0) + 1;
  if (failures >= MAX_FAILED_ATTEMPTS) {
    attempts.set(key, { failures, blockedUntil: now + LOCKOUT_MS });
    return { blocked: true };
  }

  attempts.set(key, { failures });
  return { blocked: false };
}
