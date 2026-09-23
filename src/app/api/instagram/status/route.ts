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
    },
  });
}
