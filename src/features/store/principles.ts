import { STORE_MENU, menuOf } from "./menu";

// 원리 노트: 메뉴마다 "왜"에 답할 수 있는 원리를 미리 정리해 둔다.
// 결과물 점검 5회(2026-10-12) 내내 이유 깊이가 2.8/5에 머물렀다. 원인 이름은 들어가도 AI(Gemini flash-lite)가 원리를 지어냈다
// (예: "기온이 낮아지면 애가 걸쭉해져요" — 끓이는 탕이라 바깥 기온과 상관없다). 주제·구성안·검수·올릴 글에 이 노트를 주고,
// 이유는 되도록 여기서 고르게 한다. 주제 추천도 이 노트로 "답이 있는 질문"을 고르게 한다.
//
// 쓰는 기준: 널리 알려진 과학·조리·식문화 설명만 쓴다. 단정하기 어려운 것은 sure:false로 두고 글에서는 "~로 알려져 있어요"로 쓰게 한다.
// 이 가게만의 사실(숙성 기간·원산지·손질법)과 상표별 제조 정보(배다리·지평의 원료 배합)는 넣지 않는다(가게 이야기 메모가 맡는다).
// 건강 효능은 쓰지 않는다.
//
// 노트를 더하려면: 아래 목록에 한 줄을 넣고 menus(메뉴 id, 비우면 공통), when(공통 노트가 붙을 주제 낱말), hint(주제 추천용 짧은 실마리), fact(원리)를 채운다.
// myth: 독자가 흔히 믿는 오해(표지 "오해 깨기" 재료, copyPolish.ts). 결과물 점검 7회에서 후킹 점수가 가장 높은 표지가
// "홍어회는 썩은 게 아니라 삭히는 거라고?"처럼 흔한 오해를 뒤집는 표지였다.
// mythWhen: 이 오해를 표지 재료로 꺼낼 주제·본문 낱말. 메뉴만 맞는다고 꺼내면 엉뚱한 표지가 된다(사장님 제보 2026-10-20: "과메기는 왜 김과 미역에 싸서 먹을까?"
// 주제에 "과메기는 냉동실에서 만들 수 있다고?" 표지가 붙어 그림도 냉동실 이야기가 됐다).
export type PrincipleNote={id:string;myth?:string;mythWhen?:RegExp;menus:readonly string[];when?:RegExp;hint:string;fact:string;sure:boolean};

