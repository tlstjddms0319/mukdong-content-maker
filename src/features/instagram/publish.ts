import type { Draft } from "@/features/drafts/schema";
import type { InstagramConnection,Publication } from "./schema";
import { signMediaUrl } from "./publicMedia";
import { selectedDraftMedia } from "@/features/drafts/selection";
import { PublicationLockError } from "./repository";

export type ContainerStatus="IN_PROGRESS"|"FINISHED"|"ERROR"|"EXPIRED";
export const CONTAINER_POLL_ATTEMPTS=30;
export const CONTAINER_POLL_INTERVAL_MS=3000;
export class InstagramPublishError extends Error{constructor(message:string,public kind:"approval"|"incomplete"|"reconnect"|"in-progress"|"meta"="meta"){super(message);}}

function caption(draft:Draft,approvedCaption?:string){if(approvedCaption?.trim())return approvedCaption.trim();const copy=draft.copy!;return [copy.hook,"",copy.information,copy.store_connection,"",copy.call_to_action,"",copy.hashtags.join(" "),copy.image_disclosure].filter(Boolean).join("\n");}

type PublishDependencies={
  readDraft:(id:string)=>Promise<Draft|null>;readConnection:()=>Promise<InstagramConnection|null>;
  repo:{readPublication:(id:string)=>Promise<Publication|null>;savePublication:(value:Publication)=>Promise<Publication>;withPublicationLock:<T>(draftId:string,task:()=>Promise<T>)=>Promise<T>};
  meta:{createImageContainer:(input:{instagramUserId:string;accessToken:string;imageUrl:string;caption?:string;isCarouselItem?:boolean})=>Promise<string>;createCarouselContainer:(input:{instagramUserId:string;accessToken:string;children:string[];caption:string})=>Promise<string>;getContainerStatus:(id:string,accessToken:string)=>Promise<ContainerStatus>;publishContainer:(input:{instagramUserId:string;containerId:string;accessToken:string})=>Promise<string>};
  baseUrl:string;signingSecret:string;now?:()=>Date;wait?:(ms:number)=>Promise<void>;
};

export async function publishApprovedDraft(input:{draftId:string;approved:boolean;caption?:string},deps:PublishDependencies){
  if(!input.approved)throw new InstagramPublishError("게시 승인이 필요해요.","approval");
  try{return await deps.repo.withPublicationLock(input.draftId,()=>publishLocked(input,deps));}
  catch(error){if(error instanceof PublicationLockError)throw new InstagramPublishError("이미 게시 준비 중이에요.","in-progress");throw error;}
}

async function publishLocked(input:{draftId:string;approved:boolean;caption?:string},deps:PublishDependencies){
  const previous=await deps.repo.readPublication(input.draftId);
  if(previous?.status==="published")return {status:"published" as const,alreadyPublished:true,mediaId:previous.mediaId};
  if(previous?.status==="preparing"){
    if(!previous.mediaId)throw new InstagramPublishError("이미 게시 준비 중이에요.","in-progress");
    const recovered:Publication={...previous,status:"published",safeError:null,publishedAt:previous.publishedAt??(deps.now??(()=>new Date()))().toISOString()};
    await deps.repo.savePublication(recovered);
    return {status:"published" as const,alreadyPublished:true,mediaId:recovered.mediaId};
  }
  const [draft,connection]=await Promise.all([deps.readDraft(input.draftId),deps.readConnection()]);
  if(!draft||!draft.selected_media_id||(!draft.copy&&!input.caption?.trim()))throw new InstagramPublishError("이미지와 문안을 모두 완성해 주세요.","incomplete");
  const selected=selectedDraftMedia(draft);
  const requestedIds=draft.selected_media_ids??[draft.selected_media_id];
  if(requestedIds.length<1||requestedIds.length>10||new Set(requestedIds).size!==requestedIds.length||selected.length!==requestedIds.length||requestedIds.some((id,index)=>selected[index]?.id!==id)||requestedIds[0]!==draft.selected_media_id)throw new InstagramPublishError("선택 이미지를 확인해 주세요.","incomplete");
  const now=(deps.now??(()=>new Date()))();
  if(!connection||new Date(connection.expiresAt)<=now)throw new InstagramPublishError("Instagram을 다시 연결해 주세요.","reconnect");
  if(new URL(deps.baseUrl).protocol!=="https:")throw new InstagramPublishError("공개 HTTPS 주소 설정이 필요합니다.","incomplete");
  const preparing:Publication={draftId:input.draftId,status:"preparing",containerId:null,mediaId:null,safeError:null,attemptedAt:now.toISOString(),publishedAt:null};
  await deps.repo.savePublication(preparing);
  let progress=preparing,publishRequested=false;
  try{
    const expiresAt=Math.floor(now.getTime()/1000)+600;
    const approvedCaption=caption(draft,input.caption);
    const containerId=selected.length===1
      ? await deps.meta.createImageContainer({instagramUserId:connection.instagramUserId,accessToken:connection.accessToken,imageUrl:signMediaUrl({draftId:input.draftId,expiresAt,baseUrl:deps.baseUrl,secret:deps.signingSecret}),caption:approvedCaption})
      : await createCarouselContainer(selected,deps,connection,input.draftId,expiresAt,approvedCaption);
    progress={...progress,containerId};
    await deps.repo.savePublication(progress);
    // 캐러셀 컨테이너는 Meta 쪽 처리에 수십 초가 걸리기도 하므로 최대 약 90초까지 기다린다.
    let finished=false;
    for(let attempt=0;attempt<CONTAINER_POLL_ATTEMPTS;attempt++){
      const status=await deps.meta.getContainerStatus(containerId,connection.accessToken);
      if(status==="FINISHED"){finished=true;break;}
      if(status==="ERROR"||status==="EXPIRED")throw new Error("processing");
      await (deps.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(CONTAINER_POLL_INTERVAL_MS);
    }
    if(!finished)throw new Error("timeout");
    publishRequested=true;
    const mediaId=await deps.meta.publishContainer({instagramUserId:connection.instagramUserId,containerId,accessToken:connection.accessToken});
    progress={...progress,mediaId,safeError:"Instagram 게시 결과를 로컬에 반영하는 중입니다."};
    await deps.repo.savePublication(progress);
    await deps.repo.savePublication({...progress,status:"published",safeError:null,publishedAt:(deps.now??(()=>new Date()))().toISOString()});
    return {status:"published" as const,alreadyPublished:false,mediaId};
  }catch{
    const safeError=progress.mediaId||publishRequested?"Instagram 게시 결과를 확인해야 합니다.":"Instagram 게시에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    const recovery:Publication=progress.mediaId||publishRequested?{...progress,status:"preparing",safeError}:{...progress,status:"failed",safeError};
    try{await deps.repo.savePublication(recovery);}catch{}
    throw new InstagramPublishError("Instagram 게시에 실패했습니다. 잠시 후 다시 시도해 주세요.","meta");
  }
}

async function createCarouselContainer(selected:ReturnType<typeof selectedDraftMedia>,deps:PublishDependencies,connection:InstagramConnection,draftId:string,expiresAt:number,approvedCaption:string){
  const children:string[]=[];
  for(const media of selected){
    children.push(await deps.meta.createImageContainer({instagramUserId:connection.instagramUserId,accessToken:connection.accessToken,imageUrl:signMediaUrl({draftId,mediaId:media.id,expiresAt,baseUrl:deps.baseUrl,secret:deps.signingSecret}),isCarouselItem:true}));
  }
  return deps.meta.createCarouselContainer({instagramUserId:connection.instagramUserId,accessToken:connection.accessToken,children,caption:approvedCaption});
}
