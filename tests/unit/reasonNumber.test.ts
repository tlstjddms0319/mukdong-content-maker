// @vitest-environment node
// 이유 장 번호: 표지·결론 장(내용 마지막 장)·홍보 카드는 번호가 없고, 그 사이 장은 "몇 번째 이유 / 모두 몇 개".
import { describe, expect, it } from "vitest";
import { reasonOf } from "@/features/images/styles/shared";
import { withRenderContext, type RenderContext } from "@/features/images/render/primitives";

describe("reasonOf",()=>{
  it("numbers only the slides between the cover and the conclusion",()=>{
    expect([1,2,3,4,5].map(i=>reasonOf(i,5))).toEqual([null,{n:1,of:3},{n:2,of:3},{n:3,of:3},null]);
    expect(reasonOf(2,3)).toEqual({n:1,of:1});
    expect(reasonOf(2,2)).toBeNull();
  });
  it("does not count the store promo card appended at the end",async()=>{
    const context={storeCard:true} as unknown as RenderContext;
    const got=await withRenderContext(context,async()=>[1,2,3,4,5,6].map(i=>reasonOf(i,6)));
    expect(got).toEqual([null,{n:1,of:3},{n:2,of:3},{n:3,of:3},null,null]);
  });
});
