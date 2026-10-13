import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { remoteStore } from "@/lib/files/remoteStore";
import type { DraftSummary } from "@/features/drafts/summary";

// 했던 주제 기록(사장님 요청 2026-10-12: 했던 주제·보관함 주제는 다시 추천하지 않기).
// 게시물은 만든 지 30일이 지나면 지워지므로(drafts/retention.ts) 지우기 전에 주제 제목만 여기에 남긴다.
// 주제 추천은 이 기록 + 남아 있는 모든 게시물(보관함 포함) 주제를 "했던 주제"로 보고 다시 고르지 않는다(말만 바꾼 제목 포함).
const FILE="topic-history.json";
export const TOPIC_HISTORY_MAX=300;
export const USED_TITLES_MAX=300;
type Entry={title:string;at:string};

const dataDirectory=()=>process.env.DATA_DIR??path.join(process.cwd(),"data");
let writeQueue:Promise<void>=Promise.resolve();

async function readEntries():Promise<Entry[]> {
  try{
    const remote=remoteStore();
    const raw=remote?await remote.read(FILE):await readFile(path.join(dataDirectory(),FILE),"utf8");
    if(!raw)return [];
    const parsed=JSON.parse(raw) as unknown;
    return Array.isArray(parsed)?parsed.filter((item):item is Entry=>typeof item?.title==="string"&&typeof item?.at==="string"):[];
  }catch(error){
    if((error as NodeJS.ErrnoException).code==="ENOENT")return [];
    throw error;
  }
}

// 최근 것부터.
export async function readTopicHistory():Promise<string[]> {
  return (await readEntries()).map(entry=>entry.title);
}

// 같은 제목은 한 번만, 최근 것을 앞에 두고 최대 300개.
export async function appendTopicHistory(titles:readonly string[],now=new Date()):Promise<void> {
  const fresh=titles.map(title=>title.trim()).filter(title=>title.length>0&&title.length<=120);
  if(!fresh.length)return;
  const write=async()=>{
    const old=await readEntries();
    const seen=new Set<string>();
    const entries=[...fresh.map(title=>({title,at:now.toISOString()})),...old].filter(entry=>!seen.has(entry.title)&&Boolean(seen.add(entry.title))).slice(0,TOPIC_HISTORY_MAX);
    const body=JSON.stringify(entries);
    const remote=remoteStore();
    if(remote){await remote.write(FILE,body,"application/json");return;}
    const directory=dataDirectory();
    await mkdir(directory,{recursive:true});
    const target=path.join(directory,FILE),temporary=`${target}.${randomUUID()}.tmp`;
    await writeFile(temporary,body,"utf8");
    await rename(temporary,target);
  };
  const pending=writeQueue.then(write);
  writeQueue=pending.catch(()=>undefined);
  return pending;
}

// 다시 추천하지 않을 주제: 이 브라우저에서 최근에 보여 준 것 → 최근 게시물 → 보관함 게시물 → 나머지 게시물 → 지워진 게시물 기록 순(중복 없이).
// 앞쪽(최근)일수록 AI 프롬프트에도 들어가고, 전부는 받은 주제를 거르는 데 쓴다(topics/service.ts assembleTopics).
export function usedTopicTitles(drafts:readonly Pick<DraftSummary,"topic"|"updated_at"|"archived">[],history:readonly string[],shown:readonly string[]=[]):string[] {
  const byRecent=[...drafts].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  const titles=[...shown,...byRecent.slice(0,10).map(draft=>draft.topic),...byRecent.filter(draft=>draft.archived).map(draft=>draft.topic),...byRecent.map(draft=>draft.topic),...history];
  return [...new Set(titles.map(title=>title.trim()).filter(title=>title.length>0&&title.length<=120))].slice(0,USED_TITLES_MAX);
}
