// 가게 공용 로고: 크기에 맞는 파일을 고르고, 옆에 이름 글자가 있는 상단 표식에서는 장식으로만 둔다(이름을 두 번 읽지 않게).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { WizardShell } from "@/components/wizard/WizardShell";

describe("brand logo", () => {
  it("uses the 64px file for small marks and the 192px file for larger ones", () => {
    const {container}=render(<><BrandLogo size={32}/><BrandLogo size={56} alt="묵동홍어마을 공용 로고"/></>);
    const [small,large]=[...container.querySelectorAll("img")];
    expect(small.getAttribute("src")).toBe("/brand/logo-64.png");
    expect(small.getAttribute("alt")).toBe("");
    expect(large.getAttribute("src")).toBe("/brand/logo-192.png");
    expect(screen.getByRole("img",{name:"묵동홍어마을 공용 로고"})).toBe(large);
  });
  it("keeps the header link name and shows the logo as decoration", () => {
    render(<WizardShell step="topic"><p>본문</p></WizardShell>);
    const home=screen.getByRole("link",{name:"묵동 콘텐츠 메이커 홈"});
    expect(home.querySelector("img.brand-logo")?.getAttribute("alt")).toBe("");
  });
  it("ships the icon files the app and the screens point to", () => {
    for(const file of ["src/app/favicon.ico","src/app/icon.png","src/app/apple-icon.png","public/brand/logo-64.png","public/brand/logo-192.png"])
      expect(existsSync(file),file).toBe(true);
  });
});
