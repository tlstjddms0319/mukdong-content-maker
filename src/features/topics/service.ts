import { TopicInputSchema, TopicSuggestionsSchema, type TopicInput, type TopicSuggestion, type TopicSuggestionInput } from "./schema";
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
export type TopicHints={recentMenus?:ReadonlySet<string>;trends?:readonly string[]};

// 준비된 질문 주제(AI 실패 시). 정해진 칸 없이 아래 메뉴 주제·시기 주제와 한 후보 목록에 놓고 fallbackTopics가 고른다.
// summary 앞쪽에 이어질 가게 메뉴를 먼저 적는다(메뉴 판별에 쓰인다).
const QUESTION_TOPICS:PreparedTopic[] = [
  {title:"같은 회인데 왜 식감은 다를까?",summary:"회를 고를 때 부드러움과 탄력 중 무엇을 좋아하는지 질문합니다. 종류와 부위에 따른 식감 차이는 출처를 확인해 설명하고, 탄력 있는 홍어회와 반건조한 과메기처럼 서로 다른 식감의 메뉴로 연결합니다.",reason:"회를 즐기던 사람이 자신의 취향으로 읽기 시작할 수 있어요.",audience:"A",imageBrief:"홍어회의 얇은 단면과 결이 보이는 한 접시"},
  {title:"홍어는 왜 수육이랑 먹을까?",summary:"홍어의 탄력 있는 식감에 수육의 부드러움과 묵은지의 새콤함을 곁들이는 삼합 조합을 설명합니다. 특유의 향은 남는다고 알리고, 작은 한입으로 취향을 살펴보는 방법으로 마무리합니다.",reason:"삼합 사진을 본 사람이 세 재료를 함께 먹는 이유를 궁금해할 수 있어요.",audience:"C",imageBrief:"홍어·수육·묵은지를 조금씩 곁들인 한입"},
  {title:"치즈는 익숙한데 다른 발효 음식은 왜 낯설까?",summary:"발효 음식마다 향과 먹어 본 경험이 다르다는 점에서 질문을 시작합니다. 치즈와 홍어를 같은 맛으로 취급하지 않고 취향 차이로 연결하며, 낯섦의 심리적 원인은 출처 확인 없이 단정하지 않습니다.",reason:"익숙한 치즈를 떠올리며 낯선 음식에 대한 취향을 비교할 수 있어요.",audience:"C",imageBrief:"발효 음식 비교 설명에 사용할 홍어회 한 접시"},
  {title:"홍어애탕은 어떤 국물일까?",summary:"회로만 알던 홍어를 뜨끈한 국물로 먹는 홍어애탕을 소개합니다. 들어가는 재료와 맛은 사장님께 확인한 뒤에만 쓰고, 김이 오르는 한 그릇을 나눠 먹는 장면 중심으로 설명합니다.",reason:"홍어를 회로만 알던 사람이 다른 먹는 방법을 궁금해할 수 있어요.",audience:"A",imageBrief:"김이 오르는 홍어애탕 한 그릇"},
  {title:"새콤한 무침은 왜 술안주로 찾을까?",summary:"술자리에서 새콤한 무침을 찾는 익숙한 장면에서 시작합니다. 홍어무침을 사례로 양념과 홍어 조각이 어우러지는 모습을 보여 주고 막걸리 한 잔과 이어 가되, 맛이 어울리는 원리는 출처 확인 없이 단정하지 않습니다.",reason:"무침 안주를 시켜 본 사람이 이유를 떠올려 볼 수 있어요.",audience:"B",imageBrief:"붉은 양념에 무친 홍어무침 한 접시와 막걸리 사발"},
  {title:"홍어를 처음 먹는다면 한입에 얼마나 올릴까?",summary:"홍어의 향이 낯선 사람이 첫 한입을 고민하는 장면을 다룹니다. 고정된 정답이나 쉬운 입문을 보장하지 않고, 홍어회를 조금씩 곁들여 취향에 맞는 양을 찾는 방법을 설명합니다.",reason:"처음 맛보려는 사람이 바로 떠올릴 구체적인 질문이에요.",audience:"C",imageBrief:"홍어회를 소량 곁들여 만든 한입"},
  {title:"같은 음식을 먹는데 왜 취향은 갈릴까?",summary:"친구와 같은 메뉴를 먹고도 향과 식감에 대한 반응이 다른 장면을 소개합니다. 홍어를 사례로 서로의 취향을 확인하는 방법을 제안하고, 유전이나 감각의 원인은 검증 없이 설명하지 않습니다.",reason:"친구와 메뉴를 정하며 겪었던 차이를 떠올릴 수 있어요.",audience:"B",imageBrief:"서로 나누어 맛보기 좋게 놓인 홍어회와 곁들임"},
  {title:"홍어무침과 홍어회는 무엇이 다를까?",summary:"홍어무침과 홍어회를 나란히 놓고 같은 홍어가 양념에 무쳤을 때와 회로 먹을 때 어떻게 다르게 보이는지 비교합니다. 양념으로 향이 없어진다고 단정하지 않고, 어떤 쪽이 취향에 맞을지 살펴보게 합니다.",reason:"홍어회만 알던 사람이 다른 메뉴를 고를 이유가 생겨요.",audience:"A",imageBrief:"붉은 양념의 홍어무침과 얇게 썬 홍어회가 나란히 놓인 장면"},
];

