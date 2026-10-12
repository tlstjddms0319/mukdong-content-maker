import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerApiError } from "@/features/auth/guard";
import { createAssetLibrary } from "@/features/images/assetLibrary";
import { PHOTO_QUALITY_LABELS, photoQuality, type PhotoQualityFlag } from "@/features/images/render/photoEnhance";
import { coverRank, expectedFoodFrom, scoreImages, type CoverCheck } from "@/features/images/coverCheck";
import { panoramaReady } from "@/features/images/render/panorama";
import { AnalyzeRequestSchema, FOOD_TAG, foodBoxOf, menuMismatch, photoFoodOf, photoFoodText, photoRank, rankPhotos, type AnalyzeResponse, type AnalyzedPhoto } from "@/features/images/photoAnalysis";

// 사장님 사진 표지 추천. 1) 로컬 품질 검사(무료: 어두움·흔들림·색 틀어짐·작은 사진)로 먼저 거르고
// 2) 요청에 score:true가 있고 Gemini 키가 있으면 거르고 남은 사진만 식욕 점수(coverCheck)를 매긴다.
// 돌려주는 것은 "표지로 좋은 순서"뿐이고, 사진 순서를 바꾸는 것은 사장님이 화면에서 직접 한다.

// meta: 보관함 사진의 이름·태그(사진 속 음식을 읽는 데 쓴다). data URL 사진은 없다.
type Loaded={id:string;bytes:Buffer|null;flags:PhotoQualityFlag[]|null;meta?:{name:string;tags:string[]}};

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
  return {id:photo.id,bytes,flags:asset.quality?.flags??null,meta:{name:asset.name??"",tags:asset.tags??[]}};
}

// AI가 사진을 못 봤으면 사장님이 단 사진 이름·태그로 대신한다(무료). 한글이 없는 파일 이름("IMG_2034")과
// 올릴 때 자동으로 붙는 "매장 사진" 태그는 사진 내용이 아니라서 뺀다.
function tagScene(meta:Loaded["meta"]):string|null {
  if(!meta)return null;
  const text=photoFoodText(meta).replace(/(^|\s)매장 사진(?=\s|$)/g," ").replace(/\s+/g," ").trim();
  return /[가-힣]/.test(text)?text.slice(0,60):null;
}

export async function POST(request:Request) { const denied=await ownerApiError(); if(denied)return denied;
  const parsed=AnalyzeRequestSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"확인할 사진을 1~10장 골라 주세요."},{status:400});
  const {photos,score,describe,topic}=parsed.data;
  const library=createAssetLibrary();
  const loaded=await Promise.all(photos.map(photo=>loadPhoto(photo,library)));
  // 저장된 품질이 없는 사진(예전 사진·data URL)만 지금 잰다. 장당 0.1초 안팎이라 무료로 매번 해도 된다.
  const measured=await Promise.all(loaded.map(async item=>({
    ...item,
    wide:item.bytes?await panoramaReady(item.bytes):false,
    flags:item.flags??(item.bytes?await photoQuality(item.bytes).then(quality=>quality.flags).catch(()=>null):null),
  })));

  const scoreAvailable=Boolean(process.env.GEMINI_API_KEY?.trim());
  // 어둡거나 흔들린 사진은 표지로 쓰기 어려워 Gemini에 보내지 않는다(비용 절약).
  // 사진 내용 읽기(describe)는 캐러셀의 모든 사진을 장에 넣어야 하므로 어둡거나 흔들린 사진도 읽는다.
  const usable=measured.filter(item=>item.bytes&&(describe||!item.flags?.some(flag=>flag==="dark"||flag==="blurry")));
  const checks=new Map<string,CoverCheck>();
  let message:string|undefined;
  const ask=score||describe;
  if(ask&&!scoreAvailable)message="Gemini 키가 없어 사진 밝기·선명도만 봤어요.";
  else if(ask&&!usable.length)message="모든 사진이 어둡거나 흔들려서 맛 점수는 매기지 않았어요.";
  else if(ask){
    const results=await scoreImages(usable.map(item=>item.bytes!),{expectedFood:expectedFoodFrom(topic)});
    results?.forEach((check,index)=>{if(check)checks.set(usable[index].id,check);});
    if(!results)message="AI 점검이 지금 어려워 사진 밝기·선명도만 봤어요.";
    else if(results.some(check=>!check))message="일부 사진은 AI 점검을 못 해 밝기·선명도로만 순서를 정했어요.";
  }

  // AI 점검이 사진 속 음식을 알려 주면 보관함 사진에 "음식:이름" 태그로 남긴다. 다음부터는 AI 없이도(무료) 불일치를 안다.
  await Promise.all(measured.map(async item=>{
    const food=checks.get(item.id)?.food?.trim().slice(0,10);
    if(!food||!item.meta||item.meta.tags.some(tag=>tag.startsWith(FOOD_TAG)))return;
    const tags=[`${FOOD_TAG}${food}`,...item.meta.tags].slice(0,12);
    // 태그 저장은 보조 기능이라 실패해도 분석 결과는 그대로 돌려준다.
    try{if(await library.update(item.id,{tags}))item.meta={...item.meta,tags};}catch{/* 다음 점검 때 다시 시도 */}
  }));

  const analyzed:AnalyzedPhoto[]=measured.map(item=>{
    const check=checks.get(item.id);
    const flags=item.flags??[];
    // 사진 속 음식: AI가 이번에 본 음식 → 보관함 "음식:" 태그 → 직접 단 이름·태그 순서로 믿는다.
    const foodText=check?.food?.trim()||(item.meta?photoFoodText(item.meta):"");
    const tagged=menuMismatch(topic,foodText);
    // AI가 "글의 음식처럼 안 보인다"고 했는데 음식 이름으로는 못 가렸을 때도 알려 준다.
    const expected=expectedFoodFrom(topic);
    const aiMismatch=!tagged&&check&&check.foodVisible&&!check.looksLikeSkate&&topic?`AI가 보기엔 ${expected.name} 사진이 아니에요`:null;
    return {id:item.id,flags,labels:flags.map(flag=>PHOTO_QUALITY_LABELS[flag]),measured:item.flags!==null,wide:item.wide,
      food:photoFoodOf(foodText)?.label??(check?.food?.trim().slice(0,10)||null),mismatch:tagged?.message??aiMismatch,
      scene:check?.scene?.trim().slice(0,60)||tagScene(item.meta),box:foodBoxOf(check?.focus),
      appetite:check?{score:check.score,appetite:check.appetite,lighting:check.lighting,composition:check.composition,warnings:check.warnings,note:check.note}:null};
  });
  // 점수가 붙은 사진은 coverRank, 못 붙은 사진은 중간값(5)에서 품질 감점만 한다.
  const ranking=rankPhotos(measured.map(item=>{const check=checks.get(item.id);return {id:item.id,rank:photoRank({flags:item.flags??[]},check?coverRank(check):null)};}));
  // 표지 추천은 순위 1위 중 어둡거나 흔들리지 않은 사진. 품질을 못 잰 사진은 추천하지 않는다.
  const recommended=ranking.find(id=>{const item=analyzed.find(photo=>photo.id===id)!;return item.measured&&!item.flags.includes("dark")&&!item.flags.includes("blurry");})??null;
  const body:AnalyzeResponse={analyzed:true,photos:analyzed,ranking,recommended,scored:checks.size>0,scoreAvailable,...(message?{message}:{})};
  return NextResponse.json(body,{headers:{"Cache-Control":"no-store"}});
}
