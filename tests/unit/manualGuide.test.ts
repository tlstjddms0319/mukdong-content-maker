// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildManualPostingGuide, formatManualPostingGuide } from "@/features/publishing/manualGuide";

describe("manual posting guide", () => {
  it("groups local, menu, interest and store hashtags without duplicates", () => {
    const guide = buildManualPostingGuide({ topic:"처음 먹는 홍어 삼합", audience:"A" });

    expect(guide.hashtagGroups).toEqual([
      { label:"지역", tags:["#묵동맛집", "#중랑구맛집"] },
      { label:"메뉴", tags:["#홍어삼합", "#홍어맛집", "#해산물맛집"] },
      { label:"관심사", tags:["#발효음식", "#맛집탐방"] },
      { label:"매장", tags:["#묵동홍어마을"] },
    ]);
    expect(guide.hashtags).toEqual(["#묵동맛집", "#중랑구맛집", "#홍어삼합", "#홍어맛집", "#해산물맛집", "#발효음식", "#맛집탐방", "#묵동홍어마을"]);
  });

  it("changes the music direction for a gathering-focused audience", () => {
    const guide = buildManualPostingGuide({ topic:"동네 모임 저녁 홍어 한 상", audience:"B" });

    expect(guide.music.mood).toBe("밝은 레트로·펑크");
    expect(guide.music.searchTerms).toEqual(["retro dinner", "upbeat funk", "friends night"]);
  });

  it("uses beginner-friendly discovery tags for the curiosity audience", () => {
    const guide = buildManualPostingGuide({ topic:"첫 홍어 전에 알고 갈 세 가지", audience:"C" });

    expect(guide.hashtags).toContain("#홍어입문");
    expect(guide.music.mood).toBe("부담 없는 로파이·어쿠스틱");
  });

  it("formats a complete offline guide with the place link and manual steps", () => {
    const text = formatManualPostingGuide(buildManualPostingGuide({ topic:"홍어와 막걸리", audience:"B" }));

    expect(text).toContain("네이버 플레이스: https://naver.me/Ffex1C2k");
    expect(text).toContain("Instagram 음악 검색어: korean acoustic, makgeolli mood, folk groove");
    expect(text).toContain("1. 이미지 순서와 잘림을 확인합니다.");
    expect(text).toContain("5. Instagram 앱에서 직접 게시합니다.");
  });
});
