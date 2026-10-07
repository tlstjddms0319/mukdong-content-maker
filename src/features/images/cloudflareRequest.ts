import "server-only";
import sharp from "sharp";
import type { ImageBrief } from "./schema";
import { buildImagePrompt, candidateBriefs } from "./openaiRequest";
import { cloudflareSize } from "./imageAspect";

const MODEL="@cf/black-forest-labs/flux-2-klein-4b";
const REQUEST_TIMEOUT_MS=60_000;

export class CloudflareConfigurationError extends Error {
  constructor(message="Cloudflare 이미지 AI 연결 정보가 없습니다.") {
    super(message);
    this.name="CloudflareConfigurationError";
  }
}

export class CloudflareImageError extends Error {
  constructor(public readonly status:number) {
    super("Cloudflare image generation failed");
    this.name="CloudflareImageError";
  }
}

export class CloudflarePartialImageError extends CloudflareImageError {
  constructor(status:number,public readonly images:string[]) {
    super(status);
    this.name="CloudflarePartialImageError";
  }
}

type CloudflareEnvelope={success?:boolean;result?:{image?:unknown}};

async function referenceBlob(dataUrl:string) {
  const match=dataUrl.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/);
  if(!match)throw new CloudflareImageError(400);
  const resized=await sharp(Buffer.from(match[1],"base64"))
    .resize({width:512,height:512,fit:"inside",withoutEnlargement:true})
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(resized)],{type:"image/png"});
}

async function generateOne(input:ImageBrief,accountId:string,token:string):Promise<string> {
  const form=new FormData();
  form.append("prompt",buildImagePrompt(input,Boolean(input.referenceImage)));
  // 카드의 사진 칸 비율로 만든다(모르면 예전처럼 세로 1024×1280).
  const size=cloudflareSize(input.windowRatio);
  form.append("width",String(size.width));
  form.append("height",String(size.height));
  if(input.referenceImage)form.append("input_image_0",await referenceBlob(input.referenceImage),"reference.png");
  let response:Response;
  try {
    response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`,{
      method:"POST",
      headers:{Authorization:`Bearer ${token}`},
      body:form,
      signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new CloudflareImageError(504);
  }
  if(!response.ok)throw new CloudflareImageError(response.status);
  const body=await response.json().catch(()=>null) as CloudflareEnvelope|null;
  const image=body?.success===true&&typeof body.result?.image==="string" ? body.result.image : "";
  if(!image)throw new CloudflareImageError(502);
  return `data:image/jpeg;base64,${image}`;
}

export async function generateCloudflareImages(input:ImageBrief):Promise<string[]> {
  const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
  const token=process.env.CLOUDFLARE_API_TOKEN;
  if(!accountId||!token)throw new CloudflareConfigurationError();
  const images:string[]=[];
  for(const brief of candidateBriefs(input)){
    try { images.push(await generateOne(brief,accountId,token)); }
    catch(error) {
      if(images.length&&error instanceof CloudflareImageError)throw new CloudflarePartialImageError(error.status,images);
      throw error;
    }
  }
  return images;
}
