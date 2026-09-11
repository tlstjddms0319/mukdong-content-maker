import type { Draft } from "@/features/drafts/schema";
import type { InstagramConnection,Publication } from "./schema";
import { signMediaUrl } from "./publicMedia";

export type ContainerStatus="IN_PROGRESS"|"FINISHED"|"ERROR"|"EXPIRED";
export class InstagramPublishError extends Error{constructor(message:string,public kind:"approval"|"incomplete"|"reconnect"|"in-progress"|"meta"="meta"){super(message);}}

function caption(draft:Draft,approvedCaption?:string){if(approvedCaption?.trim())return approvedCaption.trim();const copy=draft.copy!;return [copy.hook,"",copy.information,copy.store_connection,"",copy.call_to_action,"",copy.hashtags.join(" "),copy.image_disclosure].filter(Boolean).join("\n");}

export async function publishApprovedDraft(input:{draftId:string;approved:boolean;caption?:string},deps:{
  readDraft:(id:string)=>Promise<Draft|null>;readConnection:()=>Promise<InstagramConnection|null>;
  repo:{readPublication:(id:string)=>Promise<Publication|null>;savePublication:(value:Publication)=>Promise<Publication>};
  meta:{createImageContainer:(input:{instagramUserId:string;accessToken:string;imageUrl:string;caption:string})=>Promise<string>;getContainerStatus:(id:string,accessToken:string)=>Promise<ContainerStatus>;publishContainer:(input:{instagramUserId:string;containerId:string;accessToken:string})=>Promise<string>};
  baseUrl:string;signingSecret:string;now?:()=>Date;wait?:(ms:number)=>Promise<void>;
}){
  if(!input.approved)throw new InstagramPublishError("게시 승인이 필요해요.","approval");
  const previous=await deps.repo.readPublication(input.draftId);
  if(previous?.status==="published")return {status:"published" as const,alreadyPublished:true,mediaId:previous.mediaId};
  if(previous?.status==="preparing")throw new InstagramPublishError("이미 게시 준비 중이에요.","in-progress");
  const [draft,connection]=await Promise.all([deps.readDraft(input.draftId),deps.readConnection()]);
  if(!draft||!draft.selected_media_id||(!draft.copy&&!input.caption?.trim()))throw new InstagramPublishError("이미지와 문안을 모두 완성해 주세요.","incomplete");
  const now=(deps.now??(()=>new Date()))();
  if(!connection||new Date(connection.expiresAt)<=now)throw new InstagramPublishError("Instagram을 다시 연결해 주세요.","reconnect");
  if(new URL(deps.baseUrl).protocol!=="https:")throw new InstagramPublishError("공개 HTTPS 주소 설정이 필요합니다.","incomplete");
  const preparing:Publication={draftId:input.draftId,status:"preparing",containerId:null,mediaId:null,safeError:null,attemptedAt:now.toISOString(),publishedAt:null};
  await deps.repo.savePublication(preparing);
  try{
    const imageUrl=signMediaUrl({draftId:input.draftId,expiresAt:Math.floor(now.getTime()/1000)+600,baseUrl:deps.baseUrl,secret:deps.signingSecret});
    const containerId=await deps.meta.createImageContainer({instagramUserId:connection.instagramUserId,accessToken:connection.accessToken,imageUrl,caption:caption(draft,input.caption)});
    await deps.repo.savePublication({...preparing,containerId});
    let finished=false;
    for(let attempt=0;attempt<5;attempt++){
      const status=await deps.meta.getContainerStatus(containerId,connection.accessToken);
      if(status==="FINISHED"){finished=true;break;}
      if(status==="ERROR"||status==="EXPIRED")throw new Error("processing");
      await (deps.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(1000);
    }
    if(!finished)throw new Error("timeout");
    const mediaId=await deps.meta.publishContainer({instagramUserId:connection.instagramUserId,containerId,accessToken:connection.accessToken});
    await deps.repo.savePublication({...preparing,status:"published",containerId,mediaId,publishedAt:(deps.now??(()=>new Date()))().toISOString()});
    return {status:"published" as const,alreadyPublished:false,mediaId};
  }catch{
    await deps.repo.savePublication({...preparing,status:"failed",safeError:"Instagram 게시에 실패했습니다. 잠시 후 다시 시도해 주세요."});
    throw new InstagramPublishError("Instagram 게시에 실패했습니다. 잠시 후 다시 시도해 주세요.","meta");
  }
}
