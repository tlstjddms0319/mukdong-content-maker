import { TopicInputSchema, TopicSuggestionsSchema, type TopicInput, type TopicSuggestion } from "./schema";

export interface TopicAiClient {
  suggest(input: TopicInput): Promise<TopicSuggestion[]>;
}

const FALLBACK_TOPICS: Omit<TopicSuggestion, "id">[] = [
  {
    title: "처음 먹는 홍어, 삼합부터",
    summary: "홍어가 낯선 손님도 이해하기 쉽게 삼합의 구성을 소개합니다.",
    reason: "처음 방문하는 손님의 선택 부담을 낮출 수 있어요.",
    audience: "A",
    imageBrief: "접시 위 홍어 삼합을 가까이 담은 밝고 선명한 실제 음식 사진, 세로 4:5",
  },
  {
    title: "한 점을 더 맛있게 먹는 순서",
    summary: "재료를 하나씩 조합하는 과정을 짧고 쉽게 보여줍니다.",
    reason: "저장해서 다시 보기 좋은 실용적인 콘텐츠예요.",
    audience: "B",
    imageBrief: "젓가락으로 삼합 한 점을 만드는 순간을 담은 실제 음식 사진, 세로 4:5",
  },
  {
    title: "오늘 모임 메뉴로 홍어 삼합",
    summary: "함께 나누기 좋은 음식이라는 장면에 집중합니다.",
    reason: "모임 장소를 찾는 손님에게 가게를 자연스럽게 알릴 수 있어요.",
    audience: "C",
    imageBrief: "여럿이 나눠 먹기 좋은 홍어 삼합 상차림 중심의 실제 사진, 사람 얼굴 없음, 세로 4:5",
  },
];

function fallbackTopics(): TopicSuggestion[] {
  return FALLBACK_TOPICS.map((topic, index) => ({ ...topic, id: `fallback-${index + 1}` }));
}

export async function suggestTopics(input: TopicInput, ai?: TopicAiClient): Promise<TopicSuggestion[]> {
  const parsed = TopicInputSchema.parse(input);
  if (!ai) return fallbackTopics();

  try {
    return TopicSuggestionsSchema.parse(await ai.suggest(parsed));
  } catch {
    return fallbackTopics();
  }
}
