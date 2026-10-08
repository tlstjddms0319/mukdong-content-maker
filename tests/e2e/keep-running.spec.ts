import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Route } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 만드는 중인 게시물을 소리 없이 잃지 않기: 만드는 동안 내 게시물에서 다른 게시물을 열면 먼저 묻고,
// "취소"면 만들기가 이어지며 "만들기" 메뉴가 진행 화면으로 데려간다. "확인"이면 고른 게시물이 열린다.
const STOP="지금 만드는 게시물이 있어요. 그만두고 새로 시작할까요?";

test("asks before leaving a post that is still being made", async ({ page }) => {
  await loginAsOwner(page);
  const id=randomUUID(), mediaId=randomUUID();
  const topic=`이어 만들기 확인 ${id.slice(0,8)}`;
  const draftFile=path.join(process.cwd(),".superpowers/sdd/2026-09-22-owner-access/e2e-data/drafts",`${id}.json`);
  const held:Route[]=[];
  try{
    expect((await page.request.post("/api/drafts",{data:{id,status:"ready",topic,audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"data:image/png;base64,iVBORw0KGgo=",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"전에 만든 글",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-22T00:00:00.000Z",updated_at:"2026-09-22T00:00:00.000Z"}})).status()).toBe(201);
    // 구성안 요청을 붙잡아 두어 "만들고 있어요"에 머물게 한다.
    await page.route("**/api/images/plan",route=>{held.push(route);});
    await page.getByRole("button",{name:"다음"}).click();
    await page.getByRole("button",{name:"만들기",exact:true}).click();
    await expect(page.getByRole("heading",{name:"만들고 있어요"})).toBeVisible();
    const nav=page.getByRole("navigation",{name:"주요 메뉴"});
    await expect(nav.getByText(/만드는 중/)).toBeVisible();

    // 내 게시물 → 다른 게시물 열기 → 취소: 이 화면에 그대로 있고 만들기도 이어진다.
    await nav.getByRole("link",{name:"내 게시물"}).click();
    await expect(page.getByRole("heading",{name:"내 게시물"})).toBeVisible();
    const card=page.locator(".draft-card").filter({hasText:topic});
    page.once("dialog",dialog=>{expect(dialog.message()).toBe(STOP);void dialog.dismiss();});
    await card.getByRole("link",{name:`${topic} 열기`}).click();
    await expect(page).toHaveURL(/\/drafts$/);
    await expect(nav.getByText(/만드는 중/)).toBeVisible();

    // "만들기" 메뉴는 진행 화면으로 데려간다.
    await nav.getByRole("link",{name:"만들기"}).click();
    await expect(page.getByRole("heading",{name:"만들고 있어요"})).toBeVisible();

    // 다시 내 게시물에서 열기 → 확인: 만들던 것을 멈추고 고른 게시물이 열린다.
    await nav.getByRole("link",{name:"내 게시물"}).click();
    page.once("dialog",dialog=>void dialog.accept());
    await page.locator(".draft-card").filter({hasText:topic}).getByRole("link",{name:`${topic} 열기`}).click();
    await expect(page.getByRole("heading",{name:"확인하고 올리기"})).toBeVisible();
    await expect(page.getByRole("textbox",{name:"올릴 글"})).toHaveValue("전에 만든 글");
    await expect(nav.getByText(/만드는 중/)).toHaveCount(0);
  }finally{
    await page.unrouteAll({behavior:"ignoreErrors"});
    await rm(draftFile,{force:true});
  }
});
