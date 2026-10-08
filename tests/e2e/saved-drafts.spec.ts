import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loginAsOwner } from "./helpers";

test("opens the saved drafts screen without a Meta account", async ({ page }) => {
  await loginAsOwner(page);
  await page.goto("/drafts");
  await expect(page.getByRole("heading", { name:"내 게시물" })).toBeVisible();
  await expect(page.getByRole("link", { name:"새로 만들기", exact:true })).toBeVisible();
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
    // 올릴 날짜는 게시물 카드의 접힌 "올릴 날짜 · 반응 적기" 안에 있다.
    await page.locator(".draft-card").filter({hasText:topic}).getByText("올릴 날짜 · 반응 적기").click();
    const controls=page.getByRole("form",{name:`${topic} 예약 준비`});
    await controls.getByLabel("올릴 날짜와 시각").fill("2030-05-15T18:00");
    await controls.getByLabel("최종 확인 완료").check();
    await controls.getByRole("button",{name:"날짜 저장"}).click();
    await expect(controls.getByText("올릴 준비 끝")).toBeVisible();
    // 달력과 올릴 날짜 목록은 더보기 → 한 달 계획 화면에 모여 있다.
    await page.goto("/plan");
    const overview=page.getByRole("region",{name:"올릴 날짜"});
    const calendar=overview.locator('[aria-label="콘텐츠 캘린더"]');
    // 캘린더는 가장 가까운 예약 달부터 보여 준다. 다른 테스트가 더 이른 예약을 만들었을 수 있으니 2030년 5월까지 넘겨 본다.
    const heading=calendar.getByRole("heading",{level:3});
    const [shownYear,shownMonth]=((await heading.textContent())??"").match(/(\d+)년 (\d+)월/)!.slice(1).map(Number);
    const offset=(2030-shownYear)*12+(5-shownMonth);
    for(let i=0;i<Math.abs(offset);i++)await calendar.getByRole("button",{name:offset>0?"다음 달":"이전 달"}).click();
    await expect(heading).toHaveText("2030년 5월");
    await expect(calendar.getByRole("link",{name:new RegExp(topic)})).toBeVisible();
    await expect(overview.locator(".planning-list").getByRole("listitem").filter({hasText:topic}).getByText("최종 확인 완료")).toBeVisible();

    await page.goto("/drafts");
    await page.locator(".draft-card").filter({hasText:topic}).getByText("올릴 날짜 · 반응 적기").click();
    const restored=page.getByRole("form",{name:`${topic} 예약 준비`});
    await expect(restored.getByLabel("올릴 날짜와 시각")).toHaveValue("2030-05-15T18:00");
    await expect(restored.getByLabel("최종 확인 완료")).toBeChecked();
  } finally {
    await rm(draftFile,{force:true});
  }
});
