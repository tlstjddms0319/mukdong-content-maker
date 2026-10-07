// @vitest-environment node
// 설정 화면에서 올리는 "맨 뒤 홍보 포스터": 저장·읽기·되돌리기, 카드에서 직접 올린 포스터가 먼저 쓰이는지, API 권한·오류 처리.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { memoryPosterStore, readCustomPoster, removeCustomPoster, saveCustomPoster, setPosterStoreForTests } from "@/features/store/posterStore";
import { renderStorePromoImage } from "@/features/images/storeCard";
import { MediaValidationError } from "@/lib/files/mediaStore";
import { DELETE, GET, POST } from "@/app/api/store/poster/route";

const mocks=vi.hoisted(()=>({guard:vi.fn()}));
vi.mock("@/features/auth/guard",()=>({ownerApiError:mocks.guard}));

const solid=(width:number,height:number,color:string,format:"png"|"jpeg"="png")=>sharp({create:{width,height,channels:3,background:color}})[format]().toBuffer();
const fileOf=(bytes:Buffer,type="image/png",name="poster.png")=>new File([new Uint8Array(bytes)],name,{type});
// 카드 가운데 픽셀 색(올린 그림이 앞에 그대로 놓였는지 본다).
async function centre(card:Buffer){const {data}=await sharp(card).extract({left:540,top:675,width:1,height:1}).raw().toBuffer({resolveWithObject:true});return [...data.subarray(0,3)];}

beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockResolvedValue(null);setPosterStoreForTests(()=>store);});
afterEach(()=>setPosterStoreForTests(null));
let store=memoryPosterStore();
beforeEach(()=>{store=memoryPosterStore();});

describe("custom promo poster store", () => {
  it("saves, reads back and removes an uploaded poster", async () => {
    expect(await readCustomPoster()).toBeNull();
    const saved=await saveCustomPoster(fileOf(await solid(1080,1350,"#cc2222")),new Date("2026-10-07T03:00:00Z"));
    const read=await readCustomPoster();
    expect(read?.updatedAt).toBe("2026-10-07T03:00:00.000Z");
    expect(read?.image.equals(saved.image)).toBe(true);
    expect((await sharp(read!.image).metadata()).format).toBe("jpeg");
    await removeCustomPoster();
    expect(await readCustomPoster()).toBeNull();
  });

  it("shrinks very large posters and keeps the ratio", async () => {
    const saved=await saveCustomPoster(fileOf(await solid(4000,5000,"#2255aa")));
    const meta=await sharp(saved.image).metadata();
    expect(meta.width).toBe(2160);expect(meta.height).toBe(2700);
  });

  it("rejects wrong types, tiny pictures and broken files with a Korean message", async () => {
    await expect(saveCustomPoster(fileOf(Buffer.from("GIF89a"),"image/gif","a.gif"))).rejects.toBeInstanceOf(MediaValidationError);
    await expect(saveCustomPoster(fileOf(await solid(500,700,"#ffffff")))).rejects.toThrow(/너무 작아요/);
    await expect(saveCustomPoster(fileOf(Buffer.from("not an image"),"image/jpeg","a.jpg"))).rejects.toThrow(/읽지 못했어요/);
    expect(await readCustomPoster()).toBeNull();
  });

  it("ignores a damaged saved file instead of breaking the card", async () => {
    await store.write("{broken");
    expect(await readCustomPoster()).toBeNull();
  });
});

describe("last slide uses the uploaded poster first", () => {
  it("draws the uploaded poster on a 1080×1350 card, then falls back after removal", async () => {
    await saveCustomPoster(fileOf(await solid(1080,1350,"#d01010")));
    const card=await renderStorePromoImage({palette:"warm"},5,5);
    const meta=await sharp(card).metadata();
    expect([meta.width,meta.height]).toEqual([1080,1350]);
    const [r,g,b]=await centre(card);
    expect(r).toBeGreaterThan(180);expect(g).toBeLessThan(60);expect(b).toBeLessThan(60);
    await removeCustomPoster();
    const fallback=await renderStorePromoImage({palette:"warm"},5,5);
    expect(fallback.equals(card)).toBe(false);
  });

  it("falls back when the store cannot be read", async () => {
    setPosterStoreForTests(()=>({read:async()=>{throw new Error("down");},write:async()=>{},remove:async()=>{}}));
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const card=await renderStorePromoImage({palette:"warm"},5,5);
    expect((await sharp(card).metadata()).width).toBe(1080);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("/api/store/poster", () => {
  const upload=(form:FormData)=>POST(new Request("http://localhost/api/store/poster",{method:"POST",body:form}));

  it("is owner-only", async () => {
    mocks.guard.mockResolvedValue(new Response(null,{status:401}));
    expect((await GET()).status).toBe(401);
    expect((await upload(new FormData())).status).toBe(401);
    expect((await DELETE()).status).toBe(401);
  });

  it("uploads, previews and reverts", async () => {
    const before=await (await GET()).json();
    expect(before.source).not.toBe("custom");
    const form=new FormData();form.append("file",fileOf(await solid(1200,1500,"#20a040")));
    const response=await upload(form);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body=await response.json();
    expect(body.source).toBe("custom");
    expect(body.updatedAt).toEqual(expect.any(String));
    const preview=await sharp(Buffer.from(body.preview.replace(/^data:image\/jpeg;base64,/,""),"base64")).metadata();
    expect([preview.width,preview.height]).toEqual([540,675]);
    const reverted=await (await DELETE()).json();
    expect(reverted.source).toBe(before.source);
    expect(await readCustomPoster()).toBeNull();
  });

  it("answers 400 for a missing or invalid file", async () => {
    expect((await upload(new FormData())).status).toBe(400);
    const form=new FormData();form.append("file",fileOf(Buffer.from("x"),"text/plain","a.txt"));
    const response=await upload(form);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/JPG, PNG, WebP/);
  });
});
