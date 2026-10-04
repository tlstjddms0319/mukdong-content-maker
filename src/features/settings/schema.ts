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
