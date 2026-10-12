// GA4 유입 경로(source / medium)를 사장님이 알아보는 이름으로 바꾸고 같은 곳끼리 묶는다.
// 원래 이름은 '자세히'에서 함께 보여 주므로, 모르는 경로는 그 밖의 사이트로 두고 주소만 남긴다.
type Rule={test:(source:string,medium:string)=>boolean;group:string;label:string};
const host=(source:string,...names:string[])=>names.some(name=>source===name||source.endsWith(`.${name}`));

const RULES:Rule[]=[
  {test:(s,m)=>s==="(direct)"&&m==="(none)",group:"직접 방문",label:"주소 입력·즐겨찾기·카톡 등 앱 안 링크"},
  {test:(s,m)=>s==="naver"&&m==="place",group:"네이버 플레이스·지도",label:"네이버 플레이스의 홈페이지 링크"},
  {test:s=>host(s,"place.naver.com","map.naver.com"),group:"네이버 플레이스·지도",label:"네이버 플레이스·지도 화면"},
  {test:s=>host(s,"blog.naver.com","naverblogwidget.com"),group:"네이버 블로그",label:"네이버 블로그 글·위젯"},
  {test:(s,m)=>s==="naver"&&m==="organic",group:"네이버 검색",label:"네이버 검색"},
  {test:s=>host(s,"search.naver.com")&&s.startsWith("m."),group:"네이버 검색",label:"네이버 모바일 검색 결과"},
  {test:s=>host(s,"search.naver.com"),group:"네이버 검색",label:"네이버 검색 결과"},
  {test:s=>s==="naver"||host(s,"naver.com"),group:"네이버 (그 밖)",label:"네이버"},
  {test:s=>s==="ig"||s==="instagram"||host(s,"instagram.com"),group:"인스타그램",label:"인스타그램"},
  {test:s=>s==="fb"||s==="facebook"||host(s,"facebook.com"),group:"페이스북",label:"페이스북"},
  {test:(s,m)=>s==="google"&&m==="organic",group:"구글 검색",label:"구글 검색"},
  {test:s=>s==="google"||host(s,"google.com","google.co.kr"),group:"구글 (그 밖)",label:"구글"},
  {test:(s,m)=>s==="daum"&&m==="organic",group:"다음 검색",label:"다음 검색"},
  {test:s=>host(s,"daum.net","kakao.com")||s==="kakao"||s==="kakaotalk",group:"다음·카카오",label:"다음·카카오"},
];

export function describeSource(sourceMedium:string){
  const [source="",medium=""]=sourceMedium.split(" / ").map(part=>part.trim().toLowerCase());
  const rule=RULES.find(r=>r.test(source,medium));
  return rule?{group:rule.group,label:rule.label}:{group:"그 밖의 사이트",label:source||sourceMedium};
}

export type SourceGroup={group:string;sessions:number;percent:number;items:{label:string;sourceMedium:string;sessions:number}[]};

// 같은 묶음은 더하고 방문이 많은 순서로. 비율은 전체 방문 대비(소수 첫째 자리).
export function groupSources(list:{sourceMedium:string;sessions:number}[]):SourceGroup[]{
  const total=list.reduce((sum,item)=>sum+item.sessions,0)||1;
  const groups=new Map<string,SourceGroup>();
  for(const item of list){
    const {group,label}=describeSource(item.sourceMedium);
    const entry=groups.get(group)??{group,sessions:0,percent:0,items:[]};
    entry.sessions+=item.sessions;
    entry.items.push({label,sourceMedium:item.sourceMedium,sessions:item.sessions});
    groups.set(group,entry);
  }
  return [...groups.values()].map(g=>({...g,percent:Math.round(g.sessions/total*1000)/10,items:g.items.sort((a,b)=>b.sessions-a.sessions)})).sort((a,b)=>b.sessions-a.sessions);
}
