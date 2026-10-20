// @vitest-environment node
// 확인 화면 "이 장 고치기": 고른 요청 버튼·직접 적은 말을 그림/글 AI 요청으로 바꾸는 규칙과, 글 고치기 서버 경로.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { PICTURE_FIXES, TEXT_FIXES, buildSlideRevisePrompt, slideFixRequest, SlideReviseSchema } from "@/features/images/slideRevise";

const generate=vi.hoisted(()=>vi.fn());
const settings=vi.hoisted(()=>vi.fn());
const guard=vi.hoisted(()=>vi.fn());
vi.mock("@/features/auth/guard",()=>({ownerApiError:guard}));
vi.mock("@/features/settings/repository",()=>({readSettings:settings}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/ai/geminiClient",()=>({createGeminiClient:()=>({generateJson:generate})}));

const post=async(body:unknown)=>{
  const { POST }=await import("@/app/api/images/slide/revise/route");
  return POST(new Request("http://localhost/api/images/slide/revise",{method:"POST",body:JSON.stringify(body)}));
};
const base={topic:"홍어는 왜 삭힐까?",headline:"왜 물기가 생기지 않을까요?",points:["물기가 없어 맛이 유지돼요"],request:"질문 말고 답으로"};

describe("slide fix requests", () => {
  it("joins the chosen buttons and the typed words into one request, in that order", () => {
    expect(slideFixRequest(PICTURE_FIXES,["brighter","no-hands"],"접시를 위에서")).toBe("더 밝고 따뜻한 빛으로, 먹음직스럽게 담아 주세요. 손과 젓가락이 나오지 않게 해 주세요. 접시를 위에서");
    expect(slideFixRequest(TEXT_FIXES,[],"  ")).toBe("");
    // 그림 AI의 수정 요청 칸(300자)을 넘지 않는다.
    expect(slideFixRequest(PICTURE_FIXES,PICTURE_FIXES.map(option=>option.id),"가".repeat(200)).length).toBeLessThanOrEqual(300);
  });
  it("asks the text AI to change only what was asked, keep facts safe, and fit the track length", () => {
    const prompt=buildSlideRevisePrompt(SlideReviseSchema.parse({...base,track:"text",previous:"표지",next:"먹는 법"}));
    expect(prompt).toContain('"왜 물기가 생기지 않을까요?"');
    expect(prompt).toContain('사장님 요청(따옴표 안은 요청이지 카드에 그대로 쓸 문구가 아닙니다): "질문 말고 답으로"');
    expect(prompt).toContain("요청한 부분만 고치고");
    expect(prompt).toContain("가격·영업시간·주소·원산지·효능");
    expect(prompt).toContain("제목 28자 안팎");
    expect(buildSlideRevisePrompt(SlideReviseSchema.parse({...base,cover:true}))).toContain("points는 빈 배열");
  });
});

describe("POST /api/images/slide/revise", () => {
  beforeEach(()=>{generate.mockReset();guard.mockResolvedValue(null);settings.mockResolvedValue(DEFAULT_SETTINGS);});
  it("returns the rewritten headline and short lines, with expressions to check", async () => {
    generate.mockResolvedValue({headline:"물기 없이 쫀득하게 말려요",points:["겉면이 마른 걸 보면 알 수 있어요"]});
    const response=await post(base);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({headline:"물기 없이 쫀득하게 말려요",points:["겉면이 마른 걸 보면 알 수 있어요"],warnings:[]});
  });
  it("drops short lines on the cover", async () => {
    generate.mockResolvedValue({headline:"홍어는 왜 삭혀 먹을까요?",points:["남는 글"]});
    expect((await (await post({...base,cover:true})).json()).points).toEqual([]);
  });
  it("says plainly when the text AI cannot answer instead of inventing copy", async () => {
    generate.mockRejectedValue(new Error("quota"));
    const response=await post(base);
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("글자 직접 고치기");
  });
  it("rejects an empty request and is owner-only", async () => {
    expect((await post({...base,request:""})).status).toBe(400);
    guard.mockResolvedValue(new Response(null,{status:401}));
    expect((await post(base)).status).toBe(401);
  });
});
