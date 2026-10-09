import { z } from "zod";
import { IMAGE_STYLE_DIRECTIONS, ImageStyleSchema } from "./style";
import { CardLayoutSchema, DesignSpecSchema, DEFAULT_DESIGN, defaultCardLayout, designCatalogText, normalizeCardLayout } from "./design";
import { SlideBodyFontSchema, SlideTitleFontSchema } from "./typography";
import { diversifyCarouselDesign } from "./variety";
import { MENU_BY_ID, heroMenu, josa, mainMenuOf, type StoreMenuItem } from "@/features/store/menu";
import { SKATE_TABLE, copyMentionsSkate, foodFreeAnchor, isOtherMenu } from "./sceneFoods";
import { CarouselTrackSchema, TRACK_SLIDE_COUNT, applyTrack, ellipsize, trackPromptRules } from "./track";
import { TRACK_STYLES } from "./styleCatalog";
import { EXPLAIN_REASONS_RULE, NO_PROMO_IN_CARDS } from "@/features/copy/explain";

export const CarouselPlanInputSchema=z.object({
  topic:z.string().trim().min(1).max(200),
  imageBrief:z.string().trim().min(1).max(600).optional(),
  contentBrief:z.string().trim().min(1).max(600).optional(),
  imageStyle:ImageStyleSchema.optional(),
  slideCount:z.union([z.literal(3),z.literal(5),z.literal(7),z.literal(10)]).default(5),
  // 실제 사진 캐러셀: 사장님이 올린 사진마다 보이는 것 한 줄(올린 순서, 첫 사진이 표지). 모르는 사진은 빈 문자열.
  // 문안 AI가 사진에 없는 음식을 주인공으로 한 장을 쓰지 않게 하고, 사진을 글이 맞는 장에 넣는 데 쓴다.
  photoNotes:z.array(z.string().trim().max(120)).max(10).optional(),
  // 갈래(track.ts): "photo"(사진 중심)·"text"(글 중심). 주면 장 수(5장)·디자인·장마다 사진 수·글 길이를 갈래가 정한다.
  // 없으면 예전과 똑같이 만든다(예전 화면·저장된 초안).
  track:CarouselTrackSchema.optional(),
});

export const CarouselRoleSchema=z.enum(["cover","overview","detail","how-to","pairing","process","occasion","mood","visit","cta"]);

export const SLIDE_POINT_MAX_LENGTH=40;
export const SLIDE_POINT_MAX_COUNT=4;

