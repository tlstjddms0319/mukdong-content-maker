import { framingDirection, openaiSize } from "./imageAspect";
import type { ImageBrief } from "./schema";
import { IMAGE_STYLE_DIRECTIONS, resolveImageStyle } from "./style";
import { CARD_LAYOUTS, normalizeCardLayout, photosNeeded } from "./design";
import { STYLES } from "./styleCatalog";
import { CHOPSTICK_SCENE } from "./carousel";
import { heroMenu, josa, menuOf, type StoreMenuItem } from "@/features/store/menu";
import { copyMentionsSkate, foodFreeAnchor } from "./sceneFoods";
import { comparedPair } from "@/features/copy/explain";
import { toFile } from "openai";

// 이번 장의 글(제목·요점·장면 설명)과 주제 글. 주인공 메뉴를 고를 때 쓴다.
const slideTextOf=(input:ImageBrief)=>input.slide?[input.slide.headline,...input.slide.points,input.slide.visualPrompt].join(" "):"";
const topicTextOf=(input:ImageBrief)=>[input.topic,input.imageBrief].filter(Boolean).join(" ");
// 이 장면의 주인공 메뉴(STORE_MENU). 과메기 주제면 과메기, 홍어 주제면 홍어회처럼 주제·장 글에서 고른다.
export function sceneHero(input:ImageBrief):StoreMenuItem|undefined {
  return heroMenu(slideTextOf(input),topicTextOf(input));
}
// 홍어가 실제로 나오는 장면인지: 주인공이 홍어 요리이거나, 이번 장 글(제목·요점. 장이 없으면 주제)이 홍어 상차림을 말할 때.
// 장면 설명(visualPrompt)은 보지 않는다. AI가 덧붙인 "홍어 삼합" 한마디로 과메기 장에 홍어 지시가 통째로 붙던 길을 막는다.
function showsSkate(input:ImageBrief,hero:StoreMenuItem|undefined):boolean {
  if(hero?.id.startsWith("hongeo-"))return true;
  // 메뉴를 못 찾은 장(주제)은 다른 메뉴와 부딪힐 일이 없으니 장면 설명까지 본다(예전과 같이).
  // 가게 이름 "묵동홍어마을"은 홍어 장면이 아니다(copyMentionsSkate가 걸러 낸다).
  if(!hero)return copyMentionsSkate(input.slide?slideTextOf(input):topicTextOf(input));
  return copyMentionsSkate(input.slide?[input.slide.headline,...input.slide.points].join(" "):topicTextOf(input),hero);
}

// 홍어가 아닌 메뉴가 주인공일 때. 겉모습은 STORE_MENU에서 가져온다.
// 나오면 안 되는 음식은 이름도 꺼내지 않는다(이미지 모델은 "홍어를 넣지 마"의 '홍어'에 끌려 그리기 쉽다).
// 대신 "접시 위 음식은 이것과 장면에 적힌 곁들임뿐"이라고 긍정문으로 범위를 닫는다.
function menuHeroDirection(hero:StoreMenuItem):string {
  return [
    `이번 장면의 주인공은 ${josa(hero.short,"이다","다")}. ${josa(hero.short,"이","가")} 가장 크고 가장 앞(또는 가운데)에 초점이 맞게 놓인다. 겉모습: ${hero.lookKo}. 식탁에 놓인 음식은 ${josa(hero.short,"과","와")} 장면 설명에 적힌 곁들임뿐이고, 곁들임은 더 작게 둔다.`,
    `The hero of this image is ${hero.look} Keep it the largest, sharpest subject in front. The only foods on the table are this dish and the side items named in the scene description, shown smaller.`,
  ].join(" ");
}

