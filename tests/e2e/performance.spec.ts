import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 성과 직접 기록: 내 초안 카드에서 숫자를 적으면 "성과 돌아보기"에 반응 좋은 순서로 모인다.
async function createDraft(page:Page,topic:string){
  const id=randomUUID(),mediaId=randomUUID();
  const created=await page.request.post("/api/drafts",{data:{id,status:"ready",topic,audience:"B",design_style:"webtoon",media_candidates:[{id:mediaId,source:"photo",file_id:"data:image/png;base64,iVBORw0KGgo=",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"게시한 문안",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-22T00:00:00.000Z",updated_at:"2026-09-22T00:00:00.000Z"}});
  expect(created.status()).toBe(201);
}
async function record(page:Page,topic:string,values:Record<string,string>){
  const card=page.locator(".draft-card").filter({hasText:topic});
  await card.getByText("올릴 날짜 · 반응 적기").click();
  await card.getByText("성과 기록").click();
  const form=card.getByRole("form",{name:`${topic} 성과 기록`});
  for(const [label,value] of Object.entries(values))await form.getByLabel(label).fill(value);
  await form.getByRole("button",{name:"성과 저장"}).click();
  await expect(form.getByText("성과를 저장했어요.")).toBeVisible();
}

test("recorded performance ranks posts in the insights section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name!=="desktop","성과 기록은 저장소를 공유해 한 기기 설정으로만 확인한다.");
  await loginAsOwner(page);
  const tag=randomUUID().slice(0,6);
  const strong=`저장 많은 글 ${tag}`, weak=`조용한 글 ${tag}`;
  await createDraft(page,strong);await createDraft(page,weak);
  await page.goto("/drafts");
  // 아주 큰 숫자로 적어 다른 테스트의 기록보다 앞에 오게 한다.
  await record(page,strong,{"올린 날":"2026-10-06","좋아요":"900000","저장":"300000"});
  await record(page,weak,{"좋아요":"800000"});
  // 반응 돌아보기는 더보기 → 한 달 계획 화면에 있다.
  await page.goto("/plan");
  const insights=page.getByRole("region",{name:"성과 돌아보기"});
  await expect(insights.locator(".insight-top li").first()).toContainText(strong);
  await expect(insights.locator(".insight-top li").nth(1)).toContainText(weak);
  await expect(insights.getByRole("heading",{name:"모양별"})).toBeVisible();
  await expect(insights.getByText("화요일")).toBeVisible();
  // 다시 열면 적은 숫자가 그대로 보이고, 요약 줄에 반응 점수가 붙는다.
  await page.goto("/drafts");
  await page.locator(".draft-card").filter({hasText:strong}).getByText("올릴 날짜 · 반응 적기").click();
  await expect(page.locator(".draft-card").filter({hasText:strong}).getByText(`반응 점수 ${(900000+300000*3).toLocaleString("ko-KR")}`)).toBeVisible();
});
