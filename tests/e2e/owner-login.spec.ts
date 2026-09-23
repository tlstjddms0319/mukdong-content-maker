import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

test("anonymous drafts redirect to login and owner can return to drafts", async ({ page }) => {
  await page.goto("/drafts");
  await expect(page).toHaveURL(/\/login\?next=%2Fdrafts$/);
  await loginAsOwner(page, "/drafts");
  await expect(page.getByRole("heading", { name: "내 초안" })).toBeVisible();
});

test("wrong password stays on login, then logout blocks drafts", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("관리자 암호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.locator(".login-card [role='alert']")).toContainText("암호가 올바르지 않습니다");
  await loginAsOwner(page, "/drafts");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/drafts");
  await expect(page).toHaveURL(/\/login\?next=%2Fdrafts$/);
});

test("anonymous private API returns 401", async ({ request }) => {
  const response = await request.get("/api/drafts");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("login form stays usable across desktop and mobile", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("관리자 암호")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  await loginAsOwner(page, "/drafts");
});
