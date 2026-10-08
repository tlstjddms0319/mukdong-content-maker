import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DraftWizard } from "@/components/wizard/DraftWizard";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
const topics = [1, 2, 3].map(i => ({ id: `fallback-1-${i}`, title: `기본 주제 ${i}?`, audience: "A", reason: "r", summary: "s", imageBrief: "" }));

it("tells the owner when prepared topics replace AI suggestions", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ topics, source: "fallback" }) })));
  render(<DraftWizard />);
  expect(await screen.findByText(/추천을 불러오지 못해 준비된 주제를 보여 드려요/)).toBeInTheDocument();
});

it("stays quiet for AI suggestions", async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ topics: topics.map(t => ({ ...t, id: "ai-" + t.id })), source: "ai" }) }));
  vi.stubGlobal("fetch", fetch);
  render(<DraftWizard />);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await screen.findByText("기본 주제 1?");
  expect(screen.queryByText(/준비된 주제를 보여 드려요/)).toBeNull();
});
