// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/features/auth/guard",()=>({requireOwnerPage:async()=>{}}));
vi.mock("next/navigation",()=>({usePathname:()=>"/help",useRouter:()=>({refresh:()=>{}})}));

describe("help page", () => {
  it("explains the three steps and where the less-used features live, in plain words", async () => {
    const { default:HelpPage }=await import("@/app/help/page");
    const html=renderToStaticMarkup(await HelpPage());
    for(const text of ["1 무엇을 올릴까요","2 만들기","3 확인하고 올리기","사진 중심","글 중심","인스타그램에 바로 올리기","휴대폰에 저장하기","N번 장 고치기","글 다시 쓰기","복제해서 고치기","성과 기록","한 달 계획","관리자용 설정"])expect(html).toContain(text);
    expect(html).toContain("인스타그램을 연결하기 전에는 저절로 올라가지 않아요");
    // 어려운 말·기술 이름은 쓰지 않는다.
    expect(html).not.toMatch(/캐러셀|슬라이드|문안|구성안|해시태그|캡션|초안|계열|Gemini|Supabase|API|환경변수|크레딧/);
  });
});
