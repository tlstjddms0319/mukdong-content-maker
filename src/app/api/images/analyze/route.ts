import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";

export async function POST() { const denied=await ownerApiError(); if(denied)return denied;
  return NextResponse.json({ subjectClarity: "확인 필요", backgroundComplexity: "확인 필요", textSpace: "확인 필요", cropSafety: "확인 필요", disclosureRequired: true, analyzed:false, message:"자동 이미지 검사는 아직 제공하지 않아요. 음식 모양과 글자, 잘린 부분을 직접 확인해 주세요." });
}
