import { render,screen,within } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
import { describeSource,groupSources } from "@/features/metrics/sources";
import { HomepageCard } from "@/components/performance/ChannelCards";

// 2026-10-12 실제 성과 화면에 나온 유입 경로
const real=[
  {sourceMedium:"(direct) / (none)",sessions:26},{sourceMedium:"naver / organic",sessions:7},
  {sourceMedium:"blog.naverblogwidget.com / referral",sessions:7},{sourceMedium:"m.search.naver.com / referral",sessions:5},
  {sourceMedium:"ig / social",sessions:5},{sourceMedium:"facebook.com / referral",sessions:4},
  {sourceMedium:"m.place.naver.com / referral",sessions:3},{sourceMedium:"naver / place",sessions:2},
];

describe("유입 경로 이름",()=>{
  it("GA4 이름을 쉬운 이름과 묶음으로 바꾼다",()=>{
    expect(describeSource("naver / organic")).toEqual({group:"네이버 검색",label:"네이버 검색"});
    expect(describeSource("m.search.naver.com / referral").group).toBe("네이버 검색");
    expect(describeSource("blog.naverblogwidget.com / referral").group).toBe("네이버 블로그");
    expect(describeSource("m.blog.naver.com / referral").group).toBe("네이버 블로그");
    expect(describeSource("naver / place")).toEqual({group:"네이버 플레이스·지도",label:"네이버 플레이스의 홈페이지 링크"});
    expect(describeSource("m.place.naver.com / referral").group).toBe("네이버 플레이스·지도");
    expect(describeSource("map.naver.com / referral").group).toBe("네이버 플레이스·지도");
    expect(describeSource("ig / social").group).toBe("인스타그램");
    expect(describeSource("l.instagram.com / referral").group).toBe("인스타그램");
    expect(describeSource("facebook.com / referral").group).toBe("페이스북");
    expect(describeSource("google / organic").group).toBe("구글 검색");
    expect(describeSource("(direct) / (none)").group).toBe("직접 방문");
    expect(describeSource("example.com / referral")).toEqual({group:"그 밖의 사이트",label:"example.com"});
  });
  it("같은 묶음은 더하고 많은 순서로, 비율(%)을 붙인다",()=>{
    const groups=groupSources(real);
    expect(groups.map(g=>[g.group,g.sessions])).toEqual([["직접 방문",26],["네이버 검색",12],["네이버 블로그",7],["인스타그램",5],["네이버 플레이스·지도",5],["페이스북",4]]);
    expect(groups[0].percent).toBe(44.1);
    expect(groups.find(g=>g.group==="네이버 검색")!.items.map(i=>i.label)).toEqual(["네이버 검색","네이버 모바일 검색 결과"]);
  });
});

describe("홈페이지 카드의 유입 표",()=>{
  it("쉬운 이름·방문·비율로 보여 주고, 원래 이름은 자세히 안에 둔다",()=>{
    render(<HomepageCard configured state={undefined} days={[{date:"2026-10-11",sessions:59,sources:real,fetchedAt:"t"}]}/>);
    const row=screen.getByRole("row",{name:"네이버 검색 12 20.3%"});
    expect(within(row).getByText("12")).toBeTruthy();
    expect(within(row).getByText("20.3%")).toBeTruthy();
    expect(screen.queryByRole("rowheader",{name:"naver / organic"})).toBeNull();
    expect(screen.getByText("naver / organic")).toBeTruthy(); // 자세히 안
  });
});
