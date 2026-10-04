import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageCheckCard } from "@/components/settings/StorageCheckCard";

describe("StorageCheckCard",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("checks the storage on request and shows what to fix",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({configured:true,ok:false,message:"Supabase에 'mukdong-private' 버킷이 없어요."})})));
    render(<StorageCheckCard/>);
    fireEvent.click(screen.getByRole("button",{name:"저장소 연결 확인"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("버킷이 없어요");
    expect(screen.getByText("설정은 됐지만 문제가 있어요")).toBeInTheDocument();
  });
});
