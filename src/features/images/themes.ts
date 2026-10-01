import { z } from "zod";

// 게시물 테마. 한 게시물(캐러셀)의 모든 장이 같은 테마를 쓰고, 게시물마다 테마가 바뀌어 피드에서 서로 다르게 보인다.
// 테마는 레이아웃(카드 배치)을 바꾸지 않고 "옷"만 바꾼다: 바탕 무늬, 장식(테이프·반짝이·밑줄·점 무늬·덩어리),
// 사진 모서리와 테두리, 종이 질감. 실제 그리기 규칙은 composeSlide.ts의 THEME_KITS에 있다.
// 이 파일은 화면 코드도 불러오므로 그리기 코드(sharp 등)를 넣지 않는다.
export const ThemeIdSchema=z.enum(["classic","magazine","notebook","poster","minimal","retro"]);
export type ThemeId=z.infer<typeof ThemeIdSchema>;

export const THEMES:Record<ThemeId,{label:string;when:string}>={
  classic:{label:"스크랩북",when:"기본. 마스킹 테이프·반짝이·물결 밑줄이 있는 따뜻한 스크랩북"},
  magazine:{label:"잡지",when:"정갈한 소개, 메뉴 이야기, 숙성·전통처럼 차분하게 설명하는 글. 장식 없이 가는 선과 넓은 여백"},
  notebook:{label:"손글씨 노트",when:"사장님의 팁, 처음 먹는 사람을 위한 안내, 친근한 말투. 줄 노트 바탕과 테이프"},
  poster:{label:"포스터",when:"신메뉴·이벤트·한정 알림처럼 한눈에 띄어야 하는 글. 굵은 테두리와 망점 무늬"},
  minimal:{label:"미니멀",when:"사진이 주인공인 감성 글, 짧은 한 문장. 장식을 거의 쓰지 않음"},
  retro:{label:"레트로 메뉴판",when:"오래된 가게, 단골 이야기, 옛 맛. 두 줄 테두리와 다이아몬드 장식"},
};

export function themeCatalogText():string {
  const themes=ThemeIdSchema.options.map(id=>`${id}(${THEMES[id].label}: ${THEMES[id].when})`).join(", ");
  return `design.theme은 게시물 전체의 분위기에 맞게 다음 중 하나: ${themes}. 지난 게시물과 겹치지 않게 주제마다 다른 테마를 고르세요.`;
}

export const THEME_OPTIONS=ThemeIdSchema.options.map(id=>[id,THEMES[id].label,THEMES[id].when] as const);
