// 장마다 촬영 문법(이미지 품질 1단계, 2026-10-20 계획서). 참고 자료의 5장 구성(한 상 45도 → 손으로 한 입 → 초장 매크로 → 항공샷 →
// 따르기 엔딩)처럼, 한 묶음 안에서 장마다 다른 촬영 문법을 배정한다. 예전에는 역할(표지·detail·overview)별 힌트뿐이라
// 같은 접시가 거리만 바뀌어 반복되고 손·동작 장면이 거의 없었다. 배정은 장 번호로 정해지므로 구성안을 바꾸지 않고도 겹치지 않는다.
import type { ImageBrief } from "./schema";
import { STORE_MENU, menuOf } from "@/features/store/menu";

export type ShotId="hero-45"|"hand-action"|"macro-dip"|"steam-action"|"flatlay"|"pour-ending"|"plate-low";

const BASE="Vertical portrait framing, the subject inside the central 80% of the frame";
export const SHOTS:Readonly<Record<ShotId,{label:string;prompt:string}>>={
  "hero-45":{label:"한 상 45도",prompt:`${BASE}. 45-degree angle close-up of the full plate, shallow depth of field, the hero plate fills about 60% of the frame, appetizing food-magazine quality.`},
  // 손은 가장자리에 손가락 일부만(얼굴 없음, 손가락 오류를 줄인다).
  "hand-action":{label:"손으로 한 입",prompt:`${BASE}. Action close-up: a hand entering from the frame edge (only the fingers visible, no face) holding one bite or a wrap (ssam) of the hero food, or chopsticks lifting one piece; the bite is sharp and large in the frame, the plate softly blurred behind.`},
  "macro-dip":{label:"초장 찍는 매크로",prompt:`${BASE}. Extreme close-up macro of one piece being dipped into its small sauce dish, droplets of sauce clinging to it, shallow depth of field, background gently blurred.`},
  "steam-action":{label:"김 오르는 액션",prompt:`${BASE}. Dynamic close-up of the hot dish just served: soft white steam rising and gently bubbling broth, warm directional light catching the steam, nothing else moving.`},
  "flatlay":{label:"바로 위 항공샷",prompt:`${BASE}. Top-down flat-lay of the whole table setting: the hero dish in the middle, side dishes and drink around it, clean organized layout.`},
  "pour-ending":{label:"따르는 엔딩",prompt:`${BASE}. Action close-up of milky makgeolli being poured from a dented yangeun kettle into a sabal bowl beside the hero dish, a few droplets splashing, warm cozy tavern glow in the background.`},
  "plate-low":{label:"낮은 눈높이 결",prompt:`${BASE}. Low eye-level close-up across the plate so the texture and sheen of the hero food fill the foreground, side items softly blurred behind.`},
};

const SOUP=/^(hongeo-aetang|hongeo-ramyeon|haemul-ramyeon)$/;

// 이 장의 촬영 문법. 표지 = 한 상 45도, 결론 = 항공샷, 가게·방문 장 = 따르는 엔딩. 이유 장은 장 번호로 돌아가며 서로 다르게
// (탕·라면이면 김 오르는 액션을 맨 앞에). 구성안의 역할 detail·overview는 그 뜻(매크로·항공샷)을 지킨다.
export function shotFor(input:Pick<ImageBrief,"slide"|"slideIndex"|"slideTotal"|"topic">):ShotId {
  const slide=input.slide;
  if(!slide||slide.role==="cover")return "hero-45";
  if(slide.role==="detail")return "macro-dip";
  if(slide.role==="overview")return "flatlay";
  if(slide.role==="visit"||slide.role==="cta")return "pour-ending";
  const index=input.slideIndex??2,total=input.slideTotal??5;
  if(index>=total&&total>2)return "flatlay";
  const hero=menuOf(`${slide.headline} ${slide.points.join(" ")}`)[0]??menuOf(input.topic)[0]??STORE_MENU[0];
  const order:ShotId[]=SOUP.test(hero.id)?["steam-action","hand-action","plate-low","macro-dip"]:["hand-action","macro-dip","plate-low","steam-action"];
  const cycle=SOUP.test(hero.id)?order:order.slice(0,3);
  return cycle[(Math.max(2,index)-2)%cycle.length];
}
