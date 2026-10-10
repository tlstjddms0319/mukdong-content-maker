import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import webpush from "web-push";
import { z } from "zod";
import { remoteStore } from "@/lib/files/remoteStore";
import { NotificationStateSchema, type NotificationState } from "./schema";

// 알림 상태(notifications/state.json)와 웹 푸시 서명 키(notifications/vapid.json)를 저장한다.
// Supabase가 있으면 거기, 없으면 DATA_DIR. 서명 키가 바뀌면 이미 받은 구독이 모두 무효가 되므로 한 번 만들면 계속 쓴다.

const STATE="notifications/state.json",KEYS="notifications/vapid.json";
const dataDirectory=()=>process.env.DATA_DIR??path.join(process.cwd(),"data");

async function readText(name:string):Promise<string|null> {
  const remote=remoteStore();
  if(remote)return remote.read(name);
  try{return await readFile(path.join(dataDirectory(),name),"utf8");}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}
}

async function writeText(name:string,value:string) {
  const remote=remoteStore();
  if(remote){await remote.write(name,value,"application/json");return;}
  const target=path.join(dataDirectory(),name);
  await mkdir(path.dirname(target),{recursive:true});
  const temporary=`${target}.${randomUUID()}.tmp`;
  await writeFile(temporary,value,"utf8");
  await rename(temporary,target);
}

export async function readNotificationState():Promise<NotificationState> {
  const raw=await readText(STATE);
  return NotificationStateSchema.parse(raw===null?{}:JSON.parse(raw));
}

// 읽고-고치고-쓰기를 한 줄로 세운다(예약 점검 타이머와 설정 저장이 겹쳐도 서로 덮어쓰지 않게).
let queue:Promise<unknown>=Promise.resolve();
export function updateNotificationState(change:(state:NotificationState)=>NotificationState|Promise<NotificationState>):Promise<NotificationState> {
  const task=queue.then(async()=>{
    const next=NotificationStateSchema.parse(await change(await readNotificationState()));
    await writeText(STATE,JSON.stringify(next));
    return next;
  });
  queue=task.catch(()=>undefined);
  return task;
}

const VapidKeysSchema=z.object({publicKey:z.string().min(1),privateKey:z.string().min(1)});
export type VapidKeys=z.infer<typeof VapidKeysSchema>;
let cachedKeys:Promise<VapidKeys>|null=null;

// 환경변수(VAPID_PUBLIC_KEY·VAPID_PRIVATE_KEY)가 있으면 그것을, 없으면 저장소의 키를 쓰고, 그것도 없으면 새로 만들어 저장한다.
export function readVapidKeys():Promise<VapidKeys> {
  const publicKey=process.env.VAPID_PUBLIC_KEY?.trim(),privateKey=process.env.VAPID_PRIVATE_KEY?.trim();
  if(publicKey&&privateKey)return Promise.resolve({publicKey,privateKey});
  cachedKeys??=(async()=>{
    const raw=await readText(KEYS);
    if(raw!==null)return VapidKeysSchema.parse(JSON.parse(raw));
    const keys=webpush.generateVAPIDKeys();
    await writeText(KEYS,JSON.stringify(keys));
    return keys;
  })();
  cachedKeys.catch(()=>{cachedKeys=null;});
  return cachedKeys;
}

export function resetNotificationCaches(){cachedKeys=null;queue=Promise.resolve();}
