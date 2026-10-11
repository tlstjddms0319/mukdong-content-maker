import type { LibraryAssetMeta } from "./assetLibrary";
import type { ImageBrief } from "./schema";
import { showsRawSkate } from "./openaiRequest";
import { resolveImageStyle } from "./style";
import { isRawSkatePhoto } from "./skatePhoto";

// 홍어회 장면에 붙일 매장 사진 고르기.
// 글 설명만으로는 이미지 모델이 삭힌 홍어의 연보라빛 살과 비스듬한 연골 결을 그리지 못하고 참치·연어회처럼 그렸다
// (사장님 지적 2026-10-11). 사진 보관함에 사장님이 올린 홍어회 사진이 있으면 dish 참고 사진으로 붙여
// 음식의 색·썬 모양·담음새는 사진을 따르고, 장면·구도는 이번 장 글대로 새로 그리게 한다.
// 어떤 사진을 홍어회 사진으로 보는지는 skatePhoto.ts(화면의 홍어회 참고 사진 칸과 같은 기준).
// 같은 사진만 계속 붙으면 장마다 같은 접시가 나오므로, 좋은 사진 몇 장을 장 번호로 돌려 쓴다.
const ROTATION=3;

// 보관함을 읽기 전에 거른다(목록은 사진 데이터까지 읽어 무겁다).
// 사장님이 직접 고른 참고 사진(원본 보완·화풍 참고·사진 중심의 dish)이 있거나, 그림 화풍이거나, 홍어회 장면이 아니면 붙이지 않는다.
export function wantsSkateReference(input:ImageBrief):boolean {
  return !input.referenceImage&&resolveImageStyle(input)==="photo"&&showsRawSkate(input);
}

// 미리보기 없는 정보 목록(assetLibrary.listMeta)으로 고른다. 고른 사진의 미리보기는 부르는 쪽이 read(id)로 한 장만 읽는다.
export function pickSkateReference<T extends LibraryAssetMeta>(assets:readonly T[],input:ImageBrief):T|undefined {
  if(!wantsSkateReference(input))return undefined;
  const ranked=assets.filter(isRawSkatePhoto).sort((a,b)=>
    (a.quality?.flags.length??0)-(b.quality?.flags.length??0)
    ||b.useCount-a.useCount
    ||b.createdAt.localeCompare(a.createdAt));
  if(!ranked.length)return undefined;
  // 어둡거나 흔들린 사진은 깨끗한 사진이 하나도 없을 때만 쓴다.
  const clean=ranked.filter(asset=>!asset.quality?.flags.length);
  const pool=(clean.length?clean:ranked).slice(0,ROTATION);
  const turn=(input.slideIndex??1)-1+(input.candidateOffset??0);
  return pool[turn%pool.length];
}