function foodDirection(input:ImageBrief):string {
  const hero=sceneHero(input);
  const skate=showsSkate(input,hero);
  const parts:string[]=[];
  if(hero&&!hero.id.startsWith("hongeo-"))parts.push(menuHeroDirection(hero));
  if(!skate)return parts.length?`${parts.join(" ")} 메뉴와 무관한 장식 소스는 추가하지 않는다.`:"";
  const subject=[input.topic,input.imageBrief,input.slide?.visualPrompt].filter(Boolean).join(" ");
  // A scene drafted by AI must not change an explicitly chosen preparation.
  const menuText=/홍어\s*(?:전(?!문|통|체|날)|찜|무침|회|애\s*탕|라면)|삼합/.test(input.topic)?input.topic:subject;
  const cooked=[
    [/홍어\s*전(?!문|통|체|날)/,"홍어전 장면은 얇은 생선 살에 전옷을 입혀 노릇하게 부친 표면과 부드러운 속살을 표현한다. 회 접시로 바꾸지 않는다."],
    [/홍어\s*찜/,"홍어찜 장면은 익힌 살의 결을 표현한다. 생회처럼 투명하고 분홍색인 살로 바꾸지 않는다."],
    [/홍어\s*무침/,"홍어무침 장면은 홍어 조각과 양념의 질감을 구분한다. 설명이나 참고 사진에 없는 채소를 임의로 추가하지 않는다."],
    [/홍어\s*라면/,"홍어라면 장면은 김이 오르는 그릇에 담긴 붉은 국물의 라면으로 표현한다. 회 접시로 바꾸지 않고, 설명에 없는 재료를 임의로 추가하지 않는다."],
    [/애\s*탕|홍어\s*탕/,"홍어애탕 장면은 뚝배기나 깊은 그릇에 담긴 뜨거운 국물 요리로 표현한다. 회 접시로 바꾸지 않고, 설명에 없는 재료를 임의로 추가하지 않는다."],
  ] as const;
  const preparations:string[]=cooked.filter(([pattern])=>pattern.test(menuText)).map(([,description])=>description);
  const soup=/애\s*탕|홍어\s*탕|홍어\s*라면/.test(menuText);
  // 삼합(수육·묵은지)은 장면이 말할 때만 꺼낸다. 홍어회 장면마다 "삼합"을 적으면 삼합 사진으로 끌려간다.
  const samhap=/삼합|수육|묵은지/.test(menuText);
  if(!preparations.length||/홍어\s*회|삼합/.test(menuText))preparations.push(`홍어회는 이 가게처럼 손가락 두 마디 크기로 썬 삭힌 홍어 조각으로, 탁한 연보라빛 분홍 살에 비스듬한 흰 연골 결이 보이고 검은 접시에 줄지어 담긴다. Hand-cut pieces two finger-widths across, 5-8 mm thick with visible cut sides and uneven edges, in loose rows; never identical thin square tiles like a chocolate bar. The flesh is a muted, dusty mauve to lilac-pink with pale grey-white areas; fine translucent white cartilage lines cross each piece in parallel diagonal rows (a herringbone or chevron pattern), and the cut edges are serrated like a comb. Not the glossy orange of salmon or the deep red of tuna, and not bleached chalk-white.${samhap?" 삼합에 수육과 묵은지가 등장하면 세 재료가 구분되게 자연스럽게 겹친 한입 크기로 표현한다.":""}`);
  // 작은 이미지 모델은 '홍어'를 몰라 베이컨·햄처럼 그리기 쉬워서 영어로 무엇인지 한 번 설명한다.
  preparations.push("Hongeo is Korean fermented skate, a flat ray fish: its flesh has fine parallel fibers and thin translucent cartilage lines, never marbled fat stripes. The skate must not look like bacon, ham, sausage or pork belly.");
  // 이미지 모델은 '홍어 한 점'을 꼬리·지느러미 달린 작은 생선 한 마리(가자미·박대 모양)로 그리기 쉽다.
  // 실제 홍어회는 넓은 날개 살을 썬 조각이므로, 통째 생선 모양을 명시적으로 금지한다. 국물 요리(애탕)는 썬 조각 묘사를 빼고 통째만 막는다.
  preparations.push(soup
    ?"홍어는 통째 생선으로 그리지 않는다. Never show a whole small fish with a tail, fins, head or a fish-shaped outline."
    :"홍어는 통째 생선으로 그리지 않는다. 꼬리·지느러미·머리가 달린 작은 생선 한 마리나 가자미·박대 같은 모양이 아니라, 넓은 날개 살을 손으로 썬 도톰한 사각 조각으로 보여 준다. Show the skate only as sliced pieces of wing meat (thick hand-cut squarish slices). Never show a whole small fish with a tail, fins, head or a fish-shaped outline.");
  // 홍어 요리가 주인공인 장면만 "주인공은 홍어"를 못 박는다(과메기·미나리전·막걸리 장면이면 위 menuHeroDirection이 주인공을 정한다).
  // 삼합 장면은 모델이 익숙한 수육을 크게 그리고 홍어를 뒤로 밀기 쉽다. 다만 장면에 없는 수육·묵은지를 끌어오지 않는다.
  // 곁들임(수육·묵은지)은 장면이 말할 때만 이름을 꺼낸다. 말하지 않으면 "접시 위엔 홍어회뿐"이라고 긍정문으로 닫는다.
  if(!hero||hero.id==="hongeo-hoe")preparations.push(samhap
    ?"이 장면의 주인공은 홍어다. 홍어가 가장 크고 가장 앞(또는 가운데)에 초점이 맞게 놓인다. 이번 장면이 묵은지에 싸거나 수육과 겹쳐 먹는 장면이므로 홍어만 따로 들지 말고 그 조합 그대로(홍어가 보이게) 보여 주고, 수육이 홍어를 가리지 않게 한다. The fermented skate is the hero, clearly visible and in focus; show the exact combination the scene describes (wrapped in aged kimchi or stacked with boiled pork) with the skate visible."
    :"이 장면의 주인공은 홍어다. 홍어가 가장 크고 가장 앞(또는 가운데)에 초점이 맞게 놓이고, 식탁의 음식은 홍어회와 장면 설명에 적힌 곁들임뿐이다. 집어 올린 한 점이 있다면 홍어 조각이다. The fermented skate is the hero, clearly visible and in focus; the only foods on the table are the sliced skate and the side items named in the scene description.");
  else if(hero.id.startsWith("hongeo-"))preparations.push(`이 장면의 주인공은 ${josa(hero.short,"이다","다")}. ${josa(hero.short,"이","가")} 가장 크고 가장 앞(또는 가운데)에 초점이 맞게 놓이고, 식탁의 음식은 ${josa(hero.short,"과","와")} 장면 설명에 적힌 곁들임뿐이다. The hero of this image is ${hero.look}`);
  return [...parts,...preparations].join(" ")+" 이번 장면에 해당하는 조리법만 표현한다. 두꺼운 정육면체 회, 두부 같은 고기 블록, 탑처럼 높은 적층, 초밥이나 연어로 바꾸는 표현은 금지한다. 메뉴와 무관한 장식 소스는 추가하지 않는다.";
}

