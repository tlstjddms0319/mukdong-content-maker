import { BLOCKED_CLAIMS, BLOCKED_PATTERNS, SERVING_VERB, STORE_SUBJECT_SERVING, VERIFY_PATTERNS } from "./rules";

export type GuardResult = {
  blocked: string[];
  verify: string[];
  passed: string[];
};

// 가게 이야기 메모(설정): 사장님이 직접 적은 가게 사실. 확인이 필요한 사실(원산지·숙성 기간·가격 등)이라도 메모에 그대로 있는 말이면
// 확인된 사실로 보고 통과시킨다. 향 보장·모두가 좋아한다는 단정(BLOCKED_PATTERNS)은 메모에 있어도 막는다.
const compact = (value: string) => value.replace(/\s+/g, "");
function knownByNotes(text: string, pattern: RegExp, notes: string): boolean {
  if (!notes.trim()) return false;
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const found = [...text.matchAll(global)].map(match => compact(match[0])).filter(Boolean);
  return found.length > 0 && found.every(value => compact(notes).includes(value));
}

export function checkTextClaims(text: string, { storeNotes = "" }: { storeNotes?: string } = {}): GuardResult {
  // 같은 뜻의 표현이 여러 규칙에 걸려도(예: "누구나 먹음"은 "누구나 먹"에도 걸림) 안내는 한 번만 보여 준다.
  // 원산지 낱말("흑산도")은 메모에 있으면 쓸 수 있다. 다른 낱말 목록은 향·경험 보장이라 메모와 상관없이 막는다.
  const blocked = [...new Set([
    ...BLOCKED_CLAIMS.filter(({ phrase }) => text.includes(phrase) && !(phrase === "흑산도" && storeNotes.includes(phrase))).map(({ message }) => message),
    ...BLOCKED_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ message }) => message),
  ])];
  const verify = [...new Set(VERIFY_PATTERNS.filter(({ pattern }) => pattern.test(text) && !knownByNotes(text, pattern, storeNotes)).map(({ message }) => message))];
  return { blocked, verify, passed: blocked.length === 0 ? ["금지 표현 검사 완료"] : [] };
}

const SERVING_MESSAGE = "확인되지 않은 매장 제공 내용을 단정하지 말고 메뉴 확인·가게 탐색으로 연결하세요.";

// 가게가 무엇을 준비·제공·판매한다고 단정하는지. storeParagraph=true면 가게 소개 문단이라 주어가 생략돼도 가게로 본다.
export function servingClaimIssues(text: string, { storeParagraph = false }: { storeParagraph?: boolean } = {}): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const found = sentences.some(sentence => STORE_SUBJECT_SERVING.test(sentence) || (storeParagraph && SERVING_VERB.test(sentence)));
  return found ? [SERVING_MESSAGE] : [];
}
