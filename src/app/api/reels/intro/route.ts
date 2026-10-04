import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { generateIntroVideo } from "@/features/reels/introVideo";
import { HiggsfieldConfigurationError, HiggsfieldImageError } from "@/features/images/higgsfieldRequest";

const RequestSchema=z.object({image:z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(18_000_000)});
const MESSAGES:Record<HiggsfieldImageError["reason"],string>={
  auth:"Higgsfield 키를 확인해 주세요.",
  credits:"Higgsfield 크레딧이 부족해요. AI 표지 영상 없이 릴스를 만들어 주세요.",
  nsfw:"영상 안전 검사에 걸렸어요. AI 표지 영상 없이 만들어 주세요.",
  timeout:"AI 영상이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 시도하거나 AI 표지 영상 없이 만들어 주세요.",
  failed:"AI 표지 영상을 만들지 못했어요. AI 표지 영상 없이 만들어 주세요.",
};

// 릴스 첫 장면 AI 영상 만들기. 표지 원본 사진을 받아 짧은 움직이는 영상(data URL)을 돌려준다.
export async function POST(request:Request){
  const denied=await ownerApiError();if(denied)return denied;
  const body=RequestSchema.safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({message:"표지 사진을 확인해 주세요."},{status:400});
  try{return NextResponse.json({video:await generateIntroVideo(body.data.image)});}
  catch(error){
    if(error instanceof HiggsfieldConfigurationError)return NextResponse.json({message:"Higgsfield 키가 없어 AI 표지 영상을 만들 수 없어요."},{status:503});
    if(error instanceof HiggsfieldImageError)return NextResponse.json({message:MESSAGES[error.reason]},{status:error.reason==="nsfw"?422:502});
    return NextResponse.json({message:MESSAGES.failed},{status:502});
  }
}