export const PRINCIPLE_NOTES:readonly PrincipleNote[]=[
  // 홍어(회·삼합과 홍어 요리 공통)
  {id:"skate-urea",mythWhen:/향|냄새|쏘|찡|코|삭|상하|썩/,myth:"홍어의 톡 쏘는 향은 상해서 나는 냄새다",menus:["hongeo-hoe","hongeo-muchim","hongeo-aetang","hongeo-jjim","hongeo-jeon","hongeo-ramyeon"],hint:"홍어 살의 요소가 삭으며 암모니아로",sure:true,
    fact:"홍어 같은 연골어류는 바닷물 속에서 몸의 수분을 지키려고 살과 피에 요소를 많이 지니고 있어요. 삭히는 동안 미생물의 효소가 이 요소를 암모니아로 분해해 톡 쏘는 향이 생겨요."},
  {id:"skate-no-spoil",mythWhen:/삭|상하|썩|보관|오래|발효/,myth:"홍어는 썩혀 먹는 생선이다",menus:["hongeo-hoe"],hint:"암모니아가 다른 균을 막아 상하지 않고 삭음",sure:false,
    fact:"암모니아가 생기면 살이 알칼리성으로 바뀌어 다른 부패균이 자라기 어려워진다고 알려져 있어요. 그래서 홍어는 상하지 않고 삭는 음식이 됐다고 해요."},
  {id:"skate-nose",mythWhen:/코|향|찡|쏘|맛|혀/,myth:"홍어 맛은 혀로 느낀다",menus:["hongeo-hoe","hongeo-muchim","hongeo-jjim"],hint:"암모니아는 코로 먼저, 씹을 때 다시",sure:true,
    fact:"암모니아는 쉽게 날아오르는 기체라 입에 넣기 전에 코로 먼저 올라오고, 씹을 때 입안에서 코 뒤쪽으로 다시 넘어가 한 번 더 느껴져요. 그래서 맛보다 향이 먼저 와요."},
  {id:"skate-cartilage",mythWhen:/뼈|연골|씹|오독|줄/,myth:"생선 뼈는 발라내고 먹는다",menus:["hongeo-hoe","hongeo-jjim"],hint:"뼈가 연골이라 같이 씹힘",sure:true,
    fact:"홍어는 뼈가 단단한 뼈가 아니라 연골이에요. 그래서 회로 썰면 살 사이의 흰 연골까지 함께 씹혀 쫀득한 살과 오독한 연골이 한입에 대비돼요."},
  {id:"skate-season",menus:["hongeo-hoe","hongeo-aetang"],hint:"홍어는 겨울~이른 봄 제철",sure:false,
    fact:"홍어는 찬 바다에서 살이 오르는 겨울부터 이른 봄까지가 제철로 알려져 있어요."},
  {id:"samhap",myth:"삼합의 수육과 묵은지는 그냥 곁들이는 반찬이다",menus:["hongeo-hoe"],when:/삼합|수육|묵은지/,hint:"수육 지방·묵은지 산미·홍어 향의 역할 나눔",sure:true,
    fact:"삼합에서 수육의 지방은 혀를 감싸 암모니아의 톡 쏘는 자극을 덜 날카롭게 느끼게 하고, 묵은지의 젖산 신맛은 기름진 느낌을 끊어 줘요. 삭힌 홍어·익은 묵은지(둘 다 발효)와 삶은 돼지고기가 서로 다른 맛을 맡아요."},
  // 홍어무침
  {id:"muchim-vinegar",mythWhen:/식초|새콤|양념|쏘|향|덜/,myth:"새콤한 양념은 맛만 바꾼다",menus:["hongeo-muchim"],hint:"식초의 산이 암모니아를 붙잡음",sure:false,
    fact:"암모니아는 알칼리성이라 식초 같은 산을 만나면 날아오르지 않는 염으로 바뀌어요. 그래서 새콤하게 무치면 톡 쏘는 향이 회보다 덜하게 느껴진다고 해요."},
  {id:"muchim-chili",mythWhen:/매운|매워|맵|통증|얼얼|고추/,myth:"매운맛도 짠맛·단맛 같은 맛의 하나다",menus:["hongeo-muchim","hongeo-ramyeon","haemul-ramyeon"],hint:"매운맛은 맛이 아니라 통증 감각",sure:true,
    fact:"고추의 매운맛(캡사이신)은 혀의 맛 감각이 아니라 열과 통증을 느끼는 감각을 건드려요. 강한 자극이 함께 오면 다른 향이 상대적으로 덜 두드러져요."},
  // 홍어애탕
  {id:"ae-fat",mythWhen:/국물|진하|묵직|걸쭉|고소|구수/,myth:"진한 국물은 오래 고아서 나온다",menus:["hongeo-aetang"],hint:"애(간)의 지방이 국물에 풀림",sure:true,
    fact:"애는 홍어의 간이에요. 생선 간은 지방이 많아서 끓이면 지방이 국물에 풀려 국물이 고소하고 묵직해져요."},
  {id:"ae-season",menus:["hongeo-aetang"],hint:"겨울 홍어 애가 가장 기름지다는 이야기",sure:false,
    fact:"홍어 애는 제철인 겨울에 가장 크고 기름지다고 알려져 있어요. 그래서 애탕은 찬바람 부는 계절 음식으로 꼽혀요."},
  {id:"ae-barley",mythWhen:/보리|새순|유래|예전|옛|전라|끓여 먹었/,myth:"홍어애탕은 요즘 만든 요리다",menus:["hongeo-aetang"],hint:"보리 새순과 끓이는 전라도식",sure:true,
    fact:"전라도에서는 홍어 애를 보리 새순과 함께 끓인 홍어앳국(보릿국)을 겨울~봄에 즐겨 왔어요. 풋풋한 보리싹 향이 기름진 애 맛을 받쳐 줘요."},
  // 홍어찜·전·라면
  {id:"jjim-steam",mythWhen:/향|냄새|세|쏘|찡|코/,myth:"익히면 홍어 향이 약해진다",menus:["hongeo-jjim"],hint:"열에 암모니아가 더 피어오름",sure:false,
    fact:"향 성분은 뜨거울수록 더 많이 날아올라요. 찜은 김과 함께 암모니아가 한꺼번에 피어올라, 홍어찜은 홍어 요리 가운데 향이 가장 세게 느껴지는 편으로 알려져 있어요."},
  {id:"jjim-collagen",mythWhen:/쫀득|퍽퍽|살|식감|탱글|부드/,myth:"생선은 찌면 퍽퍽해진다",menus:["hongeo-jjim"],hint:"열에 콜라겐이 젤라틴으로",sure:true,
    fact:"홍어 껍질과 연골 둘레에는 콜라겐이 많아요. 찌는 열에 콜라겐이 젤라틴으로 풀리면 살이 촉촉하고 쫀득해지고, 식으면 젤라틴이 다시 굳어 탄력이 달라져요."},
  {id:"jeon-batter",menus:["hongeo-jeon","minari-jeon","kimchi-jeon"],hint:"달걀옷·밀가루가 기름에 구워지며 고소",sure:true,
    fact:"전은 밀가루와 달걀옷이 뜨거운 기름에 닿아 겉면이 노릇하게 구워지면서(당과 단백질이 열에 반응하는 갈변) 고소한 향이 생겨요. 겉은 바삭하고 속은 수분이 남아 촉촉해요."},
  {id:"jeon-mild",mythWhen:/순하|약하|향|덜|세|부치/,myth:"홍어는 어떻게 먹어도 향이 똑같이 세다",menus:["hongeo-jeon"],hint:"부치는 동안 향이 일부 날아감",sure:false,
    fact:"홍어를 기름에 부치는 동안 향 성분의 일부가 날아가고 고소한 전의 향이 더해져, 회보다 순하게 느끼는 사람이 많다고 해요."},
  // 과메기
  {id:"gwamegi-freeze",mythWhen:/찬바람|말리|말려|냉동|건조|겨울|바람|얼/,myth:"과메기는 냉동실에서도 만들 수 있다",menus:["gwamegi"],hint:"찬바람에 얼었다 녹기를 되풀이하며 마름",sure:true,
    fact:"과메기는 꽁치(원래는 청어)를 겨울 바닷바람에 얼었다 녹기를 되풀이하며 말려 만들어요. 그 사이 수분이 빠지고 살이 꾸덕하고 쫀득해지며 기름이 살에 고루 배요. 그래서 찬바람이 부는 겨울에만 제대로 만들 수 있어요."},
  {id:"gwamegi-wrap",menus:["gwamegi"],hint:"김·미역·쪽파·마늘로 기름진 맛을 끊음",sure:true,
    fact:"과메기는 김·미역·쪽파·마늘·고추에 싸 먹어요. 해조류의 바다 향과 매운 채소의 자극이 등푸른 생선의 기름진 맛을 끊어 줘요."},
  {id:"gwamegi-origin",mythWhen:/꽁치|청어|원래|유래|구룡포|포항|옛|예전/,myth:"과메기는 원래부터 꽁치로 만들었다",menus:["gwamegi"],hint:"경북 포항 구룡포의 겨울 음식",sure:true,
    fact:"과메기는 경북 포항 구룡포 일대의 겨울 음식으로 알려져 있어요."},
  // 미나리전·묵은지김치전
  {id:"minari-aroma",menus:["minari-jeon"],hint:"미나리 향 성분과 아삭한 줄기 섬유",sure:false,
    fact:"미나리의 산뜻한 향은 잎과 줄기의 향 성분 때문이고, 줄기의 섬유질이 아삭한 식감을 내요. 향 성분은 기름에 잘 녹아 부치면 향이 전 전체로 퍼진다고 해요. 미나리는 이른 봄이 제철이에요."},
  {id:"mukeunji-acid",myth:"신 김치는 상한 김치다",menus:["kimchi-jeon","hongeo-hoe"],when:/묵은지|김치/,hint:"오래 익으며 유산균이 젖산을 만듦",sure:true,
    fact:"김치가 오래 익으면 유산균이 배추의 당을 젖산으로 바꿔 신맛이 강해지고 배추 조직이 부드러워져요. 이 신맛이 기름진 음식의 느끼함을 끊어 줘요."},
  // 라면
  {id:"seafood-umami",mythWhen:/시원|국물|감칠|개운/,myth:"해물 국물이 시원한 건 온도 때문이다",menus:["haemul-ramyeon"],hint:"조개·새우의 감칠맛 성분이 우러남",sure:true,
    fact:"조개·새우·오징어 같은 해물에는 감칠맛을 내는 아미노산과 호박산 같은 성분이 많아, 끓이면 국물에 우러나 '시원하다'고 느끼는 맛을 내요."},
  // 막걸리
  {id:"makgeolli-yeast",mythWhen:/탄산|톡|거품|효모|발효|쏘|개운/,myth:"막걸리 탄산은 따로 넣은 것이다",menus:["baedari-makgeolli"],hint:"효모가 당을 알코올과 탄산으로",sure:true,
    fact:"막걸리는 쌀이나 밀을 누룩으로 빚어요. 누룩 속 효소가 곡물의 전분을 당으로 바꾸고, 효모가 그 당을 알코올과 탄산으로 바꿔요. 살균하지 않은 생막걸리는 병 속에서도 효모가 살아 있어 탄산이 계속 생겨요."},
  {id:"makgeolli-taste",menus:["baedari-makgeolli"],hint:"남은 당분 단맛·유기산 신맛·탄산",sure:true,
    fact:"막걸리의 단맛은 발효되고 남은 당분, 새콤한 맛은 발효 중 생긴 유기산, 톡 쏘는 느낌은 탄산에서 와요. 상표마다 원료·배합이 달라 이 셋의 균형이 달라지는데, 원료는 병 뒤 원재료 표시에서 확인할 수 있어요."},
  {id:"makgeolli-pair",menus:["baedari-makgeolli"],when:/전|기름|홍어/,hint:"탄산·산미가 기름진 맛을 씻어 줌",sure:true,
    fact:"막걸리의 탄산과 신맛은 입안에 남은 기름기를 씻어 내는 역할을 해서, 전처럼 기름진 음식 다음 한 모금이 개운하게 느껴져요."},
  // 공통(주제 낱말이 맞을 때만)
  {id:"warm-aroma",myth:"음식이 식으면 온도만 내려간다",menus:[],when:/따뜻|뜨거|식으|식은|온도|찬바람|추운|쌀쌀|국물|탕|찜/,hint:"뜨거울수록 향이 더 날아오름",sure:true,
    fact:"향 성분은 온도가 높을수록 더 많이 날아올라 코에 닿아요. 그래서 같은 음식도 뜨거울 때 향이 더 세고, 식으면 향이 줄고 기름이 굳어 맛이 둔해져요."},
  {id:"cold-craving",menus:[],when:/찬바람|추운|쌀쌀|겨울|날씨|김장/,hint:"추우면 따뜻하고 기름진 음식이 당김",sure:false,
    fact:"날이 추우면 몸이 열을 내는 데 에너지를 더 쓰기 때문에 따뜻하고 기름진 음식이 더 당긴다고 알려져 있어요."},
  {id:"rain-jeon",myth:"비 오는 날 전은 그냥 기분 탓이다",menus:[],when:/비\s*오|비가|빗소리|장마|흐린/,hint:"빗소리와 전 부치는 소리, 들일 쉬던 풍습",sure:false,
    fact:"비 오는 날 전이 당기는 이유로는 빗소리가 기름에 전 부치는 소리와 비슷하게 들린다는 이야기, 비가 오면 들일을 쉬고 집에서 전을 부쳐 막걸리와 먹던 풍습이 함께 전해져요."},
  {id:"taste-smell",myth:"맛은 혀가 느낀다",menus:[],when:/향|냄새|맛이\s*다|느껴|처음|낯설|코/,hint:"맛의 많은 부분은 코로 느끼는 향",sure:true,
    fact:"혀는 단맛·짠맛·신맛·쓴맛·감칠맛만 느끼고, 우리가 '맛'이라고 부르는 것의 많은 부분은 코로 느끼는 향이에요. 코가 막히면 음식 맛이 밋밋해지는 것도 그 때문이에요."},
  {id:"exposure",myth:"싫은 향은 계속 싫다",menus:[],when:/처음|낯설|익숙|호불호|입문|못\s*먹/,hint:"낯선 맛도 여러 번 먹으면 익숙해짐",sure:true,
    fact:"처음 맛보는 강한 향은 몸이 경계하는 신호로 느껴지지만, 여러 번 먹으며 안전하다는 경험이 쌓이면 같은 향이 익숙하고 반가운 맛으로 바뀌어요. 작은 한입부터 여러 번 먹어 보는 게 좋은 이유예요."},
];

