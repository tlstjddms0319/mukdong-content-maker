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

// 사진 보관함 관리: 이름·검색어 고치기.
const UpdateSchema=z.object({id:z.string().uuid(),name:z.string().optional(),tags:z.array(z.string()).optional()});
export async function PATCH(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const body=UpdateSchema.safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({message:"고칠 사진을 확인해 주세요."},{status:400});
  try{
    const {id,name,tags}=body.data;
    const asset=await createAssetLibrary().update(id,{...(name!==undefined?{name}:{}),...(tags!==undefined?{tags:tags.map(tag=>tag.trim()).filter(Boolean)}:{})});
    return asset?NextResponse.json({asset}):NextResponse.json({message:"사진을 찾을 수 없어요."},{status:404});
  }catch(error){return NextResponse.json({message:error instanceof z.ZodError?"이름(60자)과 검색어(1~12개, 각 24자)를 확인해 주세요.":"사진 정보를 고치지 못했어요."},{status:error instanceof z.ZodError?400:500});}
}

// 사진 보관함에서 빼기(?id=). 원본 파일은 남긴다.
export async function DELETE(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if(!id.success)return NextResponse.json({message:"뺄 사진을 확인해 주세요."},{status:400});
  try{return await createAssetLibrary().remove(id.data)?NextResponse.json({removed:true}):NextResponse.json({message:"사진을 찾을 수 없어요."},{status:404});}
  catch{return NextResponse.json({message:"사진을 빼지 못했어요."},{status:500});}
}
