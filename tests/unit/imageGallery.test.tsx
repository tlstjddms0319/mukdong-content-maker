import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageGallery } from "@/components/images/ImageGallery";
import ImagesError from "@/app/images/error";
import DraftsError from "@/app/drafts/error";
import type { Draft } from "@/features/drafts/schema";

const baseDraft: Draft = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "ready",
  topic: "홍어 한 상",
  audience: "A",
  media_candidates: [],
  selected_media_id: null,
  copy: null,
  facts_to_verify: [],
  store_profile_version: "2026-09-10",
  created_at: "2026-09-24T00:00:00.000Z",
  updated_at: "2026-09-24T00:00:00.000Z",
};

const selected: Draft = {
  ...baseDraft,
  media_candidates: [
    { id: "22222222-2222-4222-8222-222222222222", source: "photo", file_id: "data:image/png;base64,aA==", purpose: "instagram-primary" },
    { id: "44444444-4444-4444-8444-444444444444", source: "ai-generated", file_id: "data:image/png;base64,aA==", purpose: "unselected" },
  ],
  selected_media_id: "22222222-2222-4222-8222-222222222222",
};

describe("ImageGallery", () => {
  it("offers the existing creation flow when there are no drafts", () => {
    render(<ImageGallery drafts={[]} />);
    expect(screen.getByText("아직 저장된 초안이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이미지 제작 시작" })).toHaveAttribute("href", "/");
  });

  it("shows selected media only and keeps an image-less draft reachable", () => {
    const noImage: Draft = { ...baseDraft, id: "33333333-3333-4333-8333-333333333333", topic: "이미지 없는 초안" };
    render(<ImageGallery drafts={[selected, noImage]} />);
    expect(screen.getByText("선택 이미지 1장")).toBeInTheDocument();
    expect(screen.getByText("이미지 미선택")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "초안 열기" })[0]).toHaveAttribute("href", `/?draft=${selected.id}`);
    expect(screen.getAllByRole("link", { name: "초안 열기" })[1]).toHaveAttribute("href", `/?draft=${noImage.id}`);
  });

  it("uses a text fallback for an unusable preview without hiding its draft", () => {
    const broken: Draft = { ...selected, id: "55555555-5555-4555-8555-555555555555", media_candidates: [{ ...selected.media_candidates[0], file_id: "broken-media" }] };
    render(<ImageGallery drafts={[broken]} />);
    expect(screen.getByText("미리보기 없음")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "초안 열기" })).toHaveAttribute("href", `/?draft=${broken.id}`);
  });
});

describe("draft list errors", () => {
  it.each([ImagesError, DraftsError])("shows a retry instead of an empty list", ErrorPage => {
    const retry = vi.fn();
    render(<ErrorPage error={new Error("private storage detail")} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("목록을 불러오지 못했어요");
    expect(screen.queryByText("private storage detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
