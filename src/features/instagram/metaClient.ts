import { InstagramOAuthError,type InstagramOAuthConfig } from "./oauth";

async function readJson(response:Response){
  if(!response.ok)throw new InstagramOAuthError("Instagram 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  return response.json() as Promise<Record<string,unknown>>;
}

export async function exchangeInstagramCode(code:string,config:InstagramOAuthConfig){
  const body=new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,grant_type:"authorization_code",redirect_uri:config.redirectUri,code});
  const short=await readJson(await fetch("https://api.instagram.com/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}));
  if(typeof short.access_token!=="string")throw new InstagramOAuthError("Instagram 토큰을 확인할 수 없습니다.");
  const url=new URL("https://graph.instagram.com/access_token");
  url.search=new URLSearchParams({grant_type:"ig_exchange_token",client_secret:config.appSecret,access_token:short.access_token}).toString();
  const long=await readJson(await fetch(url));
  if(typeof long.access_token!=="string")throw new InstagramOAuthError("Instagram 장기 연결을 만들 수 없습니다.");
  return {accessToken:long.access_token,expiresIn:typeof long.expires_in==="number"?long.expires_in:5184000};
}

export async function getInstagramProfile(accessToken:string){
  const url=new URL("https://graph.instagram.com/me");
  url.search=new URLSearchParams({fields:"id,username",access_token:accessToken}).toString();
  const profile=await readJson(await fetch(url));
  if(typeof profile.id!=="string"||typeof profile.username!=="string")throw new InstagramOAuthError("Instagram 계정 정보를 확인할 수 없습니다.");
  return {id:profile.id,username:profile.username};
}
