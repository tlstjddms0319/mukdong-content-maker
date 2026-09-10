import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyEditor } from "@/components/copy/CopyEditor";

describe("CopyEditor", () => {
  it("shows readable copy and four focused actions", () => {
    render(<CopyEditor onContinue={() => undefined} />);
    expect(screen.getByLabelText("게시물 문안")).toBeInTheDocument();
    expect(screen.getAllByText(/다시 만들기/)).toHaveLength(4);
  });
});
