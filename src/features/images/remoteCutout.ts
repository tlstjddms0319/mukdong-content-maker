import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { remoteStore } from "@/lib/files/remoteStore";
import { api, authorization, isHiggsfieldConfigured, uploadReference, waitForCompletion, type Job } from "./higgsfieldRequest";
import { cutoutKey, cutoutPhoto, hasPreparedCutout, registerPreparedCutout } from "./styles/shared";

// 원격 누끼: 로컬 누끼(styles/shared.ts cutoutPhoto)가 포기한 사진만 Higgsfield 배경 제거로 보내 투명 PNG를 받는다.
// - 설정에서 켠 경우에만, 누끼를 쓰는 계열(컬러 블록·팝업북·키치)의 카드를 만들 때만 부른다(사장님 결정, 기본 꺼짐).
// - 같은 사진은 한 번만 처리한다: 원본 sha1을 열쇠로 결과를 저장소(cutouts/)에 남기고 다음에는 저장소에서 꺼낸다.
// - 이번 달 사용 크레딧을 장부(cutouts/ledger-YYYY-MM.json)에 적고, 월 예산을 넘길 것 같으면 부르지 않고 로컬 누끼로 둔다.
// - 키가 없거나, 예산이 없거나, 호출이 실패하면 조용히 로컬 누끼로 돌아간다(카드 생성을 막지 않는다).
//
// 엔드포인트 경로: 이 개발 환경에서는 Higgsfield 문서(docs.higgsfield.ai)에 접속할 수 없어 배경 제거 REST 경로를 확인하지 못했다.
// 기본값은 추정이며 배포 환경에서 첫 호출로 확인 필요. 맞지 않으면 환경변수 HF_REMOVE_BG_PATH로 덮어쓴다.
// 경로가 없다는 답(404·405)이 오면 서버가 다시 시작될 때까지 그 경로로는 다시 부르지 않는다(헛걸음 반복 방지).
export const DEFAULT_REMOVE_BG_PATH="/higgsfield-ai/image-background-remover";
export const REMOTE_CUTOUT_STYLES:ReadonlySet<string>=new Set(["colorblock","popup","kitsch"]);
// 한 장의 대기 한도. 카드 생성 화면이 오래 멈추지 않도록 이미지 생성(5분)보다 짧게 둔다.
const JOB_TIMEOUT_MS=90_000;

export type CutoutLedger={month:string;used:number;calls:{key:string;cost:number;at:string}[]};
export type CutoutStore={
  readBytes(name:string):Promise<Buffer|null>;
  writeBytes(name:string,value:Buffer):Promise<void>;
  readText(name:string):Promise<string|null>;
  writeText(name:string,value:string):Promise<void>;
};

// 저장소: Supabase가 설정돼 있으면 그곳(재시작에도 남음), 아니면 data/cutouts. 기존 mediaStore·settings 저장 방식과 같다.
// Supabase 읽기 도구(remoteStore.read)는 글자만 돌려주므로 원격에는 PNG를 base64 글자로 넣는다(cutouts/<sha1>.png.b64).
export function cutoutStore():CutoutStore {
  const remote=remoteStore();
  if(remote)return {
    async readBytes(name){const raw=await remote.read(`${name}.b64`);return raw===null?null:Buffer.from(raw,"base64");},
    async writeBytes(name,value){await remote.write(`${name}.b64`,value.toString("base64"),"text/plain");},
    readText:name=>remote.read(name),
    async writeText(name,value){await remote.write(name,value,"application/json");},
  };
  const root=process.env.DATA_DIR??path.join(process.cwd(),"data");
  const file=(name:string)=>path.join(root,...name.split("/"));
  const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==="ENOENT";
  const save=async(name:string,value:Buffer|string)=>{
    const target=file(name);
    await mkdir(path.dirname(target),{recursive:true});
    const temporary=`${target}.${randomUUID()}.tmp`;
    await writeFile(temporary,value);
    await rename(temporary,target);
  };
  return {
    async readBytes(name){try{return await readFile(file(name));}catch(error){if(missing(error))return null;throw error;}},
    writeBytes:save,
    async readText(name){try{return await readFile(file(name),"utf8");}catch(error){if(missing(error))return null;throw error;}},
    writeText:save,
  };
}

