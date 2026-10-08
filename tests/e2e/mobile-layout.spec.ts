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
    const name=(el:Element)=>(el.getAttribute("aria-label")||(el as HTMLElement).innerText||el.outerHTML.slice(0,80)).trim().slice(0,80);
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
  test.setTimeout(300_000);
  await page.setViewportSize({ width:360, height:780 });
  await loginAsOwner(page);
  await expectPhoneFriendly(page,"1단계");
  // 메뉴 네 칸(만들기·내 게시물·설정·더보기)이 옆으로 밀지 않아도 모두 보여야 한다.
  const nav=page.getByRole("navigation",{name:"주요 메뉴"});
  for(const label of ["만들기","내 게시물","설정"])await expect(nav.getByRole("link",{name:label})).toBeInViewport();
  await expect(nav.getByText("더보기")).toBeInViewport();
  await nav.getByText("더보기").click();
  for(const label of ["한 달 계획","콘텐츠 자료","이미지 모음","도움말"])await expect(nav.getByRole("link",{name:label})).toBeInViewport();
  await expectPhoneFriendly(page,"더보기 펼침");
  for(const path of ["/drafts","/plan","/images","/library","/help","/settings"]){
    await page.goto(path);
    await expect(page.getByRole("heading",{level:1})).toBeVisible();
    await expectPhoneFriendly(page,path);
  }
  // 설정의 관리자용 설정을 펼쳐도 화면이 밀리지 않는다.
  await page.getByText("관리자용 설정",{exact:true}).click();
  await expectPhoneFriendly(page,"관리자용 설정");

  // 사진 세 장으로 사진 중심 게시물까지: 사진 칸·미리보기가 가장 넓어지는 화면이다.
  await page.goto("/");
  const next=await page.getByRole("button", { name: "다음" }).boundingBox();
  expect(next?.height??0).toBeGreaterThanOrEqual(52);
  await page.getByRole("button", { name: "다음" }).click();
  await expectPhoneFriendly(page,"2단계");
  expect((await page.getByRole("button", { name: "만들기", exact: true }).boundingBox())?.height??0).toBeGreaterThanOrEqual(52);
  await page.getByLabel("사진 파일").setInputFiles(["assets/design/samples/hands-makgeolli.jpg","assets/design/samples/studio-hongeo.jpg","assets/design/samples/table-topdown.jpg"]);
  await expect(page.getByRole("list", { name: "고른 사진" }).getByRole("listitem")).toHaveCount(3, { timeout: 60_000 });
  await expectPhoneFriendly(page,"사진 고른 뒤");
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("heading", { name: /만들고 있어요|확인하고 올리기/ }).waitFor();
  await expectPhoneFriendly(page,"만드는 중");
  await expect(page.getByRole("heading", { name: "확인하고 올리기" })).toBeVisible({ timeout: 180_000 });
  await expectPhoneFriendly(page,"3단계");
  // 주인공 버튼은 52px 이상.
  const saveBox=await page.getByRole("button",{name:"휴대폰에 저장하기"}).boundingBox();
  expect(saveBox?.height??0).toBeGreaterThanOrEqual(52);
  await page.screenshot({ path: testInfo.outputPath("phone-review.png"), fullPage: true });
  await page.getByText("더보기",{exact:true}).last().click();
  await expectPhoneFriendly(page,"3단계 더보기");
});
