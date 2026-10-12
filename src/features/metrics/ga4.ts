import { createSign } from "node:crypto";
import { addDays } from "./dates";
import type { Ga4Day,MetricsStore } from "./store";

// 홈페이지 GA4 숫자를 서비스 계정으로 읽는다(GA4 속성에 서비스 계정 이메일을 '뷰어'로 추가해 둔다).
// 새 패키지 없이 Node crypto로 JWT를 서명해 토큰을 받는다.
export type Ga4Config={propertyId:string;clientEmail:string;privateKey:string;startDate:string};
type Env=Partial<Record<"GA4_PROPERTY_ID"|"GA4_SERVICE_ACCOUNT_JSON"|"GA4_START_DATE",string>>;

export function getGa4Config(env:Env=process.env as Env):Ga4Config|null{
  const raw=env.GA4_SERVICE_ACCOUNT_JSON?.trim();
  if(!raw)return null;
  // 붙여 넣다 깨진 JSON이면 연결 안 된 것으로 본다. JSON.parse 오류 문구에는 키 일부가 실릴 수 있어 그대로 던지지 않는다.
  let parsed:{client_email?:string;private_key?:string};
  try{parsed=JSON.parse(raw);}catch{console.warn("[metrics] GA4_SERVICE_ACCOUNT_JSON을 읽지 못했어요. JSON 전체를 다시 붙여 넣어 주세요.");return null;}
  if(!parsed.client_email||!parsed.private_key)return null;
  return {propertyId:env.GA4_PROPERTY_ID?.trim()||"555483214",clientEmail:parsed.client_email,privateKey:parsed.private_key,startDate:env.GA4_START_DATE?.trim()||"2026-09-07"};
}

const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
export function signServiceJwt(config:Ga4Config,nowSeconds:number){
  const unsigned=`${b64({alg:"RS256",typ:"JWT"})}.${b64({iss:config.clientEmail,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:nowSeconds,exp:nowSeconds+3600})}`;
  return `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(config.privateKey).toString("base64url")}`;
}

class Ga4Error extends Error{}
async function accessToken(config:Ga4Config,fetcher:typeof fetch,nowSeconds:number){
  const response=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:signServiceJwt(config,nowSeconds)})});
  if(!response.ok)throw new Ga4Error(`구글 애널리틱스 인증에 실패했어요(HTTP ${response.status}). 서비스 계정 키를 확인해 주세요.`);
  const body=await response.json() as {access_token?:string};
  if(!body.access_token)throw new Ga4Error("구글 애널리틱스 인증 응답을 읽지 못했어요.");
  return body.access_token;
}

type Row={dimensionValues:{value:string}[];metricValues:{value:string}[]};
async function report(config:Ga4Config,token:string,fetcher:typeof fetch,body:Record<string,unknown>){
  const response=await fetcher(`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Ga4Error(`구글 애널리틱스 보고서를 읽지 못했어요(HTTP ${response.status}). 서비스 계정이 속성의 뷰어인지 확인해 주세요.`);
  return ((await response.json() as {rows?:Row[]}).rows??[]);
}
const isoOf=(yyyymmdd:string)=>`${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`;

export async function collectGa4({config,store,fetcher=fetch,today,filledThrough,nowSeconds=Math.floor(Date.now()/1000)}:{config:Ga4Config;store:Pick<MetricsStore,"saveDays">;fetcher?:typeof fetch;today:string;filledThrough:string|undefined;nowSeconds?:number}){
  const yesterday=addDays(today,-1);
  // GA4 숫자는 하루 이틀 늦게 확정되므로 마지막 사흘은 다시 가져온다.
  const from=filledThrough?[addDays(filledThrough,-2),config.startDate].sort().at(-1)!:config.startDate;
  if(from>yesterday)return {daysFilled:0,filledThrough};
  const token=await accessToken(config,fetcher,nowSeconds);
  const dateRanges=[{startDate:from,endDate:yesterday}];
  const [totals,events,sources]=await Promise.all([
    report(config,token,fetcher,{dateRanges,dimensions:[{name:"date"}],metrics:[{name:"activeUsers"},{name:"sessions"},{name:"screenPageViews"}],limit:1000}),
    report(config,token,fetcher,{dateRanges,dimensions:[{name:"date"},{name:"eventName"}],metrics:[{name:"eventCount"}],dimensionFilter:{filter:{fieldName:"eventName",inListFilter:{values:["phone_click","directions_click"]}}},limit:5000}),
    report(config,token,fetcher,{dateRanges,dimensions:[{name:"date"},{name:"sessionSourceMedium"}],metrics:[{name:"sessions"}],limit:10000}),
  ]);
  const days=new Map<string,Omit<Ga4Day,"fetchedAt">>();
  const dayOf=(raw:string)=>{const date=isoOf(raw);if(!days.has(date))days.set(date,{date,phoneClicks:0,directionsClicks:0,sources:[]});return days.get(date)!;};
  for(const r of totals){const d=dayOf(r.dimensionValues[0].value);[d.activeUsers,d.sessions,d.pageViews]=r.metricValues.map(m=>Number(m.value));}
  for(const r of events){const d=dayOf(r.dimensionValues[0].value);const v=Number(r.metricValues[0].value);if(r.dimensionValues[1].value==="phone_click")d.phoneClicks=v;else d.directionsClicks=v;}
  for(const r of sources)dayOf(r.dimensionValues[0].value).sources.push({sourceMedium:r.dimensionValues[1].value,sessions:Number(r.metricValues[0].value)});
  const list=[...days.values()].map(d=>({...d,sources:d.sources.sort((a,b)=>b.sessions-a.sessions).slice(0,10)})).sort((a,b)=>a.date.localeCompare(b.date));
  if(list.length)await store.saveDays("ga4",list);
  return {daysFilled:list.length,filledThrough:yesterday};
}
