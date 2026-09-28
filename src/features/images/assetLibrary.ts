import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { createMediaStore, MediaValidationError } from "@/lib/files/mediaStore";
import { remoteStore } from "@/lib/files/remoteStore";
import { AssetDetailsSchema, LibraryAssetSchema, type AssetDetails, type LibraryAsset } from "./freeCards";

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
  return {
    read,
    async list():Promise<LibraryAsset[]> {
      let names:string[];
      try{const remote=remoteStore();names=remote?await remote.list("asset-library"):await readdir(folder);}
      catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}
      // Owner's small photo collection; paginate if this grows beyond a few dozen assets.
      const assets=await Promise.all(names.filter(name=>name.endsWith(".json")&&z.string().uuid().safeParse(name.slice(0,-5)).success).map(name=>read(name.slice(0,-5))));
      return assets.filter((asset):asset is LibraryAsset=>asset!==null).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    },
    async add(file:File,details:AssetDetails):Promise<LibraryAsset> {
      const metadata=AssetDetailsSchema.parse(details);
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size===0||file.size>12*1024*1024)throw new MediaValidationError("JPG, PNG, WebP 사진을 12MB까지 등록할 수 있어요.");
      let preview:Buffer;
      try{preview=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:40_000_000}).rotate().resize(1400,1400,{fit:"inside",withoutEnlargement:true}).flatten({background:"#f5f1e8"}).jpeg({quality:88}).toBuffer();}
      catch{throw new MediaValidationError("읽을 수 있는 이미지 파일을 골라 주세요. 최대 4천만 화소까지 지원해요.");}
      const original=await createMediaStore(root).saveOriginal(file);
      return save({...metadata,id:original.id,preview:`data:image/jpeg;base64,${preview.toString("base64")}`,createdAt:new Date().toISOString(),lastUsedAt:null});
    },
    async markUsed(ids:string[]) {
      const now=new Date().toISOString();
      for(const id of ids){const asset=await read(id);if(asset)await save({...asset,lastUsedAt:now});}
    },
  };
}
