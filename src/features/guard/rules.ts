export const BLOCKED_CLAIMS = [
  { phrase: "흑산도", message: "원산지는 확인된 가게 정보만 사용할 수 있어요." },
  { phrase: "냄새 없음", message: "향이 없다고 단정할 수 없어요." },
  { phrase: "누구나 먹음", message: "모든 사람의 경험을 단정할 수 없어요." },
  { phrase: "삭힘 선택 가능", message: "제공 여부가 확인되지 않은 서비스예요." },
  // 홍어 향과 호불호를 부정하는 보장 표현. 카드 문안 검수(planReview)와 캡션 검사가 함께 쓴다.
  { phrase: "누구나 좋아", message: "모든 사람의 경험을 단정할 수 없어요." },
  { phrase: "누구나 먹", message: "모든 사람의 경험을 단정할 수 없어요." },
  { phrase: "냄새가 전혀", message: "향이 없다고 단정할 수 없어요." },
  { phrase: "향이 전혀 없", message: "향이 없다고 단정할 수 없어요." },
  { phrase: "냄새가 하나도", message: "향이 없다고 단정할 수 없어요." },
  { phrase: "향이 사라져", message: "향이 없다고 단정할 수 없어요." },
] as const;
