import { SAME_TOPIC_SIMILARITY, topicSimilarity } from "./topicSimilarity";
import { HOOK_DARE, HOOK_HYPE, comparedKeys, comparedPair, obviousQuestion } from "@/features/copy/explain";
import { comparisonPairOf } from "@/features/store/principles";
// 상표 이름(가게가 내는 막걸리). 상표끼리 비교인지 볼 때 쓴다.
const BRAND_PAIR=/배다리|지평/;
import { TopicInputSchema, TopicSuggestionSchema, TopicSuggestionsSchema, type TopicInput, type TopicSuggestion, type TopicSuggestionInput } from "./schema";
import type { SeasonContext } from "./season";
import { STORE_MENU, isHongeoHoe, mainMenuOf, menuOf, menusForDate, type StoreMenuItem } from "@/features/store/menu";
import { trendMenu } from "./naverTrend";

export interface TopicAiClient {
  suggest(input:TopicInput):Promise<TopicSuggestionInput[]>;
}

// 새로고침마다 AI에게 참고로 건네는 관점 예시(정해진 칸·개수·순서 없음, AI가 따르지 않아도 된다).
// 회차마다 4개씩 돌려 새로고침할 때 다른 관점이 보이게 한다. 홍어 관점이 회차마다 0~2개로 섞이도록 순서를 섞어 두었다.
const TOPIC_ANGLES = [
  "익숙한 음식 조합의 이유","발효 음식에 대한 궁금증","홍어의 향과 식감","같은 재료를 다르게 먹는 이유",
  "이 계절에 어울리는 가게 메뉴","친구와 음식을 나눌 때의 궁금증","곁들임이 맛에 주는 변화","홍어를 처음 맛보는 방법",
  "회가 아닌 홍어 요리(홍어애탕·홍어무침·홍어찜)","막걸리와 전처럼 곁들이는 술·안주 이야기","제철 메뉴 한 접시(과메기·미나리전 등)","홍어회와 삼합을 함께 먹는 이유",
] as const;

type PreparedTopic=Omit<TopicSuggestion,"id"|"season"|"trend">;

// 추천을 고르는 데 쓰는 참고 정보(라우트가 만든다).
// recentMenus: 최근에 보여 준 주제에 자주 나온 메뉴 id(이번에는 되도록 빼서 메뉴를 고르게 돌린다).
// trends: 네이버 검색이 늘어난 말(묶음 이름). 준비된 주제는 그 말과 이어지는 메뉴를 먼저 고른다.
// photoMenus: 사장님이 먼저 올린 사진에 보이는 가게 메뉴 id. 있으면(사진으로 주제 정하기) 세 주제 모두 그 메뉴에서 고른다.
// storeNotes: 가게 이야기 메모. 상표끼리 비교(배다리 vs 지평)는 메모에 두 상표 이야기가 있을 때만 받는다.
export type TopicHints={recentMenus?:ReadonlySet<string>;trends?:readonly string[];photoMenus?:ReadonlySet<string>;storeNotes?:string};

