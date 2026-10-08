import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";
import { fallbackTopics } from "../../src/features/topics/service";

// 질문형 추천 3개가 설명과 함께 보이고, 새로고침하면 다음 추천 방향의 다른 묶음이 나온다.
// 첫 화면의 추천 방향은 방문할 때마다 바뀌므로(같은 주제 반복 방지), 실제로 보낸 방향 번호로 기대값을 만든다.
test("shows question outlines and refreshes to another set", async ({page},testInfo)=>{
  const rounds:number[]=[];
  await page.route("**/api/topics",route=>{
    const input=route.request().postDataJSON();
    rounds.push(input.recommendationRound);
    return route.fulfill({json:{topics:fallbackTopics(input.recommendationRound,input.excludeTitles)}});
  });
  await loginAsOwner(page);
  // 로그인하며 연 첫 화면의 추천 요청이 끝날 때까지 기다린 뒤 다시 연다(늦게 온 요청이 섞이지 않게).
  await expect.poll(()=>rounds.length).toBeGreaterThan(0);
  await expect(page.locator(".topic-card")).toHaveCount(3);
  const sent=page.waitForRequest(request=>request.url().endsWith("/api/topics"));
  await page.goto("/");
  const round=(await sent).postDataJSON().recommendationRound as number;
  const first=fallbackTopics(round);
  await expect(page.getByLabel("직접 쓰기")).toHaveValue(first[0].title);
  await expect(page.locator(".topic-card")).toHaveCount(3);
  for(const topic of first)await expect(page.locator(".topic-card").filter({hasText:topic.title})).toContainText(topic.summary);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("curiosity-topics.png"),fullPage:true});
  await page.getByRole("button",{name:"다른 주제 보기"}).click();
  await expect(page.getByLabel("직접 쓰기")).toHaveValue(fallbackTopics(round+1,first.map(topic=>topic.title))[0].title);
  await expect(page.locator(".topic-card").filter({hasText:first[0].title})).toHaveCount(0);
});
