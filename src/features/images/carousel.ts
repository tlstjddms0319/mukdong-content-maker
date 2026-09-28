import { z } from "zod";

export const CarouselPlanInputSchema=z.object({
  topic:z.string().trim().min(1).max(200),
  imageBrief:z.string().trim().min(1).max(600).optional(),
  slideCount:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]).default(5),
});

export const CarouselRoleSchema=z.enum(["cover","overview","detail","how-to","pairing","process","occasion","mood","visit","cta"]);

export const CarouselSlidePlanSchema=z.object({
  role:CarouselRoleSchema,
  headline:z.string().trim().min(1).max(42),
  visualPrompt:z.string().trim().min(12).max(600),
  textPosition:z.enum(["top","bottom"]),
});

export type CarouselPlanInput=z.input<typeof CarouselPlanInputSchema>;
export type CarouselRole=z.infer<typeof CarouselRoleSchema>;
export type CarouselSlidePlan=z.infer<typeof CarouselSlidePlanSchema>;
export type CarouselSlideCount=z.output<typeof CarouselPlanInputSchema>["slideCount"];

const ROLE_ORDERS:{[count in CarouselSlideCount]:readonly CarouselRole[]}={
  3:["cover","how-to","visit"],
  5:["cover","detail","how-to","pairing","visit"],
  7:["cover","overview","detail","how-to","pairing","occasion","visit"],
  10:CarouselRoleSchema.options,
};

export function rolesForCount(count:CarouselSlideCount):readonly CarouselRole[] {
  return ROLE_ORDERS[count];
}

export const CarouselPlanSchema=z.object({
  slideCount:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]),
  styleAnchor:z.string().trim().min(12).max(500),
  slides:z.array(CarouselSlidePlanSchema).min(3).max(10),
}).superRefine((plan,ctx)=>{
  const expected=rolesForCount(plan.slideCount);
  if(plan.slides.length!==expected.length)ctx.addIssue({code:"custom",path:["slides"],message:"슬라이드 수를 확인해 주세요."});
  plan.slides.forEach((slide,index)=>{
    if(slide.role!==expected[index])ctx.addIssue({code:"custom",path:["slides",index,"role"],message:"슬라이드 순서를 확인해 주세요."});
  });
  const scenes=plan.slides.map(slide=>slide.visualPrompt.replace(/[\s.,!?]/g,"").toLowerCase());
  if(new Set(scenes).size!==scenes.length)ctx.addIssue({code:"custom",path:["slides"],message:"각 슬라이드는 서로 다른 장면이어야 합니다."});
});

export type CarouselPlan=z.infer<typeof CarouselPlanSchema>;

const FALLBACK_SLIDES:Record<CarouselRole,Omit<CarouselSlidePlan,"role">>={
  cover:{headline:"",visualPrompt:"완성된 음식 한 상과 핵심 메뉴를 선명하게 보여 주는 강한 정면 히어로 음식 사진",textPosition:"top"},
  overview:{headline:"한눈에 보는 한 상",visualPrompt:"그릇과 곁들임의 전체 구성이 보이도록 위에서 넓게 내려다본 정돈된 음식 상차림 사진",textPosition:"top"},
  detail:{headline:"결과 윤기를 가까이",visualPrompt:"핵심 음식의 결, 윤기, 재료 질감을 가까운 거리와 얕은 심도로 강조한 매크로 음식 사진",textPosition:"bottom"},
  "how-to":{headline:"한 점을 만드는 순간",visualPrompt:"젓가락으로 재료를 차례로 올려 한 점을 완성하는 손동작 중심의 생생한 음식 사진, 얼굴 없음",textPosition:"top"},
  pairing:{headline:"함께 놓으면 좋은 조합",visualPrompt:"핵심 음식과 잘 어울리는 음료와 곁들임을 대각선 구도로 함께 보여 주는 음식 사진",textPosition:"bottom"},
  process:{headline:"정갈하게 준비하는 과정",visualPrompt:"깨끗한 손이 재료를 접시에 가지런히 담는 준비 과정을 옆 각도에서 포착한 음식 사진, 얼굴 없음",textPosition:"top"},
  occasion:{headline:"함께 나누는 저녁",visualPrompt:"여럿이 편안하게 나눠 먹는 저녁 상황을 음식과 손만으로 표현한 따뜻한 식탁 사진, 얼굴 없음",textPosition:"bottom"},
  mood:{headline:"편안한 한 끼의 분위기",visualPrompt:"부드러운 조명과 작은 녹색 포인트가 있는 차분한 식탁 분위기를 넓은 여백과 함께 담은 사진",textPosition:"top"},
  visit:{headline:"오늘 한 상 어때요?",visualPrompt:"방문을 떠올릴 수 있는 푸짐하고 편안한 완성 상차림을 눈높이에서 담은 실제 음식 사진, 매장 외관 없음",textPosition:"bottom"},
  cta:{headline:"다음 한 점을 만나 보세요",visualPrompt:"마지막 행동을 자연스럽게 유도하도록 비어 있는 접시 가장자리와 먹음직스러운 한 점을 대비한 음식 사진",textPosition:"bottom"},
};

export function createFallbackCarouselPlan(input:CarouselPlanInput):CarouselPlan {
  const parsed=CarouselPlanInputSchema.parse(input);
  const context=parsed.imageBrief ? ` 선택 주제의 기존 이미지 설명도 반영: ${parsed.imageBrief.slice(0,450)}.` : "";
  return CarouselPlanSchema.parse({
    slideCount:parsed.slideCount,
    styleAnchor:"따뜻하고 자연스러운 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트, 실제 음식 사진 질감",
    slides:rolesForCount(parsed.slideCount).map((role)=>({
      role,
      ...FALLBACK_SLIDES[role],
      headline:role==="cover" ? parsed.topic.slice(0,42) : FALLBACK_SLIDES[role].headline,
      visualPrompt:`${FALLBACK_SLIDES[role].visualPrompt}.${context}`,
    })),
  });
}

export interface CarouselPlanAi {
  generate(input:CarouselPlanInput):Promise<unknown>;
}

export async function planCarousel(input:CarouselPlanInput,ai?:CarouselPlanAi):Promise<CarouselPlan> {
  const parsed=CarouselPlanInputSchema.parse(input);
  const fallback=createFallbackCarouselPlan(parsed);
  if(!ai)return fallback;
  try {
    const plan=CarouselPlanSchema.parse(await ai.generate(parsed));
    return plan.slideCount===parsed.slideCount ? plan : fallback;
  } catch {
    return fallback;
  }
}