// 이번 장의 제목·요점이 말하는 "먹는 동작"을 이미지에 꼭 보이게 하는 문장(가장 앞쪽에 둔다).
// 예전에는 장면 설명이 긴 공통 지시문 사이에 묻혀, "묵은지에 감싸요"·"수육 한 조각 곁들여요" 장에서도
// 홍어만 젓가락으로 든 같은 사진이 나왔다. 글에 나온 조합을 영어·한국어로 짧게 못 박는다.
// 홍어 조합(삼합·묵은지 싸기·수육)은 홍어가 나오는 장면에서만 쓴다. 다른 메뉴는 STORE_MENU 겉모습으로 붙인다.
const SKATE_ACTIONS:ReadonlyArray<readonly [RegExp,string]>=[
  [/삼합/,"삼합: 홍어 한 점·수육 한 조각·묵은지를 한 젓가락에 겹친 모습 / the three are stacked together in one chopstick bite: skate slice, a slice of boiled pork and aged kimchi"],
  [/(묵은지|김치)[^.!?]*(싸|감싸|말아|올려|얹)|(싸|감싸|말아)[^.!?]*(묵은지|김치)/,"묵은지에 홍어를 싼 모습 / a skate slice wrapped in or laid on a leaf of red aged kimchi, the kimchi clearly visible around it"],
  [/수육/,"수육 한 조각이 홍어와 함께 보이는 모습 / a slice of boiled pork belly together with the skate, both clearly visible"],
];
const COMMON_ACTIONS:ReadonlyArray<readonly [RegExp,string]>=[
  [/막걸리/,"막걸리 사발이 함께 보이는 모습 / a brass or ceramic bowl of milky makgeolli in the scene"],
  [/초장|양념장|기름장/,"찍어 먹는 양념 종지 / a small dipping-sauce dish next to the bite"],
];
export function sceneMustShow(input:ImageBrief):string {
  const slide=input.slide;
  if(!slide)return "";
  const text=[slide.headline,...slide.points].join(" ");
  const hero=sceneHero(input);
  const skate=!hero||hero.id==="hongeo-hoe"||copyMentionsSkate(text,hero);
  const skateActions=skate?SKATE_ACTIONS.filter(([pattern])=>pattern.test(text)).map(([,description])=>description):[];
  // 삼합이면 수육·묵은지 문장은 삼합 문장에 이미 들어 있으므로 겹쳐 쓰지 않는다.
  const unique=skateActions.some(item=>item.startsWith("삼합"))?skateActions.filter(item=>!item.startsWith("수육")&&!item.startsWith("묵은지")):skateActions;
  // 글에 나온 다른 메뉴(홍어회·막걸리 제외: 위 문장이 맡는다)를 겉모습과 함께 꼭 보이게 한다.
  const menus=menuOf(text).filter(item=>item.id!=="hongeo-hoe"&&item.category!=="술").map(item=>`${josa(item.short,"이","가")} 보이는 모습 / ${item.look.replace(/^Korean [^:]+:\s*/,"").replace(/\.$/,"")}`);
  const common=COMMON_ACTIONS.filter(([pattern])=>pattern.test(text)).map(([,description])=>description);
  const actions=[...unique,...menus,...common];
  if(!actions.length)return "";
  return `이번 장 필수 장면(가장 중요, 다른 장과 다른 장면으로): ${actions.join("; ")}. MUST SHOW in this image: ${actions.map(item=>item.split(" / ")[1]).join("; ")}.`;
}

