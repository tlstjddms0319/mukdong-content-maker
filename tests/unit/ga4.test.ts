// @vitest-environment node
import { generateKeyPairSync,createVerify } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { collectGa4,getGa4Config,signServiceJwt } from "@/features/metrics/ga4";

const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const pem=privateKey.export({type:"pkcs8",format:"pem"}).toString();
const config={propertyId:"555483214",clientEmail:"bot@p.iam.gserviceaccount.com",privateKey:pem,startDate:"2026-09-07"};
const ok=(body:unknown)=>({ok:true,status:200,json:async()=>body}) as Response;
const row=(dims:string[],metrics:number[])=>({dimensionValues:dims.map(value=>({value})),metricValues:metrics.map(v=>({value:String(v)}))});

describe("GA4",()=>{
  it("환경변수가 없으면 null, 있으면 서비스 계정 JSON을 읽는다",()=>{
    expect(getGa4Config({})).toBeNull();
    const env={GA4_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:config.clientEmail,private_key:pem})};
    expect(getGa4Config(env)).toMatchObject({propertyId:"555483214",clientEmail:config.clientEmail,startDate:"2026-09-07"});
  });
  it("JWT를 RS256으로 서명하고 읽기 전용 범위를 요청한다",()=>{
    const jwt=signServiceJwt(config,1_000_000);
    const [h,c,s]=jwt.split(".");
    const claims=JSON.parse(Buffer.from(c,"base64url").toString());
    expect(claims).toMatchObject({iss:config.clientEmail,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:1_000_000,exp:1_003_600});
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey,Buffer.from(s,"base64url"))).toBe(true);
  });
  it("처음에는 시작일부터, 다음부터는 마지막 사흘을 다시 가져와 일별로 저장한다",async()=>{
    const bodies:unknown[]=[];
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.includes("oauth2"))return ok({access_token:"tok"});
      const body=JSON.parse(String(init!.body));bodies.push(body);
      const dims=body.dimensions.map((d:{name:string})=>d.name).join(",");
      if(dims==="date")return ok({rows:[row(["20261010"],[3,4,9])]});
      if(dims==="date,eventName")return ok({rows:[row(["20261010","phone_click"],[2])]});
      return ok({rows:[row(["20261010","naver / place"],[3]),row(["20261010","(direct) / (none)"],[1])]});
    });
    const saved:unknown[]=[];
    const store={saveDays:vi.fn(async(_c:string,days:unknown[])=>{saved.push(...days);})};
    const first=await collectGa4({config,store,fetcher:fetcher as unknown as typeof fetch,today:"2026-10-12",filledThrough:undefined,nowSeconds:1_000_000});
    expect((bodies[0] as {dateRanges:unknown}).dateRanges).toEqual([{startDate:"2026-09-07",endDate:"2026-10-11"}]);
    expect(saved).toEqual([{date:"2026-10-10",activeUsers:3,sessions:4,pageViews:9,phoneClicks:2,directionsClicks:0,sources:[{sourceMedium:"naver / place",sessions:3},{sourceMedium:"(direct) / (none)",sessions:1}]}]);
    expect(first.filledThrough).toBe("2026-10-11");
    bodies.length=0;
    await collectGa4({config,store,fetcher:fetcher as unknown as typeof fetch,today:"2026-10-14",filledThrough:"2026-10-11",nowSeconds:1_000_000});
    expect((bodies[0] as {dateRanges:unknown}).dateRanges).toEqual([{startDate:"2026-10-09",endDate:"2026-10-13"}]);
  });
  it("토큰 요청 실패 메시지에 비밀값을 넣지 않는다",async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:"invalid_grant"})});
    await expect(collectGa4({config,store:{saveDays:vi.fn()},fetcher,today:"2026-10-12",filledThrough:undefined})).rejects.toThrow(/구글 애널리틱스/);
    await collectGa4({config,store:{saveDays:vi.fn()},fetcher,today:"2026-10-12",filledThrough:undefined}).catch((e:Error)=>expect(e.message).not.toContain("PRIVATE KEY"));
  });
});
