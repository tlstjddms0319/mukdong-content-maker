// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only",()=>({}));
const { remoteCutout, prepareRemoteCutouts, readCutoutLedger, resetRemoteCutoutState, DEFAULT_REMOVE_BG_PATH }=await import("@/features/images/remoteCutout");
const { clearPreparedCutouts, cutoutPhoto, hasPreparedCutout }=await import("@/features/images/styles/shared");
const { withRenderContext }=await import("@/features/images/render/primitives");
const { typographyOf }=await import("@/features/images/typography");
const { runAiChecks }=await import("@/features/aiCheck/runChecks");
type Store=import("@/features/images/remoteCutout").CutoutStore;

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const ENV={HF_API_KEY_ID:"key-id",HF_API_KEY_SECRET:"key-secret"};
const NOW=new Date("2026-10-07T03:00:00Z");

function memoryStore(){
  const files=new Map<string,Buffer|string>();
  const store:Store={
    async readBytes(name){const value=files.get(name);return value===undefined?null:Buffer.from(value);},
    async writeBytes(name,value){files.set(name,value);},
    async readText(name){const value=files.get(name);return value===undefined?null:String(value);},
    async writeText(name,value){files.set(name,value);},
  };
  return {files,store};
}

// 로컬 누끼가 포기하는 사진: 가장자리 색이 들쭉날쭉한 식탁 사진 흉내(여러 색 띠 + 가운데 접시).
function busyPhoto(seed=1){
  const colors=["#2b1d14","#e8d7b0","#6b3f22","#f4f1ea","#1f3a2c","#c9a46a","#3d2a1e","#ddd"];
  const stripes=Array.from({length:12},(_,i)=>`<rect x="${i*20}" y="0" width="20" height="300" fill="${colors[(i+seed)%colors.length]}"/>`).join("");
  return sharp(Buffer.from(`<svg width="240" height="300" xmlns="http://www.w3.org/2000/svg">${stripes}<circle cx="120" cy="150" r="80" fill="#b23a3a"/><rect x="${20+seed*7}" y="30" width="60" height="40" fill="#1144aa"/></svg>`)).jpeg().toBuffer();
}
// 로컬 누끼가 되는 사진: 단색 바탕 위 접시.
const studioPhoto=()=>sharp(Buffer.from(`<svg width="240" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d8d4cc"/><circle cx="120" cy="150" r="80" fill="#b23a3a"/></svg>`)).jpeg().toBuffer();
// Higgsfield가 돌려줄 투명 PNG(가운데 원만 남은 누끼).
const cutoutPng=()=>sharp(Buffer.from(`<svg width="240" height="300" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="150" r="90" fill="#c04040"/></svg>`)).png().toBuffer();

function higgsfield(png:Buffer,options:{path?:string;status?:number;credits?:number}={}){
  const calls:string[]=[];
  const fetcher=vi.fn(async(url:string)=>{
    calls.push(url);
    if(url.endsWith("/files/generate-upload-url"))return json({upload_url:"https://upload.example.com/put",public_url:"https://cdn.example.com/in.jpg"});
    if(url==="https://upload.example.com/put")return new Response(null,{status:200});
    if(url.endsWith(options.path??DEFAULT_REMOVE_BG_PATH))return options.status?new Response("{}",{status:options.status}):json({status:"completed",request_id:"r1",images:[{url:"https://cdn.example.com/out.png"}],...(options.credits?{credits:options.credits}:{})});
    if(url==="https://cdn.example.com/out.png")return new Response(new Uint8Array(png));
    return new Response("{}",{status:500});
  });
  vi.stubGlobal("fetch",fetcher);
  return {calls,fetcher};
}

