import { randomBytes,timingSafeEqual } from "node:crypto";
import type { InstagramConnection } from "./schema";

export const INSTAGRAM_SCOPES=["instagram_business_basic","instagram_business_content_publish"] as const;

export type InstagramOAuthConfig={appId:string;appSecret:string;redirectUri:string};
type TokenResult={accessToken:string;expiresIn:number};
type Profile={id:string;username:string};

export class InstagramOAuthError extends Error{}
export class InstagramConfigurationError extends InstagramOAuthError{}

export function getInstagramConfig(env:NodeJS.ProcessEnv=process.env):InstagramOAuthConfig{
  const names=["INSTAGRAM_APP_ID","INSTAGRAM_APP_SECRET","INSTAGRAM_REDIRECT_URI"] as const;
  const missing=names.filter(name=>!env[name]);
  if(missing.length)throw new InstagramConfigurationError(`Instagram 설정이 필요합니다: ${missing.join(", ")}`);
  return {appId:env.INSTAGRAM_APP_ID!,appSecret:env.INSTAGRAM_APP_SECRET!,redirectUri:env.INSTAGRAM_REDIRECT_URI!};
}

export const createOAuthState=()=>randomBytes(32).toString("base64url");

export function buildAuthorizationUrl(config:InstagramOAuthConfig,state:string){
  const url=new URL("https://www.instagram.com/oauth/authorize");
  url.search=new URLSearchParams({client_id:config.appId,redirect_uri:config.redirectUri,response_type:"code",scope:INSTAGRAM_SCOPES.join(","),state}).toString();
  return url.toString();
}

function sameState(received:string,cookie:string){
  const a=Buffer.from(received);const b=Buffer.from(cookie);
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function completeInstagramOAuth(
  input:{code:string;state:string;cookieState:string},
  deps:{
    config:InstagramOAuthConfig;
    exchangeCode:(code:string,config:InstagramOAuthConfig)=>Promise<TokenResult>;
    getProfile:(accessToken:string)=>Promise<Profile>;
    saveConnection:(value:InstagramConnection)=>Promise<InstagramConnection>;
    now?:()=>Date;
  },
){
  if(!input.code||!input.state||!input.cookieState||!sameState(input.state,input.cookieState))throw new InstagramOAuthError("Instagram 연결 요청을 확인할 수 없습니다. 다시 시도해 주세요.");
  const token=await deps.exchangeCode(input.code,deps.config);
  const profile=await deps.getProfile(token.accessToken);
  const now=(deps.now??(()=>new Date()))();
  return deps.saveConnection({
    instagramUserId:profile.id,username:profile.username,accessToken:token.accessToken,
    expiresAt:new Date(now.getTime()+token.expiresIn*1000).toISOString(),
    scopes:[...INSTAGRAM_SCOPES],connectedAt:now.toISOString(),updatedAt:now.toISOString(),
  });
}
