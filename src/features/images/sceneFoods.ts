import { menuOf, type StoreMenuItem } from "@/features/store/menu";

// "사진에 나올 음식만 말한다" 규칙의 공통 부품. 구성안 정리(carousel.ts)와 이미지 지시문(openaiRequest.ts)이 함께 쓴다.
//
// 왜 필요한가: 과메기 글에 삼합 사진이 나온 일이 있었다. 이미지 모델은 "홍어·수육·묵은지를 넣지 마"처럼
// 부정문으로 말해도 낱말 자체에 끌려 그 음식을 그리기 쉽다. 또 구성안 AI가 전 장 공통 스타일(styleAnchor)이나
// 장면 설명에 "홍어 삼합 한 상"을 적어 두면, 과메기 장에도 그대로 실려 갔다.
// 그래서 (1) 공통 스타일에는 음식 이름을 두지 않고, (2) 장면 설명은 그 장의 글이 말하는 음식만 담고,
// (3) 이미지 지시문은 나올 음식만 긍정문으로 말한다.

// 홍어 상차림(홍어·삼합·수육·묵은지)을 가리키는 낱말. 홍어 이야기가 아닌 장에서는 이 낱말이 지시문에 나오면 안 된다.
export const SKATE_TABLE=/홍어|삼합|수육|묵은지|skate|boiled pork|pork belly|kimchi/i;

// 음식을 가리키는 낱말(메뉴 목록 + 곁들임). 공통 스타일에서 이런 낱말이 든 마디를 걷어 낸다.
// 메뉴 이름은 menuOf(메뉴 목록)가 맡고, 여기서는 메뉴 목록에 없는 곁들임과 영어 낱말을 본다.
const FOOD_WORD=/삼합|수육|묵은지|김치|skate|fish|pork|kimchi|pancake|soup|rice wine|hongeo|gwamegi|makgeolli/i;
const NEUTRAL_ANCHOR="따뜻하고 자연스러운 색온도, 흰 그릇, 짙은 나무 테이블";

// 전 장이 공유하는 스타일 기준(styleAnchor)에서 음식 이름이 든 마디를 걷어 낸다. 색·빛·그릇·테이블만 남긴다.
// 다 걷혀서 너무 짧아지면 무난한 기본 문장을 쓴다.
export function foodFreeAnchor(anchor:string):string {
  const clauses=anchor.split(/\s*[,，.;]\s*/).map(clause=>clause.trim()).filter(Boolean);
  const kept=clauses.filter(clause=>!menuOf(clause).length&&!FOOD_WORD.test(clause));
  const text=kept.join(", ");
  return text.length>=12?text:NEUTRAL_ANCHOR;
}

// 이 장(또는 주제)이 홍어 상차림을 실제로 말하는지. 장면 설명(visualPrompt)이 아니라 사장님이 읽는 글(제목·요점)로 판단한다.
// 장면 설명은 AI가 덧붙인 것이라, 글에 없는 홍어·삼합이 거기서만 나오면 믿지 않는다.
export const copyMentionsSkate=(copy:string)=>/홍어|삼합|수육|묵은지/.test(copy.replace(/묵동\s*홍어\s*마을/g,""));

// 홍어 요리가 아닌 메뉴가 주인공인지.
export const isOtherMenu=(menu:StoreMenuItem|undefined):menu is StoreMenuItem=>Boolean(menu)&&!menu!.id.startsWith("hongeo-");