// 메뉴 주제(홍어회·삼합이 아닌 메뉴가 주인공). menu id로 계절·검색 흐름·최근 메뉴를 맞춰 고른다(계절은 STORE_MENU의 seasons·months).
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

// 이번 시기 주제(AI를 쓰지 못할 때 행사가 있으면 맨 앞에 둔다). season.ts 행사 id로 찾는다. summary에는 이어질 가게 메뉴를 먼저 적는다.
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

// 이번 회차에 참고로 건넬 관점 4개(회차마다 3칸씩 밀어 돌린다).
export function topicAnglesForRound(round:number):string[] {
  return Array.from({length:4},(_,i)=>TOPIC_ANGLES[(round*3+i)%TOPIC_ANGLES.length]);
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
const fitsWith=(picked:readonly TopicSuggestion[],topic:TopicSuggestion)=>{
  const id=topicMenu(topic)?.id;
  return !picked.some(item=>topicMenu(item)?.id===id)&&!(isSamhapTopic(topic)&&picked.some(isSamhapTopic));
};

// 준비된 주제 3개(AI 실패 시, AI 주제가 모자랄 때 채울 후보). 정해진 칸 없이 후보를 점수 순으로 줄 세워 고른다.
// 후보 = 이번 시기 행사 주제 + 질문 주제와 메뉴 주제를 번갈아(회차마다 두 칸씩 밀어 돌린다).
// 점수: 이번 시기 행사 주제 > 검색이 늘어난 말의 메뉴 > 지금 제철·곧 제철 메뉴(사계절 메뉴 제외). 같으면 후보 순서.
// 제철이 아닌 메뉴: 제철 달이 정해진 메뉴(과메기 11~2월)는 다른 후보가 다 떨어졌을 때만 고르고,
// 계절에 특히 어울리는 메뉴(미나리전·홍어무침 봄여름, 홍어애탕 가을겨울)는 철이 아니면 점수를 낮춘다.
// 고를 때: 주인공 메뉴가 서로 다르게, 삼합은 하나만, 시기 주제는 2개까지, 검색 흐름 주제는 1개까지(프롬프트의 "시기 1~2개·검색 흐름 1개"와 같은 기준).
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
  const isTimely=(topic:TopicSuggestion)=>Boolean(topic.season)||timely.has(menuId(topic));
  const score=(topic:TopicSuggestion)=>(topic.season?4:0)+(trendOf(topic)?2:0)+(timely.has(menuId(topic))?1:0)-(offSeason(topic)==="weak"?1:0);
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
      if(!fitsWith(picked,topic))continue;
      if(isTimely(topic)&&picked.filter(isTimely).length>=2)continue;
      if(trendOf(topic)&&picked.some(item=>trendOf(item)))continue;
      picked.push(topic);
    }
  }
  if(picked.length<3)throw new Error("다른 추천 주제를 찾지 못했습니다.");
  // 점수 순(가장 추천하는 주제가 먼저)으로 놓는다. 화면은 첫 주제를 먼저 골라 둔다.
  picked.sort((a,b)=>ranked.indexOf(a)-ranked.indexOf(b));
  let n=0;
  return picked.map(topic=>({...topic,trend:trendOf(topic),id:topic.id||`fallback-${index+1}-${++n}`}));
}

// 주제 한 개가 기본 조건(물음표 질문, 가게 이름 없음, 가게 메뉴로 이어지는 설명)을 지키는지.
const meetsTopicBasics=(topic:TopicSuggestion,storeName:string)=>/[?？]$/.test(topic.title.trim())&&!topic.title.includes(storeName)&&topic.summary.trim().length>=30&&menuOf(topic.summary).length>0;
// 세 주제가 메뉴를 고르게 다루는지: 하나 이상은 홍어회·삼합이 아닌 메뉴, 셋 다 같은 메뉴는 아님(순서와 상관없음).
const isVariedSet=(topics:TopicSuggestion[])=>topics.some(isOtherMenuTopic)&&new Set(topics.map(topic=>topicMenu(topic)?.id)).size>1;

