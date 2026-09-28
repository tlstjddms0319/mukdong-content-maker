// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { rankAssets, type LibraryAsset } from "@/features/images/freeCards";
import { createAssetLibrary } from "@/features/images/assetLibrary";
import { renderFreeCard } from "@/features/images/renderFreeCard";

const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const makeAsset=(id:string,tags:string[],lastUsedAt:string|null=null)=>({id,name:tags[0],tags,kind:"photo",credit:"직접 촬영",preview:"",createdAt:"2026-09-27T00:00:00Z",lastUsedAt}) as LibraryAsset;

describe("free image cards",()=>{
  it("recommends only related assets, with older use first for equally relevant assets",()=>{
    const first=makeAsset("1",["홍어"],"2026-09-27T01:00:00Z"),second=makeAsset("2",["홍어"]),other=makeAsset("3",["치즈"]);
    expect(rankAssets([first,second,other],"홍어의 식감은 어떨까?").map(x=>x.id)).toEqual(["2","1"]);
    expect(rankAssets([first],"치즈는 왜 향이 날까?")).toEqual([]);
  });
  it("persists originals and labeled previews; rejects fake images and path traversal",async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),"mukdong-assets-"));dirs.push(dir);
    const library=createAssetLibrary(dir);
    const bytes=await sharp({create:{width:50,height:50,channels:3,background:"#b16a4d"}}).png().toBuffer();
    const saved=await library.add(new File([new Uint8Array(bytes)],"sample.png",{type:"image/png"}),{name:"삼합 자료",tags:["홍어","삼합"],kind:"illustration",credit:"직접 제작"});
    expect((await createAssetLibrary(dir).list())[0]).toMatchObject({id:saved.id,kind:"illustration",tags:["홍어","삼합"]});
    expect(saved.preview).toMatch(/^data:image\/jpeg;base64,/);
    await expect(library.read("../../private")).rejects.toThrow();
    await expect(library.add(new File(["fake"],"fake.png",{type:"image/png"}),{name:"사진",tags:["홍어"],kind:"photo",credit:"직접 촬영"})).rejects.toThrow();
  });
  it("renders a Korean text card without assets or an image provider",async()=>{
    const card=await renderFreeCard({title:"수육에는 왜 김치를 곁들일까?",body:"각 재료의 맛과 식감을 비교해 보세요.",layout:"photo",assetIds:[]},[]);
    expect(card).toMatchObject({layout:"text",source:"design"});
    expect(await sharp(Buffer.from(card.preview.split(",")[1],"base64")).metadata()).toMatchObject({width:1080,height:1350,format:"jpeg"});
  });
  it("preserves AI provenance and falls back from a two-photo layout when only one is supplied",async()=>{
    const bytes=await sharp({create:{width:80,height:60,channels:3,background:"#86aa74"}}).jpeg().toBuffer();
    const asset={...makeAsset("11111111-1111-4111-8111-111111111111",["홍어"]),kind:"ai-generated" as const,preview:`data:image/jpeg;base64,${bytes.toString("base64")}`};
    const card=await renderFreeCard({title:"<홍어>와 수육 & 김치?",body:"",layout:"compare",assetIds:[asset.id]},[asset]);
    expect(card).toMatchObject({layout:"photo",source:"ai-edited",assetIds:[asset.id]});
  });
});
