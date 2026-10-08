// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { buildTimeline, framesAt, pickRecordingType } from "@/features/reels/timeline";

vi.mock("@/features/auth/guard",()=>({ownerApiError:async()=>null}));
vi.mock("server-only",()=>({}));

describe("reel timeline", () => {
  it("lays cards out with a longer cover and half-second crossfades", () => {
    const timeline=buildTimeline(5);
    expect(timeline.scenes.map(scene=>[scene.start,scene.duration])).toEqual([[0,3],[2.5,2.6],[4.6,2.6],[6.7,2.6],[8.8,2.6]].map(([a,b])=>[expect.closeTo(a,5),b]));
    expect(timeline.total).toBeCloseTo(11.4,5);
  });

  it("puts a capped AI intro first and blends it into the cover", () => {
    const timeline=buildTimeline(3,8);
    expect(timeline.scenes[0]).toMatchObject({kind:"intro",duration:5});
    expect(timeline.scenes[1].start).toBeCloseTo(4.5,5);
    const blend=framesAt(timeline,4.75);
    expect(blend.map(frame=>frame.scene.kind)).toEqual(["intro","card"]);
    expect(blend[0].alpha+blend[1].alpha).toBeCloseTo(1,5);
  });

  it("can end on a two-second logo screen that the last card fades into", () => {
    const timeline=buildTimeline(5,undefined,true);
    const [lastCard,outro]=timeline.scenes.slice(-2);
    expect(lastCard).toMatchObject({kind:"card",index:4});
    expect(outro).toMatchObject({kind:"outro",duration:2});
    expect(outro.start).toBeCloseTo(lastCard.start+lastCard.duration-.5,5);
    expect(timeline.total).toBeCloseTo(12.9,5);
    const blend=framesAt(timeline,outro.start+.25);
    expect(blend.map(frame=>frame.scene.kind)).toEqual(["card","outro"]);
    expect(blend[0].alpha+blend[1].alpha).toBeCloseTo(1,5);
    // 끝 화면을 끄면 예전과 같다.
    expect(buildTimeline(5).total).toBeCloseTo(11.4,5);
    expect(buildTimeline(0,undefined,true).scenes).toEqual([]);
  });

  it("zooms slowly inside a scene and shows the first frame fully", () => {
    const timeline=buildTimeline(2);
    expect(framesAt(timeline,0)).toEqual([expect.objectContaining({alpha:1,zoom:1})]);
    const late=framesAt(timeline,2.4)[0];
    expect(late.zoom).toBeGreaterThan(1.04);
    expect(late.zoom).toBeLessThanOrEqual(1.06);
  });

  it("prefers H.264 MP4 for Instagram and flags anything else", () => {
    // 구글 크롬·사파리처럼 H.264를 녹화할 수 있으면 1080p가 되는 레벨 4.0부터 고른다.
    expect(pickRecordingType(type=>type.startsWith("video/mp4"))).toEqual({type:"video/mp4;codecs=avc1.640028",mp4:true,instagramReady:true});
    expect(pickRecordingType(type=>type==="video/mp4;codecs=avc1")).toMatchObject({instagramReady:true});
    // 오픈소스 크로미움: 코덱 없는 video/mp4만 되면 VP9이라 인스타 업로드가 보장되지 않는다.
    expect(pickRecordingType(type=>type==="video/mp4"||type==="video/webm")).toEqual({type:"video/mp4",mp4:true,instagramReady:false});
    expect(pickRecordingType(type=>type==="video/webm")).toEqual({type:"video/webm",mp4:false,instagramReady:false});
    expect(pickRecordingType(()=>false)).toBeNull();
  });
});

describe("AI intro video route", () => {
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.HF_API_KEY_ID;delete process.env.HF_API_KEY_SECRET;});

  it("uploads the cover, asks DoP for a video and returns it as a data URL", async () => {
    process.env.HF_API_KEY_ID="id";process.env.HF_API_KEY_SECRET="secret";
    const calls:Array<{url:string;body?:string}>=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      calls.push({url,body:typeof init?.body==="string"?init.body:undefined});
      if(url.endsWith("/files/generate-upload-url"))return Response.json({upload_url:"https://upload.example/put",public_url:"https://cdn.example/cover.jpg"});
      if(url==="https://upload.example/put")return new Response(null,{status:200});
      if(url.endsWith("/v1/image2video/dop"))return Response.json({status:"completed",request_id:"r1",video:{url:"https://cdn.example/intro.mp4"}});
      if(url==="https://cdn.example/intro.mp4")return new Response(new Uint8Array([0,0,0,24,102,116,121,112]),{status:200});
      return new Response("unexpected",{status:500});
    }));
    const { POST } = await import("@/app/api/reels/intro/route");
    const image=`data:image/jpeg;base64,${(await sharp({create:{width:100,height:125,channels:3,background:"#c08070"}}).jpeg().toBuffer()).toString("base64")}`;
    const response=await POST(new Request("http://localhost/api/reels/intro",{method:"POST",body:JSON.stringify({image})}));
    const body=await response.json();
    expect(response.status).toBe(200);
    expect(body.video.startsWith("data:video/mp4;base64,")).toBe(true);
    const job=JSON.parse(calls.find(call=>call.url.endsWith("/v1/image2video/dop"))!.body!);
    expect(job).toMatchObject({model:"dop-turbo",input_images:[{type:"image_url",image_url:"https://cdn.example/cover.jpg"}]});
  });

  it("explains a missing key or exhausted credits", async () => {
    const { POST } = await import("@/app/api/reels/intro/route");
    const image=`data:image/jpeg;base64,${(await sharp({create:{width:100,height:125,channels:3,background:"#c08070"}}).jpeg().toBuffer()).toString("base64")}`;
    expect((await (await POST(new Request("http://localhost/api/reels/intro",{method:"POST",body:JSON.stringify({image})}))).json()).message).toContain("Higgsfield 키");
    process.env.HF_API_KEY_ID="id";process.env.HF_API_KEY_SECRET="secret";
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("no credits",{status:402})));
    const response=await POST(new Request("http://localhost/api/reels/intro",{method:"POST",body:JSON.stringify({image})}));
    expect((await response.json()).message).toContain("크레딧");
  });
});
