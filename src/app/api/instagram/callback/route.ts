import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createInstagramRepository } from "@/features/instagram/repository";
import { completeInstagramOAuth,getInstagramConfig } from "@/features/instagram/oauth";
import { exchangeInstagramCode,getInstagramProfile } from "@/features/instagram/metaClient";

export async function GET(request:Request){
  const requestUrl=new URL(request.url);
  const settingsUrl=new URL("/settings",requestUrl.origin);
  const cookieStore=await cookies();
  try{
    if(requestUrl.searchParams.get("error"))throw new Error("cancelled");
    const repository=createInstagramRepository();
    await completeInstagramOAuth({
      code:requestUrl.searchParams.get("code")??"",
      state:requestUrl.searchParams.get("state")??"",
      cookieState:cookieStore.get("instagram_oauth_state")?.value??"",
    },{
      config:getInstagramConfig(),exchangeCode:exchangeInstagramCode,getProfile:getInstagramProfile,saveConnection:repository.saveConnection,
    });
    settingsUrl.searchParams.set("instagram","connected");
  }catch{
    settingsUrl.searchParams.set("instagram","error");
  }
  const response=NextResponse.redirect(settingsUrl);
  response.cookies.delete("instagram_oauth_state");
  return response;
}
