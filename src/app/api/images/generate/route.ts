import { NextResponse } from "next/server";
import { recordUsage, type UsageProvider } from "@/lib/usage/ledger";
import { ownerApiError } from "@/features/auth/guard";
import { ImageBriefSchema, type ImageBrief } from "@/features/images/schema";
import { normalizeCardLayout, photosNeeded } from "@/features/images/design";
import { AiConfigurationError, getOpenAIClient } from "@/lib/ai/openaiClient";
import { buildImageEditRequest, buildImageRequest, candidateBriefs } from "@/features/images/openaiRequest";
import { classifyOpenAIImageError } from "@/features/images/openaiError";
import { composeSlideCard } from "@/features/images/composeSlide";
import { CloudflareConfigurationError, CloudflareImageError, CloudflarePartialImageError, generateCloudflareImages } from "@/features/images/cloudflareRequest";
import { readSettings } from "@/features/settings/repository";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { AppSettingsSchema, type AppSettings } from "@/features/settings/schema";
import { HiggsfieldConfigurationError, HiggsfieldImageError, HiggsfieldPartialImageError, generateHiggsfieldImages, isHiggsfieldConfigured } from "@/features/images/higgsfieldRequest";
import sharp from "sharp";
import { prepareRemoteCutouts } from "@/features/images/remoteCutout";
import { viewOf } from "@/features/images/render/photoView";
import { photoWindowRatio } from "@/features/images/photoWindow";
import { checkCoverCandidates, coverRank, expectedFoodFrom } from "@/features/images/coverCheck";

type ImageProvider="higgsfield"|"cloudflare"|"openai";
const PROVIDER_LABELS:Record<ImageProvider,string>={higgsfield:"Higgsfield",cloudflare:"Cloudflare",openai:"OpenAI"};
const USAGE_IDS:Record<ImageProvider,UsageProvider>={higgsfield:"higgsfield",cloudflare:"cloudflare-image",openai:"openai-image"};
// 실패의 HTTP 상태(알 수 있을 때만). 429면 사용량 장부가 "한도 초과"로 센다.
const imageErrorStatus=(error:unknown)=>{const status=(error as {status?:unknown})?.status;return typeof status==="number"?status:0;};
const HIGGSFIELD_MESSAGES:Record<HiggsfieldImageError["reason"],string>={
  auth:"Higgsfield 키를 확인해 주세요.",
  credits:"Higgsfield 크레딧이 부족해요. 충전하거나 설정에서 다른 이미지 AI를 골라 주세요.",
  nsfw:"이미지 안전 검사에 걸렸어요. 수정 요청을 바꿔 다시 시도해 주세요.",
  timeout:"이미지 생성이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 시도해 주세요.",
  failed:"이미지 생성에 실패했습니다. 잠시 뒤 다시 시도하거나 직접 사진을 넣어 주세요.",
};