const MAX_NOTES=8;

// 글(주제·내용 메모·사진 설명)에 맞는 노트: 나온 메뉴의 노트(when이 있으면 그 낱말도 맞아야) + 주제 낱말이 맞는 공통 노트.
export function principlesFor(...texts:Array<string|undefined>):PrincipleNote[] {
  const text=texts.filter(Boolean).join(" ");
  const menus=new Set(menuOf(text).map(item=>item.id));
  const picked=PRINCIPLE_NOTES.filter(note=>{
    if(note.menus.length)return note.menus.some(id=>menus.has(id))&&(!note.when||note.when.test(text));
    return Boolean(note.when?.test(text));
  });
  // 메뉴 노트를 먼저, 공통 노트는 뒤에(자리가 모자라면 공통 노트부터 뺀다).
  return [...picked.filter(note=>note.menus.length),...picked.filter(note=>!note.menus.length)].slice(0,MAX_NOTES);
}

// 구성안·검수·올릴 글 프롬프트에 넣는 안내. 맞는 노트가 없으면 빈 문자열.
export function principleNotesRule(...texts:Array<string|undefined>):string {
  const notes=principlesFor(...texts);
  if(!notes.length)return "";
  const lines=notes.map(note=>`- ${note.fact}${note.sure?"":" (단정하지 말고 \"~로 알려져 있어요\"처럼 쓰세요)"}`).join("\n");
  return `[원리 노트] 아래는 이 주제에 쓸 수 있게 미리 확인해 둔 원리입니다(참고 데이터). 이유는 되도록 이 노트에서 골라 원인 → 변화 → 느낌 순서로 풀어 쓰세요. 노트에 없는 원리를 쓸 때는 널리 알려진 것만 쓰고, 노트와 어긋나거나 그럴듯하게 지어낸 원리(예: 끓이는 탕이 바깥 기온 때문에 진해진다)는 쓰지 마세요. 노트의 문장을 그대로 베끼지 말고 독자에게 말하듯 바꿔 쓰세요.
${lines}`;
}

