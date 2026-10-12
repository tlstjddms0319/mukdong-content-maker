import { render,screen } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
import { HomepageCard,InstagramCard,NaverCard } from "@/components/performance/ChannelCards";
import { LineChart } from "@/components/performance/LineChart";
import { NAVER_SEED } from "@/features/metrics/naver";

describe("성과 카드",()=>{
  it("인사이트 권한이 없으면 다시 연결 안내를 보인다",()=>{
    render(<InstagramCard days={[]} state={undefined} insights={false} connected/>);
    expect(screen.getByText(/다시 연결하면/)).toBeTruthy();
  });
  it("연결한 적이 없으면 '다시'가 아니라 연결 안내를 보인다",()=>{
    render(<InstagramCard days={[]} state={undefined} insights={false} connected={false}/>);
    expect(screen.getByText(/설정에서 인스타그램을 연결하면/)).toBeTruthy();
    expect(screen.queryByText(/다시 연결/)).toBeNull();
  });
  it("팔로워는 마지막 값과 기간 변화를, 도달은 빈칸을 빼고 더한 값을 칸으로 보인다",()=>{
    const {container}=render(<InstagramCard insights connected state={undefined} days={[{date:"2026-10-10",followers:100,reach:10,fetchedAt:"t"},{date:"2026-10-11",reach:5,fetchedAt:"t"},{date:"2026-10-12",followers:130,fetchedAt:"t"}]}/>);
    const tile=(label:string)=>[...container.querySelectorAll(".stat-tile")].find(t=>t.querySelector(".stat-label")?.textContent===label)!;
    expect(tile("팔로워").querySelector(".stat-value")!.textContent).toBe("130명");
    expect(tile("팔로워").querySelector(".stat-delta")!.textContent).toContain("+30명");
    expect(tile("도달").querySelector(".stat-value")!.textContent).toBe("15");
    expect(tile("조회").querySelector(".stat-value")!.textContent).toBe("—");
  });
  it("게시물 카드는 정렬을 바꿀 수 있고 인스타그램 게시물로 이어진다",async()=>{
    const posts=[
      {id:"a",caption:["첫 글","둘째 줄"].join("\n"),type:"IMAGE" as const,timestamp:"2026-10-11T03:00:00+0000",permalink:"https://www.instagram.com/p/a/",likes:3,views:100,fetchedAt:"t"},
      {id:"b",caption:"릴스 글",type:"VIDEO" as const,product:"REELS",timestamp:"2026-10-01T03:00:00+0000",permalink:"https://www.instagram.com/p/b/",likes:9,views:900,fetchedAt:"t"},
    ];
    render(<InstagramCard insights connected state={undefined} days={[]} posts={posts}/>);
    const titles=()=>screen.getAllByRole("link",{name:/인스타그램에서 보기/}).map(a=>a.getAttribute("href"));
    expect(titles()).toEqual(["https://www.instagram.com/p/a/","https://www.instagram.com/p/b/"]);
    screen.getByRole("button",{name:"조회 많은 순"}).click();
    await screen.findByRole("button",{name:"조회 많은 순",pressed:true});
    expect(titles()).toEqual(["https://www.instagram.com/p/b/","https://www.instagram.com/p/a/"]);
    expect(screen.getByText("릴스")).toBeTruthy();
    expect(screen.getByText("가장 많이 본")).toBeTruthy();
    expect(screen.getByText(/게시물 2개 · 평균 조회 500/)).toBeTruthy();
  });
  it("GA4 설정이 없으면 연결 방법을 안내한다",()=>{
    render(<HomepageCard days={[]} state={undefined} configured={false}/>);
    expect(screen.getByText(/구글 애널리틱스 연결이 필요해요/)).toBeTruthy();
  });
  it("네이버 표는 하루 평균·한 달 환산·새 키워드·20~30대 비율을 보인다",()=>{
    render(<NaverCard periods={NAVER_SEED}/>);
    expect(screen.getByText("12.4")).toBeTruthy();
    expect(screen.getByText("약 733")).toBeTruthy();
    expect(screen.getByRole("cell",{name:/석계역삼합/})).toBeTruthy();
    expect(screen.getByText("41.8%")).toBeTruthy();
  });
  it("그래프는 점이 2개 미만이면 안내 문구를 보인다",()=>{
    render(<LineChart label="팔로워" points={[{x:"2026-10-12",y:130}]}/>);
    expect(screen.getByText(/이틀 이상 쌓이면/)).toBeTruthy();
  });
});
