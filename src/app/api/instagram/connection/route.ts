import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";
import { createInstagramRepository } from "@/features/instagram/repository";

export async function DELETE(){ const denied=await ownerApiError(); if(denied)return denied;
  await createInstagramRepository().deleteConnection();
  return NextResponse.json({connected:false});
}
