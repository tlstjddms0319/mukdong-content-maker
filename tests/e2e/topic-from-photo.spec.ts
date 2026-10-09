import { expect, test, type Page } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 사진으로 주제 정하기: 1단계에서 사진을 먼저 넣으면 사진에 보이는 것을 추천 요청에 실어 주제 3개를 다시 받고,
// 다음 단계(만들기)로 넘어가면 그 사진이 이 게시물의 사진으로 그대로 들어간다.
const make=(prefix:string)=>[1,2,3].map(n=>({id:`${prefix}-${n}`,title:`${prefix} 주제 ${n}일까?`,summary:"홍어무침 한 접시에서 시작하는 설명입니다. 충분히 긴 설명입니다.",reason:"이유",audience:"A",imageBrief:"사진",season:"",trend:""}));
async function routeTopics(page:Page){
  const requests:Array<{photoNotes?:string[]}>=[];
  await page.route("**/api/topics",route=>{
    const input=route.request().postDataJSON();
    requests.push(input);
    return route.fulfill({json:{topics:make(input.photoNotes?.length?"사진":"기본"),source:"ai"}});
  });
  return requests;
}

test("recommends topics from photos put in first, and carries the photos into making", async ({ page }, testInfo) => {
  const requests=await routeTopics(page);
  // 사진 읽기(AI)가 된 경우: 사진마다 보이는 것 한 줄을 돌려준다.
  await page.route("**/api/images/analyze",async route=>{
    const ids=(route.request().postDataJSON().photos as Array<{id:string}>).map(photo=>photo.id);
    return route.fulfill({json:{analyzed:true,photos:ids.map(id=>({id,flags:[],labels:[],measured:false,wide:false,food:"홍어무침",mismatch:null,scene:"홍어무침 한 접시",appetite:null})),ranking:ids,recommended:null,scored:false,scoreAvailable:false}});
  });
  await loginAsOwner(page);
  await expect(page.locator(".topic-card")).toHaveCount(3);
  await page.getByLabel("주제용 사진 파일").setInputFiles(["assets/design/samples/studio-hongeo.jpg"]);
  await expect(page.getByRole("list",{name:"주제용 사진"}).getByRole("listitem")).toHaveCount(1,{timeout:60_000});
  await expect(page.getByLabel("직접 쓰기")).toHaveValue("사진 주제 1일까?",{timeout:60_000});
  await expect(page.getByText("넣은 사진을 보고 고른 주제예요.")).toBeVisible();
  expect(requests.at(-1)?.photoNotes).toEqual(["홍어무침 한 접시"]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("topic-from-photo.png"),fullPage:true});
  await page.getByRole("button",{name:"다음"}).click();
  await expect(page.getByRole("list",{name:"고른 사진"}).getByRole("listitem")).toHaveCount(1);
  // 사진은 이 게시물로 옮겼으니 이후 추천은 그 사진 기준이 아니다(검수 보고서 B-5).
  await page.getByRole("button",{name:"이전",exact:true}).click();
  const before=requests.length;
  await page.getByRole("button",{name:"다른 주제 보기"}).click();
  await expect.poll(()=>requests.length).toBeGreaterThan(before);
  expect(requests.at(-1)?.photoNotes).toBeUndefined();
});

// 사진을 못 읽었으면(이 테스트는 AI 키 없음) "IMG_…"·"studio-hongeo" 같은 파일 이름을 사진 내용인 척 보내지 않고, 그렇다고 알린다(B-7).
test("says so when the photo could not be read, instead of claiming photo-based topics", async ({ page }) => {
  const requests=await routeTopics(page);
  await loginAsOwner(page);
  await expect(page.locator(".topic-card")).toHaveCount(3);
  await page.getByLabel("주제용 사진 파일").setInputFiles(["assets/design/samples/studio-hongeo.jpg"]);
  await expect(page.getByRole("list",{name:"주제용 사진"}).getByRole("listitem")).toHaveCount(1,{timeout:60_000});
  await expect(page.getByText("사진에 무엇이 있는지 읽지 못해 평소처럼 추천했어요.",{exact:false})).toBeVisible({timeout:60_000});
  await expect(page.getByText("넣은 사진을 보고 고른 주제예요.")).toHaveCount(0);
  expect(requests.at(-1)?.photoNotes).toBeUndefined();
});
