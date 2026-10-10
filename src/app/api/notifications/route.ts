import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { readNotificationState, readVapidKeys, updateNotificationState } from "@/features/notifications/repository";
import { NotificationPrefsSchema } from "@/features/notifications/schema";

// 휴대폰 알림 설정: 서명 공개키(구독할 때 필요), 알림 설정, 알림을 받는 기기 목록.
function privateJson(body:unknown,init?:ResponseInit){const headers=new Headers(init?.headers);headers.set("Cache-Control","no-store");return NextResponse.json(body,{...init,headers});}

export async function GET(){ const denied=await ownerApiError(); if(denied)return denied;
  const [state,keys]=await Promise.all([readNotificationState(),readVapidKeys()]);
  return privateJson({publicKey:keys.publicKey,prefs:state.prefs,devices:state.subscriptions.map(item=>({endpoint:item.endpoint,label:item.label,createdAt:item.createdAt}))});
}

export async function PUT(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=NotificationPrefsSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return privateJson({error:"알림 설정 값을 확인해 주세요."},{status:400});
  const state=await updateNotificationState(current=>({...current,prefs:parsed.data}));
  return privateJson({prefs:state.prefs});
}
