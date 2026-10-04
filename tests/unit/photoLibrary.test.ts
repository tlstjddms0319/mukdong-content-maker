// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterLibrary, popularTags, usageLabel } from "@/features/images/libraryFilter";

vi.mock("@/features/auth/guard", () => ({ ownerApiError: async () => null }));

const asset=(name:string,tags:string[],createdAt:string,useCount=0,lastUsedAt:string|null=null)=>({name,tags,createdAt,useCount,lastUsedAt});

describe("library filter", () => {
  const assets=[
    asset("삼합 한 상",["삼합","홍어"],"2026-10-01T00:00:00.000Z",3,"2026-10-03T00:00:00.000Z"),
    asset("수육 클로즈업",["수육","김치"],"2026-10-02T00:00:00.000Z",0),
    asset("홍어 단면",["홍어"],"2026-09-20T00:00:00.000Z",1,"2026-09-25T00:00:00.000Z"),
  ];
  it("finds photos whose name or tags contain every word", () => {
    expect(filterLibrary(assets,"홍어").map(a=>a.name)).toEqual(["삼합 한 상","홍어 단면"]);
    expect(filterLibrary(assets,"홍어 삼합").map(a=>a.name)).toEqual(["삼합 한 상"]);
    expect(filterLibrary(assets,"클로즈 업").map(a=>a.name)).toEqual(["수육 클로즈업"]);
    expect(filterLibrary(assets,"없는말")).toEqual([]);
  });
  it("sorts by recent, often used, or unused first", () => {
    expect(filterLibrary(assets,"","recent").map(a=>a.name)).toEqual(["수육 클로즈업","삼합 한 상","홍어 단면"]);
    expect(filterLibrary(assets,"","often").map(a=>a.name)).toEqual(["삼합 한 상","홍어 단면","수육 클로즈업"]);
    expect(filterLibrary(assets,"","unused").map(a=>a.name)).toEqual(["수육 클로즈업","홍어 단면","삼합 한 상"]);
  });
  it("lists popular tags and a usage line", () => {
    expect(popularTags(assets,2)).toEqual(["홍어","김치"]);
    expect(usageLabel({useCount:0,lastUsedAt:null})).toBe("아직 안 씀");
    expect(usageLabel({useCount:3,lastUsedAt:"2026-10-03T03:00:00.000Z"})).toMatch(/^3번 사용 · 10\/3 마지막$/);
  });
});

let directory:string|undefined;
afterEach(async()=>{if(directory)await rm(directory,{recursive:true,force:true});directory=undefined;delete process.env.DATA_DIR;vi.resetModules();});

it("renames, retags, counts uses and removes library photos through the routes", async () => {
  directory=await mkdtemp(path.join(tmpdir(),"mukdong-lib-"));
  process.env.DATA_DIR=directory;
  vi.resetModules();
  const route=await import("@/app/api/images/assets/route");
  const used=await import("@/app/api/images/assets/used/route");
  const form=new FormData();
  form.append("file",new File([await sharp({create:{width:30,height:30,channels:3,background:"#a07060"}}).jpeg().toBuffer()],"a.jpg",{type:"image/jpeg"}));
  form.append("name","매장 사진");form.append("tags","홍어");form.append("kind","photo");form.append("credit","직접 촬영");
  const created=await (await route.POST(new Request("http://localhost/api/images/assets",{method:"POST",body:form}))).json();
  const id=created.asset.id as string;
  expect(created.asset.useCount).toBe(0);

  const json=(method:string,body:unknown,url="http://localhost/api/images/assets")=>new Request(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const patched=await route.PATCH(json("PATCH",{id,name:"삼합 한 상",tags:[" 삼합 ","","홍어"]}));
  expect((await patched.json()).asset).toMatchObject({name:"삼합 한 상",tags:["삼합","홍어"]});
  expect((await route.PATCH(json("PATCH",{id,tags:[]}))).status).toBe(400);

  await used.POST(json("POST",{ids:[id,id]},"http://localhost/api/images/assets/used"));
  await used.POST(json("POST",{ids:[id]},"http://localhost/api/images/assets/used"));
  const listed=await (await route.GET()).json();
  expect(listed.assets[0]).toMatchObject({useCount:2});
  expect(listed.assets[0].lastUsedAt).toBeTruthy();

  expect((await route.DELETE(new Request(`http://localhost/api/images/assets?id=${id}`,{method:"DELETE"}))).status).toBe(200);
  expect((await (await route.GET()).json()).assets).toEqual([]);
  expect((await route.DELETE(new Request(`http://localhost/api/images/assets?id=${id}`,{method:"DELETE"}))).status).toBe(404);
  // 처음 올린 원본 파일은 남겨 둔다.
  expect((await readdir(path.join(directory,"originals"))).length).toBe(1);
});