// 후보마다 다른 구도. 같은 프롬프트를 n번 보내면 모델의 우연 말고는 차이가 없어서, 후보 번호로 각도와 거리를 갈라 준다.
export const CANDIDATE_VARIANTS:readonly string[]=[
  "45도 위에서 접시 전체와 주변 곁들임이 보이게. 손이나 젓가락 없이 놓인 상차림",
  "낮은 눈높이에서 가까이. 주인공 음식의 결과 윤기가 앞에, 곁들임은 뒤에서 흐릿하게",
  "바로 위에서 내려다본 상차림. 마주 앉은 두 사람의 손과 잔이 양쪽 가장자리에",
  "옆에서 낮게. 테이블 위 그릇의 높이 차이와 조명의 결이 보이게",
];

// 사진 여러 칸 레이아웃에서 n번째 칸(0부터)이 보여 줄 피사체. 표지 후보처럼 같은 장면의 후보를 여러 장 만들 때는 없다.
// 예전에는 칸마다 같은 장면 설명에 각도만 달리 보내서, 비교·폴라로이드 칸에 거의 같은 그림(같은 사발에 막걸리 따르기)이 두 번 들어갔다.
// - 비교(versus): 키워드 앞 두 개가 양쪽 이름이므로 칸마다 한쪽만 그린다.
// - 그 밖(폴라로이드·콜라주): 요점을 칸마다 하나씩 장면으로. 요점이 모자라면 곁들임·사람 손·분위기처럼 다른 요소로.
const EXTRA_FOCUS=["주인공 음식 옆의 곁들임과 잔이 주인공인 가까운 장면","마주 앉은 사람의 손과 잔, 나눠 먹는 순간","테이블 전체와 주변 분위기가 보이는 넓은 장면"] as const;
export function photoFocusOf(input:Pick<ImageBrief,"slide"|"slideLayout">,index:number):string|undefined {
  const slide=input.slide;
  if(!slide||slide.role==="cover"||input.slideLayout==="overlay")return undefined;
  const layout=normalizeCardLayout(slide);
  const slots=photosNeeded(layout);
  if(slots<2||index>=slots)return undefined;
  const keywords=slide.keywords.filter(Boolean);
  if(layout==="versus"&&keywords.length>=2){
    const [mine,other]=index===0?[keywords[0],keywords[1]]:[keywords[1],keywords[0]];
    return `이 사진에는 '${mine}'만 보여 줄 것('${other}'는 넣지 말 것. 비교하는 두 사진이 한눈에 다르게 보여야 한다)`;
  }
  const point=slide.points[index]?.trim();
  const others="같은 장의 다른 사진과 피사체·구도가 겹치지 않게";
  return point?`이 사진의 장면: ${point} (${others})`:`이 사진의 장면: ${EXTRA_FOCUS[index%EXTRA_FOCUS.length]} (${others})`;
}

