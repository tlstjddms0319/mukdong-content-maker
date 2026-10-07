import { z } from "zod";

// 스타일 계열. 게시물 전체의 디자인 방향을 통째로 정한다. "template"은 레이아웃(18종)+게시물 테마로 그리는 기본 방식이고,
// 나머지는 계열마다 색·사진 처리·글꼴·장식을 모두 따로 가진 디자인이다(그리기 코드는 styles/*.ts).
// 이 파일은 화면 코드도 불러오므로 그리기 코드(sharp 등)를 넣지 않는다.
export const StyleIdSchema=z.enum(["template","colorblock","webtoon","omakase","typography","kitsch","diary","infographic","popup","film","neon","hanji","chalkboard","doodle","label","grid","gold","watercolor","ticket","editorial"]);
export type StyleId=z.infer<typeof StyleIdSchema>;

// 없앤 계열(뉴트로 픽셀 y2k, 신문 newspaper)이 저장된 초안·한 달 기획·주소에 남아 있어도 열리도록 비슷한 새 계열로 바꿔 읽는다.
// 저장된 값을 읽는 곳에서만 쓴다(AI 응답 스키마는 새 목록만 받는다).
export const RETIRED_STYLES:Record<string,StyleId>={y2k:"neon",newspaper:"hanji"};
export const normalizeStyleId=(value:unknown)=>typeof value==="string"&&value in RETIRED_STYLES?RETIRED_STYLES[value]:value;
export const StoredStyleIdSchema=z.preprocess(normalizeStyleId,StyleIdSchema);

