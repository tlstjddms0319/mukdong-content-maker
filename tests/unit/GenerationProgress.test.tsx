import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationProgress } from "@/components/states/GenerationState";

describe("GenerationProgress",()=>{
  afterEach(()=>vi.useRealTimers());
  it("shows changing elapsed time instead of a frozen loading label",()=>{
    vi.useFakeTimers();
    render(<GenerationProgress label="이미지"/>);
    expect(screen.getByRole("status")).toHaveTextContent("0초");
    act(()=>vi.advanceTimersByTime(6000));
    expect(screen.getByRole("status")).toHaveTextContent("6초");
    expect(screen.getByRole("status")).toHaveTextContent("만드는 중");
  });
});
