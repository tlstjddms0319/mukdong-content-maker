// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST as upload } from "@/app/api/images/assets/route";
import { POST as compose } from "@/app/api/images/compose/route";
const mocks=vi.hoisted(()=>({guard:vi.fn(),list:vi.fn(),read:vi.fn(),add:vi.fn(),markUsed:vi.fn(),render:vi.fn()}));
vi.mock("@/features/auth/guard",()=>({ownerApiError:mocks.guard}));
vi.mock("@/features/images/assetLibrary",()=>({createAssetLibrary:()=>mocks}));
vi.mock("@/features/images/renderFreeCard",()=>({renderFreeCard:mocks.render}));
beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockResolvedValue(null);mocks.markUsed.mockResolvedValue(undefined);});
const request=(body:unknown)=>new Request("http://localhost/api/images/compose",{method:"POST",body:JSON.stringify(body)});
it("blocks asset reads, uploads and renders before authentication",async()=>{
  mocks.guard.mockResolvedValue(new Response(null,{status:401}));
  expect((await GET()).status).toBe(401);
  expect((await upload(request({}))).status).toBe(401);
  expect((await compose(request({}))).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();expect(mocks.render).not.toHaveBeenCalled();expect(mocks.add).not.toHaveBeenCalled();
});
it("rejects arbitrary asset paths and oversized copy; missing assets do not silently change the result",async()=>{
  expect((await compose(request({title:"질문?",layout:"photo",assetIds:["../../secret"]}))).status).toBe(400);
  const id="11111111-1111-4111-8111-111111111111";
  expect((await compose(request({title:"질문?",layout:"photo",body:"가".repeat(91),assetIds:[id]}))).status).toBe(400);
  mocks.read.mockResolvedValue(null);
  expect((await compose(request({title:"질문?",layout:"photo",assetIds:[id]}))).status).toBe(404);
  expect(mocks.render).not.toHaveBeenCalled();
});
it("uses the local renderer and marks the photos used without any AI request",async()=>{
  mocks.render.mockResolvedValue({id:"local-card",source:"design",assetIds:[],preview:"local-jpeg"});
  const response=await compose(request({title:"수육에는 왜 김치를 곁들일까?",layout:"text",assetIds:[]}));
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({card:{source:"design"}});expect(mocks.markUsed).toHaveBeenCalledWith([]);
});