// 준비된 질문 주제(AI 실패 시). 정해진 칸 없이 아래 메뉴 주제·시기 주제와 한 후보 목록에 놓고 fallbackTopics가 고른다.
// summary 앞쪽에 이어질 가게 메뉴를 먼저 적는다(메뉴 판별에 쓰인다).
const QUESTION_TOPICS:PreparedTopic[] = [
  {title:"같은 회인데 왜 식감은 다를까?",summary:"회를 고를 때 부드러움과 탄력 중 무엇을 좋아하는지 질문합니다. 종류와 부위에 따른 식감 차이는 출처를 확인해 설명하고, 탄력 있는 홍어회와 반건조한 과메기처럼 서로 다른 식감의 메뉴로 연결합니다.",reason:"회를 즐기던 사람이 자신의 취향으로 읽기 시작할 수 있어요.",audience:"A",imageBrief:"홍어회의 얇은 단면과 결이 보이는 한 접시"},
  {title:"홍어는 왜 수육이랑 먹을까?",summary:"홍어의 탄력 있는 식감에 수육의 부드러움과 묵은지의 새콤함을 곁들이는 삼합 조합을 설명합니다. 특유의 향은 남는다고 알리고, 작은 한입으로 취향을 살펴보는 방법으로 마무리합니다.",reason:"삼합 사진을 본 사람이 세 재료를 함께 먹는 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"홍어·수육·묵은지를 조금씩 곁들인 한입"},
  {title:"치즈는 익숙한데 다른 발효 음식은 왜 낯설까?",summary:"발효 음식마다 향과 먹어 본 경험이 다르다는 점에서 질문을 시작합니다. 치즈와 홍어를 같은 맛으로 취급하지 않고 취향 차이로 연결하며, 낯섦의 심리적 원인은 출처 확인 없이 단정하지 않습니다.",reason:"익숙한 치즈를 떠올리며 낯선 음식에 대한 취향을 비교할 수 있어요.",audience:"C",imageBrief:"발효 음식 비교 설명에 사용할 홍어회 한 접시"},
  {title:"홍어애탕 국물은 왜 진하고 구수할까?",summary:"홍어애탕 국물이 진하게 느껴지는 이유에서 시작합니다. 홍어 애(간)에 든 기름기가 끓는 동안 국물에 풀려 맛을 진하게 한다고 알려져 있다는 원리를 설명하고, 들어가는 다른 재료와 맛은 사장님께 확인한 뒤에만 씁니다.",reason:"회로만 알던 홍어를 국물로 먹는 이유가 궁금해질 수 있어요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"},
  {title:"새콤한 무침은 왜 술안주로 찾을까?",summary:"술자리에서 새콤한 무침을 찾는 익숙한 장면에서 시작합니다. 홍어무침을 사례로 양념과 홍어 조각이 어우러지는 모습을 보여 주고 막걸리 한 잔과 이어 가되, 맛이 어울리는 원리는 출처 확인 없이 단정하지 않습니다.",reason:"무침 안주를 시켜 본 사람이 이유를 떠올려 볼 수 있어요.",audience:"B",imageBrief:"붉은 양념에 무친 홍어무침 한 접시와 막걸리 사발"},
  {title:"홍어는 왜 상하지 않고 삭을까?",summary:"생선은 오래 두면 상하는데 홍어는 삭혀 먹는다는 점에서 질문을 시작합니다. 홍어 살에 많은 요소가 분해되며 암모니아가 생기고, 그 때문에 다른 세균이 자라기 어려워진다고 알려진 원리를 설명하되 숙성 기간 같은 가게만의 사실은 쓰지 않습니다. 그 향이 강하게 남는다는 점도 함께 알리고 홍어회로 이어 갑니다.",reason:"홍어를 먹어 보지 않은 사람도 '썩은 것과 무엇이 다른지' 궁금해해요.",audience:"C",imageBrief:"홍어회의 결이 보이는 한 접시"},
  {title:"같은 음식을 먹는데 왜 취향은 갈릴까?",summary:"친구와 같은 메뉴를 먹고도 향과 식감에 대한 반응이 다른 장면을 소개합니다. 홍어를 사례로 서로의 취향을 확인하는 방법을 제안하고, 유전이나 감각의 원인은 검증 없이 설명하지 않습니다.",reason:"친구와 메뉴를 정하며 겪었던 차이를 떠올릴 수 있어요.",audience:"B",imageBrief:"서로 나누어 맛보기 좋게 놓인 홍어회와 곁들임"},
  {title:"홍어무침과 홍어회는 무엇이 다를까?",summary:"홍어무침과 홍어회를 나란히 놓고 같은 홍어가 양념에 무쳤을 때와 회로 먹을 때 어떻게 다르게 보이는지 비교합니다. 양념으로 향이 없어진다고 단정하지 않고, 어떤 쪽이 취향에 맞을지 살펴보게 합니다.",reason:"홍어회만 알던 사람이 다른 메뉴를 고를 이유가 생겨요.",audience:"A",imageBrief:"붉은 양념의 홍어무침과 얇게 썬 홍어회가 나란히 놓인 장면"},
];

// 메뉴 주제(홍어회·삼합이 아닌 메뉴가 주인공). menu id로 계절·검색 흐름·최근 메뉴를 맞춰 고른다(계절은 STORE_MENU의 seasons·months).
const MENU_TOPICS:Array<{menu:string;topic:PreparedTopic}>=[
  {menu:"gwamegi",topic:{title:"과메기는 왜 찬바람이 불면 찾을까?",summary:"겨울이 되면 과메기를 찾는 익숙한 장면에서 시작합니다. 과메기가 겨울 메뉴로 꼽히는 이유와 만드는 과정은 출처를 확인한 뒤 쓰고, 함께 내는 곁들임 구성은 사장님께 확인한 것만 소개합니다.",reason:"겨울마다 과메기 사진을 보는 사람이 제철의 이유를 궁금해할 수 있어요.",audience:"A",imageBrief:"윤기 도는 과메기를 길게 썰어 가지런히 담은 한 접시"}},
  {menu:"minari-jeon",topic:{title:"미나리전엔 왜 막걸리가 생각날까?",summary:"미나리전 한 장에 배다리 막걸리 한 잔을 곁들이는 장면을 다룹니다. 전과 막걸리가 어울린다고 느끼는 이유는 단정하지 않고 사람들이 즐겨 찾는 조합으로 소개하며, 홍어 메뉴는 함께 맛볼 선택지로만 덧붙입니다.",reason:"전과 막걸리 조합을 아는 사람이 바로 떠올릴 장면이에요.",audience:"B",imageBrief:"노릇한 미나리전 한 장과 막걸리 사발"}},
  {menu:"baedari-makgeolli",topic:{title:"막걸리는 왜 사발에 따라 마실까?",summary:"배다리 막걸리를 사발에 따르는 장면에서 막걸리를 마시는 그릇 이야기를 시작합니다. 사발을 쓰는 유래와 양조장 이야기는 출처를 확인한 뒤에만 쓰고, 어울리는 안주로 미나리전과 홍어무침을 소개합니다.",reason:"막걸리를 마셔 본 사람이 익숙한 그릇의 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"사발에 따른 뽀얀 배다리 막걸리"}},
  {menu:"hongeo-aetang",topic:{title:"추운 날엔 왜 뜨끈한 탕이 당길까?",summary:"찬바람이 불면 국물 요리를 찾는 장면에서 시작합니다. 홍어애탕 한 그릇을 사례로 소개하되 몸에 좋다는 효능은 말하지 않고, 들어가는 재료와 맛은 사장님께 확인한 뒤 씁니다.",reason:"날이 추워지면 누구나 떠올리는 장면이에요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"}},
  {menu:"hongeo-jjim",topic:{title:"생선은 찌면 왜 맛과 식감이 달라질까?",summary:"같은 생선도 날로 먹을 때와 쪄서 먹을 때 식감과 향이 달라지는 이유를 설명합니다. 열을 받으면 살의 단백질이 굳으며 결대로 갈라지고, 껍질과 살 사이의 콜라겐이 젤라틴으로 풀려 촉촉해진다는 원리를 홍어찜 한 접시로 보여 주되, 조리법·곁들임은 사장님께 확인한 것만 씁니다.",reason:"회만 알던 사람이 익힌 생선이 왜 다른지 궁금해할 수 있어요.",audience:"B",imageBrief:"김이 오르는 홍어찜 한 접시"}},
  {menu:"hongeo-muchim",topic:{title:"입맛 없을 땐 왜 새콤한 게 당길까?",summary:"더운 날이나 입맛 없을 때 새콤한 음식을 찾는 장면에서 시작합니다. 홍어무침을 사례로 붉은 양념의 새콤한 한 접시를 소개하되, 입맛이 돈다는 효과는 단정하지 않습니다.",reason:"입맛 없는 날 메뉴를 고민하는 사람이 공감할 질문이에요.",audience:"A",imageBrief:"붉은 양념에 무친 홍어무침 한 접시"}},
  {menu:"gwamegi",topic:{title:"과메기는 왜 반쯤 말려서 먹을까?",summary:"생선을 반쯤 말려 먹는 과메기의 겉모습에서 질문을 시작합니다. 말리는 방법과 식감의 변화는 출처를 확인해 설명하고, 연말·신년 모임에 나눠 먹는 겨울 메뉴로 소개합니다.",reason:"과메기를 처음 본 사람이 생김새를 궁금해할 수 있어요.",audience:"C",imageBrief:"길게 썬 과메기의 윤기와 결이 보이는 접시"}},
  {menu:"minari-jeon",topic:{title:"봄 미나리는 왜 전으로 부쳐 먹을까?",summary:"봄철 미나리를 전으로 부치는 장면을 다룹니다. 미나리전의 노릇한 겉면과 초록 줄기가 보이는 한 장을 소개하고, 제철 이야기는 일반적인 수준으로만 쓰며 막걸리와 곁들이는 자리로 이어 갑니다.",reason:"봄나물을 즐기는 사람이 익숙한 질문이에요.",audience:"A",imageBrief:"초록 미나리 줄기가 비치는 노릇한 미나리전"}},
  // 네이버 플레이스 메뉴(2026-10-09)로 더한 메뉴. 맛 표현은 가게 메뉴 설명에 있는 말만 쓰고, 재료는 사장님께 확인한 것만.
  {menu:"hongeo-jeon",topic:{title:"전은 왜 겉은 바삭하고 속은 촉촉할까?",summary:"홍어전을 사례로 전의 겉과 속이 다르게 익는 이유를 설명합니다. 뜨거운 기름에 닿은 반죽 겉면은 수분이 빠지며 노릇하게 갈변하고, 달걀 옷이 속살의 수분을 가둬 촉촉하게 남는다는 원리를 쓰되, 향이 사라진다고 단정하지 않고 막걸리 한 잔과 곁들이는 자리로 이어 갑니다.",reason:"전을 좋아하는 사람이 바삭함의 이유를 궁금해할 수 있어요.",audience:"A",imageBrief:"노릇하게 부친 홍어전 한 접시"}},
  {menu:"kimchi-jeon",topic:{title:"묵은지로 부친 김치전은 왜 막걸리를 부를까?",summary:"잘 익은 묵은지로 부친 묵은지김치전에 막걸리 한 잔을 곁들이는 장면을 다룹니다. 묵은지의 새콤함과 바삭한 가장자리를 보여 주되, 어울림의 원리는 단정하지 않고 사람들이 즐겨 찾는 조합으로 소개합니다.",reason:"김치전과 막걸리 조합을 아는 사람이 바로 떠올릴 장면이에요.",audience:"B",imageBrief:"가장자리가 바삭한 묵은지김치전과 막걸리 사발"}},
  {menu:"haemul-ramyeon",topic:{title:"술자리 마지막엔 왜 라면이 생각날까?",summary:"술자리를 마무리하며 뜨끈한 라면 한 그릇을 찾는 익숙한 장면에서 시작합니다. 해물라면을 사례로 김이 오르는 얼큰한 국물을 보여 주되, 해장 효과는 단정하지 않고 들어가는 해물은 사장님께 확인한 것만 씁니다.",reason:"술자리 끝에 라면을 시켜 본 사람이 많아요.",audience:"B",imageBrief:"김이 오르는 해물라면 한 그릇"}},
  {menu:"hongeo-ramyeon",topic:{title:"홍어는 끓이면 왜 향이 더 퍼질까?",summary:"홍어라면 한 그릇에서 김과 함께 올라오는 향에서 질문을 시작합니다. 홍어 향의 암모니아는 온도가 오르면 더 쉽게 날아올라 김과 함께 코로 들어온다고 알려진 원리를 설명하고, 라면의 맛과 들어가는 재료는 사장님께 확인한 뒤에만 씁니다.",reason:"홍어 요리를 데워 먹을 때 향이 더 강하게 느껴진 사람이 공감할 질문이에요.",audience:"C",imageBrief:"김이 오르는 홍어라면 한 그릇"}},
  {menu:"baedari-makgeolli",topic:{title:"막걸리는 왜 흔들어 마시면 맛이 달라질까?",summary:"막걸리를 따르기 전에 흔들지 말지 고민하는 장면에서 시작합니다. 바닥에 가라앉은 쌀 앙금에 단맛과 묵직한 맛이 모여 있어 섞으면 진해지고, 윗부분만 따르면 맑고 가볍게 느껴진다는 원리를 설명하고, 배다리·지평 막걸리를 각자 취향대로 마셔 보는 방법으로 이어 갑니다.",reason:"막걸리를 마셔 본 사람이라면 한 번쯤 고민한 장면이에요.",audience:"B",imageBrief:"뽀얀 앙금이 보이는 막걸리를 사발에 따르는 장면"}},
];

// 이번 시기 주제(AI를 쓰지 못할 때 행사가 있으면 맨 앞에 둔다). season.ts 행사 id로 찾는다. summary에는 이어질 가게 메뉴를 먼저 적는다.
const SEASONAL_TOPICS:Record<string,PreparedTopic>={
  seollal:{title:"명절 상에는 왜 지역마다 다른 음식이 오를까?",summary:"설 연휴 가족 상차림에서 지역마다 빠지지 않는 음식이 다른 장면을 다룹니다. 전라도 잔칫상에 오르는 홍어를 사례로 소개하되, 유래와 역사는 출처를 확인한 뒤에만 씁니다.",reason:"명절에 고향 상차림을 떠올리는 사람이 많은 시기예요.",audience:"C",imageBrief:"명절 상 위에 놓인 홍어회 한 접시"},
  chuseok:{title:"명절 상에는 왜 지역마다 다른 음식이 오를까?",summary:"추석 가족 상차림에서 지역마다 빠지지 않는 음식이 다른 장면을 다룹니다. 전라도 잔칫상에 오르는 홍어를 사례로 소개하되, 유래와 역사는 출처를 확인한 뒤에만 씁니다.",reason:"명절에 고향 상차림을 떠올리는 사람이 많은 시기예요.",audience:"C",imageBrief:"명절 상 위에 놓인 홍어회 한 접시"},
  boknal:{title:"복날엔 왜 뜨끈한 국물을 찾을까?",summary:"더운 복날에도 뜨끈한 국물 한 그릇을 찾는 익숙한 장면에서 시작합니다. 홍어애탕을 든든한 한 끼로 소개하되 보양 효능은 단정하지 않고, 재료와 맛은 사장님께 확인한 뒤 씁니다.",reason:"복날을 앞두고 무엇을 먹을지 고민하는 시기예요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"},
  makgeolli:{title:"막걸리엔 왜 전을 곁들일까?",summary:"막걸리의 날 즈음 막걸리 안주를 고르는 장면을 다룹니다. 배다리 막걸리와 미나리전을 함께 놓는 조합을 살피고, 홍어무침처럼 새콤한 안주도 선택지로 덧붙이되 어울림의 원리는 단정하지 않습니다.",reason:"10월 마지막 목요일 막걸리의 날을 앞둔 시기예요.",audience:"B",imageBrief:"막걸리 사발과 노릇한 미나리전 한 장"},
  spring:{title:"같은 미나리인데 왜 봄 미나리 향이 더 진할까?",summary:"봄 미나리로 부친 미나리전 한 장에서 시작합니다. 봄에 막 자란 연한 줄기에 향 성분이 많다고 알려진 이유를 설명하되 효능은 말하지 않고, 수치를 지어내지 않으며, 미나리전과 막걸리를 나눠 먹는 봄 모임 자리로 이어 갑니다.",reason:"봄나물 향을 좋아하는 사람이 이유를 궁금해할 수 있어요.",audience:"B",imageBrief:"초록 미나리 줄기가 비치는 노릇한 미나리전"},
  family:{title:"부모님 세대가 좋아하는 음식은 왜 다를까?",summary:"가정의 달 가족 외식에서 세대마다 좋아하는 음식이 다른 장면을 다룹니다. 부모님 세대에 익숙한 홍어를 함께 맛보며 이야기를 나누는 흐름으로 이어갑니다.",reason:"어버이날 가족 외식 메뉴를 고민하는 시기예요.",audience:"B",imageBrief:"가족이 함께 나눠 먹는 홍어회 한 상"},
  rainy:{title:"비 오는 날엔 왜 전과 막걸리가 생각날까?",summary:"장마철 비 오는 날 전과 막걸리가 생각나는 익숙한 장면에서 시작합니다. 미나리전 한 장과 배다리 막걸리 한 잔을 소개하되, 비와 전이 이어지는 이유는 단정하지 않습니다.",reason:"장마철마다 많이 나누는 이야기예요.",audience:"C",imageBrief:"비 오는 창가의 막걸리와 미나리전"},
  kimjang:{title:"김장하는 날엔 왜 수육을 삶을까?",summary:"김장날 갓 담근 김치에 수육을 곁들이는 장면을 다룹니다. 새 김치와 묵은지의 차이를 살피고, 수육·묵은지에 홍어를 더한 삼합으로 이어갑니다.",reason:"김장철에 집집마다 떠올리는 장면이에요.",audience:"A",imageBrief:"수육과 묵은지, 홍어가 놓인 한 접시"},
  yearend:{title:"송년회 메뉴는 왜 나눠 먹는 음식이 좋을까?",summary:"연말 모임에서 여럿이 한 상을 나누는 장면을 다룹니다. 겨울 제철 과메기와 홍어회처럼 각자 조금씩 골라 먹는 상차림을 소개하고, 구성은 사장님께 확인한 것만 씁니다.",reason:"연말 모임 장소와 메뉴를 정하는 시기예요.",audience:"B",imageBrief:"여럿이 둘러앉아 나눠 먹는 과메기 한 접시"},
  newyear:{title:"같은 생선인데 왜 겨울에 잡은 게 더 고소할까?",summary:"새해 모임에 겨울 생선을 찾는 장면에서 시작합니다. 찬 바다에서 겨울을 나는 생선은 기름이 오른다고 알려져 있어 고소함이 진해진다는 원리를 설명하고, 겨울 제철 과메기와 뜨끈한 홍어애탕을 함께 나눠 먹는 상으로 이어 가되 기름 함량 같은 수치는 지어내지 않습니다.",reason:"겨울 생선이 맛있다는 말의 이유를 궁금해하는 사람이 많아요.",audience:"B",imageBrief:"새해 모임 상 위의 과메기와 홍어애탕"},
};

// 준비된 주제 제목 전부(질문·메뉴·이번 시기). 주제 품질 테스트가 쓴다.
export function preparedTopicTitles():string[] {
  return [...QUESTION_TOPICS,...MENU_TOPICS.map(item=>item.topic),...Object.values(SEASONAL_TOPICS)].map(topic=>topic.title);
}

const titleKey=(title:string)=>title.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu,"");

// 이번 회차에 참고로 건넬 관점 4개(회차마다 3칸씩 밀어 돌린다).
export function topicAnglesForRound(round:number):string[] {
  return Array.from({length:4},(_,i)=>TOPIC_ANGLES[(round*3+i)%TOPIC_ANGLES.length]);
}

// 주제 갈래. 예전에는 모든 주제가 "가게 메뉴 하나 + 그 메뉴의 뻔한 질문"(과메기=찬바람, 미나리전=비·막걸리, 애탕=국물)이라
// 메뉴 8개를 돌려 쓰는 구조였고, 두세 번 누르면 같은 주제가 돌아오는 것처럼 느껴졌다(사장님 지적 2026-10-10:
// "사람들의 궁금증을 끌 수 있다면 묵동홍어마을과 관련된 것은 뭐든 괜찮다"). 이제 세 주제를 서로 다른 갈래에서 고르고,
// 회차마다 권하는 갈래 3개를 돌려 "다른 주제 보기"마다 결이 다른 질문이 나오게 한다. 이번 시기·요즘 검색은 따로 다룬다.
export const TOPIC_FAMILIES=[
  {id:"myth",name:"홍어 상식·오해 풀기",example:"홍어는 왜 삭혀도 상하지 않을까?"},
  {id:"science",name:"맛·향의 과학",example:"홍어의 톡 쏘는 향은 왜 코로 먼저 올라올까?"},
  {id:"culture",name:"식문화·유래·지역",example:"전라도 잔칫상엔 왜 홍어가 빠지지 않을까?"},
  {id:"compare",name:"비교·차이",example:"홍어와 가오리는 어떻게 구별할까?"},
  // 예시가 "어느 부위부터 먹을까", "어떤 술이 맞을까"처럼 고르기·추천형이면 AI도 답이 뻔한 질문을 냈다(사장님 지적 2026-10-12).
  // 모든 갈래 예시를 원리로 답하는 "왜" 질문으로 둔다.
  {id:"first",name:"처음 먹는 사람의 궁금증",example:"홍어는 왜 첫 점이 가장 세게 느껴질까?"},
  {id:"pairing",name:"술·곁들임 짝꿍의 원리",example:"홍어엔 왜 탄산 있는 막걸리가 자주 오를까?"},
  {id:"scene",name:"모임·상황(회식·부모님·데이트)",example:"잔칫상엔 왜 나눠 먹는 음식이 오를까?"},
  {id:"store",name:"가게·동네·사람 이야기",example:"홍어집은 왜 같은 홍어도 썰 때 두께를 달리할까?"},
] as const;
export function topicFamiliesForRound(round:number):string[] {
  return Array.from({length:3},(_,i)=>TOPIC_FAMILIES[(round*3+i)%TOPIC_FAMILIES.length]).map(family=>`${family.name}(예: ${family.example})`);
}

// 주제가 주로 다루는 가게 메뉴(제목에서 먼저, 없으면 설명에서 먼저 나온 메뉴). 메뉴를 못 찾으면 undefined.
export function topicMenu(topic:Pick<TopicSuggestion,"title"|"summary">):StoreMenuItem|undefined {
  return mainMenuOf(topic.title,topic.summary);
}
// 홍어회·삼합이 아닌 가게 메뉴(과메기·미나리전·배다리 막걸리·홍어애탕·홍어무침 등)를 다루는 주제인지.
export const isOtherMenuTopic=(topic:Pick<TopicSuggestion,"title"|"summary">)=>{const menu=topicMenu(topic);return Boolean(menu&&!isHongeoHoe(menu));};

// 최근 주제 제목에서 주인공 메뉴를 짐작한다(메뉴 이름이 없으면 준비된 주제의 설명, "탕·국물"이면 홍어애탕).
const PREPARED_SUMMARIES=new Map<string,string>([...QUESTION_TOPICS,...MENU_TOPICS.map(item=>item.topic),...Object.values(SEASONAL_TOPICS)].map(topic=>[titleKey(topic.title),topic.summary]));
export function titleMenu(title:string):StoreMenuItem|undefined {
  const direct=mainMenuOf(title);
  if(direct)return direct;
  const summary=PREPARED_SUMMARIES.get(titleKey(title));
  if(summary)return mainMenuOf(summary);
  if(/탕|국물/.test(title))return STORE_MENU.find(item=>item.id==="hongeo-aetang");
  return undefined;
}
// 이번에는 빼고 돌릴 메뉴: 지금 화면(current, "새로고침" 직전 추천)에 나온 메뉴 + 최근 주제(최근 것부터) 9개 안에 두 번 이상 나온 메뉴.
// 홍어회(삼합)는 가게의 대표 메뉴라 빼지 않는다(대신 한 묶음에 홍어회가 주인공인 주제는 겹치지 않게 고른다). 같은 메뉴가 새로고침마다 되풀이되지 않게 한다(예: 가을마다 홍어애탕).
export function overusedMenus(recentTitles:readonly string[],current:readonly string[]=[]):Set<string> {
  const menuId=(title:string)=>{const menu=titleMenu(title);return menu&&!isHongeoHoe(menu)?menu.id:undefined;};
  const counts=new Map<string,number>();
  for(const title of recentTitles.slice(0,9)){const id=menuId(title);if(id)counts.set(id,(counts.get(id)??0)+1);}
  const now=current.map(menuId).filter((id):id is string=>Boolean(id));
  return new Set([...now,...[...counts].filter(([,count])=>count>=2).map(([id])=>id)]);
}
// 삼합 주제인지(삼합·수육이 제목이나 설명에 나온다). 한 묶음에 하나만 둔다(프롬프트의 "삼합은 3개 중 최대 1개"와 같은 기준).
const isSamhapTopic=(topic:Pick<TopicSuggestion,"title"|"summary">)=>/삼합|수육/.test(`${topic.title} ${topic.summary}`);
// 이미 고른 주제들 옆에 둘 수 있는지: 주인공 메뉴가 겹치지 않고(홍어회 주인공도 하나만), 삼합 주제는 하나만.
// 정해진 칸은 없지만 이 두 가지는 AI 주제·준비된 주제 모두 코드로 지킨다(같은 메뉴 이야기가 겹치면 좋은 주제 3개가 아니다).
// 홍어회(홍어 자체)는 가게의 대표라 상식·과학·문화처럼 다른 갈래로 두 번까지 다룰 수 있다(예전에는 한 번만이라 홍어 상식 주제가 버려졌다).
// 준비된 주제(메뉴마다 하나씩 만든 목록)는 예전처럼 메뉴가 모두 다르게(hongeoMax 1) 고른다.
const fitsWith=(picked:readonly TopicSuggestion[],topic:TopicSuggestion,hongeoMax=2)=>{
  const menu=topicMenu(topic),same=picked.filter(item=>topicMenu(item)?.id===menu?.id).length;
  return same<(menu&&isHongeoHoe(menu)?hongeoMax:1)&&!(isSamhapTopic(topic)&&picked.some(isSamhapTopic));
};

// 준비된 주제 3개(AI 실패 시, AI 주제가 모자랄 때 채울 후보). 정해진 칸 없이 후보를 점수 순으로 줄 세워 고른다.
// 후보 = 이번 시기 행사 주제 + 질문 주제와 메뉴 주제를 번갈아(회차마다 두 칸씩 밀어 돌린다).
// 점수: 이번 시기 행사 주제 > 검색이 늘어난 말의 메뉴 > 지금 제철·곧 제철 메뉴(사계절 메뉴 제외). 같으면 후보 순서.
// 제철이 아닌 메뉴: 제철 달이 정해진 메뉴(과메기 11~2월)는 다른 후보가 다 떨어졌을 때만 고르고,
// 계절에 특히 어울리는 메뉴(미나리전·홍어무침 봄여름, 홍어애탕 가을겨울)는 철이 아니면 점수를 낮춘다.
// 고를 때: 주인공 메뉴가 서로 다르게, 삼합은 하나만. 시기·검색 주제는 개수 제한 없이 점수 순으로 먼저 채우고(프롬프트의 "시기·검색 우선"과 같은 기준),
// 모자란 자리만 일반 질문·메뉴 주제로 채운다.
// excludeTitles: 지금 화면 주제(반드시 제외). avoidTitles: 최근에 보여 준 주제. 되도록 피하지만, 다 피할 수 없으면 제외 목록만 지킨다.
// hints.recentMenus: 최근에 자주 나온 메뉴(되도록 뺀다).
const PREPARED_ROUNDS=4;
export function fallbackTopics(round=0,excludeTitles:readonly string[]=[],season?:SeasonContext,avoidTitles:readonly string[]=[],hints:TopicHints={}):TopicSuggestion[] {
  const excluded=new Set(excludeTitles.map(titleKey));
  const avoided=new Set(avoidTitles.map(titleKey));
  // 이번 시기 행사 가운데 준비된 주제가 있고 제외·최근 목록에 없는 첫 행사를 고른다.
  const event=season?.events.find(item=>SEASONAL_TOPICS[item.id]&&!excluded.has(titleKey(SEASONAL_TOPICS[item.id].title))&&!avoided.has(titleKey(SEASONAL_TOPICS[item.id].title)))
    ??season?.events.find(item=>SEASONAL_TOPICS[item.id]&&!excluded.has(titleKey(SEASONAL_TOPICS[item.id].title)));
  const index=round%PREPARED_ROUNDS;
  const rotate=<T,>(list:readonly T[])=>list.map((_,i)=>list[(index*2+i)%list.length]);
  const questions=rotate(QUESTION_TOPICS),menus=rotate(MENU_TOPICS.map(item=>item.topic));
  const candidates:TopicSuggestion[]=[
    ...(event?[{...SEASONAL_TOPICS[event.id],season:event.name,trend:"",id:`fallback-season-${event.id}`}]:[]),
    ...Array.from({length:Math.max(questions.length,menus.length)},(_,i)=>[questions[i],menus[i]]).flat().filter((topic):topic is PreparedTopic=>Boolean(topic)).map(topic=>({...topic,season:"",trend:"",id:""})),
  ];
  // 지금 제철·곧 제철인 메뉴(사계절 메뉴는 늘 제철이라 점수에서 뺀다). 시기를 모르면 비운다.
  const dated=season?menusForDate(season.today,season.season):undefined;
  const timely=new Set(dated?[...dated.inSeason,...dated.upcoming].filter(item=>item.seasons.length||item.months).map(item=>item.id):[]);
  const fresh=new Set(dated?[...dated.inSeason,...dated.upcoming].map(item=>item.id):[]);
  // "closed": 제철 달 밖(그 철에만 내는 메뉴), "weak": 어울리는 계절이 아님, undefined: 상관없음(사계절 메뉴·시기 모름).
  const offSeason=(topic:TopicSuggestion):"closed"|"weak"|undefined=>{
    const item=topicMenu(topic);
    if(!dated||!item||!(item.seasons.length||item.months)||fresh.has(item.id))return undefined;
    return item.months?"closed":"weak";
  };
  const recent=hints.recentMenus??new Set<string>();
  const menuId=(topic:TopicSuggestion)=>topicMenu(topic)?.id??"";
  const trendOf=(topic:TopicSuggestion)=>(hints.trends??[]).find(keyword=>trendMenu(keyword)&&trendMenu(keyword)===menuId(topic))??"";
  // 사진으로 주제 정하기: 사진 속 메뉴 주제가 무엇보다 먼저.
  const photoMenus=hints.photoMenus??new Set<string>();
  const score=(topic:TopicSuggestion)=>(photoMenus.has(menuId(topic))?8:0)+(topic.season?4:0)+(trendOf(topic)?2:0)+(timely.has(menuId(topic))?1:0)-(offSeason(topic)==="weak"?1:0);
  const ranked=candidates.map((topic,order)=>({topic,order})).sort((a,b)=>score(b.topic)-score(a.topic)||a.order-b.order).map(item=>item.topic);
  const picked:TopicSuggestion[]=[];
  // 1) 최근에 안 보인 주제·최근에 자주 안 나온 메뉴 → 2) 최근에 안 보인 주제 → 3) 제외 목록만 피한 주제 → 4) 철 지난 메뉴까지.
  for(const [strict,varied,anySeason] of [[true,true,false],[true,false,false],[false,false,false],[false,false,true]] as const){
    for(const topic of ranked){
      if(picked.length>=3)break;
      const key=titleKey(topic.title);
      if(excluded.has(key)||(strict&&avoided.has(key))||picked.some(item=>titleKey(item.title)===key))continue;
      if(varied&&recent.has(menuId(topic)))continue;
      if(!anySeason&&offSeason(topic)==="closed")continue;
      // 사진 속 메뉴 주제는 같은 메뉴끼리 겹쳐도 된다(사진 한 접시로 세 질문을 만든다).
      if(!fitsWith(picked,topic,1)&&!photoMenus.has(menuId(topic)))continue;
      picked.push(topic);
    }
  }
  if(picked.length<3)throw new Error("다른 추천 주제를 찾지 못했습니다.");
  // 점수 순(가장 추천하는 주제가 먼저)으로 놓는다. 화면은 첫 주제를 먼저 골라 둔다.
  picked.sort((a,b)=>ranked.indexOf(a)-ranked.indexOf(b));
  let n=0;
  // 제철·곧 제철 메뉴 주제에도 계절 표시를 붙인다(예전에는 행사 주제에만 붙어, 행사가 빠지면 계절 표시가 사라졌다).
  return picked.map(topic=>({...topic,season:topic.season||(season&&timely.has(menuId(topic))?season.season:""),trend:trendOf(topic),id:topic.id||`fallback-${index+1}-${++n}`}));
}

// 주제 한 개가 기본 조건을 못 지키는 이유(지키면 undefined).
// - 제목 끝 물음표 뒤의 따옴표·괄호·공백은 봐준다(AI가 "…일까?" 처럼 따옴표로 감싸 보내곤 한다).
// - 가게 메뉴는 제목과 설명을 함께 본다(제목에만 메뉴 이름을 쓴 주제를 버리지 않게).
export type TopicRejectReason="question"|"hype"|"obvious"|"pair"|"store"|"summary"|"menu"|"current"|"recent"|"duplicate"|"same-menu"|"photo";
export const TOPIC_REJECT_LABELS:Record<TopicRejectReason,string>={
  question:"물음표 질문이 아니어서",hype:"과장하거나 독자를 시험하는 말투라서",obvious:"답이 뻔한 질문이라서",pair:"차이를 확인할 수 없는 상표 비교라서",store:"제목에 가게 이름이 있어서",summary:"설명이 너무 짧아서",menu:"가게 메뉴와 이어지지 않아서",
  current:"지금 화면 주제와 같아서",recent:"최근에 보여 준 주제와 같아서",duplicate:"같은 제목이 겹쳐서","same-menu":"다른 주제와 메뉴가 겹쳐서",photo:"넣은 사진 속 메뉴가 아니어서",
};
function basicsProblem(topic:TopicSuggestion,storeName:string):TopicRejectReason|undefined {
  if(!/[?？]["'”’」』)\]\s]*$/.test(topic.title.trim()))return "question";
  // 후킹(HOOK_RULE): "충격·소름" 같은 과장이나 "알면 고수" 같은 도전형 말투는 낚시처럼 읽혀 버린다.
  if(HOOK_HYPE.test(topic.title)||HOOK_DARE.test(topic.title))return "hype";
  // 음식의 이름난 특징을 그대로 묻는 질문("홍어애탕 국물은 왜 고소하면서 진할까?")은 답이 뻔하다(explain.ts obviousQuestion).
  if(obviousQuestion(topic.title))return "obvious";
  if(topic.title.includes(storeName))return "store";
  if(topic.summary.trim().length<30)return "summary";
  if(!menuOf(`${topic.title} ${topic.summary}`).length)return "menu";
  return undefined;
}
export const topicBasicsProblem=basicsProblem;
const meetsTopicBasics=(topic:TopicSuggestion,storeName:string)=>!basicsProblem(topic,storeName);
// 세 주제가 메뉴를 고르게 다루는지: 하나 이상은 홍어회·삼합이 아닌 메뉴, 셋 다 같은 메뉴는 아님(순서와 상관없음).
// 셋 다 같은 메뉴만 아니면 된다(사장님: 묵동홍어마을과 관련된 궁금증이면 뭐든 괜찮다). 예전에는 "홍어회·삼합이 아닌 메뉴 하나"를 꼭 넣게 해서 메뉴를 돌려 쓰는 쏠림이 더 심했다.
const isVariedSet=(topics:TopicSuggestion[])=>new Set(topics.map(topic=>topicMenu(topic)?.id)).size>1;

// AI가 준 주제 3개를 순서 그대로 살린다(첫 번째가 AI가 가장 추천하는 주제). 기본 조건에 안 맞거나 지금 화면 제목,
// 겹치는 제목, 앞 주제와 주인공 메뉴가 겹치거나 두 번째 삼합 주제만 빼고, 모자란 만큼만 준비된 주제(이번 시기·최근에 안 보인 것 우선)로 채운다.
// 최근에 보여 준 제목(avoidTitles)은 되도록 피하지만 버리지는 않는다: 새 제목을 먼저 고르고, 모자라면 준비된 주제보다 먼저 쓴다
// (예전에는 최근 제목을 통째로 버려, 계절 주제를 비슷하게 다시 낸 AI 추천이 전부 준비된 주제로 바뀌곤 했다).
// 셋이 메뉴를 고르게 다루지 않으면(모두 홍어회·삼합, 또는 셋 다 같은 메뉴) 맨 뒤 하나를 다른 메뉴 주제로 바꾼다.
// filled = 준비된 주제로 바꾼 개수. rejected = 쓰지 못한 AI 주제의 이유별 개수(화면 안내·로그용).
export function assembleTopics(suggestions:TopicSuggestion[],options:{storeName:string;round:number;excludeTitles:readonly string[];avoidTitles:readonly string[];season?:SeasonContext;hints?:TopicHints}):{topics:TopicSuggestion[];filled:number;rejected:Partial<Record<TopicRejectReason,number>>} {
  const current=new Set(options.excludeTitles.map(titleKey));
  const recentKeys=new Set(options.avoidTitles.map(titleKey));
  // 글자가 똑같지 않아도 낱말 몇 개만 바꾼 제목("10월부터" → "11월")은 같은 주제로 본다(topicSimilarity).
  const near=(title:string,list:readonly string[])=>list.some(other=>topicSimilarity(title,other)>=SAME_TOPIC_SIMILARITY);
  // "다른 주제 보기"에서는 지금 화면 주제의 주인공 메뉴(홍어회·삼합은 가게 대표라 제외)를 다시 쓰지 않는다. 예전에는 제목만 피해서
  // 과메기·애탕·홍어찜이 장면만 바꿔 누를 때마다 다시 나왔다(사장님 지적 2026-10-09). 사진으로 정하는 주제는 사진 속 메뉴를 써야 하므로 제외.
  const screenMenus=new Set(options.hints?.photoMenus?.size?[]:options.excludeTitles.map(titleMenu).filter((menu):menu is StoreMenuItem=>Boolean(menu&&!isHongeoHoe(menu))).map(menu=>menu.id));
  const onScreen=(topic:TopicSuggestion)=>current.has(titleKey(topic.title))||near(topic.title,options.excludeTitles)||screenMenus.has(topicMenu(topic)?.id??"");
  const recentlyShown=(topic:TopicSuggestion)=>recentKeys.has(titleKey(topic.title))||near(topic.title,options.avoidTitles);
  const used=new Set<string>();
  const take=(topic:TopicSuggestion)=>{used.add(titleKey(topic.title));return topic;};
  const picked:TopicSuggestion[]=[];
  // 이 AI 주제를 지금 고를 수 없는 이유(고를 수 있으면 undefined).
  // 사진으로 주제 정하기: 사진 속 음식 하나로 세 질문을 만드는 게 맞으므로 "주인공 메뉴 겹침"·"메뉴 고르게" 검사를 하지 않는다.
  const photoMode=Boolean(options.hints?.photoMenus?.size);
  const fits=(list:readonly TopicSuggestion[],topic:TopicSuggestion)=>photoMode||fitsWith(list,topic);
  // 사진으로 주제 정하기에서는 사진 속 메뉴를 다루지 않는 AI 주제를 받지 않는다(사진과 상관없는 주제가 "사진을 보고 고른 주제"로 나오지 않게).
  const aboutPhoto=(topic:TopicSuggestion)=>!photoMode||menuOf(`${topic.title} ${topic.summary}`).some(item=>options.hints!.photoMenus!.has(item.id));
  // 제목에 홍어나 가게 메뉴가 직접 나와야 한다. 예전에는 제목+설명을 함께 봐서, 제목은 "김장철 수육은 왜 김치와 짝꿍일까?"처럼
  // 홍어와 상관없는데 설명에 "삼합으로 이어진다"를 붙인 주제가 통과했고, 구성안이 홍어를 억지로 끼워 넣었다(사장님 지적 2026-10-10).
  // 사진으로 정하는 주제는 사진 속 메뉴 검사(aboutPhoto)가 따로 있다.
  const titled=(topic:TopicSuggestion)=>photoMode||menuOf(topic.title).length>0;
  // 상표끼리 비교(배다리 vs 지평)는 원료·제조를 확인할 수 없어 늘 흐렸다(점검 7~9회). 확인된 비교 목록(store/principles.ts)에 있거나
  // 가게 이야기 메모에 두 상표가 함께 적혀 있을 때만 받는다.
  const unverifiedPair=(topic:TopicSuggestion)=>{
    const pair=comparedPair(topic.title);
    if(!pair||comparisonPairOf(topic.title)||!BRAND_PAIR.test(topic.title))return false;
    const notes=options.hints?.storeNotes??"";
    return !comparedKeys(pair).every(key=>notes.includes(key));
  };
  const problem=(topic:TopicSuggestion):TopicRejectReason|undefined=>basicsProblem(topic,options.storeName)??(unverifiedPair(topic)?"pair":undefined)
    ??(!titled(topic)?"menu":!aboutPhoto(topic)?"photo":onScreen(topic)?"current":used.has(titleKey(topic.title))?"duplicate":!fits(picked,topic)?"same-menu":undefined);
  // 최근에 보여 준 주제(말만 바꾼 것 포함)는 다시 쓰지 않는다. 예전에는 자리가 남으면 "준비된 주제보다 낫다"며 다시 써서
  // "다른 주제 보기"를 눌러도 같은 주제가 돌아왔다(사장님 지적 2026-10-10). 빈자리는 최근에 안 보인 준비된 주제로 채운다.
  for(const topic of suggestions){
    if(picked.length>=3)break;
    if(!recentlyShown(topic)&&!problem(topic))picked.push(take(topic));
  }
  const rejected:Partial<Record<TopicRejectReason,number>>={};
  for(const topic of suggestions)if(!picked.includes(topic)){const reason=problem(topic)??(recentlyShown(topic)?"recent":"same-menu");rejected[reason]=(rejected[reason]??0)+1;}
  // 채울 후보: 이번 회차 준비된 주제부터 차례로 돌며, 최근에 안 보인 것 → 제외 목록만 피한 것 순서.
  const pool=Array.from({length:PREPARED_ROUNDS},(_,offset)=>fallbackTopics((options.round+offset)%PREPARED_ROUNDS,[],options.season,options.avoidTitles,options.hints)).flat();
  // 최근에 자주 나온 메뉴와 이미 고른 주제의 메뉴는 되도록 피한다(메뉴를 고르게 돌리기).
  const recent=options.hints?.recentMenus??new Set<string>();
  const fresh=(topic:TopicSuggestion)=>{const id=topicMenu(topic)?.id;return !id||(!recent.has(id)&&!picked.some(item=>topicMenu(item)?.id===id));};
  const pick=(wanted:(topic:TopicSuggestion)=>boolean)=>{
    for(const [strict,varied] of [[true,true],[true,false],[false,false]] as const){
      const found=pool.find(topic=>wanted(topic)&&fits(picked,topic)&&(!varied||fresh(topic))&&!used.has(titleKey(topic.title))&&!onScreen(topic)&&(!strict||!recentlyShown(topic)));
      if(found)return take(found);
    }
    throw new Error("다른 추천 주제를 찾지 못했습니다.");
  };
  let filled=3-picked.length;
  // 사진으로 주제 정하기면 사진 속 메뉴 주제부터 채우고, 없으면 아무 주제나.
  const photoMenus=options.hints?.photoMenus??new Set<string>();
  while(picked.length<3)picked.push(photoMode
    ?(()=>{try{return pick(topic=>photoMenus.has(topicMenu(topic)?.id??""));}catch{return pick(()=>true);}})()
    :pick(topic=>picked.some(isOtherMenuTopic)||isOtherMenuTopic(topic)));
  if(!photoMode&&!isVariedSet(picked)){
    // 맨 뒤 하나를 빼고 그 자리에 다른 메뉴 주제를 넣는다(pick은 남은 두 주제와 메뉴·삼합이 겹치지 않는 것만 고른다).
    const replaced=picked.pop()!;
    used.delete(titleKey(replaced.title));
    picked.push(pick(topic=>isOtherMenuTopic(topic)&&titleKey(topic.title)!==titleKey(replaced.title)));
    if(!replaced.id.startsWith("fallback-"))filled++;
  }
  // 시기·검색 흐름을 반영한 주제를 앞으로(같은 무리 안에서는 AI가 준 순서 그대로). 화면은 첫 주제를 먼저 골라 둔다.
  const tagged=(topic:TopicSuggestion)=>Number(Boolean(topic.season||topic.trend));
  picked.sort((a,b)=>tagged(b)-tagged(a));
  return {topics:picked,filled,rejected};
}

// Structural editorial checks, not a fact checker or a judgment of marketing performance.
// 물음표 질문·가게 이름 없음·가게 메뉴로 이어지는 설명, 주인공 메뉴가 겹치지 않고 삼합은 하나, 그리고 메뉴를 고르게 다룬다
// (순서·홍어 질문 개수는 보지 않는다).
export function followsCuriosityBrief(topics:TopicSuggestion[],storeName:string):boolean {
  return topics.every((topic,i)=>meetsTopicBasics(topic,storeName)&&fitsWith(topics.slice(0,i),topic))&&isVariedSet(topics);
}

// AI가 season에 적은 이름이 이번 시기(계절·행사)에 없는 말이면 화면에 잘못된 표시가 붙지 않게 지운다.
// AI가 "가을 제철", "곧 막걸리의 날"처럼 이름에 말을 덧붙였으면 그 이름으로 맞춘다(예전에는 통째로 지워 계절 표시가 사라졌다).
// AI가 비워 뒀어도 주인공 메뉴가 지금 제철·곧 제철(사계절 메뉴 제외)이면 이번 계절 이름을 붙인다.
function normalizeSeasonLabels(topics:TopicSuggestion[],season?:SeasonContext):TopicSuggestion[] {
  if(!season)return topics.map(topic=>({...topic,season:""}));
  // 행사 이름을 먼저 본다("막걸리의 날"이 "가을"보다 구체적).
  const allowed=[...season.events.map(event=>event.name),season.season];
  const dated=menusForDate(season.today,season.season);
  const timely=new Set([...dated.inSeason,...dated.upcoming].filter(item=>item.seasons.length||item.months).map(item=>item.id));
  return topics.map(topic=>{
    const label=topic.season.trim();
    const named=label?allowed.find(name=>label===name)??allowed.find(name=>label.includes(name)):undefined;
    const menu=topicMenu(topic)?.id;
    return {...topic,season:named??(menu&&timely.has(menu)?season.season:"")};
  });
}

// onFallback: 세 칸 모두 준비된 주제로 대체됐을 때(이유와 함께). onPartial: 일부 칸만 채웠을 때.
// AI가 trend에 적은 말은 이번에 넘긴 검색 흐름 말이고, 제목·설명에 그 말이나 이어지는 메뉴가 실제로 나올 때만 남긴다.
export function normalizeTrendLabels(topics:TopicSuggestion[],trends:readonly string[]=[]):TopicSuggestion[] {
  return topics.map(topic=>{
    const keyword=topic.trend.trim();
    const menu=STORE_MENU.find(item=>item.id===trendMenu(keyword));
    const text=`${topic.title} ${topic.summary}`;
    // 가게 메뉴로 이어지는 검색어는 그 메뉴를 다루는 주제에만 붙인다. 글자만 보면 "전"이 "작성 전"에도 걸려
    // 홍어 주제에 "검색 흐름: 전"이 붙었다(검수 보고서 P3). 메뉴가 아닌 말(굴·회식)은 낱말 첫머리에 있을 때만("굴보쌈"은 되고 "얼굴"은 안 됨).
    const atWordStart=(word:string)=>new RegExp(`(?:^|[^가-힣])${word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`).test(text);
    const used=Boolean(keyword)&&trends.includes(keyword)&&(menu?menuOf(text).some(item=>item.id===menu.id):atWordStart(keyword));
    return {...topic,trend:used?keyword:""};
  });
}

// AI 주제를 하나씩 읽는다. 형식이 틀린 주제(너무 긴 제목 등)만 빼고 나머지는 살린다: 예전에는 하나만 틀려도 세 주제를
// 통째로 버리고 준비된 주제로 바꿨다(검수 보고서 P9). 빠진 자리는 assembleTopics가 준비된 주제로 채운다.
// 셋 다 틀렸으면 예전처럼 형식 오류로 본다(준비된 주제 + "형식이 맞지 않았어요" 안내).
function readSuggestions(value:unknown):TopicSuggestion[] {
  if(!Array.isArray(value))return TopicSuggestionsSchema.parse(value);
  const read=value.map(item=>TopicSuggestionSchema.safeParse(item)).flatMap(result=>result.success?[result.data]:[]);
  if(!read.length)return TopicSuggestionsSchema.parse(value);
  // 같은 id가 겹치면 뒤 주제의 id를 바꾼다(id는 화면 카드 열쇠일 뿐이다).
  const seen=new Set<string>();
  return read.map((topic,i)=>{const id=seen.has(topic.id)?`${topic.id}-${i+1}`:topic.id;seen.add(id);return {...topic,id};});
}

// onFallback(reason, error): 준비된 주제로 바꾼 이유(로그용 글)와, AI 호출이 실패했으면 그 오류(화면에 보여 줄 이유를 고르는 데 쓴다).
export async function suggestTopics(input:TopicInput,ai?:TopicAiClient,onFallback?:(reason:string,error?:unknown,rejected?:Partial<Record<TopicRejectReason,number>>)=>void,season?:SeasonContext,onPartial?:(filled:number)=>void,hints:TopicHints={}):Promise<TopicSuggestion[]> {
  const parsed=TopicInputSchema.parse(input);
  const fallback=(reason="no AI client",error?:unknown,rejected?:Partial<Record<TopicRejectReason,number>>)=>{onFallback?.(reason,error,rejected);return fallbackTopics(parsed.recommendationRound,parsed.excludeTitles,season,parsed.avoidTitles,hints);};
  if(!ai)return fallback();
  try{
    const ask=async(input:typeof parsed)=>{
      const suggestions=normalizeTrendLabels(normalizeSeasonLabels(readSuggestions(await ai.suggest(input)),season),hints.trends);
      return {suggestions,...assembleTopics(suggestions,{storeName:parsed.storeName,round:parsed.recommendationRound,excludeTitles:parsed.excludeTitles,avoidTitles:parsed.avoidTitles,season,hints})};
    };
    let result=await ask(parsed);
    // 셋 다 "이미 보여 준·했던 주제"로 거절되면(사장님 지적 2026-10-13: 앱을 열자마자 준비된 주제만 돌아 반복처럼 보임), 준비된 주제로 넘어가기 전에
    // 거절된 제목을 피할 목록 맨 앞에 두고 한 번만 다시 묻는다. AI는 피할 목록 앞쪽 30개만 보므로, 방금 낸 제목을 또 내는 일이 잦았다.
    if(result.filled>=3&&((result.rejected.recent??0)+(result.rejected.current??0))>0){
      const rejectedTitles=result.suggestions.map(topic=>topic.title);
      console.warn(`[topics] AI 추천 3개가 모두 했던 주제라 거절된 제목을 피해 한 번 더 물어요: ${rejectedTitles.join(" / ").slice(0,200)}`);
      result=await ask({...parsed,avoidTitles:[...new Set([...rejectedTitles,...parsed.avoidTitles])].slice(0,300)});
    }
    const {topics,filled,rejected,suggestions}=result;
    if(filled>=3)return fallback(`suggestions broke the topic rules (${Object.entries(rejected).map(([reason,count])=>`${reason}×${count}`).join(", ")}): ${suggestions.map(topic=>topic.title).join(" / ").slice(0,200)}`,undefined,rejected);
    if(filled>0)onPartial?.(filled);
    return topics;
  }catch(error){return fallback(error instanceof Error?error.message.replace(/\s+/g," ").slice(0,300):"AI request failed",error);}
}
