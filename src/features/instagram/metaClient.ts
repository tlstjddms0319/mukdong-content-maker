import { InstagramOAuthError,type InstagramOAuthConfig,type InstagramOAuthReason } from "./oauth";

// Meta 오류 응답은 {error_message} 또는 {error:{message}} 모양이다. 토큰·시크릿은 들어 있지 않다.
function metaErrorText(body:unknown){
  if(!body||typeof body!=="object")return "";
  const value=body as {error_message?:unknown;error?:{message?:unknown}|unknown};
  if(typeof value.error_message==="string")return value.error_message;
  const nested=value.error as {message?:unknown}|undefined;
  return typeof nested?.message==="string"?nested.message:"";
}

async function readJson(response:Response,reason:InstagramOAuthReason="unknown"){
  if(!response.ok){
    const detail=metaErrorText(await response.json().catch(()=>null));
    throw new InstagramOAuthError("Instagram 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.",reason,`HTTP ${response.status}${detail?` ${detail}`:""}`);
  }
  return response.json() as Promise<Record<string,unknown>>;
}

export async function exchangeInstagramCode(code:string,config:InstagramOAuthConfig){
  const body=new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,grant_type:"authorization_code",redirect_uri:config.redirectUri,code});
  const short=await readJson(await fetch("https://api.instagram.com/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}),"token");
  if(typeof short.access_token!=="string")throw new InstagramOAuthError("Instagram 토큰을 확인할 수 없습니다.","token");
  const url=new URL("https://graph.instagram.com/access_token");
  url.search=new URLSearchParams({grant_type:"ig_exchange_token",client_secret:config.appSecret,access_token:short.access_token}).toString();
  const long=await readJson(await fetch(url),"token");
  if(typeof long.access_token!=="string")throw new InstagramOAuthError("Instagram 장기 연결을 만들 수 없습니다.","token");
  return {accessToken:long.access_token,expiresIn:typeof long.expires_in==="number"?long.expires_in:5184000};
}

// 장기 토큰은 60일마다 만료된다. 발급 24시간 뒤부터 만료 전까지는 이 호출로 다시 60일을 받을 수 있다.
export async function refreshInstagramToken(accessToken:string){
  const url=new URL("https://graph.instagram.com/refresh_access_token");
  url.search=new URLSearchParams({grant_type:"ig_refresh_token",access_token:accessToken}).toString();
  const value=await readJson(await fetch(url));
  if(typeof value.access_token!=="string")throw new InstagramOAuthError("Instagram 연결을 갱신할 수 없습니다.");
  return {accessToken:value.access_token,expiresIn:typeof value.expires_in==="number"?value.expires_in:5184000};
}

export async function getInstagramProfile(accessToken:string){
  const url=new URL("https://graph.instagram.com/me");
  url.search=new URLSearchParams({fields:"id,username",access_token:accessToken}).toString();
  const profile=await readJson(await fetch(url),"profile");
  if(typeof profile.id!=="string"||typeof profile.username!=="string")throw new InstagramOAuthError("Instagram 계정 정보를 확인할 수 없습니다.","profile");
  return {id:profile.id,username:profile.username};
}

const graph=(path:string)=>`https://graph.instagram.com/${process.env.INSTAGRAM_API_VERSION??"v24.0"}/${path}`;
async function postForm(path:string,body:Record<string,string>){return readJson(await fetch(graph(path),{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body)}));}

// 게시물 반응(인사이트). 숫자는 values[0].value 또는 total_value.value 모양으로 온다(지표마다 다르다).
// 게시한 날은 미디어의 timestamp를 한국 날짜로 바꾼다(요일 분석용).
export type MediaInsights={reach:number;saves:number;shares:number;likes:number;comments:number;posted_on?:string};
const INSIGHT_METRICS=["reach","saved","shares","likes","comments"] as const;
function metricValue(data:unknown,name:string):number {
  const list=Array.isArray(data)?data as Array<{name?:unknown;values?:Array<{value?:unknown}>;total_value?:{value?:unknown}}>:[];
  const item=list.find(entry=>entry.name===name);
  const value=item?.total_value?.value??item?.values?.[0]?.value;
  return typeof value==="number"&&Number.isFinite(value)&&value>=0?Math.round(value):0;
}
const koreanDay=(timestamp:unknown)=>{
  if(typeof timestamp!=="string")return undefined;
  const time=Date.parse(timestamp.replace(/([+-]\d{2})(\d{2})$/,"$1:$2"));
  return Number.isFinite(time)?new Date(time+9*3_600_000).toISOString().slice(0,10):undefined;
};
export const instagramInsightsClient={
  async getMediaInsights(mediaId:string,accessToken:string):Promise<MediaInsights>{
    const insights=new URL(graph(`${mediaId}/insights`));insights.search=new URLSearchParams({metric:INSIGHT_METRICS.join(","),access_token:accessToken}).toString();
    const media=new URL(graph(mediaId));media.search=new URLSearchParams({fields:"timestamp",access_token:accessToken}).toString();
    const [values,info]=await Promise.all([readJson(await fetch(insights)),readJson(await fetch(media)).catch(()=>({}) as Record<string,unknown>)]);
    const posted_on=koreanDay(info.timestamp);
    return {reach:metricValue(values.data,"reach"),saves:metricValue(values.data,"saved"),shares:metricValue(values.data,"shares"),likes:metricValue(values.data,"likes"),comments:metricValue(values.data,"comments"),...(posted_on?{posted_on}:{})};
  },
};

export const instagramPublishingClient={
  async createImageContainer(input:{instagramUserId:string;accessToken:string;imageUrl:string;caption?:string;isCarouselItem?:boolean}){
    const body:Record<string,string>={image_url:input.imageUrl,access_token:input.accessToken};
    if(input.isCarouselItem)body.is_carousel_item="true";
    else if(input.caption!==undefined)body.caption=input.caption;
    const value=await postForm(`${input.instagramUserId}/media`,body);
    if(typeof value.id!=="string")throw new InstagramOAuthError("Instagram 게시 준비에 실패했습니다.");return value.id;
  },
  async createCarouselContainer(input:{instagramUserId:string;accessToken:string;children:string[];caption:string}){
    const value=await postForm(`${input.instagramUserId}/media`,{media_type:"CAROUSEL",children:input.children.join(","),caption:input.caption,access_token:input.accessToken});
    if(typeof value.id!=="string")throw new InstagramOAuthError("Instagram 게시 준비에 실패했습니다.");return value.id;
  },
  async getContainerStatus(id:string,accessToken:string){
    const url=new URL(graph(id));url.search=new URLSearchParams({fields:"status_code",access_token:accessToken}).toString();
    const value=await readJson(await fetch(url));
    return (typeof value.status_code==="string"?value.status_code:"ERROR") as "IN_PROGRESS"|"FINISHED"|"ERROR"|"EXPIRED"|"PUBLISHED";
  },
  async publishContainer(input:{instagramUserId:string;containerId:string;accessToken:string}){
    const value=await postForm(`${input.instagramUserId}/media_publish`,{creation_id:input.containerId,access_token:input.accessToken});
    if(typeof value.id!=="string")throw new InstagramOAuthError("Instagram 게시를 완료하지 못했습니다.");return value.id;
  },
};
