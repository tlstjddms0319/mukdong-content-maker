import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 사장님 사진 여러 장 → 사진 중심으로 만들기 → 확인 화면의 장 고치기: 그림(다른 사진으로) → 글(글자 직접 고치기)까지
// 실제 서버로 확인한다(AI 키 없이 기본 구성안으로 동작). 고친 장은 저절로 다시 저장된다.
test("builds a photo-focus post from several owner photos and fixes one slide", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsOwner(page);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg","assets/design/samples/table-topdown.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(3, { timeout: 60_000 });
  // 사진이 5장보다 적으면 모자란 장은 AI가 사진을 참고해 그린다고 알린다(AI 키가 없는 이 테스트에서는 확대 사진으로 그려진다).
  await expect(page.getByText("사진이 모자란 장은 AI가 올린 사진을 참고해 글에 맞는 장면으로 새로 그려요. 3~5분쯤 걸려요.")).toBeVisible();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "확인하고 올리기" })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByLabel("모든 장").getByRole("button")).toHaveCount(6);

  // 2번째 장: 다른 사진으로 다시 만들기.
  await page.getByRole("button", { name: "2번째 장 보기" }).click();
  const thumb=page.getByRole("button", { name: "2번째 장 보기" });
  const before=await thumb.getAttribute("style");
  await page.getByText("2번 장 고치기").click();
  // 사장님 사진 장은 그림을 고르면 다른 사진으로 바꾼다.
  await page.getByRole("button", { name: "다른 사진으로 바꾸기" }).click();
  await expect.poll(async () => thumb.getAttribute("style"), { timeout: 60_000 }).not.toBe(before);
  await expect(page.getByText("바뀐 사진을 저장했어요.")).toBeVisible({ timeout: 60_000 });

  // 장 고치기 → 글 → 글자 직접 고치기: 제목만 바꿔 그 장을 다시 그린다(이미지 AI 없음).
  const drawn=await thumb.getAttribute("style");
  await page.getByRole("button", { name: "글", exact: true }).click();
  await page.getByText("글자 직접 고치기 (무료)").click();
  await page.getByLabel(/^카드 제목/).fill("직접 고친 두 번째 장");
  await page.getByRole("button", { name: "글자만 다시 그리기" }).click();
  await expect.poll(async () => thumb.getAttribute("style"), { timeout: 60_000 }).not.toBe(drawn);
  await expect(page.getByLabel(/^카드 제목/)).toHaveValue("직접 고친 두 번째 장");
});
