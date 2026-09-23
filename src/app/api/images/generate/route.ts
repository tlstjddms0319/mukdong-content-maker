import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { ImageBriefSchema } from "@/features/images/schema";
import { AiConfigurationError, getOpenAIClient } from "@/lib/ai/openaiClient";
import { buildImageEditRequest, buildImageRequest } from "@/features/images/openaiRequest";
import { classifyOpenAIImageError } from "@/features/images/openaiError";
import { composeSlideImage } from "@/features/images/composeSlide";
import { CloudflareConfigurationError, CloudflareImageError, CloudflarePartialImageError, generateCloudflareImages } from "@/features/images/cloudflareRequest";
import { readSettings } from "@/features/settings/repository";

async function imageBytes(source:string):Promise<Buffer> {
  const data=source.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if(data)return Buffer.from(data[1],"base64");
  const response=await fetch(source);
  if(!response.ok)throw new Error("image download failed");
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed = ImageBriefSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "이미지 설정을 확인해 주세요." }, { status: 400 });
  try {
    const settings=await readSettings();
    const generateWithOpenAI=async(count=parsed.data.count)=>{
      const client=getOpenAIClient();
      const input={...parsed.data,count};
      const result=parsed.data.referenceImage
        ? await client.images.edit(await buildImageEditRequest({...input,referenceImage:parsed.data.referenceImage}))
        : await client.images.generate(buildImageRequest(input));
      return (result.data??[]).map((item)=>item.b64_json?`data:image/png;base64,${item.b64_json}`:item.url).filter((value):value is string=>Boolean(value));
    };
    let provider:"cloudflare"|"openai"|"mixed"=settings.imageAiProvider==="openai"?"openai":"cloudflare";
    let fallback=false;
    let images:string[];
    if(provider==="openai")images=await generateWithOpenAI();
    else {
      try { images=await generateCloudflareImages(parsed.data); }
      catch(error) {
        if(settings.imageAiProvider==="cloudflare")throw error;
        const completed=error instanceof CloudflarePartialImageError?error.images:[];
        images=[...completed,...await generateWithOpenAI(parsed.data.count-completed.length)];
        provider=completed.length?"mixed":"openai";
        fallback=true;
      }
    }
    if (images.length !== parsed.data.count) throw new Error("incomplete image result");
    if(parsed.data.slide)images=await Promise.all(images.map(async (source,index)=>{
      const slideIndex=parsed.data.slideIndex ?? index+1;
      const slideTotal=parsed.data.slideTotal ?? parsed.data.count;
      const composed=await composeSlideImage(await imageBytes(source),parsed.data.slide!,slideIndex,slideTotal);
      return `data:image/jpeg;base64,${composed.toString("base64")}`;
    }));
    return NextResponse.json({ images, source:parsed.data.referenceImage?"ai-edited":"ai-generated", provider, fallback, disclosure:"AI로 만든 이미지입니다." });
  } catch (error) {
    if(error instanceof CloudflareConfigurationError)return NextResponse.json({message:error.message,retryable:false},{status:503});
    if(error instanceof CloudflareImageError)return NextResponse.json({message:error.status===401?"Cloudflare API 토큰을 확인해 주세요.":"무료 이미지 생성에 실패했습니다. 잠시 뒤 다시 시도하거나 직접 사진을 넣어 주세요.",retryable:error.status!==401},{status:502});
    const detail = error instanceof AiConfigurationError ? {message:error.message,retryable:false} : classifyOpenAIImageError(error);
    return NextResponse.json(detail, { status:error instanceof AiConfigurationError ? 503 : 502 });
  }
}