// 주제 추천용: 메뉴마다 답이 있는 원리 실마리를 짧게 준다(이 실마리로 답할 수 있는 "왜" 질문을 고르게).
// usedTitles: 이미 보여 줬거나 만든 주제 제목. 그 제목이 다루는 실마리는 빼고 준다(2026-10-20 점검: 실마리를 그대로 주면 AI가 금지 목록에 있는
// 준비 주제를 글자까지 같게 다시 냈다). 메뉴가 맞고 mythWhen(없으면 when)이 제목에 맞는 노트를 "이미 쓴 실마리"로 본다.
export function usedPrincipleNotes(usedTitles:readonly string[]):Set<string> {
  const used=new Set<string>();
  for(const title of usedTitles){
    const menus=new Set(menuOf(title).map(item=>item.id));
    for(const note of PRINCIPLE_NOTES){
      const match=note.mythWhen??note.when;
      if(!match||!note.menus.some(id=>menus.has(id)))continue;
      if(match.test(title))used.add(note.id);
    }
  }
  return used;
}
export function principleTopicHints(usedTitles:readonly string[]=[]):string {
  const byMenu=new Map<string,string[]>();
  const used=usedPrincipleNotes(usedTitles);
  for(const note of PRINCIPLE_NOTES){
    if(used.has(note.id))continue;
    const key=note.menus.length?STORE_MENU.find(item=>item.id===note.menus[0])?.short??note.menus[0]:"공통";
    byMenu.set(key,[...(byMenu.get(key)??[]),note.hint]);
  }
  const lines=[...byMenu.entries()].map(([menu,hints])=>`- ${menu}: ${hints.join(" / ")}`).join("\n");
  return `[원리 노트 실마리] 아래는 확인해 둔 원리의 실마리입니다(참고 데이터). 주제 질문은 이런 원리로 분명하게 답할 수 있는 "왜" 질문으로 고르세요. 그럴듯하지만 실제 원리로 답할 수 없는 질문(예: "찬바람 불 때 애탕은 왜 진할까?"처럼 원인이 없는 질문)은 고르지 마세요. 같은 실마리로 만든 질문이 참고 데이터의 recentTitles에 이미 있으면 그 질문을 그대로나 말만 바꿔 내지 말고, 같은 원리의 다른 장면·다른 궁금증이나 다른 실마리를 고르세요.
${lines}`;
}

