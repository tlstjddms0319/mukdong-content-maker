import { z } from "zod";

// manage_insights: 앱이 올린 게시물의 반응(도달·저장·공유·좋아요·댓글)을 읽는다(insights.ts). 이 권한 없이 연결한 예전 연결도 그대로 읽힌다.
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
// insights: 반응을 자동으로 가져올 권한이 있는지(없으면 화면이 "한 번 다시 연결"을 안내한다).
export type PublicInstagramConnection={connected:boolean;username?:string;expiresAt?:string;needsReconnect?:boolean;insights?:boolean};