export const STYLES:Record<StyleId,{label:string;when:string;photoHint:string}>={
  template:{label:"기본 템플릿",when:"레이아웃과 게시물 테마를 장마다 섞는 기본 카드뉴스",photoHint:""},
  colorblock:{label:"컬러 블록",when:"신메뉴·이벤트·한눈에 띄어야 하는 알림. 진한 단색 바탕, 누끼 음식 스티커, 화면을 채우는 굵은 글자",
    photoHint:"Isolate the dish on a plain, evenly lit light-gray seamless background with no props and no table texture, so the dish can be cut out cleanly."},
  webtoon:{label:"웹툰·만화",when:"처음 먹는 사람의 반응, 재미있는 에피소드, 친근한 이야기. 만화 칸, 집중선, 마스코트 리액션과 말풍선",
    photoHint:"Bright, punchy close-up with a simple background, like a single comic panel."},
  // id는 저장된 초안 호환 때문에 omakase 그대로 두고, 화면 이름과 사진 방향만 한식 상차림으로 바꿨다(사장님 결정: 일식 오마카세처럼 보이지 않게).
  omakase:{label:"정갈한 한 상",when:"숙성·산지·깊은 맛을 단정하게 전하는 글. 넓은 여백, 작은 사진, 가는 명조",
    photoHint:"Neat Korean table setting: the dish in a white porcelain (baekja), onggi or brass yugi bowl, soft side light, lots of empty space around it, quiet and tidy. No sashimi platter and no Japanese tableware."},
  typography:{label:"타이포그래피",when:"식감·맛을 강한 한 단어로 외치는 글. 흐린 흑백 사진 위 거대한 글자",
    photoHint:"Moody close-up texture of the dish; it will be blurred and turned black-and-white behind large text. Keep the middle horizontal band simple, without busy details."},
  kitsch:{label:"B급 키치",when:"유쾌한 이벤트·도전 콘셉트, 웃기게 시선을 끄는 글. 무지개 그라데이션, 외곽선 글자, 톱니 별 딱지",
    photoHint:"Loud, bright, flash-lit snapshot with saturated colors and a centered dish, a little over the top."},
  diary:{label:"빈티지 다이어리",when:"방문 후기, 계절·추억 이야기, 단골의 기록. 크라프트지, 찢어진 줄 노트, 폴라로이드와 마스킹 테이프, 손글씨",
    photoHint:"Warm, nostalgic film-camera snapshot with soft natural light, square-friendly composition, everyday table mood."},
  infographic:{label:"인포그래픽·도감",when:"부위별 특징, 숙성 단계, 먹는 순서처럼 정리해 보여 줄 정보. 모눈종이, 둥근 사진과 점선 지시선, 단계 흐름도",
    photoHint:"Clear top-down or 45-degree shot with the dish centered and fully visible, so it can be shown inside a circle with labeled callouts."},
  popup:{label:"3D 팝업북",when:"신메뉴 공개, 강렬한 첫인상이 필요한 글. 펼친 책 위로 튀어나오는 음식, 입체 글자, 별·연기 효과",
    photoHint:"Isolate the dish on a plain, evenly lit light-gray seamless background with no props, shot slightly from the front so it looks like it is popping up."},
  neon:{label:"네온 간판",when:"퇴근 후 한잔, 저녁 모임, 밤 분위기의 글. 어두운 벽돌 벽에 빛나는 네온 글자와 네온 테두리 사진",
    photoHint:"Night-time moody scene with warm practical lights, the dish and drinks on the table, deep shadows around, like a bar at night. The top 28% is a plain dark wall."},
  hanji:{label:"한지·수묵",when:"전통 음식·잔칫상·제철 메뉴 같은 깊은 이야기를 고급스럽게. 한지 바탕, 붓글씨 제목, 번진 먹, 붉은 낙관",
    photoHint:"Calm traditional Korean table setting with natural light, earthy ceramic dishes, muted warm tones and simple composition."},
  chalkboard:{label:"칠판 메뉴판",when:"먹는 법·오늘의 메뉴·순서처럼 정보를 친근하게. 나무 액자 칠판, 분필 손글씨, 색분필 체크와 별",
    photoHint:"Clear, well-lit shot of the dish centered on the table, simple background, like a menu photo pinned on a board."},
  doodle:{label:"사진 위 낙서",when:"\"여기 좀 봐\" 하고 친근하게 짚어 주는 글. 사진을 크게 쓰고 마커 동그라미·화살표·형광펜 제목",
    photoHint:"Close, appetizing shot with the dish filling the middle of the frame and some empty space at the top and bottom for handwriting."},
  label:{label:"막걸리 라벨",when:"막걸리·전통주·오래된 방법 이야기. 크림색 종이에 둥근 배지와 리본, 양각 느낌 세리프, 병 라벨 테두리",
    photoHint:"Classic still-life of the dish with a bowl or bottle of makgeolli, warm even light, plain background, composed like a product label illustration."},
  grid:{label:"모던 그리드",when:"부위·단계·비교처럼 정리된 정보를 깔끔하고 현대적으로. 흰 바탕, 굵은 검은 격자선, 빨간 포인트, 큰 고딕과 숫자",
    photoHint:"Clean, sharp, evenly lit shot with the dish centered on a plain surface, strong edges, no clutter, like a product catalog photo."},
  gold:{label:"블랙 & 골드",when:"연말 모임·기념일·특별한 날, 프리미엄 코스처럼 격식 있는 글. 검은 바탕에 금박 선·꽃 테두리와 세리프",
    photoHint:"Luxurious low-key shot on a dark table, warm candle-like highlights on the dish, deep black background, elegant plating."},
  watercolor:{label:"수채화",when:"가볍고 따뜻한 일상, 계절 이야기, 부드러운 안부 글. 파스텔 물감 번짐 바탕, 둥근 손글씨, 붓 자국 장식",
    photoHint:"Soft, bright, airy photo with pastel tones and natural daylight, gentle shadows, the dish on a light table."},
  ticket:{label:"티켓·승차권",when:"방문 안내·오시는 길·모임 초대처럼 \"오세요\" 하는 글. 절취선과 스텁이 있는 입장권, 도장과 번호",
    photoHint:"Welcoming shot of the restaurant table or entrance, bright and inviting, horizontal composition that fits inside a ticket frame."},
  editorial:{label:"푸드 매거진 표지",when:"큰 한 마디로 눈길을 끄는 글, 시즌 특집, 베스트 정리. 큰 제호와 호수, 표지 문구 띠, 바코드",
    photoHint:"Magazine-cover style: the dish large and centered, the top 20% left empty for a masthead, dramatic but clean lighting, vertical composition."},
  film:{label:"감성 필름",when:"비 오는 날, 술 한잔, 하루의 끝 같은 감성 이야기. 필름 띠, 바랜 색감 사진, 영화 자막 같은 문장",
    photoHint:"Cinematic, moody scene with warm practical lights and natural shadows, like a still frame from a film."},
};

