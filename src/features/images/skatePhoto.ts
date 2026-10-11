import type { LibraryAsset } from "./freeCards";
import { TOPIC_TAG } from "./photoAnalysis";

// 사진 보관함의 사진이 AI 홍어회 장면의 참고 사진으로 쓸 수 있는 매장 홍어회 사진인지.
// 화면(홍어회 참고 사진 칸)과 서버(skateReference.ts)가 함께 쓰므로 서버 전용 모듈을 넣지 않는다.
// 사장님이 이름·검색어로 "홍어회"라고 적은 실제 촬영 사진만 쓴다(사진 내용을 분석하지 않는다).
const SKATE=/홍어|삼합/;
const NOT_RAW=/무침|애\s*탕|탕|찜|전(?!문)|캐릭터|마스코트|스티커/;

// 홍어회 참고 사진 칸에서 올린 사진에 붙는 이름·검색어.
export const SKATE_REFERENCE_NAME="홍어회";
export const SKATE_REFERENCE_TAGS=["홍어회","AI 참고"] as const;

// 미리보기 없는 정보 목록(assetLibrary.listMeta)과 화면의 사진 목록 모두 받는다.
export function isRawSkatePhoto(asset:Pick<LibraryAsset,"kind"|"name"|"tags">):boolean {
  if(asset.kind!=="photo")return false;
  // 만들기 화면이 올릴 때 붙이는 "주제:…" 검색어는 그때 쓰던 글이지 사진 속 음식이 아니라서 보지 않는다.
  const text=[asset.name,...asset.tags.filter(tag=>!tag.startsWith(TOPIC_TAG))].join(" ");
  return SKATE.test(text)&&!NOT_RAW.test(text);
}