// 표지 "오해 깨기" 재료: 주제에 맞는 노트의 흔한 오해와, 그것을 뒤집는 실제 원리. 맞는 것이 없으면 빈 문자열.
export function coverMythRule(...texts:Array<string|undefined>):string {
  // 메뉴가 맞아도 주제·본문이 그 오해를 다루지 않으면 꺼내지 않는다(mythWhen, 없으면 when).
  const text=texts.filter(Boolean).join(" ");
  const notes=principlesFor(...texts).filter(note=>note.myth&&((note.mythWhen??note.when)?.test(text)??true));
  if(!notes.length)return "";
  const lines=notes.map(note=>`- 흔한 오해: "${note.myth}" → 실제: ${note.fact}`).join("\n");
  return `[오해 깨기 재료] 독자가 흔히 믿는 오해와 실제 원리입니다(참고 데이터). 후보 하나는 반드시 이 가운데 본문과 맞는 오해 하나를 뒤집는 표지로 쓰세요. 형태는 "~가 아니라 ~라고?"처럼 오해를 뒤집은 사실을 보여 주거나(예: "홍어회는 썩은 게 아니라 삭히는 거라고?"; 아래 목록에 없는 오해를 표지에 쓰지 마세요), 오해와 다른 구체적 현상을 대조하세요(예: "홍어전은 왜 삭힌 홍어보다 덜 쏠까?"). 오해를 그대로 예/아니오로 묻는 질문("홍어애탕은 오래 고아서 진할까?", "홍어 향은 상해서 나는 냄새일까요?")은 답이 "아니요" 하나라 약하니 쓰지 마세요. 표지에는 오해를 뒤집는다는 것만 보여 주고, 실제 원인의 이름(요소·콜라겐 같은 성분)은 본문에서 밝히세요.
${lines}`;
}

