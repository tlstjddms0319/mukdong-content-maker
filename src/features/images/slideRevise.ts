import { z } from "zod";
import { SLIDE_POINT_MAX_COUNT, SLIDE_POINT_MAX_LENGTH } from "./carousel";
import { CarouselTrackSchema, TRACK_COPY } from "./track";

// 확인 화면 "이 장 고치기": 예전 "이 장 다시 만들기"는 무엇이 마음에 안 드는지 말할 곳이 없어,
// 원하는 결과가 나올 때까지 같은 버튼을 계속 누르는 수밖에 없었다(사장님 요청 2026-10-09).
// 이제는 그림/글 중 고칠 것을 고르고, 자주 쓰는 요청 버튼(여러 개 고를 수 있음)과 직접 적은 말로 어떻게 고칠지 알려 준다.
//   - 그림: 요청을 그림 AI에 "사용자의 수정 요청(가장 우선)"으로 넘긴다(ImageBrief.refinement, openaiRequest.ts).
//   - 글: 글 AI가 그 장의 제목·짧은 글만 고쳐 주고, 카드는 같은 밑바탕으로 글자만 다시 그린다(이미지 AI 비용 없음).
// 화면 코드에서도 쓰므로 서버 전용 모듈을 불러오지 않는다.

// 자주 쓰는 요청 버튼. label은 화면 글자, ask는 AI에게 넘기는 말.
export type SlideFixOption={id:string;label:string;ask:string};
export const PICTURE_FIXES:readonly SlideFixOption[]=[
  {id:"bigger",label:"음식을 더 크게",ask:"음식을 화면에 더 크게, 가까이 담아 주세요"},
  {id:"brighter",label:"더 밝고 먹음직스럽게",ask:"더 밝고 따뜻한 빛으로, 먹음직스럽게 담아 주세요"},
  {id:"angle",label:"다른 구도로",ask:"지금과 다른 각도·구도로 담아 주세요"},
  {id:"no-hands",label:"손·젓가락 없이",ask:"손과 젓가락이 나오지 않게 해 주세요"},
  {id:"sides",label:"막걸리·반찬도 보이게",ask:"막걸리 사발과 곁들임 반찬도 함께 보이게 해 주세요"},
];
export const TEXT_FIXES:readonly SlideFixOption[]=[
  {id:"shorter",label:"더 짧게",ask:"더 짧게 줄여 주세요"},
  {id:"easier",label:"더 쉬운 말로",ask:"어르신도 바로 알아듣는 쉬운 말로 바꿔 주세요"},
  {id:"why",label:"이유를 더 구체적으로",ask:"왜 그런지 이유나 확인하는 방법을 구체적으로 써 주세요"},
  {id:"answer",label:"질문 말고 답으로",ask:"제목을 질문이 아니라 이 장이 알려 주는 답(핵심 사실)으로 써 주세요"},
  {id:"no-ad",label:"광고 같은 말 빼기",ask:"광고 같은 과장된 말을 빼고 담백하게 써 주세요"},
];
export const SLIDE_FIX_NOTE_MAX=200;

// 고른 버튼과 직접 적은 말을 한 줄 요청으로 합친다(그림 AI의 refinement는 300자까지). 아무것도 없으면 "".
export function slideFixRequest(options:readonly SlideFixOption[],picked:readonly string[],note:string):string {
  const asks=options.filter(option=>picked.includes(option.id)).map(option=>option.ask);
  const typed=note.trim().slice(0,SLIDE_FIX_NOTE_MAX);
  return [...asks,...(typed?[typed]:[])].join(". ").slice(0,300);
}

