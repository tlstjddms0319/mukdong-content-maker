import { NextResponse } from "next/server";
import { createInstagramRepository } from "@/features/instagram/repository";

export async function DELETE(){
  await createInstagramRepository().deleteConnection();
  return NextResponse.json({connected:false});
}
