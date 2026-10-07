// 묵동홍어마을 메뉴 목록. 주제 추천·구성안·이미지 지시문·표지 점검이 모두 이 한 곳을 본다.
// 출처: 사장님이 알려 준 메뉴(2026-10-07). 네이버 플레이스 메뉴 페이지는 확인하지 못했다.
// 가격·구성·원산지는 확인 전이라 적지 않는다. 사진·그림 묘사(look)는 겉모습만 쓰고 재료·맛을 단정하지 않는다.
//
// 메뉴를 더하려면: 아래 STORE_MENU 목록에 한 줄을 복사해 id·이름·분류·찾을 낱말·겉모습·어울리는 계절만 바꿔 넣으면 된다.

export type MenuCategory="홍어 요리"|"제철 회"|"전"|"술";
export type MenuSeason="봄"|"여름"|"가을"|"겨울";

export type StoreMenuItem={
  id:string;
  name:string;                 // 화면·프롬프트에 쓰는 이름
  short:string;                // 문장 속에 넣는 짧은 이름(예: "홍어회", "막걸리")
  category:MenuCategory;
  // 글에서 이 메뉴를 알아보는 낱말. 위에서부터 먼저 맞는 메뉴를 고르지 않고, 글 속에서 먼저 나온 메뉴를 앞에 둔다.
  match:RegExp;
  // 사진·그림용 짧은 영어 겉모습 묘사(이미지 모델용). 맛·재료·원산지를 단정하지 않는다.
  look:string;
  // 한국어 한 줄 겉모습(구성안 장면·표지 점검용).
  lookKo:string;
  // 어울리는 계절(일반 상식 수준). 빈 배열이면 사계절.
  seasons:readonly MenuSeason[];
  // 계절 말고 어울리는 때(주제 추천 참고용, 짧게).
  moments:string;
};

export const STORE_MENU:readonly StoreMenuItem[]=[
  {
    id:"hongeo-hoe",name:"홍어회(삼합 포함)",short:"홍어회",category:"홍어 요리",
    // "홍어" 하나만 써도 홍어회로 본다. 홍어무침·홍어애탕·홍어전·홍어찜과 가게 이름(묵동홍어마을)은 빼고 본다.
    match:/홍어\s*회|삼합|홍어(?!\s*(?:무침|애|탕|전(?!문|통|체|날)|찜|마을))/,
    look:"Korean hongeo-hoe: thin, irregular slices of fermented skate wing meat, pale pink to ivory, with fine parallel cartilage lines.",
    lookKo:"얇고 불규칙하게 썬 연분홍·아이보리빛 홍어 날개 살 회",
    seasons:[],moments:"모임·잔칫상·김장철 수육과 함께",
  },
  {
    id:"hongeo-muchim",name:"홍어무침",short:"홍어무침",category:"홍어 요리",
    match:/홍어\s*무침|무침/,
    look:"Korean hongeo-muchim: bite-sized pieces of skate coated in a glossy red chili dressing, piled in a shallow bowl.",
    lookKo:"한입 크기 홍어 조각을 윤기 도는 붉은 양념에 무쳐 얕은 그릇에 담은 모습",
    seasons:["봄","여름"],moments:"입맛 없을 때 새콤한 안주, 막걸리와 함께",
  },
  {
    id:"hongeo-aetang",name:"홍어애탕",short:"홍어애탕",category:"홍어 요리",
    match:/홍어\s*애\s*탕|애\s*탕|홍어\s*탕|애국/,
    look:"Korean hongeo-aetang: a hot, steaming soup in an earthenware pot or deep bowl, cloudy reddish-brown broth with soft pieces and green leafy greens.",
    lookKo:"뚝배기나 깊은 그릇에 김이 오르는 탁한 붉은 갈색 국물과 푸른 잎채소가 보이는 탕",
    seasons:["가을","겨울"],moments:"찬바람 불 때, 따뜻한 국물이 당길 때",
  },
  {
    id:"gwamegi",name:"과메기",short:"과메기",category:"제철 회",
    match:/과메기/,
    look:"Korean gwamegi: half-dried fish fillets cut into long glossy strips, dark reddish-brown flesh with a thin silvery-blue skin edge, laid neatly on a plate.",
    lookKo:"반건조한 생선 살을 길게 썰어 접시에 가지런히 놓은 윤기 도는 검붉은 과메기",
    seasons:["겨울"],moments:"찬바람 부는 겨울 제철, 연말·신년 모임",
  },
  {
    id:"minari-jeon",name:"미나리전",short:"미나리전",category:"전",
    match:/미나리/,
    look:"Korean minari-jeon: a thin, flat pan-fried pancake with long green water-parsley stems visible through a golden batter with crisp edges.",
    lookKo:"노릇한 반죽 사이로 길쭉한 초록 미나리 줄기가 비치는 얇고 바삭한 전",
    seasons:["봄","여름"],moments:"비 오는 날, 봄 미나리철, 막걸리와 함께",
  },
  {
    id:"baedari-makgeolli",name:"배다리 막걸리",short:"막걸리",category:"술",
    match:/배다리|막걸리/,
    look:"Korean makgeolli: milky off-white rice wine in a ceramic or brass sabal bowl; any bottle appears without a readable label.",
    lookKo:"사발에 따른 뽀얀 우윳빛 막걸리(병이 보여도 글자 없이)",
    seasons:[],moments:"비 오는 날, 막걸리의 날(10월 마지막 목요일), 전·무침과 함께",
  },
];

