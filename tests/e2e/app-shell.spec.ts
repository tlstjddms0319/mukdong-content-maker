import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loginAsOwner } from "./helpers";

test("owner can navigate every app section and start from a prepared topic", async ({ page }, testInfo) => {
  await loginAsOwner(page, "/images");
  const nav=page.getByRole("navigation",{name:"주요 메뉴"});
  // 더보기는 화면을 옮기면 다시 접힌다. 접혀 있을 때만 눌러 펼친다.
  const openMore=async()=>{if(await nav.locator("details.nav-more").getAttribute("open")===null)await nav.getByText("더보기").click();};
  // 늘 보이는 메뉴 셋 + 더보기 안의 넷. 예전 주소는 그대로 열린다.
  for (const [label, path, more] of [["콘텐츠 자료", "/library", true], ["도움말", "/help", true], ["설정", "/settings", false], ["내 게시물", "/drafts", false], ["한 달 계획", "/plan", true], ["이미지 모음", "/images", true]] as const) {
    if(more)await openMore();
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if(more)await openMore();
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/library");
  await page.screenshot({ path: testInfo.outputPath("library.png"), fullPage: true });
  const topic = (await page.locator(".library-card h2").first().textContent())?.trim();
  expect(topic).toBeTruthy();
  await page.getByRole("link", { name: "이 주제로 만들기" }).first().click();
  await expect(page.getByLabel("직접 쓰기")).toHaveValue(topic!);
  await expect(page.getByRole("button", { name: "다음" })).toBeEnabled();
});

test("anonymous visitor is sent to login for new private pages", async ({ page }) => {
  for (const path of ["/images", "/library", "/help", "/plan"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replaceAll("/", "%2F")}$`));
  }
});

test("image gallery and primary action fit a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsOwner(page, "/images");
  await page.screenshot({ path: testInfo.outputPath("images-narrow.png"), fullPage: true });
  await expect(page.getByRole("link", { name: "새로 만들기", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation",{name:"주요 메뉴"}).getByText("더보기")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("opens an image-less saved draft from the gallery", async ({ page }) => {
  await loginAsOwner(page);
  const id = randomUUID();
  const topic = `사진 없는 게시물 ${id.slice(0, 8)}`;
  const draftFile = path.join(process.cwd(), ".superpowers/sdd/2026-09-22-owner-access/e2e-data/drafts", `${id}.json`);
  try {
    const created = await page.request.post("/api/drafts", { data: { id, status: "ready", topic, audience: "A", media_candidates: [], selected_media_id: null, copy: null, facts_to_verify: [], store_profile_version: "2026-09-10", created_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-24T00:00:00.000Z" } });
    expect(created.status()).toBe(201);
    await page.goto("/images");
    await page.locator(".image-gallery-card").filter({ hasText: topic }).getByRole("link", { name: "열기" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?draft=${id}$`));
    // 사진이 없는 게시물은 2단계(만들기)에서 연다.
    await expect(page.getByRole("heading", { name: "어떻게 만들까요?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "3 확인하고 올리기" })).toBeDisabled();
    await expect(page.getByText("고른 게시물을 찾지 못했어요. 내 게시물에서 다시 골라 주세요.")).toHaveCount(0);
  } finally {
    await rm(draftFile, { force: true });
  }
});
