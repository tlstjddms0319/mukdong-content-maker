import { rolesForCount } from "./carousel";

// 표지 예고 띠 글("먹는 법 · 곁들임 · 방문 전 확인"). 서버(카드 그리기)와 화면(장을 넣고 뺄 때 표지를 다시 그려야 하는지 판단)이 같이 쓴다.
// 전체 장 수("— 5장")는 쓰지 않는다. 카드에 전체 장 수가 찍히면 장 하나를 넣고 뺄 때마다 모든 카드를 다시 그려야 해서 뺐다.
// 구성안 장 수(3/5/7/10)면 역할 순서표에서 뒤 장 이름을 최대 3개, 장을 고친 캐러셀(그 밖의 장 수)이면 "넘겨 보세요".
// storeCard: 맨 뒤 홍보 카드가 붙으면 total에 그 한 장이 들어 있으므로, 내용 장 수는 한 장을 뺀 수로 본다.
const ROLE_LABELS:Record<string,string>={overview:"한 상 미리보기",detail:"가까이 보기","how-to":"먹는 법",pairing:"곁들임",process:"준비 과정",occasion:"함께 먹기",mood:"분위기",visit:"방문 전 확인",cta:"마무리"};
// 보는 사람이 가장 궁금해하는 순서(먹는 법 → 곁들임 → 방문 전 확인 → 나머지)로 3개를 고르고, 띠에는 장 순서대로 적는다.
const PRIORITY=["how-to","pairing","visit","detail","overview","occasion","process","mood","cta"];

export function teaserText(total:number,storeCard=false):string {
  const content=storeCard?total-1:total;
  if(content!==3&&content!==5&&content!==7&&content!==10)return content>1?"넘겨 보세요":"";
  const roles=rolesForCount(content).slice(1);
  const picked=new Set([...roles].sort((a,b)=>PRIORITY.indexOf(a)-PRIORITY.indexOf(b)).slice(0,3));
  return roles.filter(role=>picked.has(role)).map(role=>ROLE_LABELS[role]).filter(Boolean).join(" · ");
}
