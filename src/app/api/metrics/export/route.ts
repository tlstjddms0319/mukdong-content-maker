import { ownerApiError } from "@/features/auth/guard";
import { createMetricsStore } from "@/features/metrics/store";
import { toCsv } from "@/features/metrics/csv";
import { isDate,kstToday } from "@/features/metrics/dates";

export async function GET(request:Request){ const denied=await ownerApiError(); if(denied)return denied;
  const params=new URL(request.url).searchParams;
  const from=isDate(params.get("from")??"")?params.get("from")!:"2026-08-01";
  const to=isDate(params.get("to")??"")?params.get("to")!:kstToday();
  const store=createMetricsStore();
  const [instagram,ga4,naver,posts]=await Promise.all([store.listDays("instagram",from,to),store.listDays("ga4",from,to),store.readNaver(),store.readPosts()]);
  const csv="﻿"+toCsv({instagram,ga4,naver:naver.filter(p=>p.end>=from&&p.start<=to),posts}); // BOM: 엑셀에서 한글이 깨지지 않게
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="performance-${from}-${to}.csv"`,"Cache-Control":"no-store"}});
}