// 글자를 얹기 전 밑바탕 사진(카드 글자 직접 고치기용). 화면이 들고 있다가 글자만 바꿔 다시 그릴 때 photos로 보낸다.
async function baseImage(original:Buffer):Promise<string> {
  const base=await sharp(original).rotate().resize({width:1440,height:1440,fit:"inside",withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
  return `data:image/jpeg;base64,${base.toString("base64")}`;
}

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
    const settings:AppSettings=(await readSettings().catch((error)=>{console.warn("[settings] 설정을 읽지 못해 무료 이미지 경로만 사용합니다:",error instanceof Error?error.message:String(error));return null;}))
      ??{...AppSettingsSchema.parse(DEFAULT_SETTINGS),imageAiProvider:"cloudflare"};
    // 브랜드 키트: 카드 바닥글에 가게 이름과 함께 찍을 Instagram 계정(설정 화면).
    // 원격 누끼(설정, 기본 꺼짐): 누끼 계열이면 렌더 전에 로컬 누끼가 어려운 사진만 Higgsfield 배경 제거로 받아 둔다.
    // 렌더는 받아 둔 것을 조회만 하고, 없거나 실패하면 로컬 누끼로 그린다(features/images/remoteCutout.ts).
    const remoteCutout=settings.remoteCutout===true&&parsed.data.slideLayout!=="overlay";
    const prepareCutouts=(photos:Buffer[])=>prepareRemoteCutouts(photos,{enabled:remoteCutout,style:parsed.data.design?.style,monthlyCredits:settings.remoteCutoutMonthlyCredits??20}).catch(()=>0);
    const cardOptions={brandHandle:settings.brandHandle??"",remoteCutout,storeCard:parsed.data.storeCard===true,...(parsed.data.panorama?{panorama:parsed.data.panorama}:{})};
    // 이미지 AI가 만든 밑바탕은 색·밝기 보정 없이 따뜻한 색 vibrance만 약하게 준다(render/photoEnhance.ts).
    const aiCardOptions={...cardOptions,photoKind:"ai" as const};
    // 카드를 그리며 레이아웃 자리 때문에 빠진 요점 수를 모은다(응답의 droppedPoints → 화면 안내).
    let droppedPoints=0;
    const composeSlideImage=async(...args:Parameters<typeof composeSlideCard>)=>{const card=await composeSlideCard(...args);droppedPoints=Math.max(droppedPoints,card.droppedPoints);return card.image;};
    const dropped=()=>droppedPoints?{droppedPoints}:{};
    // 브라우저형·Q&A·대형 숫자처럼 사진이 없는 레이아웃은 이미지 AI를 부르지 않는다.
    if(parsed.data.slide&&parsed.data.slideLayout!=="overlay"&&photosNeeded(normalizeCardLayout(parsed.data.slide))===0){
      const composed=await composeSlideImage([],parsed.data.slide,parsed.data.slideIndex??1,parsed.data.slideTotal??parsed.data.count,"card",parsed.data.design,cardOptions);
      return NextResponse.json({images:[`data:image/jpeg;base64,${composed.toString("base64")}`],source:"design",provider:"none",fallback:false,...dropped()});
    }
    // 사장님이 올린 실제 사진으로 만드는 장: 이미지 AI 없이 그 사진들로 바로 카드를 그린다.
    if(parsed.data.slide&&parsed.data.photos?.length){
      const originals=await Promise.all(parsed.data.photos.map(async(source,index)=>viewOf(await imageBytes(source),parsed.data.photoViews?.[index])));
      await prepareCutouts(originals);
      const composed=await composeSlideImage(originals,parsed.data.slide,parsed.data.slideIndex??1,parsed.data.slideTotal??parsed.data.count,parsed.data.slideLayout??"card",parsed.data.design,{...cardOptions,photoKind:parsed.data.photoKind??(parsed.data.enhance===false?"none":"real")});
      return NextResponse.json({images:[`data:image/jpeg;base64,${composed.toString("base64")}`],source:"photo",provider:"none",fallback:false,...dropped()});
    }

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
    // 키가 없는 제공자는 자동 순서에서 뺀다(예전에는 Higgsfield 크레딧 부족 → Cloudflare 한도 → 키 없는 OpenAI 순으로 가서
    // 실제 이유 대신 "OpenAI API 키가 연결되지 않았습니다"가 떴다). 하나도 없으면 설정 안내가 나오도록 Cloudflare를 남긴다.
    const configured:ImageProvider[]=[...(isHiggsfieldConfigured()?["higgsfield" as const]:[]),...(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN?["cloudflare" as const]:[]),...(process.env.OPENAI_API_KEY?["openai" as const]:[])];
    const chain:ImageProvider[]=settings.imageAiProvider==="automatic"
      ?(configured.length?configured:["cloudflare"])
      :[settings.imageAiProvider];
    const generators:Record<ImageProvider,(input:ImageBrief)=>Promise<string[]>>={
      higgsfield:generateHiggsfieldImages,
      cloudflare:generateCloudflareImages,
      openai:generateWithOpenAI,
    };
    // 이 장의 사진 칸 비율을 미리 재서 이미지 AI가 그 비율로 만들게 한다(세로 그림을 가로 칸에 넣으며 접시가 잘리던 문제).
    const windowRatio=parsed.data.slide?await photoWindowRatio(parsed.data.slide,parsed.data.slideIndex??1,parsed.data.slideTotal??parsed.data.count,parsed.data.slideLayout??"card",parsed.data.design,cardOptions):undefined;
    // 표지를 이어 가는 장(continuity)에는 표지 이미지를 어느 이미지 AI에도 넘기지 않는다. Cloudflare·OpenAI도 참고 이미지를
    // 너무 따라 해서 장마다 표지와 같은 구도(같은 그릇·같은 사람·같은 술병)를 거의 그대로 다시 그렸다(Higgsfield는 이미 빼 둠).
    // 장 사이의 통일감은 프롬프트의 공통 스타일(styleAnchor)로 잇는다. 사장님 사진을 살리는 source·style 모드는 그대로 쓴다.
    const {referenceImage,referenceMode,...rest}=parsed.data;
    const keepReference=referenceImage&&referenceMode!=="continuity";
    const brief:ImageBrief={...rest,...(keepReference?{referenceImage,referenceMode}:{}),...(windowRatio?{windowRatio}:{})};
    let images:string[]=[];
    const used:ImageProvider[]=[];
    // 모든 제공자가 실패하면 마지막 오류가 아니라 가장 도움이 되는 이유(크레딧 부족·안전 필터·한도 초과)를 보여 준다.
    const failures:unknown[]=[];
    for(const [index,name] of chain.entries()){
      // 앞 제공자가 일부만 만들었으면 남은 장수만, 그리고 이어지는 후보 번호부터 요청한다.
      try {
        const made=await generators[name]({...brief,count:brief.count-images.length,candidateOffset:images.length});
        images=[...images,...made]; used.push(name);
        recordUsage({provider:USAGE_IDS[name],ok:true,units:made.length});
        break;
      }
      catch(error) {
        const completed=error instanceof CloudflarePartialImageError||error instanceof HiggsfieldPartialImageError?error.images:[];
        // 사용량 장부: 크레딧 부족·429는 "한도 초과"로 적는다(설정 화면 "AI 사용량").
        // 일부만 만든 실패도 한 번의 요청으로 센다(만든 장수는 units로).
        recordUsage({provider:USAGE_IDS[name],ok:false,units:completed.length,status:imageErrorStatus(error),quota:error instanceof HiggsfieldImageError&&error.reason==="credits"});
        if(completed.length){images=[...images,...completed];used.push(name);}
        failures.push(error);
        if(index===chain.length-1){
          if(images.length)console.warn(`[images] 일부만 만들어진 이미지 ${images.length}장을 쓰지 못했어요(요청 ${brief.count}장).`);
          throw mostInformativeImageError(failures);
        }
        console.warn(`[images] ${name} 생성 실패, 다음 이미지 AI로 전환합니다:`,error instanceof Error?error.name:String(error));
      }
    }
    const provider=used.length>1?"mixed":used[0];
    const fallback=used[0]!==chain[0]||used.length>1;
    const notice=fallback?`${PROVIDER_LABELS[chain[0]]} 생성이 어려워 ${PROVIDER_LABELS[used[used.length-1]]}(으)로 전환했어요.`:undefined;
    if (images.length !== parsed.data.count) throw new Error("incomplete image result");
    // 표지 후보가 여러 장이면 글자를 얹기 전 원본을 AI로 점검한다(이미지 속 글자, 홍어로 안 보임, 어색한 손).
    // 점검은 순서와 경고 배지에만 쓰고 다시 만들지는 않는다. 키가 없거나 실패하면 null(점검 없음).
    const checks=parsed.data.slide?.role==="cover"&&images.length>1?await checkCoverCandidates(await Promise.all(images.map(imageBytes)),{expectedFood:expectedFoodFrom(parsed.data.topic,parsed.data.slide?.headline)}):null;
    if(remoteCutout&&parsed.data.slide)await prepareCutouts(await Promise.all(images.map(imageBytes)));
    const referenceImages:string[]=[];
    // 결과 이미지마다 그 카드를 그린 밑바탕 사진들(콜라주는 여러 장).
    let baseImages:string[][]=[];
    // 콜라주·비교처럼 사진 여러 장을 쓰는 레이아웃은 만든 사진을 모두 한 카드에 넣는다.
    if(parsed.data.slide&&parsed.data.slideLayout!=="overlay"&&photosNeeded(normalizeCardLayout(parsed.data.slide))>1&&images.length>1){
      const originals=await Promise.all(images.map(imageBytes));
      const composed=await composeSlideImage(originals,parsed.data.slide,parsed.data.slideIndex??1,parsed.data.slideTotal??parsed.data.count,"card",parsed.data.design,aiCardOptions);
      images=[`data:image/jpeg;base64,${composed.toString("base64")}`];
      baseImages=[await Promise.all(originals.map(baseImage))];
    }else if(parsed.data.slide)images=await Promise.all(images.map(async (source,index)=>{
      const slideIndex=parsed.data.slideIndex ?? index+1;
      const slideTotal=parsed.data.slideTotal ?? parsed.data.count;
      const original=await imageBytes(source);
      if(parsed.data.slide?.role==="cover"){
        const reference=await sharp(original).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
        referenceImages[index]=`data:image/jpeg;base64,${reference.toString("base64")}`;
      }
      const composed=await composeSlideImage(original,parsed.data.slide!,slideIndex,slideTotal,parsed.data.slideLayout,parsed.data.design,aiCardOptions);
      baseImages[index]=[await baseImage(original)];
      return `data:image/jpeg;base64,${composed.toString("base64")}`;
    }));
    // 점검 결과가 있으면 점수가 높은(경고가 적은) 후보를 앞에 둔다. 참고 원본도 같은 순서로 맞춘다.
    if(checks&&checks.length===images.length){
      const order=checks.map((check,index)=>({index,rank:coverRank(check)})).sort((a,b)=>b.rank-a.rank).map(item=>item.index);
      images=order.map(index=>images[index]);
      if(referenceImages.length===order.length){const sorted=order.map(index=>referenceImages[index]);referenceImages.splice(0,referenceImages.length,...sorted);}
      if(baseImages.length===order.length)baseImages=order.map(index=>baseImages[index]);
      checks.splice(0,checks.length,...order.map(index=>checks[index]));
    }
    return NextResponse.json({ images, ...(referenceImages.length?{referenceImages}:{}), ...(baseImages.length===images.length?{baseImages}:{}), ...(checks?{checks:checks.map(({score,note,warnings})=>({score,note,warnings}))}:{}), source:parsed.data.referenceImage&&parsed.data.referenceMode!=="continuity"?"ai-edited":"ai-generated", provider, fallback, ...(notice?{notice}:{}), ...dropped(), disclosure:"AI 연출 이미지입니다. 실제 메뉴와 다를 수 있어요." });
  } catch (error) {
    if(error instanceof HiggsfieldConfigurationError)return NextResponse.json({message:error.message,retryable:false},{status:503});
    if(error instanceof HiggsfieldImageError)return NextResponse.json({message:HIGGSFIELD_MESSAGES[error.reason],retryable:error.reason!=="auth"&&error.reason!=="credits"},{status:error.reason==="nsfw"?422:502});
    if(error instanceof CloudflareConfigurationError)return NextResponse.json({message:error.message,retryable:false},{status:503});
    if(error instanceof CloudflareImageError)return NextResponse.json({message:error.status===401?"Cloudflare API 토큰을 확인해 주세요.":"무료 이미지 생성에 실패했습니다. 잠시 뒤 다시 시도하거나 직접 사진을 넣어 주세요.",retryable:error.status!==401},{status:502});
    if(error instanceof AiConfigurationError)return NextResponse.json({message:error.message,retryable:false},{status:503});
    // 제공자 오류가 아니면(카드 그리기·사진 읽기·글꼴 등) 서버 기록에 남기고, OpenAI 문구 대신 그 사실을 알린다.
    if(!isProviderError(error)){
      console.error("[images] 이미지·카드를 만들다 오류:",error instanceof Error?`${error.name}: ${error.message}\n${error.stack??""}`.slice(0,2000):String(error));
      return NextResponse.json({message:"카드를 그리는 중 문제가 생겼어요. 다시 시도해 보고, 계속되면 사진을 바꿔 보세요.",retryable:true},{status:500});
    }
    return NextResponse.json(classifyOpenAIImageError(error), { status:502 });
  }
}

