import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { toStrictJsonSchema } from "@/lib/ai/jsonSchema";
import { mainMenuOf, type StoreMenuItem } from "@/features/store/menu";
import { recordUsage } from "@/lib/usage/ledger";

// AI 표지 후보 점검(식욕 점수). 표지 후보(글자를 얹기 전 원본)나 사장님 사진을 Gemini에 보여 주고
// 먹음직스러움·조명·구도 점수와 흔한 실패(이미지 속 글자, 기대한 음식으로 안 보임, 어색한 손, 어두움·흐림·어수선함)를 확인한다.
// 결과는 후보 순서·"표지로 추천"과 화면 경고 배지에만 쓴다. 다시 만들지는 않는다(이미지 비용 방지).
// Gemini 키가 없거나 호출이 실패하면 점검 없이 원래 순서를 쓴다.

// 모델이 채우는 항목. score는 모델에게 묻지 않고 세 점수로 계산한다(모델마다 10점 척도가 들쭉날쭉해서).
export const CoverCheckSchema=z.object({
  foodVisible:z.boolean(),          // 음식이 화면의 주인공으로 또렷이 보이는가
  looksLikeSkate:z.boolean(),       // 기대한 음식(기본: 얇게 썬 홍어회)처럼 보이는가. 이름은 저장된 결과 호환 때문에 그대로 둔다.
  textInImage:z.boolean(),          // 이미지 안에 글자·숫자·로고·워터마크가 있는가
  oddHands:z.boolean(),             // 손가락 개수·모양이 어색한 손이 있는가
  appetite:z.number().int().min(1).max(5),     // 먹음직스러움(윤기·질감·색)
  lighting:z.number().int().min(1).max(5),     // 빛의 방향·밝기·색온도
  composition:z.number().int().min(1).max(5),  // 음식이 화면을 채우는 정도·여백·정리
  dark:z.boolean(),                 // 전체가 어두워 음식이 잘 안 보이는가
  blurry:z.boolean(),               // 초점이 나가거나 흔들렸는가
  clutter:z.boolean(),              // 음식과 상관없는 물건이 많아 어수선한가
  note:z.string().max(80),          // 한국어 한 줄 메모
  // 사진 속 주인공 음식 이름(짧은 한국어, 모르면 빈 문자열). 사진·글 메뉴 불일치 안내와 보관함 "음식:" 태그에 쓴다.
  // 예전에 저장된 점검 결과에는 없으므로 기본값 "". 길이는 쓰는 쪽에서 자른다(모델이 길게 써도 점검 전체가 실패하지 않게).
  food:z.string().default(""),
  // 사진에 보이는 것 한 줄(음식·술·손·그릇 등, 짧은 한국어). 실제 사진 캐러셀이 사진을 글 내용이 맞는 장에 넣고
  // 문안 AI에게 사진 내용을 알려 주는 데 쓴다. 예전 결과에는 없으므로 기본값 "".
  scene:z.string().default(""),
});
export type CoverCheckFields=z.infer<typeof CoverCheckSchema>;
// unchecked: 이 장만 점검 호출이 실패해 점수를 모르는 자리(다른 장의 결과는 그대로 쓴다).
export type CoverCheck=CoverCheckFields&{score:number;warnings:string[];unchecked?:true};

