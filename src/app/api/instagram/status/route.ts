import { NextResponse } from "next/server";
import { createInstagramRepository,toPublicConnection } from "@/features/instagram/repository";

export async function GET(){
  return NextResponse.json(toPublicConnection(await createInstagramRepository().readConnection()));
}
