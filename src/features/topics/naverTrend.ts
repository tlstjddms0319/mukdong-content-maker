import { z } from "zod";

// 네이버 검색어 트렌드(데이터랩)로 "요즘 검색이 늘어난 음식 말"을 찾는다.
// 데이터랩은 검색 횟수가 아니라 한 요청 안에서 가장 많이 검색된 구간을 100으로 둔 상대값(ratio)을 준다.
// 한 요청에 묶음 5개까지라, 묶음 4개 + 기준 낱말(막걸리)을 같이 보내고 기준 낱말의 평균으로 나눠 요청끼리 비교한다.
// 늘어난 정도 = 최근 2주 평균 ÷ 그 전 8주 평균. 키가 없거나 실패하면 빈 목록(주제 추천은 그대로 동작).
//
// 키: NAVER_CLIENT_ID·NAVER_CLIENT_SECRET (Render 환경변수).
// NAVER_API_STYLE: "apihub"(기본, 2026년부터 새 키는 NAVER API HUB에서 발급) 또는 "legacy"(예전 개발자센터 키).

export const ANCHOR="막걸리";
// 가게 메뉴·홍어로 이어지기 쉬운 음식 말. 묶음 이름이 화면과 프롬프트에 그대로 나간다.
// menu: 그 말이 늘어나면 먼저 떠올릴 가게 메뉴(STORE_MENU id). 준비된 주제를 고를 때 쓴다. 없으면 장면(모임 등)으로만 쓴다.
export const TREND_GROUPS:Array<{name:string;keywords:string[];menu?:string}>=[
  {name:"홍어",keywords:["홍어","홍어회","홍어무침"],menu:"hongeo-hoe"},
  {name:"삼합",keywords:["삼합","홍어삼합"],menu:"hongeo-hoe"},
  {name:"수육",keywords:["수육","보쌈"],menu:"hongeo-hoe"},
  {name:"묵은지",keywords:["묵은지"],menu:"hongeo-hoe"},
  {name:"굴",keywords:["굴","굴보쌈","생굴"]},
  {name:"과메기",keywords:["과메기"],menu:"gwamegi"},
  {name:"김장",keywords:["김장","김장김치"],menu:"hongeo-hoe"},
  {name:"전",keywords:["부침개","모둠전","전 맛집"],menu:"minari-jeon"},
  {name:"회",keywords:["모둠회","회 맛집"],menu:"hongeo-hoe"},
  {name:"막걸리 안주",keywords:["막걸리 안주"],menu:"baedari-makgeolli"},
  {name:"송년회",keywords:["송년회","송년회 장소"]},
  {name:"회식",keywords:["회식","회식 장소"]},
];
export const trendMenu=(keyword:string)=>TREND_GROUPS.find(group=>group.name===keyword)?.menu;

const ResponseSchema=z.object({results:z.array(z.object({title:z.string(),data:z.array(z.object({period:z.string(),ratio:z.number()}))}))});
export type TrendKeyword={keyword:string;growth:number;level:number};

const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;

// 한 요청의 결과를 기준 낱말 평균으로 나눈 시계열로 바꾼다. 마지막 구간이 아직 끝나지 않은 주면 버린다(덜 모인 값).
export function normalizeBatch(results:z.infer<typeof ResponseSchema>["results"],endDate:string):Map<string,number[]> {
  const series=new Map<string,number[]>();
  const end=Date.parse(`${endDate}T00:00:00Z`);
  const complete=(period:string)=>Date.parse(`${period}T00:00:00Z`)+6*86_400_000<=end;
  const anchor=results.find(result=>result.title===ANCHOR);
  const scale=mean(anchor?.data.filter(point=>complete(point.period)).map(point=>point.ratio)??[]);
  if(!scale)return series;
  for(const result of results)if(result.title!==ANCHOR)series.set(result.title,result.data.filter(point=>complete(point.period)).map(point=>point.ratio/scale));
  return series;
}

// 최근 2주가 그 전 8주보다 15% 이상 늘었고, 너무 드문 말(기준 낱말의 5% 미만)이 아닌 것을 늘어난 순으로.
export function risingKeywords(series:Map<string,number[]>,limit=3):TrendKeyword[] {
  const rising:TrendKeyword[]=[];
  for(const [keyword,values] of series){
    if(values.length<6)continue;
    const recent=mean(values.slice(-2)),base=mean(values.slice(-10,-2));
    if(base<=0||recent<0.05)continue;
    const growth=recent/base;
    if(growth>=1.15)rising.push({keyword,growth:Math.round(growth*100)/100,level:Math.round(recent*100)/100});
  }
  return rising.sort((a,b)=>b.growth-a.growth).slice(0,limit);
}