// 기대 음식. 주제·슬라이드 제목에서 메뉴 낱말을 찾아 점검 문장에 넣는다. 못 찾으면 홍어회.
// 가게 메뉴(과메기·미나리전·홍어애탕·홍어무침·배다리 막걸리 등)는 STORE_MENU의 겉모습 묘사를 쓴다.
const DEFAULT_FOOD={name:"홍어",description:"삭힌 홍어회(손으로 썬 도톰한 사각 조각으로 두께가 보이고, 탁한 연보라빛 분홍·회백색 살에 비스듬한 흰 연골 결이 나란히 보임)"};
// 메뉴 목록에 없지만 글에 나오면 알아볼 음식(홍어전·찜은 확인된 메뉴가 아니어도 사장님이 직접 적을 수 있다).
const EXTRA_FOODS:ReadonlyArray<readonly [RegExp,{name:string;description:string}]>=[
  [/홍어\s*전(?!문|통|체|날)/,{name:"홍어전",description:"홍어전(얇은 홍어 살에 전옷을 입혀 노릇하게 부친 전)"}],
  [/홍어\s*찜/,{name:"홍어찜",description:"홍어찜(익혀서 결이 보이는 홍어 살, 생회처럼 투명하지 않음)"}],
];
function menuFood(menu:StoreMenuItem,text:string):{name:string;description:string} {
  if(menu.id==="hongeo-hoe")return /삼합/.test(text)
    ?{name:"삼합",description:"홍어 삼합(도톰히 썬 홍어회와 수육, 묵은지를 한입에 겹친 것, 홍어가 주인공)"}
    :DEFAULT_FOOD;
  return {name:menu.short,description:`${menu.short}(${menu.lookKo})`};
}
// 앞의 글(주제)에 나온 메뉴를 먼저 본다. 같은 글 안에서는 먼저 나온 메뉴.
export function expectedFoodFrom(...texts:Array<string|undefined>):{name:string;description:string} {
  const text=texts.filter(Boolean).join(" ");
  const extra=EXTRA_FOODS.find(([pattern])=>pattern.test(text))?.[1];
  if(extra)return extra;
  const menu=mainMenuOf(...texts);
  if(menu)return menuFood(menu,text);
  if(/수육|보쌈/.test(text))return {name:"수육",description:"돼지고기 수육(삶아 얇게 썬 고기)"};
  return DEFAULT_FOOD;
}

function promptFor(food:string):string {
  return `이 사진은 식당 Instagram 카드뉴스 표지 후보입니다(글자는 나중에 얹습니다). 음식은 ${food}여야 합니다.
다음을 JSON으로 답하세요.
- foodVisible: 음식이 화면의 주인공으로 또렷이 보이면 true
- looksLikeSkate: 위에서 말한 음식처럼 보이면 true. 다른 음식으로 보이면 false(예: 썬 홍어회여야 하는데 통생선이나 연어·참치처럼 보이거나, 똑같이 얇은 정사각형 타일이 바둑판처럼 놓여 초콜릿처럼 보임)
- textInImage: 이미지 안에 글자, 숫자, 간판, 로고, 워터마크가 보이면 true
- oddHands: 손이 있는데 손가락 개수·모양이 어색하면 true (손이 없으면 false)
- appetite: 먹음직스러움 1~5 (윤기, 촉촉함, 결과 색이 살아 있는가)
- lighting: 조명 1~5 (빛 방향이 분명하고 따뜻하며 너무 어둡거나 하얗게 날아가지 않았는가)
- composition: 구도 1~5 (음식이 화면을 충분히 채우고 정돈되어 표지 글자를 얹을 자리가 있는가)
- dark: 전체가 어두워 음식이 잘 안 보이면 true
- blurry: 초점이 나가거나 흔들렸으면 true
- clutter: 음식과 상관없는 물건이 많아 어수선하면 true
- note: 가장 큰 문제나 장점을 한국어 20자 안팎 한 줄로
- food: 사진 속 주인공 음식 이름을 한국어로 짧게(예: 홍어회, 삼합, 홍어무침, 홍어애탕, 과메기, 미나리전, 막걸리, 수육). 모르겠으면 빈 문자열
- scene: 사진에 실제로 보이는 것을 한국어 30자 안팎 한 줄로(음식, 술, 곁들임, 손·젓가락 같은 사람 요소, 찍은 각도). 예: "젓가락으로 집어 든 홍어회 한 점, 뒤에 막걸리 사발"`;
}

// 세 점수(1~5)를 10점 척도로. 먹음직스러움을 두 배로 친다(표지는 맛있어 보이는 게 먼저).
export function coverScore(check:Pick<CoverCheckFields,"appetite"|"lighting"|"composition">):number {
  return Math.round((check.appetite*2+check.lighting+check.composition)/2*10)/10;
}

