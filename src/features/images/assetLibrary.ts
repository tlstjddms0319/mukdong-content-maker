import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { createMediaStore, MediaValidationError } from "@/lib/files/mediaStore";
import { remoteStore } from "@/lib/files/remoteStore";
import { photoQuality } from "./render/photoEnhance";
import { AssetDetailsSchema, LibraryAssetSchema, type AssetDetails, type LibraryAsset } from "./freeCards";
// 사진을 읽을 때 화소 수 상한(sharp 기본값과 비슷, 휴대폰 2억 화소 사진까지). 사진 처리하는 곳이 함께 쓴다.
export const MAX_INPUT_PIXELS=250_000_000;

const QUALITY_BACKFILL=3;
// 미리보기가 깨져 잴 수 없던 사진. 같은 서버 프로세스에서는 다시 시도하지 않아 다른 사진 차례를 막지 않는다.
const unmeasurable=new Set<string>();

export function createAssetLibrary(root=process.env.DATA_DIR??path.join(process.cwd(),"data")) {
  const folder=path.join(root,"asset-library");
  async function save(asset:LibraryAsset) {
    const value=LibraryAssetSchema.parse(asset),key=`asset-library/${value.id}.json`,json=JSON.stringify(value);
    const remote=remoteStore();
    if(remote)await remote.write(key,json,"application/json");
    else {
      await mkdir(folder,{recursive:true});
      const target=path.join(folder,`${value.id}.json`),temporary=`${target}.${randomUUID()}.tmp`;
      await writeFile(temporary,json,"utf8");await rename(temporary,target);
    }
    return value;
  }
  async function read(id:string):Promise<LibraryAsset|null> {
    z.string().uuid().parse(id);
    try {
      const remote=remoteStore();
      const raw=remote?await remote.read(`asset-library/${id}.json`):await readFile(path.join(folder,`${id}.json`),"utf8");
      return raw===null?null:LibraryAssetSchema.parse(JSON.parse(raw));
    }catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
  }
  // 품질 재기 전에 올린 예전 사진(quality null)을 목록을 읽을 때 조금씩 채운다. 목록이 느려지지 않게 한 번에 최대
  // QUALITY_BACKFILL장(최근 사진부터)만, 보관함 미리보기(긴 변 1400px 이하, 원본보다 크게 늘리지 않음)로 잰다.
  // 원본을 다시 읽지 않아도 384px로 줄여 재는 값이라 결과가 거의 같고, 1400px보다 작은 원본은 미리보기도 같은 크기라 "작은 사진"도 맞게 잡힌다.
  // 재기·저장이 실패하면 null로 둔 채 넘어가고(다음 목록에서 다시 시도), 목록은 항상 돌려준다.
  async function backfillQuality(assets:LibraryAsset[]):Promise<LibraryAsset[]> {
    const pending=assets.filter(asset=>asset.quality===null&&!unmeasurable.has(asset.id)).slice(0,QUALITY_BACKFILL);
    if(!pending.length)return assets;
    const filled=new Map<string,LibraryAsset>();
    await Promise.all(pending.map(async asset=>{
      try{
        const quality=await photoQuality(Buffer.from(asset.preview.slice(asset.preview.indexOf(",")+1),"base64")).catch(error=>{unmeasurable.add(asset.id);throw error;});
        // 재는 사이에 이름·검색어를 고쳤을 수 있으니 저장 직전에 다시 읽어 품질만 더한다.
        const latest=await read(asset.id);
        if(!latest||latest.quality!==null)return;
        filled.set(asset.id,await save({...latest,quality}));
      }catch{/* 품질은 배지용 참고값이라 실패해도 무시한다. */}
    }));
    return filled.size?assets.map(asset=>filled.get(asset.id)??asset):assets;
  }
  return {
    read,
    async list():Promise<LibraryAsset[]> {
      let names:string[];
      try{const remote=remoteStore();names=remote?await remote.list("asset-library"):await readdir(folder);}
      catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}
      // Owner's small photo collection; paginate if this grows beyond a few dozen assets.
      const assets=await Promise.all(names.filter(name=>name.endsWith(".json")&&z.string().uuid().safeParse(name.slice(0,-5)).success).map(name=>read(name.slice(0,-5))));
      const sorted=assets.filter((asset):asset is LibraryAsset=>asset!==null).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      return backfillQuality(sorted);
    },
    async add(file:File,details:AssetDetails):Promise<LibraryAsset> {
      const metadata=AssetDetailsSchema.parse(details);
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size===0||file.size>12*1024*1024)throw new MediaValidationError("JPG, PNG, WebP 사진을 12MB까지 등록할 수 있어요.");
      const bytes=Buffer.from(await file.arrayBuffer());
      let preview:Buffer;
      // 미리보기(카드에 쓰는 사진): 세로·정사각 사진은 긴 변 1400, 가로 사진은 가로 2160까지 둔다.
      // 가로 사진은 표지+2장 파노라마(render/panorama.ts)에서 2160 폭으로 펼쳐지므로 늘리지 않아도 되게.
      // 화소 제한은 2억 5천만(휴대폰 고화소 모드 2억 화소 사진까지). JPEG는 줄여 읽기(shrink-on-load)라 2억 화소도 메모리 200MB 안쪽이다.
      try{preview=await sharp(bytes,{limitInputPixels:MAX_INPUT_PIXELS}).rotate().resize(2160,1400,{fit:"inside",withoutEnlargement:true}).flatten({background:"#f5f1e8"}).jpeg({quality:88}).toBuffer();}
      catch{throw new MediaValidationError("이 사진 파일을 읽지 못했어요. 휴대폰 사진첩에서 다시 골라 주세요(JPG·PNG·WebP).");}
      const original=await createMediaStore(root).saveOriginal(file);
      // 사진 품질(어두움·흔들림 등)은 원본으로 한 번 잰다. 측정이 실패해도 사진 등록은 막지 않는다.
      const quality=await photoQuality(bytes).catch(()=>null);
      return save({...metadata,id:original.id,preview:`data:image/jpeg;base64,${preview.toString("base64")}`,createdAt:new Date().toISOString(),lastUsedAt:null,useCount:0,quality});
    },
    async markUsed(ids:string[]) {
      const now=new Date().toISOString();
      for(const id of new Set(ids)){const asset=await read(id);if(asset)await save({...asset,lastUsedAt:now,useCount:asset.useCount+1});}
    },
    // 이름·검색어 고치기(사진 보관함 관리). 없는 사진이면 null.
    async update(id:string,changes:Partial<Pick<AssetDetails,"name"|"tags">>):Promise<LibraryAsset|null> {
      const asset=await read(id);
      if(!asset)return null;
      const details=AssetDetailsSchema.parse({...asset,...changes});
      return save({...asset,name:details.name,tags:details.tags});
    },
    // 보관함에서 빼기. 보관함 목록 정보만 지우고, 처음 올린 원본 파일(originals)은 만일을 위해 남겨 둔다.
    // 이미 만든 초안·카드는 사진을 따로 담고 있어 영향이 없다.
    async remove(id:string):Promise<boolean> {
      z.string().uuid().parse(id);
      if(!(await read(id)))return false;
      const remote=remoteStore();
      if(remote)await remote.remove(`asset-library/${id}.json`);
      else await rm(path.join(folder,`${id}.json`),{force:true});
      return true;
    },
  };
}
