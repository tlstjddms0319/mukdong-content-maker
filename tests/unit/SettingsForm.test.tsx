import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsForm } from "@/components/settings/SettingsForm";

describe("SettingsForm", () => {
  it("shows safe defaults and restores them", () => {
    const save = vi.fn(); render(<SettingsForm onSave={save}/>);
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("4:5");
    expect(screen.queryByDisplayValue(/sk-/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이미지 비율"), { target:{ value:"1:1" } });
    fireEvent.click(screen.getByRole("button", { name:"권장값으로 되돌리기" }));
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("4:5");
  });
});
