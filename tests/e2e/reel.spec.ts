import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 실제 사진 2장 → 사진 그대로 사용 → 문안 직접 입력 → 최종 화면에서 릴스 영상을 만들어 내려받기 링크가 생기는지 확인한다.
test("records a reel from the approved carousel on the review screen", async ({ page, browserName }) => {
  test.skip(browserName!=="chromium","MediaRecorder MP4 녹화는 크로미움으로 확인한다.");
  test.setTimeout(240_000);
  await loginAsOwner(page);
  await page.getByRole("button", { name: "이미지 선택" }).click();
  await page.getByRole("button", { name: "실제 사진 사용" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg"]);
  await page.getByRole("button", { name: "글자 없이 사진만 쓰기" }).click();
  await page.getByRole("button", { name: "문안 만들기" }).click();
  await page.getByLabel("게시물 문안").fill("홍어 한 점은 이렇게 드세요.\n\n얇게 썬 홍어 살의 결을 먼저 봐요.\n\n묵동에서 홍어를 알아볼 때 묵동홍어마을도 살펴보세요.\n\n프로필의 네이버 플레이스에서 메뉴를 확인해 보세요.\n\n#홍어 #묵동맛집 #묵동홍어마을");
  await page.getByRole("button", { name: "최종 화면 보기" }).click();
  await page.getByRole("button", { name: "릴스 영상 만들기" }).click();
  const download=page.getByRole("link", { name: /영상 받기/ });
  await expect(download).toBeVisible({ timeout: 120_000 });
  await expect(page.getByLabel("만든 릴스 미리보기")).toBeVisible();
});
