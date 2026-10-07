import { TopicInputSchema, TopicSuggestionsSchema, type TopicInput, type TopicSuggestion, type TopicSuggestionInput } from "./schema";
import type { SeasonContext } from "./season";
import { STORE_MENU, isHongeoHoe, mainMenuOf, menuOf, menusForDate, type StoreMenuItem } from "@/features/store/menu";
import { trendMenu } from "./naverTrend";

export interface TopicAiClient {
  suggest(input:TopicInput):Promise<TopicSuggestionInput[]>;
}

// 라운드마다 세 방향. 홍어·삼합만 파지 않도록 한 라운드에 가게의 다른 메뉴(과메기·미나리전·배다리 막걸리·홍어애탕·홍어무침) 방향을 꼭 섞는다.
const TOPIC_DIRECTIONS = [
  ["익숙한 음식 조합의 이유","이 계절에 어울리는 가게 메뉴 소개(홍어회·삼합 말고)","홍어회와 삼합을 함께 먹는 이유"],
  ["발효 음식에 대한 궁금증","막걸리와 전처럼 곁들이는 술·안주 이야기","회가 아닌 홍어 요리(홍어애탕·홍어무침)"],
  ["같은 재료를 다르게 먹는 이유","친구와 음식을 나눌 때의 궁금증","홍어를 처음 맛보는 방법"],
  ["곁들임이 맛에 주는 변화","제철 메뉴 한 접시(과메기·미나리전 등)","홍어의 향과 식감"],
] as const;

type PreparedTopic=Omit<TopicSuggestion,"id"|"season"|"trend">;

// 추천을 고르는 데 쓰는 참고 정보(라우트가 만든다).
// recentMenus: 최근에 보여 준 주제에 자주 나온 메뉴 id(이번에는 되도록 빼서 메뉴를 고르게 돌린다).
// trends: 네이버 검색이 늘어난 말(묶음 이름). 준비된 주제는 그 말과 이어지는 메뉴를 먼저 고른다.
export type TopicHints={recentMenus?:ReadonlySet<string>;trends?:readonly string[]};

