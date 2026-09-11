import { NextResponse } from "next/server";
import { z } from "zod";
import { createDraftRepository } from "@/features/drafts/repository";
import { createInstagramRepository } from "@/features/instagram/repository";
import { instagramPublishingClient } from "@/features/instagram/metaClient";
import { InstagramPublishError,publishApprovedDraft } from "@/features/instagram/publish";

const Input=z.object({draftId:z.string().uuid(),approved:z.literal(true),caption:z.string().trim().min(1).max(2200).optional()});
export async function POST(request:Request){
  const parsed=Input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"게시 승인과 초안을 확인해 주세요."},{status:400});
  const baseUrl=process.env.MEDIA_PUBLIC_BASE_URL,signingSecret=process.env.MEDIA_SIGNING_SECRET;
  if(!baseUrl||!signingSecret)return NextResponse.json({error:"게시 서버 설정이 필요합니다."},{status:503});
  const drafts=createDraftRepository(),repo=createInstagramRepository();
  try{return NextResponse.json(await publishApprovedDraft(parsed.data,{readDraft:drafts.readDraft,readConnection:repo.readConnection,repo,meta:instagramPublishingClient,baseUrl,signingSecret}));}
  catch(error){const known=error instanceof InstagramPublishError;const kind=known?error.kind:"meta";const status=kind==="reconnect"?401:kind==="in-progress"?409:kind==="meta"?502:400;return NextResponse.json({error:known?error.message:"Instagram 게시에 실패했습니다."},{status});}
}
