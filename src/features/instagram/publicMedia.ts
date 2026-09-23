import { createHmac,timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import type { Draft } from "@/features/drafts/schema";
import { selectedDraftMedia } from "@/features/drafts/selection";

export class InstagramMediaError extends Error{}

export async function prepareInstagramImage(draft:Draft,mediaId?:string){
  const selectedMedia=selectedDraftMedia(draft);
  if(!mediaId&&(draft.selected_media_ids?.length??selectedMedia.length)>1)throw new InstagramMediaError("여러 장 게시에는 이미지 식별자가 필요합니다.");
  const selected=mediaId?selectedMedia.find(candidate=>candidate.id===mediaId):selectedMedia[0];
  if(!selected)throw new InstagramMediaError("게시할 이미지를 선택해 주세요.");
  const match=selected.file_id.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)throw new InstagramMediaError("게시 이미지는 업로드하거나 생성한 PNG, JPEG, WEBP 파일이어야 합니다.");
  const input=Buffer.from(match[2],"base64");
  if(!input.length||input.length>18_000_000)throw new InstagramMediaError("게시 이미지의 크기를 확인해 주세요.");
  try{return await sharp(input).rotate().resize(1080,1350,{fit:"cover"}).jpeg({quality:90}).toBuffer();}
  catch{throw new InstagramMediaError("게시 이미지를 변환하지 못했습니다.");}
}

function signatureFor(draftId:string,expiresAt:number,secret:string,mediaId?:string){
  return createHmac("sha256",secret).update(mediaId?`${draftId}.${mediaId}.${expiresAt}`:`${draftId}.${expiresAt}`).digest("base64url");
}

export function signMediaUrl(input:{draftId:string;mediaId?:string;expiresAt:number;baseUrl:string;secret:string}){
  const url=new URL(`/api/media/public/${input.draftId}`,input.baseUrl);
  url.searchParams.set("expires",String(input.expiresAt));
  if(input.mediaId)url.searchParams.set("media",input.mediaId);
  url.searchParams.set("sig",signatureFor(input.draftId,input.expiresAt,input.secret,input.mediaId));
  return url.toString();
}

export function verifyMediaSignature(input:{draftId:string;mediaId?:string;expiresAt:number;signature:string;secret:string;now?:number}){
  if(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<(input.now??Math.floor(Date.now()/1000)))return false;
  const expected=Buffer.from(signatureFor(input.draftId,input.expiresAt,input.secret,input.mediaId));
  const received=Buffer.from(input.signature);
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
