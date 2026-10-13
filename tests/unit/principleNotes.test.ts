// @vitest-environment node
// 원리 노트(store/principles.ts): 결과물 점검 5회 내내 이유 깊이 2.8/5. AI가 원리를 지어내서("기온이 낮아지면 애가 걸쭉해져요")
// 확인해 둔 원리를 주제·구성안·검수·올릴 글에 주고 거기서 고르게 한다.
import { describe, expect, it } from "vitest";
import { PRINCIPLE_NOTES, principleNotesRule, principleTopicHints, principlesFor } from "@/features/store/principles";
import { STORE_MENU } from "@/features/store/menu";
import { buildCarouselPlanPrompt } from "@/features/images/carousel";
import { buildCopyPrompt } from "@/features/copy/writing";
import { buildTopicPrompt } from "@/features/topics/prompt";
import { checkTextClaims } from "@/features/guard/service";

describe("principle notes",()=>{
  it("has unique ids, known menu ids, and every menu has at least one note",()=>{
    const ids=PRINCIPLE_NOTES.map(note=>note.id);
    expect(new Set(ids).size).toBe(ids.length);
    const menuIds=new Set(STORE_MENU.map(item=>item.id));
    for(const note of PRINCIPLE_NOTES)for(const id of note.menus)expect(menuIds.has(id)).toBe(true);
    for(const item of STORE_MENU)expect(PRINCIPLE_NOTES.some(note=>note.menus.includes(item.id))).toBe(true);
  });

  it("never states store-only facts or banned claims",()=>{
    for(const note of PRINCIPLE_NOTES){
      const result=checkTextClaims(note.fact);
      expect(result.blocked,note.id).toEqual([]);
      expect(result.verify,note.id).toEqual([]);
      expect(note.fact,note.id).not.toMatch(/효능|건강에|면역|다이어트|묵동홍어마을/);
    }
  });

  it("picks the dish's notes and the general notes the topic words call for",()=>{
    const ae=principlesFor("찬바람 불 때 홍어애탕은 왜 유독 진하게 느껴질까?").map(note=>note.id);
    expect(ae).toEqual(expect.arrayContaining(["ae-fat","ae-season","warm-aroma","cold-craving"]));
    expect(ae).not.toContain("gwamegi-freeze");
    // 삼합 노트는 삼합·수육·묵은지 이야기일 때만
    expect(principlesFor("홍어회는 왜 톡 쏠까?").map(note=>note.id)).not.toContain("samhap");
    expect(principlesFor("홍어회는 왜 수육과 먹을까?").map(note=>note.id)).toContain("samhap");
    expect(principlesFor("오늘의 추천").length).toBe(0);
    expect(principlesFor("홍어회 홍어찜 홍어애탕 처음 낯설 향 따뜻").length).toBeLessThanOrEqual(8);
  });

  it("asks to hedge unsure notes and puts the notes into plan and caption prompts",()=>{
    const rule=principleNotesRule("홍어는 왜 상하지 않고 삭을까?");
    expect(rule).toContain("[원리 노트]");
    expect(rule).toContain("요소를 암모니아로 분해");
    expect(rule).toContain("~로 알려져 있어요");
    expect(principleNotesRule("오늘의 추천")).toBe("");
    const topic="과메기는 왜 찬바람이 불어야 맛있을까?";
    expect(buildCarouselPlanPrompt({topic,slideCount:5,track:"photo"})).toContain("얼었다 녹기를 되풀이");
    expect(buildCopyPrompt({topic,audience:"A"} as never,"medium")).toContain("얼었다 녹기를 되풀이");
  });

  it("gives topic suggestions the principle hints by menu name",()=>{
    const hints=principleTopicHints();
    expect(hints).toContain("과메기:");
    expect(hints).toContain("막걸리:");
    expect(buildTopicPrompt({storeName:"묵동홍어마을"} as never)).toContain("[원리 노트 실마리]");
  });
});
