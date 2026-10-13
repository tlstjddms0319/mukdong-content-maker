import "server-only";
import sharp from "sharp";
import { HIGGSFIELD_ASPECTS, NANO_BANANA_ASPECTS, POST_RATIO, aspectFrom, type AspectOption } from "./imageAspect";
import type { ImageBrief } from "./schema";
import { buildImagePrompt, candidateBriefs } from "./openaiRequest";

const BASE_URL="https://api.higgsfield.ai";

// Higgsfield 이미지 모델. 앞에서부터 쓰고, 모델 경로가 이 계정에서 열리지 않거나 입력값이 맞지 않으면(400·404·405·422)
// 다음 모델로 넘어간다(그 모델은 6시간 동안 건너뜀). Higgsfield는 실패한 요청에 요금을 매기지 않는다.
// - Grok Image 2.0(xAI): 기본(첫 번째) 모델. 품질은 medium이 최고값.
//   2026-10-10 Higgsfield API 대시보드: 이번 달 처리·청구된 요청 109건이 전부 Grok Image 2.0이었고 Nano Banana Pro는
//   한 건도 없었다. 즉 이 계정의 API에서는 Nano Banana Pro가 처리되지 않고(앱 기록은 503), 매 장마다 실패하는 Nano를
//   먼저 두드리느라 시간이 걸리고 실패가 쌓였다. 그래서 실제로 되는 Grok을 먼저 쓴다.
// - Nano Banana Pro(Google): 예비 모델. 사실적인 음식 사진·4:5·2k를 받지만 이 계정 API에서는 아직 처리된 적이 없다.
//   참고 이미지가 있으면 /edit 경로를 쓴다.
// HF_IMAGE_MODEL 환경변수로 먼저 쓸 모델을 고를 수 있다("grok-image-2" 또는 "nano-banana-pro"). HF_IMAGE_MODEL_PATH로
// 첫 모델의 경로를 바꿀 수도 있다(Higgsfield가 경로를 바꾸면 코드 수정 없이 맞추기).
export type HiggsfieldModel={id:string;label:string;path:string;editPath:string;aspects:ReadonlyArray<AspectOption>;defaultRatio:number;body:(prompt:string,aspect:string,referenceUrl?:string)=>Record<string,unknown>};
export const HIGGSFIELD_MODELS:readonly HiggsfieldModel[]=[
  {id:"grok-image-2",label:"Grok Image 2.0",path:"/xai/grok-imagine-image-2.0",editPath:"/xai/grok-imagine-image-2.0",aspects:HIGGSFIELD_ASPECTS,defaultRatio:3/4,
    // 품질 값이 low·medium뿐이라 표지도 medium(가장 높은 값)으로 둔다.
    body:(prompt,aspect,referenceUrl)=>({prompt,aspect_ratio:aspect,resolution:"2k",quality:"medium",...(referenceUrl?{image_urls:[referenceUrl]}:{})})},
  {id:"nano-banana-pro",label:"Nano Banana Pro",path:"/nano-banana-pro",editPath:"/nano-banana-pro/edit",aspects:NANO_BANANA_ASPECTS,defaultRatio:POST_RATIO,
    body:(prompt,aspect,referenceUrl)=>({prompt,aspect_ratio:aspect,resolution:"2k",num_images:1,...(referenceUrl?{image_urls:[referenceUrl]}:{})})},
];
export function higgsfieldModels(env:Record<string,string|undefined>=process.env):HiggsfieldModel[] {
  const preferred=env.HF_IMAGE_MODEL?.trim();
  const ordered=[...HIGGSFIELD_MODELS].sort((a,b)=>(a.id===preferred?-1:0)-(b.id===preferred?-1:0));
  const path=env.HF_IMAGE_MODEL_PATH?.trim();
  return path?ordered.map((model,index)=>index===0?{...model,path:path.startsWith("/")?path:`/${path}`,editPath:path.startsWith("/")?path:`/${path}`}:model):ordered;
}
// 경로·입력값이 맞지 않아 건너뛰는 모델(모델 id → 다시 시도할 시각).
const unavailable=new Map<string,number>();
const SKIP_MS=6*3_600_000;
export const UNSUPPORTED_STATUSES=new Set([400,404,405,422]);
const isModelDisabled=(error:HiggsfieldImageError)=>/model_disabled/.test(error.detail);
// 서버가 잠깐 바쁘거나 문제가 있을 때의 답. 다른 모델로 넘어가거나(요청) 다시 묻는다(상태 확인).
export const BUSY_STATUSES=new Set([500,502,503]);
const BUSY_SKIP_MS=10*60_000;
let BUSY_RETRY_MS=5_000;
export function setHiggsfieldBusyRetryForTests(ms:number){BUSY_RETRY_MS=ms;}
export function resetHiggsfieldModelSkips(){unavailable.clear();}
const POLL_INTERVAL_MS=3_000;
const JOB_TIMEOUT_MS=5*60_000;
const REQUEST_TIMEOUT_MS=30_000;
const OUTPUT={width:1080,height:1350};

