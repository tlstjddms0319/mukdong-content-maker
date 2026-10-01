import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createInstagramRepository,toPublicConnection } from "@/features/instagram/repository";

export async function GET(){ const denied=await ownerApiError(); if(denied)return denied;
  let mediaHttpsUrl=false;
  try{mediaHttpsUrl=new URL(process.env.MEDIA_PUBLIC_BASE_URL??"").protocol==="https:";}catch{}
  return NextResponse.json({
    ...toPublicConnection(await createInstagramRepository().readConnection()),
    setup:{
      appId:Boolean(process.env.INSTAGRAM_APP_ID?.trim()),
      appSecret:Boolean(process.env.INSTAGRAM_APP_SECRET?.trim()),
      redirectUri:Boolean(process.env.INSTAGRAM_REDIRECT_URI?.trim()),
      mediaHttpsUrl,
      signingKey:Boolean(process.env.MEDIA_SIGNING_SECRET?.trim()),
      // Supabase가 없으면 연결 정보가 서버의 임시 폴더에 저장돼, Render가 재시작될 때(무료 서버는 15분 쉬면 잠듦) 지워진다.
      persistentStorage:Boolean(process.env.SUPABASE_URL?.trim()&&process.env.SUPABASE_SECRET_KEY?.trim()),
    },
  });
}