// 비교 주제 목록(사장님 요청 2026-10-12: 홍어 vs 가오리, 삭힌 홍어 vs 생홍어처럼 비교할 거리는 많다).
// 결과물 점검에서 비교 주제는 매번 "흐리다"(3/4, 2/3)였는데 대부분 배다리 vs 지평처럼 원료·제조를 확인할 수 없는 상표 비교였다.
// 여기 있는 쌍은 기준마다 "A는 ~, B는 ~"를 확인된 원리로 말할 수 있다. 주제 추천은 이 목록(또는 가게 이야기 메모에 사실이 있는 쌍)에서만
// 비교 주제를 고르고, 구성안·올릴 글은 기준별 차이를 근거로 쓴다. sure:false인 차이는 "~로 알려져 있어요"로 쓴다.
export type ComparisonPair={id:string;a:string;b:string;match:RegExp;differences:readonly {criterion:string;text:string;sure:boolean}[]};
export const COMPARISON_PAIRS:readonly ComparisonPair[]=[
  {id:"skate-vs-ray",a:"홍어",b:"가오리",match:/홍어[^?]*가오리|가오리[^?]*홍어/,differences:[
    {criterion:"생김새",sure:true,text:"홍어는 주둥이가 뾰족하게 튀어나온 마름모꼴이고, 흔히 보는 가오리는 주둥이가 둥글고 몸이 원반처럼 둥근 편이에요. 둘 다 같은 가오리 무리라 시장에서 헷갈리기 쉬워요."},
    {criterion:"먹는 법",sure:true,text:"홍어는 삭혀서 회·찜·무침으로 먹는 전라도 잔칫상 음식이고, 가오리는 주로 삭히지 않고 말리거나 찜·탕·무침으로 먹어요."},
    {criterion:"향",sure:false,text:"둘 다 연골어류라 살에 요소가 있지만, 홍어는 삭혀 먹는 문화 덕에 암모니아 향이 강하게 살아 있고, 삭히지 않은 가오리는 향이 훨씬 순하다고 알려져 있어요."},
    {criterion:"식감",sure:false,text:"홍어 살은 찰지고 쫀득한 편, 가오리는 상대적으로 부드럽고 담백한 편으로 알려져 있어요. 둘 다 뼈가 연골이라 함께 씹혀요."},
  ]},
  {id:"fermented-vs-fresh",a:"삭힌 홍어",b:"생홍어",match:/삭힌\s*홍어[^?]*(?:생\s*홍어|싱싱한\s*홍어|안\s*삭힌)|(?:생\s*홍어|싱싱한\s*홍어|안\s*삭힌)[^?]*삭힌/,differences:[
    {criterion:"향",sure:true,text:"삭힌 홍어는 살 속 요소가 미생물의 효소로 암모니아가 되어 코를 톡 쏘고, 생홍어는 아직 요소가 그대로라 톡 쏘는 향이 약하고 담백해요."},
    {criterion:"식감",sure:false,text:"생홍어는 탱탱하고 오독한 편이고, 삭히는 동안 단백질이 조금씩 분해되어 삭힌 홍어 살은 더 부드럽고 찰지게 느껴진다고 해요."},
    {criterion:"맛",sure:true,text:"생홍어는 담백하고 은은한 단맛이 나고, 삭힌 홍어는 톡 쏘는 향 뒤에 감칠맛이 올라와요."},
    {criterion:"유래",sure:false,text:"섬에서는 싱싱한 홍어를 회로 먹었고, 뱃길로 내륙까지 오래 실어 오는 동안 저절로 삭은 홍어를 먹던 데서 삭힌 홍어가 퍼졌다고 전해져요."},
  ]},
  {id:"raw-fish-vs-hongeo",a:"생선회",b:"홍어회",match:/(?:생선회|광어|우럭|일반\s*회)[^?]*홍어|홍어[^?]*(?:생선회|광어|우럭|일반\s*회)/,differences:[
    {criterion:"신선함",sure:true,text:"생선회는 잡은 지 얼마 안 된 싱싱함이 맛이고, 홍어회는 일부러 삭혀 생긴 향이 맛이에요."},
    {criterion:"뼈",sure:true,text:"생선회는 단단한 뼈를 발라내고 살만 뜨지만, 홍어는 뼈가 연골이라 살과 함께 썰어 오독하게 씹어요."},
    {criterion:"상하는 방식",sure:false,text:"보통 생선은 시간이 지나면 부패균이 늘어 상하지만, 홍어는 요소에서 생긴 암모니아가 다른 균을 막아 상하지 않고 삭는다고 알려져 있어요."},
  ]},
  {id:"hoe-vs-muchim",a:"홍어회",b:"홍어무침",match:/홍어\s*회[^?]*무침|무침[^?]*홍어\s*회/,differences:[
    {criterion:"향",sure:false,text:"홍어회는 암모니아 향이 그대로 코로 올라오고, 무침은 식초의 산이 알칼리성 암모니아를 붙잡아 향이 덜하게 느껴진다고 해요."},
    {criterion:"맛",sure:true,text:"홍어회는 홍어 살 맛과 향이 중심이고, 무침은 새콤달콤한 양념과 고춧가루의 매운 자극이 먼저 와요."},
    {criterion:"식감",sure:true,text:"홍어회는 도톰하게 썰어 쫀득함이 살아 있고, 무침은 한입 크기로 썰어 채소의 아삭함과 함께 씹혀요."},
  ]},
  {id:"hoe-vs-jjim",a:"홍어회",b:"홍어찜",match:/홍어\s*회[^?]*찜|찜[^?]*홍어\s*회/,differences:[
    {criterion:"향",sure:false,text:"향 성분은 뜨거울수록 많이 날아올라서, 차가운 홍어회보다 김이 오르는 홍어찜의 향이 훨씬 세게 느껴지는 편이에요."},
    {criterion:"식감",sure:true,text:"홍어회는 날것이라 탱탱하고 쫀득하며, 찜은 열에 콜라겐이 젤라틴으로 풀려 살이 촉촉하고 부드러워져요."},
    {criterion:"먹는 자리",sure:true,text:"홍어찜은 전라도 잔칫상·제사상에 오르던 음식으로 알려져 있고, 홍어회는 삼합처럼 곁들임과 함께 먹는 경우가 많아요."},
  ]},
  {id:"hoe-vs-jeon",a:"홍어회",b:"홍어전",match:/홍어\s*회[^?]*홍어\s*전|홍어\s*전[^?]*홍어\s*회/,differences:[
    {criterion:"향",sure:false,text:"부치는 동안 향 성분 일부가 날아가고 고소한 전 향이 더해져, 홍어전을 회보다 순하게 느끼는 사람이 많다고 해요."},
    {criterion:"식감",sure:true,text:"홍어회는 쫀득한 날 살이고, 홍어전은 달걀옷이 노릇하게 구워져 겉은 고소하고 속은 촉촉해요."},
  ]},
  {id:"aged-vs-fresh-kimchi",a:"묵은지",b:"겉절이",match:/묵은지[^?]*(?:겉절이|새\s*김치|생김치)|(?:겉절이|새\s*김치|생김치)[^?]*묵은지/,differences:[
    {criterion:"신맛",sure:true,text:"묵은지는 오래 익는 동안 유산균이 배추의 당을 젖산으로 바꿔 신맛이 깊고, 겉절이는 거의 발효되지 않아 신맛이 없어요."},
    {criterion:"식감",sure:true,text:"겉절이는 배추가 아삭하고, 묵은지는 오래 익으며 조직이 부드러워져 흐물하면서도 씹는 맛이 남아요."},
    {criterion:"어울림",sure:true,text:"묵은지의 강한 신맛은 기름진 수육·전의 느끼함을 끊어 주고, 겉절이는 신선한 양념 맛으로 담백한 음식과 어울려요."},
  ]},
  {id:"live-vs-pasteurized",a:"생막걸리",b:"살균 막걸리",match:/생\s*막걸리[^?]*살균|살균[^?]*생\s*막걸리/,differences:[
    {criterion:"탄산",sure:true,text:"생막걸리는 효모가 살아 있어 병 속에서도 발효가 이어지며 탄산이 생기고, 살균 막걸리는 열로 효모를 멈춰 맛이 그대로 유지돼요."},
    {criterion:"맛의 변화",sure:true,text:"생막걸리는 날이 갈수록 당이 줄고 신맛이 늘어 맛이 변하고, 살균 막걸리는 오래 두어도 맛이 거의 같아요."},
    {criterion:"보관",sure:true,text:"생막걸리는 냉장 보관하고 유통기한이 짧으며, 살균 막걸리는 상온에서도 오래 둘 수 있어요."},
  ]},
  {id:"herring-vs-saury",a:"청어 과메기",b:"꽁치 과메기",match:/청어[^?]*꽁치|꽁치[^?]*청어/,differences:[
    {criterion:"유래",sure:true,text:"과메기는 원래 청어로 만들었는데, 청어가 잘 잡히지 않던 시기에 꽁치로 만들기 시작해 지금은 꽁치 과메기가 흔해요."},
    {criterion:"맛",sure:false,text:"청어 과메기는 기름이 더 많고 진한 맛, 꽁치 과메기는 상대적으로 담백하고 쫀득한 맛으로 알려져 있어요."},
  ]},
  {id:"seafood-vs-hongeo-ramyeon",a:"해물라면",b:"홍어라면",match:/해물\s*라면[^?]*홍어\s*라면|홍어\s*라면[^?]*해물\s*라면/,differences:[
    {criterion:"국물 맛",sure:true,text:"해물라면은 조개·새우·오징어의 감칠맛 성분이 우러나 '시원한' 국물이 되고, 홍어라면은 뜨거운 국물에서 홍어 향이 피어올라 톡 쏘는 맛이 더해져요."},
    {criterion:"건더기",sure:true,text:"해물라면은 여러 해물의 탱글한 식감, 홍어라면은 홍어 살과 연골의 쫀득·오독한 식감이 씹혀요."},
  ]},
];

