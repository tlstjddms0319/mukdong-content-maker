import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

const topic = "비 오는 날, 막걸리와 홍어";
const imageBrief = "창가의 빗빛과 따뜻한 나무 식탁";
const contentBrief = "비 오는 날 떠오르는 음식의 기억에서 시작해 홍어와 곁들임의 취향 이야기로 연결한다.";
const roles = ["cover", "detail", "how-to", "pairing", "visit"] as const;
const dataUrl = (value: number) => {
  const color=["#1f5a43", "#9e5143", "#75613f", "#35596d", "#6a456f"][value % 5];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${color}"/><circle cx="540" cy="560" r="310" fill="#f4ede2" fill-opacity=".9"/><path d="M290 780c150-190 350-190 500 0" fill="none" stroke="${color}" stroke-width="70" stroke-linecap="round"/><text x="540" y="1120" fill="#fff" font-family="Arial, sans-serif" font-size="120" font-weight="700" text-anchor="middle">Slide ${value}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

test("creates, saves, previews, and exports a five-slide carousel without live providers", async ({ page }, testInfo) => {
  const planRequests: Array<Record<string, unknown>> = [];
  const generationRequests: Array<Record<string, unknown>> = [];
  const draftRequests: Array<Record<string, unknown>> = [];
  const copyRequests: Array<Record<string, unknown>> = [];

  await page.route("**/api/topics", route => route.fulfill({ json: { topics: [
    { id:"rain", title:topic, summary:contentBrief, reason:"비 오는 날의 식탁 분위기를 소개해요.", audience:"A", imageBrief },
    { id:"first", title:"처음 먹는 홍어의 한 점", summary:"", reason:"처음 손님에게 쉬운 순서를 보여 줘요.", audience:"B", imageBrief:"한 점을 만드는 손동작" },
    { id:"table", title:"오늘 모임을 위한 홍어 상차림", summary:"", reason:"함께 먹는 분위기를 전해요.", audience:"C", imageBrief:"따뜻한 모임 식탁" },
  ] } }));
  await page.route("**/api/images/plan", async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    planRequests.push(request);
    await route.fulfill({ json: { plan: {
      slideCount:5,
      styleAnchor:"따뜻한 자연광, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트",
      slides:roles.map((role, index) => ({
        role,
        headline:["비 오는 날 한 점", "결과 윤기를 가까이", "한 점을 만드는 순간", "막걸리와 좋은 조합", "오늘 한 상 어때요?"][index],
        visualPrompt:["완성된 홍어 한 상을 정면에서 담은 히어로 음식 사진", "홍어의 결, 윤기와 곁들임을 가까이 담은 음식 사진", "젓가락으로 한 점을 만드는 손동작 음식 사진", "막걸리와 홍어를 대각선 구도로 담은 음식 사진", "따뜻한 식탁 위 완성 상차림을 담은 방문 유도 음식 사진"][index],
        textPosition:index % 2 === 0 ? "top" : "bottom",
      })),
    }, provider:"gemini" } });
  });
  await page.route("**/api/images/generate", async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    generationRequests.push(request);
    const count = request.count;
    const slideIndex = Number(request.slideIndex);
    await route.fulfill({ json: { images: count === 2 ? [dataUrl(1), dataUrl(2)] : [dataUrl(slideIndex + 10)], source:"ai-generated" } });
  });
  await page.route("**/api/drafts", async route => {
    if (route.request().method() === "POST") draftRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { saved:true } });
  });
  await page.route("**/api/copy", route => {
    copyRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: {
      topic, audience:"A", hook:"비 오는 날에는 홍어 한 점과 막걸리", information:"한 점씩 천천히 즐겨 보세요.", store_connection:"묵동홍어마을의 메뉴도 살펴보세요.", call_to_action:"프로필의 네이버 플레이스에서 메뉴를 확인해 보세요.", hashtags:["#묵동맛집","#홍어","#묵동홍어마을"], facts_used:[], facts_to_verify:["사진 속 메뉴의 현재 판매 여부를 확인해 주세요."], image_disclosure:"AI 연출 이미지가 포함되어 있으며 실제 메뉴와 다를 수 있습니다.", _meta:{ provider:"gemini" },
    } });
  });
  await page.route("**/api/instagram/status", route => route.fulfill({ json: { connected:false } }));

  await loginAsOwner(page);
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(topic) }).click();
  await page.getByRole("button", { name:"이미지 선택" }).click();
  await page.getByRole("button", { name:"AI 이미지 생성" }).click();
  await page.getByRole("button", { name:"표지 후보 2장 만들기" }).click();

  await expect(page.getByRole("button", { name:"표지 후보 1 선택" })).toBeVisible();
  await expect(page.getByRole("button", { name:"표지 후보 2 선택" })).toBeVisible();
  expect(planRequests).toHaveLength(1);
  expect(planRequests[0]).toMatchObject({ topic, imageBrief, slideCount:5 });
  expect(generationRequests[0]).toMatchObject({ topic, imageBrief, count:2, slideIndex:1, slide:{ role:"cover" } });

  const coverGrid = page.locator(".candidate-grid");
  const candidateOne = page.getByRole("button", { name:"표지 후보 1 선택" });
  const candidateTwo = page.getByRole("button", { name:"표지 후보 2 선택" });
  const gridBox = await coverGrid.boundingBox();
  const firstBox = await candidateOne.boundingBox();
  const secondBox = await candidateTwo.boundingBox();
  expect(gridBox).not.toBeNull();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (testInfo.project.name === "desktop") {
    expect(Math.abs((firstBox?.y ?? 0) - (secondBox?.y ?? 0))).toBeLessThan(2);
    expect((firstBox?.width ?? 0) * 2).toBeGreaterThan((gridBox?.width ?? 0) * 0.9);
  } else {
    expect((secondBox?.y ?? 0) - (firstBox?.y ?? 0)).toBeGreaterThan(20);
  }

  await candidateTwo.click();
  await page.getByRole("button", { name:"이 표지로 5장 완성하기" }).click();
  await expect(page.getByText("5/5장 완성")).toBeVisible();
  expect(generationRequests.map(request => (request.slide as { role:string }).role)).toEqual(roles);

  const expectedSlides=[dataUrl(2), dataUrl(12), dataUrl(13), dataUrl(14), dataUrl(15)];
  const generatedPreview=page.getByLabel("생성된 캐러셀 미리보기");
  const generatedThumbnails=page.getByRole("button", { name:/생성된 슬라이드 [1-5] 보기/ });
  await expect(generatedThumbnails).toHaveCount(5);
  expect(await generatedThumbnails.evaluateAll(elements=>elements.map(element=>(element as HTMLElement).style.backgroundImage))).toEqual(expectedSlides.map(url=>`url("${url}")`));
  await expect(page.getByText("1 / 5")).toBeVisible();
  const previewBox=await generatedPreview.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs((previewBox?.width ?? 0)/(previewBox?.height ?? 1)-0.8)).toBeLessThan(0.02);
  await page.getByRole("button", { name:"생성된 슬라이드 4 보기" }).click();
  await expect(page.getByText("4 / 5")).toBeVisible();
  await expect(generatedPreview).toHaveCSS("background-image", new RegExp(dataUrl(14).replace(/[+?^${}()|[\]\\]/g, "\\$&")));
  await page.getByLabel("이 장의 수정 요청").fill("배경은 차분하게, 음식 질감은 선명하게");
  await page.getByRole("button", {name:"이 장만 다시 만들기"}).click();
  await expect(page.getByRole("button", {name:"이 캐러셀 사용"})).toBeEnabled();
  expect(generationRequests.at(-1)).toMatchObject({slideIndex:4,refinement:"배경은 차분하게, 음식 질감은 선명하게"});
  await page.getByRole("button", {name:"생성된 슬라이드 3 보기"}).click();
  await expect(page.getByLabel("이 장의 수정 요청")).toHaveValue("");
  expect(draftRequests).toHaveLength(0);
  const copyStepButton=page.getByRole("button", { name:"문안 만들기" });
  await expect(copyStepButton).toBeDisabled();
  await expect(copyStepButton).toHaveCSS("opacity", "0.45");
  await page.screenshot({ path:testInfo.outputPath(`${testInfo.project.name}-generated-carousel.png`), fullPage:true });

  await page.getByRole("button", { name:"이 캐러셀 사용" }).click();
  await expect(page.getByText("이미지 5장을 저장했어요.")).toBeVisible();
  expect(draftRequests).toHaveLength(1);
  expect(draftRequests[0].image_brief).toBe(imageBrief);
  expect(draftRequests[0].content_brief).toBe(contentBrief);
  const saved = draftRequests[0] as { media_candidates:Array<{ id:string; purpose:string; file_id:string }>; selected_media_ids:string[]; selected_media_id:string };
  expect(saved.media_candidates).toHaveLength(5);
  expect(saved.selected_media_ids).toEqual(saved.media_candidates.map(media => media.id));
  expect(saved.selected_media_id).toBe(saved.selected_media_ids[0]);
  expect(saved.media_candidates.map(media => media.purpose)).toEqual(roles.map(role => `instagram-${role}`));
  expect(saved.media_candidates.map(media => media.file_id)).toEqual(expectedSlides);

  await page.getByRole("button", { name:"문안 만들기" }).click();
  await expect(page.getByLabel("게시물 문안")).toHaveValue(/AI 연출 이미지/);
  await expect(page.getByText("사진 속 메뉴의 현재 판매 여부를 확인해 주세요.")).toBeVisible();
  expect(copyRequests[0]).toMatchObject({topic,contentBrief,imageBrief,hasAiImages:true});
  await page.screenshot({path:testInfo.outputPath(`${testInfo.project.name}-copy-quality.png`),fullPage:true});
  await page.getByRole("button", { name:"최종 화면 보기" }).click();
  await expect(page.getByText("게시하기 전에")).toBeVisible();
  await expect(page.getByText("1 / 5")).toBeVisible();
  await expect(page.getByRole("button", { name:/슬라이드 [1-5] 보기/ })).toHaveCount(5);
  await expect(page.getByLabel("피드 대표 이미지")).toHaveCSS("background-image", new RegExp(dataUrl(2).replace(/[+?^${}()|[\]\\]/g, "\\$&")));
  await page.getByRole("button", { name:"슬라이드 5 보기" }).click();
  await expect(page.getByText("5 / 5")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name:"전체 묶음 받기" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("instagram-draft.zip");
  await page.screenshot({ path:testInfo.outputPath(`${testInfo.project.name}-carousel.png`), fullPage:true });
  if (testInfo.project.name === "mobile") {
    const pageWidth = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      return {
        viewport,
        scrollWidth:document.documentElement.scrollWidth,
        overflowers:[...document.querySelectorAll<HTMLElement>("*")].flatMap(element => {
          const box=element.getBoundingClientRect();
          return box.right > viewport + 1 ? [`${element.className || element.tagName}:${Math.round(box.right)}`] : [];
        }).slice(0, 8),
      };
    });
    expect(pageWidth.scrollWidth, JSON.stringify(pageWidth)).toBeLessThanOrEqual(pageWidth.viewport);
  }
});
