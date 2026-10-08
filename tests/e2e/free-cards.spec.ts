import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import JSZip from "jszip";
import { loginAsOwner } from "./helpers";

test("edits three free card layouts, preserves the library and exports saved designs without AI",async({page},testInfo)=>{
  test.setTimeout(60_000);
  const paidRequests:string[]=[];
  page.on("request",request=>{if(/\/api\/images\/(generate|plan)$/.test(request.url()))paidRequests.push(request.url());});
  await page.route("**/api/images/generate",route=>route.abort());
  await page.route("**/api/images/plan",route=>route.abort());
  await loginAsOwner(page);
  // 글자 카드는 확인 화면의 더보기 안에 있다. 사진 한 장짜리 게시물을 만들어 두고 연다.
  const draftId=randomUUID(),mediaId=randomUUID();
  expect((await page.request.post("/api/drafts",{data:{id:draftId,status:"ready",topic:`글자 카드 확인 ${testInfo.project.name}`,audience:"A",media_candidates:[{id:mediaId,source:"photo",file_id:"data:image/png;base64,iVBORw0KGgo=",purpose:"instagram-primary"}],selected_media_id:mediaId,copy:null,caption:"처음 글",facts_to_verify:[],store_profile_version:"2026-09-10",created_at:"2026-09-22T00:00:00.000Z",updated_at:"2026-09-22T00:00:00.000Z"}})).status()).toBe(201);
  await page.goto(`/?draft=${draftId}`);
  await expect(page.getByRole("heading",{name:"확인하고 올리기"})).toBeVisible();
  await page.getByText("더보기",{exact:true}).last().click();
  await page.getByText("글자 카드로 직접 만들기").click();
  await page.getByRole("button",{name:"글자형",exact:true}).click();
  await page.getByLabel("짧은 설명 (선택)").fill("함께 먹는 재료를 하나씩 살펴보면, 익숙한 한입도 다르게 느껴질 수 있어요.");

  const compose=async(label:string)=>{
    const pending=page.waitForResponse(response=>response.url().endsWith("/api/images/compose")&&response.request().method()==="POST");
    await page.getByRole("button",{name:"카드 미리보기 만들기"}).click();
    const response=await pending;expect(response.status()).toBe(200);
    const {card}=await response.json();
    await expect(page.getByRole("button",{name:"이 카드 추가"})).toBeVisible();
    await writeFile(testInfo.outputPath(`${label}.jpg`),Buffer.from(card.preview.split(",")[1],"base64"));
    await page.screenshot({path:testInfo.outputPath(`${label}-editor.png`),fullPage:true});
    await page.getByRole("button",{name:"이 카드 추가"}).click();
    return card;
  };
  const textCard=await compose("text");expect(textCard).toMatchObject({source:"design",layout:"text"});
  await page.getByText("보관함에 사진 등록하기",{exact:true}).click();
  const names=[`수육 자료 ${testInfo.project.name}`,`김치 자료 ${testInfo.project.name}`];
  for(let i=0;i<2;i++){
    const bytes=await sharp({create:{width:700,height:600,channels:3,background:i?"#be6548":"#c7bda9"}}).png().toBuffer();
    await page.getByLabel("보관할 사진 파일").setInputFiles({name:`fixture-${i}.png`,mimeType:"image/png",buffer:bytes});
    await page.getByLabel("사진 이름",{exact:true}).fill(names[i]);
    await page.getByLabel("사진 검색어").fill(i?"김치, 삼합":"수육, 삼합");
    await page.getByLabel("사진 구분").selectOption("illustration");
    await page.getByLabel("원본 출처").fill("로컬 테스트용 단색 이미지");
    await page.getByRole("button",{name:"사진 등록",exact:true}).click();
    await expect(page.getByText("사진을 보관함에 등록했어요. 다음 게시물에서도 사용할 수 있어요.")).toBeVisible();
    await expect(page.getByLabel("사진 이름",{exact:true})).toHaveValue("");
  }
  await page.getByRole("button",{name:"사진형",exact:true}).click();
  const photoCard=await compose("photo");expect(photoCard).toMatchObject({source:"design",layout:"photo"});
  await page.getByRole("button",{name:"비교형",exact:true}).click();
  await page.locator(".asset-card").filter({hasText:names[0]}).click();
  const compared=await compose("compare");expect(compared).toMatchObject({source:"design",layout:"compare"});
  expect(compared.assetIds).toHaveLength(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

  // The wizard only checks response.ok and never reads the echoed draft (~350KB of card previews), so Chromium
  // never marks that response finished and response.json() would hang. Read the request payload and the persisted draft instead.
  const saveRequest=page.waitForRequest(request=>request.url().endsWith("/api/drafts")&&request.method()==="POST");
  await page.getByRole("button",{name:"카드 3장 사용"}).click();
  const sent=await saveRequest;
  expect((await sent.response())?.status()).toBe(201);
  await expect(page.getByText("바뀐 사진을 저장했어요.")).toBeVisible();
  await expect(page.getByLabel("모든 장").getByRole("button")).toHaveCount(3);
  const saved=await (await page.request.get(`/api/drafts?id=${encodeURIComponent(sent.postDataJSON().id)}`)).json();
  expect(saved.media_candidates.map((media:{source:string})=>media.source)).toEqual(["design","design","design"]);
  expect(saved.selected_media_ids).toHaveLength(3);
  const caption="수육에는 왜 김치를 곁들일까?\n\n함께 먹는 재료의 맛과 식감을 살펴보세요.\n\n묵동홍어마을의 메뉴도 확인해 보세요.";
  expect((await page.request.patch("/api/drafts",{data:{id:saved.id,caption}})).status()).toBe(200);
  await page.goto(`/?draft=${saved.id}`);
  await expect(page.getByText("1 / 3",{exact:true})).toBeVisible();
  await page.getByText("더보기",{exact:true}).last().click();
  await page.getByText("파일로 받기 · # 태그 · 음악").click();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"전체 묶음 받기"}).click();
  const download=await downloadPromise,stream=await download.createReadStream();
  const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const zip=await JSZip.loadAsync(Buffer.concat(chunks));
  expect(JSON.parse(await zip.file("metadata.json")!.async("string")).slides.map((slide:{source:string})=>slide.source)).toEqual(["design","design","design"]);
  expect(await zip.file("caption.txt")!.async("string")).toBe(caption);
  // 다시 열어도 보관한 사진은 글자 카드 화면에 그대로 있다.
  await page.getByText("글자 카드로 직접 만들기").click();
  await expect(page.locator(".asset-card").filter({hasText:names[0]})).toBeVisible();
  expect(paidRequests).toEqual([]);
});