// 받침이 있으면 "으로", 없거나 ㄹ 받침이면 "로"(홍어로, 홍어전으로, 삼합으로, 막걸리로).
function withRo(word:string):string {
  const code=word.charCodeAt(word.length-1)-0xac00;
  if(code<0||code>11171)return "(으)로";
  const final=code%28;
  return final===0||final===8?"로":"으로";
}

// 경고 문구(화면 배지). 문제가 없으면 빈 배열.
export function coverWarnings(check:CoverCheckFields,foodName=DEFAULT_FOOD.name):string[] {
  return [
    ...(check.textInImage?["이미지 속 글자"]:[]),
    ...(!check.foodVisible?["음식이 잘 안 보임"]:[]),
    ...(check.foodVisible&&!check.looksLikeSkate?[`${foodName}${withRo(foodName)} 안 보임`]:[]),
    ...(check.oddHands?["손 모양 어색"]:[]),
    ...(check.dark?["어두움"]:[]),
    ...(check.blurry?["흐림"]:[]),
    ...(check.clutter?["어수선함"]:[]),
  ];
}

// 경고가 있으면 점수를 깎아 순서를 정한다(글자·다른 음식은 크게, 손·어두움·흐림은 조금).
// 점검을 못 한 자리는 중간쯤(4)에 둔다. 점검이 통과한 깨끗한 후보보다 앞서지 않게.
export function coverRank(check:CoverCheck):number {
  if(check.unchecked)return 4;
  return check.score-(check.textInImage?4:0)-(!check.foodVisible?4:0)-(!check.looksLikeSkate?3:0)-(check.oddHands?2:0)
    -(check.dark?1.5:0)-(check.blurry?1.5:0)-(check.clutter?1:0);
}

// 같은 사진을 다시 점검하지 않도록 기억해 둔다(사진 sha1 + 기대 음식). 최근 50장만(LRU).
const CACHE_LIMIT=50;
const cache=new Map<string,CoverCheck>();
function cacheGet(key:string):CoverCheck|undefined {
  const hit=cache.get(key);
  if(hit){cache.delete(key);cache.set(key,hit);}
  return hit;
}
function cachePut(key:string,value:CoverCheck){
  cache.delete(key);cache.set(key,value);
  while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value!);
}
export function clearCoverCheckCache(){cache.clear();}

class GeminiStatusError extends Error {
  constructor(readonly status:number){super(`Gemini ${status}`);this.name="GeminiStatusError";}
}

// 모델이 응답 스키마를 거부할 수 있어(지원 범위가 모델마다 다름) 한 번 거부되면 그 뒤로는 JSON 모드로만 보낸다.
const RESPONSE_SCHEMA=toStrictJsonSchema(CoverCheckSchema);

type Fetch=typeof fetch;
export type CoverCheckOptions={apiKey?:string;model?:string;fallbackModel?:string;fetch?:Fetch;strict?:boolean;
  // 주제·슬라이드 제목에서 뽑은 기대 음식 설명(expectedFoodFrom). 없으면 홍어회.
  expectedFood?:{name:string;description:string}};