beforeEach(()=>{
  vi.stubEnv("HF_API_KEY_ID",ENV.HF_API_KEY_ID);
  vi.stubEnv("HF_API_KEY_SECRET",ENV.HF_API_KEY_SECRET);
  resetRemoteCutoutState();
  clearPreparedCutouts();
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe("remote cutout",()=>{
  it("calls Higgsfield once, caches by the original sha1, and records the credits in this month's ledger",async()=>{
    const {files,store}=memoryStore();
    const {calls}=higgsfield(await cutoutPng(),{credits:2});
    const photo=await busyPhoto();
    const first=await remoteCutout(photo,{monthlyCredits:20},{store,now:NOW,env:ENV});
    expect(first).toMatchObject({source:"remote"});
    expect(calls.some(url=>url.endsWith(DEFAULT_REMOVE_BG_PATH))).toBe(true);
    expect([...files.keys()].some(name=>/^cutouts\/[0-9a-f]{40}\.png$/.test(name))).toBe(true);
    expect(await readCutoutLedger(store,NOW)).toMatchObject({month:"2026-10",used:2});
    const callsBefore=calls.length;
    const second=await remoteCutout(photo,{monthlyCredits:20},{store,now:NOW,env:ENV});
    expect(second).toMatchObject({source:"cache"});
    expect(calls.length).toBe(callsBefore);
  });

  it("does not call when this month's budget is used up, and counts unknown costs as 1",async()=>{
    const {store}=memoryStore();
    await store.writeText("cutouts/ledger-2026-10.json",JSON.stringify({month:"2026-10",used:20,calls:[]}));
    const {fetcher}=higgsfield(await cutoutPng());
    expect(await remoteCutout(await busyPhoto(),{monthlyCredits:20},{store,now:NOW,env:ENV})).toEqual({png:null,reason:"budget"});
    expect(fetcher).not.toHaveBeenCalled();
    // 다음 달에는 장부가 새로 시작된다. 응답에 비용이 없으면 1로 센다.
    const next=new Date("2026-11-01T00:00:00Z");
    expect(await remoteCutout(await busyPhoto(),{monthlyCredits:20},{store,now:next,env:ENV})).toMatchObject({source:"remote"});
    expect(await readCutoutLedger(store,next)).toMatchObject({month:"2026-11",used:1});
  });

  it("falls back quietly without keys, and stops using a path the server says does not exist",async()=>{
    const {store}=memoryStore();
    const {fetcher}=higgsfield(await cutoutPng(),{status:404});
    expect(await remoteCutout(await busyPhoto(),{monthlyCredits:20},{store,now:NOW,env:{}})).toEqual({png:null,reason:"unconfigured"});
    expect(fetcher).not.toHaveBeenCalled();
    expect(await remoteCutout(await busyPhoto(),{monthlyCredits:20},{store,now:NOW,env:ENV})).toEqual({png:null,reason:"unavailable"});
    const count=fetcher.mock.calls.length;
    expect(await remoteCutout(await busyPhoto(2),{monthlyCredits:20},{store,now:NOW,env:ENV})).toEqual({png:null,reason:"unavailable"});
    expect(fetcher.mock.calls.length).toBe(count);
    // 경로는 환경변수로 덮어쓸 수 있다.
    resetRemoteCutoutState();
    higgsfield(await cutoutPng(),{path:"/custom/remove-bg"});
    expect(await remoteCutout(await busyPhoto(),{monthlyCredits:20},{store,now:NOW,env:{...ENV,HF_REMOVE_BG_PATH:"/custom/remove-bg"}})).toMatchObject({source:"remote"});
  });

  it("prepares only hard photos, only for cutout styles and only when turned on",async()=>{
    const {store}=memoryStore();
    const {fetcher}=higgsfield(await cutoutPng());
    const hard=await busyPhoto(),easy=await studioPhoto();
    expect(await prepareRemoteCutouts([hard],{enabled:false,style:"colorblock",monthlyCredits:20},{store,now:NOW,env:ENV})).toBe(0);
    expect(await prepareRemoteCutouts([hard],{enabled:true,style:"editorial",monthlyCredits:20},{store,now:NOW,env:ENV})).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await prepareRemoteCutouts([easy,hard],{enabled:true,style:"popup",monthlyCredits:20},{store,now:NOW,env:ENV})).toBe(1);
    expect(hasPreparedCutout(hard)).toBe(true);
    expect(hasPreparedCutout(easy)).toBe(false);
    expect(await readCutoutLedger(store,NOW)).toMatchObject({used:1});
  });

  it("renders the prepared cutout only inside a remote-cutout render, matching an enhanced copy of the photo",async()=>{
    const {store}=memoryStore();
    higgsfield(await cutoutPng());
    const hard=await busyPhoto();
    await prepareRemoteCutouts([hard],{enabled:true,style:"colorblock",monthlyCredits:20},{store,now:NOW,env:ENV});
    expect(await cutoutPhoto(hard,200)).toBeNull();
    const context={typography:typographyOf(),theme:"classic" as const,variant:0,palette:{} as never,remoteCutout:true};
    // 렌더가 받는 사진은 보정을 거쳐 바이트가 달라진다(밝기만 살짝 올린 사본으로 흉내).
    const brighter=await sharp(hard).modulate({brightness:1.06}).jpeg().toBuffer();
    const cut=await withRenderContext(context,()=>cutoutPhoto(brighter,200));
    expect(cut).not.toBeNull();
    const {data,info}=await sharp(cut!.data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    expect(data[3]).toBe(0);
    expect(data[((info.height>>1)*info.width+(info.width>>1))*4+3]).toBe(255);
    expect(await withRenderContext({...context,remoteCutout:false},()=>cutoutPhoto(brighter,200))).toBeNull();
  });
});

describe("remote cutout connection check",()=>{
  const base={env:ENV,fetch:vi.fn(async()=>new Response("{}",{status:404})) as unknown as typeof fetch,textClients:{}};
  const item=async(state:{enabled:boolean;monthlyCredits:number;used:number;month:string},env:Record<string,string>=ENV)=>
    (await runAiChecks({...base,env,remoteCutout:async()=>state})).find(entry=>entry.id==="remote-cutout");

  it("skips when off and shows keys and this month's usage when on, without calling Higgsfield for it",async()=>{
    expect(await item({enabled:false,monthlyCredits:20,used:0,month:"2026-10"})).toMatchObject({status:"skip"});
    expect(await item({enabled:true,monthlyCredits:20,used:3,month:"2026-10"})).toMatchObject({status:"ok",message:expect.stringContaining("2026-10 사용 3/20 크레딧")});
    expect(await item({enabled:true,monthlyCredits:20,used:20,month:"2026-10"})).toMatchObject({status:"fail",message:expect.stringContaining("예산을 다 써서")});
    expect(await item({enabled:true,monthlyCredits:20,used:0,month:"2026-10"},{})).toMatchObject({status:"fail",message:expect.stringContaining("키가 없어")});
  });
});

describe("local cutout quality",()=>{
  it("shaves the floor shadow outside the plate and leaves no grey halo on the rim",async()=>{
    // 살구색 바탕, 오른쪽 아래로 드리운 갈색 그림자, 흰 접시 위 붉은 음식.
    const svg=`<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs>
      <rect width="100%" height="100%" fill="#eab48e"/><ellipse cx="225" cy="228" rx="140" ry="140" fill="#8a5426" filter="url(#b)"/>
      <circle cx="200" cy="200" r="130" fill="#f6f6f4"/><circle cx="200" cy="200" r="70" fill="#b8323a"/></svg>`;
    const cut=await cutoutPhoto(await sharp(Buffer.from(svg)).png().toBuffer(),400);
    expect(cut).not.toBeNull();
    // 접시 지름(260)에 가깝게 잘려야 한다. 그림자까지 감싸면 300 가까이 된다.
    expect(cut!.width).toBeLessThan(275);
    expect(cut!.height).toBeLessThan(275);
    const {data,info}=await sharp(cut!.data).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // 반투명 가장자리 픽셀이 바탕색(살구)이나 회색으로 물들지 않았는지: 접시 가장자리는 흰색에 가깝다.
    let tinted=0,edge=0;
    for(let p=0;p<info.width*info.height;p++){
      const a=data[p*4+3];
      if(a>40&&a<220){edge++;if(Math.min(data[p*4],data[p*4+1],data[p*4+2])<200)tinted++;}
    }
    expect(edge).toBeGreaterThan(0);
    expect(tinted/edge).toBeLessThan(.1);
  });
});
