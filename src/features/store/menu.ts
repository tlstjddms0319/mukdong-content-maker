// 묵동홍어마을 메뉴 목록. 주제 추천·구성안·이미지 지시문·표지 점검이 모두 이 한 곳을 본다.
// 출처: 사장님이 알려 준 메뉴(2026-10-07, 홍어찜은 가게 홍보 포스터 메뉴판에서 확인)와 사장님이 보내 준 네이버 플레이스
// 메뉴 페이지(2026-10-09 업데이트: 홍어사시미·홍어전·홍어라면·묵은지김치전·해물라면·지평 막걸리를 더함). 과메기는 네이버 목록에
// 없지만 사장님이 알려 준 겨울 제철 메뉴라 둔다. 소주·맥주는 이 가게만의 이야깃거리가 아니라 주제 메뉴에 넣지 않는다.
// 가격은 바뀔 수 있어 글·그림에 쓰지 않는다. 사진·그림 묘사(look)는 겉모습만 쓰고 재료·맛을 단정하지 않는다.
//
// 메뉴를 더하려면: 아래 STORE_MENU 목록에 한 줄을 복사해 id·이름·분류·찾을 낱말·겉모습·어울리는 계절만 바꿔 넣으면 된다.

export type MenuCategory="홍어 요리"|"제철 회"|"전"|"식사"|"술";
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
  // 5칸 구조 지시문(images/promptSlots.ts)용 영어 낱말 은행(2026-10-20 계획서). 담음새·식기·곁들임(plating)과 질감(texture)만, 맛·재료 단정 없이.
  plating:string;
  texture:string;
  // 어울리는 계절(일반 상식 수준). 빈 배열이면 사계절.
  seasons:readonly MenuSeason[];
  // 제철 달(있으면 계절보다 먼저 본다). 과메기처럼 제철이 계절 경계에 걸친 메뉴용: 계절만 보면 11월(가을)에 과메기가 빠졌다.
  // 제철 바로 전달에는 "곧 제철" 메뉴로 따로 알려 준다(예고 주제용).
  months?:readonly number[];
  // 계절 말고 어울리는 때(주제 추천 참고용, 짧게).
  moments:string;
};