export class HiggsfieldConfigurationError extends Error {
  constructor(message="Higgsfield 이미지 AI 연결 정보가 없습니다.") {
    super(message);
    this.name="HiggsfieldConfigurationError";
  }
}

// detail: Higgsfield가 보낸 응답 본문(앞부분)과 어느 모델·단계에서 났는지. 예전에는 상태 코드만 남아 "작업 실패 (코드 503)"이
// 왜인지(모델 과부하·잔액·주소) 알 수 없었다(사장님 지적 2026-10-10). 설정 카드와 서버 로그에 그대로 보여 준다.
export class HiggsfieldImageError extends Error {
  public detail="";
  constructor(public readonly status:number,public readonly reason:"auth"|"credits"|"nsfw"|"failed"|"timeout"="failed",detail="") {
    super("Higgsfield image generation failed");
    this.name="HiggsfieldImageError";
    this.detail=detail;
  }
}

export class HiggsfieldPartialImageError extends HiggsfieldImageError {
  constructor(status:number,reason:HiggsfieldImageError["reason"],public readonly images:string[]) {
    super(status,reason);
    this.name="HiggsfieldPartialImageError";
  }
}

export function isHiggsfieldConfigured(env:NodeJS.ProcessEnv=process.env):boolean {
  return Boolean(env.HF_API_KEY_ID?.trim()&&env.HF_API_KEY_SECRET?.trim());
}

export function authorization():string {
  const id=process.env.HF_API_KEY_ID?.trim();
  const secret=process.env.HF_API_KEY_SECRET?.trim();
  if(!id||!secret)throw new HiggsfieldConfigurationError();
  return `Key ${id}:${secret}`;
}

function errorFor(status:number,detail=""):HiggsfieldImageError {
  return new HiggsfieldImageError(status,status===401?"auth":status===402||status===403?"credits":"failed",detail);
}
// 응답 본문을 한 줄로(최대 240자). 키·토큰 같은 값은 본문에 오지 않지만 혹시 몰라 Key/Bearer 뒤는 가린다.
const bodyText=async(response:Response)=>{
  try{return (await response.text()).replace(/\s+/g," ").replace(/(Key|Bearer)\s+\S+/gi,"$1 ***").trim().slice(0,240);}catch{return "";}
};

