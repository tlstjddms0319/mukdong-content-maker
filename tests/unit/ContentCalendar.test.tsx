import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ContentCalendar } from "@/components/drafts/ContentCalendar";

it("moves between months and opens the draft planned for the visible date",()=>{
  render(<ContentCalendar initialMonth="2030-05" items={[
    {id:"11111111-1111-4111-8111-111111111111",topic:"5월 홍어 이야기",date:"2030-05-15",time:"18:00",reviewed:true},
    {id:"22222222-2222-4222-8222-222222222222",topic:"6월 홍어 이야기",date:"2030-06-02",time:"12:30",reviewed:false},
  ]}/>);

  expect(screen.getByRole("heading",{name:"2030년 5월"})).toBeInTheDocument();
  expect(screen.getByRole("link",{name:/5월 홍어 이야기/})).toHaveAttribute("href","/?draft=11111111-1111-4111-8111-111111111111");
  expect(screen.queryByText("6월 홍어 이야기")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button",{name:"다음 달"}));

  expect(screen.getByRole("heading",{name:"2030년 6월"})).toBeInTheDocument();
  expect(screen.getByRole("link",{name:/6월 홍어 이야기/})).toHaveTextContent("12:30 · 확인 필요");
  expect(screen.queryByText("5월 홍어 이야기")).not.toBeInTheDocument();
});
