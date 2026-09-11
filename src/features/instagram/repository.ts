import { mkdir,readFile,rename,rm,writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { InstagramConnectionSchema,PublicationSchema,type InstagramConnection,type Publication,type PublicInstagramConnection } from "./schema";

const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  return {
    readConnection:()=>readJson(connectionPath,value=>InstagramConnectionSchema.parse(value)),
    async saveConnection(value:InstagramConnection){const parsed=InstagramConnectionSchema.parse(value);await writeJson(connectionPath,parsed);return parsed;},
    async deleteConnection(){await rm(connectionPath,{force:true});},
    async readPublication(draftId:string){if(!uuid(draftId))return null;return readJson(path.join(directory,"publications",`${draftId}.json`),value=>PublicationSchema.parse(value));},
    async savePublication(value:Publication){const parsed=PublicationSchema.parse(value);await writeJson(path.join(directory,"publications",`${parsed.draftId}.json`),parsed);return parsed;},
  };
}
