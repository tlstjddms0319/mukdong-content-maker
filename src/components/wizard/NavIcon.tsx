// 메뉴 아이콘(선 아이콘, 글자색을 따른다). 이름은 옆 글자가 맡으므로 화면 읽기에서는 숨긴다.
const PATHS:Record<string,string>={
  create:"M12 5v14M5 12h14",
  drafts:"M5 4h14v16H5zM9 8h6M9 12h6M9 16h3",
  performance:"M4 19h16M7 16V11M12 16V6M17 16v-3",
  settings:"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  more:"M5 12h.01M12 12h.01M19 12h.01",
  plan:"M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  library:"M5 4h4v16H5zM10 4h4v16h-4zM15 5l3.5-1 2.5 15.5-3.5 1z",
  images:"M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4M15 9h.01",
  help:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01",
};
export function NavIcon({name}:{name:string}){
  const d=PATHS[name];
  if(!d)return null;
  return <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={name==="more"?3.2:1.9} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
}
