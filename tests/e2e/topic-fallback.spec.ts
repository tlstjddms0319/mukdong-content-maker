import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

test("shows a notice when prepared topics replace AI suggestions", async ({ page }, testInfo) => {
  await page.route("**/api/topics", route => route.fulfill({ json: { source: "fallback", topics: [1, 2, 3].map(i => ({ id: `fallback-1-${i}`, title: `준비된 질문 ${i}?`, summary: "익숙한 음식에서 홍어로 이어지는 설명입니다.", reason: "이유", audience: "A", imageBrief: "사진" })) } }));
  await loginAsOwner(page);
  const notice = page.getByText("AI 추천을 불러오지 못해 준비된 주제를 보여드려요. 잠시 후 AI 추천 새로고침을 다시 눌러 보세요.");
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("topic-fallback.png") });
});