export const STORE_MENU:readonly StoreMenuItem[]=[
  {
    id:"hongeo-hoe",name:"홍어회(홍어사시미·삼합)",short:"홍어회",category:"홍어 요리",
    // "홍어" 하나만 써도 홍어회로 본다(이 가게 메뉴판의 "홍어사시미"도 홍어회). 홍어무침·홍어애탕·홍어전·홍어찜·홍어라면과
    // 가게 이름(묵동홍어마을)은 빼고 본다. "홍어 애호가"처럼 애탕·애국이 아닌 "애"는 홍어회로 본다.
    match:/홍어\s*(?:회|사시미)|삼합|홍어(?!\s*(?:무침|애\s*(?:탕|국)|탕|전(?!문|통|체|날)|찜|라면|마을))/,
    look:"Korean hongeo-hoe: thin hand-cut slices of fermented skate wing about 4 x 7 cm and 5-8 mm thick, slightly uneven shapes (not identical rectangles), overlapping in loose rows on a black rectangular board. Each slice has two clearly separate parts with a sharp boundary: a smooth, glossy, translucent dusty-purple-pink flesh with no wrinkles, fibers or fine lines at all, and along one long edge a distinct band of pale ivory cartilage: a narrow, flat, slightly translucent whitish strip with fine, closely spaced hairline ridges that lie flush with the surface and never protrude (not thick teeth, not a gear).",
    lookKo:"검은 직사각 판에 줄 맞춰 놓은 납작한 홍어회 조각(살은 매끈한 보랏빛 분홍, 한쪽 긴 변에만 가늘고 납작한 흰 연골 띠가 따로 붙고 둘의 경계가 또렷함. 연골은 튀어나온 톱니가 아님)",
    plating:"set in loose rows on a black slate board or dark onggi plate; a small dish of chogochujang (red vinegar-chili dip) and coarse salt beside it; when the scene says samhap, a slice of boiled pork belly (suyuk) and a leaf of deep-red aged kimchi (mugeunji) sit next to the skate, never on top of it",
    texture:"smooth, glossy, translucent dusty-purple-pink flesh with no wrinkles, fibers or fine lines; the cartilage is a separate narrow flat band of pale ivory along one long edge with fine flush hairline ridges and a sharp boundary to the flesh, never thick protruding teeth; a faint moist sheen; never glossy orange like salmon, never chalk-white, never wrinkly or fibrous all over",
    seasons:[],moments:"모임·잔칫상·김장철 수육과 함께",
  },
  {
    id:"hongeo-muchim",name:"홍어무침",short:"홍어무침",category:"홍어 요리",
    // "미나리 무침"처럼 다른 무침과 헷갈리지 않게 "홍어"가 붙은 것만 본다.
    match:/홍어\s*무침/,
    look:"Korean hongeo-muchim: bite-sized pieces of skate coated in a glossy red chili dressing, piled in a shallow bowl.",
    lookKo:"한입 크기 홍어 조각을 윤기 도는 붉은 양념에 무쳐 얕은 그릇에 담은 모습",
    plating:"piled loosely in a shallow dark ceramic bowl; thin slices of Korean pear and cucumber and a few sesame seeds show between the pieces only if the scene mentions them",
    texture:"glossy red chili dressing clinging to opaque, slightly translucent skate pieces; wet sheen on the dressing, matte pieces underneath",
    seasons:["봄","여름"],moments:"입맛 없을 때 새콤한 안주, 막걸리와 함께",
  },
  {
    id:"hongeo-aetang",name:"홍어애탕",short:"홍어애탕",category:"홍어 요리",
    // 애탕은 이 가게에서 홍어애탕뿐이라 단독으로도 본다. "애국"은 "애국가" 같은 말과 헷갈려 "홍어"가 붙은 것만.
    match:/홍어\s*애\s*(?:탕|국)|애\s*탕|홍어\s*탕/,
    look:"Korean hongeo-aetang: a hot, steaming soup in an earthenware pot or deep bowl, cloudy reddish-brown broth with soft pieces and green leafy greens.",
    lookKo:"뚝배기나 깊은 그릇에 김이 오르는 탁한 붉은 갈색 국물과 푸른 잎채소가 보이는 탕",
    plating:"served bubbling in a black ttukbaegi earthenware pot on a wooden trivet, a brass spoon resting beside it",
    texture:"cloudy reddish-brown broth with soft white steam rising, tender ivory pieces and green leafy greens half submerged; natural, not neon, red",
    seasons:["가을","겨울"],moments:"찬바람 불 때, 따뜻한 국물이 당길 때",
  },
  {
    id:"hongeo-jjim",name:"홍어찜",short:"홍어찜",category:"홍어 요리",
    match:/홍어\s*찜/,
    look:"Korean hongeo-jjim: steamed pieces of skate wing on a plate, the cooked flesh opaque ivory-white with visible parallel fibers, glistening with moisture.",
    lookKo:"쪄서 익힌 홍어 날개 살 조각을 접시에 담은 모습(살이 불투명한 아이보리빛, 결이 보임)",
    plating:"steamed pieces on a wide white or dark plate, a scattering of chopped scallion and red chili threads on top, a small dish of seasoned soy beside it",
    texture:"opaque ivory cooked flesh with only a subtle natural fiber texture and a moist glistening surface, like ordinary appetizing steamed fish; soft steam",
    seasons:[],moments:"잔치·모임 상, 따뜻한 요리가 당길 때",
  },
  {
    id:"hongeo-jeon",name:"홍어전",short:"홍어전",category:"홍어 요리",
    // "홍어 전문점"·"홍어 전통"처럼 전이 아닌 말은 빼고 본다.
    match:/홍어\s*전(?!문|통|체|날)/,
    look:"Korean hongeo-jeon: pieces of skate coated in a thin egg batter and pan-fried until golden, with browned edges, laid overlapping on a plate.",
    lookKo:"홍어 살에 얇은 달걀 옷을 입혀 노릇하게 부친 전을 접시에 겹쳐 담은 모습",
    plating:"golden pan-fried pieces laid overlapping on a round plate, a small dish of soy-vinegar dip at the side",
    texture:"thin egg batter browned at the edges, soft pale flesh inside, light sheen of oil",
    seasons:[],moments:"비 오는 날, 막걸리 한 잔과 함께",
  },
  {
    id:"hongeo-ramyeon",name:"홍어라면",short:"홍어라면",category:"식사",
    match:/홍어\s*라면/,
    look:"Korean hongeo-ramyeon: a steaming bowl of ramen noodles in a red broth with a few pieces of skate.",
    lookKo:"김이 오르는 붉은 국물 라면에 홍어 조각이 들어간 한 그릇",
    plating:"a steaming bowl of ramyeon in a dented yangeun (aluminum) pot or deep bowl, chopsticks resting on the rim",
    texture:"springy noodles in a bright red broth, soft white steam, a few pieces of skate and scallion on top",
    seasons:[],moments:"술자리 마무리 한 그릇",
  },
  {
    id:"gwamegi",name:"과메기",short:"과메기",category:"제철 회",
    match:/과메기/,
    look:"Korean gwamegi: half-dried fish fillets cut into long glossy strips, dark reddish-brown flesh with a thin silvery-blue skin edge, laid neatly on a plate.",
    lookKo:"반건조한 생선 살을 길게 썰어 접시에 가지런히 놓은 윤기 도는 검붉은 과메기",
    plating:"glossy fillets arranged in a fan on a bamboo basket platter (sokuri) or dark stoneware, surrounded by fresh napa cabbage leaves, sheets of gim seaweed, wet green sea mustard, scallion, raw garlic slices and green chili; a small bowl of shiny red chogochujang",
    texture:"ultra-glistening oily surface on dark reddish-brown flesh with a thin silvery-blue skin edge, chewy semi-dried texture, crisp bright-green vegetables for contrast",
    seasons:["겨울"],months:[11,12,1,2],moments:"찬바람 부는 늦가을부터 겨울 제철(보통 11월부터), 연말·신년 모임",
  },
  {
    id:"minari-jeon",name:"미나리전",short:"미나리전",category:"전",
    match:/미나리/,
    look:"Korean minari-jeon: a thin, flat pan-fried pancake with long green water-parsley stems visible through a golden batter with crisp edges.",
    lookKo:"노릇한 반죽 사이로 길쭉한 초록 미나리 줄기가 비치는 얇고 바삭한 전",
    plating:"a thin round pancake on a flat ceramic or brass plate, cut into pieces, a small dish of soy-vinegar dip; a bowl of makgeolli often beside it",
    texture:"long green water-parsley stems visible through a thin golden batter, crisp lacy edges, light oil sheen",
    seasons:["봄","여름"],moments:"비 오는 날, 봄 미나리철, 막걸리와 함께",
  },
  {
    id:"kimchi-jeon",name:"묵은지김치전",short:"김치전",category:"전",
    // 홍어 상차림의 묵은지(삼합)와 다른 메뉴다. "묵은지"만 쓴 글은 김치전으로 보지 않는다(sceneFoods.ts withoutKimchiJeon).
    match:/(?:묵은지\s*)?김치\s*전|묵은지\s*전/,
    look:"Korean kimchi-jeon: a thin pan-fried pancake with chopped aged kimchi through an orange-red batter, crisp golden-brown edges.",
    lookKo:"잘게 썬 묵은지가 섞인 주황빛 반죽을 얇게 부쳐 가장자리가 노릇하고 바삭한 김치전",
    plating:"a thin round pancake on a dark plate, cut into wedges, a small dish of soy-vinegar dip",
    texture:"orange-red batter with chopped aged kimchi showing through, crisp golden-brown edges, slight oil sheen",
    seasons:[],moments:"비 오는 날, 막걸리와 함께",
  },
  {
    id:"haemul-ramyeon",name:"해물라면",short:"해물라면",category:"식사",
    match:/해물\s*라면/,
    look:"Korean haemul-ramyeon: a steaming bowl of ramen noodles in a spicy red broth with assorted seafood pieces on top.",
    lookKo:"김이 오르는 얼큰한 붉은 국물에 면과 해물이 담긴 라면 한 그릇",
    plating:"a steaming bowl in a dented yangeun pot or deep bowl, chopsticks on the rim",
    texture:"springy noodles in a spicy red broth, shrimp, mussels and squid pieces on top, soft white steam",
    seasons:[],moments:"술자리 마무리 한 그릇, 쌀쌀한 날",
  },
  {
    id:"baedari-makgeolli",name:"막걸리(배다리·지평)",short:"막걸리",category:"술",
    match:/배다리|지평\s*막걸리|막걸리/,
    look:"Korean makgeolli: milky off-white rice wine in a ceramic or brass sabal bowl; any bottle appears without a readable label.",
    lookKo:"사발에 따른 뽀얀 우윳빛 막걸리(병이 보여도 글자 없이)",
    plating:"milky rice wine poured from a dented yangeun kettle into a ceramic or brass sabal bowl; any bottle appears without a readable label",
    texture:"opaque milky off-white liquid with a thin ring of fine bubbles at the rim, condensation on the kettle",
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
// 메뉴 이름 없이 곁들임만 말하는 장은 그 곁들임이 딸린 메뉴가 주인공이다(사장님 지적 2026-10-21: 홍어 주제의 "쪽파의 매운맛이 뒷맛을 끊어요" 장이
// 홍어 위에 쪽파를 얹은 분홍 덩어리로 그려졌다. 쪽파·김·미역은 과메기 쌈 곁들임이다). "김"은 "김이 오른다"의 김과 겹쳐 조사까지 본다.
const SIDE_HERO:ReadonlyArray<{menu:string;match:RegExp}>=[{menu:"gwamegi",match:/쪽파|물?미역|김(?:에|을|과|이랑|\s*한\s*장|\s*싸)/}];
function sideHero(text:string|undefined):StoreMenuItem|undefined {
  if(!text)return undefined;
  const hit=SIDE_HERO.find(side=>side.match.test(text));
  return hit?STORE_MENU.find(item=>item.id===hit.menu):undefined;
}
export function heroMenu(slideText:string|undefined,topicText:string|undefined):StoreMenuItem|undefined {
  const inSlide=menuOf(slideText);
  const topic=menuOf(topicText)[0];
  if(topic&&inSlide.some(item=>item.id===topic.id))return topic;
  return inSlide.find(item=>item.category!=="술")??sideHero(slideText)??topic??inSlide[0];
}

// 받침에 맞춰 조사를 붙인다. 예: josa("과메기","이","가") → "과메기가", josa("미나리전","이","가") → "미나리전이".
export function josa(word:string,withFinal:string,withoutFinal:string):string {
  const code=word.charCodeAt(word.length-1)-0xac00;
  const hasFinal=code>=0&&code<=11171&&code%28!==0;
  return word+(hasFinal?withFinal:withoutFinal);
}

// 이 계절에 어울리는 메뉴(사계절 메뉴 포함). 제철 달이 있는 메뉴는 날짜를 아는 menusForDate를 쓴다.
export function menusInSeason(season:string|undefined):StoreMenuItem[] {
  return STORE_MENU.filter(item=>!item.seasons.length||!season||(item.seasons as readonly string[]).includes(season));
}

// 오늘(YYYY-MM-DD) 기준 제철 메뉴와 곧 제철인 메뉴. 제철 달(months)이 있으면 달로, 없으면 계절로 본다.
// upcoming: 다음 달부터 제철인 메뉴(예: 10월의 과메기). 날짜를 모르면 계절로만 보고 upcoming은 비운다.
export function menusForDate(today:string|undefined,season:string|undefined):{inSeason:StoreMenuItem[];upcoming:StoreMenuItem[]} {
  const month=today?Number(today.slice(5,7)):NaN;
  const known=Number.isInteger(month)&&month>=1&&month<=12;
  const inSeason=STORE_MENU.filter(item=>item.months&&known?item.months.includes(month):!item.seasons.length||!season||(item.seasons as readonly string[]).includes(season));
  const upcoming=known?STORE_MENU.filter(item=>item.months&&!item.months.includes(month)&&item.months.includes(month%12+1)):[];
  return {inSeason,upcoming};
}
const monthRange=(months:readonly number[])=>`${months[0]}~${months[months.length-1]}월`;

// 주제 추천 프롬프트에 넣는 메뉴 안내 한 줄씩.
export function menuPromptLines():string {
  return STORE_MENU.map(item=>`- ${item.name}(${item.category}, ${item.months?`${monthRange(item.months)} 제철`:item.seasons.length?`${item.seasons.join("·")}에 특히 어울림`:"사계절"}; ${item.moments})`).join("\n");
}
