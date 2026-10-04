import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createAssetLibrary } from "@/features/images/assetLibrary";

// 실제 사진 캐러셀을 "사용"했을 때 쓴 사진들의 사용 횟수를 올린다(보관함의 "자주 쓴 사진" 정렬용).
export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const body=z.object({ids:z.array(z.string().uuid()).min(1).max(10)}).safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({message:"사진을 확인해 주세요."},{status:400});
  try{await createAssetLibrary().markUsed(body.data.ids);return NextResponse.json({marked:true});}
  catch{return NextResponse.json({message:"사용 기록을 남기지 못했어요."},{status:500});}
}
