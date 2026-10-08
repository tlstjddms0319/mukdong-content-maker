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

test("makes a five-slide post with one press, then checks and saves it without live providers", async ({ page }, testInfo) => {
  const planRequests: Array<Record<string, unknown>> = [];
  const generationRequests: Array<Record<string, unknown>> = [];
  const draftRequests: Array<Record<string, unknown>> = [];
  const copyRequests: Array<Record<string, unknown>> = [];

  await page.route("**/api/topics", route => route.fulfill({ json: { topics: [
    { id:"rain", title:topic, summary:contentBrief, reason:"비 오는 날의 식탁 분위기를 소개해요.", audience:"A", imageBrief, season:"가을" },
    { id:"first", title:"처음 먹는 홍어의 한 점", summary:"", reason:"처음 손님에게 쉬운 순서를 보여 줘요.", audience:"B", imageBrief:"한 점을 만드는 손동작" },
    { id:"table", title:"오늘 모임을 위한 홍어 상차림", summary:"", reason:"함께 먹는 분위기를 전해요.", audience:"C", imageBrief:"따뜻한 모임 식탁" },
  ] } }));
  await page.route("**/api/images/plan", async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    planRequests.push(request);
    await route.fulfill({ json: { plan: {
      slideCount:5,
      styleAnchor:"따뜻한 자연광, 흰 그릇, 짙은 나무 테이블, 작은 녹색 포인트",
      design:{palette:"warm",style:"photo-focus",theme:"classic",titleFont:"pretendard",bodyFont:"pretendard",tone:"loud",season:"none"},
      slides:roles.map((role, index) => ({
        role,
        headline:["비 오는 날 한 점", "결과 윤기를 가까이", "한 점을 만드는 순간", "막걸리와 좋은 조합", "오늘 한 상 어때요?"][index],
        visualPrompt:["완성된 홍어 한 상을 정면에서 담은 히어로 음식 사진", "홍어의 결, 윤기와 곁들임을 가까이 담은 음식 사진", "젓가락으로 한 점을 만드는 손동작 음식 사진", "막걸리와 홍어를 대각선 구도로 담은 음식 사진", "따뜻한 식탁 위 완성 상차림을 담은 방문 유도 음식 사진"][index],
        textPosition:index % 2 === 0 ? "top" : "bottom",
        layout:index===0?"fullscreen":"frame",
      })),
    }, provider:"gemini" } });
  });
  await page.route("**/api/images/generate", async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    generationRequests.push(request);
    const slideIndex = Number(request.slideIndex);
    await route.fulfill({ json: { images: Array.from({length:Number(request.count)},(_,i)=>dataUrl(slideIndex + 10 + i)), source:"ai-generated" } });
  });
  // 맨 뒤 가게 홍보 카드(무료 렌더)도 고정 이미지로 돌려준다.
  await page.route("**/api/images/store-card", route => route.fulfill({ json: { image:dataUrl(99) } }));
  await page.route("**/api/drafts", async route => {
    if (route.request().method() === "POST") draftRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { saved:true } });
  });
  await page.route("**/api/copy", route => {
    copyRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: {
      topic, audience:"A", hook:"비 오는 날에는 홍어 한 점과 막걸리", information:"한 점씩 천천히 즐겨 보세요.", store_connection:"묵동홍어마을의 메뉴도 살펴보세요.", call_to_action:"프로필의 네이버 플레이스에서 메뉴를 확인해 보세요.", hashtags:["#묵동맛집","#홍어","#묵동홍어마을"], facts_used:[], facts_to_verify:[], image_disclosure:"AI 연출 이미지가 포함되어 있으며 실제 메뉴와 다를 수 있습니다.", _meta:{ provider:"gemini" },
    } });
  });
  await page.route("**/api/instagram/status", route => route.fulfill({ json: { connected:false } }));

  await loginAsOwner(page);
  await page.goto("/");
  // 1단계: 추천 카드에는 "추천 A"와 이번 철 배지만 있다.
  const card=page.getByRole("button", { name: new RegExp(topic) });
  await expect(card).toContainText("🍂 가을");
  await card.click();
  await page.getByRole("button", { name:"다음" }).click();
  // 2단계: 갈래 카드 두 개 중 사진 중심(처음부터 골라져 있음) → 만들기 한 번.
  await expect(page.getByRole("button", { name:/사진 중심/ })).toHaveAttribute("aria-pressed","true");
  await expect(page.getByText("사진이 없으면 AI가 5장을 모두 그려요. 10분쯤 걸려요.")).toBeVisible();
  await page.screenshot({ path:testInfo.outputPath(`${testInfo.project.name}-make.png`), fullPage:true });
  await page.getByRole("button", { name:"만들기", exact:true }).click();

  // 3단계까지 사람 손 없이 간다(표지 고르기·이 캐러셀 사용·문안 단계 없음).
  await expect(page.getByRole("heading", { name:"확인하고 올리기" })).toBeVisible({ timeout:30_000 });
  expect(planRequests).toHaveLength(1);
  expect(planRequests[0]).toMatchObject({ topic, imageBrief, contentBrief, slideCount:5, track:"photo" });
  expect(generationRequests[0]).toMatchObject({ topic, imageBrief, count:1, slideIndex:1, slide:{ role:"cover" } });
  expect(generationRequests.map(request => (request.slide as { role:string }).role).sort()).toEqual([...roles].sort());
  const expectedSlides=[dataUrl(11), dataUrl(12), dataUrl(13), dataUrl(14), dataUrl(15)];
  expect(draftRequests).toHaveLength(1);
  expect(draftRequests[0].image_brief).toBe(imageBrief);
  expect(draftRequests[0].content_brief).toBe(contentBrief);
  const saved = draftRequests[0] as { media_candidates:Array<{ id:string; purpose:string; file_id:string }>; selected_media_ids:string[]; selected_media_id:string };
  // 내용 5장 + 맨 뒤 가게 홍보 카드 1장.
  expect(saved.media_candidates).toHaveLength(6);
  expect(saved.selected_media_ids).toEqual(saved.media_candidates.map(media => media.id));
  expect(saved.selected_media_id).toBe(saved.selected_media_ids[0]);
  expect(saved.media_candidates.map(media => media.purpose)).toEqual([...roles.map(role => `instagram-${role}`), "instagram-slide"]);
  expect(saved.media_candidates.map(media => media.file_id)).toEqual([...expectedSlides, dataUrl(99)]);
  expect(copyRequests[0]).toMatchObject({topic,contentBrief,imageBrief,hasAiImages:true,slideOutline:["비 오는 날 한 점","결과 윤기를 가까이","한 점을 만드는 순간","막걸리와 좋은 조합","오늘 한 상 어때요?"]});
  await expect(page.getByRole("textbox", { name:"올릴 글" })).toHaveValue(/AI 연출 이미지/);

  // 미리보기: 4:5, 순서대로 6장, 넘겨 보기.
  await expect(page.getByText("1 / 6")).toBeVisible();
  const thumbnails=page.getByRole("button", { name:/[1-6]번째 장 보기/ });
  await expect(thumbnails).toHaveCount(6);
  expect(await thumbnails.evaluateAll(elements=>elements.map(element=>(element as HTMLElement).style.backgroundImage))).toEqual([...expectedSlides, dataUrl(99)].map(url=>`url("${url}")`));
  const preview=page.getByRole("img", { name:"1번째 장 미리보기" });
  const previewBox=await preview.boundingBox();
  expect(Math.abs((previewBox?.width ?? 0)/(previewBox?.height ?? 1)-0.8)).toBeLessThan(0.02);
  await page.getByRole("button", { name:"6번째 장 보기" }).click();
  await expect(page.getByText("6 / 6")).toBeVisible();
  // 큰 버튼 두 개: 연결 전에는 바로 올리기가 막히고 한 줄 안내, 휴대폰에 저장하기가 주인공.
  await expect(page.getByRole("button", { name:"인스타그램에 바로 올리기" })).toBeDisabled();
  await expect(page.getByText("설정에서 인스타그램을 연결하면 바로 올릴 수 있어요")).toBeVisible();
  const saveButton=page.getByRole("button", { name:"휴대폰에 저장하기" });
  const box=await saveButton.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(52);
  await page.screenshot({ path:testInfo.outputPath(`${testInfo.project.name}-review.png`), fullPage:true });

  // 파일 묶음 받기는 더보기 안에 그대로 있다.
  await page.getByText("더보기", { exact:true }).last().click();
  await page.getByText("파일로 받기 · # 태그 · 음악").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name:"전체 묶음 받기" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("instagram-draft.zip");
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
