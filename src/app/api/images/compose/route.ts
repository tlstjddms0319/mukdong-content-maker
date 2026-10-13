import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createAssetLibrary } from "@/features/images/assetLibrary";
import { FreeCardInputSchema } from "@/features/images/freeCards";
import { renderFreeCard } from "@/features/images/renderFreeCard";
import { withRenderLock } from "@/features/images/render/renderLock";

export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  try{
    const input=FreeCardInputSchema.parse(await request.json()),library=createAssetLibrary();
    const assets=await Promise.all((input.layout==="text"?[]:input.assetIds).map(id=>library.read(id)));
    if(assets.some(asset=>asset===null))return NextResponse.json({message:"선택한 사진을 찾지 못했어요. 보관함을 새로고침해 주세요."},{status:404});
    // 카드 그리기와 같은 순서 대기(무료 서버 메모리 보호, render/renderLock.ts).
    const card=await withRenderLock(()=>renderFreeCard(input,assets.filter(asset=>asset!==null)),"free-card");
    await library.markUsed(card.assetIds);
    return NextResponse.json({card},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({message:error instanceof z.ZodError||error instanceof SyntaxError?"제목과 설명, 선택한 사진을 확인해 주세요.":"카드를 만들지 못했어요. 다시 시도해 주세요."},{status:error instanceof z.ZodError||error instanceof SyntaxError?400:500});}
}
