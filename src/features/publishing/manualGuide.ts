import type { CopyInput } from "@/features/copy/schema";

export const NAVER_PLACE_URL = "https://naver.me/Ffex1C2k";

export type HashtagGroup = { label:string; tags:string[] };
export type ManualPostingGuide = {
  hashtagGroups:HashtagGroup[];
  hashtags:string[];
  music:{ mood:string; searchTerms:string[]; note:string };
  checklist:string[];
  placeUrl:string;
};

const INTEREST_TAGS:Record<CopyInput["audience"],string[]> = {
  A:["#발효음식", "#맛집탐방"],
  B:["#모임맛집", "#퇴근후한잔"],
  C:["#홍어입문", "#이색음식"],
};

function menuTags(topic:string):string[] {
  if(topic.includes("삼합"))return ["#홍어삼합", "#홍어맛집", "#해산물맛집"];
  if(topic.includes("막걸리"))return ["#홍어맛집", "#막걸리안주", "#해산물맛집"];
  return ["#홍어맛집", "#해산물맛집"];
}

function musicGuide(topic:string,audience:CopyInput["audience"]):ManualPostingGuide["music"] {
  const note="Instagram 음악 보관함에서 사용할 수 있는 곡을 직접 확인하세요. 비즈니스 계정은 표시되는 음원이 다를 수 있어요.";
  if(topic.includes("막걸리"))return { mood:"편안한 한국풍 어쿠스틱", searchTerms:["korean acoustic", "makgeolli mood", "folk groove"], note };
  if(audience==="B")return { mood:"밝은 레트로·펑크", searchTerms:["retro dinner", "upbeat funk", "friends night"], note };
  if(audience==="A")return { mood:"리듬감 있는 푸드·퍼커션", searchTerms:["food beat", "cooking groove", "minimal percussion"], note };
  return { mood:"부담 없는 로파이·어쿠스틱", searchTerms:["lofi food", "acoustic cafe", "warm dinner"], note };
}

export function buildManualPostingGuide(input:Pick<CopyInput,"topic"|"audience">):ManualPostingGuide {
  const hashtagGroups:HashtagGroup[]=[
    { label:"지역", tags:["#묵동맛집", "#중랑구맛집"] },
    { label:"메뉴", tags:menuTags(input.topic) },
    { label:"관심사", tags:INTEREST_TAGS[input.audience] },
    { label:"매장", tags:["#묵동홍어마을"] },
  ];
  return {
    hashtagGroups,
    hashtags:[...new Set(hashtagGroups.flatMap(group=>group.tags))],
    music:musicGuide(input.topic,input.audience),
    checklist:[
      "사진 순서와 잘린 곳이 없는지 봐요.",
      "가격·영업시간·메뉴 이름을 다시 확인해요.",
      "추천 # 태그 중 게시물과 맞는 것만 골라요.",
      "인스타그램 음악에서 어울리는 곡을 골라 들어 봐요.",
      "인스타그램 앱에서 직접 올려요.",
    ],
    placeUrl:NAVER_PLACE_URL,
  };
}

export function formatManualPostingGuide(guide:ManualPostingGuide):string {
  return [
    "묵동홍어마을 수동 게시 가이드",
    "",
    `네이버 플레이스: ${guide.placeUrl}`,
    "",
    "추천 # 태그",
    guide.hashtags.join(" "),
    "",
    `음악 방향: ${guide.music.mood}`,
    `Instagram 음악 검색어: ${guide.music.searchTerms.join(", ")}`,
    guide.music.note,
    "",
    "직접 게시 순서",
    ...guide.checklist.map((item,index)=>`${index+1}. ${item}`),
  ].join("\n");
}
