import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 게시물 고치기: 사진 두 장으로 만든 게시물의 확인 화면 → 더보기 → 장 고치기에서 장을 빼고, 새 글자 카드를 넣으면
// 장 번호를 다시 그린 뒤 저절로 다시 저장된다(실제 서버, AI 키 없이 동작).
test("removes and adds slides from the review screen's 더보기", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsOwner(page);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(2, { timeout: 60_000 });
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "확인하고 올리기" })).toBeVisible({ timeout: 180_000 });
  const thumbList=page.getByLabel("모든 장").getByRole("button");
  // 내용 5장 + 맨 뒤 가게 홍보 카드.
  const start=await thumbList.count();
  expect(start).toBe(6);
  await page.getByText("더보기", { exact: true }).last().click();

  // 첫 장은 뺄 수 없다.
  await expect(page.getByRole("button", { name: "1번 장 빼기" })).toBeDisabled();
  // 2번 장을 빼면 한 장 줄고, 나머지 장 번호를 다시 그린 뒤 저절로 다시 저장한다.
  await page.getByRole("button", { name: "다음 장" }).click();
  await page.getByRole("button", { name: "2번 장 빼기" }).click();
  await expect(thumbList).toHaveCount(start-1, { timeout: 60_000 });
  await expect(page.getByText("바뀐 사진을 저장했어요.")).toBeVisible({ timeout: 60_000 });

  // 새 글자 카드를 지금 장 뒤에 넣는다.
  await page.getByRole("button", { name: /번 장 뒤에 새 장 넣기/ }).click();
  await page.getByRole("button", { name: "글자 카드로" }).click();
  const form=page.locator(".deck-new-slide");
  await form.getByLabel(/^카드 제목/).fill("가기 전에 이것만 확인해요");
  await form.getByLabel(/^카드 짧은 글/).fill("처음이라면 덜 삭힌 걸로 주문해요");
  await page.locator(".deck-editor").screenshot({ path: `output/e2e-deck-editor-${test.info().project.name}.png` });
  await form.getByRole("button", { name: /번 장 뒤에 넣기/ }).click();
  await expect(thumbList).toHaveCount(start, { timeout: 60_000 });
  await expect(page.getByText("바뀐 사진을 저장했어요.")).toBeVisible({ timeout: 60_000 });
});
