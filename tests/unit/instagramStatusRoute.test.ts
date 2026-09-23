// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readConnection=vi.hoisted(()=>vi.fn());
vi.mock("@/features/auth/guard",()=>({ownerApiError:async()=>null}));
vi.mock("@/features/instagram/repository",async(importOriginal)=>({
  ...await importOriginal<typeof import("@/features/instagram/repository")>(),
  createInstagramRepository:()=>({readConnection}),
}));

import { GET } from "@/app/api/instagram/status/route";

describe("Instagram status route",()=>{
  beforeEach(()=>{
    readConnection.mockReset();
    for(const name of ["INSTAGRAM_APP_ID","INSTAGRAM_APP_SECRET","INSTAGRAM_REDIRECT_URI","MEDIA_PUBLIC_BASE_URL","MEDIA_SIGNING_SECRET"])vi.stubEnv(name,"");
  });
  afterEach(()=>vi.unstubAllEnvs());

  it("계정이 연결되어도 게시 서버 설정의 누락 항목을 따로 반환하고 비밀값은 노출하지 않는다",async()=>{
    readConnection.mockResolvedValue({instagramUserId:"user-1",username:"mukdong",accessToken:"private-access-token",expiresAt:"2099-01-01T00:00:00.000Z"});
    vi.stubEnv("INSTAGRAM_APP_ID","app-1");
    vi.stubEnv("INSTAGRAM_APP_SECRET","private-app-secret");
    vi.stubEnv("INSTAGRAM_REDIRECT_URI","http://localhost:3000/api/instagram/callback");
    vi.stubEnv("MEDIA_PUBLIC_BASE_URL","http://localhost:3000");

    const response=await GET();
    const body=await response.json();

    expect(body.connected).toBe(true);
    expect(body.setup).toEqual({
      appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:false,signingKey:false,
    });
    expect(JSON.stringify(body)).not.toContain("private-access-token");
    expect(JSON.stringify(body)).not.toContain("private-app-secret");
  });

  it("서버 설정이 모두 있어도 계정 연결 여부는 독립적으로 표시한다",async()=>{
    readConnection.mockResolvedValue(null);
    vi.stubEnv("INSTAGRAM_APP_ID","app-1");
    vi.stubEnv("INSTAGRAM_APP_SECRET","private-app-secret");
    vi.stubEnv("INSTAGRAM_REDIRECT_URI","http://localhost:3000/api/instagram/callback");
    vi.stubEnv("MEDIA_PUBLIC_BASE_URL","https://example.ngrok.app");
    vi.stubEnv("MEDIA_SIGNING_SECRET","private-signing-secret");

    const body=await (await GET()).json();

    expect(body.connected).toBe(false);
    expect(body.setup).toEqual({appId:true,appSecret:true,redirectUri:true,mediaHttpsUrl:true,signingKey:true});
    expect(JSON.stringify(body)).not.toContain("private-signing-secret");
  });

  it("잘못된 이미지 주소는 HTTPS 설정 완료로 표시하지 않는다",async()=>{
    readConnection.mockResolvedValue(null);
    vi.stubEnv("MEDIA_PUBLIC_BASE_URL","not-a-url");
    expect((await (await GET()).json()).setup.mediaHttpsUrl).toBe(false);
  });
});
