import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ subjectClarity: "좋음", backgroundComplexity: "좋음", textSpace: "있음", cropSafety: "안전", disclosureRequired: true });
}
