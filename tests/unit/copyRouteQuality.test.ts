// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/copy/route";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { copySection, formatCopy, normalizeHashtags } from "@/features/copy/writing";
import { TextAiHttpError } from "@/lib/ai/errors";

const {generate,settings}=vi.hoisted(()=>({generate:vi.fn(),settings:vi.fn()}));
vi.mock("@/features/auth/guard",()=>({ownerApiError:async()=>null}));
vi.mock("@/features/settings/repository",()=>({readSettings:settings}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/ai/geminiClient",()=>({createGeminiClient:()=>({generateJson:generate})}));
const request=(extra={})=>new Request("http://localhost/api/copy",{method:"POST",body:JSON.stringify({topic:"홍어의 식감",audience:"B",...extra})});
const result={hook:"해산물 좋아하는 친구와, 홍어 한 점은 어때요?",information:"생선회를 고를 때 부드러운 살을 먼저 떠올린다면, 홍어는 조금 다른 식감을 알아보는 메뉴가 될 수 있어요. 씹을 때 느껴지는 결뿐 아니라 삭힌 홍어 특유의 향도 함께 살펴보세요. 같은 음식을 먹어도 향을 느끼는 정도와 좋아하는 식감은 사람마다 다를 수 있답니다.\n\n처음부터 큰 한 점을 먹기보다는 작은 양으로 시작해 자기 취향을 알아보는 건 어떨까요. 삼합은 홍어와 수육, 묵은지를 함께 맛보는 조합이에요. 각각 따로 맛본 뒤 한입에 곁들여 보면 재료가 만나면서 달라지는 맛을 비교하기 좋아요. 다만 다른 재료와 함께 먹는다고 홍어의 향이 사라지는 것은 아니에요.\n\n모임 메뉴를 정할 때는 모두가 같은 향을 좋아할 거라고 생각하지 않는 것도 좋아요. 함께 갈 사람에게 홍어를 먹어 봤는지 먼저 물어보고, 궁금한 점은 방문 전에 매장에 확인해 보세요. 새로운 메뉴를 고르는 과정도 친구들과 나눌 이야기가 될 수 있어요.",store_connection:"중랑구 묵동에서 홍어를 알아보고 있다면 묵동홍어마을도 살펴보세요. 음식 이야기를 나눌 다음 식사 장소를 고를 때 참고하기 좋아요.",call_to_action:"방문을 계획하고 있다면 프로필의 네이버 플레이스에서 메뉴를 먼저 확인해 보세요.",hashtags:["묵동맛집","#묵동맛집","#홍어","#중랑구맛집"],facts_used:[],facts_to_verify:[],image_disclosure:null};

describe("copy quality",()=>{
  beforeEach(()=>{generate.mockReset();settings.mockResolvedValue(DEFAULT_SETTINGS);});
  it("passes the chosen question outline to the writer as data",async()=>{
    generate.mockResolvedValue(result);
    const contentBrief="김치를 곁들이는 익숙한 음식에서 출발해 홍어삼합의 조합으로 연결한다.";
    const response=await POST(request({contentBrief}));
    expect(response.status).toBe(200);
    expect(generate.mock.calls[0][0]).toContain(JSON.stringify(contentBrief));
  });
  it("uses saved length and normalizes unique relevant tags",async()=>{
    generate.mockResolvedValue(result);
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(generate.mock.calls[0][0]).toContain("500~800자");
    // 주제 태그(최대 3개) + 지역 태그 + 가게 태그. AI가 넣은 지역 태그(#중랑구맛집 등)는 정해진 지역 태그로 바뀐다.
    expect((await response.json()).hashtags).toEqual(["#홍어","#묵동맛집","#묵동홍어마을"]);
  });
  it("keeps the first draft when the repair call runs out of quota",async()=>{
    // 첫 초안은 길이만 조금 모자람(다듬으면 되는 문제) → 보완 요청이 429로 실패해도 첫 초안을 돌려준다.
    generate.mockResolvedValueOnce({...result,information:"너무 짧음"}).mockRejectedValue(new TextAiHttpError("Gemini",429));
    const response=await POST(request());
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.information).toBe("너무 짧음");
    expect(body._meta.repairFailed).toBe(true);
    expect(body.quality_warnings.length).toBeGreaterThan(0);
  });
  it("asks for a one-sentence hook of 60 characters when only the hook is rewritten",async()=>{
    generate.mockResolvedValue({replacement:"과메기는 왜 찬바람이 불면 생각날까요? 바다 향이 짙어지는 계절이라 그런지도 몰라요. 김에 싸서 한 점 드셔 보세요."});
    const response=await POST(request({focus:"hook",currentText:"기존 문안"}));
    expect(response.status).toBe(200);
    expect(generate.mock.calls[0][0]).toContain("60자 이내");
    expect((await response.json()).replacement).toBe("과메기는 왜 찬바람이 불면 생각날까요?");
  });
  it("keeps a too-short draft with a note to fix instead of throwing it away, and reports provider failures",async()=>{
    // 예전에는 길이가 모자라면 문안 전체를 버리고 "AI 문안을 완성하지 못했어요"를 띄웠다. 이제 쓰고 다듬을 곳만 알려 준다.
    generate.mockResolvedValue({...result,information:"너무 짧음"});
    const kept=await POST(request());
    expect(kept.status).toBe(200);
    const body=await kept.json();
    expect(body.information).toBe("너무 짧음");
    expect(body.quality_warnings.some((issue:string)=>issue.includes("본문을 공백 포함"))).toBe(true);
    generate.mockRejectedValue(new Error("quota"));
    const response=await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("hook");
  });
  it("normalizes up to five tags and changes only the requested text range",()=>{
    expect(normalizeHashtags(["#a","a","#b","#c","#d","#e","#f","bad tag"])).toEqual(["#a","#b","#c","#d","#e"]);
    const text="첫 문장\n\n직접 쓴 설명\n\n직접 쓴 가게 소개\n\n마무리\n\n#기존태그";
    const range=copySection(text,"hashtags")!;
    expect(text.slice(0,range.start)+"#새태그"+text.slice(range.end)).toBe(text.replace("#기존태그","#새태그"));
    expect(copySection("문단 구분 없이 직접 쓴 글","store_connection")).toBeNull();
  });
  it("returns only the requested replacement for a partial rewrite",async()=>{
    generate.mockResolvedValue({hashtags:["#홍어","#묵동맛집","#중랑구맛집"]});
    const response=await POST(request({focus:"hashtags",currentText:"내가 쓴 글"}));
    expect(await response.json()).toMatchObject({replacement:"#홍어 #묵동맛집 #묵동홍어마을",_meta:{provider:"gemini"}});
  });
  it("repairs repetitive copy once, using the image brief and audience context",async()=>{
    generate.mockResolvedValueOnce({...result,information:"똑같은 문장을 반복해서 분량을 채웁니다. ".repeat(24)}).mockResolvedValueOnce(result);
    const response=await POST(request({imageBrief:"흰 접시 위 홍어의 결을 가까이",hasAiImages:true}));
    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toContain("흰 접시 위 홍어의 결을 가까이");
    expect(generate.mock.calls[1][0]).toContain("반복");
    const body=await response.json();
    expect(body._meta).toMatchObject({ provider:"gemini" });
    expect(body.image_disclosure).toMatch(/AI/);
    expect(formatCopy(body)).toContain(body.image_disclosure);
  });
  it("asks once to repair oversized or repetitive copy, then uses it with notes; explains a quota failure without retrying",async()=>{
    generate.mockResolvedValue({...result,information:result.information.repeat(3)});
    const kept=await POST(request());
    expect(kept.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    expect((await kept.json()).quality_warnings.length).toBeGreaterThan(0);
    generate.mockReset().mockRejectedValue(new TextAiHttpError("Gemini",429,"quota"));
    const failed=await POST(request());
    expect(failed.status).toBe(502);
    expect(generate).toHaveBeenCalledTimes(1);
    const body=await failed.json();
    expect(body.reason).toBe("quota");
    expect(body.message).toContain("사용량을 다 썼어요");
  });

  it("still refuses copy that keeps an unverified absolute claim after the repair",async()=>{
    generate.mockResolvedValue({...result,store_connection:"묵동홍어마을에서 정갈한 삼합 한 상을 준비하고 있어요."});
    const response=await POST(request());
    expect(response.status).toBe(502);
    expect((await response.json()).reason).toBe("quality");
  });
  it("rejects unverified absolute claims even in partial rewrites",async()=>{
    generate.mockResolvedValue({replacement:"냄새 없음! 누구나 먹음!"});
    expect((await POST(request({focus:"hook",currentText:"사용자 원문"}))).status).toBe(502);
  });
  it("keeps disclosure outside replaceable store and CTA paragraphs",()=>{
    const text=formatCopy({...result,topic:"홍어",audience:"B",image_disclosure:"AI 연출 이미지가 포함되어 있으며 실제 메뉴와 다를 수 있습니다."});
    expect(text).toContain("AI 연출 이미지");
    for(const [part,expected] of [["store_connection",result.store_connection],["call_to_action",result.call_to_action]] as const){
      const range=copySection(text,part)!;
      expect(text.slice(range.start,range.end)).toBe(expected);
    }
  });
  it("repairs an unverified store-serving claim even when the body meets its length target",async()=>{
    generate.mockResolvedValueOnce({...result,store_connection:"묵동홍어마을에서는 정갈한 삼합 한 상을 준비하고 있습니다."}).mockResolvedValueOnce(result);
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("매장 제공");
  });
  it("rejects serving claims in partial edits but allows checking availability",async()=>{
    generate.mockResolvedValueOnce({replacement:"정갈한 삼합을 제공하고 있습니다."});
    expect((await POST(request({focus:"store_connection",currentText:"내가 쓴 문안"}))).status).toBe(502);
    generate.mockResolvedValueOnce({replacement:"묵동홍어마을의 메뉴와 제공 여부를 확인해 보세요."});
    const response=await POST(request({focus:"store_connection",currentText:"내가 쓴 문안"}));
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.replacement).toContain("확인해 보세요");
    expect(body._meta).toMatchObject({ provider:"gemini" });
  });
  it("recovers from one malformed reply through the resolver",async()=>{
    generate.mockRejectedValueOnce(new SyntaxError("bad json")).mockResolvedValueOnce(result);
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    const body=await response.json();
    expect(body._meta).toMatchObject({ provider:"gemini" });
  });

  it("still writes with the default length when settings cannot be read",async()=>{
    settings.mockRejectedValueOnce(new Error("broken settings"));
    generate.mockResolvedValue(result);
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect(generate.mock.calls[0][0]).toContain("500~800자");
    expect((await response.json())._meta).toMatchObject({provider:"gemini"});
  });

  it("hands the carousel headline order to the writer so the caption follows the same story", async () => {
    generate.mockResolvedValue(result);
    const response=await POST(request({slideOutline:["홍어는 왜 톡 쏠까요?","가까이 보면 결이 이렇게 살아 있어요","가기 전에 이것만 확인하면 돼요"]}));
    expect(response.status).toBe(200);
    const prompt=String(generate.mock.calls[0][0]);
    expect(prompt).toContain("캐러셀 슬라이드 제목 순서");
    expect(prompt).toContain("홍어는 왜 톡 쏠까요?");
    expect(prompt).toContain("같은 이야기 흐름");
  });

  it("tells the writer what is in the owner's photos so the caption matches them", async () => {
    generate.mockResolvedValue(result);
    const response=await POST(request({photoNotes:["홍어회 · 접시에 펼친 홍어회","젓가락으로 집어 든 홍어회 한 점, 뒤에 막걸리 사발"]}));
    expect(response.status).toBe(200);
    const prompt=String(generate.mock.calls[0][0]);
    expect(prompt).toContain("[실제 사진]");
    expect(prompt).toContain("젓가락으로 집어 든 홍어회 한 점, 뒤에 막걸리 사발");
    expect(prompt).toContain("사진에 없는 메뉴를 주인공처럼 쓰지 마세요");
    // 사진 내용을 모르면 넣지 않는다.
    generate.mockClear();
    await POST(request());
    expect(String(generate.mock.calls[0][0])).not.toContain("[실제 사진]");
  });

});
