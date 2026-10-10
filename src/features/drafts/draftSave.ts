import type { ApprovedImage } from "@/features/images/generationStore";
import type { StyleId } from "@/features/images/styleCatalog";
import { formatCopy } from "@/features/copy/writing";
import { readJsonResponse } from "@/lib/http/readJson";
import type { StudioSnapshotInput } from "./studio";

// 초안 저장·글 쓰기 요청. 화면(DraftWizard)과 자동 만들기(generationStore.createAutomatically)가 함께 쓴다.
// 자동 만들기는 화면이 사라져도(다른 메뉴로 이동) 끝까지 돌아야 하므로, 컴포넌트 상태가 아니라 넘겨받은 값만 쓴다.
export type DraftMeta={id:string;topic:string;audience:"A"|"B"|"C";imageBrief:string;contentBrief:string;createdAt:string;planDate?:string;caption?:string};

// 장마다 쓰임(purpose): 한 장이면 대표 사진, 여러 장이면 장 역할(표지·본문). 예전 화면과 같은 모양으로 저장한다.
// studio: 다시 열어도 장별로 고칠 수 있게 함께 저장하는 만들기 상태(구성안·밑바탕). 없으면(글자 카드로 바꾼 사진 등) 저장하지 않는다.
export function draftBody(meta:DraftMeta,images:ApprovedImage[],designStyle?:StyleId,studio?:StudioSnapshotInput){
  return {id:meta.id,status:"ready",topic:meta.topic,audience:meta.audience,image_brief:meta.imageBrief,content_brief:meta.contentBrief,
    media_candidates:images.map((item,index)=>({id:item.id,source:item.source,file_id:item.preview ?? item.id,purpose:images.length===1?"instagram-primary":`instagram-${item.role ?? (index===0?"cover":"slide")}`})),
    selected_media_id:images[0]?.id ?? null,...(images.length?{selected_media_ids:images.map(item=>item.id)}:{}),copy:null,
    ...(meta.caption?.trim()?{caption:meta.caption}:{}),...(meta.planDate?{plan_date:meta.planDate}:{}),...(designStyle?{design_style:designStyle}:{}),...(studio?{studio}:{}),
    facts_to_verify:[],store_profile_version:"2026-09-10",created_at:meta.createdAt,updated_at:new Date().toISOString()};
}

export async function saveDraftImages(meta:DraftMeta,images:ApprovedImage[],designStyle?:StyleId,studio?:StudioSnapshotInput):Promise<void> {
  const response=await fetch("/api/drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draftBody(meta,images,designStyle,studio))});
  if(!response.ok)throw new Error("만든 사진을 저장하지 못했어요. '다시 해 보기'를 눌러 주세요.");
}

export async function saveDraftCaption(id:string,caption:string):Promise<void> {
  const response=await fetch("/api/drafts",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,caption})});
  if(!response.ok)throw new Error("글을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
}

// 게시물 글(본문·# 태그) 쓰기. 카드 순서(slideOutline)와 사진에 보이는 것(photoNotes)을 함께 넘겨 사진과 맞는 글이 되게 한다.
export type PostTextInput={topic:string;audience:"A"|"B"|"C";contentBrief?:string;imageBrief?:string;hasAiImages:boolean;slideOutline?:string[];slideNotes?:string[];photoNotes?:string[]};
export async function writePostText(input:PostTextInput):Promise<string> {
  const response=await fetch("/api/copy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:input.topic,audience:input.audience,contentBrief:input.contentBrief,imageBrief:input.imageBrief,hasAiImages:input.hasAiImages,...(input.slideOutline?.length?{slideOutline:input.slideOutline}:{}),...(input.slideNotes?.some(Boolean)?{slideNotes:input.slideNotes}:{}),...(input.photoNotes?.length?{photoNotes:input.photoNotes}:{})})});
  const copy=await readJsonResponse(response);
  if(!response.ok)throw new Error("글을 쓰지 못했어요. '글 다시 쓰기'를 눌러 주세요.");
  const text=formatCopy(copy);
  if(!text.trim())throw new Error("글을 쓰지 못했어요. '글 다시 쓰기'를 눌러 주세요.");
  return text.slice(0,2200);
}

// 이 브라우저에서 마지막으로 저장한 초안(게시물)과 그 주제. 새 탭으로 열었을 때 "만들던 게시물 이어서 하기" 안내에 쓴다.
// 자동 만들기가 화면 밖에서 저장을 마쳐도 같은 값이 남도록 여기 둔다.
export const CURRENT_DRAFT_KEY="mukdong-current-draft",CURRENT_TOPIC_KEY="mukdong-current-draft-topic";
export function rememberCurrentDraft(id:string,topic:string){try{localStorage.setItem(CURRENT_DRAFT_KEY,id);localStorage.setItem(CURRENT_TOPIC_KEY,topic.slice(0,120));}catch{/* 무시 */}}
export function forgetCurrentDraft(){try{localStorage.removeItem(CURRENT_DRAFT_KEY);localStorage.removeItem(CURRENT_TOPIC_KEY);}catch{/* 무시 */}}
