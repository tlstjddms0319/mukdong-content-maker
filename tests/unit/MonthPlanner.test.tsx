import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthPlanner } from "@/components/drafts/MonthPlanner";

const item=(date:string,title:string,style="hanji")=>({date,title,style,summary:"홍어로 이어지는 설명",reason:"이유",audience:"A",imageBrief:"사진",season:"",id:title});
const plan={month:"2099-01",createdAt:"2026-10-01T00:00:00.000Z",items:[
  item("2099-01-06","막걸리엔 왜 전일까?"),
  item("2099-01-09","삼합은 왜 셋일까?","kitsch"),
  item("2099-01-13","홍어는 왜 톡 쏠까?"),
  item("2020-01-07","지난 주제일까?"),
]};

describe("MonthPlanner", () => {
  afterEach(()=>vi.unstubAllGlobals());
  it("shows each plan date's progress and links drafts back to their plan date", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({plan})})));
    render(<MonthPlanner drafts={[
      {id:"aaaa",topic:"막걸리엔 왜 전일까?",plan_date:"2099-01-06",hasImages:true,hasCaption:true,reviewed:true},
      {id:"bbbb",topic:"삼합은 왜 셋일까?",plan_date:"2099-01-09",hasImages:true,hasCaption:false,reviewed:false},
    ]}/>);
    expect(await screen.findByText("게시일 4개 · 최종 확인 1개 · 만드는 중 1개 · 남은 기획 1개 · 날짜 지남 1개")).toBeInTheDocument();
    const rows=screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("최종 확인 완료")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link",{name:"초안 보기"})).toHaveAttribute("href","/?draft=aaaa");
    expect(within(rows[1]).getByRole("link",{name:"이어서 만들기"})).toHaveAttribute("href","/?draft=bbbb");
    // 아직 초안이 없는 칸은 게시일과 추천 계열을 함께 넘겨 새 초안을 시작한다.
    const start=new URL(within(rows[2]).getByRole("link",{name:"이 주제로 초안 시작"}).getAttribute("href")!,"http://localhost");
    expect(start.searchParams.get("planDate")).toBe("2099-01-13");
    expect(start.searchParams.get("style")).toBe("hanji");
    expect(within(rows[3]).getByText("날짜 지남")).toBeInTheDocument();
    expect(within(rows[3]).getByRole("link",{name:"그래도 만들기"})).toBeInTheDocument();
  });
});
