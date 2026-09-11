import { expect, test } from "@playwright/test";

test("settings explains AI connection without exposing a key", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("연결 필요")).toBeVisible();
  await expect(page.getByText("실시간 인기 주제 연결은 다음 단계에서 제공할 예정이에요.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sk-");
});