// 후보 한 장마다 구도가 다른 요청으로 나눈다. 한 장만 만들 때는 구도를 따로 주지 않는다.
// 사진 여러 칸 레이아웃이면 칸마다 피사체(photoFocus)도 다르게 준다.
export function candidateBriefs(input:ImageBrief):ImageBrief[] {
  const offset=input.candidateOffset??0;
  const total=offset+input.count;
  return Array.from({length:input.count},(_,index)=>{
    const focus=photoFocusOf(input,offset+index);
    return {
      ...input,
      count:1,
      candidateOffset:undefined,
      variant:total>1?CANDIDATE_VARIANTS[(offset+index)%CANDIDATE_VARIANTS.length]:input.variant,
      ...(focus?{photoFocus:focus}:{}),
    };
  });
}

// 참고 이미지를 어떻게 쓸지 알려 주는 문장. 어떤 모드든 참고 이미지 속 글자·표·캐릭터를 베끼지 않게 한다.
function referenceDirection(input:ImageBrief):string {
  const noCopy="참고 이미지 안의 글자, 표, 로고, 캐릭터, 장식은 복제하지 말 것.";
  if(input.referenceMode==="continuity") return input.refinement
    // 수정 요청이 있는 재생성에서 "동일하게 유지"를 그대로 두면 요청이 묻히므로, 기준은 잇되 요청을 우선시킨다.
    ? `첨부 이미지는 선택된 AI 표지의 글자 없는 원본이다. 음식의 종류와 그릇, 테이블, 색감의 기준은 이어 가되, 사용자의 수정 요청과 충돌하면 수정 요청을 우선한다. ${noCopy}`
    // 표지를 그대로 잠그면 거리만 다른 같은 접시가 반복된다. 분위기만 잇고 장면은 새로 만든다.
    : `첨부 이미지는 선택된 AI 표지의 글자 없는 원본이다. 색감, 조명의 방향, 그릇과 테이블의 재질 같은 분위기만 이어 가고, 장면·구도·촬영 거리·피사체 배치는 이번 슬라이드 장면 설명대로 새로 만들 것. 표지와 같은 접시 배치를 다시 그리지 말 것. ${noCopy}`;
  // 사진 중심에서 사진이 모자란 장: 같은 접시를 확대만 하던 것을, 같은 음식으로 이 장 글에 맞는 새 장면(예: 무침 옆 막걸리 사발)을 그리게 한다.
  if(input.referenceMode==="dish") return `첨부 사진은 이 가게가 실제로 내는 음식이다. 음식의 종류, 색, 양념, 썬 모양, 담음새와 그릇은 첨부 사진 그대로 살리고, 장면·구도·촬영 거리·곁들임(술잔·막걸리 사발·반찬 등)·배경은 이번 슬라이드 장면 설명대로 새로 만들 것. 첨부 사진과 같은 구도·같은 각도를 반복하지 말 것. 첨부 사진에 없는 다른 메뉴를 주인공으로 바꾸지 말 것. ${noCopy}`;
  if(input.referenceMode==="style") return `첨부 이미지는 화풍, 색감, 조명, 분위기만 참고한다. 참고 이미지 속 음식과 사물의 배치는 따르지 말고 선택 주제와 슬라이드 장면에 맞는 새 구도로 만들 것. ${noCopy}`;
  // source: 장 고치기의 "AI로 이 사진 다듬기". 사장님이 찍은 사진의 구도까지 지키고 빛·색·선명도만 다듬는다.
  return `첨부한 원본 음식의 형태와 특징은 유지하고 조명, 색감, 선명도만 자연스럽게 보완할 것. 가게에서 직접 찍은 사진이므로 음식의 종류·색·썬 모양·담음새, 그릇, 접시 위치, 촬영 각도와 구도를 그대로 지키고(장면 설명보다 이 사진이 우선), 초점을 흐리는 어수선한 배경 물건만 정리할 것. 음식을 바꾸거나 새 음식을 더하지 말 것. Keep the attached photo's food, plating, camera angle and composition; only improve light, color and sharpness. ${noCopy}`;
}

