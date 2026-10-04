import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

test("settings explains AI connection without exposing a key", async ({ page }) => {
  await loginAsOwner(page);
  await page.route("**/api/settings",route=>route.fulfill({json:{saved:true}}));
  await page.goto("/settings");
  await expect(page.getByText(/Gemini (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByText(/OpenAI (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByText(/Groq (키 설정됨|키 필요)/)).toBeVisible();
  await expect(page.getByLabel("문안 AI")).toHaveValue("automatic");
  await expect(page.getByText(/실시간 검색 트렌드 연결은 후속 단계/)).toBeVisible();
  await expect(page.getByLabel("문안 길이")).toBeVisible();
  await expect(page.getByLabel("OpenAI 이미지 품질")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sk-");
  await page.getByRole("button", { name:"설정 저장" }).click();
  await expect(page.getByRole("status").filter({hasText:"저장했어요."})).toHaveText("저장했어요.");
});

test("AI connection check runs on the server and shows each provider without keys", async ({ page }) => {
  await loginAsOwner(page);
  await page.goto("/settings");
  const card=page.getByRole("region",{name:"AI 연결 실제 점검"});
  await card.getByRole("button",{name:"AI 연결 점검하기"}).click();
  // 테스트 서버에는 키가 없으므로 모두 "건너뜀"이고, 키를 넣으라는 안내가 나온다.
  await expect(card.getByRole("status")).toHaveText(/설정된 AI 키가 없어요/);
  for(const label of ["문안 AI · Gemini","문안 AI · Groq","문안 AI · Cloudflare","표지 점검 · Gemini 이미지 보기","이미지 AI · Higgsfield","이미지 AI · OpenAI"])await expect(card.getByText(`${label} · 건너뜀`)).toBeVisible();
});
