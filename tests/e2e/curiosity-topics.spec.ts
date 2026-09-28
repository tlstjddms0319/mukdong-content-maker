import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";
import { fallbackTopics } from "../../src/features/topics/service";

test("shows question outlines and refreshes to another set", async ({page},testInfo)=>{
  const first=fallbackTopics();
  await page.route("**/api/topics",route=>{
    const input=route.request().postDataJSON();
    return route.fulfill({json:{topics:fallbackTopics(input.recommendationRound,input.excludeTitles)}});
  });
  await loginAsOwner(page);
  await page.goto("/");
  await expect(page.getByLabel("직접 주제를 적고 싶다면")).toHaveValue(first[0].title);
  await expect(page.locator(".topic-card")).toHaveCount(3);
  for(const topic of first)await expect(page.locator(".topic-card").filter({hasText:topic.title})).toContainText(topic.summary);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("curiosity-topics.png"),fullPage:true});
  await page.getByRole("button",{name:"AI 추천 새로고침"}).click();
  await expect(page.getByLabel("직접 주제를 적고 싶다면")).toHaveValue(fallbackTopics(1)[0].title);
  await expect(page.locator(".topic-card").filter({hasText:first[0].title})).toHaveCount(0);
});
