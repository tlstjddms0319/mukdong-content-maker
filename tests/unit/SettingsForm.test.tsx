import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";

describe("SettingsForm", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows safe defaults and restores them", () => {
    const save = vi.fn(); render(<SettingsForm onSave={save}/>);
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("4:5");
    expect(screen.queryByDisplayValue(/sk-/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이미지 비율"), { target:{ value:"1:1" } });
    fireEvent.click(screen.getByRole("button", { name:"권장값으로 되돌리기" }));
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("4:5");
  });

  it("saves validated defaults through the settings API", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", request);
    render(<SettingsForm />);
    fireEvent.click(screen.getByRole("button", { name:"설정 저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("저장했어요.");
    expect(request).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method:"PUT" }));
  });

  it("starts with previously saved settings", () => {
    render(<SettingsForm initialSettings={{ ...DEFAULT_SETTINGS, imageAspectRatio:"1:1", copyLength:"detailed" }} />);
    expect(screen.getByLabelText("이미지 비율")).toHaveValue("1:1");
    expect(screen.getByLabelText("문안 길이")).toHaveValue("detailed");
  });
});