// 썬 홍어회가 주인공인 장면인지(홍어 질감 지시용).
export function showsRawSkate(input:ImageBrief):boolean {
  const hero=sceneHero(input);
  return showsSkate(input,hero)&&(!hero||hero.id==="hongeo-hoe");
}

// 소품은 한국 상차림으로만. 이미지 모델은 '생선회'를 보면 일식 소품을 끌어오기 쉬워서 이름을 들어 막는다.
const PROPS_DIRECTIVE="Props, if any, are Korean: brass yugi bowls, onggi or ttukbaegi earthenware, a dented yangeun kettle, a makgeolli sabal bowl. No Japanese props: no sushi geta board, wasabi, pickled ginger, chopstick rests or sake set.";

const NO_TEXT_DIRECTIVE="Absolutely no text in the image: no letters, words, Korean or English characters, numbers, captions, speech bubbles, question marks, signs or logos. Food and background only.";
// 디자인 힌트가 비워 두라는 자리에 이미지 AI가 엉터리 한글 제목을 그려 넣었다(사장님 지적 2026-10-12, "우춘향희 사딩월."). 맨 앞에 한 번만 붙인다.
const EMPTY_AREAS_PLAIN="Leave empty areas plain (table, wall or blur); never fill them with lettering, titles or fake writing.";

// 표지가 두 음식을 견주면("치즈는 익숙한데 다른 발효 음식은 왜 낯설까?") 표지 그림에 두 음식을 나란히 둔다.
// 예전에는 모든 장면의 주인공을 주제 메뉴(홍어)로 못 박아, 표지 질문의 '치즈'가 그림에 없었다(사장님 지적 2026-10-10).
// 둘째 대상이 가게 메뉴가 아니면("다른 발효 음식") 이 가게의 홍어회를 대표로 그린다. 모든 이미지 공급자가 이 문장을 같이 받는다.
export function comparisonCoverDirection(input:Pick<ImageBrief,"slide"|"topic">):string {
  if(input.slide&&input.slide.role!=="cover")return "";
  const pair=comparedPair(input.slide?.headline||input.topic)??comparedPair(input.topic);
  if(!pair)return "";
  const second=menuOf(pair.second)[0]?.short??"홍어회";
  return `표지 비교 장면(위의 '주인공' 지시보다 우선): 질문이 '${pair.first}'와(과) '${pair.second}'를 견주므로, ${pair.first} 한 접시와 ${second} 한 접시를 같은 크기로 나란히(왼쪽 ${pair.first}, 오른쪽 ${second}) 같은 식탁·같은 조명에 놓는다. 두 음식이 한눈에 구분되어야 한다. This cover compares two foods: place a plate of ${pair.first} (left) and a plate of ${second} (right) side by side at the same size, both clearly recognizable.`;
}

