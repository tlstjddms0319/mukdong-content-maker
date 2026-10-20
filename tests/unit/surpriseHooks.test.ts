// @vitest-environment node
// 오해 깨기의 의외성(2026-10-20, 사장님: "오해 깨기 주제가 너무 단순하면 사람들이 볼 일이 없다").
// 원리 노트의 오해에 의외성 등급(1~3)과 손으로 쓴 표지 한 줄(hook)을 두고, 2 이상만 표지 재료로, 3은 주제 실마리에서 앞세운다.
// 오해를 사실처럼 묻는 표지("과메기는 냉동실에서도 만들 수 있다고?")는 검수가 잡는다.
import { describe, expect, it } from "vitest";
import { PRINCIPLE_NOTES, coverMythRule, mythAssertedBy, principleTopicHints } from "@/features/store/principles";
import { preparedTopicTitles } from "@/features/topics/service";
import { createFallbackCarouselPlan, type CarouselPlan } from "@/features/images/carousel";
import { slideCopyIssues } from "@/features/images/planReview";

describe("myth notes carry a surprise grade and a hook line",()=>{
  it("every myth has a grade; grade 2+ has a hook that reads as the myth being wrong",()=>{
    for(const note of PRINCIPLE_NOTES.filter(note=>note.myth)){
      expect(note.surprise,note.id).toBeDefined();
      if((note.surprise??1)>=2){
        expect(note.hook,note.id).toBeTruthy();
        expect(note.hook,note.id).toMatch(/아니|않|못|덜|더 |오히려|고\?$/);
      }
    }
    expect(PRINCIPLE_NOTES.filter(note=>note.surprise===3).length).toBeGreaterThanOrEqual(7);
    // 숨 참기·두 번째 점·가라앉은 막걸리 같은 "써먹는 반전"이 들어 있다.
    expect(PRINCIPLE_NOTES.map(note=>note.id)).toEqual(expect.arrayContaining(["skate-second-bite","makgeolli-sediment"]));
  });
  it("cover material lists only grade-2+ myths, highest first, with the hook example",()=>{
    const rule=coverMythRule("홍어찜은 왜 쪄도 살이 쫀득할까?","쫀득한 살","열에 콜라겐이 젤라틴으로 풀려요","김이 오를 때 향이 더 세요");
    expect(rule).toContain("홍어는 익히면 향이 더 세진다고?");
    expect(rule).not.toContain("생선은 찌면 퍽퍽해진다");
    expect(rule).toContain("오해가 틀렸다는 쪽이 드러나게");
    const first=rule.indexOf("익히면 홍어 향이 약해진다"),second=rule.indexOf("홍어의 톡 쏘는 향은 상해서");
    expect(first).toBeGreaterThan(0);
    if(second>0)expect(first).toBeLessThan(second+rule.length);
  });
  it("topic hints put the big-surprise hooks first and skip ones already used",()=>{
    const hints=principleTopicHints();
    expect(hints.indexOf("[의외성 큰 실마리")).toBe(0);
    expect(hints).toContain("홍어, 숨을 참고 씹으면 덜 쏜다고?");
    expect(principleTopicHints(["홍어회는 왜 숨을 참고 씹으면 덜 쏠까?"])).not.toContain("숨을 참고 씹으면 덜 쏜다고?");
  });
});

describe("a cover that states the myth as if true is flagged",()=>{
  it("catches the freezer cover and accepts the overturned form",()=>{
    expect(mythAssertedBy("과메기는 그냥 바람에 말린 생선이라고?")?.id).toBe("gwamegi-freeze");
    expect(mythAssertedBy("과메기는 말린 게 아니라 얼렸다 녹인 거라고?")).toBeUndefined();
    expect(mythAssertedBy("홍어회는 왜 처음 먹을 때 코가 찡할까?")).toBeUndefined();
    const base=createFallbackCarouselPlan({topic:"과메기는 왜 찬바람에 말려야 할까?",slideCount:5,track:"text"});
    const plan:CarouselPlan={...base,slides:base.slides.map((slide,i)=>i===0?{...slide,headline:"과메기는 그냥 바람에 말린 생선이라고?",subline:"왜 그럴까요?"}:slide)};
    expect(slideCopyIssues(plan,"text").map(issue=>issue.message).join("\n")).toContain("오해('과메기는 그냥 바람에 말린 생선이다')를 사실처럼 물어요");
  });
});

describe("prepared topics lead with the twist",()=>{
  it("replaces the two 'obvious' titles and adds breath-holding and freeze-thaw topics",()=>{
    const titles=preparedTopicTitles();
    expect(titles).toContain("홍어회는 왜 숨을 참고 씹으면 덜 쏠까?");
    expect(titles).toContain("과메기는 왜 말린 생선이 아니라 얼렸다 녹인 생선일까?");
    expect(titles).toContain("홍어애탕은 오래 끓이지 않아도 왜 국물이 묵직할까?");
    expect(titles).not.toContain("홍어애탕은 왜 맑은 생선탕과 달리 국물이 묵직할까?");
    expect(titles).not.toContain("비 오는 날엔 왜 전과 막걸리가 생각날까?");
  });
});
