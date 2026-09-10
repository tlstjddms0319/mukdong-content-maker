import { z } from "zod";

export const AppSettingsSchema = z.object({
  imageMode: z.enum(["photo-first", "mixed", "ai-first"]),
  imageCandidateCount: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  imageAspectRatio: z.enum(["4:5", "1:1", "9:16"]),
  copyLength: z.enum(["short", "medium", "detailed"]),
  aiProvider: z.literal("openai"),
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
