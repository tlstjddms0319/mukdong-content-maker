import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 한 달 계획 → 게시일 칸에서 만들기 → 사진 한 장으로 글 중심 게시물 만들기 → 계획표로 돌아오면 그 칸이 진행됨으로 바뀌고
// 올릴 날짜 목록에 그 날짜 18:00이 들어가 있는지 실제 서버로 확인한다(AI 키 없이 준비된 주제·문장으로 채워진다).
test("a post started from the month plan shows up on its plan date", async ({ page }, testInfo) => {
  // 계획·게시물 저장소를 데스크톱·휴대폰 실행이 함께 쓰므로 한 번만 돈다(휴대폰 화면은 mobile-layout에서 따로 본다).
  test.skip(testInfo.project.name!=="desktop","저장소를 공유해 한 기기 설정으로만 확인한다.");
  test.setTimeout(240_000);
  await loginAsOwner(page, "/plan");
  const planner=page.getByRole("region", { name: "한 달 계획" });
  // 다음 달을 계획한다(이번 달은 남은 게시일이 없을 수 있다).
  await planner.getByRole("group", { name: "계획할 달" }).getByRole("button").nth(1).click();
  await planner.getByRole("button", { name: /한 달 계획 만들기|다시 계획하기/ }).click();
  const first=planner.getByRole("listitem").first();
  await expect(first.getByRole("link", { name: "이 주제로 만들기" })).toBeVisible({ timeout: 60_000 });
  const title=(await first.locator("strong").textContent())!.trim();
  const href=await first.getByRole("link", { name: "이 주제로 만들기" }).getAttribute("href");
  const planDate=new URL(href!, "http://localhost").searchParams.get("planDate")!;
  await first.getByRole("link", { name: "이 주제로 만들기" }).click();

  await expect(page.getByText(/한 달 계획 · .* 18:00에 올릴 글/)).toBeVisible();
  await expect(page.getByLabel("직접 쓰기")).toHaveValue(title);
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: /글 중심/ }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/studio-hongeo.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(1, { timeout: 60_000 });
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "확인하고 올리기" })).toBeVisible({ timeout: 180_000 });

  await page.goto("/plan");
  await planner.getByRole("group", { name: "계획할 달" }).getByRole("button").nth(1).click();
  const row=planner.getByRole("listitem").filter({ hasText: title });
  await expect(row.getByText(/사진 저장됨|사진·글 완성/)).toBeVisible();
  const draftId=new URL((await row.getByRole("link", { name: "이어서 만들기" }).getAttribute("href"))!, "http://localhost").searchParams.get("draft")!;
  // 올릴 날짜 목록에 그 날짜(한국 시간 18:00)로 올라가 있다.
  const [year, month, day]=planDate.split("-").map(Number);
  await expect(page.locator(".planning-list > li").filter({ hasText: title })).toContainText(new RegExp(`${year}\\. ${month}\\. ${day}\\..*6:00`));
  // 다른 테스트의 계획 화면에 끼어들지 않도록 예약 시각을 비워 둔다.
  expect((await page.request.patch("/api/drafts", { data: { id: draftId, planned_publish_at: null, final_review_complete: false } })).ok()).toBe(true);
});