// 한 장씩 따로 점검한 결과. 실패한 장은 null(나머지 결과는 쓴다). 키가 없으면 null.
// strict: 실패를 삼키지 않고 첫 실패를 그대로 던진다(설정 화면의 "AI 연결 점검"이 실패 이유를 보여 주려고 쓴다).
const VISION_TIMEOUT_MS=20_000;
export async function scoreImages(images:Buffer[],options:CoverCheckOptions={}):Promise<Array<CoverCheck|null>|null> {
  const apiKey=options.apiKey??process.env.GEMINI_API_KEY??"";
  if(!apiKey||!images.length)return null;
  const primary=options.model??process.env.GEMINI_VISION_MODEL??process.env.GEMINI_TEXT_MODEL??"gemini-3.5-flash-lite";
  // 무료 할당량은 모델마다 따로라 429면 다른 가벼운 모델로 한 번만 더 시도한다.
  const fallback=options.fallbackModel??process.env.GEMINI_FALLBACK_TEXT_MODEL??"gemini-3.1-flash-lite";
  const request=options.fetch??fetch;
  const food=options.expectedFood??DEFAULT_FOOD;
  const prompt=promptFor(food.description);
  let useSchema=true;
  const canFallBack=Boolean(fallback)&&fallback!==primary;
  let primaryLimited=false;  // 한 장이 429를 받으면 같은 묶음의 뒤 요청은 바로 다른 모델로 보낸다.

  const call=async(model:string,data:string)=>{
    // 사진 한 장 점검에 20초까지만 기다린다. 넘기면 이 장은 "점검 못 함"(null)으로 두고 표지·캐러셀은 그대로 진행한다.
    // (예전에는 Gemini가 멈추면 표지 후보가 돌아오지 않거나 사진 캐러셀이 "구성을 만들고 있어요"에서 멈췄다.)
    const send=(schema:boolean)=>request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",signal:AbortSignal.timeout(VISION_TIMEOUT_MS),headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
      body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:"image/jpeg",data}}]}],
        generationConfig:{responseMimeType:"application/json",...(schema?{responseJsonSchema:RESPONSE_SCHEMA}:{})}}),
    });
    let response=await send(useSchema);
    if(response.status===400&&useSchema){useSchema=false;response=await send(false);}
    return response;
  };

  const checkOne=async(image:Buffer):Promise<CoverCheck>=>{
    const key=`${createHash("sha1").update(image).digest("hex")}|${food.description}`;
    const cached=cacheGet(key);
    if(cached)return cached;
    // 비용·속도를 위해 512px JPEG로 줄여 보낸다.
    const small=await sharp(image).rotate().resize(512,512,{fit:"inside"}).jpeg({quality:80}).toBuffer();
    const data=small.toString("base64");
    const first=primaryLimited&&canFallBack?fallback:primary;
    let response=await call(first,data);
    // 429면 다른 모델로 한 번만 더, 그래도 안 되면 이 장은 포기한다.
    if(response.status===429&&first===primary&&canFallBack){recordUsage({provider:"gemini-vision",ok:false,status:429});primaryLimited=true;response=await call(fallback,data);}
    // 사용량 장부(설정 화면 "AI 사용량"). 같은 사진은 캐시라 다시 세지 않는다.
    recordUsage({provider:"gemini-vision",ok:response.ok,status:response.status});
    if(!response.ok)throw new GeminiStatusError(response.status);
    const body=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
    const text=body.candidates?.[0]?.content?.parts?.map(part=>part.text??"").join("")??"";
    const fields=CoverCheckSchema.parse(JSON.parse(text));
    const check:CoverCheck={...fields,score:coverScore(fields),warnings:coverWarnings(fields,food.name)};
    cachePut(key,check);
    return check;
  };

  const settled=await Promise.allSettled(images.map(checkOne));
  const failure=settled.find((result):result is PromiseRejectedResult=>result.status==="rejected");
  if(failure){
    if(options.strict)throw failure.reason;
    const reason=failure.reason instanceof Error?failure.reason.message:String(failure.reason);
    console.warn(`[cover-check] ${settled.filter(result=>result.status==="rejected").length}/${images.length}장 점검을 건너뜁니다:`,reason);
  }
  const results=settled.map(result=>result.status==="fulfilled"?result.value:null);
  return results.some(Boolean)?results:null;
}

// 표지 후보 점검. 실패한 장은 "점검 못 함" 자리로 채워 순서·배지에 그대로 쓸 수 있게 한다. 모두 실패하면 null.
export async function checkCoverCandidates(images:Buffer[],options:CoverCheckOptions={}):Promise<CoverCheck[]|null> {
  const results=await scoreImages(images,options);
  if(!results)return null;
  return results.map(result=>result??{
    foodVisible:true,looksLikeSkate:true,textInImage:false,oddHands:false,appetite:3,lighting:3,composition:3,dark:false,blurry:false,clutter:false,food:"",scene:"",
    note:"점검하지 못했어요",score:coverScore({appetite:3,lighting:3,composition:3}),warnings:["AI 점검 실패"],unchecked:true,
  });
}
