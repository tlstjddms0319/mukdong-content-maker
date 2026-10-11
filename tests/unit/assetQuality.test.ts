// @vitest-environment node
// 사진 보관함 품질 채우기(계획서 A11): 품질을 재기 전에 올린 예전 사진은 목록을 읽을 때 한 번에 몇 장씩 품질을 채워 저장한다.
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { createAssetLibrary } from "@/features/images/assetLibrary";

let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;});

it("fills quality for old library photos a few at a time and keeps it", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-quality-"));
  const folder=path.join(directory,"asset-library");
  await mkdir(folder,{recursive:true});
  // 어두운 작은 사진(600px) 5장 + 깨진 미리보기 1장. 예전 형식이라 quality 칸이 없다.
  const dark=(await sharp({create:{width:600,height:450,channels:3,background:"#2a201c"}}).jpeg().toBuffer()).toString("base64");
  const ids:string[]=[];
  for(let i=0;i<6;i++){
    const id=randomUUID();ids.push(id);
    const preview=i===5?"data:image/jpeg;base64,AAAA":`data:image/jpeg;base64,${dark}`;
    await writeFile(path.join(folder,`${id}.json`),JSON.stringify({id,name:`사진 ${i}`,tags:["홍어"],kind:"photo",credit:"직접 촬영",preview,createdAt:new Date(Date.UTC(2026,8,1+i)).toISOString(),lastUsedAt:null}));
  }
  const library=createAssetLibrary(directory);
  const first=await library.list();
  expect(first).toHaveLength(6);
  // 최근 사진부터 최대 3장. 깨진 사진(가장 최근)은 실패해도 목록은 돌아오고 null로 남는다.
  expect(first[0].quality).toBeNull();
  expect(first.filter(asset=>asset.quality!==null)).toHaveLength(2);
  expect(first[1].quality?.flags).toEqual(expect.arrayContaining(["dark","lowres"]));
  // 저장돼서 다시 읽어도 남아 있다.
  const saved=JSON.parse(await readFile(path.join(folder,`${first[1].id}.json`),"utf8"));
  expect(saved.quality.flags).toContain("dark");
  // 다음 목록에서 나머지를 이어서 채운다(깨진 사진은 다시 시도하지 않아 차례를 막지 않는다).
  const second=await library.list();
  expect(second.slice(1).every(asset=>asset.quality!==null)).toBe(true);
  expect(second[0].quality).toBeNull();
});

// 홍어회 참고 사진 고르기는 장마다 보관함을 본다. 모든 미리보기(base64)를 한꺼번에 올리면 무료 인스턴스(512MB)가 넘쳐서
// 미리보기를 뺀 정보만 돌려주고, 잠깐 기억했다가 사진을 빼면 바로 다시 읽는다.
it("lists library photo details without previews and refreshes after a photo is removed", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-meta-"));
  const folder=path.join(directory,"asset-library");
  await mkdir(folder,{recursive:true});
  const ids:string[]=[];
  for(let i=0;i<6;i++){
    const id=randomUUID();ids.push(id);
    await writeFile(path.join(folder,`${id}.json`),JSON.stringify({id,name:`홍어회 ${i}`,tags:["홍어회"],kind:"photo",credit:"직접 촬영",preview:"data:image/jpeg;base64,AAAA",createdAt:new Date(Date.UTC(2026,8,1+i)).toISOString(),lastUsedAt:null,quality:null}));
  }
  const library=createAssetLibrary(directory);
  const meta=await library.listMeta();
  expect(meta.map(asset=>asset.name)).toEqual(["홍어회 5","홍어회 4","홍어회 3","홍어회 2","홍어회 1","홍어회 0"]);
  expect(meta.every(asset=>!("preview" in asset))).toBe(true);
  // 보관함에서 빼면 기억해 둔 목록을 버리고 다시 읽는다.
  expect(await library.remove(ids[5])).toBe(true);
  expect((await library.listMeta()).map(asset=>asset.name)).not.toContain("홍어회 5");
});
