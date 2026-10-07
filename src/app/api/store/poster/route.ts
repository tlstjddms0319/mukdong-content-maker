import { NextResponse } from "next/server";
import sharp from "sharp";
import { ownerApiError } from "@/features/auth/guard";
import { fitPoster, storePoster } from "@/features/images/storeCard";
import { readCustomPoster, removeCustomPoster, saveCustomPoster } from "@/features/store/posterStore";
import { MediaValidationError } from "@/lib/files/mediaStore";

// 설정 화면 "맨 뒤 가게 홍보 포스터": 지금 쓰는 포스터 미리보기, 새 포스터 올리기, 기본 포스터로 되돌리기.
// 미리보기는 실제 카드(1080×1350)를 절반 크기로 줄인 것이라, 올린 그림이 카드에 어떻게 들어가는지 그대로 보인다.
const NO_STORE={"Cache-Control":"no-store"};
async function preview(card:Buffer|null):Promise<string|null> {
  if(!card)return null;
  const small=await sharp(card).resize(540,675).jpeg({quality:85}).toBuffer();
  return `data:image/jpeg;base64,${small.toString("base64")}`;
}
async function current(){
  const custom=await readCustomPoster();
  if(custom)return {source:"custom" as const,updatedAt:custom.updatedAt,preview:await preview(await fitPoster(custom.image,`custom|${custom.updatedAt}`))};
  const bundled=await storePoster().catch(()=>null);
  return {source:bundled?"bundled" as const:"design" as const,updatedAt:null,preview:await preview(bundled)};
}

export async function GET(){
  const denied=await ownerApiError();if(denied)return denied;
  try{return NextResponse.json(await current(),{headers:NO_STORE});}
  catch(error){console.error("[poster] 포스터를 읽지 못했어요:",error instanceof Error?error.message:String(error));return NextResponse.json({message:"홍보 포스터를 불러오지 못했어요."},{status:500,headers:NO_STORE});}
}

export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  try{
    const form=await request.formData(),file=form.get("file");
    if(!(file instanceof File))throw new MediaValidationError("올릴 포스터 그림을 골라 주세요.");
    await saveCustomPoster(file);
    return NextResponse.json(await current(),{status:201,headers:NO_STORE});
  }catch(error){
    if(error instanceof MediaValidationError)return NextResponse.json({message:error.message},{status:400,headers:NO_STORE});
    console.error("[poster] 포스터를 저장하지 못했어요:",error instanceof Error?error.message:String(error));
    return NextResponse.json({message:"포스터를 저장하지 못했어요. 다시 시도해 주세요."},{status:500,headers:NO_STORE});
  }
}

export async function DELETE(){
  const denied=await ownerApiError();if(denied)return denied;
  try{await removeCustomPoster();return NextResponse.json(await current(),{headers:NO_STORE});}
  catch(error){console.error("[poster] 포스터를 되돌리지 못했어요:",error instanceof Error?error.message:String(error));return NextResponse.json({message:"기본 포스터로 되돌리지 못했어요."},{status:500,headers:NO_STORE});}
}
