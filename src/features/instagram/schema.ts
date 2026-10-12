import { z } from "zod";

export const InstagramScopeSchema=z.enum(["instagram_business_basic","instagram_business_content_publish","instagram_business_manage_insights"]);

export const InstagramConnectionSchema=z.object({
  instagramUserId:z.string().min(1),
  username:z.string().min(1),
  accessToken:z.string().min(1),
  expiresAt:z.string().datetime(),
  scopes:z.array(InstagramScopeSchema),
  connectedAt:z.string().datetime(),
  updatedAt:z.string().datetime(),
});

export const PublicationSchema=z.object({
  draftId:z.string().uuid(),
  status:z.enum(["preparing","published","failed"]),
  containerId:z.string().nullable(),
  mediaId:z.string().nullable(),
  safeError:z.string().nullable(),
  attemptedAt:z.string().datetime(),
  publishedAt:z.string().datetime().nullable(),
});

export type InstagramConnection=z.infer<typeof InstagramConnectionSchema>;
export type Publication=z.infer<typeof PublicationSchema>;
export type PublicInstagramConnection={connected:boolean;username?:string;expiresAt?:string;needsReconnect?:boolean;insights?:boolean};
