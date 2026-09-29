import { TopicInputSchema, TopicSuggestionsSchema, type TopicInput, type TopicSuggestion } from "./schema";

export interface TopicAiClient {
  suggest(input:TopicInput):Promise<TopicSuggestion[]>;
}

const TOPIC_DIRECTIONS = [
  ["익숙한 음식 조합의 이유","해산물 식감에 대한 궁금증","홍어삼합을 함께 먹는 이유"],
  ["발효 음식에 대한 궁금증","음식 취향이 갈리는 이유","홍어의 향과 식감"],
  ["같은 재료를 다르게 먹는 이유","친구와 음식을 나눌 때의 궁금증","홍어를 처음 맛보는 방법"],
  ["곁들임이 맛에 주는 변화","음식 이름과 식문화에 대한 궁금증","홍어와 다른 해산물 비교"],
] as const;

const FALLBACK_TOPIC_ROUNDS:Omit<TopicSuggestion,"id">[][] = [
  [
    {title:"수육에는 왜 김치를 곁들일까?",summary:"수육에 김치를 곁들이는 익숙한 장면에서 맛과 식감의 차이를 설명합니다. 여기에 홍어를 더한 삼합을 사례로 연결하며, 특정 성분이 냄새를 없앤다는 설명은 확인 전 사용하지 않습니다.",reason:"수육을 먹어 본 사람이 익숙한 곁들임의 이유를 떠올릴 수 있어요.",audience:"C",imageBrief:"홍어·수육·묵은지 세 재료가 구분되는 정돈된 한 접시"},
    {title:"같은 회인데 왜 식감은 다를까?",summary:"회를 고를 때 부드러움과 탄력 중 무엇을 좋아하는지 질문합니다. 종류와 부위에 따른 식감 차이는 출처를 확인해 설명하고, 홍어의 식감과 향을 함께 알아보는 흐름으로 연결합니다.",reason:"회를 즐기던 사람이 자신의 취향으로 읽기 시작할 수 있어요.",audience:"A",imageBrief:"홍어의 얇은 단면과 결이 보이는 한 점"},
    {title:"홍어는 왜 수육이랑 먹을까?",summary:"홍어의 탄력 있는 식감에 수육의 부드러움과 묵은지의 새콤함을 곁들이는 조합을 설명합니다. 특유의 향은 남는다고 알리고, 작은 한입으로 취향을 살펴보는 방법으로 마무리합니다.",reason:"삼합 사진을 본 사람이 세 재료를 함께 먹는 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"홍어·수육·묵은지를 조금씩 곁들인 한입"},
  ],
  [
    {title:"치즈는 익숙한데 다른 발효 음식은 왜 낯설까?",summary:"발효 음식마다 향과 먹어 본 경험이 다르다는 점에서 질문을 시작합니다. 치즈와 홍어를 같은 맛으로 취급하지 않고 취향 차이로 연결하며, 낯섦의 심리적 원인은 출처 확인 없이 단정하지 않습니다.",reason:"익숙한 치즈를 떠올리며 낯선 음식에 대한 취향을 비교할 수 있어요.",audience:"C",imageBrief:"발효 음식 비교 설명에 사용할 홍어 한 접시"},
    {title:"같은 음식을 먹는데 왜 취향은 갈릴까?",summary:"친구와 같은 메뉴를 먹고도 향과 식감에 대한 반응이 다른 장면을 소개합니다. 홍어를 사례로 서로의 취향을 확인하는 방법을 제안하고, 유전이나 감각의 원인은 검증 없이 설명하지 않습니다.",reason:"친구와 메뉴를 정하며 겪었던 차이를 떠올릴 수 있어요.",audience:"B",imageBrief:"서로 나누어 맛보기 좋게 놓인 홍어와 곁들임"},
    {title:"홍어의 톡 쏘는 향은 어디서 올까?",summary:"홍어의 향이 궁금한 독자에게 삭힘과 향의 관계를 설명하는 주제입니다. 성분과 변화 과정은 공신력 있는 출처 확인 후 쓰고, 향을 낯설어할 수 있다는 점과 작은 한입으로 취향을 살피는 방법을 덧붙입니다.",reason:"홍어를 먹어 보지 않은 사람도 향의 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"삭힌 홍어의 단면을 차분하게 보여주는 음식 장면"},
  ],
  [
    {title:"회로 먹을 때와 익힐 때 식감은 왜 달라질까?",summary:"같은 해산물의 회와 익힌 요리를 비교하는 질문에서 시작합니다. 조리와 식감의 관계는 출처를 확인하고 홍어회와 홍어전의 차이로 이어가되, 익히면 향이 없어지거나 입문하기 쉽다고 단정하지 않습니다.",reason:"회와 구이·전을 모두 먹어 본 사람에게 익숙한 차이를 짚어줘요.",audience:"A",imageBrief:"홍어회와 홍어전을 구분해 설명할 수 있는 음식 장면"},
    {title:"같은 한 접시인데 왜 서로 다른 한 점을 고를까?",summary:"친구와 한 접시를 나누면서 각자 선호하는 재료와 비율이 다른 장면을 살펴봅니다. 홍어삼합도 작은 양을 곁들이며 취향을 알아가는 사례로 소개하고 정해진 비율이 있다고 말하지 않습니다.",reason:"함께 식사할 때의 작은 선택 차이가 이야기의 시작이 돼요.",audience:"B",imageBrief:"각 재료를 조금씩 골라 곁들일 수 있는 홍어 상차림"},
    {title:"홍어를 처음 먹는다면 한입에 얼마나 올릴까?",summary:"홍어의 향이 낯선 사람이 첫 한입을 고민하는 장면을 다룹니다. 고정된 정답이나 쉬운 입문을 보장하지 않고, 홍어를 조금씩 곁들여 취향에 맞는 비율을 찾는 방법을 설명합니다.",reason:"처음 맛보려는 사람이 바로 떠올릴 구체적인 질문이에요.",audience:"C",imageBrief:"홍어를 소량 곁들여 만든 한입"},
  ],
  [
    {title:"고기에 새콤한 곁들임을 더하면 뭐가 달라질까?",summary:"고기와 새콤한 곁들임을 함께 먹는 경험에서 맛의 대비를 살펴봅니다. 수육·묵은지에 홍어를 더하는 조합으로 이어가며, 소화나 건강에 좋다는 근거 없는 효능은 설명하지 않습니다.",reason:"평소 먹는 고기와 반찬의 조합에서 출발해 읽기 쉬워요.",audience:"A",imageBrief:"홍어와 수육, 묵은지가 각각 보이는 한 접시"},
    {title:"음식 이름에 붙는 숫자는 무엇을 뜻할까?",summary:"음식 이름 속 숫자가 재료의 조합을 가리키는 사례에 관심을 유도합니다. 홍어·수육·묵은지를 함께 먹는 삼합으로 연결하며, 이름의 역사나 최초 유래는 출처가 없으면 만들지 않습니다.",reason:"익숙한 음식 이름에도 뜻이 있는지 궁금해하게 만드는 질문이에요.",audience:"C",imageBrief:"홍어삼합의 세 재료가 뚜렷이 구분되는 장면"},
    {title:"홍어와 일반 생선회는 먹는 느낌이 어떻게 다를까?",summary:"회에 익숙한 독자에게 홍어의 식감과 삭힌 향을 비교하는 관점을 제안합니다. 생선회를 하나의 맛으로 일반화하지 않고 개인의 선호를 존중하며 메뉴를 살펴보는 흐름으로 연결합니다.",reason:"이미 좋아하는 회를 기준으로 다른 해산물을 이해할 수 있어요.",audience:"A",imageBrief:"홍어의 단면과 한 점의 질감을 살펴보는 음식 장면"},
  ],
];

const titleKey=(title:string)=>title.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu,"");

export function topicDirectionsForRound(round:number):readonly string[] {
  return TOPIC_DIRECTIONS[round%TOPIC_DIRECTIONS.length];
}

export function fallbackTopics(round=0,excludeTitles:readonly string[]=[]):TopicSuggestion[] {
  const excluded=new Set(excludeTitles.map(titleKey));
  // Input permits at most three exclusions; one of four disjoint rounds stays available.
  for(let offset=0;offset<FALLBACK_TOPIC_ROUNDS.length;offset++){
    const index=(round+offset)%FALLBACK_TOPIC_ROUNDS.length;
    const topics=FALLBACK_TOPIC_ROUNDS[index];
    if(topics.every(topic=>!excluded.has(titleKey(topic.title))))return topics.map((topic,itemIndex)=>({...topic,id:"fallback-"+(index+1)+"-"+(itemIndex+1)}));
  }
  throw new Error("다른 추천 주제를 찾지 못했습니다.");
}

// Structural editorial checks, not a fact checker or a judgment of marketing performance.
export function followsCuriosityBrief(topics:TopicSuggestion[],storeName:string):boolean {
  return topics.every(topic=>/[?？]$/.test(topic.title.trim())&&!topic.title.includes(storeName)&&topic.summary.trim().length>=30&&topic.summary.includes("홍어"))
    && topics.slice(0,2).every(topic=>!/홍어|삼합/.test(topic.title))
    && /홍어|삼합/.test(topics[2]?.title??"");
}

export async function suggestTopics(input:TopicInput,ai?:TopicAiClient,onFallback?:(reason:string)=>void):Promise<TopicSuggestion[]> {
  const parsed=TopicInputSchema.parse(input);
  const fallback=(reason="no AI client")=>{onFallback?.(reason);return fallbackTopics(parsed.recommendationRound,parsed.excludeTitles);};
  if(!ai)return fallback();
  try{
    const suggestions=TopicSuggestionsSchema.parse(await ai.suggest(parsed));
    const titles=suggestions.map(item=>titleKey(item.title));
    const excluded=new Set(parsed.excludeTitles.map(titleKey));
    if(new Set(titles).size!==titles.length||titles.some(title=>excluded.has(title))||!followsCuriosityBrief(suggestions,parsed.storeName))return fallback("suggestions broke the topic rules");
    return suggestions;
  }catch(error){return fallback(error instanceof Error?error.message.replace(/s+/g," ").slice(0,300):"AI request failed");}
}
