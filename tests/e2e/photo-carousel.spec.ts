import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 실제 사진 여러 장 → 캐러셀 만들기 → 장 사진 바꾸기 → 사용까지 실제 서버로 확인한다(AI 키 없이 기본 구성안으로 동작).

test("builds a carousel from several real photos", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsOwner(page);
  await page.getByRole("button", { name: "이미지 선택" }).click();
  await page.getByRole("button", { name: "실제 사진 사용" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg","assets/design/samples/table-topdown.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(3, { timeout: 60_000 });
  await page.getByRole("button", { name: /사진 3장으로 .*캐러셀 만들기/ }).click();
  await expect(page.getByRole("button", { name: "이 캐러셀 사용" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "다음 슬라이드" }).click();
  await page.getByRole("button", { name: "3번 사진으로 바꾸기" }).click();
  await expect(page.getByRole("button", { name: "3번 사진으로 바꾸기" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  // 이 장 글자 직접 고치기: 제목만 바꿔 그 장을 다시 그린다(이미지 AI 없음).
  const preview=page.getByRole("img", { name: "사진 캐러셀 미리보기" });
  const before=await preview.getAttribute("style");
  await page.getByText("2번 장 글자 고치기 (무료)").click();
  await page.getByLabel(/^카드 제목/).fill("직접 고친 두 번째 장 제목");
  await page.getByRole("button", { name: "글자만 다시 그리기" }).click();
  await expect.poll(async () => preview.getAttribute("style"), { timeout: 30_000 }).not.toBe(before);
  await expect(page.getByLabel(/^카드 제목/)).toHaveValue("직접 고친 두 번째 장 제목");
  await page.getByRole("button", { name: "이 캐러셀 사용" }).click();
  await expect(page.getByText(/선택한 이미지 \d+장이 저장되어 있어요/)).toBeVisible();
});
