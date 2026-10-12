// 확인 화면 '모양 바꾸기': 접혀 있다가 펴면 같은 갈래 모양 견본이 모두 보이고, 고른 뒤 '변경하기'를 눌러야 바뀐다.
import { existsSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LookPicker } from "@/components/wizard/LookPicker";
import { TRACK_LOOKS } from "@/features/images/track";

describe("look picker",()=>{
  it("starts folded and shows every look of the track as a sample picture",()=>{
    const {container}=render(<LookPicker track="photo" current={2} disabled={false} onChange={()=>{}}/>);
    const details=container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByText(/지금 ·/)).toHaveTextContent("반반");
    const options=screen.getAllByRole("radio",{hidden:true});
    expect(options).toHaveLength(TRACK_LOOKS.photo.length);
    expect(container.querySelector('img[src="/looks/photo-0.jpg"]')).not.toBeNull();
    expect(options[2]).toHaveAttribute("aria-checked","true");
  });

  it("changes only after choosing another look and pressing 변경하기",()=>{
    const onChange=vi.fn();
    render(<LookPicker track="text" current={0} disabled={false} onChange={onChange}/>);
    const apply=screen.getByRole("button",{name:"변경하기",hidden:true});
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio",{hidden:true})[0]);
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio",{hidden:true})[3]);
    expect(onChange).not.toHaveBeenCalled();
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("keeps 변경하기 off while the post cannot be redrawn and says why",()=>{
    render(<LookPicker track="photo" current={0} disabled disabledReason="다 만든 뒤에 바꿀 수 있어요" onChange={()=>{}}/>);
    fireEvent.click(screen.getAllByRole("radio",{hidden:true})[1]);
    expect(screen.getByRole("button",{name:"변경하기",hidden:true})).toBeDisabled();
    expect(screen.getByText("다 만든 뒤에 바꿀 수 있어요")).toBeInTheDocument();
  });

  it("has a sample picture file for every look (scripts/render-look-thumbs.mjs)",()=>{
    for(const track of ["photo","text"] as const)TRACK_LOOKS[track].forEach((_,look)=>{
      expect(existsSync(path.join("public/looks",`${track}-${look}.jpg`)),`${track}-${look}`).toBe(true);
    });
  });
});
