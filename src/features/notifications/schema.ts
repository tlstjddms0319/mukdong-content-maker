import { z } from "zod";

// 휴대폰 알림(웹 푸시) 설정과 상태. 한 파일(notifications/state.json)에 같이 둔다.

// 사장님이 고르는 알림 설정. 기본값: 화·금 오전 10시에 "올리는 날" 알림, 5일째 새 글이 없으면 알림, 게시 결과·연결 알림 켬.
export const NotificationPrefsSchema=z.object({
  makeDay:z.boolean().default(true),
  weekdays:z.array(z.number().int().min(0).max(6)).max(7).default([2,5]),
  hour:z.number().int().min(7).max(21).default(10),
  quietDays:z.number().int().min(0).max(30).default(5), // 0이면 끔
  publishResults:z.boolean().default(true),
  connection:z.boolean().default(true),
});
export type NotificationPrefs=z.infer<typeof NotificationPrefsSchema>;
export const DEFAULT_NOTIFICATION_PREFS:NotificationPrefs=NotificationPrefsSchema.parse({});

// 브라우저 PushSubscription.toJSON() 모양. label은 어느 기기인지 사장님이 알아보게 남기는 짧은 이름.
export const PushSubscriptionSchema=z.object({
  endpoint:z.string().url().max(2000),
  keys:z.object({p256dh:z.string().min(1).max(200),auth:z.string().min(1).max(100)}),
  label:z.string().max(80).optional(),
  createdAt:z.string().datetime(),
});
export type StoredPushSubscription=z.infer<typeof PushSubscriptionSchema>;

export const NotificationStateSchema=z.object({
  prefs:NotificationPrefsSchema.default(DEFAULT_NOTIFICATION_PREFS),
  subscriptions:z.array(PushSubscriptionSchema).max(10).default([]),
  // 이미 보낸 알림(키 → 보낸 시각). 같은 알림을 두 번 보내지 않게 한다. 오래된 것은 지운다.
  sent:z.record(z.string(),z.string()).default({}),
});
export type NotificationState=z.infer<typeof NotificationStateSchema>;

export type PushMessage={key:string;title:string;body:string;url:string};
