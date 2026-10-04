import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { remoteStore } from "@/lib/files/remoteStore";
import { MonthPlanSchema, MonthSchema, type MonthPlan } from "./monthPlan";

// 한 달 기획을 달마다 한 파일로 저장한다(content-plans/YYYY-MM.json). Supabase가 있으면 거기, 없으면 DATA_DIR.
const dataDirectory=()=>process.env.DATA_DIR??path.join(process.cwd(),"data");
const key=(month:string)=>`content-plans/${MonthSchema.parse(month)}.json`;

export async function readMonthPlan(month:string):Promise<MonthPlan|null> {
  try{
    const remote=remoteStore();
    const raw=remote?await remote.read(key(month)):await readFile(path.join(dataDirectory(),key(month)),"utf8");
    return raw===null?null:MonthPlanSchema.parse(JSON.parse(raw));
  }catch(error){
    if((error as NodeJS.ErrnoException).code==="ENOENT")return null;
    throw error;
  }
}

export async function writeMonthPlan(plan:MonthPlan):Promise<void> {
  const value=MonthPlanSchema.parse(plan);
  const remote=remoteStore();
  if(remote){await remote.write(key(value.month),JSON.stringify(value),"application/json");return;}
  const target=path.join(dataDirectory(),key(value.month));
  await mkdir(path.dirname(target),{recursive:true});
  const temporary=`${target}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value,null,2),"utf8");
  await rename(temporary,target);
}
