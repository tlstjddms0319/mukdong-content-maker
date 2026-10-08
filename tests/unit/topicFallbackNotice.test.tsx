import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DraftWizard } from "@/components/wizard/DraftWizard";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
const topics = [1, 2, 3].map(i => ({ id: `fallback-1-${i}`, title: `기본 주제 ${i}?`, audience: "A", reason: "r", summary: "s", imageBrief: "" }));

it("tells the owner when prepared topics replace AI suggestions", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ topics, source: "fallback" }) })));
  render(<DraftWizard />);
  expect(await screen.findByText(/준비된 주제를 보여 드려요\. 잠시 뒤 '다른 주제 보기'/)).toBeInTheDocument();
});

it("shows the server's reason for prepared topics", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ topics, source: "fallback", fallbackMessage: "글 쓰는 AI가 잠깐 한도에 걸렸어요. 1분 뒤 '다른 주제 보기'를 눌러 보세요." }) })));
  render(<DraftWizard />);
  expect(await screen.findByText(/준비된 주제를 보여 드려요\. 글 쓰는 AI가 잠깐 한도에 걸렸어요/)).toBeInTheDocument();
});

it("says the server could not be reached, and still shows season-aware prepared topics", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
  render(<DraftWizard />);
  expect(await screen.findByText(/서버와 연결이 잠시 끊겼어요/)).toBeInTheDocument();
});

it("stays quiet for AI suggestions", async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ topics: topics.map(t => ({ ...t, id: "ai-" + t.id })), source: "ai" }) }));
  vi.stubGlobal("fetch", fetch);
  render(<DraftWizard />);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await screen.findByText("기본 주제 1?");
  expect(screen.queryByText(/준비된 주제를 보여 드려요/)).toBeNull();
});
