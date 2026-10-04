import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 한 달 기획 → 게시일 칸에서 초안 시작 → 사진 저장 → 기획표로 돌아오면 그 칸이 "이미지 저장됨"이 되고
// 게시 계획에 그 날짜 18:00이 들어가 있는지 실제 서버로 확인한다(AI 키 없이 준비된 주제로 채워진다).
test("a draft started from the month plan shows up on its plan date", async ({ page }, testInfo) => {
  // 기획·초안 저장소를 데스크톱·휴대폰 실행이 함께 쓰므로 한 번만 돈다(휴대폰 화면은 mobile-layout에서 따로 본다).
  test.skip(testInfo.project.name!=="desktop","저장소를 공유해 한 기기 설정으로만 확인한다.");
  test.setTimeout(180_000);
  await loginAsOwner(page, "/drafts");
  const planner=page.getByRole("region", { name: "한 달 콘텐츠 기획" });
  // 다음 달을 기획한다(이번 달은 남은 게시일이 없을 수 있다).
  await planner.getByRole("group", { name: "기획할 달" }).getByRole("button").nth(1).click();
  await planner.getByRole("button", { name: /한 달 기획 만들기|다시 기획하기/ }).click();
  const first=planner.getByRole("listitem").first();
  await expect(first.getByRole("link", { name: "이 주제로 초안 시작" })).toBeVisible({ timeout: 60_000 });
  const title=(await first.locator("strong").textContent())!.trim();
  const href=await first.getByRole("link", { name: "이 주제로 초안 시작" }).getAttribute("href");
  const planDate=new URL(href!, "http://localhost").searchParams.get("planDate")!;
  await first.getByRole("link", { name: "이 주제로 초안 시작" }).click();

  await expect(page.getByText(/한 달 기획 · .* 18:00 게시 예정 · 추천 계열/)).toBeVisible();
  await expect(page.getByLabel("직접 주제를 적고 싶다면")).toHaveValue(title);
  await page.getByRole("button", { name: "이미지 선택" }).click();
  await page.getByRole("button", { name: "실제 사진 사용" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/studio-hongeo.jpg"]);
  await page.getByRole("button", { name: "글자 없이 사진만 쓰기" }).click();
  await expect(page.getByText(/이미지 1장을 저장했어요/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/drafts");
  await planner.getByRole("group", { name: "기획할 달" }).getByRole("button").nth(1).click();
  const row=planner.getByRole("listitem").filter({ hasText: title });
  await expect(row.getByText("이미지 저장됨")).toBeVisible();
  const draftId=new URL((await row.getByRole("link", { name: "이어서 만들기" }).getAttribute("href"))!, "http://localhost").searchParams.get("draft")!;
  // 게시 계획 목록에 그 날짜(한국 시간 18:00)로 올라가 있다.
  const [year, month, day]=planDate.split("-").map(Number);
  await expect(page.locator(".planning-list > li").filter({ hasText: title })).toContainText(new RegExp(`${year}\\. ${month}\\. ${day}\\..*6:00`));
  // 다른 테스트의 게시 계획 화면에 끼어들지 않도록 예약 시각을 비워 둔다.
  expect((await page.request.patch("/api/drafts", { data: { id: draftId, planned_publish_at: null, final_review_complete: false } })).ok()).toBe(true);
});
