import type { StyleId } from "../styleCatalog";
import type { CardRenderer } from "../render/primitives";
import { renderColorBlock } from "./colorBlock";
import { renderNewspaper } from "./newspaper";
import { renderWebtoon } from "./webtoon";
import { renderY2k } from "./y2k";
import { renderOmakase } from "./omakase";
import { renderTypography } from "./typography";

// 스타일 계열별 그리기 함수. "template"은 여기 없고 composeSlide의 레이아웃 그리기 함수를 쓴다.
// 각 함수는 받은 사진 수(0~3장)에 맞춰 표지·사진 장·글자 장을 알아서 그린다.
export const STYLE_RENDERERS:Record<Exclude<StyleId,"template">,CardRenderer>={
  colorblock:renderColorBlock,
  newspaper:renderNewspaper,
  webtoon:renderWebtoon,
  y2k:renderY2k,
  omakase:renderOmakase,
  typography:renderTypography,
};
