import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createAssetLibrary } from "@/features/images/assetLibrary";
import { PHOTO_QUALITY_LABELS, photoQuality, type PhotoQualityFlag } from "@/features/images/render/photoEnhance";
import { coverRank, expectedFoodFrom, scoreImages, type CoverCheck } from "@/features/images/coverCheck";
import { AnalyzeRequestSchema, photoRank, rankPhotos, type AnalyzeResponse, type AnalyzedPhoto } from "@/features/images/photoAnalysis";

// 사장님 사진 표지 추천. 1) 로컬 품질 검사(무료: 어두움·흔들림·색 틀어짐·작은 사진)로 먼저 거르고
// 2) 요청에 score:true가 있고 Gemini 키가 있으면 거르고 남은 사진만 식욕 점수(coverCheck)를 매긴다.
// 돌려주는 것은 "표지로 좋은 순서"뿐이고, 사진 순서를 바꾸는 것은 사장님이 화면에서 직접 한다.

type Loaded={id:string;bytes:Buffer|null;flags:PhotoQualityFlag[]|null};

async function loadPhoto(photo:{id:string;image?:string},library:ReturnType<typeof createAssetLibrary>):Promise<Loaded> {
  if(photo.image){
    const bytes=Buffer.from(photo.image.slice(photo.image.indexOf(",")+1),"base64");
    return {id:photo.id,bytes,flags:null};
  }
  if(!z.string().uuid().safeParse(photo.id).success)return {id:photo.id,bytes:null,flags:null};
  const asset=await library.read(photo.id).catch(()=>null);
  if(!asset)return {id:photo.id,bytes:null,flags:null};
  const bytes=Buffer.from(asset.preview.slice(asset.preview.indexOf(",")+1),"base64");
  // 보관함에 넣을 때 원본으로 잰 품질이 있으면 그대로 쓴다(미리보기는 줄인 사진이라 "작은 사진" 판정이 틀어진다).
  return {id:photo.id,bytes,flags:asset.quality?.flags??null};
}

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed=AnalyzeRequestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"확인할 사진을 1~10장 골라 주세요."},{status:400});
  const {photos,score,topic}=parsed.data;
  const library=createAssetLibrary();
  const loaded=await Promise.all(photos.map(photo=>loadPhoto(photo,library)));
  // 저장된 품질이 없는 사진(예전 사진·data URL)만 지금 잰다. 장당 0.1초 안팎이라 무료로 매번 해도 된다.
  const measured=await Promise.all(loaded.map(async item=>({
    ...item,
    flags:item.flags??(item.bytes?await photoQuality(item.bytes).then(quality=>quality.flags).catch(()=>null):null),
  })));

  const scoreAvailable=Boolean(process.env.GEMINI_API_KEY?.trim());
  // 어둡거나 흔들린 사진은 표지로 쓰기 어려워 Gemini에 보내지 않는다(비용 절약).
  const usable=measured.filter(item=>item.bytes&&!item.flags?.some(flag=>flag==="dark"||flag==="blurry"));
  const checks=new Map<string,CoverCheck>();
  let message:string|undefined;
  if(score&&!scoreAvailable)message="Gemini 키가 없어 사진 밝기·선명도만 봤어요.";
  else if(score&&!usable.length)message="모든 사진이 어둡거나 흔들려서 맛 점수는 매기지 않았어요.";
  else if(score){
    const results=await scoreImages(usable.map(item=>item.bytes!),{expectedFood:expectedFoodFrom(topic)});
    results?.forEach((check,index)=>{if(check)checks.set(usable[index].id,check);});
    if(!results)message="AI 점검이 지금 어려워 사진 밝기·선명도만 봤어요.";
    else if(results.some(check=>!check))message="일부 사진은 AI 점검을 못 해 밝기·선명도로만 순서를 정했어요.";
  }

  const analyzed:AnalyzedPhoto[]=measured.map(item=>{
    const check=checks.get(item.id);
    const flags=item.flags??[];
    return {id:item.id,flags,labels:flags.map(flag=>PHOTO_QUALITY_LABELS[flag]),measured:item.flags!==null,
      appetite:check?{score:check.score,appetite:check.appetite,lighting:check.lighting,composition:check.composition,warnings:check.warnings,note:check.note}:null};
  });
  // 점수가 붙은 사진은 coverRank, 못 붙은 사진은 중간값(5)에서 품질 감점만 한다.
  const ranking=rankPhotos(measured.map(item=>{const check=checks.get(item.id);return {id:item.id,rank:photoRank({flags:item.flags??[]},check?coverRank(check):null)};}));
  // 표지 추천은 순위 1위 중 어둡거나 흔들리지 않은 사진. 품질을 못 잰 사진은 추천하지 않는다.
  const recommended=ranking.find(id=>{const item=analyzed.find(photo=>photo.id===id)!;return item.measured&&!item.flags.includes("dark")&&!item.flags.includes("blurry");})??null;
  const body:AnalyzeResponse={analyzed:true,photos:analyzed,ranking,recommended,scored:checks.size>0,scoreAvailable,...(message?{message}:{})};
  return NextResponse.json(body,{headers:{"Cache-Control":"no-store"}});
}
