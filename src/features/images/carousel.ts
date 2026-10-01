import { z } from "zod";
import { IMAGE_STYLE_DIRECTIONS, ImageStyleSchema } from "./style";
import { CardLayoutSchema, DesignSpecSchema, DEFAULT_DESIGN, defaultCardLayout, designCatalogText, normalizeCardLayout } from "./design";
import { SlideBodyFontSchema, SlideTitleFontSchema } from "./typography";
import { diversifyCarouselDesign } from "./variety";

export const CarouselPlanInputSchema=z.object({
  topic:z.string().trim().min(1).max(200),
  imageBrief:z.string().trim().min(1).max(600).optional(),
  contentBrief:z.string().trim().min(1).max(600).optional(),
  imageStyle:ImageStyleSchema.optional(),
  slideCount:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]).default(5),
});

export const CarouselRoleSchema=z.enum(["cover","overview","detail","how-to","pairing","process","occasion","mood","visit","cta"]);

export const SLIDE_POINT_MAX_LENGTH=40;
export const SLIDE_POINT_MAX_COUNT=4;

export const CarouselSlidePlanSchema=z.object({
  role:CarouselRoleSchema,
  headline:z.string().trim().min(1).max(42),
  // 본문 장에 얹을 짧은 요점 2~4줄. 표지는 빈 배열. 엄격 JSON 스키마 제공자 때문에 선택 필드로 두지 않는다.
  points:z.array(z.string().trim().min(1).max(SLIDE_POINT_MAX_LENGTH)).max(SLIDE_POINT_MAX_COUNT),
  visualPrompt:z.string().trim().min(12).max(600),
  textPosition:z.enum(["top","bottom"]),
  // 이 장을 그릴 카드 레이아웃. 엄격 JSON 스키마 제공자 때문에 선택 필드로 두지 않는다.
  layout:CardLayoutSchema,
  // 태그 알약과 검색창 문구에 쓰는 짧은 키워드. 없으면 빈 배열.
  keywords:z.array(z.string().trim().min(1).max(12)).max(3),
  // 대형 숫자형에서 크게 보여 줄 숫자. 확인된 숫자가 없으면 빈 문자열.
  figure:z.string().trim().max(16),
  // 이 장의 제목·본문 글꼴. "auto"면 캐러셀 공통 글꼴(design)을 쓴다. 예전 구성안에는 없으므로 기본값 "auto".
  titleFont:SlideTitleFontSchema.default("auto"),
  bodyFont:SlideBodyFontSchema.default("auto"),
  // 같은 레이아웃의 모양 변형 번호(제목 위치·사진 모양 등). 서버가 게시물마다 섞어 채우므로 AI는 0을 두면 된다.
  variant:z.number().int().min(0).max(3).default(0),
});

export type CarouselPlanInput=z.input<typeof CarouselPlanInputSchema>;
export type CarouselRole=z.infer<typeof CarouselRoleSchema>;
// 장 하나를 받는 함수(그리기·이미지 프롬프트)는 글꼴 필드가 없는 예전 장도 받는다. 없으면 "auto"로 본다.
export type CarouselSlidePlan=z.input<typeof CarouselSlidePlanSchema>;
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
  // 캐러셀 전체가 공유하는 디자인(색 조합). 장별 레이아웃은 각 slide.layout에 있다.
  design:DesignSpecSchema,
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