export const buildImagePrompt=(input:ImageBrief,reference=false)=>{
  const styleId=resolveImageStyle(input);
  const style=IMAGE_STYLE_DIRECTIONS[styleId];
  // 사장님 사진을 구도 그대로 다듬는 요청(source)에는 새 장면을 요구하는 지시(필수 장면·후보 구도·칸별 피사체)를 넣지 않는다.
  const retouch=reference&&(input.referenceMode??"source")==="source";
  return [
    // 작은 이미지 모델은 질문형 주제를 그대로 글씨로 그리기 쉬워서, 글자 금지를 영어로 맨 앞과 맨 끝에 둔다.
    NO_TEXT_DIRECTIVE,
    EMPTY_AREAS_PLAIN,
    `한국 음식점 인스타그램 게시물용 ${style.medium}. 선택 주제(장면의 소재일 뿐, 이미지에 글자로 쓰지 말 것): ${input.topic}.`,
    input.imageBrief ? `기존 이미지 설명: ${input.imageBrief}.` : "",
    retouch ? "" : sceneMustShow(input),
    // 이미지 모델은 '홍어'를 보면 젓가락으로 한 점 집어 든 사진으로 가기 쉽다. 장면이 그걸 말하지 않으면 막는다.
    input.slide&&!CHOPSTICK_SCENE.test(input.slide.visualPrompt)
      ? "이 장면에는 젓가락으로 한 점을 집어 든 모습을 넣지 말고, 음식은 접시·그릇·식탁 위에 놓인 모습으로 보여 줄 것. Do NOT show chopsticks lifting a slice in this image; the food rests on the plate or table." : "",
    input.slide ? `슬라이드 역할: ${input.slide.role}. 장면: ${input.slide.visualPrompt}.${input.photoFocus&&!retouch?` ${input.photoFocus}.`:""}` : `세로 4:5 구도, 하나의 음식 피사체가 선명하고 먹음직스럽게 보이며 자연스러운 조명과 여백이 있는 ${styleId==="photo"?"실제 음식 사진 스타일":`${style.medium} 스타일`}.`,
    // 공통 스타일은 모든 장에 붙으므로 음식 이름을 걷어 내고 색·빛·그릇·테이블만 보낸다(예전에 저장된 구성안 포함).
    input.styleAnchor ? `전체 캐러셀 공통 스타일: ${foodFreeAnchor(input.styleAnchor)}.` : "",
    style.look,
    // 장면 설명이나 공통 스타일에 "사진"이 남아 있어도 화풍 지시가 이기도록 한 번 더 못 박는다.
    styleId==="photo" ? "" : `화풍: ${style.anchor}. 장면 설명이나 공통 스타일에 '사진'이라는 말이 있어도 사진처럼 만들지 말고 이 화풍으로 그릴 것.`,
    input.slide?.role==="detail"?"Macro detail: emphasize the actual texture of one bite with a gently blurred background. Keep the focal food in the upper two thirds of the frame; the plate may extend beyond the frame.":input.slide?.role==="overview"?"Top-down overview: keep the whole plate inside the central 75% crop-safe area, with sufficient depth of field to read the arrangement.":"Keep the main food inside the central 75% crop-safe area; use depth of field appropriate to this scene, without losing the food's recognizable shape.",
    input.variant&&!retouch ? `이 후보만의 구도: ${input.variant}.` : "",
    // 카드의 사진 칸 비율에 맞춘 구도(가로 칸이면 접시 전체가 가장자리에서 잘리지 않게). 칸 비율을 모르면 넣지 않는다.
    framingDirection(input.windowRatio,input.slide?.role==="detail"),
    // 사람이 먹고 있는 느낌은 장면 설명이 요구할 때만, 얼굴이 식별되지 않는 범위에서 넣는다.
    // 그림 콘셉트(캐릭터·만화)는 만화 얼굴이 필요하다. 실사·일러스트는 예전처럼 실제 사람 얼굴을 그리지 않는다.
    styleId==="character"||styleId==="anime"
      ? "캐릭터·만화 얼굴은 통째 생선 마스코트와 만화 사람에게만 그리고, 실제 사람처럼 사실적인 얼굴은 그리지 말 것. Cartoon faces only on whole-fish mascots and cartoon people; never render a realistic, recognizable human face. Never put faces, eyes or limbs on plated, sliced or cooked food (sashimi, braised or mixed dishes, soups): edible food stays faceless, realistic and appetizing."
      : "장면 설명에 손, 젓가락, 잔, 뒷모습 같은 사람 요소가 있으면 자연스럽게 넣되, 얼굴은 프레임 밖에 두거나 식별되지 않게 할 것. Hands and chopsticks are welcome when the scene calls for them; never render a recognizable face.",
    foodDirection(input),
    // 모든 화풍 공통: 먹는 음식을 혐오스럽게 그리지 않는다(사장님 지적 2026-10-13: 보라 연기·찡그린 얼굴 홍어찜이 맛없어 보임).
    "No purple or green smell clouds, disgusted faces or nose-pinching; aroma only as soft white steam. Food always looks delicious.",
    comparisonCoverDirection(input),
    // 실사 홍어회 장면의 질감·빛. 결과 연골 줄이 홍어다움을 만든다. 무침·애탕이나 다른 메뉴가 주인공이면 붙이지 않는다. 클로즈업(detail)은 접시 비율을 주지 않는다.
    // 색: 하얗게만 나온다는 지적(2026-10-10)에 산호빛·선홍빛으로 고쳤더니 참치·연어회처럼 나왔다(2026-10-11).
    // 사장님이 보낸 실제 매장 사진의 홍어회는 탁한 연보라빛 분홍(모브)에 회백색, 비스듬한 흰 연골 결이다.
    styleId==="photo"&&showsRawSkate(input)
      ? `Skate texture: muted dusty mauve-pink flesh with pale grey-white areas, parallel diagonal rows of fine translucent white cartilage lines, comb-like serrated edges, translucent edges backlit by the side light; keep the white balance neutral so the mauve-pink reads true.${input.slide?.role==="detail"?"":" The plate fills about 60% of the frame."}` : "",
    PROPS_DIRECTIVE,
    // 레이아웃마다 사진이 쓰이는 방식이 달라서, 그 레이아웃의 사진 분위기와 여백 요청을 붙인다.
    input.slide ? CARD_LAYOUTS[input.slideLayout==="overlay"?"fullscreen":input.slide.layout].photoHint : "",
    // 디자인 계열(컬러 블록·신문 등)은 사진을 누끼·흑백·픽셀처럼 따로 가공하므로, 그 가공에 맞는 촬영 조건을 덧붙인다.
    input.slide && input.slideLayout!=="overlay" && input.design?.style && input.design.style!=="template" ? STYLES[input.design.style].photoHint : "",
    reference ? referenceDirection(input) : "",
    // 수정 요청은 위의 화풍·구도 지침보다 우선한다고 명시해야 "애니메이션 풍으로" 같은 요청이 사진 지시에 묻히지 않는다.
    input.refinement ? `사용자의 수정 요청(가장 우선): ${JSON.stringify(input.refinement)}. 위의 화풍·구도·조명 지침과 충돌하면 이 요청을 따른다. 음식의 종류와 사실 기준은 유지한다.` : "",
    "이미지 안에 글자, 로고, 가격표를 넣지 말 것. 실제 매장 외관, 식별되는 얼굴, 확인되지 않은 원산지나 메뉴 구성을 만들지 말 것.",
    NO_TEXT_DIRECTIVE,
  ].filter(Boolean).join(" ");
};

