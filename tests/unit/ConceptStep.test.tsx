// 2단계 중간 "어떤 그림으로 만들까요?": 실사가 미리 눌려 있고(일러스트는 사장님이 고를 때만, 2026-10-13) AI 추천에는 표시가 붙고, 다른 카드를 누른 뒤 "이걸로 만들기"를 누르면 그 번호가 간다.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConceptStep } from "@/components/wizard/ConceptStep";
import type { ConceptChoice } from "@/features/images/concepts";

const concepts:ConceptChoice={recommended:1,options:[
  {kind:"photo",title:"실사 사진",summary:"실제 음식 사진처럼",reason:"",styleNote:"",slides:[{drawn:false,visualPrompt:"접시"},{drawn:false,visualPrompt:"접시"}]},
  {kind:"character",title:"홍어 vs 가오리 권투",summary:"두 캐릭터가 링 위에서 맞붙어요",reason:"비교 주제라 대결이 어울려요",styleNote:"홍어: 마름모 몸, 빨간 글러브 / 가오리: 둥근 몸, 파란 글러브",slides:[{drawn:true,visualPrompt:"링 위 두 캐릭터"},{drawn:false,visualPrompt:"접시"}]},
]};

describe("concept step",()=>{
  it("preselects the real-photo concept, marks the AI's pick, and shows what is drawn",()=>{
    render(<ConceptStep topic="홍어와 가오리는 왜 다르게 먹을까?" concepts={concepts} onChoose={()=>{}}/>);
    const radios=screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute("aria-checked","true");
    expect(radios[1]).toHaveAttribute("aria-checked","false");
    expect(screen.getByText("AI 추천")).toBeInTheDocument();
    expect(screen.getByText("그림 1장 · 사진 1장")).toBeInTheDocument();
    expect(screen.getByText("모든 장 실사 사진")).toBeInTheDocument();
  });

  it("sends the chosen index when 이걸로 만들기 is pressed",()=>{
    const onChoose=vi.fn();
    render(<ConceptStep topic="홍어" concepts={concepts} onChoose={onChoose}/>);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    fireEvent.click(screen.getByRole("button",{name:"이걸로 만들기"}));
    expect(onChoose).toHaveBeenCalledWith(1);
  });
});