// 준비된 요점은 주제와 무관하게 안전한 일반 문장만 쓴다(가격·원산지·영업시간 같은 확인 필요한 사실은 넣지 않는다).
// 앞 장의 마지막 줄을 다음 장의 첫 줄이 받도록 써서, AI 없이도 슬라이드가 한 이야기로 읽히게 한다.
const FALLBACK_SLIDES:Record<CarouselRole,Omit<CarouselSlidePlan,"role"|"layout"|"keywords"|"figure"|"titleFont"|"bodyFont"|"variant">>={
  cover:{headline:"",points:[],visualPrompt:"완성된 음식 한 상을 45도 위에서 담은 히어로 음식 사진. 테이블 가장자리에 젓가락을 든 손이 살짝 들어오고, 얼굴은 프레임 밖",textPosition:"top"},
  overview:{headline:"상에 뭐가 올라오는지 먼저 볼게요",points:["가운데 메인 접시, 둘레에 곁들임이 놓여요","처음이라면 순한 것부터 차례로 집어 보세요","다음 장에서 한 점을 가까이 볼게요"],visualPrompt:"그릇과 곁들임의 전체 구성이 보이도록 위에서 넓게 내려다본 상차림. 양쪽에서 젓가락을 든 두 사람의 손이 들어오고 얼굴은 없음",textPosition:"top"},
  detail:{headline:"가까이 보면 결이 이렇게 살아 있어요",points:["얇게 썰려 빛에 비치면 결이 보여요","씹을수록 탄력이 느껴지는 부분이에요","이걸 어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"젓가락으로 집어 올린 한 점을 눈높이에서 가까이 담은 매크로 사진. 뒤로 흐릿한 상차림, 손만 보이고 얼굴 없음",textPosition:"bottom"},
  "how-to":{headline:"한 점은 이렇게 만들어 먹어요",points:["홍어 한 점을 먼저 집고 곁들임을 올려요","첫 점은 양념을 적게 해서 맛을 확인해요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"젓가락으로 홍어 한 점을 집어 곁들임 위에 올리는 손동작을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"},
  pairing:{headline:"같이 놓으면 맛이 잡히는 조합이에요",points:["곁들임이 맛의 균형을 잡아 줘요","음료는 담백한 것이 잘 어울려요","이제 가기 전에 확인할 것만 남았어요"],visualPrompt:"핵심 음식과 잘 어울리는 음료와 곁들임을 대각선 구도로 담은 식탁. 잔을 든 손과 젓가락이 함께 보이고 얼굴 없음",textPosition:"bottom"},
  process:{headline:"손질부터 담음새까지 이렇게 준비해요",points:["재료를 손질해 접시에 가지런히 담아요","한 접시씩 순서대로 준비해요","이렇게 나온 한 상을 다음 장에서 볼게요"],visualPrompt:"깨끗한 손이 재료를 접시에 가지런히 담는 준비 과정을 옆 각도에서 담은 사진. 얼굴 없음",textPosition:"top"},
  occasion:{headline:"여럿이 나눠 먹을 때 더 좋은 자리예요",points:["가운데 한 상을 두고 각자 한 점씩 집어요","이야기하면서 천천히 먹기 좋은 구성이에요","분위기가 어떤지 이어서 볼게요"],visualPrompt:"여럿이 둘러앉은 식탁을 옆에서 담은 사진. 한 상을 향해 뻗은 여러 손과 잔이 보이고, 사람은 뒷모습이나 어깨까지만 나오고 얼굴 없음",textPosition:"bottom"},
  mood:{headline:"서두르지 않아도 되는 저녁이에요",points:["부드러운 조명 아래 한 상 앞에서 쉬어 가요","한 점씩 천천히 먹어도 괜찮은 자리예요","가기 전에 확인할 것만 남았어요"],visualPrompt:"부드러운 저녁 조명 아래 한 상을 넓은 여백과 함께 담은 식탁 사진. 테이블 끝에 잔을 든 손이 보이고 얼굴 없음",textPosition:"top"},
  visit:{headline:"가기 전에 이것만 확인하면 돼요",points:["메뉴 구성은 프로필의 플레이스에서 확인해요","처음이라면 직원에게 편하게 물어봐도 돼요","저장해 두면 다음에 찾기 편해요"],visualPrompt:"푸짐하고 편안한 완성 상차림을 눈높이에서 담은 사진. 마주 앉은 사람의 손이 젓가락을 들고 있고 얼굴 없음, 매장 외관 없음",textPosition:"bottom"},
  cta:{headline:"다음 한 점은 직접 확인해 보세요",points:["저장해 두면 다음 방문 때 편해요","궁금한 점은 댓글로 남겨 주세요"],visualPrompt:"비어 가는 접시 가장자리와 마지막 한 점을 대비해 담은 사진. 접시를 향한 젓가락과 손만 보이고 얼굴 없음",textPosition:"bottom"},
};

const FALLBACK_KEYWORDS:Record<CarouselRole,string[]>={
  cover:["홍어","묵동"],overview:["한 상","구성"],detail:["결","식감"],"how-to":["먹는 법","한 점"],pairing:["곁들임","조합"],
  process:["준비","손질"],occasion:["모임","저녁"],mood:["분위기","여유"],visit:["방문 전","확인"],cta:["저장","다음 한 점"],
};

export function createFallbackCarouselPlan(input:CarouselPlanInput):CarouselPlan {
  const parsed=CarouselPlanInputSchema.parse(input);
  const style=IMAGE_STYLE_DIRECTIONS[parsed.imageStyle??"photo"];
  const drawn=parsed.imageStyle!==undefined&&parsed.imageStyle!=="photo";
  const context=parsed.imageBrief ? ` 선택 주제의 기존 이미지 설명도 반영: ${parsed.imageBrief.slice(0,450)}.` : "";
  return CarouselPlanSchema.parse({
    slideCount:parsed.slideCount,
    styleAnchor:`따뜻하고 자연스러운 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트, ${style.anchor}`,
    design:DEFAULT_DESIGN,
    slides:rolesForCount(parsed.slideCount).map((role)=>({
      role,
      ...FALLBACK_SLIDES[role],
      layout:defaultCardLayout(role),
      keywords:FALLBACK_KEYWORDS[role],
      figure:"",
      headline:role==="cover" ? parsed.topic.slice(0,42) : FALLBACK_SLIDES[role].headline,
      // 준비된 장면 설명은 사진 기준으로 쓰여 있어, 그림 화풍이면 "사진"을 "그림"으로 바꿔 모델이 실사로 가지 않게 한다.
      visualPrompt:`${drawn?FALLBACK_SLIDES[role].visualPrompt.replace(/사진/g,"그림"):FALLBACK_SLIDES[role].visualPrompt}.${context}`,
    })),
  });
}

// Shared by the plan route and the provider comparison script so both send the same instruction.
export function buildCarouselPlanPrompt(input:CarouselPlanInput):string {
  const parsed=CarouselPlanInputSchema.parse(input);
  const style=IMAGE_STYLE_DIRECTIONS[parsed.imageStyle??"photo"];
  const roles=rolesForCount(parsed.slideCount);
  return [
    `한국 음식점 Instagram 캐러셀 구성안을 JSON 객체로 작성하세요. 선택한 주제 "${parsed.topic}"를 바꾸지 말고 모든 장면에 일관되게 반영하세요. 기존 이미지 설명: ${parsed.imageBrief ?? "없음"}. 내용 메모: ${parsed.contentBrief ?? "없음"}. slideCount는 ${parsed.slideCount}, slides의 role 순서는 ${roles.join(" → ")}를 정확히 지키세요.`,
    // 한 편의 이야기: 장마다 독립된 자랑을 나열하지 않고, 앞 장이 남긴 궁금증을 다음 장이 받는다.
    `[이야기 구조] ${parsed.slideCount}장은 한 사람이 친구에게 이 음식을 설명해 주는 한 편의 이야기입니다. 표지는 독자가 실제로 가질 법한 구체적인 궁금증 하나를 질문이나 한 문장으로 던지고, 각 본문 장은 앞 장이 남긴 궁금증에 답하면서 마지막 요점 한 줄로 다음 장의 내용을 예고하세요. 마지막 장은 첫 장의 궁금증이 어떻게 풀렸는지 한 줄로 돌아본 뒤 방문 전 확인할 것으로 닫으세요. 장마다 "우리 대단하죠" 식의 자랑이나 감탄으로 끝내지 말고, 정보가 한 방향으로 쌓이게 하세요.`,
    // 사람이 쓴 글처럼: 명사형 슬로건과 광고 상투어를 막고, 관찰 가능한 구체 정보로 쓴다.
    `[문체] headline과 points는 모두 가까운 사람에게 말하듯 자연스러운 해요체의 완결된 문장이나 질문으로 쓰세요. "~느껴보기", "~의 세계", "~한 세트", "~의 역사"처럼 명사로 끝나는 슬로건, "미식의 향연", "풍미 가득", "놓치지 마세요" 같은 광고 상투어, 느낌표 남발은 금지합니다. 각 headline은 짧은 한국어(12~30자)로 한 가지 정보만 전달하고 같은 뜻의 제목을 반복하지 마세요. 표지를 제외한 각 장에는 points 배열로 2~${SLIDE_POINT_MAX_COUNT}개의 요점을 넣으세요. 요점 하나는 한 줄(12~28자)로 headline을 반복하지 말고, "무엇이 어떻게 다른지" 눈이나 입으로 확인할 수 있는 구체적인 정보(차이점, 먹는 순서, 어울리는 조합, 확인할 점)를 쓰세요. 감각을 꾸미는 추상적 비유("입안의 리듬", "감촉을 선사") 대신 "얇게 썰려 빛에 비치면 결이 보여요"처럼 관찰 그대로 쓰세요. 표지의 points는 빈 배열로 두세요.`,
    `[사실 기준] 홍어의 향이 사라진다거나 누구나 좋아한다고 보장하지 마세요. 홍어회와 홍어전·찜·무침의 조리법을 구분하고 선택 주제에 없는 삼합 구성을 강제하지 마세요. 확인되지 않은 가격, 원산지, 영업시간, 매장 정보는 headline과 points 어디에도 만들지 마세요.`,
    // 글도 홍어가 주인공: "묵은지를 펼치고 수육을 올려요"처럼 곁들임이 문장을 이끌면 그림보다 글에서 먼저 주인공이 바뀐다.
    `[홍어 중심] headline과 points의 주어와 첫 동작은 홍어(홍어 한 점, 홍어 살, 홍어 향)로 쓰세요. 수육·묵은지·막걸리는 "홍어 한 점을 묵은지에 싸요"처럼 홍어 문장 뒤에 곁들이는 말로만 넣고, 수육이나 묵은지로 시작하는 요점이나 단계 설명은 쓰지 마세요. 먹는 순서를 설명할 때도 첫 단계는 홍어를 고르거나 집는 동작입니다.`,
    // A vs B 장은 글로 말한 차이가 두 사진에서 보여야 한다. 코 모양처럼 썬 회 사진에 안 나오는 차이는 쓰지 않는다.
    `[비교 장] layout이 versus인 장의 points는 두 사진을 나란히 놓았을 때 눈으로 보이는 차이(살의 색, 결의 굵기, 썬 모양, 윤기)만 쓰세요. 코 모양, 몸 전체 생김새처럼 썬 회 사진에 나오지 않는 차이는 쓰지 마세요. 두 visualPrompt는 같은 접시·각도·조명으로 맞추고, 쓰인 차이(예: 붉은빛 도는 홍어 살과 하얗고 투명한 가오리 살)가 한눈에 갈리도록 각 사진에 그 차이를 명시하세요.`,
    // 장면 다양성: 같은 접시를 거리만 바꿔 다섯 번 찍지 않도록, 장면 유형과 사람 요소를 장마다 다르게 배정한다.
    `[장면] visualPrompt는 각 장의 headline과 points가 말하는 내용을 그대로 보여 주는 ${style.scene}으로 쓰세요. 장마다 장면 유형을 다르게 고르세요: 완성된 한 상(45도 또는 눈높이), 한 점의 질감(매크로), 젓가락으로 집거나 재료를 올리는 손, 함께 먹는 식탁(여러 손과 잔, 뒷모습), 준비 과정, 곁들임과의 조합. ${Math.max(2,Math.ceil(parsed.slideCount/2))}장 이상에는 손, 젓가락, 잔, 뒷모습처럼 사람이 먹고 있다는 느낌이 드는 요소를 넣되 얼굴은 프레임 밖에 두거나 식별되지 않게 하세요. 촬영 거리, 각도, 피사체 배치가 앞 장과 겹치지 않게 쓰고 이미지 안 글자나 로고를 요청하지 마세요. 음식이 나오는 모든 장면에서 홍어가 주인공입니다. visualPrompt에 홍어(또는 그 장의 홍어 요리)를 가장 크고 앞에, 초점이 맞게 둔다고 명시하고, 수육·묵은지·막걸리는 작게 곁들여지는 조연으로만 쓰세요. 집어 올리는 한 점도 홍어 조각이어야 합니다.`,
    `[디자인] ${designCatalogText()}`,
    `styleAnchor에는 전 장이 공유할 색감, 조명, 그릇, 테이블 기준과 화풍(${style.anchor})을 쓰세요. 최상위에 design 객체(palette, theme, titleFont, bodyFont)를 두고, 각 slide는 role, headline, points, visualPrompt, textPosition(top 또는 bottom), layout, keywords, figure, titleFont, bodyFont, variant(0)를 포함해야 합니다.`,
  ].join("\n");
}

export interface CarouselPlanAi {
  generate(input:CarouselPlanInput):Promise<unknown>;
}

// options.seed를 주면 캐러셀마다 레이아웃·색·글꼴을 섞는다(variety.ts). 화면에서 쓰는 구성안 경로는 매번 무작위 시드를 넘기고,
// 시드를 주지 않으면 섞지 않아 결과가 항상 같다(테스트·비교 스크립트용).
export async function planCarousel(input:CarouselPlanInput,ai?:CarouselPlanAi,options:{seed?:number}={}):Promise<CarouselPlan> {
  const parsed=CarouselPlanInputSchema.parse(input);
  const fallback=createFallbackCarouselPlan(parsed);
  const vary=(plan:CarouselPlan,isFallback:boolean)=>options.seed===undefined?plan:diversifyCarouselDesign(plan,options.seed,{fallback:isFallback});
  if(!ai)return vary(fallback,true);
  try {
    const plan=CarouselPlanSchema.parse(await ai.generate(parsed));
    return plan.slideCount===parsed.slideCount ? vary(normalizeCarouselDesign(plan),false) : vary(fallback,true);
  } catch {
    return vary(fallback,true);
  }
}

// AI가 표지와 본문의 레이아웃을 바꿔 골랐으면 역할에 맞게 바로잡는다. 구성안 전체를 버리는 것보다 낫다.
export function normalizeCarouselDesign(plan:CarouselPlan):CarouselPlan {
  return {...plan,slides:plan.slides.map(slide=>({...slide,layout:normalizeCardLayout(slide)}))};
}
