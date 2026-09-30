import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createInstagramRepository } from "@/features/instagram/repository";
import { completeInstagramOAuth,getInstagramConfig,InstagramOAuthError,publicAppOrigin } from "@/features/instagram/oauth";
import { exchangeInstagramCode,getInstagramProfile } from "@/features/instagram/metaClient";

export async function GET(request:Request){
  const requestUrl=new URL(request.url);
  const settingsUrl=new URL("/settings",publicAppOrigin({INSTAGRAM_REDIRECT_URI:process.env.INSTAGRAM_REDIRECT_URI,AUTH_URL:process.env.AUTH_URL},requestUrl.origin));
  const cookieStore=await cookies();
  try{
    if(requestUrl.searchParams.get("error"))throw new InstagramOAuthError("사용자가 연결을 취소했습니다.","cancelled",requestUrl.searchParams.get("error_reason")??undefined);
    const repository=createInstagramRepository();
    await completeInstagramOAuth({
      code:requestUrl.searchParams.get("code")??"",
      state:requestUrl.searchParams.get("state")??"",
      cookieState:cookieStore.get("instagram_oauth_state")?.value??"",
    },{
      config:getInstagramConfig(),exchangeCode:exchangeInstagramCode,getProfile:getInstagramProfile,saveConnection:repository.saveConnection,
    });
    settingsUrl.searchParams.set("instagram","connected");
  }catch(error){
    const reason=error instanceof InstagramOAuthError?error.reason:"unknown";
    // Render 로그에서 "[instagram]"으로 찾을 수 있게 남긴다. 코드·토큰·시크릿은 기록하지 않는다.
    console.error("[instagram] callback failed",{reason,message:error instanceof Error?error.message:String(error),detail:error instanceof InstagramOAuthError?error.detail:undefined});
    settingsUrl.searchParams.set("instagram","error");
    settingsUrl.searchParams.set("reason",reason);
  }
  const response=NextResponse.redirect(settingsUrl);
  response.cookies.delete("instagram_oauth_state");
  return response;
}
