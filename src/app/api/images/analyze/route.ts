import { NextResponse } from "next/server";
import { ownerApiError } from "@/features/auth/guard";

export async function POST() { const denied=await ownerApiError(); if(denied)return denied;
  return NextResponse.json({ subjectClarity: "좋음", backgroundComplexity: "좋음", textSpace: "있음", cropSafety: "안전", disclosureRequired: true });
}
