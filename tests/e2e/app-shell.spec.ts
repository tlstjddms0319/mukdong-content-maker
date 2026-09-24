import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loginAsOwner } from "./helpers";

test("owner can navigate every app section and start from a prepared topic", async ({ page }, testInfo) => {
  await loginAsOwner(page, "/images");
  for (const [label, path] of [["콘텐츠 자료", "/library"], ["도움말", "/help"], ["설정", "/settings"], ["내 초안", "/drafts"], ["이미지 제작실", "/images"]] as const) {
    await page.getByRole("link", { name: label }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: label }).first()).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/library");
  await page.screenshot({ path: testInfo.outputPath("library.png"), fullPage: true });
  const topic = (await page.locator(".library-card h2").first().textContent())?.trim();
  expect(topic).toBeTruthy();
  await page.getByRole("link", { name: "이 주제로 초안 시작" }).first().click();
  await expect(page.getByLabel("직접 주제를 적고 싶다면")).toHaveValue(topic!);
  await expect(page.getByRole("button", { name: "이미지 선택" })).toBeEnabled();
});

test("anonymous visitor is sent to login for new private pages", async ({ page }) => {
  for (const path of ["/images", "/library", "/help"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replaceAll("/", "%2F")}$`));
  }
});

test("image gallery and primary action fit a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsOwner(page, "/images");
  await page.screenshot({ path: testInfo.outputPath("images-narrow.png"), fullPage: true });
  await expect(page.getByRole("link", { name: "이미지 제작 시작" })).toBeVisible();
  await expect(page.getByRole("link", { name: "콘텐츠 자료" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("opens an image-less saved draft from the gallery", async ({ page }) => {
  await loginAsOwner(page);
  const id = randomUUID();
  const topic = `이미지 미선택 ${id.slice(0, 8)}`;
  const draftFile = path.join(process.cwd(), ".superpowers/sdd/2026-09-22-owner-access/e2e-data/drafts", `${id}.json`);
  try {
    const created = await page.request.post("/api/drafts", { data: { id, status: "ready", topic, audience: "A", media_candidates: [], selected_media_id: null, copy: null, facts_to_verify: [], store_profile_version: "2026-09-10", created_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-24T00:00:00.000Z" } });
    expect(created.status()).toBe(201);
    await page.goto("/images");
    await page.locator(".image-gallery-card").filter({ hasText: topic }).getByRole("link", { name: "초안 열기" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?draft=${id}$`));
    await expect(page.getByRole("button", { name: "문안 만들기" })).toBeDisabled();
    await expect(page.getByText("선택한 초안을 찾지 못했어요. 내 초안에서 다시 골라 주세요.")).toHaveCount(0);
  } finally {
    await rm(draftFile, { force: true });
  }
});
