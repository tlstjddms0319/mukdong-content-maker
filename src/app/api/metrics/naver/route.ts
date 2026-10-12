import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createMetricsStore } from "@/features/metrics/store";
import { NaverPeriodSchema,findOverlap } from "@/features/metrics/naver";

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});

export async function GET(){ const denied=await ownerApiError(); if(denied)return denied;
  return json(await createMetricsStore().readNaver());
}

// 같은 id면 고치고, 없으면 더한다. 다른 기록과 날짜가 겹치면 거절한다(비교가 틀어진다).
export async function PUT(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const parsed=z.object({period:NaverPeriodSchema}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return json({error:parsed.error.issues[0]?.message??"기록 값을 확인해 주세요."},400);
  const store=createMetricsStore(),list=await store.readNaver(),period=parsed.data.period;
  const overlap=findOverlap(list,period);
  if(overlap)return json({error:`${overlap.start}~${overlap.end} 기록과 날짜가 겹쳐요.`},409);
  return json(await store.saveNaver([...list.filter(p=>p.id!==period.id),period]));
}

export async function DELETE(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const id=new URL(request.url).searchParams.get("id");
  const store=createMetricsStore();
  return json(await store.saveNaver((await store.readNaver()).filter(p=>p.id!==id)));
}
