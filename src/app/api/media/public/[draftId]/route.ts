import { NextResponse } from "next/server";
import { createDraftRepository } from "@/features/drafts/repository";
import { prepareInstagramImage,verifyMediaSignature } from "@/features/instagram/publicMedia";

export async function GET(request:Request,{params}:{params:Promise<{draftId:string}>}){
  const secret=process.env.MEDIA_SIGNING_SECRET;
  if(!secret)return NextResponse.json({error:"MEDIA_SIGNING_SECRET 설정이 필요합니다."},{status:503});
  const {draftId}=await params;
  const url=new URL(request.url),expiresAt=Number(url.searchParams.get("expires")),signature=url.searchParams.get("sig")??"",mediaId=url.searchParams.get("media")??undefined;
  if(!verifyMediaSignature({draftId,mediaId,expiresAt,signature,secret}))return NextResponse.json({error:"이미지 링크가 만료되었거나 올바르지 않습니다."},{status:403});
  const draft=await createDraftRepository().readDraft(draftId);
  if(!draft)return NextResponse.json({error:"게시물을 찾지 못했습니다."},{status:404});
  try{
    const image=await prepareInstagramImage(draft,mediaId);
    return new NextResponse(new Uint8Array(image),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=300"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"이미지를 준비하지 못했습니다."},{status:400});}
}
