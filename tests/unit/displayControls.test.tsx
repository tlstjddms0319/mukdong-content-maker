import { fireEvent,render,screen } from "@testing-library/react";
import { afterEach,describe,expect,it } from "vitest";
import { DisplayControls } from "@/components/wizard/DisplayControls";

afterEach(()=>{document.documentElement.removeAttribute("data-theme");document.documentElement.removeAttribute("data-bigfont");localStorage.clear();});

describe("화면 버튼",()=>{
  it("어둡게를 누르면 html에 dark를 붙이고 기억한다. 다시 누르면 밝게",()=>{
    render(<DisplayControls/>);
    fireEvent.click(screen.getByRole("button",{name:"어두운 화면으로"}));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("mukdong-theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button",{name:"밝은 화면으로"}));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("글씨 크게를 켜고 끌 수 있고 기억한다",()=>{
    render(<DisplayControls/>);
    const button=screen.getByRole("button",{name:/글씨 크게/});
    fireEvent.click(button);
    expect(document.documentElement.hasAttribute("data-bigfont")).toBe(true);
    expect(localStorage.getItem("mukdong-bigfont")).toBe("1");
    expect(button).toHaveAttribute("aria-pressed","true");
    fireEvent.click(button);
    expect(document.documentElement.hasAttribute("data-bigfont")).toBe(false);
    expect(localStorage.getItem("mukdong-bigfont")).toBeNull();
  });
  it("이미 붙어 있는 설정(저장값)을 처음부터 보여 준다",()=>{
    document.documentElement.dataset.theme="dark";
    document.documentElement.setAttribute("data-bigfont","");
    render(<DisplayControls/>);
    expect(screen.getByRole("button",{name:"밝은 화면으로"})).toHaveAttribute("aria-pressed","true");
    expect(screen.getByRole("button",{name:/글씨 보통/})).toHaveAttribute("aria-pressed","true");
  });
});