export const MENU_BY_ID:Readonly<Record<string,StoreMenuItem>>=Object.fromEntries(STORE_MENU.map(item=>[item.id,item]));

// 홍어회·삼합이 아닌 메뉴인지(주제 추천에서 "다른 메뉴도 고르게"를 맞출 때 쓴다).
export const isHongeoHoe=(item:Pick<StoreMenuItem,"id">)=>item.id==="hongeo-hoe";

// 글에서 메뉴를 찾는다. 글에 먼저 나온 메뉴가 앞에 온다. 없으면 빈 배열.
export function menuOf(text:string|undefined):StoreMenuItem[] {
  if(!text)return [];
  return STORE_MENU.map(item=>({item,at:text.search(item.match)}))
    .filter(found=>found.at>=0)
    .sort((a,b)=>a.at-b.at)
    .map(found=>found.item);
}

// 여러 글 가운데 앞의 글부터 보고 처음 찾은 메뉴(예: 장 제목 → 주제 순). 없으면 undefined.
export function mainMenuOf(...texts:Array<string|undefined>):StoreMenuItem|undefined {
  for(const text of texts){const found=menuOf(text)[0];if(found)return found;}
  return undefined;
}

// 한 장면의 주인공 메뉴. 장 글(제목·요점·장면)과 주제 글을 함께 본다.
// 1) 장 글이 주제의 메뉴를 말하면 주제 메뉴, 2) 장 글에 나온 첫 음식(술 제외), 3) 주제 메뉴, 4) 장 글의 술 순서.
// 예: 과메기 주제의 "막걸리 한 잔 곁들여요" 장 → 과메기, 막걸리 주제의 "미나리전 한 장" 장 → 미나리전. 못 찾으면 undefined.
export function heroMenu(slideText:string|undefined,topicText:string|undefined):StoreMenuItem|undefined {
  const inSlide=menuOf(slideText);
  const topic=menuOf(topicText)[0];
  if(topic&&inSlide.some(item=>item.id===topic.id))return topic;
  return inSlide.find(item=>item.category!=="술")??topic??inSlide[0];
}

// 받침에 맞춰 조사를 붙인다. 예: josa("과메기","이","가") → "과메기가", josa("미나리전","이","가") → "미나리전이".
export function josa(word:string,withFinal:string,withoutFinal:string):string {
  const code=word.charCodeAt(word.length-1)-0xac00;
  const hasFinal=code>=0&&code<=11171&&code%28!==0;
  return word+(hasFinal?withFinal:withoutFinal);
}

// 이 계절에 어울리는 메뉴(사계절 메뉴 포함).
export function menusInSeason(season:string|undefined):StoreMenuItem[] {
  return STORE_MENU.filter(item=>!item.seasons.length||!season||(item.seasons as readonly string[]).includes(season));
}

// 주제 추천 프롬프트에 넣는 메뉴 안내 한 줄씩.
export function menuPromptLines():string {
  return STORE_MENU.map(item=>`- ${item.name}(${item.category}, ${item.seasons.length?`${item.seasons.join("·")}에 특히 어울림`:"사계절"}; ${item.moments})`).join("\n");
}
