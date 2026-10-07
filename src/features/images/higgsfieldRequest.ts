import "server-only";
import sharp from "sharp";
import type { ImageBrief } from "./schema";
import { buildImagePrompt, candidateBriefs } from "./openaiRequest";

// Higgsfield의 Grok Image 2.0: 음식 사실감이 가장 좋았고 참고 이미지(image_urls)도 받는다. 한 요청에 한 장만 만든다.
const BASE_URL="https://api.higgsfield.ai";
const MODEL_PATH="/xai/grok-imagine-image-2.0";
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
async function downloadAsPost(url:string):Promise<string> {
  let response:Response;
  try { response=await fetch(url,{signal:AbortSignal.timeout(60_000)}); }
  catch { throw new HiggsfieldImageError(504,"timeout"); }
  if(!response.ok)throw new HiggsfieldImageError(502);
  const jpeg=await sharp(Buffer.from(await response.arrayBuffer())).rotate().resize({...OUTPUT,fit:"cover",position:"attention"}).jpeg({quality:92}).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function generateOne(input:ImageBrief,auth:string,referenceUrl?:string):Promise<string> {
  const job=await api<Job>(MODEL_PATH,{method:"POST",body:{
    prompt:buildImagePrompt(input,Boolean(referenceUrl)),
    // 이 모델이 받는 비율 목록에 4:5가 없어(1:1·3:4·2:3·9:16 등) 가장 가까운 3:4로 받아 자른다.
    // 품질 값도 low·medium뿐이라 표지도 medium(가장 높은 값)으로 둔다.
    aspect_ratio:"3:4",
    resolution:"2k",
    quality:"medium",
    ...(referenceUrl?{image_urls:[referenceUrl]}:{}),
  }},auth);
  return downloadAsPost(await waitForJob(job,auth));
}

export async function generateHiggsfieldImages(input:ImageBrief):Promise<string[]> {
  const auth=authorization();
  const referenceUrl=input.referenceImage?await uploadReference(input.referenceImage,auth):undefined;
  // 한 장에 2분 가까이 걸려서 후보 여러 장은 동시에 요청한다. 후보마다 구도가 다른 요청이다.
  const results=await Promise.allSettled(candidateBriefs(input).map(brief=>generateOne(brief,auth,referenceUrl)));
  const images=results.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
  const failure=results.find((result):result is PromiseRejectedResult=>result.status==="rejected")?.reason;
  if(!failure)return images;
  const error=failure instanceof HiggsfieldImageError?failure:new HiggsfieldImageError(502);
  if(images.length)throw new HiggsfieldPartialImageError(error.status,error.reason,images);
  throw error;
}