// OpenAI SDK 오류는 status 숫자를 가진다. 그 밖의 알려진 제공자 오류 클래스도 제공자 오류로 본다.
function isProviderError(error:unknown):boolean {
  return error instanceof HiggsfieldImageError||error instanceof CloudflareImageError||error instanceof HiggsfieldConfigurationError||error instanceof CloudflareConfigurationError
    ||(typeof error==="object"&&error!==null&&typeof (error as {status?:unknown}).status==="number");
}
// 여러 제공자가 실패했을 때 사장님에게 보여 줄 이유: 크레딧·키·안전 필터 > 한도 초과 > 그 밖의 실패 > 설정 없음. 같으면 먼저 난 것.
function mostInformativeImageError(errors:unknown[]):unknown {
  const rank=(error:unknown)=>{
    if(error instanceof HiggsfieldImageError)return error.reason==="credits"||error.reason==="auth"||error.reason==="nsfw"?4:2;
    if(error instanceof CloudflareImageError)return error.status===401||error.status===429?3:2;
    if(error instanceof HiggsfieldConfigurationError||error instanceof CloudflareConfigurationError||error instanceof AiConfigurationError)return 0;
    const status=(error as {status?:unknown})?.status;
    return status===401||status===429?3:1;
  };
  return errors.reduce((best,error)=>rank(error)>rank(best)?error:best,errors[0]);
}