export const trendLabel=(trend:TrendKeyword)=>`${trend.keyword} +${Math.round((trend.growth-1)*100)}%`;

type Fetch=typeof fetch;
export type TrendDeps={env?:Record<string,string|undefined>;fetch?:Fetch;today?:string};

export function naverConfigured(env:Record<string,string|undefined>=process.env){return !!(env.NAVER_CLIENT_ID?.trim()&&env.NAVER_CLIENT_SECRET?.trim());}

function endpoint(env:Record<string,string|undefined>):{url:string;headers:Record<string,string>}{
  const id=env.NAVER_CLIENT_ID!.trim(),secret=env.NAVER_CLIENT_SECRET!.trim();
  return env.NAVER_API_STYLE==="legacy"
    ?{url:"https://openapi.naver.com/v1/datalab/search",headers:{"X-Naver-Client-Id":id,"X-Naver-Client-Secret":secret}}
    :{url:"https://naverapihub.apigw.ntruss.com/search-trend/v1/search",headers:{"X-NCP-APIGW-API-KEY-ID":id,"X-NCP-APIGW-API-KEY":secret}};
}

const shiftDays=(date:string,days:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
const kstToday=()=>new Date(Date.now()+9*3_600_000).toISOString().slice(0,10);

// 실제 호출. 어제까지 12주를 주 단위로 본다(요청 3번). 실패하면 이유를 담아 던진다(점검 화면용).
export async function fetchTrendKeywords(deps:TrendDeps={}):Promise<TrendKeyword[]> {
  const env=deps.env??process.env;
  if(!naverConfigured(env))return [];
  const request=deps.fetch??fetch;
  const endDate=shiftDays(deps.today??kstToday(),-1),startDate=shiftDays(endDate,-7*12);
  const {url,headers}=endpoint(env);
  const series=new Map<string,number[]>();
  for(let i=0;i<TREND_GROUPS.length;i+=4){
    const groups=[...TREND_GROUPS.slice(i,i+4).map(group=>({groupName:group.name,keywords:group.keywords})),{groupName:ANCHOR,keywords:[ANCHOR]}];
    const response=await request(url,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({startDate,endDate,timeUnit:"week",keywordGroups:groups}),signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error(response.status===401||response.status===403?`네이버 키가 거부됐어요(${response.status}). 키와 NAVER_API_STYLE(apihub/legacy)을 확인해 주세요.`:`네이버 데이터랩 HTTP ${response.status}`);
    for(const [keyword,values] of normalizeBatch(ResponseSchema.parse(await response.json()).results,endDate))series.set(keyword,values);
  }
  return risingKeywords(series);
}

// 주제 추천용: 12시간 동안 결과를 기억해 호출을 아낀다(월 쿼터). 실패하면 빈 목록을 쓰고 30분 뒤 다시 시도.
// status: 화면이 "반영됐는지"를 알려 주는 데 쓴다. off=키 없음, ok=늘어난 말 있음, none=정상인데 눈에 띄게 늘어난 말 없음, error=호출 실패.
export type TrendStatus="off"|"ok"|"none"|"error";
let cache:{at:number;value:TrendKeyword[];error:boolean}|null=null;
export async function cachedTrendResult(deps:TrendDeps={},now=Date.now()):Promise<{keywords:TrendKeyword[];status:TrendStatus}> {
  if(!naverConfigured(deps.env??process.env))return {keywords:[],status:"off"};
  if(!cache||now-cache.at>=(cache.value.length?12:0.5)*3_600_000){
    try{cache={at:now,value:await fetchTrendKeywords(deps),error:false};}
    catch(error){console.warn("[trends] 네이버 검색 트렌드를 건너뜁니다:",error instanceof Error?error.message:String(error));cache={at:now,value:[],error:true};}
  }
  return {keywords:cache.value,status:cache.error?"error":cache.value.length?"ok":"none"};
}
export async function cachedTrendKeywords(deps:TrendDeps={},now=Date.now()):Promise<TrendKeyword[]> {
  return (await cachedTrendResult(deps,now)).keywords;
}
export function resetTrendCache(){cache=null;}
