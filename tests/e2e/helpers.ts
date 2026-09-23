import { expect, type Page } from "@playwright/test";

export async function loginAsOwner(page: Page, destination = "/") {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("관리자 암호").fill("test-owner-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}
