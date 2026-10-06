import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 초안 고치기: 완성된 사진 캐러셀에서 장을 빼고, 새 글자 카드를 넣은 뒤 사용까지 실제 서버로 확인한다(AI 키 없이 동작).
test("removes and adds slides in a finished carousel", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsOwner(page);
  await page.getByRole("button", { name: "이미지 선택" }).click();
  await page.getByRole("button", { name: "실제 사진 사용" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(2, { timeout: 60_000 });
  await page.getByRole("button", { name: /사진 2장으로 .*캐러셀 만들기/ }).click();
  await expect(page.getByRole("button", { name: "이 캐러셀 사용" })).toBeVisible({ timeout: 120_000 });
  const thumbList=page.getByLabel("만든 슬라이드 목록").getByRole("button");
  const start=await thumbList.count();
  expect(start).toBeGreaterThanOrEqual(3);

  // 표지는 뺄 수 없다.
  await expect(page.getByRole("button", { name: "1번 장 빼기" })).toBeDisabled();
  // 2번 장을 빼면 한 장 줄고, 나머지 장 번호를 다시 그린 뒤 다시 쓸 수 있게 된다.
  await page.getByRole("button", { name: "다음 슬라이드" }).click();
  await page.getByRole("button", { name: "2번 장 빼기" }).click();
  await expect(thumbList).toHaveCount(start-1, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "이 캐러셀 사용" })).toBeEnabled({ timeout: 60_000 });

  // 새 글자 카드를 지금 장 뒤에 넣는다.
  await page.getByRole("button", { name: /번 장 뒤에 새 장 넣기/ }).click();
  await page.getByRole("button", { name: "글자 카드로" }).click();
  const form=page.locator(".deck-new-slide");
  await form.getByLabel(/^카드 제목/).fill("가기 전에 이것만 확인해요");
  await form.getByLabel(/^카드 요점/).fill("처음이라면 덜 삭힌 걸로 주문해요");
  await page.locator(".deck-editor").screenshot({ path: `output/e2e-deck-editor-${test.info().project.name}.png` });
  await form.getByRole("button", { name: /번 장 뒤에 넣기/ }).click();
  await expect(thumbList).toHaveCount(start, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "이 캐러셀 사용" })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "이 캐러셀 사용" }).click();
  await expect(page.getByText(`선택한 이미지 ${start}장이 저장되어 있어요.`)).toBeVisible();
});
