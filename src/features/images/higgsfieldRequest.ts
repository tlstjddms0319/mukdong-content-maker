import "server-only";
import sharp from "sharp";
import { HIGGSFIELD_ASPECTS, NANO_BANANA_ASPECTS, POST_RATIO, aspectFrom, type AspectOption } from "./imageAspect";
import type { ImageBrief } from "./schema";
import { buildImagePrompt, candidateBriefs } from "./openaiRequest";

const BASE_URL="https://api.higgsfield.ai";

// Higgsfield 이미지 모델. 앞에서부터 쓰고, 모델 경로가 이 계정에서 열리지 않거나 입력값이 맞지 않으면(400·404·405·422)
// 다음 모델로 넘어간다(그 모델은 6시간 동안 건너뜀). Higgsfield는 실패한 요청에 요금을 매기지 않는다.
// - Nano Banana Pro(Google): 사실적인 음식 사진·글 지시 따르기가 가장 좋고 4:5·2k를 받는다. 경로는 Higgsfield API가 따르는
//   공급자/모델 이름 규칙(예: /xai/grok-imagine-image-2.0, /bytedance/seedream/v4/text-to-image)에 맞춘 것이라,
//   설정 → AI 연결 점검에서 경로가 열렸는지 확인한다. 참고 이미지가 있으면 /edit 경로를 쓴다.
// - Grok Image 2.0(xAI): 예전부터 쓰던 모델. 품질은 medium이 최고값.
// HF_IMAGE_MODEL 환경변수로 먼저 쓸 모델을 고를 수 있다("nano-banana-pro" 또는 "grok-image-2"). HF_IMAGE_MODEL_PATH로
// 첫 모델의 경로를 바꿀 수도 있다(Higgsfield가 경로를 바꾸면 코드 수정 없이 맞추기).
export type HiggsfieldModel={id:string;label:string;path:string;editPath:string;aspects:ReadonlyArray<AspectOption>;defaultRatio:number;body:(prompt:string,aspect:string,referenceUrl?:string)=>Record<string,unknown>};
export const HIGGSFIELD_MODELS:readonly HiggsfieldModel[]=[
  {id:"nano-banana-pro",label:"Nano Banana Pro",path:"/nano-banana-pro",editPath:"/nano-banana-pro/edit",aspects:NANO_BANANA_ASPECTS,defaultRatio:POST_RATIO,
    body:(prompt,aspect,referenceUrl)=>({prompt,aspect_ratio:aspect,resolution:"2k",num_images:1,...(referenceUrl?{image_urls:[referenceUrl]}:{})})},
  {id:"grok-image-2",label:"Grok Image 2.0",path:"/xai/grok-imagine-image-2.0",editPath:"/xai/grok-imagine-image-2.0",aspects:HIGGSFIELD_ASPECTS,defaultRatio:3/4,
    // 품질 값이 low·medium뿐이라 표지도 medium(가장 높은 값)으로 둔다.
    body:(prompt,aspect,referenceUrl)=>({prompt,aspect_ratio:aspect,resolution:"2k",quality:"medium",...(referenceUrl?{image_urls:[referenceUrl]}:{})})},
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

export class HiggsfieldImageError extends Error {
  constructor(public readonly status:number,public readonly reason:"auth"|"credits"|"nsfw"|"failed"|"timeout"="failed") {
    super("Higgsfield image generation failed");
    this.name="HiggsfieldImageError";
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

function errorFor(status:number):HiggsfieldImageError {
  return new HiggsfieldImageError(status,status===401?"auth":status===402||status===403?"credits":"failed");
}

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
  if(!response.ok)throw errorFor(response.status);
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

export type Job={status?:string;status_url?:string;request_id?:string;images?:{url?:string}[];video?:{url?:string}};

// 작업이 끝날 때까지 상태를 물어 완료된 작업을 돌려준다(이미지·영상 공통). 영상은 한 편에 수 분 걸릴 수 있어 timeout을 받는다.
export async function waitForCompletion(job:Job,auth:string,timeoutMs=JOB_TIMEOUT_MS):Promise<Job> {
  const statusUrl=job.status_url??(job.request_id?`${BASE_URL}/requests/${job.request_id}/status`:"");
  if(!statusUrl)throw new HiggsfieldImageError(502);
  const deadline=Date.now()+timeoutMs;
  let current=job;
  while(current.status!=="completed"){
    if(current.status==="nsfw")throw new HiggsfieldImageError(422,"nsfw");
    if(current.status==="failed"||current.status==="canceled")throw new HiggsfieldImageError(502);
    if(Date.now()>deadline)throw new HiggsfieldImageError(504,"timeout");
    await new Promise(resolve=>setTimeout(resolve,POLL_INTERVAL_MS));
    current=await api<Job>(statusUrl,{method:"GET"},auth);
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
    try{return await submit(model,input,auth,referenceUrl);}
    catch(error){
      lastError=error;
      if(!(error instanceof HiggsfieldImageError)||!UNSUPPORTED_STATUSES.has(error.status)||index===models.length-1)throw error;
      unavailable.set(model.id,now()+SKIP_MS);
      console.warn(`[higgsfield] ${model.label} 요청이 받아들여지지 않아(${error.status}) 다음 모델로 만듭니다.`);
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
  if(images.length)throw new HiggsfieldPartialImageError(error.status,error.reason,images);
  throw error;
}
