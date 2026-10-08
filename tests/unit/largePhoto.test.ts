// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { createAssetLibrary } from "@/features/images/assetLibrary";

let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;});

// 휴대폰 고화소 모드(5천만 화소) 사진: 예전에는 "최대 4천만 화소" 제한에 걸려 거절됐다.
it("accepts a 50-megapixel phone photo and keeps a small preview", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-large-"));
  const bytes=await sharp({create:{width:8160,height:6120,channels:3,background:{r:180,g:40,b:30}}}).jpeg({quality:80}).toBuffer();
  const file=new File([new Uint8Array(bytes)],"phone.jpg",{type:"image/jpeg"});
  const asset=await createAssetLibrary(directory).add(file,{name:"홍어무침",tags:["홍어무침"],kind:"photo",credit:"직접 촬영"});
  const preview=await sharp(Buffer.from(asset.preview.split(",")[1],"base64")).metadata();
  expect(Math.max(preview.width!,preview.height!)).toBeLessThanOrEqual(2160);
}, 30_000);
