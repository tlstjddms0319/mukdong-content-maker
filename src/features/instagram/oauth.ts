import { randomBytes,timingSafeEqual } from "node:crypto";
import type { InstagramConnection } from "./schema";

export const INSTAGRAM_SCOPES=["instagram_business_basic","instagram_business_content_publish","instagram_business_manage_insights"] as const;

export type InstagramOAuthConfig={appId:string;appSecret:string;redirectUri:string};
type TokenResult={accessToken:string;expiresIn:number};
type Profile={id:string;username:string};

// 콜백이 실패한 단계. 설정 화면이 사용자에게 무엇을 확인할지 알려 주는 데 쓴다.
export type InstagramOAuthReason="cancelled"|"state"|"token"|"profile"|"config"|"unknown";

export class InstagramOAuthError extends Error{
  // detail은 Meta가 돌려준 원문 사유로, 서버 로그에만 남긴다.
  constructor(message:string,readonly reason:InstagramOAuthReason="unknown",readonly detail?:string){super(message);}
}
export class InstagramConfigurationError extends InstagramOAuthError{
  constructor(message:string){super(message,"config");}
}

export function getInstagramConfig(env:NodeJS.ProcessEnv=process.env):InstagramOAuthConfig{
  const names=["INSTAGRAM_APP_ID","INSTAGRAM_APP_SECRET","INSTAGRAM_REDIRECT_URI"] as const;
  const missing=names.filter(name=>!env[name]);
  if(missing.length)throw new InstagramConfigurationError(`Instagram 설정이 필요합니다: ${missing.join(", ")}`);
  return {appId:env.INSTAGRAM_APP_ID!,appSecret:env.INSTAGRAM_APP_SECRET!,redirectUri:env.INSTAGRAM_REDIRECT_URI!};
}

// Render 같은 프록시 뒤에서는 request.url이 내부 주소(https://localhost:10000)로 잡힌다.
// 그래서 사용자를 되돌려 보낼 공개 주소는 Meta에 등록한 콜백 주소나 AUTH_URL에서 가져온다.
export function publicAppOrigin(env:{INSTAGRAM_REDIRECT_URI?:string;AUTH_URL?:string},fallback:string){
  for(const value of [env.INSTAGRAM_REDIRECT_URI,env.AUTH_URL]){
    if(!value?.trim())continue;
    try{return new URL(value.trim()).origin;}catch{}
  }
  return fallback;
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
  if(!input.code||!input.state||!input.cookieState||!sameState(input.state,input.cookieState))throw new InstagramOAuthError("Instagram 연결 요청을 확인할 수 없습니다. 다시 시도해 주세요.","state");
  const token=await deps.exchangeCode(input.code,deps.config);
  const profile=await deps.getProfile(token.accessToken);
  const now=(deps.now??(()=>new Date()))();
  return deps.saveConnection({
    instagramUserId:profile.id,username:profile.username,accessToken:token.accessToken,
    expiresAt:new Date(now.getTime()+token.expiresIn*1000).toISOString(),
    scopes:[...INSTAGRAM_SCOPES],connectedAt:now.toISOString(),updatedAt:now.toISOString(),
  });
}

// 토큰 교환 거절 메시지(Meta 원문)를 고칠 항목 코드로 분류한다. 원문에는 비밀값이 없지만 그래도 주소에는 코드만 남긴다.
//  secret: 앱 시크릿 불일치, redirect: 연결 완료 주소 불일치, code: 인증 코드 재사용·만료, app: 앱 ID 불일치
export function tokenRejectionHint(detail:string|undefined):"secret"|"redirect"|"code"|"app"|undefined {
  if(!detail)return undefined;
  if(/client[_ ]secret|app secret/i.test(detail))return "secret";
  if(/redirect[_ ]?uri/i.test(detail))return "redirect";
  if(/code has been used|authorization code|code.*expired|expired.*code/i.test(detail))return "code";
  if(/client[_ ]id|platform app|app id/i.test(detail))return "app";
  return undefined;
}
