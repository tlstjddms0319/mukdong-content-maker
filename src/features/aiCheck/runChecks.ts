import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { checkCoverCandidates } from "@/features/images/coverCheck";
import { TEXT_PROVIDER_ORDER, resolveTextClients, type TextAiClient, type TextProvider } from "@/lib/ai/textClient";

// 설정 화면 "AI 연결 실제 점검". Render 환경변수에 넣은 키로 각 AI를 아주 작게 한 번씩 불러 실제로 되는지 확인한다.
// - 문안 AI(Gemini·Groq·Cloudflare): 짧은 JSON 하나 받기. 자동 전환 때문에 화면에서는 가려지는 "첫 순서 실패"를 따로 보여 준다.
// - 표지 점검(Gemini 이미지 보기): 저장소에 들어 있는 홍어 견본 사진 한 장을 보고 "홍어로 보이는지" 답하는지.
// - Higgsfield·OpenAI: 이미지를 만들지 않고 키 인증만 확인(크레딧 사용 없음).
// 키 값은 결과에 절대 넣지 않고, 오류 메시지에 키가 섞여 오면 가린다.

export type AiCheckStatus="ok"|"fail"|"skip";
export type AiCheckItem={id:string;label:string;status:AiCheckStatus;message:string;ms?:number};
type Fetch=typeof fetch;
export type AiCheckDeps={
  env?:Record<string,string|undefined>;
  fetch?:Fetch;
  textClients?:Partial<Record<TextProvider,()=>TextAiClient>>;
  coverCheck?:typeof checkCoverCandidates;
  sampleImage?:()=>Promise<Buffer>;
  timeoutMs?:number;
};

const TEXT_LABELS:Record<TextProvider,string>={gemini:"문안 AI · Gemini",groq:"문안 AI · Groq",cloudflare:"문안 AI · Cloudflare"};
const SECRET_NAMES=["GEMINI_API_KEY","GROQ_API_KEY","CLOUDFLARE_API_TOKEN","OPENAI_API_KEY","HF_API_KEY_ID","HF_API_KEY_SECRET"];
const SAMPLE=path.join(process.cwd(),"assets/design/samples/studio-hongeo.jpg");

// 오류 메시지를 사람이 읽을 길이로 줄이고, 혹시 섞여 온 키 값을 가린다.
export function scrubMessage(message:string,env:Record<string,string|undefined>):string {
  let text=message.replace(/\s+/g," ").trim().slice(0,240);
  for(const name of SECRET_NAMES){const value=env[name]?.trim();if(value&&value.length>=6)text=text.split(value).join("***");}
  return text||"알 수 없는 오류";
}

async function timed(id:string,label:string,timeoutMs:number,env:Record<string,string|undefined>,run:()=>Promise<string>):Promise<AiCheckItem> {
  const started=Date.now();
  try{
    const message=await Promise.race([run(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error(`${Math.round(timeoutMs/1000)}초 안에 답이 없어요.`)),timeoutMs))]);
    return {id,label,status:"ok",message,ms:Date.now()-started};
  }catch(error){
    return {id,label,status:"fail",message:scrubMessage(error instanceof Error?error.message:String(error),env),ms:Date.now()-started};
  }
}
const skip=(id:string,label:string,message:string):AiCheckItem=>({id,label,status:"skip",message});

export async function runAiChecks(deps:AiCheckDeps={}):Promise<AiCheckItem[]> {
  const env=deps.env??process.env;
  const request=deps.fetch??fetch;
  const timeoutMs=deps.timeoutMs??30_000;
  const checks:Array<Promise<AiCheckItem>>=[];

  // 1) 문안 AI: 순서대로가 아니라 하나씩 따로 불러, 어느 것이 실제로 되는지 각각 보여 준다.
  for(const provider of TEXT_PROVIDER_ORDER){
    const factory=deps.textClients?.[provider];
    const [client]=factory?[factory()]:resolveTextClients(provider);
    if(!client){checks.push(Promise.resolve(skip(`text-${provider}`,TEXT_LABELS[provider],"키가 설정되지 않았어요.")));continue;}
    checks.push(timed(`text-${provider}`,TEXT_LABELS[provider],timeoutMs,env,async()=>{
      const answer=await client.generateJson('연결 확인입니다. {"ok":true,"word":"홍어"} 와 똑같은 JSON만 반환하세요.',z.object({ok:z.literal(true),word:z.string()}));
      return `정상 응답 (${answer.word})`;
    }));
  }

  // 2) 표지 점검: 견본 홍어 사진을 보고 판단하는지.
  if(env.GEMINI_API_KEY?.trim()){
    checks.push(timed("cover-vision","표지 점검 · Gemini 이미지 보기",timeoutMs,env,async()=>{
      const image=await (deps.sampleImage?.()??readFile(SAMPLE));
      const [check]=(await (deps.coverCheck??checkCoverCandidates)([image],{apiKey:env.GEMINI_API_KEY,fetch:request,strict:true}))??[];
      if(!check)throw new Error("점검 결과가 비어 있어요.");
      return `견본 사진 점수 ${check.score}/10 · 홍어로 ${check.looksLikeSkate?"보임":"안 보임(모델이 사진을 잘못 읽는 중)"}`;
    }));
  }else checks.push(Promise.resolve(skip("cover-vision","표지 점검 · Gemini 이미지 보기","Gemini 키가 없어서 표지 점검을 건너뛰어요.")));

  // 3) Higgsfield: 없는 요청 번호의 상태를 물어 키만 확인(scripts/check-higgsfield.mjs와 같은 방법).
  const hfId=env.HF_API_KEY_ID?.trim(),hfSecret=env.HF_API_KEY_SECRET?.trim();
  if(hfId&&hfSecret){
    checks.push(timed("higgsfield","이미지 AI · Higgsfield",timeoutMs,env,async()=>{
      const response=await request("https://api.higgsfield.ai/requests/00000000-0000-4000-8000-000000000000/status",{headers:{Authorization:`Key ${hfId}:${hfSecret}`,Accept:"application/json"}});
      if(response.status===401||response.status===403)throw new Error(`키가 거부됐어요(${response.status}). 키 ID와 시크릿이 한 쌍인지 확인해 주세요.`);
      return `키 인증 통과 (응답 ${response.status}, 크레딧 사용 없음)`;
    }));
  }else checks.push(Promise.resolve(skip("higgsfield","이미지 AI · Higgsfield","키가 설정되지 않았어요.")));

  // 4) OpenAI: 모델 목록 요청으로 키만 확인(무료).
  const openai=env.OPENAI_API_KEY?.trim();
  if(openai){
    checks.push(timed("openai","이미지 AI · OpenAI",timeoutMs,env,async()=>{
      const response=await request("https://api.openai.com/v1/models",{headers:{Authorization:`Bearer ${openai}`}});
      if(!response.ok)throw new Error(response.status===401?"키가 거부됐어요(401).":`HTTP ${response.status}`);
      return "키 인증 통과 (요금 없음)";
    }));
  }else checks.push(Promise.resolve(skip("openai","이미지 AI · OpenAI","키가 설정되지 않았어요.")));

  return Promise.all(checks);
}
