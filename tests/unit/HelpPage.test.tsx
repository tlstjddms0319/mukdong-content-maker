// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/features/auth/guard",()=>({requireOwnerPage:async()=>{}}));
vi.mock("next/navigation",()=>({usePathname:()=>"/help",useRouter:()=>({refresh:()=>{}})}));

describe("help page", () => {
  it("points the owner to the features that exist now", async () => {
    const { default:HelpPage }=await import("@/app/help/page");
    const html=renderToStaticMarkup(await HelpPage());
    for(const text of ["한 달 콘텐츠 기획","실제 사진 사용","글자 고치기","복제해서 고치기","성과 기록","AI 연결 실제 점검"])expect(html).toContain(text);
    // 예전 안내(자동 게시 없음 단정)는 연결 조건과 함께 설명한다.
    expect(html).toContain("Instagram 연결 전에는 자동 게시되지 않아요");
  });
});
