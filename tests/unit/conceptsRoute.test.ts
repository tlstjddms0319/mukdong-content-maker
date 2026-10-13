// @vitest-environment node
// 그림 콘셉트 서버 길(/api/images/concepts): 설정에서 제안을 끄면 AI를 부르지 않고 실사만 돌려준다(사장님 2026-10-13: 애니·일러스트 품질이 아쉬우면 끌 수 있게).
import { describe, expect, it, vi } from "vitest";
import { createFallbackCarouselPlan } from "@/features/images/carousel";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { AppSettingsSchema } from "@/features/settings/schema";
import { IMAGE_STYLE_DIRECTIONS } from "@/features/images/style";

vi.mock("server-only",()=>({}));
vi.mock("@/features/auth/guard",()=>({ownerApiError:async()=>null}));
const readSettings=vi.hoisted(()=>vi.fn());
vi.mock("@/features/settings/repository",()=>({readSettings}));
const generateJson=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/ai/textClient",()=>({createTextClient:()=>({provider:"gemini",configured:["gemini"],generateJson})}));

const request=(body:unknown)=>new Request("http://localhost/api/images/concepts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const plan=createFallbackCarouselPlan({topic:"홍어와 가오리는 왜 다르게 먹을까?",slideCount:5,track:"photo"});

describe("concept proposals setting",()=>{
  it("defaults to on, and old settings without the field read as on",()=>{
    expect(DEFAULT_SETTINGS.conceptProposals).toBe(true);
    const {conceptProposals:_ignored,...old}=DEFAULT_SETTINGS;
    expect(AppSettingsSchema.parse(old).conceptProposals).toBe(true);
  });

  it("returns only the photo concept without calling the AI when turned off",async()=>{
    readSettings.mockResolvedValue({...DEFAULT_SETTINGS,conceptProposals:false});
    generateJson.mockReset();
    const {POST}=await import("@/app/api/images/concepts/route");
    const body=await (await POST(request({topic:plan.slides[0].headline,track:"photo",plan}))).json();
    expect(body.options).toHaveLength(1);
    expect(body.options[0].kind).toBe("photo");
    expect(body.provider).toBe("off");
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("asks the AI when turned on",async()=>{
    readSettings.mockResolvedValue({...DEFAULT_SETTINGS,conceptProposals:true});
    generateJson.mockReset().mockResolvedValue({recommended:0,concepts:[{kind:"character",title:"홍어 vs 가오리 권투",summary:"링 위 대결",reason:"비교 주제",styleNote:"홍어: 마름모 몸 / 가오리: 둥근 몸",slides:plan.slides.map((_,i)=>({slide:i+1,drawn:i===0,visualPrompt:i===0?"홍어 캐릭터와 가오리 캐릭터가 링 위에서 마주 선 장면":""}))}]});
    const {POST}=await import("@/app/api/images/concepts/route");
    const body=await (await POST(request({topic:plan.slides[0].headline,track:"photo",plan}))).json();
    expect(body.options.map((option:{kind:string})=>option.kind)).toEqual(["photo","character"]);
    expect(body.recommended).toBe(1);
  });
});

describe("drawn styles are directed as carefully as photos",()=>{
  it("tells the image model about line, shading, palette, composition and what to avoid",()=>{
    for(const id of ["anime","illustration","character"] as const){
      const look=IMAGE_STYLE_DIRECTIONS[id].look;
      expect(look).toMatch(/palette/);
      expect(look).toMatch(/composition/);
      expect(look).toMatch(/not a photograph/i);
      expect(look).toMatch(/no text|no written words/i);
      expect(look.length).toBeGreaterThan(300);
    }
    expect(IMAGE_STYLE_DIRECTIONS.character.look).toContain("right number of limbs and fingers");
  });
});
