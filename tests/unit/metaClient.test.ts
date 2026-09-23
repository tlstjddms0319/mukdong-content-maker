// @vitest-environment node
import { afterEach,describe,expect,it,vi } from "vitest";
import { instagramPublishingClient } from "@/features/instagram/metaClient";

describe("Instagram Meta publishing adapter",()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it("캐러셀 자식에는 순서 없이 caption 없이 is_carousel_item만 보낸다",async()=>{
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"child-1"})});
    vi.stubGlobal("fetch",fetchMock);
    await instagramPublishingClient.createImageContainer({instagramUserId:"ig-1",accessToken:"token",imageUrl:"https://app.example.com/one.jpg",isCarouselItem:true});
    const body=fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("image_url")).toBe("https://app.example.com/one.jpg");
    expect(body.get("is_carousel_item")).toBe("true");
    expect(body.has("caption")).toBe(false);
  });

  it("캐러셀 부모에는 순서대로 children, caption, media_type을 보낸다",async()=>{
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"parent-1"})});
    vi.stubGlobal("fetch",fetchMock);
    await instagramPublishingClient.createCarouselContainer({instagramUserId:"ig-1",accessToken:"token",children:["child-1","child-2","child-3"],caption:"묵동 홍어"});
    const body=fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("media_type")).toBe("CAROUSEL");
    expect(body.get("children")).toBe("child-1,child-2,child-3");
    expect(body.get("caption")).toBe("묵동 홍어");
    expect(body.get("access_token")).toBe("token");
  });
});
