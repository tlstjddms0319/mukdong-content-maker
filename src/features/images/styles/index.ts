import type { StyleId } from "../styleCatalog";
import type { CardRenderer } from "../render/primitives";
import { renderColorBlock } from "./colorBlock";
import { renderWebtoon } from "./webtoon";
import { renderOmakase } from "./omakase";
import { renderTypography } from "./typography";
import { renderKitsch } from "./kitsch";
import { renderDiary } from "./diary";
import { renderInfographic } from "./infographic";
import { renderPopup } from "./popup";
import { renderFilm } from "./film";
import { renderNeon } from "./neon";
import { renderHanji } from "./hanji";
import { renderChalkboard } from "./chalkboard";
import { renderDoodle } from "./doodle";

// 스타일 계열별 그리기 함수. "template"은 여기 없고 composeSlide의 레이아웃 그리기 함수를 쓴다.
// 각 함수는 받은 사진 수(0~3장)에 맞춰 표지·사진 장·글자 장을 알아서 그린다.
export const STYLE_RENDERERS:Record<Exclude<StyleId,"template">,CardRenderer>={
  colorblock:renderColorBlock,
  webtoon:renderWebtoon,
  omakase:renderOmakase,
  typography:renderTypography,
  kitsch:renderKitsch,
  diary:renderDiary,
  infographic:renderInfographic,
  popup:renderPopup,
  film:renderFilm,
  neon:renderNeon,
  hanji:renderHanji,
  chalkboard:renderChalkboard,
  doodle:renderDoodle,
};
