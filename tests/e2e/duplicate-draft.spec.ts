import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 지난 게시물 복제: 내 게시물에서 "복제해서 고치기" → 새 초안이 같은 사진·문안으로 열리고, 원본은 그대로 남는다.
test("duplicates a saved draft and opens the copy", async ({ page }) => {
  await loginAsOwner(page);
  const id=randomUUID(), mediaId=randomUUID();
  const topic=`복제 확인 ${id.slice(0,8)}`;
  const created=await page.request.post("/api/drafts",{data:{id,status:"ready",topic,audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"data:image/png;base64,iVBORw0KGgo=",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"작년에 반응 좋던 문안",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-22T00:00:00.000Z",updated_at:"2026-09-22T00:00:00.000Z"}});
  expect(created.status()).toBe(201);
  await page.goto("/drafts");
  await page.getByRole("button",{name:`${topic} 복제해서 고치기`}).click();
  await expect(page).toHaveURL(/\/\?draft=/);
  expect(new URL(page.url()).searchParams.get("draft")).not.toBe(id);
  await expect(page.getByRole("heading",{name:"확인하고 올리기"})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"올릴 글"})).toHaveValue("작년에 반응 좋던 문안");
  await page.goto("/drafts");
  await expect(page.locator(".draft-card").filter({hasText:topic})).toHaveCount(2);
});
