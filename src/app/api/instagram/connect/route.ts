import { NextResponse } from "next/server";
import { buildAuthorizationUrl,createOAuthState,getInstagramConfig,InstagramConfigurationError } from "@/features/instagram/oauth";

export async function GET(){
  try{
    const state=createOAuthState();
    const response=NextResponse.redirect(buildAuthorizationUrl(getInstagramConfig(),state));
    response.cookies.set("instagram_oauth_state",state,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:600,path:"/"});
    return response;
  }catch(error){
    const message=error instanceof InstagramConfigurationError?error.message:"Instagram 연결을 시작할 수 없습니다.";
    return NextResponse.json({error:message},{status:503});
  }
}
