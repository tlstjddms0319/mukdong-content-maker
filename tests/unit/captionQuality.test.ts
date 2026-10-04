// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanHookOptions, copyTextIssues, generatedCopyIssues, mixHashtags } from "@/features/copy/writing";

describe("caption quality", () => {
  it("always ends with the area and store tags and keeps at most three topic tags", () => {
    expect(mixHashtags(["#홍어","삼합","#막걸리","#비오는날","#중랑구맛집","#묵동홍어마을"])).toEqual(["#홍어","#삼합","#막걸리","#묵동맛집","#묵동홍어마을"]);
    expect(mixHashtags([])).toEqual(["#묵동맛집","#묵동홍어마을"]);
  });

  it("keeps only usable first-line candidates", () => {
    const hook="홍어는 왜 수육이랑 먹을까요?";
    expect(cleanHookOptions([hook,"  수육 옆 홍어 한 점, 무슨 맛일까요?  ","미식의 향연, 홍어를 놓치지 마세요","가".repeat(70),"수육 옆 홍어 한 점, 무슨 맛일까요?","김치와 수육 사이에 홍어를 올리면 어떨까요?"],hook))
      .toEqual(["수육 옆 홍어 한 점, 무슨 맛일까요?","김치와 수육 사이에 홍어를 올리면 어떨까요?"]);
  });

  it("flags clichés, exclamation overuse and mixed formal endings in the caption", () => {
    const issues=copyTextIssues("미식의 향연이에요! 정말요! 진짜요! 대단해요!\n매장에서 준비했습니다.\n#홍어");
    expect(issues.join("\n")).toContain("미식의 향연");
    expect(issues.join("\n")).toContain("느낌표");
    expect(issues.join("\n")).toContain("해요체로 통일");
    // 해시태그 줄과 AI 이미지 고지는 문장 끝맺음 검사에서 뺀다.
    expect(copyTextIssues("홍어 한 점을 먹어 봐요.\nAI 연출 이미지가 포함되어 있으며 실제 메뉴와 다를 수 있습니다.")).toEqual([]);
  });

  it("asks for a first line that fits before Instagram's 'more' cut", () => {
    const base={topic:"홍어",audience:"A" as const,information:"정보 ".repeat(200),store_connection:"묵동에서 홍어를 알아볼 때 묵동홍어마을도 살펴보세요.",call_to_action:"프로필의 네이버 플레이스에서 메뉴를 확인해 보세요.",hashtags:["#홍어","#묵동맛집","#묵동홍어마을"],facts_used:[],facts_to_verify:[],image_disclosure:null};
    expect(generatedCopyIssues({...base,hook:"홍어 ".repeat(25)},"medium").join("\n")).toContain("첫 문장을 60자 이내로");
    expect(generatedCopyIssues({...base,hook:"홍어는 왜 수육이랑 먹을까요?"},"medium").join("\n")).not.toContain("첫 문장을 60자");
  });
});
