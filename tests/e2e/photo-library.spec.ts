import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 사진 보관함: 이미지 모음에서 사진에 메뉴 검색어를 달고 → 만들기 2단계의 "전에 올린 사진에서 고르기"에서 그 검색어로 찾아 넣고 →
// 다시 보관함에서 빼면 목록에서 사라진다.
test("tags, finds and removes a library photo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name!=="desktop","사진 보관함은 저장소를 공유해 한 기기 설정으로만 확인한다.");
  test.setTimeout(120_000);
  await loginAsOwner(page, "/images");
  const name=`보관함 확인 ${randomUUID().slice(0,6)}`;
  const tag=`삼합${randomUUID().slice(0,4)}`;
  const uploaded=await page.request.post("/api/images/assets",{multipart:{file:{name:"a.jpg",mimeType:"image/jpeg",buffer:await readFile("assets/design/samples/studio-hongeo.jpg")},name,tags:"매장 사진",kind:"photo",credit:"직접 촬영"}});
  expect(uploaded.status()).toBe(201);

  await page.reload();
  const manager=page.getByRole("region",{name:"사진 보관함 관리"});
  const card=manager.getByRole("listitem",{name});
  await expect(card).toBeVisible();
  await expect(card.getByText(/아직 안 씀/)).toBeVisible();
  await card.getByLabel(/검색어/).fill(`매장 사진, ${tag}`);
  await card.getByRole("button",{name:"저장"}).click();
  await expect(card.getByText("저장했어요.")).toBeVisible();

  // 새로 만들기 → 2단계 → 전에 올린 사진에서 검색어로 찾기
  await page.goto("/?new=1");
  await page.getByRole("button",{name:"다음"}).click();
  await page.getByRole("button",{name:"전에 올린 사진에서 고르기"}).click();
  await page.getByPlaceholder(/메뉴 이름·검색어로 찾기/).fill(tag);
  await expect(page.getByText("찾은 사진 1장")).toBeVisible();
  await page.getByRole("button",{name:new RegExp(`${name} 추가`)}).click();
  await expect(page.getByRole("list",{name:"고른 사진"}).getByRole("listitem")).toHaveCount(1);

  // 보관함에서 빼기(확인 창 승인)
  await page.goto("/images");
  page.once("dialog",dialog=>void dialog.accept());
  await manager.getByRole("listitem",{name}).getByRole("button",{name:"보관함에서 빼기"}).click();
  await expect(manager.getByRole("listitem",{name})).toHaveCount(0);
});
