// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only",()=>({}));
const { checkCoverCandidates, coverRank, coverWarnings } = await import("@/features/images/coverCheck");

const image=()=>sharp({create:{width:900,height:1100,channels:3,background:"#d9b8a8"}}).jpeg().toBuffer();
const reply=(value:object)=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200});

describe("AI cover check", () => {
  it("sends a small JPEG with the checklist and turns problems into warnings", async () => {
    const request=vi.fn(async()=>reply({foodVisible:true,looksLikeSkate:true,textInImage:true,oddHands:false,score:8,note:"왼쪽 위에 글자가 있어요"}));
    const [check]=(await checkCoverCandidates([await image()],{apiKey:"key",fetch:request as unknown as typeof fetch}))!;
    expect(check.warnings).toEqual(["이미지 속 글자"]);
    const body=JSON.parse(String((request.mock.calls[0] as unknown as [string,RequestInit])[1].body));
    expect(body.contents[0].parts[0].text).toContain("홍어");
    const sent=await sharp(Buffer.from(body.contents[0].parts[1].inline_data.data,"base64")).metadata();
    expect(Math.max(sent.width??0,sent.height??0)).toBeLessThanOrEqual(512);
  });

  it("ranks a clean candidate above a higher-scored one with text in the image", () => {
    const clean={foodVisible:true,looksLikeSkate:true,textInImage:false,oddHands:false,score:7,note:""};
    const texty={...clean,textInImage:true,score:9};
    expect(coverRank({...clean,warnings:coverWarnings(clean)})).toBeGreaterThan(coverRank({...texty,warnings:coverWarnings(texty)}));
    expect(coverWarnings({...clean,foodVisible:true,looksLikeSkate:false})).toEqual(["홍어로 안 보임"]);
  });

  it("skips the check without a key or when Gemini fails", async () => {
    expect(await checkCoverCandidates([await image()],{apiKey:""})).toBeNull();
    const failing=vi.fn(async()=>new Response("quota",{status:429}));
    vi.spyOn(console,"warn").mockImplementation(()=>{});
    expect(await checkCoverCandidates([await image()],{apiKey:"key",fetch:failing as unknown as typeof fetch})).toBeNull();
  });
});
