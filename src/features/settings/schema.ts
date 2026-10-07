import { z } from "zod";

export const AppSettingsSchema = z.object({
  carouselSlideCount: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]),
  imageMode: z.enum(["photo-first", "mixed", "ai-first"]),
  imageCandidateCount: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  imageAspectRatio: z.enum(["4:5", "1:1", "9:16"]),
  copyLength: z.enum(["short", "medium", "detailed"]),
  textAiProvider: z.enum(["automatic", "gemini", "groq", "cloudflare"]),
  imageAiProvider: z.enum(["automatic", "higgsfield", "cloudflare", "openai"]),
  imageQuality: z.enum(["medium","high"]).default("medium"),
  // 브랜드 키트: 카드 바닥글에 가게 이름과 함께 찍을 Instagram 계정. 비우면 가게 이름만 찍는다. "@"는 있어도 없어도 된다.
  brandHandle: z.string().trim().regex(/^@?[A-Za-z0-9._]{0,30}$/, "영문·숫자·밑줄·점으로 된 계정 아이디만 쓸 수 있어요.").default(""),
  // 원격 누끼: 로컬 누끼가 어려운 사진만 Higgsfield 배경 제거로 보낸다(컬러 블록·팝업북·키치). 크레딧이 들어 기본은 꺼짐.
  // 예전에 저장된 설정에는 이 칸이 없으므로 default로 채워 읽는다.
  remoteCutout: z.boolean().default(false),
  // 원격 누끼 월 예산(크레딧). 이번 달 사용량이 이 값에 닿으면 부르지 않고 로컬 누끼로 그린다.
  remoteCutoutMonthlyCredits: z.number().int().min(0).max(200).default(20),
  aiModelMode: z.enum(["automatic", "manual"]),
  preserveOriginals: z.boolean(),
  blockUnverifiedClaims: z.boolean(),
  recheckOnStoreChange: z.boolean(),
});

export const StoreProfileSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().min(1),
  hours: z.string().min(1),
  closedDays: z.string().min(1),
  placeUrl: z.string().url(),
  verifiedAt: z.string().date(),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type StoreProfile = z.infer<typeof StoreProfileSchema>;