// 준비된 주제(AI 실패 시). 라운드마다 [일상 질문, (메뉴 소개 칸은 계절에 맞춰 아래 MENU_TOPICS에서), 홍어 요리 질문].
// 일상 질문 제목에는 홍어·삼합을 넣지 않고, summary 앞쪽에 이어질 가게 메뉴를 먼저 적는다(메뉴 판별에 쓰인다).
const FALLBACK_TOPIC_ROUNDS:Array<{general:PreparedTopic;hongeo:PreparedTopic}> = [
  {
    general:{title:"같은 회인데 왜 식감은 다를까?",summary:"회를 고를 때 부드러움과 탄력 중 무엇을 좋아하는지 질문합니다. 종류와 부위에 따른 식감 차이는 출처를 확인해 설명하고, 탄력 있는 홍어회와 반건조한 과메기처럼 서로 다른 식감의 메뉴로 연결합니다.",reason:"회를 즐기던 사람이 자신의 취향으로 읽기 시작할 수 있어요.",audience:"A",imageBrief:"홍어회의 얇은 단면과 결이 보이는 한 접시"},
    hongeo:{title:"홍어는 왜 수육이랑 먹을까?",summary:"홍어의 탄력 있는 식감에 수육의 부드러움과 묵은지의 새콤함을 곁들이는 삼합 조합을 설명합니다. 특유의 향은 남는다고 알리고, 작은 한입으로 취향을 살펴보는 방법으로 마무리합니다.",reason:"삼합 사진을 본 사람이 세 재료를 함께 먹는 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"홍어·수육·묵은지를 조금씩 곁들인 한입"},
  },
  {
    general:{title:"치즈는 익숙한데 다른 발효 음식은 왜 낯설까?",summary:"발효 음식마다 향과 먹어 본 경험이 다르다는 점에서 질문을 시작합니다. 치즈와 홍어를 같은 맛으로 취급하지 않고 취향 차이로 연결하며, 낯섦의 심리적 원인은 출처 확인 없이 단정하지 않습니다.",reason:"익숙한 치즈를 떠올리며 낯선 음식에 대한 취향을 비교할 수 있어요.",audience:"C",imageBrief:"발효 음식 비교 설명에 사용할 홍어회 한 접시"},
    hongeo:{title:"홍어애탕은 어떤 국물일까?",summary:"회로만 알던 홍어를 뜨끈한 국물로 먹는 홍어애탕을 소개합니다. 들어가는 재료와 맛은 사장님께 확인한 뒤에만 쓰고, 김이 오르는 한 그릇을 나눠 먹는 장면 중심으로 설명합니다.",reason:"홍어를 회로만 알던 사람이 다른 먹는 방법을 궁금해할 수 있어요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"},
  },
  {
    general:{title:"새콤한 무침은 왜 술안주로 찾을까?",summary:"술자리에서 새콤한 무침을 찾는 익숙한 장면에서 시작합니다. 홍어무침을 사례로 양념과 홍어 조각이 어우러지는 모습을 보여 주고 막걸리 한 잔과 이어 가되, 맛이 어울리는 원리는 출처 확인 없이 단정하지 않습니다.",reason:"무침 안주를 시켜 본 사람이 이유를 떠올려 볼 수 있어요.",audience:"B",imageBrief:"붉은 양념에 무친 홍어무침 한 접시와 막걸리 사발"},
    hongeo:{title:"홍어를 처음 먹는다면 한입에 얼마나 올릴까?",summary:"홍어의 향이 낯선 사람이 첫 한입을 고민하는 장면을 다룹니다. 고정된 정답이나 쉬운 입문을 보장하지 않고, 홍어회를 조금씩 곁들여 취향에 맞는 양을 찾는 방법을 설명합니다.",reason:"처음 맛보려는 사람이 바로 떠올릴 구체적인 질문이에요.",audience:"C",imageBrief:"홍어회를 소량 곁들여 만든 한입"},
  },
  {
    general:{title:"같은 음식을 먹는데 왜 취향은 갈릴까?",summary:"친구와 같은 메뉴를 먹고도 향과 식감에 대한 반응이 다른 장면을 소개합니다. 홍어를 사례로 서로의 취향을 확인하는 방법을 제안하고, 유전이나 감각의 원인은 검증 없이 설명하지 않습니다.",reason:"친구와 메뉴를 정하며 겪었던 차이를 떠올릴 수 있어요.",audience:"B",imageBrief:"서로 나누어 맛보기 좋게 놓인 홍어회와 곁들임"},
    hongeo:{title:"홍어무침과 홍어회는 무엇이 다를까?",summary:"홍어무침과 홍어회를 나란히 놓고 같은 홍어가 양념에 무쳤을 때와 회로 먹을 때 어떻게 다르게 보이는지 비교합니다. 양념으로 향이 없어진다고 단정하지 않고, 어떤 쪽이 취향에 맞을지 살펴보게 합니다.",reason:"홍어회만 알던 사람이 다른 메뉴를 고를 이유가 생겨요.",audience:"A",imageBrief:"붉은 양념의 홍어무침과 얇게 썬 홍어회가 나란히 놓인 장면"},
  },
];

// 메뉴 소개 칸(홍어회·삼합이 아닌 메뉴). 계절에 맞는 메뉴를 먼저 고른다(계절은 STORE_MENU의 seasons).
// 제목에는 홍어·삼합을 넣지 않는다(일상 질문 칸과 같은 자리에 들어가므로).
const MENU_TOPICS:Array<{menu:string;topic:PreparedTopic}>=[
  {menu:"gwamegi",topic:{title:"과메기는 왜 찬바람이 불면 찾을까?",summary:"겨울이 되면 과메기를 찾는 익숙한 장면에서 시작합니다. 과메기가 겨울 메뉴로 꼽히는 이유와 만드는 과정은 출처를 확인한 뒤 쓰고, 함께 내는 곁들임 구성은 사장님께 확인한 것만 소개합니다.",reason:"겨울마다 과메기 사진을 보는 사람이 제철의 이유를 궁금해할 수 있어요.",audience:"A",imageBrief:"윤기 도는 과메기를 길게 썰어 가지런히 담은 한 접시"}},
  {menu:"minari-jeon",topic:{title:"미나리전엔 왜 막걸리가 생각날까?",summary:"미나리전 한 장에 배다리 막걸리 한 잔을 곁들이는 장면을 다룹니다. 전과 막걸리가 어울린다고 느끼는 이유는 단정하지 않고 사람들이 즐겨 찾는 조합으로 소개하며, 홍어 메뉴는 함께 맛볼 선택지로만 덧붙입니다.",reason:"전과 막걸리 조합을 아는 사람이 바로 떠올릴 장면이에요.",audience:"B",imageBrief:"노릇한 미나리전 한 장과 막걸리 사발"}},
  {menu:"baedari-makgeolli",topic:{title:"막걸리는 왜 사발에 따라 마실까?",summary:"배다리 막걸리를 사발에 따르는 장면에서 막걸리를 마시는 그릇 이야기를 시작합니다. 사발을 쓰는 유래와 양조장 이야기는 출처를 확인한 뒤에만 쓰고, 어울리는 안주로 미나리전과 홍어무침을 소개합니다.",reason:"막걸리를 마셔 본 사람이 익숙한 그릇의 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"사발에 따른 뽀얀 배다리 막걸리"}},
  {menu:"hongeo-aetang",topic:{title:"추운 날엔 왜 뜨끈한 탕이 당길까?",summary:"찬바람이 불면 국물 요리를 찾는 장면에서 시작합니다. 홍어애탕 한 그릇을 사례로 소개하되 몸에 좋다는 효능은 말하지 않고, 들어가는 재료와 맛은 사장님께 확인한 뒤 씁니다.",reason:"날이 추워지면 누구나 떠올리는 장면이에요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"}},
  {menu:"hongeo-jjim",topic:{title:"생선은 찌면 맛이 어떻게 달라질까?",summary:"같은 생선도 날로 먹을 때와 쪄서 먹을 때 식감과 향이 달라지는 장면에서 시작합니다. 홍어찜 한 접시를 사례로 익은 살의 결과 윤기를 보여 주되, 맛의 변화는 단정하지 않고 조리법·곁들임은 사장님께 확인한 것만 씁니다.",reason:"회만 알던 사람이 익힌 요리를 궁금해할 수 있어요.",audience:"B",imageBrief:"김이 오르는 홍어찜 한 접시"}},
  {menu:"hongeo-muchim",topic:{title:"입맛 없을 땐 왜 새콤한 게 당길까?",summary:"더운 날이나 입맛 없을 때 새콤한 음식을 찾는 장면에서 시작합니다. 홍어무침을 사례로 붉은 양념의 새콤한 한 접시를 소개하되, 입맛이 돈다는 효과는 단정하지 않습니다.",reason:"입맛 없는 날 메뉴를 고민하는 사람이 공감할 질문이에요.",audience:"A",imageBrief:"붉은 양념에 무친 홍어무침 한 접시"}},
  {menu:"gwamegi",topic:{title:"과메기는 왜 반쯤 말려서 먹을까?",summary:"생선을 반쯤 말려 먹는 과메기의 겉모습에서 질문을 시작합니다. 말리는 방법과 식감의 변화는 출처를 확인해 설명하고, 연말·신년 모임에 나눠 먹는 겨울 메뉴로 소개합니다.",reason:"과메기를 처음 본 사람이 생김새를 궁금해할 수 있어요.",audience:"C",imageBrief:"길게 썬 과메기의 윤기와 결이 보이는 접시"}},
  {menu:"minari-jeon",topic:{title:"봄 미나리는 왜 전으로 부쳐 먹을까?",summary:"봄철 미나리를 전으로 부치는 장면을 다룹니다. 미나리전의 노릇한 겉면과 초록 줄기가 보이는 한 장을 소개하고, 제철 이야기는 일반적인 수준으로만 쓰며 막걸리와 곁들이는 자리로 이어 갑니다.",reason:"봄나물을 즐기는 사람이 익숙한 질문이에요.",audience:"A",imageBrief:"초록 미나리 줄기가 비치는 노릇한 미나리전"}},
  {menu:"baedari-makgeolli",topic:{title:"막걸리 한 잔엔 어떤 안주가 어울릴까?",summary:"배다리 막걸리 한 잔을 앞에 두고 안주를 고르는 장면을 다룹니다. 미나리전·홍어무침·홍어회처럼 가게 메뉴를 하나씩 비교해 취향대로 고르는 방법을 제안하고, 어울림의 원리는 단정하지 않습니다.",reason:"막걸리 집에서 안주를 고민해 본 사람이 많아요.",audience:"B",imageBrief:"막걸리 사발 옆에 놓인 미나리전과 홍어무침"}},
];

// AI를 쓰지 못할 때 준비된 주제의 첫 칸(홍어를 제목에 넣지 않는 칸)을 이번 시기 주제로 바꿔 끼운다.
// season.ts 행사 id로 찾는다. 제목은 홍어·삼합 없이, summary에는 이어질 가게 메뉴를 먼저 적는다.
const SEASONAL_TOPICS:Record<string,PreparedTopic>={
  seollal:{title:"명절 상에는 왜 지역마다 다른 음식이 오를까?",summary:"설 연휴 가족 상차림에서 지역마다 빠지지 않는 음식이 다른 장면을 다룹니다. 전라도 잔칫상에 오르는 홍어를 사례로 소개하되, 유래와 역사는 출처를 확인한 뒤에만 씁니다.",reason:"명절에 고향 상차림을 떠올리는 사람이 많은 시기예요.",audience:"C",imageBrief:"명절 상 위에 놓인 홍어회 한 접시"},
  chuseok:{title:"명절 상에는 왜 지역마다 다른 음식이 오를까?",summary:"추석 가족 상차림에서 지역마다 빠지지 않는 음식이 다른 장면을 다룹니다. 전라도 잔칫상에 오르는 홍어를 사례로 소개하되, 유래와 역사는 출처를 확인한 뒤에만 씁니다.",reason:"명절에 고향 상차림을 떠올리는 사람이 많은 시기예요.",audience:"C",imageBrief:"명절 상 위에 놓인 홍어회 한 접시"},
  boknal:{title:"복날엔 왜 뜨끈한 국물을 찾을까?",summary:"더운 복날에도 뜨끈한 국물 한 그릇을 찾는 익숙한 장면에서 시작합니다. 홍어애탕을 든든한 한 끼로 소개하되 보양 효능은 단정하지 않고, 재료와 맛은 사장님께 확인한 뒤 씁니다.",reason:"복날을 앞두고 무엇을 먹을지 고민하는 시기예요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"},
  makgeolli:{title:"막걸리엔 왜 전을 곁들일까?",summary:"막걸리의 날 즈음 막걸리 안주를 고르는 장면을 다룹니다. 배다리 막걸리와 미나리전을 함께 놓는 조합을 살피고, 홍어무침처럼 새콤한 안주도 선택지로 덧붙이되 어울림의 원리는 단정하지 않습니다.",reason:"10월 마지막 목요일 막걸리의 날을 앞둔 시기예요.",audience:"B",imageBrief:"막걸리 사발과 노릇한 미나리전 한 장"},
  spring:{title:"봄 모임 메뉴는 왜 고르기 어려울까?",summary:"새 학기·새 직장 모임처럼 처음 만난 사람들과 메뉴를 정하는 장면을 다룹니다. 봄 미나리로 부친 미나리전과 막걸리처럼 나눠 먹는 메뉴에, 호불호가 있는 홍어회를 조금씩 맛보는 방법을 더해 소개합니다.",reason:"모임이 늘어나는 봄에 메뉴를 정하는 사람이 많아요.",audience:"B",imageBrief:"여럿이 나눠 먹는 미나리전과 막걸리 한 상"},
  family:{title:"부모님 세대가 좋아하는 음식은 왜 다를까?",summary:"가정의 달 가족 외식에서 세대마다 좋아하는 음식이 다른 장면을 다룹니다. 부모님 세대에 익숙한 홍어를 함께 맛보며 이야기를 나누는 흐름으로 이어갑니다.",reason:"어버이날 가족 외식 메뉴를 고민하는 시기예요.",audience:"B",imageBrief:"가족이 함께 나눠 먹는 홍어회 한 상"},
  rainy:{title:"비 오는 날엔 왜 전과 막걸리가 생각날까?",summary:"장마철 비 오는 날 전과 막걸리가 생각나는 익숙한 장면에서 시작합니다. 미나리전 한 장과 배다리 막걸리 한 잔을 소개하되, 비와 전이 이어지는 이유는 단정하지 않습니다.",reason:"장마철마다 많이 나누는 이야기예요.",audience:"C",imageBrief:"비 오는 창가의 막걸리와 미나리전"},
  kimjang:{title:"김장하는 날엔 왜 수육을 삶을까?",summary:"김장날 갓 담근 김치에 수육을 곁들이는 장면을 다룹니다. 새 김치와 묵은지의 차이를 살피고, 수육·묵은지에 홍어를 더한 삼합으로 이어갑니다.",reason:"김장철에 집집마다 떠올리는 장면이에요.",audience:"A",imageBrief:"수육과 묵은지, 홍어가 놓인 한 접시"},
  yearend:{title:"송년회 메뉴는 왜 나눠 먹는 음식이 좋을까?",summary:"연말 모임에서 여럿이 한 상을 나누는 장면을 다룹니다. 겨울 제철 과메기와 홍어회처럼 각자 조금씩 골라 먹는 상차림을 소개하고, 구성은 사장님께 확인한 것만 씁니다.",reason:"연말 모임 장소와 메뉴를 정하는 시기예요.",audience:"B",imageBrief:"여럿이 둘러앉아 나눠 먹는 과메기 한 접시"},
  newyear:{title:"새해 첫 모임엔 어떤 음식을 고를까?",summary:"신년회와 새해 첫 만남에서 메뉴를 정하는 장면을 다룹니다. 겨울 제철 과메기와 뜨끈한 홍어애탕처럼 함께 나눠 먹기 좋은 메뉴를 소개하고, 처음 먹는 사람을 위한 작은 한입을 덧붙입니다.",reason:"새해 모임 메뉴를 고민하는 시기예요.",audience:"B",imageBrief:"새해 모임 상 위의 과메기와 홍어애탕"},
};

const titleKey=(title:string)=>title.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu,"");

export function topicDirectionsForRound(round:number):readonly string[] {
  return TOPIC_DIRECTIONS[round%TOPIC_DIRECTIONS.length];
}

// 주제가 주로 다루는 가게 메뉴(제목에서 먼저, 없으면 설명에서 먼저 나온 메뉴). 메뉴를 못 찾으면 undefined.
export function topicMenu(topic:Pick<TopicSuggestion,"title"|"summary">):StoreMenuItem|undefined {
  return mainMenuOf(topic.title,topic.summary);
}
// 홍어회·삼합이 아닌 가게 메뉴(과메기·미나리전·배다리 막걸리·홍어애탕·홍어무침 등)를 다루는 주제인지.
export const isOtherMenuTopic=(topic:Pick<TopicSuggestion,"title"|"summary">)=>{const menu=topicMenu(topic);return Boolean(menu&&!isHongeoHoe(menu));};

// 메뉴 소개 칸 고르기. 앞 단계일수록 먼저:
// 검색이 늘어난 말의 메뉴 → 이번 철(또는 곧 제철) 메뉴 가운데 최근에 자주 안 나온 것 → 최근에 자주 안 나온 아무 메뉴
// → 이번 철 메뉴 → 겹치지 않는 메뉴 → 아무거나. 모두 다른 칸과 메뉴가 겹치지 않는 것을 먼저 본다.
// 라운드마다 시작 위치를 돌려 같은 메뉴만 나오지 않게 한다.
function pickMenuTopic(index:number,season:SeasonContext|undefined,taken:ReadonlySet<string>,accept:(topic:PreparedTopic)=>boolean,hints:TopicHints={}):{topic:PreparedTopic;trend:string}|undefined {
  const {inSeason,upcoming}=menusForDate(season?.today,season?.season);
  const timely=new Set([...inSeason,...upcoming].map(item=>item.id));
  const recent=hints.recentMenus??new Set<string>();
  const trendOf=(menu:string)=>(hints.trends??[]).find(keyword=>trendMenu(keyword)===menu)??"";
  const rotated=MENU_TOPICS.map((_,i)=>MENU_TOPICS[(index+i)%MENU_TOPICS.length]);
  type Item=typeof MENU_TOPICS[number];
  const tiers:Array<(item:Item)=>boolean>=[
    item=>Boolean(trendOf(item.menu))&&!taken.has(item.menu),
    item=>timely.has(item.menu)&&!taken.has(item.menu)&&!recent.has(item.menu),
    item=>!taken.has(item.menu)&&!recent.has(item.menu),
    item=>timely.has(item.menu)&&!taken.has(item.menu),
    item=>!taken.has(item.menu),
    ()=>true,
  ];
  for(const tier of tiers){const found=rotated.find(item=>tier(item)&&accept(item.topic));if(found)return {topic:found.topic,trend:trendOf(found.menu)};}
  return undefined;
}

// 최근 주제 제목에서 주인공 메뉴를 짐작한다(메뉴 이름이 없으면 준비된 주제의 설명, "탕·국물"이면 홍어애탕).
const PREPARED_SUMMARIES=new Map<string,string>([...FALLBACK_TOPIC_ROUNDS.flatMap(round=>[round.general,round.hongeo]),...MENU_TOPICS.map(item=>item.topic),...Object.values(SEASONAL_TOPICS)].map(topic=>[titleKey(topic.title),topic.summary]));
export function titleMenu(title:string):StoreMenuItem|undefined {
  const direct=mainMenuOf(title);
  if(direct)return direct;
  const summary=PREPARED_SUMMARIES.get(titleKey(title));
  if(summary)return mainMenuOf(summary);
  if(/탕|국물/.test(title))return STORE_MENU.find(item=>item.id==="hongeo-aetang");
  return undefined;
}
// 이번에는 빼고 돌릴 메뉴: 지금 화면(current, "새로고침" 직전 추천)에 나온 메뉴 + 최근 주제(최근 것부터) 9개 안에 두 번 이상 나온 메뉴.
// 홍어회는 홍어 질문 칸에 늘 나오므로 세지 않는다. 같은 메뉴가 새로고침마다 되풀이되지 않게 한다(예: 가을마다 홍어애탕).
export function overusedMenus(recentTitles:readonly string[],current:readonly string[]=[]):Set<string> {
  const menuId=(title:string)=>{const menu=titleMenu(title);return menu&&!isHongeoHoe(menu)?menu.id:undefined;};
  const counts=new Map<string,number>();
  for(const title of recentTitles.slice(0,9)){const id=menuId(title);if(id)counts.set(id,(counts.get(id)??0)+1);}
  const now=current.map(menuId).filter((id):id is string=>Boolean(id));
  return new Set([...now,...[...counts].filter(([,count])=>count>=2).map(([id])=>id)]);
}

// avoidTitles: 최근에 보여 준 주제. 되도록 피하지만, 다 피할 수 없으면 제외 목록만 지킨다.
// 한 묶음 = [일상 질문(또는 이번 시기 주제), 계절에 맞는 메뉴 소개(홍어회·삼합 아님), 홍어 요리 질문].
export function fallbackTopics(round=0,excludeTitles:readonly string[]=[],season?:SeasonContext,avoidTitles:readonly string[]=[],hints:TopicHints={}):TopicSuggestion[] {
  const excluded=new Set(excludeTitles.map(titleKey));
  const avoided=new Set(avoidTitles.map(titleKey));
  // 이번 시기 행사 가운데 준비된 주제가 있고 제외·최근 목록에 없는 첫 행사를 고른다.
  const event=season?.events.find(item=>SEASONAL_TOPICS[item.id]&&!excluded.has(titleKey(SEASONAL_TOPICS[item.id].title))&&!avoided.has(titleKey(SEASONAL_TOPICS[item.id].title)))
    ??season?.events.find(item=>SEASONAL_TOPICS[item.id]&&!excluded.has(titleKey(SEASONAL_TOPICS[item.id].title)));
  const allowed=(topic:PreparedTopic,strict:boolean)=>!excluded.has(titleKey(topic.title))&&(!strict||!avoided.has(titleKey(topic.title)));
  const roundAt=(index:number,strict:boolean):TopicSuggestion[]|undefined=>{
    const round=FALLBACK_TOPIC_ROUNDS[index];
    const first:TopicSuggestion=event?{...SEASONAL_TOPICS[event.id],season:event.name,trend:"",id:`fallback-season-${event.id}`}:{...round.general,season:"",trend:"",id:`fallback-${index+1}-1`};
    const last:TopicSuggestion={...round.hongeo,season:"",trend:"",id:`fallback-${index+1}-3`};
    const taken=new Set([first,last].map(topic=>topicMenu(topic)?.id).filter((id):id is string=>Boolean(id)));
    const menu=pickMenuTopic(index,season,taken,topic=>allowed(topic,strict)&&titleKey(topic.title)!==titleKey(first.title),hints);
    if(!menu)return undefined;
    // 메뉴 소개 칸이 아니어도 주인공 메뉴가 검색이 늘어난 말과 이어지면 그 말을 표시한다(예: 송년회 주제의 과메기).
    const trendFor=(topic:TopicSuggestion)=>topic.trend||((hints.trends??[]).find(keyword=>trendMenu(keyword)&&trendMenu(keyword)===topicMenu(topic)?.id)??"");
    return [first,{...menu.topic,season:"",trend:menu.trend,id:`fallback-${index+1}-2`},last].map(topic=>({...topic,trend:trendFor(topic)}));
  };
  // 1순위: 제외·최근 목록과 하나도 겹치지 않는 묶음, 2순위: 제외 목록만 피한 묶음(최근 것이 일부 겹쳐도).
  for(const strict of [true,false]){
    for(let offset=0;offset<FALLBACK_TOPIC_ROUNDS.length;offset++){
      const topics=roundAt((round+offset)%FALLBACK_TOPIC_ROUNDS.length,strict);
      if(topics?.every(topic=>allowed(topic,strict)))return topics;
    }
  }
  throw new Error("다른 추천 주제를 찾지 못했습니다.");
}

// 주제 한 개가 기본 조건(물음표 질문, 가게 이름 없음, 가게 메뉴로 이어지는 설명)을 지키는지.
const isHongeoTitle=(title:string)=>/홍어|삼합/.test(title);
const meetsTopicBasics=(topic:TopicSuggestion,storeName:string)=>/[?？]$/.test(topic.title.trim())&&!topic.title.includes(storeName)&&topic.summary.trim().length>=30&&menuOf(topic.summary).length>0;

// AI가 준 주제 3개를 통째로 버리지 않고, 조건에 맞는 것만 살려 "일상 질문 2개 + 홍어 질문 1개" 순서로 맞춘다.
// 세 주제가 모두 홍어회·삼합이면 둘째 칸을 이번 계절의 다른 메뉴 주제로 바꾼다(홍어만 파지 않게).
// 모자란 칸만 준비된 주제(이번 시기·최근에 안 보인 것 우선)로 채운다. filled = 준비된 주제로 채운 칸 수.
export function assembleTopics(suggestions:TopicSuggestion[],options:{storeName:string;round:number;excludeTitles:readonly string[];avoidTitles:readonly string[];season?:SeasonContext;hints?:TopicHints}):{topics:TopicSuggestion[];filled:number} {
  const blocked=new Set([...options.excludeTitles,...options.avoidTitles].map(titleKey));
  const used=new Set<string>();
  const take=(topic:TopicSuggestion)=>{used.add(titleKey(topic.title));return topic;};
  const usable=suggestions.filter(topic=>meetsTopicBasics(topic,options.storeName)&&!blocked.has(titleKey(topic.title)))
    .filter(topic=>{const key=titleKey(topic.title);if(used.has(key))return false;used.add(key);return true;});
  used.clear();
  // 일상 질문 칸은 다른 메뉴 주제를 먼저 고른다(AI가 셋 이상 줄 때 홍어회 일색이 되지 않게).
  const general=[...usable.filter(topic=>!isHongeoTitle(topic.title)&&isOtherMenuTopic(topic)),...usable.filter(topic=>!isHongeoTitle(topic.title)&&!isOtherMenuTopic(topic))]
    .slice(0,2).sort((a,b)=>usable.indexOf(a)-usable.indexOf(b)).map(take);
  const hongeo=usable.filter(topic=>isHongeoTitle(topic.title)).slice(0,1).map(take);
  // 채울 후보: 이번 묶음부터 차례로 돌며, 최근에 안 보인 것 → 제외 목록만 피한 것 순서.
  const excluded=new Set(options.excludeTitles.map(titleKey));
  const avoided=new Set(options.avoidTitles.map(titleKey));
  const pool=Array.from({length:FALLBACK_TOPIC_ROUNDS.length},(_,offset)=>fallbackTopics((options.round+offset)%FALLBACK_TOPIC_ROUNDS.length,[],options.season,options.avoidTitles,options.hints)).flat();
  // 최근에 자주 나온 메뉴와 이미 고른 칸의 메뉴는 되도록 피한다(메뉴를 고르게 돌리기).
  const recent=options.hints?.recentMenus??new Set<string>();
  const fresh=(topic:TopicSuggestion)=>{const id=topicMenu(topic)?.id;return !id||(!recent.has(id)&&![...general,...hongeo].some(item=>topicMenu(item)?.id===id));};
  const pick=(fits:(topic:TopicSuggestion)=>boolean)=>{
    for(const [strict,varied] of [[true,true],[true,false],[false,false]] as const){
      const found=pool.find(topic=>fits(topic)&&(!varied||fresh(topic))&&!used.has(titleKey(topic.title))&&!excluded.has(titleKey(topic.title))&&(!strict||!avoided.has(titleKey(topic.title))));
      if(found)return take(found);
    }
    throw new Error("다른 추천 주제를 찾지 못했습니다.");
  };
  let filled=(2-general.length)+(1-hongeo.length);
  while(general.length<2)general.push(pick(topic=>!isHongeoTitle(topic.title)&&(general.some(isOtherMenuTopic)||hongeo.some(isOtherMenuTopic)||isOtherMenuTopic(topic))));
  if(!hongeo.length)hongeo.push(pick(topic=>isHongeoTitle(topic.title)));
  // 그래도 셋 다 홍어회·삼합이면 둘째 칸을 다른 메뉴 주제로 바꾼다.
  if(![...general,...hongeo].some(isOtherMenuTopic)){
    const replaced=general[1];
    used.delete(titleKey(replaced.title));
    general[1]=pick(topic=>!isHongeoTitle(topic.title)&&isOtherMenuTopic(topic)&&titleKey(topic.title)!==titleKey(replaced.title));
    if(!replaced.id.startsWith("fallback-"))filled++;
  }
  return {topics:[...general,...hongeo],filled};
}

// Structural editorial checks, not a fact checker or a judgment of marketing performance.
// 물음표 질문·가게 이름 없음·가게 메뉴로 이어지는 설명, 앞 두 제목은 홍어·삼합 없이, 마지막은 홍어 요리 질문,
// 그리고 셋 중 하나 이상은 홍어회·삼합이 아닌 메뉴를 다룬다.
export function followsCuriosityBrief(topics:TopicSuggestion[],storeName:string):boolean {
  return topics.every(topic=>/[?？]$/.test(topic.title.trim())&&!topic.title.includes(storeName)&&topic.summary.trim().length>=30&&menuOf(topic.summary).length>0)
    && topics.slice(0,2).every(topic=>!/홍어|삼합/.test(topic.title))
    && /홍어|삼합/.test(topics[2]?.title??"")
    && topics.some(isOtherMenuTopic);
}

// AI가 season에 적은 이름이 이번 시기(계절·행사)에 없는 말이면 화면에 잘못된 표시가 붙지 않게 지운다.
function normalizeSeasonLabels(topics:TopicSuggestion[],season?:SeasonContext):TopicSuggestion[] {
  const allowed=new Set(season?[season.season,...season.events.map(event=>event.name)]:[]);
  return topics.map(topic=>({...topic,season:allowed.has(topic.season.trim())?topic.season.trim():""}));
}

// onFallback: 세 칸 모두 준비된 주제로 대체됐을 때(이유와 함께). onPartial: 일부 칸만 채웠을 때.
// AI가 trend에 적은 말은 이번에 넘긴 검색 흐름 말이고, 제목·설명에 그 말이나 이어지는 메뉴가 실제로 나올 때만 남긴다.
export function normalizeTrendLabels(topics:TopicSuggestion[],trends:readonly string[]=[]):TopicSuggestion[] {
  return topics.map(topic=>{
    const keyword=topic.trend.trim();
    const menu=STORE_MENU.find(item=>item.id===trendMenu(keyword));
    const text=`${topic.title} ${topic.summary}`;
    const used=trends.includes(keyword)&&(text.includes(keyword)||Boolean(menu&&menuOf(text).some(item=>item.id===menu.id)));
    return {...topic,trend:used?keyword:""};
  });
}

// onFallback(reason, error): 준비된 주제로 바꾼 이유(로그용 글)와, AI 호출이 실패했으면 그 오류(화면에 보여 줄 이유를 고르는 데 쓴다).
export async function suggestTopics(input:TopicInput,ai?:TopicAiClient,onFallback?:(reason:string,error?:unknown)=>void,season?:SeasonContext,onPartial?:(filled:number)=>void,hints:TopicHints={}):Promise<TopicSuggestion[]> {
  const parsed=TopicInputSchema.parse(input);
  const fallback=(reason="no AI client",error?:unknown)=>{onFallback?.(reason,error);return fallbackTopics(parsed.recommendationRound,parsed.excludeTitles,season,parsed.avoidTitles,hints);};
  if(!ai)return fallback();
  try{
    const suggestions=normalizeTrendLabels(normalizeSeasonLabels(TopicSuggestionsSchema.parse(await ai.suggest(parsed)),season),hints.trends);
    const {topics,filled}=assembleTopics(suggestions,{storeName:parsed.storeName,round:parsed.recommendationRound,excludeTitles:parsed.excludeTitles,avoidTitles:parsed.avoidTitles,season,hints});
    if(filled>=3)return fallback(`suggestions broke the topic rules: ${suggestions.map(topic=>topic.title).join(" / ").slice(0,200)}`);
    if(filled>0)onPartial?.(filled);
    return topics;
  }catch(error){return fallback(error instanceof Error?error.message.replace(/\s+/g," ").slice(0,300):"AI request failed",error);}
}
