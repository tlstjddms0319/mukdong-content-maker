import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loginAsOwner } from "./helpers";

test("opens the saved drafts screen without a Meta account", async ({ page }) => {
  await loginAsOwner(page);
  await page.goto("/drafts");
  await expect(page.getByRole("heading", { name:"내 초안" })).toBeVisible();
  await expect(page.getByRole("link", { name:"새 초안 만들기" })).toBeVisible();
});

test("keeps a planned time and final-review mark after reopening saved drafts", async ({ page }) => {
  await loginAsOwner(page);
  const id=randomUUID();
  const mediaId=randomUUID();
  const topic=`예약 확인 ${id.slice(0,8)}`;
  const draftFile=path.join(process.cwd(),".superpowers/sdd/2026-09-22-owner-access/e2e-data/drafts",`${id}.json`);
  try {
    const created=await page.request.post("/api/drafts",{data:{id,status:"ready",topic,audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"data:image/png;base64,iVBORw0KGgo=",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"게시할 소개 문안",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-22T00:00:00.000Z",updated_at:"2026-09-22T00:00:00.000Z"}});
    expect(created.status()).toBe(201);
    await page.goto("/drafts");
    const controls=page.getByRole("form",{name:`${topic} 예약 준비`});
    await controls.getByLabel("게시 희망일시 (한국시간)").fill("2030-05-15T18:00");
    await controls.getByLabel("최종 확인 완료").check();
    await controls.getByRole("button",{name:"예약 준비 저장"}).click();
    await expect(controls.getByText("게시 준비 완료")).toBeVisible();
    const overview=page.getByRole("region",{name:"게시 계획"});
    const calendar=overview.locator('[aria-label="콘텐츠 캘린더"]');
    await expect(calendar.getByRole("link",{name:new RegExp(topic)})).toBeVisible();
    await expect(overview.locator(".planning-list").getByRole("listitem").filter({hasText:topic}).getByText("최종 확인 완료")).toBeVisible();

    await page.reload();
    const restored=page.getByRole("form",{name:`${topic} 예약 준비`});
    await expect(restored.getByLabel("게시 희망일시 (한국시간)")).toHaveValue("2030-05-15T18:00");
    await expect(restored.getByLabel("최종 확인 완료")).toBeChecked();
  } finally {
    await rm(draftFile,{force:true});
  }
});