export async function api<T>(path:string,init:{method:"GET"|"POST";body?:unknown},auth:string):Promise<T> {
  let response:Response;
  try {
    response=await fetch(path.startsWith("https://")?path:`${BASE_URL}${path}`,{
      method:init.method,
      headers:{Authorization:auth,Accept:"application/json",...(init.body===undefined?{}:{"Content-Type":"application/json"})},
      ...(init.body===undefined?{}:{body:JSON.stringify(init.body)}),
      signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { throw new HiggsfieldImageError(504,"timeout"); }
  if(!response.ok)throw errorFor(response.status,`${init.method} ${path.replace(BASE_URL,"")}: ${await bodyText(response)}`);
  return await response.json() as T;
}

// Higgsfield는 참고 이미지를 공개 URL로만 받는다. 미리 서명된 주소에 올리고 받은 public_url을 넘긴다.
export async function uploadReference(dataUrl:string,auth:string):Promise<string> {
  const match=dataUrl.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/);
  if(!match)throw new HiggsfieldImageError(400);
  const jpeg=await sharp(Buffer.from(match[1],"base64")).rotate().resize({width:1536,height:1536,fit:"inside",withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
  const target=await api<{upload_url?:string;public_url?:string;upload_headers?:Record<string,string>}>("/files/generate-upload-url",{method:"POST",body:{content_type:"image/jpeg"}},auth);
  if(!target.upload_url||!target.public_url)throw new HiggsfieldImageError(502);
  let uploaded:Response;
  try {
    // 서명된 저장소 주소에는 Higgsfield 인증 헤더를 보내지 않는다.
    uploaded=await fetch(target.upload_url,{method:"PUT",headers:target.upload_headers??{"Content-Type":"image/jpeg"},body:new Uint8Array(jpeg),signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
  } catch { throw new HiggsfieldImageError(504,"timeout"); }
  if(!uploaded.ok)throw new HiggsfieldImageError(502);
  return target.public_url;
}

// error·detail·message·failure_reason: 작업이 failed로 끝났을 때 Higgsfield가 붙여 주는 이유(있으면). 운영 로그(2026-10-13)에
// "Grok Image 2.0 … 작업 상태 failed"만 남아 왜 실패했는지 알 수 없었다. 어떤 이름으로 오든 한 줄로 남긴다.
export type Job={status?:string;status_url?:string;request_id?:string;images?:{url?:string}[];video?:{url?:string};error?:unknown;detail?:unknown;message?:unknown;failure_reason?:unknown};
export function jobFailureReason(job:Job):string {
  const value=[job.error,job.failure_reason,job.detail,job.message].find(item=>item!==undefined&&item!==null&&item!=="");
  if(value===undefined)return "";
  return (typeof value==="string"?value:JSON.stringify(value)).replace(/\s+/g," ").slice(0,160);
}

// 작업이 끝날 때까지 상태를 물어 완료된 작업을 돌려준다(이미지·영상 공통). 영상은 한 편에 수 분 걸릴 수 있어 timeout을 받는다.
export async function waitForCompletion(job:Job,auth:string,timeoutMs=JOB_TIMEOUT_MS):Promise<Job> {
  const statusUrl=job.status_url??(job.request_id?`${BASE_URL}/requests/${job.request_id}/status`:"");
  if(!statusUrl)throw new HiggsfieldImageError(502);
  const deadline=Date.now()+timeoutMs;
  let current=job;
  while(current.status!=="completed"){
    if(current.status==="nsfw")throw new HiggsfieldImageError(422,"nsfw");
    if(current.status==="failed"||current.status==="canceled"){const reason=jobFailureReason(current);throw new HiggsfieldImageError(502,"failed",`작업 상태 ${current.status}${reason?` (${reason})`:""}`);}
    if(Date.now()>deadline)throw new HiggsfieldImageError(504,"timeout");
    await new Promise(resolve=>setTimeout(resolve,POLL_INTERVAL_MS));
    // 상태 확인 중 서버가 잠깐 바쁘다고(5xx) 답하면 작업은 살아 있으니 다시 묻는다. 예전에는 한 번의 503으로 만든 그림을 버렸다.
    try{current=await api<Job>(statusUrl,{method:"GET"},auth);}
    catch(error){if(error instanceof HiggsfieldImageError&&BUSY_STATUSES.has(error.status))continue;throw error;}
  }
  return current;
}

async function waitForJob(job:Job,auth:string):Promise<string> {
  const url=(await waitForCompletion(job,auth)).images?.[0]?.url;
  if(!url)throw new HiggsfieldImageError(502);
  return url;
}

// 결과는 3:4로 오므로 게시물 비율(4:5, 1080×1350)로 잘라 JPEG data URL로 돌려준다.
// 자르는 자리는 가운데가 아니라 attention(눈에 띄는 부분: 채도·밝기 대비가 큰 곳)으로 잡아, 접시가 위아래로 치우친 사진에서도
// 주인공 음식이 잘리지 않게 한다. 3:4 → 4:5는 세로를 약 6%만 덜어 내므로 구도가 크게 바뀌지 않는다.
// 카드의 사진 칸 비율로 만든 그림(keepAspect)은 자르지 않고 그대로(긴 변 2160px 이하로만) 돌려준다. 칸 비율로 만든 그림을
// 4:5로 또 자르면 다시 잘린다.
async function downloadAsPost(url:string,keepAspect=false):Promise<string> {
  let response:Response;
  try { response=await fetch(url,{signal:AbortSignal.timeout(60_000)}); }
  catch { throw new HiggsfieldImageError(504,"timeout"); }
  if(!response.ok)throw new HiggsfieldImageError(502);
  const image=sharp(Buffer.from(await response.arrayBuffer())).rotate();
  const jpeg=await (keepAspect?image.resize({width:2160,height:2160,fit:"inside",withoutEnlargement:true}):image.resize({...OUTPUT,fit:"cover",position:"attention"})).jpeg({quality:92}).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

// 모델에 맞춰 요청을 보낸다. 카드의 사진 칸 비율에 가장 가까운 비율로 만들고, 칸 비율을 모르면 모델 기본 비율로 받아 4:5로 자른다.
async function submit(model:HiggsfieldModel,input:ImageBrief,auth:string,referenceUrl?:string):Promise<string> {
  const aspect=aspectFrom(model.aspects,input.windowRatio??model.defaultRatio);
  const job=await api<Job>(referenceUrl?model.editPath:model.path,{method:"POST",body:model.body(buildImagePrompt(input,Boolean(referenceUrl)),aspect,referenceUrl)},auth);
  return downloadAsPost(await waitForJob(job,auth),input.windowRatio!==undefined);
}

// 앞 모델부터 시도하고, 경로·입력값이 맞지 않는 모델은 건너뛰고 다음 모델로 만든다.
async function generateOne(input:ImageBrief,auth:string,referenceUrl?:string,now=Date.now):Promise<string> {
  const models=higgsfieldModels();
  let lastError:unknown;
  for(const [index,model] of models.entries()){
    const until=unavailable.get(model.id);
    if(until&&until>now()&&index<models.length-1)continue;
    // 서버가 바쁘다(503 등)고 하면 같은 모델로 한 번 더(잠깐 쉬고) 시도한다. 과부하는 대개 금방 풀린다.
    const attempt=async()=>{
      try{return await submit(model,input,auth,referenceUrl);}
      catch(error){
        if(!(error instanceof HiggsfieldImageError)||!BUSY_STATUSES.has(error.status))throw error;
        // "model_disabled"(운영 로그 2026-10-13: Nano Banana Pro 503 {"detail":"model_disabled"})는 바쁜 게 아니라 이 계정에서 꺼진 모델이다.
        // 5초 기다려 다시 묻지 않고 바로 다음 모델로 넘긴다(아래에서 오래 건너뛴다).
        if(isModelDisabled(error))throw error;
        console.warn(`[higgsfield] ${model.label} 서버가 바빠요(${error.status}). ${BUSY_RETRY_MS/1000}초 뒤 한 번 더 시도합니다. ${error.detail}`);
        await new Promise(resolve=>setTimeout(resolve,BUSY_RETRY_MS));
        return await submit(model,input,auth,referenceUrl);
      }
    };
    try{return await attempt();}
    catch(error){
      if(error instanceof HiggsfieldImageError)error.detail=`${model.label} ${error.status} ${error.detail}`.trim().slice(0,300);
      lastError=error;
      const unsupported=error instanceof HiggsfieldImageError&&UNSUPPORTED_STATUSES.has(error.status);
      // 서버가 바쁘다(500·502·503)고 답한 모델도 다음 모델로 넘어간다(사장님 화면 2026-10-10: 코드 503 "작업 실패"가 이어졌는데,
      // 예전에는 Grok으로 넘어가지 않고 바로 실패했다). 바쁜 모델은 잠깐(10분)만 건너뛴다.
      const disabled=error instanceof HiggsfieldImageError&&isModelDisabled(error);
      const busy=error instanceof HiggsfieldImageError&&BUSY_STATUSES.has(error.status)&&!disabled;
      if((!unsupported&&!busy&&!disabled)||index===models.length-1)throw error;
      unavailable.set(model.id,now()+(busy?BUSY_SKIP_MS:SKIP_MS));
      if(disabled)console.warn(`[higgsfield] ${model.label}은(는) 이 계정에서 꺼진 모델이라(model_disabled) ${SKIP_MS/3_600_000}시간 건너뜁니다.`);
      console.warn(`[higgsfield] ${model.label} 요청이 ${busy?"서버가 바빠 실패해":"받아들여지지 않아"}(${(error as HiggsfieldImageError).status}) 다음 모델로 만듭니다.`);
    }
  }
  throw lastError??new HiggsfieldImageError(502);
}

export async function generateHiggsfieldImages(input:ImageBrief):Promise<string[]> {
  const auth=authorization();
  // 표지를 이어 가는 장(continuity)에는 표지 이미지를 넘기지 않는다. 이 모델은 참고 이미지를 따르는 정도를 조절할 수 없어
  // 같은 접시·같은 "집어 든 한 점"을 장마다 거의 그대로 복사했다(장 문구가 "묵은지에 싸요"여도). 색감·그릇의 통일감은
  // 프롬프트의 공통 스타일(styleAnchor)로 잇는다. 사장님 사진을 살리는 source·style 모드는 그대로 참고 이미지를 쓴다.
  const useReference=Boolean(input.referenceImage)&&input.referenceMode!=="continuity";
  const referenceUrl=useReference?await uploadReference(input.referenceImage!,auth):undefined;
  // 한 장에 2분 가까이 걸려서 후보 여러 장은 동시에 요청한다. 후보마다 구도가 다른 요청이다.
  const results=await Promise.allSettled(candidateBriefs(input).map(brief=>generateOne(brief,auth,referenceUrl)));
  const images=results.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
  const failure=results.find((result):result is PromiseRejectedResult=>result.status==="rejected")?.reason;
  if(!failure)return images;
  const error=failure instanceof HiggsfieldImageError?failure:new HiggsfieldImageError(502);
  if(images.length){const partial=new HiggsfieldPartialImageError(error.status,error.reason,images);partial.detail=error.detail;throw partial;}
  throw error;
}