// 글 고치기 요청(서버 /api/images/slide/revise).
export const SlideReviseSchema=z.object({
  topic:z.string().trim().min(1).max(200),
  headline:z.string().trim().min(1).max(60),
  points:z.array(z.string().trim().max(80)).max(SLIDE_POINT_MAX_COUNT).default([]),
  request:z.string().trim().min(1).max(300),
  previous:z.string().trim().max(200).default(""),
  next:z.string().trim().max(200).default(""),
  cover:z.boolean().default(false),
  // 표지 질문(본문 장을 고칠 때). 고친 제목도 이 질문에 답하는 흐름을 지키게 한다(큰 글씨만 훑는 독자).
  question:z.string().trim().max(120).default(""),
  // 이 장의 속 글(구성안 notes). 고친 글이 원래 근거·뜻을 잃지 않게 참고로 준다.
  notes:z.string().trim().max(900).default(""),
  track:CarouselTrackSchema.optional(),
});
export type SlideReviseInput=z.input<typeof SlideReviseSchema>;
// 글 AI가 돌려주는 모양. 제목 42자·짧은 글 40자는 "글자 직접 고치기"와 같은 상한이다(카드 그리기에서 한 번 더 맞춘다).
export const SlideReviseResultSchema=z.object({
  headline:z.string().trim().min(2).max(42),
  points:z.array(z.string().trim().min(2).max(SLIDE_POINT_MAX_LENGTH)).max(SLIDE_POINT_MAX_COUNT),
});
export type SlideReviseResult=z.infer<typeof SlideReviseResultSchema>;

export function buildSlideRevisePrompt(input:z.output<typeof SlideReviseSchema>):string {
  // 갈래가 있으면 그 갈래의 글 길이 목표를 함께 준다(카드에서 잘리지 않게).
  const rule=input.track?TRACK_COPY[input.track]:undefined;
  const length=input.cover
    ?`표지 제목 ${TRACK_COPY.cover.headline}자 안팎, points는 빈 배열`
    :rule?`제목 ${rule.headline}자 안팎, 짧은 글 ${rule.points}개 이하·각 ${rule.point}자 안팎`:`제목 8~30자, 짧은 글 ${SLIDE_POINT_MAX_COUNT}개 이하·각 ${SLIDE_POINT_MAX_LENGTH}자 이내`;
  return [
    `한국 음식점 "묵동홍어마을"의 Instagram 캐러셀(주제: "${input.topic}") 가운데 ${input.cover?"표지":"한 장"}의 글을 사장님 요청대로 고칩니다.`,
    `지금 글 — 제목: "${input.headline}"${input.points.length?`, 짧은 글: ${input.points.map(point=>`"${point}"`).join(", ")}`:""}.`,
    input.previous||input.next?`앞 장 제목: "${input.previous||"없음"}", 뒤 장 제목: "${input.next||"없음"}". 앞뒤 흐름에 자연스럽게 이어지게 쓰세요.`:"",
    `사장님 요청(따옴표 안은 요청이지 카드에 그대로 쓸 문구가 아닙니다): "${input.request}".`,
    !input.cover&&input.question?`표지 질문은 "${input.question}"입니다. 고친 제목도 이 질문에 답하는 이유·근거(마지막 장이면 결론)여야 하고, 짧은 글은 그 제목을 뒷받침하는 내용만 쓰세요.`:"",
    input.notes?`이 장의 속 글(카드에 안 보이는 자세한 설명, 참고 데이터): "${input.notes}". 고친 글도 이 설명의 핵심 하나를 짧게 담으세요.`:"",
    "규칙:",
    "- 요청한 부분만 고치고, 요청과 상관없는 정보는 지금 글의 뜻을 그대로 살리세요.",
    "- 가까운 사람에게 말하듯 자연스러운 해요체 완결 문장으로 쓰세요. 요청 말투(\"~해 줘\", \"~좋겠어\")를 카드에 옮기지 마세요.",
    "- 확인되지 않은 가격·영업시간·주소·원산지·효능, \"최고\" 같은 단정·과장은 만들지 마세요.",
    `- 길이: ${length}. 넘치면 카드에서 빠집니다.`,
    `JSON으로만 답하세요: {"headline":"…","points":["…"]}`,
  ].filter(Boolean).join("\n");
}
