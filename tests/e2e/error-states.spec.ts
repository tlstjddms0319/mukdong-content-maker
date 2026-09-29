import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

test("settings explains AI connection without exposing a key", async ({ page }) => {
  await loginAsOwner(page);
  await page.route("**/api/settings",route=>route.fulfill({json:{saved:true}}));
  await page.goto("/settings");
  await expect(page.getByText(/Gemini (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByText(/OpenAI (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByText(/Groq (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByLabel("문안 AI")).toHaveValue("automatic");
  await expect(page.getByText(/실시간 인기 주제 연결은 후속 단계/)).toBeVisible();
  await expect(page.getByLabel("문안 길이")).toBeVisible();
  await expect(page.getByLabel("OpenAI 이미지 품질")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sk-");
  await page.getByRole("button", { name:"설정 저장" }).click();
  await expect(page.getByRole("status").filter({hasText:"저장했어요."})).toHaveText("저장했어요.");
});
