import { z } from "zod";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH } from "./carousel";

// "장 고치기 → 새 장 넣기"에서 사장님이 적은 글을 "카드 문구"가 아니라 "이런 장을 만들어 줘"라는 요청으로 읽는다.
// 예전에는 적은 글을 그대로 카드 제목·요점으로 박고, 사진 장면도 "제목 — 주제 장면"으로만 지어서
// "묵동홍어마을을 홍보하는 마지막 카드를 넣을 거야, 로고와 캐릭터가 나오면 좋겠어" 같은 요청이
// 그대로 카드에 찍히고 사진은 늘 젓가락으로 홍어를 든 장면이 나왔다.
// 여기서는 문안 AI에게 요청을 주고 카드 제목·요점·사진 장면을 새로 짓게 한다. AI가 없거나 실패하면 규칙으로 짓는다.

export const SlideRequestSchema=z.object({
  topic:z.string().trim().min(1).max(200),
  request:z.string().trim().min(1).max(400),        // 사장님이 적은 제목칸+요점칸을 합친 글
  previous:z.string().trim().max(200).default(""),  // 바로 앞 장 제목(이야기 흐름을 잇기 위해)
  next:z.string().trim().max(200).default(""),      // 바로 뒤 장 제목
  source:z.enum(["photo","ai","text"]),
});
export type SlideRequest=z.input<typeof SlideRequestSchema>;

// kind: store면 가게 홍보 카드(마지막 홍보 카드 디자인)로 그리는 게 맞는 요청이다.
export const SlideDraftSchema=z.object({
  kind:z.enum(["content","store"]),
  headline:z.string().trim().min(2).max(30),
  points:z.array(z.string().trim().min(2).max(SLIDE_POINT_MAX_LENGTH)).max(SLIDE_POINT_MAX_COUNT),
  visualPrompt:z.string().trim().min(12).max(400),
  keywords:z.array(z.string().trim().min(1).max(12)).max(3),
});
export type SlideDraft=z.infer<typeof SlideDraftSchema>;

// 가게 홍보·로고·캐릭터를 원하는 요청. 이런 장은 음식 사진보다 홍보 카드(낙관·가게 이름·마스코트)가 맞다.
const STORE_INTENT=/홍보|로고|캐릭터|마스코트|가게\s*(?:소개|알리|이름)|우리\s*가게|묵동\s*홍어\s*마을(?:을|를|로|에서)?\s*(?:알리|소개|홍보)/;
// 카드 문구가 아니라 요청처럼 쓴 글: "~해줘·~좋겠어·~넣을 거야·~만들어" 같은 말로 끝나거나 들어 있다.
const INSTRUCTION=/(?:해\s*줘|해\s*주세요|좋겠|넣을\s*거|넣어|만들어|나오면|들어가면|보여\s*줘|추가해|바꿔)/;
export const looksLikeRequest=(text:string)=>INSTRUCTION.test(text)||STORE_INTENT.test(text);
export const wantsStoreCard=(text:string)=>STORE_INTENT.test(text);

export function buildSlideRequestPrompt(input:z.output<typeof SlideRequestSchema>):string {
  return [
    `한국 음식점 "묵동홍어마을"의 Instagram 캐러셀(주제: "${input.topic}")에 장을 하나 새로 넣습니다. 사장님이 적은 요청은 다음과 같습니다(따옴표 안은 요청이지 카드에 그대로 쓸 문구가 아닙니다): "${input.request}".`,
    input.previous||input.next?`앞 장 제목: "${input.previous||"없음"}", 뒤 장 제목: "${input.next||"없음"}". 앞뒤 흐름에 자연스럽게 이어지게 쓰세요.`:"",
    "요청을 읽고 그 장에 들어갈 카드 문구와 사진 장면을 JSON으로 작성하세요.",
    `- kind: 요청이 가게 홍보·로고·캐릭터(마스코트)·가게 소개 카드를 원하면 "store", 그 밖에는 "content".`,
    `- headline: 카드 제목. 가까운 사람에게 말하듯 자연스러운 해요체 한 문장(8~24자). 요청 문장을 그대로 옮기지 마세요("~할 거야", "~좋겠어" 같은 말 금지).`,
    `- points: 요점 0~${SLIDE_POINT_MAX_COUNT}개, 하나는 한 줄(${SLIDE_POINT_MAX_LENGTH}자 이내) 해요체. 요청에 있는 구체적인 내용만 쓰고, 확인되지 않은 가격·영업시간·주소·원산지·효능은 만들지 마세요.`,
    `- visualPrompt: 이 장 사진(또는 그림)의 장면을 한국어로 구체적으로(대상·동작·구도). 요청이 말하는 음식과 장면을 그대로 보여 주고, 젓가락으로 한 점을 집어 든 모습은 요청이 그걸 말할 때만. 얼굴은 나오지 않게. 이미지 속 글자·로고 요청 금지.`,
    `- keywords: 이 장을 대표하는 2~6자 키워드 1~3개.`,
  ].filter(Boolean).join("\n");
}

// AI가 없거나 실패했을 때. 요청처럼 보이면 요청 말투를 걷어 낸 안전한 문구로, 아니면 적은 글을 문구로 쓴다.
export function fallbackSlideDraft(input:z.output<typeof SlideRequestSchema>):SlideDraft {
  const lines=input.request.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  if(wantsStoreCard(input.request)){
    return {kind:"store",headline:"묵동홍어마을에서 만나요",points:["저장해 두고 다시 보세요"],visualPrompt:"묵동홍어마을의 따뜻한 식탁 한 상을 45도에서 담은 장면. 얼굴 없음",keywords:["묵동홍어마을"]};
  }
  if(looksLikeRequest(input.request)){
    // 요청 말투("~해줘") 그대로는 카드에 쓰지 않는다. 주제를 제목으로 받아 쓴다.
    return {kind:"content",headline:input.topic.slice(0,30),points:[],visualPrompt:`${input.topic} 장면. ${input.request}`.slice(0,400),keywords:[]};
  }
  const [headline="",...rest]=lines;
  return {
    kind:"content",headline:headline.slice(0,30)||input.topic.slice(0,30),
    points:rest.map(point=>point.slice(0,SLIDE_POINT_MAX_LENGTH)).slice(0,SLIDE_POINT_MAX_COUNT),
    visualPrompt:`${headline} — ${input.topic} 장면, 묵동홍어마을의 한 상. 얼굴 없음`.slice(0,400),keywords:[],
  };
}
