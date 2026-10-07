import { BLOCKED_CLAIMS, BLOCKED_PATTERNS, SERVING_VERB, STORE_SUBJECT_SERVING, VERIFY_PATTERNS } from "./rules";

export type GuardResult = {
  blocked: string[];
  verify: string[];
  passed: string[];
};

export function checkTextClaims(text: string): GuardResult {
  // 같은 뜻의 표현이 여러 규칙에 걸려도(예: "누구나 먹음"은 "누구나 먹"에도 걸림) 안내는 한 번만 보여 준다.
  const blocked = [...new Set([
    ...BLOCKED_CLAIMS.filter(({ phrase }) => text.includes(phrase)).map(({ message }) => message),
    ...BLOCKED_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ message }) => message),
  ])];
  const verify = [...new Set(VERIFY_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ message }) => message))];
  return { blocked, verify, passed: blocked.length === 0 ? ["금지 표현 검사 완료"] : [] };
}

const SERVING_MESSAGE = "확인되지 않은 매장 제공 내용을 단정하지 말고 메뉴 확인·가게 탐색으로 연결하세요.";

// 가게가 무엇을 준비·제공·판매한다고 단정하는지. storeParagraph=true면 가게 소개 문단이라 주어가 생략돼도 가게로 본다.
export function servingClaimIssues(text: string, { storeParagraph = false }: { storeParagraph?: boolean } = {}): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const found = sentences.some(sentence => STORE_SUBJECT_SERVING.test(sentence) || (storeParagraph && SERVING_VERB.test(sentence)));
  return found ? [SERVING_MESSAGE] : [];
}
