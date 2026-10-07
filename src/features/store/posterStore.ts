import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { remoteStore } from "@/lib/files/remoteStore";
import { MediaValidationError } from "@/lib/files/mediaStore";

// 사장님이 설정 화면에서 올린 "맨 뒤 가게 홍보 포스터". 있으면 저장소에 기본으로 들어 있는 포스터(assets/store/promo-card.webp)보다 먼저 쓴다.
// Supabase가 연결돼 있으면 거기(store/promo-poster.json), 아니면 DATA_DIR에 둔다. Supabase 읽기 도구는 글자만 돌려주므로
// 그림은 base64 글자로 JSON에 넣는다. 올릴 때 한 번 다듬어(회전 바로잡기·크기 줄이기·JPEG) 저장해 두고, 카드에는 그대로 쓴다.

const FILE="store/promo-poster.json";
export type CustomPoster={image:Buffer;updatedAt:string};
type PosterStore={read():Promise<string|null>;write(value:string):Promise<void>;remove():Promise<void>};

function posterStore(root=process.env.DATA_DIR??path.join(process.cwd(),"data")):PosterStore {
  const remote=remoteStore();
  if(remote)return {read:()=>remote.read(FILE),write:value=>remote.write(FILE,value,"application/json"),remove:()=>remote.remove(FILE)};
  const file=path.join(root,...FILE.split("/"));
  return {
    async read(){try{return await readFile(file,"utf8");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}},
    async write(value){await mkdir(path.dirname(file),{recursive:true});const temporary=`${file}.${process.pid}.tmp`;await writeFile(temporary,value);await rename(temporary,file);},
    async remove(){await rm(file,{force:true});},
  };
}
// 테스트(vitest) 중에는 실제 data 폴더·Supabase를 건드리지 않도록 기본 저장소를 메모리에 둔다.
export function memoryPosterStore():PosterStore {
  let value:string|null=null;
  return {async read(){return value;},async write(next){value=next;},async remove(){value=null;}};
}
const defaultFactory=():(()=>PosterStore)=>{if(process.env.VITEST){const memory=memoryPosterStore();return ()=>memory;}return ()=>posterStore();};
let storeFactory:()=>PosterStore=defaultFactory();
export function setPosterStoreForTests(factory:(()=>PosterStore)|null){storeFactory=factory??defaultFactory();}

export async function readCustomPoster():Promise<CustomPoster|null> {
  const raw=await storeFactory().read();
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as {image?:string;updatedAt?:string};
    if(!value.image||!value.updatedAt)return null;
    return {image:Buffer.from(value.image,"base64"),updatedAt:value.updatedAt};
  }catch{return null;}
}

// 올린 그림 확인·다듬기: JPG·PNG·WebP, 12MB 이하, 너무 작지 않게(짧은 변 600px 이상). 긴 변은 2700px까지 줄인다.
export const POSTER_MAX_BYTES=12*1024*1024;
export async function saveCustomPoster(file:{type:string;size:number;arrayBuffer():Promise<ArrayBuffer>},now:Date=new Date()):Promise<CustomPoster> {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size===0||file.size>POSTER_MAX_BYTES)throw new MediaValidationError("JPG, PNG, WebP 그림을 12MB까지 올릴 수 있어요.");
  const bytes=Buffer.from(await file.arrayBuffer());
  let image:Buffer;
  try{
    const meta=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().metadata();
    const turned=(meta.orientation??1)>=5;
    const width=(turned?meta.height:meta.width)??0,height=(turned?meta.width:meta.height)??0;
    if(Math.min(width,height)<600)throw new MediaValidationError("그림이 너무 작아요. 짧은 쪽이 600px 이상인 그림을 올려 주세요.");
    // 투명한 부분은 크림색으로 채운다(카드 바탕과 어울리게).
    image=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize(2160,2700,{fit:"inside",withoutEnlargement:true}).flatten({background:"#f5f1e8"}).jpeg({quality:92}).toBuffer();
  }catch(error){
    if(error instanceof MediaValidationError)throw error;
    throw new MediaValidationError("그림을 읽지 못했어요. 다른 파일로 올려 주세요.");
  }
  const poster={image,updatedAt:now.toISOString()};
  await storeFactory().write(JSON.stringify({image:image.toString("base64"),updatedAt:poster.updatedAt}));
  return poster;
}

export async function removeCustomPoster():Promise<void> {
  await storeFactory().remove();
}
