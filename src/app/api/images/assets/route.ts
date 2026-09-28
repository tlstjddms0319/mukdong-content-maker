import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createAssetLibrary } from "@/features/images/assetLibrary";
import { AssetDetailsSchema } from "@/features/images/freeCards";
import { MediaValidationError } from "@/lib/files/mediaStore";

export async function GET(){
  const denied=await ownerApiError();if(denied)return denied;
  try{return NextResponse.json({assets:await createAssetLibrary().list()},{headers:{"Cache-Control":"no-store"}});}
  catch{return NextResponse.json({message:"사진 보관함을 불러오지 못했어요."},{status:500});}
}
export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  try{
    const form=await request.formData(),file=form.get("file");
    if(!(file instanceof File))throw new MediaValidationError("등록할 사진을 골라 주세요.");
    const details=AssetDetailsSchema.parse({name:form.get("name"),tags:String(form.get("tags")??"").split(",").map(tag=>tag.trim()).filter(Boolean),kind:form.get("kind"),credit:form.get("credit")});
    return NextResponse.json({asset:await createAssetLibrary().add(file,details)},{status:201});
  }catch(error){return NextResponse.json({message:error instanceof MediaValidationError?error.message:error instanceof z.ZodError?"사진 이름·검색어·출처를 확인해 주세요.":"사진을 등록하지 못했어요. 다시 시도해 주세요."},{status:error instanceof MediaValidationError||error instanceof z.ZodError?400:500});}
}
