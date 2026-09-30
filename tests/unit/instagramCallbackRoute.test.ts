// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieState=vi.hoisted(()=>({value:"same-state"}));
const saveConnection=vi.hoisted(()=>vi.fn(async(value:unknown)=>value));
const fetchMock=vi.hoisted(()=>vi.fn());
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:cookieState.value})})}));
vi.mock("@/features/instagram/repository",()=>({createInstagramRepository:()=>({saveConnection})}));

import { GET } from "@/app/api/instagram/callback/route";

const PUBLIC="https://mukdong-content-maker-0319.onrender.com";
// Render 프록시 뒤에서 실제로 들어오는 내부 주소 모양
const internalCallback=(query:string)=>new Request(`https://localhost:10000/api/instagram/callback?${query}`);

describe("Instagram callback route",()=>{
  beforeEach(()=>{
    cookieState.value="same-state";
    saveConnection.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch",fetchMock);
    vi.spyOn(console,"error").mockImplementation(()=>{});
    vi.stubEnv("INSTAGRAM_APP_ID","ig-app");
    vi.stubEnv("INSTAGRAM_APP_SECRET","private-app-secret");
    vi.stubEnv("INSTAGRAM_REDIRECT_URI",`${PUBLIC}/api/instagram/callback`);
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

  it("내부 주소로 들어와도 공개 주소의 설정 화면으로 돌려보낸다",async()=>{
    fetchMock
      .mockResolvedValueOnce(Response.json({access_token:"short"}))
      .mockResolvedValueOnce(Response.json({access_token:"long",expires_in:3600}))
      .mockResolvedValueOnce(Response.json({id:"ig-1",username:"mukdong"}));
    const response=await GET(internalCallback("code=abc&state=same-state"));
    expect(response.headers.get("location")).toBe(`${PUBLIC}/settings?instagram=connected`);
    expect(saveConnection).toHaveBeenCalledOnce();
  });

  it("토큰 교환이 거절되면 사유를 붙이고 Meta 원문은 로그에만 남긴다",async()=>{
    fetchMock.mockResolvedValueOnce(Response.json({error_type:"OAuthException",code:400,error_message:"Invalid client_secret"},{status:400}));
    const response=await GET(internalCallback("code=abc&state=same-state"));
    expect(response.headers.get("location")).toBe(`${PUBLIC}/settings?instagram=error&reason=token`);
    const logged=JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("Invalid client_secret");
    expect(logged).not.toContain("private-app-secret");
  });

  it("state가 다르면 토큰 교환 없이 state 사유로 돌려보낸다",async()=>{
    cookieState.value="other-state";
    const response=await GET(internalCallback("code=abc&state=same-state"));
    expect(response.headers.get("location")).toBe(`${PUBLIC}/settings?instagram=error&reason=state`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("사용자가 취소하면 cancelled 사유로 돌려보낸다",async()=>{
    const response=await GET(internalCallback("error=access_denied&error_reason=user_denied"));
    expect(response.headers.get("location")).toBe(`${PUBLIC}/settings?instagram=error&reason=cancelled`);
  });
});