// 주제·표지 질문이 이 목록의 비교인지. 아니면 undefined.
export function comparisonPairOf(text:string):ComparisonPair|undefined {
  return COMPARISON_PAIRS.find(pair=>pair.match.test(text));
}

// 구성안·올릴 글 프롬프트용: 이 비교의 기준별 차이.
export function comparisonPairRule(...texts:Array<string|undefined>):string {
  const pair=comparisonPairOf(texts.filter(Boolean).join(" "));
  if(!pair)return "";
  const lines=pair.differences.map(item=>`- ${item.criterion}: ${item.text}${item.sure?"":" (단정하지 말고 \"~로 알려져 있어요\"처럼 쓰세요)"}`).join("\n");
  return `[비교 근거: ${pair.a} vs ${pair.b}] 이유 장마다 아래 기준 하나를 골라 "${pair.a}는 ~, ${pair.b}는 ~"처럼 양쪽을 한 장에 함께 쓰세요(참고 데이터).
${lines}`;
}

// 주제 추천용: 고를 수 있는 비교 쌍 목록.
export function comparisonTopicRule():string {
  return `[비교 주제] 두 대상을 견주는 주제는 아래 쌍 가운데서만 고르세요. 이 쌍들은 기준마다 차이를 확인된 원리로 말할 수 있습니다: ${COMPARISON_PAIRS.map(pair=>`${pair.a} vs ${pair.b}`).join(", ")}. 배다리·지평처럼 상표끼리 견주는 주제는 원료·만드는 법을 확인할 수 없어 흐려지니, 가게 이야기 메모에 두 상표의 사실이 적혀 있을 때만 쓰세요.`;
}