// AI가 준 주제 3개를 순서 그대로 살린다(첫 번째가 AI가 가장 추천하는 주제). 기본 조건에 안 맞거나 지금 화면·최근에 나온 제목,
// 겹치는 제목, 앞 주제와 주인공 메뉴가 겹치거나 두 번째 삼합 주제만 빼고, 모자란 만큼만 준비된 주제(이번 시기·최근에 안 보인 것 우선)로 채운다.
// 셋이 메뉴를 고르게 다루지 않으면(모두 홍어회·삼합, 또는 셋 다 같은 메뉴) 맨 뒤 하나를 다른 메뉴 주제로 바꾼다.
// filled = 준비된 주제로 바꾼 개수.
export function assembleTopics(suggestions:TopicSuggestion[],options:{storeName:string;round:number;excludeTitles:readonly string[];avoidTitles:readonly string[];season?:SeasonContext;hints?:TopicHints}):{topics:TopicSuggestion[];filled:number} {
  const blocked=new Set([...options.excludeTitles,...options.avoidTitles].map(titleKey));
  const used=new Set<string>();
  const take=(topic:TopicSuggestion)=>{used.add(titleKey(topic.title));return topic;};
  const picked:TopicSuggestion[]=[];
  for(const topic of suggestions)if(picked.length<3&&meetsTopicBasics(topic,options.storeName)&&!blocked.has(titleKey(topic.title))&&!used.has(titleKey(topic.title))&&fitsWith(picked,topic))picked.push(take(topic));
  // 채울 후보: 이번 회차 준비된 주제부터 차례로 돌며, 최근에 안 보인 것 → 제외 목록만 피한 것 순서.
  const excluded=new Set(options.excludeTitles.map(titleKey));
  const avoided=new Set(options.avoidTitles.map(titleKey));
  const pool=Array.from({length:PREPARED_ROUNDS},(_,offset)=>fallbackTopics((options.round+offset)%PREPARED_ROUNDS,[],options.season,options.avoidTitles,options.hints)).flat();
  // 최근에 자주 나온 메뉴와 이미 고른 주제의 메뉴는 되도록 피한다(메뉴를 고르게 돌리기).
  const recent=options.hints?.recentMenus??new Set<string>();
  const fresh=(topic:TopicSuggestion)=>{const id=topicMenu(topic)?.id;return !id||(!recent.has(id)&&!picked.some(item=>topicMenu(item)?.id===id));};
  const pick=(fits:(topic:TopicSuggestion)=>boolean)=>{
    for(const [strict,varied] of [[true,true],[true,false],[false,false]] as const){
      const found=pool.find(topic=>fits(topic)&&fitsWith(picked,topic)&&(!varied||fresh(topic))&&!used.has(titleKey(topic.title))&&!excluded.has(titleKey(topic.title))&&(!strict||!avoided.has(titleKey(topic.title))));
      if(found)return take(found);
    }
    throw new Error("다른 추천 주제를 찾지 못했습니다.");
  };
  let filled=3-picked.length;
  while(picked.length<3)picked.push(pick(topic=>picked.some(isOtherMenuTopic)||isOtherMenuTopic(topic)));
  if(!isVariedSet(picked)){
    // 맨 뒤 하나를 빼고 그 자리에 다른 메뉴 주제를 넣는다(pick은 남은 두 주제와 메뉴·삼합이 겹치지 않는 것만 고른다).
    const replaced=picked.pop()!;
    used.delete(titleKey(replaced.title));
    picked.push(pick(topic=>isOtherMenuTopic(topic)&&titleKey(topic.title)!==titleKey(replaced.title)));
    if(!replaced.id.startsWith("fallback-"))filled++;
  }
  return {topics:picked,filled};
}

// Structural editorial checks, not a fact checker or a judgment of marketing performance.
// 물음표 질문·가게 이름 없음·가게 메뉴로 이어지는 설명, 주인공 메뉴가 겹치지 않고 삼합은 하나, 그리고 메뉴를 고르게 다룬다
// (순서·홍어 질문 개수는 보지 않는다).
export function followsCuriosityBrief(topics:TopicSuggestion[],storeName:string):boolean {
  return topics.every((topic,i)=>meetsTopicBasics(topic,storeName)&&fitsWith(topics.slice(0,i),topic))&&isVariedSet(topics);
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
