import { z } from "zod";

// 스타일 계열. 게시물 전체의 디자인 방향을 통째로 정한다. "template"은 레이아웃(18종)+게시물 테마로 그리는 기본 방식이고,
// 나머지는 계열마다 색·사진 처리·글꼴·장식을 모두 따로 가진 디자인이다(그리기 코드는 styles/*.ts).
// 이 파일은 화면 코드도 불러오므로 그리기 코드(sharp 등)를 넣지 않는다.
export const StyleIdSchema=z.enum(["template","colorblock","newspaper","webtoon","y2k","omakase","typography"]);
export type StyleId=z.infer<typeof StyleIdSchema>;

export const STYLES:Record<StyleId,{label:string;when:string;photoHint:string}>={
  template:{label:"기본 템플릿",when:"레이아웃과 게시물 테마를 장마다 섞는 기본 카드뉴스",photoHint:""},
  colorblock:{label:"컬러 블록",when:"신메뉴·이벤트·한눈에 띄어야 하는 알림. 진한 단색 바탕, 누끼 음식 스티커, 화면을 채우는 굵은 글자",
    photoHint:"Isolate the dish on a plain, evenly lit light-gray seamless background with no props and no table texture, so the dish can be cut out cleanly."},
  newspaper:{label:"신문·기사",when:"숙성 이야기, 사장님 인터뷰, 정보를 차분히 전하는 글. 묵동일보 제호, 흑백 보도사진, 두 단 본문",
    photoHint:"Documentary press-photo style with strong contrast and clear shapes that still read well in black and white."},
  webtoon:{label:"웹툰·만화",when:"처음 먹는 사람의 반응, 재미있는 에피소드, 친근한 이야기. 만화 칸, 집중선, 마스코트 리액션과 말풍선",
    photoHint:"Bright, punchy close-up with a simple background, like a single comic panel."},
  y2k:{label:"Y2K 픽셀",when:"MZ·Z세대를 겨냥한 힙한 경고·중독 콘셉트. 윈도우95 경고창, 도트 글꼴, 마젠타·네온",
    photoHint:"Bold, saturated, slightly flash-lit snapshot with a centered subject; it will be pixelated."},
  omakase:{label:"오마카세 미니멀",when:"숙성·산지·깊은 맛을 고급스럽게 전하는 글. 넓은 여백, 작은 사진, 가는 명조",
    photoHint:"Fine-dining plating on a plain plate, soft side light, lots of empty space around the dish, refined and quiet."},
  typography:{label:"타이포그래피",when:"식감·맛을 강한 한 단어로 외치는 글. 흐린 흑백 사진 위 거대한 글자",
    photoHint:"Moody close-up texture of the dish; it will be blurred and turned black-and-white behind large text."},
};

export function styleCatalogText():string {
  const styles=StyleIdSchema.options.map(id=>`${id}(${STYLES[id].label}: ${STYLES[id].when})`).join(", ");
  return `design.style은 게시물 전체의 디자인 방향으로 다음 중 하나: ${styles}. 지난 게시물과 다른 느낌이 나도록 주제에 맞는 계열을 고르세요. template이 아니면 각 slide의 layout은 사진 장 수(0~3장)만 정하는 데 쓰입니다.`;
}

export const STYLE_OPTIONS=StyleIdSchema.options.map(id=>[id,STYLES[id].label,STYLES[id].when] as const);
