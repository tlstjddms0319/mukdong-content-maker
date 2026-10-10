import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { updateNotificationState } from "@/features/notifications/repository";
import { PushSubscriptionSchema } from "@/features/notifications/schema";

// 이 기기에서 알림 받기(구독 저장)·그만 받기(구독 삭제). 같은 주소(endpoint)는 한 번만 저장한다.
function privateJson(body:unknown,init?:ResponseInit){const headers=new Headers(init?.headers);headers.set("Cache-Control","no-store");return NextResponse.json(body,{...init,headers});}

const SubscribeSchema=z.object({subscription:PushSubscriptionSchema.omit({createdAt:true,label:true}),label:z.string().max(80).optional()});
const UnsubscribeSchema=z.object({endpoint:z.string().url()});
const MAX_DEVICES=10;

export async function POST(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=SubscribeSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success||!parsed.data.subscription.endpoint.startsWith("https://"))return privateJson({error:"알림 등록 정보를 읽지 못했어요. 다시 눌러 주세요."},{status:400});
  const {subscription,label}=parsed.data;
  const state=await updateNotificationState(current=>{
    const others=current.subscriptions.filter(item=>item.endpoint!==subscription.endpoint);
    // 기기가 너무 많으면 가장 오래된 것부터 뺀다.
    const kept=others.slice(Math.max(0,others.length-(MAX_DEVICES-1)));
    return {...current,subscriptions:[...kept,{...subscription,...(label?{label}:{}),createdAt:new Date().toISOString()}]};
  });
  return privateJson({devices:state.subscriptions.length});
}

export async function DELETE(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=UnsubscribeSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return privateJson({error:"알림 해제 정보를 읽지 못했어요."},{status:400});
  const state=await updateNotificationState(current=>({...current,subscriptions:current.subscriptions.filter(item=>item.endpoint!==parsed.data.endpoint)}));
  return privateJson({devices:state.subscriptions.length});
}
