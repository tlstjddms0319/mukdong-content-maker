import "server-only";
import { HiggsfieldImageError, api, authorization, uploadReference, waitForCompletion, type Job } from "@/features/images/higgsfieldRequest";

// 릴스 첫 장면용 AI 영상. 표지의 글자 없는 원본 사진을 Higgsfield DoP(사진을 짧은 영상으로 움직이는 모델)에 보내
// 김이 피어오르고 카메라가 천천히 다가가는 3~5초 영상을 만든다. 크레딧을 쓰므로 사용자가 고를 때만 부른다.
// 브라우저가 캔버스에 그려 녹화해야 하므로(다른 주소의 영상은 캔버스에 그리면 녹화가 막힌다) 영상을 받아 data URL로 돌려준다.
const VIDEO_TIMEOUT_MS=8*60_000;
const MAX_VIDEO_BYTES=25*1024*1024;

export const INTRO_PROMPT="Slow cinematic push-in toward the plate of thinly sliced skate sashimi, gentle steam and soft light shimmer, chopsticks barely moving, natural restaurant ambience. Keep the food shape and colors exactly as in the photo. No text.";

export async function generateIntroVideo(imageDataUrl:string,options:{fetch?:typeof fetch}={}):Promise<string> {
  const auth=authorization();
  const imageUrl=await uploadReference(imageDataUrl,auth);
  const job=await api<Job>("/v1/image2video/dop",{method:"POST",body:{
    model:"dop-turbo",
    prompt:INTRO_PROMPT,
    input_images:[{type:"image_url",image_url:imageUrl}],
  }},auth);
  const done=await waitForCompletion(job,auth,VIDEO_TIMEOUT_MS);
  const url=done.video?.url;
  if(!url)throw new HiggsfieldImageError(502);
  const request=options.fetch??fetch;
  let response:Response;
  try{response=await request(url,{signal:AbortSignal.timeout(120_000)});}
  catch{throw new HiggsfieldImageError(504,"timeout");}
  if(!response.ok)throw new HiggsfieldImageError(502);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>MAX_VIDEO_BYTES)throw new HiggsfieldImageError(502);
  return `data:video/mp4;base64,${bytes.toString("base64")}`;
}
