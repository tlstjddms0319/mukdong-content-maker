// 사진 보관함 찾기·정렬(순수 함수). 사진 고르기 창과 보관함 관리 화면이 함께 쓴다.
// - 검색: 띄어쓰기로 나눈 낱말이 모두 이름이나 검색어(태그)에 들어 있는 사진(대소문자 무시).
// - 정렬: 최근 올린 순 / 자주 쓴 순(사용 횟수 → 최근 사용) / 안 쓴 사진 먼저(같은 사진만 반복하지 않게).

export type LibrarySort="recent"|"often"|"unused";
export const LIBRARY_SORT_LABELS:Record<LibrarySort,string>={recent:"최근 올린 순",often:"자주 쓴 순",unused:"안 쓴 사진 먼저"};
export type FilterableAsset={name:string;tags:string[];createdAt:string;lastUsedAt:string|null;useCount?:number};

const normalize=(text:string)=>text.toLowerCase().replace(/\s+/g,"");

export function filterLibrary<T extends FilterableAsset>(assets:T[],query:string,sort:LibrarySort="recent"):T[] {
  const words=query.split(/[\s,]+/).map(normalize).filter(Boolean);
  const matched=assets.filter(asset=>{const haystack=normalize([asset.name,...asset.tags].join(" "));return words.every(word=>haystack.includes(word));});
  const uses=(asset:T)=>asset.useCount??0;
  const byRecent=(a:T,b:T)=>b.createdAt.localeCompare(a.createdAt);
  return [...matched].sort(sort==="often"
    ?(a,b)=>uses(b)-uses(a)||(b.lastUsedAt??"").localeCompare(a.lastUsedAt??"")||byRecent(a,b)
    :sort==="unused"
      ?(a,b)=>uses(a)-uses(b)||(a.lastUsedAt??"").localeCompare(b.lastUsedAt??"")||byRecent(a,b)
      :byRecent);
}

// 자주 붙인 검색어(태그) 상위 n개. 검색 칸 아래 빠른 고르기 단추로 보여 준다.
export function popularTags(assets:FilterableAsset[],n=8):string[] {
  const counts=new Map<string,number>();
  for(const asset of assets)for(const tag of new Set(asset.tags))counts.set(tag,(counts.get(tag)??0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"ko")).slice(0,n).map(([tag])=>tag);
}

// 사용 기록 한 줄(예: "3번 사용 · 10/2 마지막", "아직 안 씀").
export function usageLabel(asset:Pick<FilterableAsset,"useCount"|"lastUsedAt">):string {
  if(!asset.useCount&&!asset.lastUsedAt)return "아직 안 씀";
  const last=asset.lastUsedAt?new Date(asset.lastUsedAt):null;
  return `${asset.useCount??1}번 사용${last?` · ${last.getMonth()+1}/${last.getDate()} 마지막`:""}`;
}
