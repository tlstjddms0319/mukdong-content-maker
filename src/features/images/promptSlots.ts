// 5칸 구조 이미지 지시문(2026-10-20 계획서 "이미지 품질 강화" 0단계).
// 사장님이 보내 준 참고 자료(홍어·과메기 캐러셀 프롬프트 패키지)의 방식: 주인공 음식 → 담음새·식기 → 분위기·조명 → 질감 디테일 → 촬영.
// 긍정 묘사를 앞에 영어로 짧게 두고, 금지는 맨 끝 한 묶음으로 모은다. 예전 조립(openaiRequest.ts buildImagePrompt)은 금지 문장 일곱 개가
// 앞뒤를 차지해 묘사가 밀렸다. 사실 정확성 지시(홍어 색·익힌 살·주인공 메뉴)는 버리지 않고 [Main dish]·[Texture] 칸 안으로 옮긴다.
// 실사 사진(photo) 화풍만 다룬다. 그림 화풍·참고 이미지 모드는 예전 조립으로 돌아간다(buildImagePrompt가 가른다).
import type { ImageBrief } from "./schema";
import { IMAGE_STYLE_DIRECTIONS } from "./style";
import { CARD_LAYOUTS } from "./design";
import { STYLES } from "./styleCatalog";
import { CHOPSTICK_SCENE } from "./carousel";
import { STORE_MENU, menuOf, type StoreMenuItem } from "@/features/store/menu";
import { foodFreeAnchor } from "./sceneFoods";
import { comparedPair } from "@/features/copy/explain";
import { framingDirection } from "./imageAspect";
import { sceneHero, sceneMustShow } from "./openaiRequest";
import { SHOTS, shotFor } from "./shots";

const SKATE=STORE_MENU.find(item=>item.id==="hongeo-hoe")!;

// 홍어 요리(회가 아닌 찜·전·탕·라면·무침)는 결을 세게 그리면 빗살·벌집처럼 기괴해진다(2026-10-13). 익힌 살은 질감 칸의 한 줄로만.
const COOKED_SKATE=/^hongeo-(?!hoe)/;

// 글이 요구하는 곁들임·동작(sceneMustShow)의 영어 쪽만 꺼낸다.
function mustShowEnglish(input:ImageBrief):string {
  const text=sceneMustShow(input);
  const at=text.indexOf("MUST SHOW in this image: ");
  return at<0?"":text.slice(at);
}

function mainDish(input:ImageBrief,hero:StoreMenuItem):string {
  const pair=input.slide&&input.slide.role!=="cover"?undefined:comparedPair(input.slide?.headline||input.topic)??comparedPair(input.topic);
  const second=pair?menuOf(pair.second)[0]:undefined;
  const comparison=pair?` This cover compares two foods: ${pair.first} on the left and ${second?.look??SKATE.look} on the right, two plates of equal size side by side.`:"";
  return `[Main dish] ${hero.look} It is the largest, sharpest subject in front; the only foods on the table are this dish and the side items named in the scene.${comparison}`;
}

export function buildStructuredImagePrompt(input:ImageBrief):string {
  const hero=sceneHero(input)??SKATE;
  const style=IMAGE_STYLE_DIRECTIONS.photo;
  const scene=input.slide?`Scene for this slide (${input.slide.role}): ${input.slide.visualPrompt}.`:`Scene: ${input.topic}.`;
  // 장마다 촬영 문법(shots.ts, 1단계). 젓가락 금지는 손으로 한 입 장면이 아니고 장면 설명도 젓가락을 말하지 않을 때만.
  const shot=shotFor(input);
  const chopsticks=input.slide&&shot!=="hand-action"&&!CHOPSTICK_SCENE.test(input.slide.visualPrompt);
  const skateTexture=hero.id==="hongeo-hoe"
    // A/B 1·3번(2026-10-20): 구조 조립에서 홍어회 살이 갈색·돼지고기 블록처럼 나왔다. 색(연보라빛, 화이트밸런스)과 얇은 조각을 질감 칸에 그대로 못 박는다.
    ?" Hongeo is Korean fermented skate, a flat ray fish, hand-cut into flat pieces two finger-widths across and only 5-8 mm thick with visible cut sides; the flesh is a muted dusty mauve to lilac-pink with pale grey-white areas, crossed by fine translucent white cartilage lines in parallel diagonal rows; keep the white balance neutral so the mauve-pink reads true. Not the glossy orange of salmon, not the deep red of tuna, not brown or beige, not chalk-white; never thick blocks, never bacon, ham or pork belly, never a whole small fish with fins or tail."
    :COOKED_SKATE.test(hero.id)?" Hongeo is Korean fermented skate; in this cooked dish never exaggerate the fibers into combs or honeycomb, and never show a whole small fish with fins or tail.":"";
  const layoutHint=input.slide?CARD_LAYOUTS[input.slideLayout==="overlay"?"fullscreen":input.slide.layout].photoHint:"";
  const designHint=input.slide&&input.slideLayout!=="overlay"&&input.design?.style&&input.design.style!=="template"?STYLES[input.design.style].photoHint:"";
  const candidate=input.variant?`This candidate's own composition: ${input.variant}.`:"";
  return [
    `Instagram food photograph for a Korean restaurant (topic, not to be written: ${input.topic}).`,
    mainDish(input,hero),
    scene,
    mustShowEnglish(input),
    `[Plating & tableware] ${hero.plating}. Korean tableware only: brass yugi bowls, onggi or ttukbaegi earthenware, a dented yangeun kettle, a makgeolli sabal bowl.`,
    `[Environment & mood] ${input.styleAnchor?foodFreeAnchor(input.styleAnchor):"warm natural color temperature, dark wooden table"}; a cozy Korean tavern (jumak) feel; ${style.look}`,
    `[Texture details] ${hero.texture}.${skateTexture} Soft white steam only where the dish is hot. Food always looks delicious.`,
    `[Shot] ${SHOTS[shot].prompt} ${candidate} ${framingDirection(input.windowRatio,input.slide?.role==="detail")} ${layoutHint} ${designHint}`.replace(/\s+/g," ").trim(),
    "[Series consistency] Keep the same color palette, tableware and lighting across every slide of this carousel; only the composition and action change.",
    `[Do not] No text, letters, numbers, logos or signs anywhere; leave empty areas plain. No readable human faces (hands and backs only). No Japanese props (sushi geta, wasabi, pickled ginger, sake set). No purple or green smell clouds, no disgusted faces. No foods other than those named.${chopsticks?" Do not show chopsticks lifting a slice; the food rests on the plate.":""}`,
    input.refinement?`User revision request (highest priority): ${JSON.stringify(input.refinement)}.`:"",
  ].filter(Boolean).join("\n");
}