export const monthOf=(date:Date):string=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
const ledgerName=(month:string)=>`cutouts/ledger-${month}.json`;

export async function readCutoutLedger(store:CutoutStore=cutoutStore(),now:Date=new Date()):Promise<CutoutLedger> {
  const month=monthOf(now);
  const raw=await store.readText(ledgerName(month)).catch(()=>null);
  if(!raw)return {month,used:0,calls:[]};
  try{
    const parsed=JSON.parse(raw) as Partial<CutoutLedger>;
    return {month,used:Number.isFinite(parsed.used)?Number(parsed.used):0,calls:Array.isArray(parsed.calls)?parsed.calls:[]};
  }catch{return {month,used:0,calls:[]};}
}

// 같은 서버 안에서 장부를 동시에 고쳐 쓰지 않도록 한 줄로 세운다.
let ledgerQueue:Promise<unknown>=Promise.resolve();
function addToLedger(store:CutoutStore,now:Date,key:string,cost:number):Promise<CutoutLedger> {
  const run=async()=>{
    const ledger=await readCutoutLedger(store,now);
    const next={...ledger,used:ledger.used+cost,calls:[...ledger.calls,{key,cost,at:now.toISOString()}].slice(-500)};
    await store.writeText(ledgerName(ledger.month),JSON.stringify(next));
    return next;
  };
  const pending=ledgerQueue.then(run,run);
  ledgerQueue=pending.catch(()=>undefined);
  return pending;
}

// 응답에 크레딧 값이 있으면 그 값, 없으면 환경변수 HF_REMOVE_BG_CREDITS, 그것도 없으면 장당 1로 센다.
function costOf(job:Record<string,unknown>,env:Record<string,string|undefined>):number {
  for(const field of ["credits","credits_used","cost","price"]){const value=Number(job[field]);if(Number.isFinite(value)&&value>0)return value;}
  const configured=Number(env.HF_REMOVE_BG_CREDITS);
  return Number.isFinite(configured)&&configured>0?configured:1;
}

const unavailablePaths=new Set<string>();
export const resetRemoteCutoutState=():void=>{unavailablePaths.clear();};

export type RemoteCutoutResult={png:Buffer;source:"cache"|"remote"}|{png:null;reason:"unconfigured"|"budget"|"unavailable"|"failed"};
export type RemoteCutoutDeps={store?:CutoutStore;now?:Date;env?:Record<string,string|undefined>;timeoutMs?:number};

