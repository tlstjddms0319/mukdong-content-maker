import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { ImageBriefSchema, type ImageBrief } from "@/features/images/schema";
import { normalizeCardLayout, photosNeeded } from "@/features/images/design";
import { AiConfigurationError, getOpenAIClient } from "@/lib/ai/openaiClient";
import { buildImageEditRequest, buildImageRequest, candidateBriefs } from "@/features/images/openaiRequest";
import { classifyOpenAIImageError } from "@/features/images/openaiError";
import { composeSlideImage } from "@/features/images/composeSlide";
import { CloudflareConfigurationError, CloudflareImageError, CloudflarePartialImageError, generateCloudflareImages } from "@/features/images/cloudflareRequest";
import { readSettings } from "@/features/settings/repository";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { AppSettingsSchema, type AppSettings } from "@/features/settings/schema";
import { HiggsfieldConfigurationError, HiggsfieldImageError, HiggsfieldPartialImageError, generateHiggsfieldImages, isHiggsfieldConfigured } from "@/features/images/higgsfieldRequest";
import sharp from "sharp";

type ImageProvider="higgsfield"|"cloudflare"|"openai";
const PROVIDER_LABELS:Record<ImageProvider,string>={higgsfield:"Higgsfield",cloudflare:"Cloudflare",openai:"OpenAI"};
const HIGGSFIELD_MESSAGES:Record<HiggsfieldImageError["reason"],string>={
  auth:"Higgsfield 키를 확인해 주세요.",
  credits:"Higgsfield 크레딧이 부족해요. 충전하거나 설정에서 다른 이미지 AI를 골라 주세요.",
  nsfw:"이미지 안전 검사에 걸렸어요. 수정 요청을 바꿔 다시 시도해 주세요.",
  timeout:"이미지 생성이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 시도해 주세요.",
  failed:"이미지 생성에 실패했습니다. 잠시 뒤 다시 시도하거나 직접 사진을 넣어 주세요.",
};

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
    // An unreadable settings file falls back to defaults, but fails closed on cost: no paid OpenAI call
    // can be triggered by a settings read failure, only the free Cloudflare path.
    // 브라우저형·Q&A·대형 숫자처럼 사진이 없는 레이아웃은 이미지 AI를 부르지 않는다.
    if(parsed.data.slide&&parsed.data.slideLayout!=="overlay"&&photosNeeded(normalizeCardLayout(parsed.data.slide))===0){
      const composed=await composeSlideImage([],parsed.data.slide,parsed.data.slideIndex??1,parsed.data.slideTotal??parsed.data.count,"card",parsed.data.design);
      return NextResponse.json({images:[`data:image/jpeg;base64,${composed.toString("base64")}`],source:"design",provider:"none",fallback:false});
    }
    const settings:AppSettings=(await readSettings().catch((error)=>{console.warn("[settings] 설정을 읽지 못해 무료 이미지 경로만 사용합니다:",error instanceof Error?error.message:String(error));return null;}))
      ??{...AppSettingsSchema.parse(DEFAULT_SETTINGS),imageAiProvider:"cloudflare"};
    // 후보마다 구도가 다른 프롬프트라 n장을 한 번에 요청하지 않고, 한 장씩 동시에 요청한다.
    const generateWithOpenAI=async(input:ImageBrief)=>{
      const client=getOpenAIClient();
      const results=await Promise.all(candidateBriefs(input).map(async brief=>{
        const result=brief.referenceImage
          ? await client.images.edit(await buildImageEditRequest({...brief,referenceImage:brief.referenceImage},settings.imageQuality))
          : await client.images.generate(buildImageRequest(brief,settings.imageQuality));
        return (result.data??[]).map((item)=>item.b64_json?`data:image/png;base64,${item.b64_json}`:item.url).filter((value):value is string=>Boolean(value));
      }));
      return results.flat();
    };
    // 자동은 키가 있는 Higgsfield부터, 실패하면 무료 Cloudflare, 마지막으로 OpenAI 순서로 남은 장수만 이어서 만든다.
    const chain:ImageProvider[]=settings.imageAiProvider==="automatic"
      ?[...(isHiggsfieldConfigured()?["higgsfield" as const]:[]),"cloudflare","openai"]
      :[settings.imageAiProvider];
    const generators:Record<ImageProvider,(input:ImageBrief)=>Promise<string[]>>={
      higgsfield:generateHiggsfieldImages,
      cloudflare:generateCloudflareImages,
      openai:generateWithOpenAI,
    };
    let images:string[]=[];
    const used:ImageProvider[]=[];
    for(const [index,name] of chain.entries()){
      // 앞 제공자가 일부만 만들었으면 남은 장수만, 그리고 이어지는 후보 번호부터 요청한다.
      try { images=[...images,...await generators[name]({...parsed.data,count:parsed.data.count-images.length,candidateOffset:images.length})]; used.push(name); break; }
      catch(error) {
        const completed=error instanceof CloudflarePartialImageError||error instanceof HiggsfieldPartialImageError?error.images:[];
        if(completed.length){images=[...images,...completed];used.push(name);}
        if(index===chain.length-1)throw error;
        console.warn(`[images] ${name} 생성 실패, 다음 이미지 AI로 전환합니다:`,error instanceof Error?error.name:String(error));
      }
    }
    const provider=used.length>1?"mixed":used[0];
    const fallback=used[0]!==chain[0]||used.length>1;
    const notice=fallback?`${PROVIDER_LABELS[chain[0]]} 생성이 어려워 ${PROVIDER_LABELS[used[used.length-1]]}(으)로 전환했어요.`:undefined;
    if (images.length !== parsed.data.count) throw new Error("incomplete image result");
    const referenceImages:string[]=[];
    // 콜라주·비교처럼 사진 여러 장을 쓰는 레이아웃은 만든 사진을 모두 한 카드에 넣는다.
    if(parsed.data.slide&&parsed.data.slideLayout!=="overlay"&&photosNeeded(normalizeCardLayout(parsed.data.slide))>1&&images.length>1){
      const originals=await Promise.all(images.map(imageBytes));
      const composed=await composeSlideImage(originals,parsed.data.slide,parsed.data.slideIndex??1,parsed.data.slideTotal??parsed.data.count,"card",parsed.data.design);
      images=[`data:image/jpeg;base64,${composed.toString("base64")}`];
    }else if(parsed.data.slide)images=await Promise.all(images.map(async (source,index)=>{
      const slideIndex=parsed.data.slideIndex ?? index+1;
      const slideTotal=parsed.data.slideTotal ?? parsed.data.count;
      const original=await imageBytes(source);
      if(parsed.data.slide?.role==="cover"){
        const reference=await sharp(original).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
        referenceImages[index]=`data:image/jpeg;base64,${reference.toString("base64")}`;
      }
      const composed=await composeSlideImage(original,parsed.data.slide!,slideIndex,slideTotal,parsed.data.slideLayout,parsed.data.design);
      return `data:image/jpeg;base64,${composed.toString("base64")}`;
    }));
    return NextResponse.json({ images, ...(referenceImages.length?{referenceImages}:{}), source:parsed.data.referenceImage&&parsed.data.referenceMode!=="continuity"?"ai-edited":"ai-generated", provider, fallback, ...(notice?{notice}:{}), disclosure:"AI 연출 이미지입니다. 실제 메뉴와 다를 수 있어요." });
  } catch (error) {
    if(error instanceof HiggsfieldConfigurationError)return NextResponse.json({message:error.message,retryable:false},{status:503});
    if(error instanceof HiggsfieldImageError)return NextResponse.json({message:HIGGSFIELD_MESSAGES[error.reason],retryable:error.reason!=="auth"&&error.reason!=="credits"},{status:error.reason==="nsfw"?422:502});
    if(error instanceof CloudflareConfigurationError)return NextResponse.json({message:error.message,retryable:false},{status:503});
    if(error instanceof CloudflareImageError)return NextResponse.json({message:error.status===401?"Cloudflare API 토큰을 확인해 주세요.":"무료 이미지 생성에 실패했습니다. 잠시 뒤 다시 시도하거나 직접 사진을 넣어 주세요.",retryable:error.status!==401},{status:502});
    const detail = error instanceof AiConfigurationError ? {message:error.message,retryable:false} : classifyOpenAIImageError(error);
    return NextResponse.json(detail, { status:error instanceof AiConfigurationError ? 503 : 502 });
  }
}