export function buildImageRequest(input: ImageBrief, quality:"medium"|"high"="medium") {
  return { model:"gpt-image-1.5" as const, quality, prompt:buildImagePrompt(input), size:openaiSize(input.windowRatio), n:input.count };
}

export async function buildImageEditRequest(input:ImageBrief&{referenceImage:string},quality:"medium"|"high"="medium") {
  const [,mime,encoded]=input.referenceImage.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)??[];
  if(!mime||!encoded)throw new Error("참고 이미지 형식이 올바르지 않습니다.");
  const image=await toFile(Buffer.from(encoded,"base64"),`reference.${mime==="jpeg"?"jpg":mime}`,{type:`image/${mime}`});
  // 높은 충실도는 참고 이미지를 거의 그대로 잠근다. 사용자가 올린 실제 음식 사진을 그대로 살릴 때만 쓰고,
  // 화풍 참고, 표지 이어 가기, 수정 요청, 그림 화풍에서는 낮춰서 장면이 바뀔 여지를 준다.
  const keepClose=(input.referenceMode??"source")==="source"&&!input.refinement&&resolveImageStyle(input)==="photo";
  const input_fidelity:"high"|"low"=keepClose?"high":"low";
  return {model:"gpt-image-1.5" as const,quality,image,prompt:buildImagePrompt(input,true),size:openaiSize(input.windowRatio),n:input.count,input_fidelity};
}