export const CarouselSlidePlanSchema=z.object({
  role:CarouselRoleSchema,
  headline:z.string().trim().min(1).max(42),
  // 표지 부제: 큰 훅 제목 아래 작은 한 줄(30자 이내). 표지가 아니면 빈 문자열. 예전 구성안에는 없으므로 기본값 "".
  subline:z.string().trim().max(30).default(""),
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
export type ParsedCarouselPlanInput=z.output<typeof CarouselPlanInputSchema>;
// 갈래가 있으면 요청한 장 수와 상관없이 5장으로 맞춘다(검사된 입력에 쓴다. 구성안 라우트·기본 문안·프롬프트가 같은 장 수를 보게).
export const withTrackCount=(input:ParsedCarouselPlanInput):ParsedCarouselPlanInput=>input.track?{...input,slideCount:TRACK_SLIDE_COUNT}:input;
const parsePlanInput=(input:CarouselPlanInput)=>withTrackCount(CarouselPlanInputSchema.parse(input));
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
// 음식 이름은 주제에서 찾은 메뉴(STORE_MENU)로 채운다. 메뉴를 못 찾으면 홍어회로 쓰되 삼합(수육·묵은지)은 끌어오지 않는다.
type FallbackSlide=Omit<CarouselSlidePlan,"role"|"layout"|"keywords"|"figure"|"titleFont"|"bodyFont"|"variant">;
type MenuWords={dish:string;keyword:string;detail:FallbackSlide;howTo:FallbackSlide;pairWith:string};
const MENU_WORDS:Record<string,MenuWords>={
  "hongeo-hoe":{dish:"홍어",keyword:"홍어",pairWith:"막걸리 사발",
    detail:{headline:"결이 이렇게 살아 있어요",points:["얇게 썰면 결이 비쳐 보여요","씹을수록 탄력이 느껴져요","이걸 어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"접시 위에 겹쳐 놓인 홍어 살의 단면과 결을 낮은 각도에서 가까이 담은 매크로 사진. 뒤로 흐릿한 상차림, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한 점은 이렇게 먹어요",points:["홍어 한 점을 먼저 집어요","첫 점은 양념을 적게 찍어요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"젓가락으로 홍어 한 점을 집어 든 손동작을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"}},
  "hongeo-muchim":{dish:"홍어무침",keyword:"홍어무침",pairWith:"막걸리 사발",
    detail:{headline:"양념이 고루 묻어 있어요",points:["양념 사이로 홍어가 보여요","한입 크기라 나눠 먹기 편해요","어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"얕은 그릇에 담긴 홍어무침의 양념 윤기와 조각을 낮은 각도에서 가까이 담은 매크로 사진. 뒤로 흐릿한 상차림, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한입은 이렇게 집어 먹어요",points:["양념이 묻은 조각을 하나 집어요","작은 조각부터 맛을 봐요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"젓가락으로 홍어무침 한 조각을 집어 든 손동작을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"}},
  "hongeo-jjim":{dish:"홍어찜",keyword:"홍어찜",pairWith:"막걸리 사발",
    detail:{headline:"익은 결이 이렇게 보여요",points:["익힌 살은 불투명한 빛이에요","결 사이로 촉촉한 윤기가 돌아요","어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"접시에 담긴 홍어찜 살 조각의 익은 결과 윤기를 낮은 각도에서 가까이 담은 매크로 사진. 뒤로 흐릿한 상차림, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한 점씩 덜어 먹어요",points:["뜨거울 때 한 조각을 덜어요","결 방향으로 살을 나눠 맛을 봐요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"김이 오르는 홍어찜 접시에서 한 조각을 앞접시로 덜어 놓은 모습을 45도에서 담은 사진. 얼굴 없음",textPosition:"top"}},
  "hongeo-aetang":{dish:"홍어애탕",keyword:"홍어애탕",pairWith:"막걸리 사발",
    detail:{headline:"김이 이렇게 올라와요",points:["뚝배기 위로 김이 올라와요","국물과 건더기를 함께 떠서 맛봐요","어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"뚝배기에 담긴 홍어애탕 국물과 피어오르는 김을 낮은 각도에서 가까이 담은 사진. 뒤로 흐릿한 상차림, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한 숟갈씩 떠 먹어요",points:["국물부터 한 숟갈 떠서 맛을 봐요","뜨거우니 조금 식혀서 먹어요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"숟가락으로 홍어애탕 국물을 떠 올리는 손동작을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"}},
  gwamegi:{dish:"과메기",keyword:"과메기",pairWith:"막걸리 사발",
    detail:{headline:"윤기가 이렇게 돌아요",points:["길게 썬 살에 윤기가 돌아요","겉과 속의 빛깔이 조금 달라요","어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"접시에 가지런히 놓인 과메기 살의 윤기와 결을 낮은 각도에서 가까이 담은 매크로 사진. 뒤로 흐릿한 상차림, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한 점은 이렇게 먹어요",points:["과메기 한 점을 먼저 집어요","곁들임은 취향대로 조금씩 더해요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"젓가락으로 과메기 한 점을 집어 든 손동작을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"}},
  "minari-jeon":{dish:"미나리전",keyword:"미나리전",pairWith:"막걸리 사발",
    detail:{headline:"미나리가 이렇게 보여요",points:["반죽 사이로 미나리가 보여요","가장자리가 노릇하게 익어 있어요","어떻게 먹으면 좋은지 다음 장에요"],visualPrompt:"접시 위 미나리전의 노릇한 겉면과 초록 줄기를 낮은 각도에서 가까이 담은 매크로 사진. 뒤로 흐릿한 상차림, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한 조각은 이렇게 먹어요",points:["미나리전을 한입 크기로 나눠요","양념장은 조금만 찍어 맛을 봐요","같이 먹으면 좋은 게 뭔지 이어서 볼게요"],visualPrompt:"젓가락으로 미나리전 한 조각을 집어 든 손동작을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"}},
  "baedari-makgeolli":{dish:"막걸리",keyword:"막걸리",pairWith:"미나리전 접시",
    detail:{headline:"따르면 이런 빛이에요",points:["사발에 따르면 뽀얀 빛이 보여요","표면에 작은 거품이 올라와요","어떻게 마시면 좋은지 다음 장에요"],visualPrompt:"사발에 담긴 뽀얀 막걸리 표면을 낮은 각도에서 가까이 담은 매크로 사진. 병이 보여도 글자 없이, 손과 얼굴 없음",textPosition:"bottom"},
    howTo:{headline:"한 잔은 이렇게 따라요",points:["가라앉은 것을 살살 섞어 줘요","첫 잔은 조금만 따라 맛을 봐요","같이 먹으면 좋은 안주를 이어서 볼게요"],visualPrompt:"사발에 막걸리를 따르는 손을 옆에서 가까이 담은 사진. 얼굴 없음",textPosition:"top"}},
};

// 주제(와 내용 메모·이미지 설명)에서 이 캐러셀의 주인공 메뉴를 고른다. 못 찾으면 undefined(홍어회 문안을 쓴다).
// 주제 → 내용 메모 → 이미지 설명 → (실제 사진 캐러셀이면) 사진 설명 순서로 찾는다.
// 사진 설명까지 보는 이유: "입맛 없을 때 뭐 먹지?"처럼 메뉴 이름이 없는 주제에 미나리전 사진을 넣었으면 미나리전이 주인공이다.
export function carouselMenu(input:Pick<CarouselPlanInput,"topic"|"contentBrief"|"imageBrief">&{photoNotes?:readonly string[]}):StoreMenuItem|undefined {
  return mainMenuOf(input.topic,input.contentBrief,input.imageBrief,...(input.photoNotes??[]));
}

function fallbackSlides(menu:StoreMenuItem|undefined):Record<CarouselRole,FallbackSlide> {
  const words=MENU_WORDS[menu?.id??"hongeo-hoe"]??MENU_WORDS["hongeo-hoe"];
  const dish=words.dish;
  const look=(menu??MENU_BY_ID["hongeo-hoe"]).lookKo;
  return {
    cover:{headline:"",points:[],visualPrompt:`완성된 ${dish} 한 접시를 45도 위에서 담은 히어로 음식 사진. ${look}, 손·젓가락·얼굴 없음`,textPosition:"top"},
    overview:{headline:"한 상 구성부터 볼게요",points:["둘레에 곁들임이 놓여요","조금씩 차례로 맛보세요","다음 장에서 가까이 볼게요"],visualPrompt:`그릇과 곁들임의 전체 구성이 보이도록 바로 위에서 넓게 내려다본 상차림. 가운데 ${dish}, 둘레에 작은 반찬 그릇, 손과 얼굴 없음`,textPosition:"top"},
    detail:words.detail,
    "how-to":words.howTo,
    pairing:{headline:"같이 놓으면 잘 어울려요",points:["곁들임이 맛의 균형을 잡아 줘요","취향에 맞는 조합을 골라 보세요","이제 가기 전에 확인할 것만 남았어요"],visualPrompt:`${dish} 옆에 ${josa(words.pairWith,"이","가")} 대각선으로 놓인 식탁을 옆에서 담은 사진. 손과 얼굴 없음`,textPosition:"bottom"},
    process:{headline:"이렇게 준비해서 내요",points:["손질해서 가지런히 담아요","한 그릇씩 순서대로 준비해요","이렇게 나온 한 상을 다음 장에서 볼게요"],visualPrompt:`깨끗한 손이 ${josa(dish,"을","를")} 그릇에 가지런히 담는 준비 과정을 옆 각도에서 담은 사진. 얼굴 없음`,textPosition:"top"},
    occasion:{headline:"여럿이 나눠 먹기 좋아요",points:["한 상을 두고 조금씩 덜어요","이야기하며 천천히 먹어요","분위기가 어떤지 이어서 볼게요"],visualPrompt:`여럿이 둘러앉은 식탁 가운데 놓인 ${josa(dish,"을","를")} 옆에서 담은 사진. 한 상을 향해 뻗은 여러 손과 잔이 보이고, 사람은 뒷모습이나 어깨까지만 나오고 얼굴 없음`,textPosition:"bottom"},
    mood:{headline:"서두르지 않는 저녁이에요",points:["부드러운 조명 아래 쉬어 가요","천천히 먹어도 괜찮은 자리예요","마지막으로 방문 전에 볼 것만 정리해요"],visualPrompt:`부드러운 저녁 조명 아래 ${josa(dish,"이","가")} 놓인 식탁을 넓은 여백과 함께 담은 사진. 테이블 끝에 잔을 든 손이 보이고 얼굴 없음`,textPosition:"top"},
    visit:{headline:"가기 전에 이것만 봐요",points:["메뉴 구성은 플레이스에서 확인해요","처음이라면 직원에게 물어봐요","저장해 두면 다음에 찾기 편해요"],visualPrompt:`${josa(dish,"이","가")} 놓인 편안한 완성 상차림을 눈높이에서 담은 사진. 마주 앉은 사람의 손이 젓가락을 들고 있고 얼굴 없음, 매장 외관 없음`,textPosition:"bottom"},
    cta:{headline:"다음엔 직접 맛보세요",points:["저장해 두면 다음 방문 때 편해요","궁금한 점은 댓글로 남겨 주세요"],visualPrompt:`비어 가는 그릇 가장자리와 마지막 남은 ${josa(dish,"을","를")} 대비해 담은 사진. 반쯤 빈 잔과 접힌 냅킨만 보이고 얼굴 없음`,textPosition:"bottom"},
  };
}

function fallbackKeywords(menu:StoreMenuItem|undefined):Record<CarouselRole,string[]> {
  const keyword=(MENU_WORDS[menu?.id??"hongeo-hoe"]??MENU_WORDS["hongeo-hoe"]).keyword;
  return {
    cover:[keyword,"묵동"],overview:["한 상","구성"],detail:[keyword,"가까이"],"how-to":["먹는 법","한입"],pairing:["곁들임","조합"],
    process:["준비","손질"],occasion:["모임","저녁"],mood:["분위기","여유"],visit:["방문 전","확인"],cta:["저장","다음 방문"],
  };
}

export function createFallbackCarouselPlan(input:CarouselPlanInput):CarouselPlan {
  const parsed=parsePlanInput(input);
  const style=IMAGE_STYLE_DIRECTIONS[parsed.imageStyle??"photo"];
  const drawn=parsed.imageStyle!==undefined&&parsed.imageStyle!=="photo";
  const context=parsed.imageBrief ? ` 선택 주제의 기존 이미지 설명도 반영: ${parsed.imageBrief.slice(0,450)}.` : "";
  const menu=carouselMenu(parsed);
  const slides=fallbackSlides(menu);
  const keywords=fallbackKeywords(menu);
  const plan=CarouselPlanSchema.parse({
    slideCount:parsed.slideCount,
    styleAnchor:`따뜻하고 자연스러운 색온도, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트, ${style.anchor}`,
    design:DEFAULT_DESIGN,
    slides:rolesForCount(parsed.slideCount).map((role)=>({
      role,
      ...slides[role],
      layout:defaultCardLayout(role),
      keywords:keywords[role],
      figure:"",
      // 긴 주제는 낱말 가운데를 자르지 않고 "…"으로 줄인다.
      headline:role==="cover" ? ellipsize(parsed.topic,42) : slides[role].headline,
      // 준비된 표지 부제는 사실을 단정하지 않는 안내 한 줄만 쓴다.
      subline:role==="cover" ? "한 장씩 넘기며 알아봐요" : "",
      // 준비된 장면 설명은 사진 기준으로 쓰여 있어, 그림 화풍이면 "사진"을 "그림"으로 바꿔 모델이 실사로 가지 않게 한다.
      visualPrompt:`${drawn?slides[role].visualPrompt.replace(/사진/g,"그림"):slides[role].visualPrompt}.${context}`.slice(0,600),
    })),
  });
  // 갈래가 있으면 기본 문안도 같은 규칙(디자인·장마다 사진 수·글 길이)을 따른다.
  return parsed.track?applyTrack(plan,parsed.track):plan;
}

// 구성안 프롬프트의 주인공 메뉴 규칙. 주제가 과메기면 과메기가, 홍어 주제일 때만 홍어가 주인공이다.
function heroRule(menu:StoreMenuItem|undefined,topic:string):string {
  const samhap=/삼합|수육|묵은지/.test(topic);
  const noSamhap=samhap?"":` 이 주제에는 삼합이 없으니 수육·묵은지·삼합을 꺼내지 마세요(삼합은 기본 구성이 아닙니다).`;
  if(!menu||menu.id==="hongeo-hoe")return `[주인공 메뉴: 홍어] 선택 주제의 메뉴가 주인공입니다. 이 주제는 홍어 이야기이므로 음식을 말하는 문장의 주어와 첫 동작은 홍어(홍어 한 점, 홍어 살, 홍어 향)로 쓰세요. 이유를 설명하는 문장은 발효·지방·산미·혀와 코의 감각 같은 원리가 주어여도 됩니다. 곁들임은 ${samhap?'"홍어 한 점을 묵은지에 싸요"':'"홍어 한 점에 초장을 살짝 찍어요"'}처럼 홍어 문장 뒤에 붙는 말로만 넣고, 곁들임으로 시작하는 요점이나 단계 설명은 쓰지 마세요. 먹는 순서를 설명할 때도 첫 단계는 홍어를 고르는 데서 시작합니다.${noSamhap}`;
  return `[주인공 메뉴: ${menu.short}] 선택 주제의 메뉴가 주인공입니다. 이 주제는 ${menu.short} 이야기이므로 음식을 말하는 문장의 주어와 첫 동작은 ${josa(menu.short,"으로","로")} 쓰고(이유를 설명하는 문장은 발효·지방·산미·혀와 코의 감각 같은 원리가 주어여도 됩니다), 모든 음식 장면에서 ${josa(menu.short,"이","가")} 가장 크고 앞에 초점이 맞게 놓이게 하세요. 홍어·삼합을 억지로 끌어오지 마세요. 다른 메뉴는 글이 직접 말할 때만 곁들임으로 짧게 쓰세요.${noSamhap} 겉모습 참고: ${menu.lookKo}.`;
}

function sceneExamples(menu:StoreMenuItem|undefined):string {
  if(!menu||menu.id==="hongeo-hoe")return `"접시 위 홍어 살 단면", "초장 종지 옆 홍어 한 점", "막걸리 사발을 따르는 순간", "둘러앉은 식탁"`;
  return `"접시 위 ${menu.short} 가까이", "${menu.short} 옆에 놓인 ${menu.id==="baedari-makgeolli"?"미나리전 접시":"막걸리 사발"}", "둘러앉은 식탁 가운데 ${menu.short}"`;
}

// Shared by the plan route and the provider comparison script so both send the same instruction.
export function buildCarouselPlanPrompt(input:CarouselPlanInput):string {
  const parsed=parsePlanInput(input);
  const style=IMAGE_STYLE_DIRECTIONS[parsed.imageStyle??"photo"];
  const roles=rolesForCount(parsed.slideCount);
  const menu=carouselMenu(parsed);
  // 갈래가 있으면 이야기 구조·문체(글 길이)·디자인 안내를 갈래용으로 바꾸고 갈래 설명을 더한다(track.ts).
  const track=parsed.track?trackPromptRules(parsed.track):null;
  return [
    `한국 음식점 Instagram 캐러셀 구성안을 JSON 객체로 작성하세요. 선택한 주제 "${parsed.topic}"를 바꾸지 말고 모든 장면에 일관되게 반영하세요. 기존 이미지 설명: ${parsed.imageBrief ?? "없음"}. 내용 메모: ${parsed.contentBrief ?? "없음"}. slideCount는 ${parsed.slideCount}, slides의 role 순서는 ${roles.join(" → ")}를 정확히 지키세요.`,
    // 한 편의 이야기: 장마다 독립된 자랑을 나열하지 않고, 앞 장이 남긴 궁금증을 다음 장이 받는다.
    track?track.story:`[이야기 구조] ${parsed.slideCount}장은 한 사람이 친구에게 이 음식을 설명해 주는 한 편의 이야기입니다. 표지는 독자가 실제로 가질 법한 구체적인 궁금증 하나를 질문이나 한 문장으로 던지고, 각 본문 장은 앞 장이 남긴 궁금증에 답하면서 마지막 요점 한 줄로 다음 장의 내용을 예고하세요. 본문 장은 겉모습 묘사만 하지 말고 사람이 왜 그렇게 느끼는지 이유를 답하세요. 마지막 장은 첫 장의 궁금증이 어떻게 풀렸는지 한 줄 결론으로 닫으세요. ${NO_PROMO_IN_CARDS} 장마다 "우리 대단하죠" 식의 자랑이나 감탄으로 끝내지 말고, 정보가 한 방향으로 쌓이게 하세요.`,
    // 사람이 쓴 글처럼: 명사형 슬로건과 광고 상투어를 막고, 관찰 가능한 구체 정보로 쓴다.
    track?track.style:`[문체] headline과 points는 모두 가까운 사람에게 말하듯 자연스러운 해요체의 완결된 문장이나 질문으로 쓰세요. "~느껴보기", "~의 세계", "~한 세트", "~의 역사"처럼 명사로 끝나는 슬로건, "미식의 향연", "풍미 가득", "놓치지 마세요" 같은 광고 상투어, 느낌표 남발은 금지합니다. 각 headline은 짧은 한국어(12~30자)로 한 가지 정보만 전달하고 같은 뜻의 제목을 반복하지 마세요. 표지를 제외한 각 장에는 points 배열로 2~${SLIDE_POINT_MAX_COUNT}개의 요점을 넣으세요. 요점 하나는 한 줄(12~28자)로 headline을 반복하지 말고, "무엇이 어떻게 다른지" 눈이나 입으로 확인할 수 있는 구체적인 정보(차이점, 먹는 순서, 어울리는 조합, 확인할 점)를 쓰세요. 감각을 꾸미는 추상적 비유("입안의 리듬", "감촉을 선사") 대신 "얇게 썰면 결이 비쳐 보여요"처럼 관찰 그대로 쓰세요. 표지의 points는 빈 배열로 두세요. 표지 headline은 넘기고 싶게 만드는 짧은 훅(8~18자, 질문이나 한 문장)으로 쓰고, 그 설명은 subline(30자 이내 해요체 한 줄)에 넣으세요. 표지가 아닌 장의 subline은 빈 문자열로 두세요.`,
    `[사실 기준] 홍어의 향이 사라진다거나 누구나 좋아한다고 보장하지 마세요. 홍어회와 홍어무침·홍어애탕(그리고 홍어전·찜)의 조리법을 구분하세요. 선택 주제나 내용 메모에 삼합이 없으면 삼합 구성(홍어·수육·묵은지)을 쓰지 마세요. 삼합은 이 가게의 기본값이 아니라 여러 메뉴 가운데 하나입니다. 메뉴에 들어가는 재료와 곁들임 구성, 확인되지 않은 가격, 원산지, 영업시간, 매장 정보는 headline과 points 어디에도 만들지 마세요.${track?"":`\n${EXPLAIN_REASONS_RULE}`}`,
    // 글도 주제의 메뉴가 주인공: 곁들임이 문장을 이끌면 그림보다 글에서 먼저 주인공이 바뀐다. 과메기 주제면 과메기, 홍어 주제일 때만 홍어.
    heroRule(menu,[parsed.topic,parsed.contentBrief].filter(Boolean).join(" ")),
    // A vs B 장은 글로 말한 차이가 두 사진에서 보여야 한다. 코 모양처럼 썬 회 사진에 안 나오는 차이는 쓰지 않는다.
    // 갈래 게시물에는 비교(versus) 장이 없으므로 비교 장 규칙을 뺀다.
    ...(track?[]:[`[비교 장] layout이 versus인 장의 points는 두 사진을 나란히 놓았을 때 눈으로 보이는 차이(살의 색, 결의 굵기, 썬 모양, 윤기)만 쓰세요. 코 모양, 몸 전체 생김새처럼 썬 회 사진에 나오지 않는 차이는 쓰지 마세요. 두 visualPrompt는 같은 접시·각도·조명으로 맞추고, 쓰인 차이(예: 붉은빛 도는 홍어 살과 하얗고 투명한 가오리 살)가 한눈에 갈리도록 각 사진에 그 차이를 명시하세요.`]),
    // 장면 다양성: 같은 접시를 거리만 바꿔 다섯 번 찍지 않도록, 장면 유형과 사람 요소를 장마다 다르게 배정한다.
    `[장면] visualPrompt는 각 장의 headline과 points가 말하는 내용을 그대로 보여 주는 ${style.scene}으로 쓰세요. 각 visualPrompt에는 그 장의 글이 말하는 대상과 동작을 구체적으로 적으세요(예: ${sceneExamples(menu)}). 장마다 장면 유형을 다르게 고르세요: 완성된 한 상(45도), 위에서 본 상차림, 접시 위 질감(매크로), 곁들임과 함께 놓인 조합, 막걸리와 함께 놓인 식탁, 준비 과정, 함께 먹는 식탁(여러 손과 잔, 뒷모습). "젓가락으로 한 점을 집어 든" 장면은 한 게시물에 최대 한 장만 쓰고, 나머지 장은 접시·그릇·식탁 위에 놓인 모습으로 쓰세요. 손·잔·뒷모습 같은 사람 요소는 글이 먹는 동작이나 함께하는 자리를 말할 때만 넣고, 얼굴은 프레임 밖에 두거나 식별되지 않게 하세요. 촬영 거리, 각도, 피사체 배치가 앞 장과 겹치지 않게 쓰고 이미지 안 글자나 로고를 요청하지 마세요. 음식이 나오는 모든 장면에서 주제의 메뉴(${menu&&menu.id!=="hongeo-hoe"?menu.short:"홍어"})가 주인공입니다. visualPrompt에 그 메뉴를 가장 크고 앞에, 초점이 맞게 둔다고 명시하고, 다른 음식·술은 글이 말할 때만 작게 곁들여지는 조연으로 쓰세요. 집어 올리는 한입도 주인공 메뉴여야 합니다.`,
    photoRule(parsed.photoNotes),
    track?track.design:`[디자인] ${designCatalogText()}`,
    ...(track?[track.track]:[]),
    `styleAnchor에는 전 장이 공유할 색감, 조명, 그릇, 테이블 기준과 화풍(${style.anchor})만 쓰고 음식 이름은 쓰지 마세요(모든 장에 똑같이 붙으므로, 음식은 각 장 visualPrompt에만). 최상위에 design 객체(style, palette, theme, titleFont, bodyFont, tone, season)를 두고${track?"(값은 위 [디자인] 그대로)":"(tone은 잔칫상·제사·명절·기념일처럼 격식 있는 글이면 calm, 그 밖에는 loud. season은 아래 계절 소품 중 주제에 꼭 맞을 때만, 애매하면 none)"}, 각 slide는 role, headline, subline, points, visualPrompt, textPosition(top 또는 bottom), layout, keywords, figure, titleFont, bodyFont, variant(0)를 포함해야 합니다.`,
  ].join("\n");
}

// 실제 사진 캐러셀이면 사진에 보이는 것을 알려 주고, 사진으로 보여 줄 수 있는 글을 쓰게 한다. 사진 내용을 모르면 빈 문자열.
export function photoRule(notes:readonly string[]|undefined):string {
  if(!notes?.some(note=>note.trim()))return "";
  const list=notes.map((note,index)=>`${index+1}번${index===0?"(표지)":""}: ${note.trim()||"내용 모름"}`).join("; ");
  return `[실제 사진] 이 캐러셀은 사장님이 직접 찍은 사진 ${notes.length}장으로 만듭니다. 사진에 보이는 것 — ${list}. 표지는 1번 사진입니다. 각 장의 headline·points·visualPrompt는 이 사진들 가운데 하나로 보여 줄 수 있는 내용으로 쓰고, 어느 사진에도 없는 음식·술을 주인공으로 한 장은 만들지 마세요. 주제의 메뉴는 그대로 지키되 사진에 보이는 곁들임·사람 요소·장면을 활용하고, visualPrompt에는 그 장에 맞는 사진에 보이는 것을 그대로 적으세요. 사진 설명에 없는 사실(원산지, 가격, 양)은 지어내지 마세요.`;
}

export interface CarouselPlanAi {
  generate(input:CarouselPlanInput):Promise<unknown>;
}

// options.seed를 주면 캐러셀마다 레이아웃·색·글꼴을 섞는다(variety.ts). 화면에서 쓰는 구성안 경로는 매번 무작위 시드를 넘기고,
// 시드를 주지 않으면 섞지 않아 결과가 항상 같다(테스트·비교 스크립트용).
// 한 게시물에 "젓가락으로 집어 든 한 점" 장면은 한 장만. 이미지 모델이 가장 쉽게 그리는 장면이라, 구성안 AI가
// 여러 장에 쓰면 캐러셀이 같은 사진 다섯 장이 된다. 두 번째부터는 그 장의 글에서 장면을 다시 짓는다.
// "젓가락 없음"처럼 막는 말은 세지 않도록, 실제로 집어 드는 표현만 본다.
export const CHOPSTICK_SCENE=/젓가락으로|집어\s*(?:올|든|드)|집는|chopsticks?\s+(?:lift|hold|pick)/i;
// menu: 이 캐러셀의 주인공 메뉴(carouselMenu). 장 글과 주제 제목에 메뉴 이름이 없을 때 홍어로 넘어가지 않고 이 메뉴를 쓴다.
export function sceneFromCopy(slide:CarouselSlidePlan,topic:string,menu?:StoreMenuItem):string {
  const text=[slide.headline,...slide.points].join(" ");
  // 장 글과 주제에서 주인공 메뉴를 고른다. 홍어 조합(삼합·묵은지·수육)은 홍어 장면에서만 쓴다.
  const hero=heroMenu(text,topic)??menu;
  const skate=!hero||hero.id==="hongeo-hoe";
  const dish=skate?"홍어":hero.short;
  const subject=skate&&/삼합/.test(text)?"홍어·수육·묵은지를 겹친 삼합 한 입이 접시 위에 놓인 모습"
    :skate&&/(묵은지|김치)/.test(text)?"묵은지 잎에 홍어 한 점을 싸서 접시 위에 올려 둔 모습"
    :skate&&/수육/.test(text)?"홍어 접시 옆에 얇게 썬 수육이 함께 놓인 모습"
    :hero?.id==="baedari-makgeolli"?"사발에 뽀얀 막걸리를 따르는 순간, 병이 보여도 글자 없이"
    :/막걸리/.test(text)?`${dish} 접시 옆 사발에 막걸리를 따르는 순간`
    :skate&&/(향|숙성|삭)/.test(text)?"썬 홍어 살의 단면과 결이 보이게 접시에 가지런히 놓인 모습(낮은 각도 매크로)"
    :/(함께|여럿|모임|친구|가족)/.test(text)?`여럿이 둘러앉은 식탁 가운데 놓인 ${dish} 한 상, 사람은 손과 어깨까지만`
    :hero&&!skate?`${josa(hero.lookKo,"을","를")} 낮은 각도에서 가까이 담은 모습`
    :"홍어 접시와 곁들임이 놓인 식탁을 45도에서 담은 모습";
  return `${subject}. ${topic} 이야기의 "${slide.headline}" 장면. 음식은 접시 위에 놓여 있고 얼굴은 나오지 않음`.slice(0,600);
}
export function limitChopstickScenes(plan:CarouselPlan,topic:string,menu?:StoreMenuItem):CarouselPlan {
  let seen=false;
  return {...plan,slides:plan.slides.map(slide=>{
    if(!CHOPSTICK_SCENE.test(slide.visualPrompt))return slide;
    if(!seen){seen=true;return slide;}
    return {...slide,visualPrompt:sceneFromCopy(slide,topic,menu)};
  })};
}

// 장면이 그 게시물의 메뉴를 벗어나지 않게(sceneFoods.ts). 과메기·미나리전·막걸리처럼 홍어가 아닌 메뉴 이야기에서
// 장 글(제목·요점)에 없는 홍어·삼합·수육·묵은지가 장면 설명에만 들어 있으면, 그 장의 글로 장면을 다시 짓는다.
// 전 장 공통 스타일(styleAnchor)에서는 음식 이름을 걷어 내 색·빛·그릇·테이블만 남긴다(모든 장에 실려 가므로).
// menu: 이 캐러셀의 주인공 메뉴(carouselMenu: 주제·내용 메모·이미지 설명). 주지 않으면 주제에서만 찾는다.
export function keepScenesOnMenu(plan:CarouselPlan,topic:string,menu:StoreMenuItem|undefined=mainMenuOf(topic)):CarouselPlan {
  const topicMenu=menu;
  return {...plan,styleAnchor:foodFreeAnchor(plan.styleAnchor),slides:plan.slides.map(slide=>{
    if(!isOtherMenu(topicMenu)||!SKATE_TABLE.test(slide.visualPrompt))return slide;
    if(copyMentionsSkate([slide.headline,...slide.points].join(" ")))return slide;
    return {...slide,visualPrompt:sceneFromCopy(slide,topic,topicMenu)};
  })};
}

// onFallback: AI 구성안을 못 써서 기본 문안으로 넘어갈 때 그 이유(오류)를 받는다. 예전에는 이유를 버려 로그에도 남지 않았다.
// 갈래가 있으면 무작위 섞기 대신 갈래 규칙(applyTrack)으로 디자인·장마다 사진 수를 정한다.
// AI 구성안의 글 길이는 여기서 줄이지 않는다: 검수 AI가 원래 문장을 보고 고치고, 글 맞추기는 plan 경로 마지막에 한 번만 한다
// (예전에는 여기서 먼저 잘라서 검수가 잘린 문장만 봤다 — 검수 보고서 B-2). 기본 문안은 검수를 거치지 않으므로 바로 맞춘다.
export async function planCarousel(input:CarouselPlanInput,ai?:CarouselPlanAi,options:{seed?:number;onFallback?:(error:unknown)=>void}={}):Promise<CarouselPlan> {
  const parsed=parsePlanInput(input);
  const fallback=createFallbackCarouselPlan(parsed);
  const vary=(plan:CarouselPlan,isFallback:boolean)=>parsed.track?applyTrack(plan,parsed.track,{copy:isFallback}):options.seed===undefined?plan:diversifyCarouselDesign(plan,options.seed,{fallback:isFallback});
  if(!ai)return vary(fallback,true);
  try {
    const plan=CarouselPlanSchema.parse(await ai.generate(parsed));
    // 갈래 없는 요청에 AI가 갈래 전용 계열(사진 중심·글 중심)을 적어 오면(안내문에는 없다) 기본 템플릿으로 보고 예전처럼 고른다.
    const chosen=!parsed.track&&TRACK_STYLES.has(plan.design.style)?{...plan,design:{...plan.design,style:"template" as const}}:plan;
    if(plan.slideCount===parsed.slideCount){const menu=carouselMenu(parsed);return vary(keepScenesOnMenu(limitChopstickScenes(normalizeCarouselDesign(chosen),parsed.topic,menu),parsed.topic,menu),false);}
    options.onFallback?.(new Error("wrong slide count"));
    return vary(fallback,true);
  } catch(error) {
    options.onFallback?.(error);
    return vary(fallback,true);
  }
}

// AI가 표지와 본문의 레이아웃을 바꿔 골랐으면 역할에 맞게 바로잡는다. 구성안 전체를 버리는 것보다 낫다.
export function normalizeCarouselDesign(plan:CarouselPlan):CarouselPlan {
  return {...plan,slides:plan.slides.map(slide=>({...slide,layout:normalizeCardLayout(slide)}))};
}
