import { expect, test } from "@playwright/test";

test("creates a draft without advanced settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name:"이미지 선택" }).click();
  await page.getByRole("button", { name:"AI 이미지 생성" }).click();
  await page.getByRole("button", { name:"이 이미지 사용" }).first().click();
  await page.getByRole("button", { name:"문안 만들기" }).click();
  await page.getByRole("button", { name:"최종 화면 보기" }).click();
  await expect(page.getByText("게시하기 전에")).toBeVisible();
  await expect(page.getByRole("button", { name:"전체 묶음 받기" })).toBeEnabled();
});
