import { render,screen } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
const path=vi.hoisted(()=>({value:"/performance"}));
vi.mock("next/navigation",()=>({usePathname:()=>path.value,useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/features/auth/actions",()=>({logout:vi.fn()}));
import { PageLoading } from "@/components/states/PageLoading";

describe("로딩 화면",()=>{
  it("메뉴는 그대로 두고, 여는 화면의 메뉴를 표시하고, 불러오는 중을 알린다",()=>{
    render(<PageLoading/>);
    expect(screen.getByRole("status")).toHaveTextContent("화면을 불러오는 중");
    expect(screen.getByRole("link",{name:"성과"})).toHaveAttribute("aria-current","page");
  });
  it("로그인 화면은 메뉴 없이 불러오는 중만 보인다",()=>{
    path.value="/login";
    render(<PageLoading/>);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
    expect(screen.queryByRole("navigation",{name:"주요 메뉴"})).toBeNull();
  });
});
