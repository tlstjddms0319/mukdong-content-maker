// @vitest-environment node
// 가벼운 헬스 체크: Render가 몇 초마다 부르므로 페이지를 그리지 않고 바로 200.
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route",()=>{
  it("answers 200 ok without rendering a page",async()=>{
    const response=await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ok:true});
  });
});
