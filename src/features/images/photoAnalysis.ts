import { z } from "zod";
import { mainMenuOf, menuOf, type StoreMenuItem } from "@/features/store/menu";

// 사장님 사진 표지 추천(/api/images/analyze)의 요청·응답 모양과 순서 정하기.
// 화면(PhotoCarouselStudio)과 서버가 함께 쓰므로 sharp·server-only를 넣지 않는다.

export const MAX_ANALYZE_PHOTOS=10;
const DATA_URL=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

// 사진 하나: 보관함 id(서버가 저장된 미리보기·품질을 읽는다) 또는 data URL(보관함에 없는 사진).
export const AnalyzePhotoSchema=z.object({
  id:z.string().min(1).max(80),
  image:z.string().max(8_000_000).regex(DATA_URL).optional(),
});
export const AnalyzeRequestSchema=z.object({
  photos:z.array(AnalyzePhotoSchema).min(1).max(MAX_ANALYZE_PHOTOS)
    .refine(photos=>new Set(photos.map(photo=>photo.id)).size===photos.length,"사진이 중복됐어요."),
  // true면 Gemini로 식욕 점수까지 매긴다(비용이 드는 호출이라 사장님이 버튼을 눌렀을 때만 보낸다).
  score:z.boolean().default(false),
  // 기대 음식을 고르는 데 쓰는 주제(없으면 홍어회).
  topic:z.string().max(200).optional(),
});
export type AnalyzeRequest=z.input<typeof AnalyzeRequestSchema>;

const QualityFlagSchema=z.enum(["dark","blurry","cast","lowres"]);
export const AnalyzedPhotoSchema=z.object({
  id:z.string(),
  flags:z.array(QualityFlagSchema),   // 로컬 품질 검사(무료). 잴 수 없었으면 빈 배열과 measured:false
  labels:z.array(z.string()),         // 화면 배지 문구(PHOTO_QUALITY_LABELS)
  measured:z.boolean(),
  // Gemini 식욕 점수. 점검하지 않았거나 실패했으면 null.
  // 가로로 충분히 긴 사진인지(표지+2장 파노라마에 쓸 수 있는지, render/panorama.ts). 잴 수 없었으면 false.
  wide:z.boolean().default(false),
  // 사진 속 음식(보관함 이름·태그 또는 AI 점검으로 안 것, 짧은 한국어). 모르면 null.
  food:z.string().nullable().default(null),
  // 글의 메뉴와 사진 속 음식이 다를 때의 안내 문구(예: "과메기 글인데 삼합 사진이에요"). 맞거나 모르면 null.
  mismatch:z.string().nullable().default(null),
  appetite:z.object({
    score:z.number(),appetite:z.number(),lighting:z.number(),composition:z.number(),
    warnings:z.array(z.string()),note:z.string(),
  }).nullable(),
});
export type AnalyzedPhoto=z.infer<typeof AnalyzedPhotoSchema>;
export const AnalyzeResponseSchema=z.object({
  analyzed:z.literal(true),
  photos:z.array(AnalyzedPhotoSchema),      // 요청 순서 그대로
  ranking:z.array(z.string()),              // 표지로 좋은 순서(사진 id). 화면은 이 순서로 사진을 바꾸지 않는다.
  recommended:z.string().nullable(),        // "표지로 추천" 사진 id. 쓸 만한 사진이 없으면 null
  scored:z.boolean(),                       // Gemini 점수가 하나라도 붙었는가
  scoreAvailable:z.boolean(),               // Gemini 키가 있어 "맛있어 보이는 사진 찾기"를 쓸 수 있는가
  message:z.string().optional(),
});
export type AnalyzeResponse=z.infer<typeof AnalyzeResponseSchema>;

// 표지 순위 점수. 로컬 품질 문제는 크게(어둡고 흔들린 사진은 표지로 못 쓴다), Gemini 점수가 있으면 그것을 더한다.
// coverRank(1~10쯤)가 있으면 그 값이 순서를 거의 정하고, 없으면 품질 문제가 적은 사진이 앞선다.
const FLAG_PENALTY:Record<z.infer<typeof QualityFlagSchema>,number>={dark:4,blurry:4,cast:1.5,lowres:1};
export function photoRank(photo:{flags:ReadonlyArray<z.infer<typeof QualityFlagSchema>>},rank?:number|null):number {
  return (rank??5)-photo.flags.reduce((sum,flag)=>sum+FLAG_PENALTY[flag],0);
}

// 순위가 같으면 원래 순서(사장님이 둔 순서)를 지킨다.
export function rankPhotos(items:Array<{id:string;rank:number}>):string[] {
  return items.map((item,index)=>({...item,index})).sort((a,b)=>b.rank-a.rank||a.index-b.index).map(item=>item.id);
}

// ── 사진·메뉴 불일치(과메기 글에 삼합 사진) ─────────────────────────────────────────────
// 보관함 사진의 이름·태그에서 음식을 읽는다. 단 자동으로 붙은 태그는 믿지 않는다:
//  - "주제:…" 태그: 사진을 올릴 때 그때 쓰던 글의 주제를 붙인 것(사진 속 음식과 무관할 수 있다)
//  - 예전 자동 태그: 주제 문장을 24자로 자른 긴 태그(띄어쓰기 여럿·물음표). 사장님이 직접 단 태그는 보통 짧은 낱말이다.
// "음식:…" 태그는 AI 점검이 사진을 보고 붙인 것이라 가장 먼저 믿는다.
export const TOPIC_TAG="주제:";
export const FOOD_TAG="음식:";
const trustedTag=(tag:string)=>!tag.startsWith(TOPIC_TAG)&&!/[?？]/.test(tag)&&tag.length<=12&&tag.split(/\s+/).length<=2;
export function photoFoodText(asset:{name:string;tags:readonly string[]}):string {
  const ai=asset.tags.filter(tag=>tag.startsWith(FOOD_TAG)).map(tag=>tag.slice(FOOD_TAG.length));
  if(ai.length)return ai.join(" ");
  return [asset.name,...asset.tags.filter(trustedTag)].join(" ");
}
// 사진 속 음식(술 제외). 홍어회 가운데 삼합이라고 적힌 사진은 "삼합"으로 부른다.
export function photoFoodOf(text:string):{menu:StoreMenuItem;label:string}|null {
  const menu=menuOf(text).find(item=>item.category!=="술");
  if(!menu)return null;
  return {menu,label:menu.id==="hongeo-hoe"&&/삼합/.test(text)?"삼합":menu.short};
}
// 글의 주인공 메뉴와 사진 속 음식이 다르면 안내 문구. 글이 술(막걸리) 이야기면 어떤 안주 사진이든 어울려 경고하지 않는다.
// 글에서 메뉴를 못 찾거나 사진 속 음식을 모르면 null(괜히 겁주지 않는다).
export function menuMismatch(topic:string|undefined,photoText:string):{label:string;message:string}|null {
  const topicMenu=mainMenuOf(topic);
  if(!topicMenu||topicMenu.category==="술")return null;
  const food=photoFoodOf(photoText);
  if(!food||food.menu.id===topicMenu.id)return null;
  return {label:food.label,message:`${topicMenu.short} 글인데 ${food.label} 사진이에요`};
}
