import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportActions } from "@/components/review/ExportActions";

describe("ExportActions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the current edited caption", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard:{ writeText } });
    render(<ExportActions caption="지금 편집한 문안" imageUrl="data:image/png;base64,AQID" />);
    fireEvent.click(screen.getByRole("button", { name:"문안 복사" }));
    expect(writeText).toHaveBeenCalledWith("지금 편집한 문안");
  });

  it("creates a zip download from the selected image", async () => {
    const createObjectURL = vi.fn(() => "blob:bundle");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL:vi.fn() });
    render(<ExportActions caption="문안" imageUrl="data:image/png;base64,AQID" />);
    fireEvent.click(screen.getByRole("button", { name:"전체 묶음 받기" }));
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
