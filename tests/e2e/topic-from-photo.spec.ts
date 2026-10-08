import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 사진으로 주제 정하기: 1단계에서 사진을 먼저 넣으면 사진에 보이는 것을 추천 요청에 실어 주제 3개를 다시 받고,
// 다음 단계(만들기)로 넘어가면 그 사진이 이 게시물의 사진으로 그대로 들어간다.
test("recommends topics from photos put in first, and carries the photos into making", async ({ page }, testInfo) => {
  const requests:Array<{photoNotes?:string[]}>=[];
  const make=(prefix:string)=>[1,2,3].map(n=>({id:`${prefix}-${n}`,title:`${prefix} 주제 ${n}일까?`,summary:"홍어무침 한 접시에서 시작하는 설명입니다. 충분히 긴 설명입니다.",reason:"이유",audience:"A",imageBrief:"사진",season:"",trend:""}));
  await page.route("**/api/topics",route=>{
    const input=route.request().postDataJSON();
    requests.push(input);
    return route.fulfill({json:{topics:make(input.photoNotes?.length?"사진":"기본"),source:"ai"}});
  });
  await loginAsOwner(page);
  await expect(page.locator(".topic-card")).toHaveCount(3);
  await page.getByLabel("주제용 사진 파일").setInputFiles(["assets/design/samples/studio-hongeo.jpg"]);
  await expect(page.getByRole("list",{name:"주제용 사진"}).getByRole("listitem")).toHaveCount(1,{timeout:60_000});
  await expect(page.getByLabel("직접 쓰기")).toHaveValue("사진 주제 1일까?",{timeout:60_000});
  await expect(page.getByText("넣은 사진을 보고 고른 주제예요.")).toBeVisible();
  // 사진을 못 읽어도(이 테스트는 AI 키 없음) 사진 이름이라도 실어 보낸다.
  expect(requests.at(-1)?.photoNotes?.length).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("topic-from-photo.png"),fullPage:true});
  await page.getByRole("button",{name:"다음"}).click();
  await expect(page.getByRole("list",{name:"고른 사진"}).getByRole("listitem")).toHaveCount(1);
});
