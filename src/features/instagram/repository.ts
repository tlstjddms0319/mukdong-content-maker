import { mkdir,open,readFile,rename,rm,writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { InstagramConnectionSchema,PublicationSchema,type InstagramConnection,type Publication,type PublicInstagramConnection } from "./schema";
import { remoteStore } from "@/lib/files/remoteStore";

const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export class PublicationLockError extends Error{
  constructor(){super("Draft is already being published.");this.name="PublicationLockError";}
}

async function readJson<T>(target:string,parse:(value:unknown)=>T):Promise<T|null>{
  try{return parse(JSON.parse(await readFile(target,"utf8")));}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
}

async function writeJson(target:string,value:unknown){
  await mkdir(path.dirname(target),{recursive:true});
  const temporary=`${target}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value,null,2),"utf8");
  await rename(temporary,target);
}

export function toPublicConnection(value:InstagramConnection|null):PublicInstagramConnection{
  if(!value)return {connected:false};
  return {connected:true,username:value.username,expiresAt:value.expiresAt,needsReconnect:new Date(value.expiresAt).getTime()<=Date.now()};
}

export function createInstagramRepository(root=process.env.DATA_DIR??path.join(process.cwd(),"data")){
  const directory=path.join(root,"instagram");
  const connectionPath=path.join(directory,"connection.json");
  // Supabase가 설정돼 있으면 연결 정보와 게시 기록을 그쪽에 둔다. Render의 /tmp는 재시작 때 지워지기 때문이다.
  // 게시 잠금 파일은 한 프로세스 안에서만 의미가 있으므로 계속 로컬에 둔다.
  const remote=remoteStore();
  const remoteJson=<T,>(name:string,parse:(value:unknown)=>T)=>remote!.read(name).then(raw=>raw===null?null:parse(JSON.parse(raw)));
  const publicationName=(draftId:string)=>`instagram/publications/${draftId}.json`;
  async function withPublicationLock<T>(draftId:string,task:()=>Promise<T>){
    if(!uuid(draftId))throw new Error("Invalid draft ID.");
    const lockPath=path.join(directory,"publication-locks",`${draftId}.lock`);
    await mkdir(path.dirname(lockPath),{recursive:true});
    let handle;
    try{handle=await open(lockPath,"wx");}
    catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new PublicationLockError();throw error;}
    try{return await task();}
    finally{try{await handle.close();}finally{await rm(lockPath,{force:true});}}
  }
  return {
    readConnection:()=>remote?remoteJson("instagram/connection.json",value=>InstagramConnectionSchema.parse(value)):readJson(connectionPath,value=>InstagramConnectionSchema.parse(value)),
    async saveConnection(value:InstagramConnection){const parsed=InstagramConnectionSchema.parse(value);if(remote)await remote.write("instagram/connection.json",JSON.stringify(parsed),"application/json");else await writeJson(connectionPath,parsed);return parsed;},
    async deleteConnection(){if(remote)await remote.remove("instagram/connection.json");else await rm(connectionPath,{force:true});},
    async readPublication(draftId:string){if(!uuid(draftId))return null;return remote?remoteJson(publicationName(draftId),value=>PublicationSchema.parse(value)):readJson(path.join(directory,"publications",`${draftId}.json`),value=>PublicationSchema.parse(value));},
    async savePublication(value:Publication){const parsed=PublicationSchema.parse(value);if(remote)await remote.write(publicationName(parsed.draftId),JSON.stringify(parsed),"application/json");else await writeJson(path.join(directory,"publications",`${parsed.draftId}.json`),parsed);return parsed;},
    withPublicationLock,
  };
}
