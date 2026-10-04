import { expect, test, type Page } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// 휴대폰 화면 점검. 사장님이 휴대폰으로 쓰는 경우를 기준으로, 가장 좁은 흔한 화면(360px)에서
// 1) 화면이 옆으로 밀리지 않는지(가로 스크롤 없음), 2) 누르는 곳이 손가락으로 누를 만큼 큰지 확인한다.
// 옆으로 넘겨 보는 목록(슬라이드 썸네일) 안의 버튼과 문장 속 링크는 크기 검사에서 뺀다.

const MIN_TAP=40;

async function expectPhoneFriendly(page:Page,where:string){
  const problems=await page.evaluate(min=>{
    const width=document.documentElement.clientWidth;
    const found:string[]=[];
    if(document.documentElement.scrollWidth>width)found.push(`가로 넘침 ${document.documentElement.scrollWidth}px > ${width}px`);
    const name=(el:Element)=>(el.getAttribute("aria-label")||(el as HTMLElement).innerText||"").trim().slice(0,24);
    for(const el of document.querySelectorAll("a,button,select,input:not([type=file]),textarea,summary")){
      // 체크박스·라디오는 감싼 글자(label)까지 누를 수 있으므로 label 크기로 잰다.
      const target=(el as HTMLInputElement).type==="checkbox"||(el as HTMLInputElement).type==="radio"?el.closest("label")??el:el;
      const box=target.getBoundingClientRect();
      if(!box.width||!box.height||getComputedStyle(el).visibility==="hidden")continue;
      if(el.closest(".carousel-thumbnails"))continue;                 // 옆으로 넘기는 목록
      if(el.tagName==="A"&&!el.className&&el.closest("p,li"))continue; // 문장 속 링크
      if(box.height<min||box.width<min)found.push(`작은 버튼 ${Math.round(box.width)}×${Math.round(box.height)} 「${name(el)}」`);
      if(box.right>width+1)found.push(`화면 밖 「${name(el)}」`);
    }
    return [...new Set(found)];
  },MIN_TAP);
  expect(problems,where).toEqual([]);
}

test("every main screen fits a phone and has finger-sized controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name!=="mobile","휴대폰 기기 설정으로만 확인한다.");
  test.setTimeout(240_000);
  await page.setViewportSize({ width:360, height:780 });
  await loginAsOwner(page);
  await expectPhoneFriendly(page,"주제 단계");
  // 메뉴 다섯 개가 옆으로 밀지 않아도 모두 보여야 한다.
  for(const label of ["만들기","내 초안","이미지 제작실","콘텐츠 자료","설정"])await expect(page.getByRole("navigation",{name:"주요 메뉴"}).getByRole("link",{name:label})).toBeInViewport();
  for(const path of ["/drafts","/images","/library","/help","/settings"]){
    await page.goto(path);
    await expect(page.getByRole("heading",{level:1})).toBeVisible();
    await expectPhoneFriendly(page,path);
  }

  // 실제 사진 여러 장으로 캐러셀까지: 사진 칸·미리보기가 가장 넓어지는 화면이다.
  await page.goto("/");
  await page.getByRole("button", { name: "이미지 선택" }).click();
  await page.getByRole("button", { name: "실제 사진 사용" }).click();
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg","assets/design/samples/table-topdown.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(3, { timeout: 60_000 });
  await expectPhoneFriendly(page,"사진 고른 뒤");
  await page.getByRole("button", { name: /사진 3장으로 .*캐러셀 만들기/ }).click();
  await expect(page.getByRole("button", { name: "이 캐러셀 사용" })).toBeVisible({ timeout: 120_000 });
  await expectPhoneFriendly(page,"캐러셀 완성");
  await page.screenshot({ path: testInfo.outputPath("phone-carousel.png"), fullPage: true });
  await page.getByRole("button", { name: "이 캐러셀 사용" }).click();
  await page.getByRole("button", { name: "문안 만들기" }).click();
  await expectPhoneFriendly(page,"문안 단계");
  await page.getByLabel("게시물 문안").fill("홍어 한 점은 이렇게 드세요.\n\n#홍어 #묵동맛집 #묵동홍어마을");
  await page.getByRole("button", { name: "최종 화면 보기" }).click();
  await expectPhoneFriendly(page,"최종 확인");
});
