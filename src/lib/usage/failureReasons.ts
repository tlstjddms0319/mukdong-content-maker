// 실패 이유(이미지 AI). 예전에는 "실패 88번"만 세고 이유를 남기지 않아 Higgsfield가 왜 실패하는지 알 수 없었다(사장님 지적 2026-10-10).
// 설정 화면(클라이언트)도 이름표를 써서, 서버 전용 장부(ledger.ts)와 따로 둔다.
export const FAILURE_REASONS=["timeout","rejected","nsfw","credits","auth","failed","other"] as const;
export type FailureReason=typeof FAILURE_REASONS[number];
export const FAILURE_REASON_LABELS:Record<FailureReason,string>={timeout:"시간 초과",rejected:"모델이 요청 거절",nsfw:"안전 필터",credits:"크레딧·한도",auth:"키 문제",failed:"작업 실패",other:"기타"};
