import { z } from "zod";

// 카드 글꼴은 "제목"과 "본문"을 따로 고른다. 제목 글꼴은 제목·큰 숫자·말풍선처럼 굵게 강조하는 글자에,
// 본문 글꼴은 요점 목록과 설명, 그리고 채널명·장 번호 같은 작은 보조 글(label)에 쓰인다.
// 모든 글꼴은 assets/fonts에 함께 들어 있는 SIL OFL 글꼴이라 상업적으로 써도 되고 서버에 따로 설치할 필요가 없다.
// 새 글꼴을 더하려면 파일을 assets/fonts에 넣고 아래 표에 한 줄을 추가한 뒤, 필요하면 font-family 이름을 fc-scan으로 확인한다.

// 이 파일은 화면(브라우저) 코드도 불러오므로 파일 경로 대신 assets/fonts 안의 파일 이름만 둔다. 경로는 composeSlide가 붙인다.
// family는 Pango 글꼴 설명 문자열이다. "패밀리 이름 + 굵기"로 쓰면 같은 패밀리의 그 굵기 파일을 고른다.
export type FontFace={fileName:string;family:string};
const font=(fileName:string,family:string):FontFace=>({fileName,family});

export const TitleFontIdSchema=z.enum(["pretendard","plex","batang","jua","blackhan"]);
export const BodyFontIdSchema=z.enum(["pretendard","plex","batang","dodum"]);
export type TitleFontId=z.infer<typeof TitleFontIdSchema>;
export type BodyFontId=z.infer<typeof BodyFontIdSchema>;
// 장마다 고르는 글꼴. "auto"는 캐러셀 공통 글꼴(design.titleFont/bodyFont)을 따른다는 뜻이다.
export const SlideTitleFontSchema=z.enum(["auto",...TitleFontIdSchema.options]);
export const SlideBodyFontSchema=z.enum(["auto",...BodyFontIdSchema.options]);
export type SlideTitleFont=z.infer<typeof SlideTitleFontSchema>;
export type SlideBodyFont=z.infer<typeof SlideBodyFontSchema>;

// label·when은 화면 선택지와 구성안 AI의 추천 기준으로 함께 쓴다.
export const TITLE_FONTS:Record<TitleFontId,{label:string;when:string;title:FontFace}>={
  pretendard:{label:"프리텐다드",when:"기본. 깔끔하고 무난해 어떤 주제에도 어울림",title:font("Pretendard-Bold.otf","Pretendard Bold")},
  plex:{label:"IBM Plex",when:"정보·순서·비교처럼 또박또박 설명하는 글",title:font("IBMPlexSansKR-Bold.ttf","IBM Plex Sans KR Bold")},
  batang:{label:"고운바탕",when:"저녁 술자리, 숙성·전통 이야기, 감성적인 한 문장",title:font("GowunBatang-Bold.ttf","Gowun Batang Bold")},
  jua:{label:"주아",when:"친근한 동네 가게 말투, 처음 먹는 사람을 위한 쉬운 안내, 이벤트",title:font("Jua-Regular.ttf","Jua")},
  blackhan:{label:"검은고딕",when:"신메뉴·할인·오픈처럼 한눈에 확 띄어야 하는 알림",title:font("BlackHanSans-Regular.ttf","Black Han Sans")},
};

export const BODY_FONTS:Record<BodyFontId,{label:string;when:string;body:FontFace;labelFont:FontFace}>={
  pretendard:{label:"프리텐다드",when:"기본. 작은 글씨도 또렷함",body:font("Pretendard-Regular.otf","Pretendard"),labelFont:font("Pretendard-SemiBold.otf","Pretendard SemiBold")},
  plex:{label:"IBM Plex",when:"설명이 긴 정보형 글",body:font("IBMPlexSansKR-Regular.ttf","IBM Plex Sans KR"),labelFont:font("IBMPlexSansKR-SemiBold.ttf","IBM Plex Sans KR SemiBold")},
  batang:{label:"고운바탕",when:"감성 글, 고운바탕 제목과 짝",body:font("GowunBatang-Regular.ttf","Gowun Batang"),labelFont:font("GowunBatang-Bold.ttf","Gowun Batang Bold")},
  // 고운돋움은 굵기가 하나뿐이라 보조 글도 같은 파일을 쓴다.
  dodum:{label:"고운돋움",when:"부드럽고 친근한 글, 주아 제목과 짝",body:font("GowunDodum-Regular.ttf","Gowun Dodum"),labelFont:font("GowunDodum-Regular.ttf","Gowun Dodum")},
};

export type Typography={title:FontFace;label:FontFace;body:FontFace};
// 장 글꼴이 "auto"가 아니면 그것을, 아니면 캐러셀 공통 글꼴을 쓴다.
export const resolveSlideFonts=(design:{titleFont?:TitleFontId;bodyFont?:BodyFontId}|undefined,slide:{titleFont?:SlideTitleFont;bodyFont?:SlideBodyFont}):{titleFont:TitleFontId;bodyFont:BodyFontId}=>({
  titleFont:slide.titleFont&&slide.titleFont!=="auto"?slide.titleFont:design?.titleFont??"pretendard",
  bodyFont:slide.bodyFont&&slide.bodyFont!=="auto"?slide.bodyFont:design?.bodyFont??"pretendard",
});

export const typographyOf=(titleFont:TitleFontId="pretendard",bodyFont:BodyFontId="pretendard"):Typography=>({
  title:TITLE_FONTS[titleFont].title,
  label:BODY_FONTS[bodyFont].labelFont,
  body:BODY_FONTS[bodyFont].body,
});

// 구성안 프롬프트에 넣는 글꼴 추천 기준.
export function fontCatalogText():string {
  const titles=TitleFontIdSchema.options.map(id=>`${id}(${TITLE_FONTS[id].label}: ${TITLE_FONTS[id].when})`).join(", ");
  const bodies=BodyFontIdSchema.options.map(id=>`${id}(${BODY_FONTS[id].label}: ${BODY_FONTS[id].when})`).join(", ");
  return `design.titleFont는 글의 분위기에 맞게 다음 중 하나: ${titles}. design.bodyFont는 다음 중 하나: ${bodies}. 제목과 본문은 서로 어울리게 고르세요(예: batang+batang, jua+dodum, blackhan+plex, plex+plex). 확신이 없으면 pretendard+pretendard. 각 slide의 titleFont·bodyFont는 그 장의 내용에 어울리는 글꼴이거나 "auto"(design 글꼴을 그대로 씀)입니다. 표지·분위기·인용 장처럼 감정을 건드리는 장은 감성 글꼴(batang 등), 먹는 법·순서·확인할 점처럼 정보 장은 또박또박한 글꼴(plex, pretendard)이 어울립니다. 한 캐러셀의 제목 글꼴은 2~3종 안에서 고르고, 본문 글꼴은 대부분 "auto"로 두어 읽기 흐름을 맞추세요.`;
}

// 화면의 글꼴 선택지. [id, 이름, 언제 어울리는지]
export const TITLE_FONT_OPTIONS=TitleFontIdSchema.options.map(id=>[id,TITLE_FONTS[id].label,TITLE_FONTS[id].when] as const);
export const BODY_FONT_OPTIONS=BodyFontIdSchema.options.map(id=>[id,BODY_FONTS[id].label,BODY_FONTS[id].when] as const);
