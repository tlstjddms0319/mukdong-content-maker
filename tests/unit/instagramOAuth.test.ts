import { describe,expect,it,vi } from "vitest";
import { buildAuthorizationUrl,completeInstagramOAuth,InstagramOAuthError,publicAppOrigin } from "@/features/instagram/oauth";

const config={appId:"app-123",appSecret:"secret-456",redirectUri:"https://example.com/api/instagram/callback"};

describe("Instagram OAuth",()=>{
  it("요청에 필요한 권한과 state만 포함한다",()=>{
    const url=new URL(buildAuthorizationUrl(config,"safe-state"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(config.appId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("safe-state");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
  });

  it("state가 다르면 토큰 교환 전에 중단한다",async()=>{
    const exchangeCode=vi.fn();
    await expect(completeInstagramOAuth(
      {code:"code",state:"wrong",cookieState:"expected"},
      {config,exchangeCode,getProfile:vi.fn(),saveConnection:vi.fn()},
    )).rejects.toBeInstanceOf(InstagramOAuthError);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("공개 주소는 콜백 주소, AUTH_URL, 요청 주소 순서로 정한다",()=>{
    expect(publicAppOrigin({INSTAGRAM_REDIRECT_URI:" https://app.example.com/api/instagram/callback "},"https://localhost:10000")).toBe("https://app.example.com");
    expect(publicAppOrigin({INSTAGRAM_REDIRECT_URI:"not-a-url",AUTH_URL:"https://auth.example.com"},"https://localhost:10000")).toBe("https://auth.example.com");
    expect(publicAppOrigin({},"https://localhost:10000")).toBe("https://localhost:10000");
  });

  it("토큰과 프로필을 서버 저장소에 저장한다",async()=>{
    const saveConnection=vi.fn(async value=>value);
    const result=await completeInstagramOAuth(
      {code:"code",state:"same",cookieState:"same"},
      {
        config,
        exchangeCode:vi.fn(async()=>({accessToken:"private-token",expiresIn:3600})),
        getProfile:vi.fn(async()=>({id:"ig-1",username:"mukdong"})),
        saveConnection,
        now:()=>new Date("2026-09-11T00:00:00.000Z"),
      },
    );
    expect(result.username).toBe("mukdong");
    expect(saveConnection).toHaveBeenCalledWith({
      instagramUserId:"ig-1",
      username:"mukdong",
      accessToken:"private-token",
      expiresAt:"2026-09-11T01:00:00.000Z",
      scopes:["instagram_business_basic","instagram_business_content_publish"],
      connectedAt:"2026-09-11T00:00:00.000Z",
      updatedAt:"2026-09-11T00:00:00.000Z",
    });
  });
});