// 사진 한 장의 원격 누끼. 캐시 → 예산 확인 → 호출 → 캐시·장부 기록 순서.
export async function remoteCutout(original:Buffer,options:{monthlyCredits:number},deps:RemoteCutoutDeps={}):Promise<RemoteCutoutResult> {
  const env=deps.env??process.env,store=deps.store??cutoutStore(),now=deps.now??new Date();
  const key=cutoutKey(original),cacheName=`cutouts/${key}.png`;
  const cached=await store.readBytes(cacheName).catch(()=>null);
  if(cached)return {png:cached,source:"cache"};
  if(!isHiggsfieldConfigured(env as NodeJS.ProcessEnv))return {png:null,reason:"unconfigured"};
  const route=env.HF_REMOVE_BG_PATH?.trim()||DEFAULT_REMOVE_BG_PATH;
  if(unavailablePaths.has(route))return {png:null,reason:"unavailable"};
  // 장당 비용을 아직 모르면 1로 보고 예산을 미리 확인한다(넘칠 것 같으면 부르지 않는다).
  const ledger=await readCutoutLedger(store,now);
  const expected=costOf({},env);
  if(options.monthlyCredits<=0||ledger.used+expected>options.monthlyCredits)return {png:null,reason:"budget"};
  let job:Job&Record<string,unknown>;
  try{
    const auth=authorization();
    const jpeg=await sharp(original).rotate().resize({width:1536,height:1536,fit:"inside",withoutEnlargement:true}).jpeg({quality:92}).toBuffer();
    const imageUrl=await uploadReference(`data:image/jpeg;base64,${jpeg.toString("base64")}`,auth);
    const started=await api<Job&Record<string,unknown>>(route,{method:"POST",body:{image_url:imageUrl}},auth);
    job=await waitForCompletion(started,auth,deps.timeoutMs??JOB_TIMEOUT_MS) as Job&Record<string,unknown>;
  }catch(error){
    const status=(error as {status?:number}).status;
    if(status===404||status===405)unavailablePaths.add(route);
    console.warn("[cutout] 원격 누끼를 받지 못해 로컬 누끼로 그립니다:",error instanceof Error?error.name:String(error),status??"");
    return {png:null,reason:status===404||status===405?"unavailable":"failed"};
  }
  // 작업이 끝났으면 크레딧은 이미 쓰였으므로 결과가 쓸모없어도 장부에는 적는다.
  await addToLedger(store,now,key,costOf(job,env)).catch(error=>console.warn("[cutout] 누끼 사용량 장부를 쓰지 못했어요:",error instanceof Error?error.message:String(error)));
  const url=job.images?.[0]?.url;
  if(!url)return {png:null,reason:"failed"};
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(60_000)});
    if(!response.ok)return {png:null,reason:"failed"};
    const image=sharp(Buffer.from(await response.arrayBuffer()));
    // 투명 칸이 없는 결과(흰 바탕 JPEG 등)는 누끼가 아니므로 쓰지 않는다.
    if(!(await image.metadata()).hasAlpha)return {png:null,reason:"failed"};
    const png=await image.png().toBuffer();
    await store.writeBytes(cacheName,png).catch(()=>undefined);
    return {png,source:"remote"};
  }catch{return {png:null,reason:"failed"};}
}

// 카드 생성 라우트가 렌더 전에 부른다. 설정이 켜져 있고 누끼 계열이면, 로컬 누끼가 포기하는 사진만 골라 원격 누끼를 받아
// 렌더 보관소(registerPreparedCutout)에 넣는다. 렌더는 보관소를 조회만 한다. 돌려주는 값은 준비된 장수(테스트·로그용).
// 사진은 한 장씩 차례로 처리한다(동시에 보내면 예산 확인이 서로를 못 봐 예산을 넘길 수 있다).
export async function prepareRemoteCutouts(originals:Buffer[],options:{enabled:boolean;style?:string;monthlyCredits:number},deps:RemoteCutoutDeps={}):Promise<number> {
  if(!options.enabled||!options.style||!REMOTE_CUTOUT_STYLES.has(options.style)||!originals.length)return 0;
  let prepared=0;
  for(const original of originals){
    try{
      if(hasPreparedCutout(original)){prepared++;continue;}
      // 로컬 누끼가 되는 사진(단색 배경 스튜디오 사진 등)은 크레딧을 쓰지 않는다.
      if(await cutoutPhoto(original,640))continue;
      const result=await remoteCutout(original,options,deps);
      // 예산·키·경로 문제여도 다음 사진은 저장소 캐시에 있을 수 있어 계속 본다(캐시 확인은 비용이 없다).
      if(!result.png)continue;
      await registerPreparedCutout(original,result.png);
      prepared++;
    }catch(error){console.warn("[cutout] 원격 누끼 준비 실패, 로컬 누끼로 그립니다:",error instanceof Error?error.name:String(error));}
  }
  return prepared;
}
