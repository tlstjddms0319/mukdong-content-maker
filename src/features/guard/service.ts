import { BLOCKED_CLAIMS } from "./rules";

export type GuardResult = {
  blocked: string[];
  verify: string[];
  passed: string[];
};

export function checkTextClaims(text: string): GuardResult {
  const blocked = BLOCKED_CLAIMS
    .filter(({ phrase }) => text.includes(phrase))
    .map(({ message }) => message);
  const verify: string[] = [];

  if (/\d{1,3}(?:,\d{3})*\s*원/.test(text)) verify.push("가격이 현재 정보와 같은지 확인해 주세요.");
  if (/(?:영업|휴무|\d{1,2}시부터|\d{1,2}:\d{2})/.test(text)) verify.push("영업시간과 휴무일을 확인해 주세요.");

  return { blocked, verify, passed: blocked.length === 0 ? ["금지 표현 검사 완료"] : [] };
}