// 계열 친화도 표(계획서 B11). fits는 그 계열이 잘 어울리는 글의 낱말, avoid는 어울리지 않는 낱말이다.
// AI 구성안 안내문에 피할 글을 함께 넣고, AI가 계열을 고르지 않았거나 기본 구성안일 때 서버가 이 표로 후보를 좁힌다
// (잔칫상 글이 B급 키치로, 비 오는 날 감성 글이 컬러 블록으로 가지 않게).
// 글(제목·요점·키워드)에 낱말이 그대로 들어 있는지만 본다. 형태소 분석을 하지 않으므로 짧은 어근으로 적는다.
export const STYLE_FIT:Record<StyleId,{fits:string[];avoid:string[]}>={
  template:{fits:[],avoid:[]},
  colorblock:{fits:["신메뉴","이벤트","할인","알림","오픈","출시","한정"],avoid:["잔치","제사","명절","추모","감성","비 오는"]},
  webtoon:{fits:["처음","후기","반응","도전","에피소드","친구","입문"],avoid:["잔치","제사","격식","기념일","프리미엄"]},
  omakase:{fits:["숙성","산지","깊은 맛","정갈","코스","장인","고급"],avoid:["이벤트","할인","도전","웃긴"]},
  typography:{fits:["식감","쫄깃","톡 쏘는","한 마디","강렬"],avoid:["안내","오시는 길","예약","순서"]},
  kitsch:{fits:["도전","이벤트","웃긴","챌린지","레전드","대박"],avoid:["잔치","제사","명절","추모","기념일","어르신","격식","상견례"]},
  diary:{fits:["후기","추억","기록","계절","단골","일상","방문"],avoid:["할인","이벤트","신메뉴"]},
  infographic:{fits:["부위","단계","순서","차이","정리","비교","숙성"],avoid:["감성","분위기","비 오는"]},
  popup:{fits:["신메뉴","공개","첫인상","출시","오픈"],avoid:["잔치","제사","추모","격식"]},
  neon:{fits:["퇴근","한잔","저녁","밤","모임","회식"],avoid:["점심","아침","잔치","제사"]},
  hanji:{fits:["전통","잔치","삼합","명절","제사","어르신","깊은","유래"],avoid:["이벤트","할인","챌린지","웃긴"]},
  chalkboard:{fits:["먹는 법","오늘의","순서","메뉴","팁","안내"],avoid:["격식","프리미엄","기념일"]},
  doodle:{fits:["여기","포인트","꿀팁","주목"],avoid:["격식","추모","제사"]},
  label:{fits:["막걸리","배다리","전통주","오래된","방법","양조"],avoid:["챌린지","웃긴"]},
  grid:{fits:["부위","단계","비교","정리","구성"],avoid:["감성","비 오는","추억"]},
  gold:{fits:["연말","기념일","특별한","프리미엄","코스","상견례"],avoid:["할인","챌린지","웃긴","도전"]},
  watercolor:{fits:["일상","계절","안부","봄","가을","따뜻한","제철","미나리"],avoid:["도전","챌린지","강렬"]},
  ticket:{fits:["방문","오시는 길","예약","초대","모임","안내"],avoid:["추모","제사"]},
  editorial:{fits:["특집","베스트","시즌","정리","한 마디"],avoid:["제사","추모"]},
  film:{fits:["비 오는","술 한잔","하루","감성","저녁","추억"],avoid:["할인","이벤트","신메뉴"]},
};
// 장식이 많아 절제 변형(design.tone="calm")을 가진 계열.
export const RESTRAINABLE_STYLES=new Set<StyleId>(["kitsch","popup","neon","chalkboard"]);
// 격식 있는 글의 낱말. 이런 글이면 tone을 calm으로 둔다.
export const CALM_WORDS=["잔치","제사","명절","추모","기념일","어르신","상견례","돌잔치","환갑","칠순"];
// 글에 들어 있는 fits 낱말 수 − avoid 낱말 수×2. 피할 낱말 하나가 어울리는 낱말 둘보다 무겁다.
export function styleAffinity(id:StyleId,text:string):number {
  const fit=STYLE_FIT[id];
  const count=(words:string[])=>words.filter(word=>text.includes(word)).length;
  return count(fit.fits)-count(fit.avoid)*2;
}

export function styleCatalogText():string {
  const styles=StyleIdSchema.options.map(id=>{const avoid=STYLE_FIT[id].avoid;return `${id}(${STYLES[id].label}: ${STYLES[id].when}${avoid.length?` / 피할 글: ${avoid.join("·")}`:""})`;}).join(", ");
  return `design.style은 게시물 전체의 디자인 방향으로 다음 중 하나: ${styles}. 지난 게시물과 다른 느낌이 나도록 주제에 맞는 계열을 고르세요. template이 아니면 각 slide의 layout은 사진 장 수(0~3장)만 정하는 데 쓰입니다.`;
}

export const STYLE_OPTIONS=StyleIdSchema.options.map(id=>[id,STYLES[id].label,STYLES[id].when] as const);
