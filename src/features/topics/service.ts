import { TopicInputSchema, TopicSuggestionsSchema, type TopicInput, type TopicSuggestion } from "./schema";

export interface TopicAiClient {
  suggest(input: TopicInput): Promise<TopicSuggestion[]>;
}

const TOPIC_DIRECTIONS = [
  ["홍어 입문", "삼합을 먹는 순서", "모임 메뉴"],
  ["홍어와 막걸리 조합", "상차림 비주얼", "함께 나누는 장면"],
  ["향과 식감 취향", "처음 주문할 때 궁금한 점", "고객 참여형 조합 질문"],
  ["묵동에서의 저녁", "한 접시를 준비하는 과정", "날씨와 어울리는 메뉴"],
] as const;

const FALLBACK_TOPIC_ROUNDS: Omit<TopicSuggestion, "id">[][] = [
  [
    { title:"처음 먹는 홍어, 삼합부터", summary:"홍어가 낯선 손님도 이해하기 쉽게 삼합의 구성을 소개합니다.", reason:"처음 방문하는 손님의 선택 부담을 낮출 수 있어요.", audience:"A", imageBrief:"접시 위 홍어 삼합을 가까이 담은 밝고 선명한 실제 음식 사진, 세로 4:5" },
    { title:"한 점을 더 맛있게 먹는 순서", summary:"재료를 하나씩 조합하는 과정을 짧고 쉽게 보여줍니다.", reason:"저장해서 다시 보기 좋은 실용적인 콘텐츠예요.", audience:"B", imageBrief:"젓가락으로 삼합 한 점을 만드는 순간을 담은 실제 음식 사진, 세로 4:5" },
    { title:"오늘 모임 메뉴로 홍어 삼합", summary:"함께 나누기 좋은 음식이라는 장면에 집중합니다.", reason:"모임 장소를 찾는 손님에게 가게를 자연스럽게 알릴 수 있어요.", audience:"C", imageBrief:"여럿이 나눠 먹기 좋은 홍어 삼합 상차림 중심의 실제 사진, 사람 얼굴 없음, 세로 4:5" },
  ],
  [
    { title:"막걸리 한 잔과 어울리는 홍어 한 점", summary:"홍어와 막걸리를 함께 즐기는 장면을 소개합니다.", reason:"메뉴 조합을 고민하는 손님이 쉽게 선택할 수 있어요.", audience:"A", imageBrief:"홍어 한 접시와 막걸리 잔을 자연스럽게 함께 담은 실제 음식 사진, 세로 4:5" },
    { title:"푸짐한 홍어 한 상, 사진으로 먼저 보기", summary:"다양한 재료가 놓인 상차림의 풍성함을 보여줍니다.", reason:"첫 화면에서 메뉴의 인상을 분명하게 전달할 수 있어요.", audience:"B", imageBrief:"홍어와 곁들임이 고르게 보이는 정돈된 상차림 실제 사진, 세로 4:5" },
    { title:"함께 먹을수록 즐거운 홍어 한 상", summary:"여럿이 음식을 나누는 편안한 분위기에 집중합니다.", reason:"친구 모임이나 식사 자리를 찾는 손님에게 잘 맞아요.", audience:"C", imageBrief:"여러 사람이 나눠 먹기 좋은 홍어 상차림, 얼굴 없이 손과 음식 중심의 실제 사진, 세로 4:5" },
  ],
  [
    { title:"홍어 향과 식감, 내 취향 찾기", summary:"향과 식감을 부담 없는 표현으로 소개합니다.", reason:"홍어를 궁금해하는 손님이 자신의 취향을 떠올릴 수 있어요.", audience:"A", imageBrief:"홍어의 결이 잘 보이는 한 점을 가까이 담은 실제 음식 사진, 세로 4:5" },
    { title:"처음 주문할 때 궁금한 세 가지", summary:"첫 방문 손님이 궁금해할 내용을 짧은 질문과 답으로 정리합니다.", reason:"주문 전 망설임을 줄이는 안내형 콘텐츠가 돼요.", audience:"B", imageBrief:"메뉴를 고르는 장면과 홍어 상차림을 함께 담은 실제 사진, 사람 얼굴 없음, 세로 4:5" },
    { title:"오늘은 어떤 조합으로 먹을까요?", summary:"좋아하는 곁들임 조합을 댓글로 묻는 참여형 주제입니다.", reason:"손님이 자신의 취향을 자연스럽게 이야기할 수 있어요.", audience:"C", imageBrief:"여러 곁들임을 선택할 수 있게 나누어 담은 홍어 상차림 실제 사진, 세로 4:5" },
  ],
  [
    { title:"묵동에서 홍어가 생각나는 저녁", summary:"동네에서 편하게 홍어를 즐기는 저녁 장면을 보여줍니다.", reason:"가까운 식사 장소를 찾는 손님에게 방문 계기를 만들 수 있어요.", audience:"A", imageBrief:"따뜻한 저녁 분위기의 홍어 상차림 실제 사진, 간판이나 확인되지 않은 정보 없음, 세로 4:5" },
    { title:"한 접시가 준비되는 순간", summary:"정갈하게 음식을 담아내는 과정에 집중합니다.", reason:"완성된 메뉴와는 다른 생생한 장면을 보여줄 수 있어요.", audience:"B", imageBrief:"홍어와 곁들임을 접시에 정돈해 담는 손을 포착한 실제 사진, 얼굴 없음, 세로 4:5" },
    { title:"비 오는 날 떠오르는 홍어와 막걸리", summary:"날씨와 음식이 어울리는 편안한 분위기를 담습니다.", reason:"그날의 상황과 연결되어 기억하기 쉬운 콘텐츠예요.", audience:"C", imageBrief:"창가의 잔잔한 빗빛과 홍어, 막걸리 상차림을 담은 실제 사진, 세로 4:5" },
  ],
];

function roundIndex(round: number): number {
  return round % TOPIC_DIRECTIONS.length;
}

export function topicDirectionsForRound(round: number): readonly string[] {
  return TOPIC_DIRECTIONS[roundIndex(round)];
}

function fallbackTopics(round: number): TopicSuggestion[] {
  const index = roundIndex(round);
  return FALLBACK_TOPIC_ROUNDS[index].map((topic, itemIndex) => ({ ...topic, id: `fallback-${index + 1}-${itemIndex + 1}` }));
}

export async function suggestTopics(input: TopicInput, ai?: TopicAiClient): Promise<TopicSuggestion[]> {
  const parsed = TopicInputSchema.parse(input);
  if (!ai) return fallbackTopics(parsed.recommendationRound);

  try {
    const suggestions = TopicSuggestionsSchema.parse(await ai.suggest(parsed));
    const titles = suggestions.map((item) => item.title.trim().toLocaleLowerCase("ko-KR"));
    const excluded = new Set(parsed.excludeTitles.map((title) => title.trim().toLocaleLowerCase("ko-KR")));
    if (new Set(titles).size !== titles.length || titles.some((title) => excluded.has(title))) {
      return fallbackTopics(parsed.recommendationRound);
    }
    return suggestions;
  } catch {
    return fallbackTopics(parsed.recommendationRound);
  }
}
